import google.generativeai as genai
from flask import current_app


def _client():
    genai.configure(api_key=current_app.config["GEMINI_API_KEY"])
    return genai.GenerativeModel("gemini-1.5-flash")


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
