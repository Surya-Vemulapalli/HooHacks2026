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


@recommendations_bp.route("/weather", methods=["POST"])
def get_weather_recommendation():
    """
    Analyzes weather data and provides a risk analysis
    Expected payload:
    {
      "plant_id": "...",
      "forecast": [...]
    }
    """
    data = request.get_json(silent=True) or {}
    plant_id = data.get("plant_id", "Unknown Plant")
    weather_data = data.get("forecast")

    if not weather_data:
        return jsonify({"error": "Missing forecast"}), 400

    # Condense weather_data to fit within standard prompt token limits
    condensed_weather = []
    for day in weather_data[:5]:  # Take top 5 days
        condensed_weather.append(
            f"Date: {day.get('date')}, Desc: {day.get('desc')}, "
            f"Temp: Max {day.get('maxTemp')}°C Min {day.get('minTemp')}°C, Precipitation: {day.get('rain', 0)} mm"
        )

    # Get basic plant summary from DB
    summary = db.get_trend_summary(plant_id, hours=24)
    plant_info = f"Plant {plant_id} averaged {summary.get('avg_temp', 'N/A')} C and had deformity score {summary.get('avg_deformity', 0)} over the last 24h."

    prediction = gemini.analyze_plant_health(plant_info, "\n".join(condensed_weather))

    # We return standard JSON to match the JS expectation of data.analysis
    return jsonify({
        "plant_id": plant_id,
        "analysis": prediction,
        "risks": []  # Empty for now since analyze_plant_health returns a plain string, can be upgraded to JSON later.
    })
