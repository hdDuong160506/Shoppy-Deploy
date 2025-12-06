from database.fetch_data import fetch_rows_by_search_and_location
from utils.haversine_function import haversine_function
from API.API_groq_fix_query import groq_fix_query

def build_store_info(row, user_lat=None, user_lon=None):
    store_info = dict(row)  # copy tất cả fields

    # Tính khoảng cách
    distance = None
    if user_lat is not None and user_lon is not None and row.get("store_lat") and row.get("store_long"):
        distance = haversine_function(user_lat, user_lon, row["store_lat"], row["store_long"])
    store_info["distance_km"] = distance

    # Mảng ảnh
    store_info["product_images"] = []
    if row.get("ps_image_url"):
        store_info["product_images"].append({
            "ps_id": row["ps_id"],
            "ps_image_id": row["ps_image_id"],
            "ps_image_url": row["ps_image_url"],
            "ps_type": row["ps_type"]
        })

    return store_info

def build_product_map(rows, user_lat=None, user_lon=None):
    """Xây dựng product_map từ các row fetch trực tiếp"""
    product_map = {}
    for row in rows:
        product_id = row["product_id"]
        store_id = row.get("store_id")

        if product_id not in product_map:
            product_map[product_id] = {
                "product": {
                    "product_id": row["product_id"],
                    "product_name": row["product_name"],
                    "product_des": row["product_des"],
                    "product_image_url": row["product_image_url"],
                    "product_location_id": row["product_location_id"],
                    "product_tag": row["product_tag"],
                    "product_min_cost": row["product_min_cost"],
                    "product_max_cost": row["product_max_cost"]
                },
                "location": {
                    "location_id": row["location_id"],
                    "location_name": row["location_name"],
                    "location_max_long": row["location_max_long"],
                    "location_min_long": row["location_min_long"],
                    "location_max_lat": row["location_max_lat"],
                    "location_min_lat": row["location_min_lat"]
                },
                "store": []
            }

        if store_id:
            # Check store tồn tại chưa
            existing_store = next((s for s in product_map[product_id]["store"] if s["store_id"] == store_id), None)
            if existing_store:
                # Thêm ảnh mới nếu chưa có
                if row.get("ps_image_url") and all(pi["ps_image_id"] != row["ps_image_id"] for pi in existing_store["product_images"]):
                    existing_store["product_images"].append({
                        "ps_id": row["ps_id"],
                        "ps_image_id": row["ps_image_id"],
                        "ps_image_url": row["ps_image_url"],
                        "ps_type": row["ps_type"]
                    })
            else:
                store_info = build_store_info(row, user_lat, user_lon)
                product_map[product_id]["store"].append(store_info)

    return product_map

def search_product(search_text, location_id, user_lat=21.0285, user_lon=105.8542):
    """
    Tìm kiếm sản phẩm với khả năng sửa lỗi chính tả bằng Gemini
    Bắt buộc phải có cả search_text và location_id
    """
    # 1. Kiểm tra bắt buộc có search_text
    search_text = (search_text or "").strip()
    if not search_text:
        return []
    
    # 2. Tìm DB bằng search_text và location_id
    rows = fetch_rows_by_search_and_location(search_text=search_text, location_id=location_id)
    product_map = build_product_map(rows, user_lat, user_lon)
    results = list(product_map.values())
    
    if results:  # Có kết quả → trả luôn
        return results
    
    # 3. Nếu rỗng → Gemini fix query
    fixed_query = groq_fix_query(search_text)
    print(f"[DEBUG] Fixed query after Groq: {fixed_query}")
    
    # 4. Tìm lại DB bằng fixed_query với location_id
    rows = fetch_rows_by_search_and_location(search_text=fixed_query, location_id=location_id)
    product_map = build_product_map(rows, user_lat, user_lon)
    results = list(product_map.values())
    
    return results
