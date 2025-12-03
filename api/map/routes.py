import os
import requests
from flask import request, jsonify, send_from_directory, current_app
from supabase import create_client, Client
from dotenv import load_dotenv
from pathlib import Path
from flask import session

# Import blueprint đã tạo ở __init__.py
from . import map_bp

# ----------------------------
# 1) Setup Môi trường & Database
# ----------------------------
# Lấy đường dẫn gốc để load .env (từ backend/map/routes.py nhảy ra project root)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / ".env"

# Load .env (Dù run.py đã load, load lại ở đây để đảm bảo module hoạt động độc lập nếu cần test)
load_dotenv(dotenv_path=str(ENV_PATH))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
ORS_API_KEY = os.getenv("ORS_API_KEY")
ORS_BASE = "https://api.openrouteservice.org/v2/directions"

# Khởi tạo Supabase (Fail-safe: Nếu lỗi không crash toàn bộ app, chỉ lỗi module map)
supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"[Map Module] Error init Supabase: {e}")

# ----------------------------
# 2) Các API Routes (Gắn vào map_bp)
# ----------------------------

# Đường dẫn thực tế: /map/api/stores
@map_bp.route('/api/stores')
def get_stores():
    if not supabase:
        return jsonify({"error": "Supabase connection failed"}), 500

    try:
        response = supabase.table('store').select(
            'store_id, name, address, lat, long, product_store(product(tag))'
        ).execute()
        
        raw_data = response.data
        stores_list = []

        for item in raw_data:
            tags = []
            if item.get('product_store'):
                for relation in item['product_store']:
                    if relation.get('product') and relation['product'].get('tag'):
                        tag_val = relation['product']['tag']
                        if tag_val:
                            tags.append(tag_val.strip().lower())

            store_obj = {
                "store_id": item['store_id'],
                "name": item['name'],
                "address": item['address'],
                "lat": item['lat'],
                "long": item['long'],
                "tags": list(set(tags))
            }
            stores_list.append(store_obj)

        return jsonify(stores_list)

    except Exception as e:
        print(f"[Map API Error] {e}")
        return jsonify({"error": str(e)}), 500

# Đường dẫn thực tế: /map/route
@map_bp.route('/route', methods=['GET', 'POST', 'OPTIONS'])
def route_proxy():
    if request.method == 'OPTIONS':
        return jsonify({"ok": True}), 200

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    start = data.get('start')
    end = data.get('end')
    profile = data.get('profile', 'driving-car')

    if not ORS_API_KEY:
        return jsonify({"error": "Server missing ORS API Key"}), 500

    url = f"{ORS_BASE}/{profile}/geojson"
    headers = {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json"
    }
    body = {"coordinates": [start, end]}

    try:
        resp = requests.post(url, json=body, headers=headers, timeout=15)
        if resp.status_code != 200:
            return jsonify({"error": "ORS request failed", "detail": resp.text}), 502
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"error": "Failed to call ORS", "detail": str(e)}), 502

# ----------------------------
# 3) Route Phục vụ Frontend Map
# ----------------------------

# Đường dẫn thực tế: /map/
@map_bp.route('/')
def map_index():
    # Phục vụ file map.html từ folder static chung
    # map_bp.static_folder đã được cấu hình trỏ về ../../static
    return send_from_directory(map_bp.static_folder, "map.html")

# Route này giúp map.html load được css/js khi truy cập link dạng /map/css/map.css
@map_bp.route('/<path:filename>')
def serve_map_static(filename):
    return send_from_directory(map_bp.static_folder, filename)

@map_bp.route('/api/get-current-location')
def get_current_location():
    # Lấy từ session trả về dạng JSON
    return jsonify({
        "lat": session.get('user_lat'),
        "long": session.get('user_long')
    })
