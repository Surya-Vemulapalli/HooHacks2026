from flask import Blueprint, request, jsonify
from services import snowflake_service as db
from services import gemini_service as gemini

recommendations_bp = Blueprint("recommendations", __name__, url_prefix="/api/recommendations")


@recommendations_bp.route("/<plant_id>", methods=["GET"])
def get_recommendations(plant_id):
    """
    Fetch 24-hour trend summary and recent readings, then ask Gemini
    for an analysis and recommendations.

    Query params:
      hours (int, default 24) — window for the trend summary
    """
    try:
        hours = int(request.args.get("hours", 24))
    except ValueError:
        return jsonify({"error": "hours must be an integer"}), 400

    summary = db.get_trend_summary(plant_id, hours=hours)
    recent_readings = db.get_readings(plant_id, limit=20)

    # Serialize datetimes before passing to Gemini
    for r in recent_readings:
        if r.get("recorded_at"):
            r["recorded_at"] = str(r["recorded_at"])

    analysis = gemini.analyze_plant_trends(plant_id, summary, recent_readings)

    return jsonify({
        "plant_id": plant_id,
        "hours_analyzed": hours,
        "analysis": analysis,
    })
