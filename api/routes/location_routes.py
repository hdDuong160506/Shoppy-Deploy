from flask import Blueprint, request, jsonify, session

location_bp = Blueprint('location', __name__)

@location_bp.route('/api/set_location', methods=['POST'])
def set_location():
    data = request.get_json()
    lat = data.get('lat')
    long = data.get('long')

    if lat and long:
        session['user_lat'] = float(lat)
        session['user_long'] = float(long)

        # [DEBUG] Xác nhận đã lưu vào Session
        print(f"💾 [SESSION] Đã lưu tọa độ: {session['user_lat']}, {session['user_long']}")
        
        return jsonify({"status": "saved"}), 200
    
    return jsonify({"error": "missing data"}), 400