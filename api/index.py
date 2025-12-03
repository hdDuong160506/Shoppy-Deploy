from flask import Flask, jsonify
from flask_cors import CORS
import sys
import os

# -----------------------------------------------------
# [QUAN TRỌNG] CẤU HÌNH ĐƯỜNG DẪN CHO VERCEL
# -----------------------------------------------------
# Giúp Python hiểu folder hiện tại là root để tìm thấy các file config.py, routes/...
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# -----------------------------------------------------
# IMPORT MODULES
# -----------------------------------------------------
from config import Config

# Import các Blueprints
from routes.search_routes import search_bp
from routes.review_routes import review_bp
from routes.api_routes import api_bp
from map import map_bp 
from routes.location_routes import location_bp
from routes.cart_routes import cart_bp
from routes.product_summary_routes import product_summary_bp
from routes.suggest_routes import suggest_bp

# -----------------------------------------------------
# KHỞI TẠO APP
# -----------------------------------------------------
# Không cần khai báo static_folder vì Vercel tự quản lý thư mục 'public'
app = Flask(__name__)

# Load cấu hình
app.config.from_object(Config)

# Secret Key (Giữ nguyên của bạn)
app.secret_key = 'shoppy_secret_key_2024_bao_mat_vkl'

# Cấu hình CORS
# Cho phép credentials=True để Session/Cookie hoạt động ổn định
CORS(
    app,
    resources={
        r"/*": {
            "origins": "*",
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "expose_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True, 
        }
    },
)

# -----------------------------------------------------
# ĐĂNG KÝ (REGISTER) BLUEPRINTS
# -----------------------------------------------------

app.register_blueprint(api_bp) 
app.register_blueprint(search_bp)
app.register_blueprint(review_bp)

# Map Blueprint: Route này sẽ chạy tại /map/api/... hoặc /map/... tùy vào code bên trong blueprint
app.register_blueprint(map_bp, url_prefix='/map')

app.register_blueprint(location_bp)
app.register_blueprint(cart_bp)
app.register_blueprint(product_summary_bp)
app.register_blueprint(suggest_bp)

# -----------------------------------------------------
# ROUTES KIỂM TRA (HEALTH CHECK)
# -----------------------------------------------------
# Route này để test xem Backend có sống không
@app.route('/api/health')
def health_check():
    return jsonify({
        "status": "active",
        "message": "Backend Shoppy đang chạy ngon lành trên Vercel!"
    })

# -----------------------------------------------------
# CHẠY SERVER (Chỉ dùng khi test dưới máy)
# -----------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True)