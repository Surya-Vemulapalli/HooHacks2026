from flask import Blueprint, request, jsonify
from services import snowflake_service as db

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/analytics")


@analytics_bp.route("/readings/<plant_id>", methods=["GET"])
def get_readings(plant_id):
    """
    Return recent readings for a plant for charting.

    Query params:
      limit (int, default 100) — how many readings to return
    """
    try:
        limit = min(int(request.args.get("limit", 100)), 1000)
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    readings = db.get_readings(plant_id, limit=limit)

    # Serialize datetimes for JSON
    for r in readings:
        if r.get("recorded_at"):
            r["recorded_at"] = str(r["recorded_at"])

    return jsonify({"plant_id": plant_id, "readings": readings})


@analytics_bp.route("/summary/<plant_id>", methods=["GET"])
def get_summary(plant_id):
    """
    Return aggregated stats for the last N hours.

    Query params:
      hours (int, default 24)
    """
    try:
        hours = int(request.args.get("hours", 24))
    except ValueError:
        return jsonify({"error": "hours must be an integer"}), 400

    summary = db.get_trend_summary(plant_id, hours=hours)
    return jsonify({"plant_id": plant_id, "hours": hours, "summary": summary})
