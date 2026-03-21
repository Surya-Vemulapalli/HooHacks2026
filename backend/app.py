from flask import Flask, jsonify
from flask_cors import CORS

from config import Config
from routes.sensor import sensor_bp
from routes.analytics import analytics_bp
from routes.recommendations import recommendations_bp
from services import snowflake_service as db


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app)  # Allow requests from the frontend

    # Register blueprints
    app.register_blueprint(sensor_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(recommendations_bp)

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.cli.command("init-db")
    def init_db_command():
        """Create Snowflake tables."""
        with app.app_context():
            db.init_db()
        print("Database initialized.")

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=app.config["DEBUG"])
