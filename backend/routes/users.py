from flask import Blueprint, request, jsonify, g
from services import snowflake_service as db
from services.auth0 import requires_auth

users_bp = Blueprint('users', __name__)

@users_bp.route('/api/users/sync', methods=['POST'])
@requires_auth
def sync_user():
    # Get the user token payload that contains the auth0 sub (ID)
    current_user = getattr(g, 'current_user', {})
    auth0_id = current_user.get('sub')
    
    if not auth0_id:
        return jsonify({"error": "Auth0 ID not found"}), 400

    # Optional: If you pass extra profile data from frontend
    data = request.get_json(silent=True) or {}
    email = data.get('email', '')
    name = data.get('name', '')

    try:
        db.sync_auth0_user(auth0_id, email, name)
        return jsonify({"status": "success", "message": "User synced to Snowflake"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
