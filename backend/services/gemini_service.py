import google.generativeai as genai
from flask import current_app

_CHAT_SYSTEM_PROMPT = """
You are PlantBot, an expert assistant specialising in:
  1. Plant diseases — identification, causes, symptoms, and lifecycle
  2. Sustainable gardening and farming practices
  3. Prevention and integrated pest management (IPM)
  4. Organic and low-impact treatment methods
  5. Environmental factors (light, temperature, humidity, soil health)

Guidelines:
- Be concise, practical, and friendly. Use short paragraphs.
- When diagnosing a disease, always mention: (a) likely cause, (b) visual symptoms to confirm,
  (c) sustainable prevention steps, (d) treatment options starting from least-invasive.
- Favour organic and sustainable approaches. Flag chemical treatments as a last resort.
- If live sensor data for the user's plant is provided, reference it to personalise advice.
- If you don't know something, say so rather than guessing.
- Do NOT respond to topics unrelated to plants, gardening, sustainability, or agriculture.
- Formatting rules: use **double asterisks** for bold emphasis only. Never use single asterisks
  for italics or bullet points. Use plain hyphens (-) for lists. No markdown headers or symbols.
""".strip()


def _configure():
    genai.configure(api_key=current_app.config["GEMINI_API_KEY"])


def _client():
    _configure()
    return genai.GenerativeModel("gemini-3-flash-preview")


def _chat_model():
    _configure()
    return genai.GenerativeModel(
        "gemini-3-flash-preview",
        system_instruction=_CHAT_SYSTEM_PROMPT,
    )


def analyze_plant_trends(plant_id: str, summary: dict, recent_readings: list) -> dict:
    """
    Send trend data to Gemini and return structured recommendations.

    Returns:
        {
            "health_score": int (0-100),
            "status": "healthy" | "warning" | "critical",
            "summary": str,
            "recommendations": [str, ...],
            "alerts": [str, ...]
        }
    """
    if not summary or summary.get("reading_count", 0) == 0:
        return {
            "health_score": None,
            "status": "unknown",
            "summary": "Not enough data to analyze.",
            "recommendations": [],
            "alerts": [],
        }

    recent_snippet = "\n".join(
        f"  - {r['recorded_at']}: temp={r['temperature']}°C, "
        f"light={r['light_level']} lux, deformity={r['deformity_score']:.2f}"
        f"{' (' + r['deformity_type'] + ')' if r.get('deformity_type') else ''}"
        for r in recent_readings[:10]
    )

    prompt = f"""
You are an expert botanist and plant health AI assistant. Analyze the following sensor
data for plant "{plant_id}" and provide actionable recommendations.

=== 24-HOUR TREND SUMMARY ===
Total readings : {summary.get('reading_count')}
Temperature    : avg {summary.get('avg_temp', 'N/A'):.1f}°C, range [{summary.get('min_temp', 'N/A'):.1f} – {summary.get('max_temp', 'N/A'):.1f}]°C
Light level    : avg {summary.get('avg_light', 'N/A'):.0f} lux, range [{summary.get('min_light', 'N/A'):.0f} – {summary.get('max_light', 'N/A'):.0f}] lux
Deformity score: avg {summary.get('avg_deformity', 0):.2f}, max {summary.get('max_deformity', 0):.2f} (0=healthy, 1=severe)
Deformity types: {summary.get('deformity_types') or 'none detected'}

=== MOST RECENT READINGS ===
{recent_snippet}

Respond ONLY with valid JSON matching this schema (no markdown fences):
{{
  "health_score": <integer 0-100, 100=perfect health>,
  "status": "<healthy|warning|critical>",
  "summary": "<2-3 sentence plain-English overview>",
  "recommendations": ["<actionable recommendation>", ...],
  "alerts": ["<urgent issue requiring immediate attention>", ...]
}}
""".strip()

    model = _client()
    response = model.generate_content(prompt)
    text = response.text.strip()

    # Strip markdown fences if model adds them despite the instruction
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(
            line for line in lines if not line.startswith("```")
        ).strip()

    import json
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "health_score": None,
            "status": "unknown",
            "summary": text,
            "recommendations": [],
            "alerts": [],
        }


def generate_suggestions(user_message: str, bot_reply: str) -> list[str]:
    """Return 3 short follow-up questions based on the last exchange."""
    import json, re
    model = _client()
    prompt = (
        f"The user asked: \"{user_message}\"\n"
        f"The assistant replied: \"{bot_reply[:400]}\"\n\n"
        "Generate exactly 3 short follow-up questions a user might ask next about plant health, "
        "diseases, or sustainability. Each must be under 8 words. "
        "Return ONLY a JSON array of 3 strings, no markdown, no explanation."
    )
    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        # Extract JSON array from anywhere in the response
        match = re.search(r'\[.*?\]', text, re.DOTALL)
        if match:
            suggestions = json.loads(match.group())
            if isinstance(suggestions, list) and suggestions:
                return [str(s) for s in suggestions[:3]]
    except Exception:
        pass
    return []


def chat(message: str, history: list[dict], plant_context: dict | None = None) -> str:
    """
    Multi-turn chat with PlantBot.

    Args:
        message:       The user's latest message.
        history:       Prior turns as [{"role": "user"|"model", "content": str}, ...].
        plant_context: Optional dict with live sensor data to inject into the prompt.

    Returns:
        The assistant's reply as a plain string.
    """
    model = _chat_model()

    # Reconstruct Gemini history format
    gemini_history = [
        {"role": turn["role"], "parts": [turn["content"]]}
        for turn in history
        if turn.get("role") in ("user", "model") and turn.get("content")
    ]

    # Optionally prepend sensor context to the user message
    user_message = message
    if plant_context:
        ctx_lines = []
        if plant_context.get("plant_id"):
            ctx_lines.append(f"Plant ID: {plant_context['plant_id']}")
        summary = plant_context.get("summary", {})
        if summary.get("avg_temp") is not None:
            ctx_lines.append(f"Current avg temperature: {summary['avg_temp']:.1f}°C")
        if summary.get("avg_light") is not None:
            ctx_lines.append(f"Current avg light: {summary['avg_light']:.0f} lux")
        if summary.get("avg_deformity") is not None:
            ctx_lines.append(f"Deformity score: {summary['avg_deformity']:.2f} / 1.0")
        if summary.get("deformity_types"):
            ctx_lines.append(f"Detected deformity types: {summary['deformity_types']}")
        if ctx_lines:
            user_message = (
                "[Live sensor context for this plant]\n"
                + "\n".join(ctx_lines)
                + "\n\n"
                + message
            )

    chat_session = model.start_chat(history=gemini_history)
    response = chat_session.send_message(user_message)
    return response.text.strip()


def analyze_plant_health(sensor_data, weather_data=None):
    prompt = f"Analyze this plant sensor data: {sensor_data}."
    
    if weather_data:
        prompt += f" Consider the upcoming weather forecast: {weather_data}. Will the upcoming precipitation or temperature drops affect the plant?"
        
    # Send to Gemini...
