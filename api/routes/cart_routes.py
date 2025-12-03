from flask import Blueprint, jsonify, request
from services.cart_service import extract_product_core_details, extract_store_details
from database.fetch_data import fetch_data_by_product_store_id

# 1. Khởi tạo Blueprint thay vì Flask app
cart_bp = Blueprint('cart', __name__)

# --- API Endpoint: Cart Details (Trả về product_map) ---

@cart_bp.route('/api/cart/details', methods=['POST'])
def get_cart_details():
    try:
        # 1. Nhận dữ liệu JSON (body) từ request
        data = request.get_json() 
        # Lấy ra object cart đã gửi từ client
        cart_data = data.get('cart', {}) 
        
        # Dictionary cuối cùng, key là key trong cart_data, value là chi tiết item
        detailed_products_map = {}
        
        # 2. Xử lý từng Key trong giỏ hàng
        for key, qty in cart_data.items():
            product_id = None
            store_id = None
            
            # Phân tích key: Key phải là chuỗi "product_id_store_id"
            if '_' in key:
                parts = key.split('_')
                if len(parts) == 2:
                    product_id, store_id = parts
                else:
                    print(f"Key '{key}' không hợp lệ (cần ProductID_StoreID). Bỏ qua.")
                    continue 
            else:
                # Tạm thời bỏ qua key nếu không có '_' (ps_id)
                print(f"Key '{key}' không có '_' (có thể là ps_id). Bỏ qua.")
                continue

            # 3. TRUY VẤN CƠ SỞ DỮ LIỆU TẠI ĐÂY
            # Gọi hàm tra cứu DB
            raw_details = fetch_data_by_product_store_id(product_id, store_id)
            
            if not raw_details:
                # Trường hợp không tìm thấy sản phẩm, bỏ qua mục này
                print(f"Không tìm thấy chi tiết cho product_id: {product_id}, store_id: {store_id}")
                continue

            # 4. Trích xuất và định dạng dữ liệu theo cấu trúc của API /api/products
            product_core = extract_product_core_details(raw_details[0])
            store_detail = extract_store_details(raw_details)
            
            # 5. Tạo đối tượng chi tiết mục giỏ hàng và đặt vào map
            if store_detail:
                # Thêm số lượng (qty) vào cấp độ store
                store_detail_with_qty = {**store_detail, "qty": qty}
                
                # Trả về đối tượng theo định dạng product_map
                detailed_products_map[key] = {
                    **product_core, 
                    # Trường 'stores' chỉ chứa một cửa hàng (item) duy nhất này
                    "stores": [store_detail_with_qty]
                }
        
        # 6. Trả kết quả về client (đối tượng key-value/product_map)
        # Sử dụng jsonify(detailed_products_map) để trả về trực tiếp map này, không cần bọc trong "items"
        return jsonify(detailed_products_map)

    except Exception as e:
        # Xử lý nếu request không hợp lệ
        print(f"Lỗi xảy ra tại get_cart_details: {e}")
        return jsonify({"status": "error", "message": f"Lỗi server: {str(e)}", "detail": "Vui lòng kiểm tra log server"}), 500