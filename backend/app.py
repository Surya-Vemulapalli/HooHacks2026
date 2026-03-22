from flask import Flask, jsonify, session
from flask_cors import CORS
from config import Config

from routes.sensor import sensor_bp
from routes.analytics import analytics_bp
from routes.recommendations import recommendations_bp
from routes.chat import chat_bp
from routes.weather import weather_bp
from routes.users import users_bp
from services import snowflake_service as db
import os


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app, supports_credentials=True, origins=["http://localhost:8080"])  # Allow requests from the frontend + cookies b/w ports

    # Register blueprints
    app.register_blueprint(sensor_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(recommendations_bp)
    app.register_blueprint(chat_bp, url_prefix='/api/chat')
    app.register_blueprint(weather_bp, url_prefix='/api/weather')
    app.register_blueprint(users_bp)

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.route('/api/config', methods=['GET'])
    def get_config():
        # Only expose the public identifiers, NEVER the secret keys!
        return jsonify({
            "domain": os.getenv("AUTH0_DOMAIN"),
            "clientId": os.getenv("AUTH0_CLIENT_ID")
        })

    @app.cli.command("init-db")
    def init_db_command():
        """Create Snowflake tables."""
        with app.app_context():
            db.init_db()
        print("Database initialized.")

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=6000, debug=app.config["DEBUG"])
