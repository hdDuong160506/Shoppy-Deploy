import sqlite3
from flask import Blueprint, request, jsonify
import os 

# Khai báo Blueprint cho Reviews
review_bp = Blueprint('review_bp', __name__, url_prefix='/api')

# --- SỬ DỤNG ĐƯỜNG DẪN TUYỆT ĐỐI ĐỂ KHẮC PHỤC LỖI KẾT NỐI DB ---

# Lấy đường dẫn của thư mục hiện tại (routes)
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) 

# Tạo đường dẫn tuyệt đối đến file database (Giả sử database.db3 nằm ở thư mục cha của routes/)
# Cấu trúc: .../SHOPPY/DangKy/routes/review_routes.py
# Đường dẫn DB: .../SHOPPY/DangKy/database.db3
DB_PATH = os.path.join(BASE_DIR, '..', 'database.db3') 

# --- END SỬA ---


def get_db_connection():
    """Tạo kết nối database"""
    # CHÚ Ý: Đảm bảo DB_PATH chính xác
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# --------------------------------------------------------
# 0. API TÌM PS_ID DỰA TRÊN PRODUCT_ID VÀ STORE_ID (MỚI BỔ SUNG)
# Endpoint: /api/ps_id_lookup?product_id=...&store_id=...
# --------------------------------------------------------
@review_bp.route('/ps_id_lookup', methods=['GET'])
def ps_id_lookup():
    product_id = request.args.get('product_id', type=int)
    store_id = request.args.get('store_id', type=int)

    if not product_id or not store_id:
        return jsonify({"error": "Thiếu product_id hoặc store_id"}), 400

    conn = get_db_connection()
    try:
        query = "SELECT ps_id FROM product_store WHERE product_id = ? AND store_id = ?"
        row = conn.execute(query, (product_id, store_id)).fetchone()

        if row is None:
            return jsonify({"error": "Không tìm thấy ps_id phù hợp"}), 404

        return jsonify({"ps_id": row['ps_id']})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# --------------------------------------------------------
# 1. API LẤY CHI TIẾT (JOIN VỚI PRODUCT_IMAGES)
# Endpoint: /api/product_detail/<ps_id>
# CHÚ Ý: Đã bổ sung p.product_id và s.store_id
# --------------------------------------------------------
@review_bp.route('/product_detail/<int:ps_id>', methods=['GET'])
def get_product_details(ps_id):
    conn = get_db_connection()
    try:
        query = """
            SELECT 
                ps.ps_id,
                p.product_id,       /* BỔ SUNG CHO GIỎ HÀNG */
                s.store_id,         /* BỔ SUNG CHO GIỎ HÀNG */
                ps.cost AS price,
                p.name AS original_product_name,
                p.des AS description,
                s.name AS store_name,       
                s.address AS store_address,
                (SELECT image_url FROM product_images WHERE ps_id = ps.ps_id LIMIT 1) AS real_img,
                p.image_url AS fallback_img,
                /* BỔ SUNG: Lấy Rating và Review Count */
                COALESCE(AVG(r.rating), 0) AS average_rating,
                COUNT(r.review_id) AS review_count
            FROM product_store ps
            JOIN product p ON ps.product_id = p.product_id
            JOIN store s ON ps.store_id = s.store_id
            LEFT JOIN reviews r ON ps.ps_id = r.ps_id
            WHERE ps.ps_id = ?
            GROUP BY ps.ps_id
        """
        row = conn.execute(query, (ps_id,)).fetchone()

        if row is None:
            return jsonify({"error": "Không tìm thấy sản phẩm"}), 404

        # Logic chọn ảnh
        final_img = row['real_img'] if row['real_img'] else row['fallback_img']

        return jsonify({
            "id": row['ps_id'],
            "product_id": row['product_id'],   
            "store_id": row['store_id'],    
            "name": row['store_name'],                 
            "sub_name": row['original_product_name'],  
            "price": row['price'] if row['price'] else 0,
            "img": final_img,                          
            "description": row['description'] if row['description'] else "",
            "address": row['store_address'],
            "rating": round(row['average_rating'], 1), 
            "review_count": row['review_count']       
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# --------------------------------------------------------
# 2. API LẤY REVIEW THEO PS_ID (GIỮ NGUYÊN)
# Endpoint: /api/reviews/<ps_id>
# --------------------------------------------------------
@review_bp.route('/reviews/<int:ps_id>', methods=['GET'])
def get_reviews(ps_id):
    conn = get_db_connection()
    try:
        # Lấy đánh giá
        reviews = conn.execute("SELECT * FROM reviews WHERE ps_id = ? ORDER BY created_at DESC", (ps_id,)).fetchall()
        
        # Lấy điểm trung bình và tổng số lượng
        avg_data = conn.execute("""
            SELECT AVG(rating) AS avg, COUNT(review_id) AS count 
            FROM reviews 
            WHERE ps_id = ?
        """, (ps_id,)).fetchone()
        
        reviews_list = []
        for row in reviews:
            reviews_list.append({
                "review_id": row['review_id'],
                "user_id": row['user_id'],
                "rating": row['rating'],
                "comment": row['comment'],
                "created_at": row['created_at']
            })

        return jsonify({
            "reviews": reviews_list,
            "average_rating": round(avg_data['avg'], 1) if avg_data['avg'] else 0,
            "total_reviews": avg_data['count']
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# --------------------------------------------------------
# 3. API GỬI REVIEW (GIỮ NGUYÊN)
# Endpoint: /api/reviews
# --------------------------------------------------------
@review_bp.route('/reviews', methods=['POST'])
def add_review():
    data = request.get_json()
    conn = get_db_connection()
    try:
        # Giả định dữ liệu gửi lên hợp lệ và có các trường: ps_id, user_id, rating, comment
        conn.execute("INSERT INTO reviews (ps_id, user_id, rating, comment) VALUES (?, ?, ?, ?)",
                     (data['ps_id'], data['user_id'], data['rating'], data['comment']))
        conn.commit()
        return jsonify({"message": "Đánh giá đã được thêm thành công"}), 201
    except sqlite3.Error as e:
        return jsonify({"error": f"Lỗi database: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()