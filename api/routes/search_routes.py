from flask import Blueprint, jsonify, request, session

# Import các module từ database và services
from services.search_service import search_product
from API.API_groq_search_image import groq_search_product_by_image

# 1. Khởi tạo Blueprint thay vì Flask app
search_bp = Blueprint("search", __name__)


# 2. API tìm kiếm sản phẩm thông thường
@search_bp.route("/api/products")
def api_products():
    search_text = request.args.get("search", "")
    user_lat = session.get("user_lat")
    user_lon = session.get("user_long")

    # Lấy location_id từ session
    location_id = session.get("location_id")

    # Gọi hàm tìm kiếm sản phẩm
    results = search_product(search_text, location_id, user_lat, user_lon)

    # Format dữ liệu cho JavaScript
    products = []
    for p in results:
        first_store = p["store"][0] if p["store"] else {}

        products.append(
            {
                "product_id": p["product"].get("product_id", 0),
                "product_name": p["product"].get("product_name", "Không có tên"),
                "product_des": p["product"].get("product_des", ""),
                "product_image_url": p["product"].get(
                    "product_image_url", "image/products/default.jpg"
                ),
                "location_name": p["location"].get("location_name", ""),
                "product_min_cost": p["product"].get("product_min_cost", ""),
                "product_max_cost": p["product"].get("product_max_cost", ""),
                "stores": [
                    {
                        "store_id": store.get("store_id"),
                        "store_name": store.get("store_name"),
                        "store_address": store.get("store_address"),
                        "store_lat": store.get("store_lat"),
                        "store_long": store.get("store_long"),
                        "distance_km": store.get("distance_km"),
                        "ps_min_price_store": store.get("ps_min_price_store"),
                        "ps_max_price_store": store.get("ps_max_price_store"),
                        "product_images": [
                            {
                                "ps_id": img.get("ps_id"),
                                "ps_image_id": img.get("ps_image_id"),
                                "ps_image_url": img.get("ps_image_url"),
                                "ps_type": img.get("ps_type"),
                            }
                            for img in store.get("product_images", [])
                        ],
                    }
                    for store in p.get("store", [])
                ],
            }
        )

    return jsonify(products)


# 3. API tìm kiếm bằng hình ảnh - ĐÃ SỬA: Không dùng fetch_product_names
@search_bp.route("/api/search-by-image", methods=["POST"])
def handle_image_search_api():
    """
    API nhận ảnh từ frontend và tìm sản phẩm
    Expected JSON: { "image": "base64_string_or_url" }
    """
    try:
        if not request.is_json:
            return jsonify({"status": "error", "message": "Request phải là JSON"}), 400

        data = request.get_json()
        if "image" not in data:
            return jsonify({"status": "error", "message": "Thiếu dữ liệu ảnh"}), 400

        image_data = data["image"]

        # Gọi service image search (hàm này đã tự xử lý việc lấy danh sách sản phẩm)
        recognized_product = groq_search_product_by_image(image_data)

        if recognized_product:
            # Tìm sản phẩm trong database với tên đã nhận diện
            user_lat = session.get("user_lat")
            user_lon = session.get("user_long")

            # Lấy location_id từ session
            location_id = session.get("location_id")

            # Sử dụng hàm search_product hiện có để tìm kiếm
            search_results = search_product(recognized_product, location_id, user_lat, user_lon)

            # Format kết quả giống như API thông thường
            formatted_products = []
            for p in search_results:
                formatted_products.append(
                    {
                        "product_id": p["product"].get("product_id", 0),
                        "product_name": p["product"].get(
                            "product_name", "Không có tên"
                        ),
                        "product_des": p["product"].get("product_des", ""),
                        "product_image_url": p["product"].get(
                            "product_image_url", "image/products/default.jpg"
                        ),
                        "location_name": p["location"].get("location_name", ""),
                        "product_min_cost": p["product"].get("product_min_cost", ""),
                        "product_max_cost": p["product"].get("product_max_cost", ""),
                        "stores": [
                            {
                                "store_id": store.get("store_id"),
                                "store_name": store.get("store_name"),
                                "store_address": store.get("store_address"),
                                "store_lat": store.get("store_lat"),
                                "store_long": store.get("store_long"),
                                "distance_km": store.get("distance_km"),
                                "ps_min_price_store": store.get("ps_min_price_store"),
                                "ps_max_price_store": store.get("ps_max_price_store"),
                                "product_images": [
                                    {
                                        "ps_id": img.get("ps_id"),
                                        "ps_image_id": img.get("ps_image_id"),
                                        "ps_image_url": img.get("ps_image_url"),
                                        "ps_type": img.get("ps_type"),
                                    }
                                    for img in store.get("product_images", [])
                                ],
                            }
                            for store in p.get("store", [])
                        ],
                    }
                )

            return jsonify(
                {
                    "status": "success",
                    "products": formatted_products,
                    "search_term": recognized_product,
                    "message": f"Tìm thấy {len(formatted_products)} sản phẩm phù hợp",
                }
            )
        else:
            return jsonify(
                {
                    "status": "not_found",
                    "products": [],
                    "message": "Không tìm thấy sản phẩm phù hợp trong ảnh",
                }
            )

    except Exception as e:
        print(f"❌ Error in image search: {str(e)}")
        return jsonify({"status": "error", "message": f"Lỗi xử lý: {str(e)}"}), 500
