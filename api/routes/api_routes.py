from flask import Blueprint, jsonify, request
from services.auth_service import check_email_exists_service

api_bp = Blueprint('api', __name__)

@api_bp.route('/api/user/check_email', methods=['POST'])
def check_email_api():
    data = request.get_json()
    email = data.get('email')
    
    if not email:
        return jsonify({"error": "Thiếu email"}), 400

    # Gọi service mới trả về object chi tiết
    result = check_email_exists_service(email)
    
    if result is None:
        return jsonify({"error": "Lỗi hệ thống"}), 500
        
    # Trả về nguyên cục result cho Frontend xử lý
    # result dạng: { "exists": true, "provider": "google" }
    return jsonify(result), 200