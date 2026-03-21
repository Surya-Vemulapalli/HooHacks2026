from flask import Blueprint, request, jsonify
from services import gemini_service as gemini

chat_bp = Blueprint("chat", __name__, url_prefix="/api/chat")

MAX_HISTORY = 20  # keep last N turns to stay within token budget


@chat_bp.route("", methods=["POST"])
def chat():
    """
    Multi-turn chat with PlantBot.

    Request body:
    {
        "message":       "Why are my leaves turning yellow?",
        "history":       [{"role": "user", "content": "..."}, {"role": "model", "content": "..."}],
        "plant_context": {                  // optional
            "plant_id": "plant-01",
            "summary":  { ...summary dict from /api/analytics/summary... }
        }
    }

    Response:
    {
        "reply": "...",
        "history": [ ...updated history array... ]
    }
    """
    body = request.get_json(force=True)

    message = (body.get("message") or "").strip()
    if not message:
        return jsonify({"error": "message is required"}), 400

    history = body.get("history") or []
    if not isinstance(history, list):
        return jsonify({"error": "history must be an array"}), 400

    # Trim history to avoid ballooning context
    history = history[-MAX_HISTORY:]

    plant_context = body.get("plant_context")

    try:
        reply = gemini.chat(message, history, plant_context)
    except Exception as exc:
        return jsonify({"error": f"Gemini error: {exc}"}), 502

    # Append this turn to history for the client to store
    updated_history = history + [
        {"role": "user",  "content": message},
        {"role": "model", "content": reply},
    ]

    return jsonify({"reply": reply, "history": updated_history})
