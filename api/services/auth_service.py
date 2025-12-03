# File: backend/services/auth_service.py

from supabase_client import admin_request

def check_email_exists_service(email):
    # 1. Gọi API lấy danh sách user
    response = admin_request("/auth/v1/admin/users")
    
    if not response or response.status_code != 200:
        print(f"❌ Lỗi API Admin: {response.status_code if response else 'None'}")
        return None
        
    data = response.json()
    users = data.get('users', [])
    
    # 2. Duyệt tìm user
    for user in users:
        if user.get('email', '').lower() == email.lower():
            
            # --- [LOGIC MỚI: TẬP HỢP TẤT CẢ PROVIDER] ---
            all_providers = set()
            
            # Nguồn 1: Lấy từ identities (danh sách liên kết)
            identities = user.get('identities') or []
            for i in identities:
                if i.get('provider'):
                    all_providers.add(i.get('provider'))
            
            # Nguồn 2: Lấy từ app_metadata (thông tin gốc)
            app_meta = user.get('app_metadata') or {}
            if app_meta.get('provider'):
                all_providers.add(app_meta.get('provider'))
            
            # In ra để bạn kiểm tra trong Terminal
            print(f"🔍 User: {email} | All Providers: {all_providers}")

            # --- [QUYẾT ĐỊNH] ---
            
            # CHỈ CHO PHÉP NẾU TÌM THẤY CHỮ 'email' (tức là có Password)
            if 'email' in all_providers:
                return {"exists": True, "provider": "email"}
            
            # CÁC TRƯỜNG HỢP CÒN LẠI -> CHẶN HẾT (Coi là Google)
            # Kể cả khi danh sách rỗng hoặc chỉ có google/facebook/github...
            return {"exists": True, "provider": "google"}
            
    # Không tìm thấy user nào
    return {"exists": False, "provider": None}