# --- Helper Functions for Data Transformation ---
# Các hàm trợ giúp này được sử dụng để đảm bảo cấu trúc trả về giống với API /api/products

def extract_product_core_details(item):
    """Trích xuất các trường cấp độ Sản phẩm (Product) từ một hàng dữ liệu thô."""
    return {
        "product_id": item.get("product_id", 0),
        "product_name": item.get("product_name", "Không có tên"),
        "product_des": item.get("product_des", ""),
        "product_image_url": item.get("product_image_url", "image/products/default.jpg"),
        "location_name": item.get("location_name", ""),
        "product_min_cost": item.get("product_min_cost", ""),
        "product_max_cost": item.get("product_max_cost", ""),
    }

def extract_store_details(raw_data):
    """Trích xuất các trường cấp độ Cửa hàng (Store/Product-Store) và hình ảnh."""
    if not raw_data or not raw_data[0]:
        return None
        
    item = raw_data[0]
    
    # 1. Trích xuất tất cả các hình ảnh liên quan từ các row khác nhau
    product_images = []
    for img_row in raw_data:
        if img_row.get("ps_image_id"):
            product_images.append({
                "ps_id": img_row.get("ps_id"),
                "ps_image_id": img_row.get("ps_image_id"),
                "ps_image_url": img_row.get("ps_image_url"),
                "ps_type": img_row.get("ps_type")
            })
            
    # 2. Xây dựng object Store
    return {
        "store_id": item.get("store_id"),
        "store_name": item.get("store_name"),
        "store_address": item.get("store_address"),
        "store_lat": item.get("store_lat"),
        "store_long": item.get("store_long"),
        "ps_min_price_store": item.get("ps_min_price_store"),
        "ps_max_price_store": item.get("ps_max_price_store"),
        "product_images": product_images
    }
