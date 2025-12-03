from flask import Blueprint, jsonify, request
from database.fetch_data import fetch_data_by_product_store_id

# 1. Khởi tạo Blueprint
product_summary_bp = Blueprint('product_summary', __name__)

@product_summary_bp.route('/api/product_summary', methods=['GET'])
def get_product_summary():
    try:
        # 1. Nhận productId từ Frontend
        product_id = request.args.get('product_id')
        
        if not product_id:
            return jsonify({
                "status": "error", 
                "message": "Thiếu tham số product_id"
            }), 400

        # 2. Gọi hàm fetch database (Chỉ truyền product_id -> lấy hết các store)
        # Hàm này trả về List[Dict] (dữ liệu phẳng sau khi Join)
        raw_data = fetch_data_by_product_store_id(product_id)
        
        if not raw_data:
            # Trả về mảng rỗng nếu không tìm thấy sản phẩm nào
            return jsonify([]), 200

        # 3. Xử lý & Gom nhóm dữ liệu (Grouping)
        # Vì raw_data là danh sách phẳng (mỗi dòng là 1 sự kết hợp Product-Store-Image),
        # ta cần gom chúng lại thành: 1 Product -> N Stores -> N Images.
        
        # Lấy thông tin chung của sản phẩm từ dòng đầu tiên (vì các dòng đều chung 1 product)
        first_row = raw_data[0]
        
        product_info = {
            "product_id": first_row.get("product_id"),
            "product_name": first_row.get("product_name"),
            "product_des": first_row.get("product_des"),
            "product_image_url": first_row.get("product_image_url"),
            "location_name": first_row.get("location_name"),
            "product_min_cost": first_row.get("product_min_cost"),
            "product_max_cost": first_row.get("product_max_cost"),
            "stores": [] # Danh sách cửa hàng sẽ được thêm vào đây
        }

        # Dùng Dictionary để gom nhóm Stores (tránh trùng lặp do 1 store có nhiều ảnh -> sinh ra nhiều dòng)
        stores_map = {}

        for row in raw_data:
            store_id = row.get("store_id")
            
            # Bỏ qua nếu dòng bị lỗi không có store_id
            if not store_id: 
                continue

            # Nếu store này chưa có trong map, tạo mới
            if store_id not in stores_map:
                stores_map[store_id] = {
                    "store_id": row.get("store_id"),
                    "store_name": row.get("store_name"),
                    "store_address": row.get("store_address"),
                    "store_lat": row.get("store_lat"),
                    "store_long": row.get("store_long"),
                    # Các trường giá và rating của store
                    "ps_min_price_store": row.get("ps_min_price_store"),
                    "ps_max_price_store": row.get("ps_max_price_store"),
                    "ps_average_rating": row.get("ps_average_rating"),
                    "ps_total_reviews": row.get("ps_total_reviews"),
                    "product_images": []
                }
            
            # Xử lý hình ảnh (Product-Store Image)
            if row.get("ps_image_url"):
                img_obj = {
                    "ps_id": row.get("ps_id"),
                    "ps_image_id": row.get("ps_image_id"),
                    "ps_image_url": row.get("ps_image_url"),
                    "ps_type": row.get("ps_type")
                }
                
                # Kiểm tra để tránh trùng ảnh (nếu query SQL trả về duplicate)
                current_images = stores_map[store_id]["product_images"]
                if img_obj not in current_images:
                    current_images.append(img_obj)

        # Chuyển đổi values của stores_map thành list và gán vào product_info
        product_info["stores"] = list(stores_map.values())

        # 4. Trả về kết quả
        # Trả về một List chứa 1 object Product để khớp với logic Frontend nhận mảng
        return jsonify([product_info])

    except Exception as e:
        print(f"❌ Error in get_product_summary: {str(e)}")
        return jsonify({
            "status": "error", 
            "message": "Lỗi server nội bộ"
        }), 500