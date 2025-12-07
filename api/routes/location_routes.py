from flask import Blueprint, request, jsonify, session
from database.fetch_data import supabase

location_bp = Blueprint("location", __name__)


# ============================================================
# API LẤY DANH SÁCH LOCATIONS
# ============================================================
@location_bp.route("/api/locations", methods=["GET"])
def get_locations():
    """
    API lấy danh sách tất cả locations từ database
    """
    try:
        # Query tất cả locations, sắp xếp theo tên
        response = (
            supabase.table("location")
            .select("location_id, name")
            .order("name")
            .execute()
        )

        if response.data:
            # Trả về danh sách location names
            locations = [item["name"] for item in response.data]
            return jsonify({"status": "success", "locations": locations}), 200
        else:
            return jsonify({"status": "success", "locations": []}), 200

    except Exception as e:
        print(f"❌ Error fetching locations: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@location_bp.route("/api/set_location", methods=["POST"])
def set_location():
    data = request.get_json()
    lat = data.get("lat")
    long = data.get("long")

    if lat and long:
        session["user_lat"] = float(lat)
        session["user_long"] = float(long)

        # [DEBUG] Xác nhận đã lưu vào Session
        print(
            f"💾 [SESSION] Đã lưu tọa độ: {session['user_lat']}, {session['user_long']}"
        )

        return jsonify({"status": "saved"}), 200

    return jsonify({"error": "missing data"}), 400
