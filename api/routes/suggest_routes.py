from flask import Blueprint, jsonify, request, session
from database.fetch_data_for_suggest_product import (
    fetch_products_by_location,
    fetch_location_by_gps,
    fetch_location_by_name,
)
from API.API_groq_fix_location import get_standard_location

# Khởi tạo Blueprint
suggest_bp = Blueprint("suggest", __name__)


@suggest_bp.route("/api/suggest_products", methods=["POST"])
def post_suggest_products():
    """
    API gợi ý sản phẩm cho trang chủ
    Lấy sản phẩm theo location của user (GPS hoặc tên địa điểm)
    """
    try:
        payload = request.get_json(force=True)

        # Lấy các tham số
        lat = session.get("user_lat")
        lon = session.get("user_long")
        # lat = payload.get('latitude')
        # lon = payload.get('longitude')
        location_name = payload.get("location_name")
        limit = payload.get("limit", 8)  # Mặc định 8 sản phẩm

        # Tìm location theo thứ tự ưu tiên: location_name > GPS > mặc định
        target_location = None

        # Ưu tiên 1: Tìm theo tên địa điểm (có chuẩn hóa qua Groq)
        if location_name:
            try:
                # Chuẩn hóa địa chỉ người dùng nhập (VD: "HN" -> "Hà Nội")
                standardized_location = get_standard_location(location_name)

                if standardized_location:
                    print(
                        f"✅ Chuẩn hóa: '{location_name}' -> '{standardized_location}'"
                    )
                    target_location = fetch_location_by_name(standardized_location)
                else:
                    # Nếu Groq không chuẩn hóa được, thử tìm trực tiếp
                    print(
                        f"⚠️ Groq không chuẩn hóa được, tìm trực tiếp: '{location_name}'"
                    )
                    target_location = fetch_location_by_name(location_name)
            except Exception as e:
                print(f"❌ Lỗi khi chuẩn hóa location: {str(e)}")
                pass

        # Ưu tiên 2: Tìm theo GPS (nếu chưa có location)
        if not target_location and lat and lon:
            try:
                target_location = fetch_location_by_gps(float(lat), float(lon))
            except:
                pass

        # Ưu tiên 3: Dùng location mặc định (location_id = 1)
        if not target_location:
            location_id = 1
            result_location_name = None
        else:
            location_id = target_location.get("location_id")
            result_location_name = target_location.get("location_name")

        # Lấy sản phẩm theo location
        products_data = fetch_products_by_location(location_id, limit)

        # Format dữ liệu trả về
        items = []
        for row in products_data:
            items.append(
                {
                    "product_id": row.get("product_id"),
                    "product_name": row.get("product_name"),
                    "product_image_url": row.get("product_image_url"),
                    "product_tag": row.get("product_tag"),
                    "min_price": row.get("product_min_cost"),
                    "max_price": row.get("product_max_cost"),
                }
            )

        return (
            jsonify(
                {
                    "status": "success",
                    "count": len(items),
                    "location_name": result_location_name,
                    "products": items,
                }
            ),
            200,
        )

    except Exception as e:
        print(f"❌ Error in post_suggest_products: {str(e)}")
        import traceback

        print(traceback.format_exc())
        return jsonify({"status": "error", "message": "Lỗi server nội bộ"}), 500
