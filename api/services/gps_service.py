import math
from flask import session

class GPSService:
    def __init__(self):
        self.R = 6371.0 

    def calculate_distance(self, dest_lat, dest_long):
        # 1. Tự động lấy từ Session
        try:
            user_lat = session.get('user_lat')
            user_long = session.get('user_long')

            # [DEBUG] Kiểm tra xem Session có rỗng không
            if user_lat is None:
                print("⚠️ [GPS SERVICE] Session đang RỖNG (User chưa cấp quyền hoặc chưa reload)")
            else:
                print(f"✅ [GPS SERVICE] Đang tính toán từ vị trí: {user_lat}, {user_long}")

            
        except:
            return None

        if not user_lat or not user_long or not dest_lat or not dest_long:
            return None

        # 2. Tính toán
        try:
            user_lat, user_long, dest_lat, dest_long = map(float, [user_lat, user_long, dest_lat, dest_long])
            dlat = math.radians(dest_lat - user_lat)
            dlon = math.radians(dest_long - user_long)
            a = (math.sin(dlat / 2) ** 2 +
                 math.cos(math.radians(user_lat)) * math.cos(math.radians(dest_lat)) *
                 math.sin(dlon / 2) ** 2)
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            return round(self.R * c, 2)
        except:
            return None

gps_service = GPSService()