from flask import Flask, jsonify, session
from flask_cors import CORS
from config import Config

from flask_login import LoginManager
from backend.routes.auth import auth_bp
from backend.services.snowflake_service import get_user_by_id

from routes.sensor import sensor_bp
from routes.analytics import analytics_bp
from routes.recommendations import recommendations_bp
from routes.chat import chat_bp
from services import snowflake_service as db


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app, supports_credentials=True, origins=["http://localhost:8080"])  # Allow requests from the frontend + cookies b/w ports

    # LoginManager Set Up
    login_manager = LoginManger()
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"

    @login_manager.user_loader
    def load_user(user_id):
        return get_user_by_id

    # Register blueprints
    app.register_blueprint(sensor_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(recommendations_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprints(auth_bp)

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
