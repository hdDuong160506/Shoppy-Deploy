from flask import Blueprint, request, jsonify, session
from database.fetch_data import supabase

location_bp = Blueprint("location", __name__)


# ============================================================
# API LẤY DANH SÁCH LOCATIONS
# ============================================================
@location_bp.route("/api/set_location", methods=["POST"])
def set_location():
    data = request.get_json()
    lat = data.get("lat")
    long = data.get("long")

    # Kiểm tra nếu lat/long có giá trị (không phải None/null) thì chuyển sang float
    # Nếu là None/null (khi bị lỗi GPS), ta giữ nguyên là None
    
    if lat is not None and long is not None:
        try:
            session["user_lat"] = float(lat)
            session["user_long"] = float(long)
        except ValueError:
            # Xử lý trường hợp gửi giá trị không phải số (rất hiếm)
            return jsonify({"error": "invalid data format"}), 400
    else:
        # Trường hợp nhận được null/None từ Javascript
        session["user_lat"] = None
        session["user_long"] = None

    # [DEBUG] Xác nhận đã lưu vào Session
    print(
        f"💾 [SESSION] Đã lưu tọa độ: {session.get('user_lat')}, {session.get('user_long')}"
    )

    return jsonify({"status": "saved"}), 200

# Không cần return 400 nữa vì ta luôn lưu giá trị (dù là None hay số)