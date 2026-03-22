from flask import Blueprint, jsonify, request
import os
import requests

weather_bp = Blueprint('weather', __name__)

@weather_bp.route('/forecast', methods=['GET'])
def get_forecast():
    lat = request.args.get('lat', '38.0293') # Default to Charlottesville, VA
    lon = request.args.get('lon', '-78.4767')
    api_key = os.getenv('OPENWEATHER_API_KEY')
    
    # Fetch 7-day forecast
    url = f"https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid={api_key}&units=metric"
    response = requests.get(url)
    
    if response.status_code == 200:
        data = response.json()
        data['owm_api_key'] = api_key  # Include API key for the frontend to load map tiles
        data['query_lat'] = lat
        data['query_lon'] = lon
        return jsonify(data)
    return jsonify({"error": "Failed to fetch weather"}), 500