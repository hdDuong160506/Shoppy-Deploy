import requests
from flask import current_app

def get_admin_headers():
    # Lấy key từ config của Flask đang chạy
    key = current_app.config['SUPABASE_SERVICE_KEY']
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }

def admin_request(endpoint, method="GET", params=None):
    base_url = current_app.config['SUPABASE_URL']
    url = f"{base_url}{endpoint}"
    
    try:
        response = requests.request(
            method=method,
            url=url,
            headers=get_admin_headers(),
            params=params,
            timeout=5
        )
        return response
    except Exception as e:
        print(f"❌ Lỗi kết nối Supabase: {e}")
        return None