import os
import re
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

DATA_BASE_URL_SUPABASE = os.getenv("DATA_BASE_URL_SUPABASE")
DATA_BASE_SECRET_KEY_SUPABASE = os.getenv("DATA_BASE_SECRET_KEY_SUPABASE")

url = DATA_BASE_URL_SUPABASE
key = DATA_BASE_SECRET_KEY_SUPABASE
supabase: Client = create_client(url, key)


def sanitize_input(text):
    """Loại ký tự nguy hiểm để tránh SQL injection"""
    return re.sub(r"[\"';]", "", text).strip()


def fetch_location_by_name(location_name):
    """
    Tìm location theo tên (tìm kiếm tương đối)
    Trả về: location_id, location_name nếu tìm thấy, None nếu không
    """
    safe_name = sanitize_input(location_name).lower()

    query = f"""
        SELECT
            location_id,
            name AS location_name,
            max_long AS location_max_long,
            min_long AS location_min_long,
            max_lat AS location_max_lat,
            min_lat AS location_min_lat
        FROM location
        WHERE unaccent(lower(name)) LIKE '%' || unaccent(lower('{safe_name}')) || '%'
        LIMIT 1
    """
    result = supabase.rpc("exec_sql", {"sql": query}).execute()

    if result.data and len(result.data) > 0:
        return result.data[0]
    return None


def fetch_location_by_gps(lat, lon):
    """
    Tìm location theo tọa độ GPS (trong bounding box)
    Trả về: location_id, location_name nếu tìm thấy, None nếu không
    """
    query = f"""
        SELECT
            location_id,
            name AS location_name,
            max_long AS location_max_long,
            min_long AS location_min_long,
            max_lat AS location_max_lat,
            min_lat AS location_min_lat
        FROM location
        WHERE {lat} BETWEEN min_lat AND max_lat
          AND {lon} BETWEEN min_long AND max_long
        LIMIT 1
    """
    result = supabase.rpc("exec_sql", {"sql": query}).execute()

    if result.data and len(result.data) > 0:
        return result.data[0]
    return None


def fetch_products_by_location(location_id, limit=20):
    """
    Lấy danh sách sản phẩm theo location_id
    Trả về: list các product với thông tin cơ bản
    """
    query = f"""
        SELECT DISTINCT
            p.product_id,
            p.name AS product_name,
            p.image_url AS product_image_url,
            p.tag AS product_tag,
            p.min_cost AS product_min_cost,
            p.max_cost AS product_max_cost
        FROM product p
        WHERE p.location_id = {location_id}
        LIMIT {limit}
    """
    result = supabase.rpc("exec_sql", {"sql": query}).execute()
    return result.data if result.data else []


def fetch_product_stores(product_id, user_lat=None, user_lon=None):
    """
    Lấy danh sách cửa hàng bán sản phẩm
    Bao gồm thông tin giá, rating, địa chỉ, ảnh
    """
    query = f"""
        SELECT
            p.product_id,
            p.name AS product_name,
            p.des AS product_des,
            p.image_url AS product_image_url,

            s.store_id,
            s.name AS store_name,
            s.address AS store_address,
            s.lat AS store_lat,
            s.long AS store_long,

            ps.ps_id,
            ps.average_rating AS ps_average_rating,
            ps.total_reviews AS ps_total_reviews,
            ps.min_price_store AS ps_min_price_store,
            ps.max_price_store AS ps_max_price_store,

            pi.image_id AS pi_image_id,
            pi.image_url AS pi_image_url,
            pi.type AS pi_type

        FROM product p
        INNER JOIN product_store ps ON ps.product_id = p.product_id
        INNER JOIN store s ON s.store_id = ps.store_id
        LEFT JOIN product_images pi ON pi.ps_id = ps.ps_id
        WHERE p.product_id = {product_id}
    """
    result = supabase.rpc("exec_sql", {"sql": query}).execute()
    return result.data if result.data else []


def fetch_data_from_database():
    """
    Legacy function - không sử dụng nữa
    Giữ lại để tránh lỗi import
    """
    return []
