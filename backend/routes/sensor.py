from flask import Blueprint, request, jsonify
from services import snowflake_service as db

sensor_bp = Blueprint("sensor", __name__, url_prefix="/api/sensor")


@sensor_bp.route("/reading", methods=["POST"])
def ingest_reading():
    """
    Raspberry Pi posts sensor data here.

    Expected JSON body:
    {
        "plant_id":        "plant-01",
        "device_id":       "rpi-kitchen-01",
        "deformity_score": 0.12,
        "temperature":     23.4,            // optional
        "light_level":     4500,            // optional
        "deformity_type":  "leaf_curl",     // optional
        "image_url":       "https://..."    // optional
    }
    """
    data = request.get_json(force=True)

    required = {"plant_id", "device_id", "deformity_score"}
    missing = required - data.keys()
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        deformity_score = float(data["deformity_score"])
        temperature = float(data["temperature"]) if "temperature" in data else None
        light_level = float(data["light_level"]) if "light_level" in data else None
    except (ValueError, TypeError) as exc:
        return jsonify({"error": f"Invalid numeric value: {exc}"}), 400

    if not (0.0 <= deformity_score <= 1.0):
        return jsonify({"error": "deformity_score must be between 0 and 1"}), 400

    db.insert_reading(
        plant_id=data["plant_id"],
        device_id=data["device_id"],
        temperature=temperature,
        light_level=light_level,
        deformity_score=deformity_score,
        deformity_type=data.get("deformity_type"),
        image_url=data.get("image_url"),
    )

    return jsonify({"status": "ok", "message": "Reading recorded"}), 201


@sensor_bp.route("/plants", methods=["GET"])
def list_plants():
    """Return all known plant IDs with their last-seen timestamps."""
    return jsonify(db.get_all_plants())
