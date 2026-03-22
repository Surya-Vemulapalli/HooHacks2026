from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user
from werkzeug.security import check_password_hash
from backend.services.snowflake_service import get_user_by_username

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    body = request.get_json(force=True)
    
    username = body.get("username")
    password = body.get("password")

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    
    user = get_user_by_username(username)

    if user and check_password_hash(user.password_hash, password): #verify password
        login_user(user) #create session cookie
        return jsonify({
            "message": "Login successful",
            "user": {"username": user.username}
        }), 200

    return jsonify({"error": "Invalid username or password"}), 401

@auth_bp.route("/api/auth/logout", methods=["POST"])

@login_required
def logout():
    logout_user()
    return jsonify({"message": "Logged out successfully"}), 200