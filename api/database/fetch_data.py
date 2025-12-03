import os
import re
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

DATA_BASE_SECRET_KEY_SUPABASE = os.getenv("DATA_BASE_SECRET_KEY_SUPABASE")
DATA_BASE_URL_SUPABASE = os.getenv("DATA_BASE_URL_SUPABASE")

url = DATA_BASE_URL_SUPABASE
key = DATA_BASE_SECRET_KEY_SUPABASE
supabase: Client = create_client(url, key)

def sanitize_input(text):
    """Loại ký tự nguy hiểm để tránh SQL injection đơn giản"""
    return re.sub(r"[\"';]", "", text).strip()

def fetch_rows_by_search(search_text):
    """
    Tìm kiếm sản phẩm, hỗ trợ nhiều tên phân cách bởi: , . -
    VD: "Cơm tấm, Cơm cháy" hoặc "món 1. món 2" hoặc "món 3 - món 4"
    """
    # Tách theo các dấu phân cách: , . -
    products = re.split(r'[,.\-]', search_text)
    products = [sanitize_input(p).lower().strip() for p in products if p.strip()]
    
    # Nếu có nhiều món → tạo điều kiện OR
    if len(products) > 1:
        conditions = " OR ".join([
            f"unaccent(lower(p.name)) LIKE '%' || unaccent(lower('{prod}')) || '%'"
            for prod in products
        ])
        where_clause = f"WHERE ({conditions})"
    else:
        # Chỉ có 1 món
        safe_search = sanitize_input(search_text).lower()
        where_clause = f"WHERE unaccent(lower(p.name)) LIKE '%' || unaccent(lower('{safe_search}')) || '%'"

    query = f"""
        SELECT 
            p.product_id, 
            p.name AS product_name, 
            p.des AS product_des,
            p.image_url AS product_image_url,
            p.location_id AS product_location_id,
            p.tag AS product_tag,
            p.min_cost AS product_min_cost,
            p.max_cost AS product_max_cost,
                
            l.location_id,
            l.name AS location_name,
            l.max_long AS location_max_long,
            l.min_long AS location_min_long,
            l.max_lat AS location_max_lat,
            l.min_lat AS location_min_lat,
                
            s.store_id,
            s.name AS store_name,
            s.address AS store_address,
            s.lat AS store_lat,
            s.long AS store_long,
            s.location_id AS store_location_id,
            
            ps.ps_id,
            ps.store_id AS ps_store_id,
            ps.product_id AS ps_product_id,
            ps.average_rating AS ps_average_rating,
            ps.total_reviews AS ps_total_reviews,
            ps.min_price_store AS ps_min_price_store,
            ps.max_price_store AS ps_max_price_store,
                
            pi.ps_id,
            pi.image_id AS ps_image_id,
            pi.image_url AS ps_image_url,
            pi.type AS ps_type

        FROM product p
        LEFT JOIN location l ON p.location_id = l.location_id
        LEFT JOIN product_store ps ON ps.product_id = p.product_id
        LEFT JOIN store s ON s.store_id = ps.store_id
        LEFT JOIN product_images pi ON pi.ps_id = ps.ps_id
        {where_clause}
    """
    result = supabase.rpc("exec_sql", {"sql": query}).execute()
    return result.data

def fetch_data_by_product_store_id(product_id: str, store_id: str = None):
    """
    Tìm kiếm chi tiết sản phẩm.
    - Nếu có store_id: Lấy chi tiết sản phẩm tại cửa hàng đó (1 dòng).
    - Nếu KHÔNG có store_id: Lấy chi tiết sản phẩm tại TẤT CẢ cửa hàng (n dòng).
    """
    # 1. Bảo vệ đầu vào product_id (Bắt buộc)
    safe_product_id = sanitize_input(product_id)
    
    # 2. Xây dựng danh sách điều kiện
    conditions = [f"p.product_id = '{safe_product_id}'"]

    # 3. Kiểm tra store_id có tồn tại không
    if store_id:
        safe_store_id = sanitize_input(store_id)
        conditions.append(f"s.store_id = '{safe_store_id}'")

    # Nối các điều kiện bằng AND
    where_clause = "WHERE " + " AND ".join(conditions)

    query = f"""
        SELECT 
            p.product_id, 
            p.name AS product_name, 
            p.des AS product_des,
            p.image_url AS product_image_url,
            p.location_id AS product_location_id,
            p.tag AS product_tag,
            p.min_cost AS product_min_cost,
            p.max_cost AS product_max_cost,
                
            l.location_id,
            l.name AS location_name,
            l.max_long AS location_max_long,
            l.min_long AS location_min_long,
            l.max_lat AS location_max_lat,
            l.min_lat AS location_min_lat,
                
            s.store_id,
            s.name AS store_name,
            s.address AS store_address,
            s.lat AS store_lat,
            s.long AS store_long,
            s.location_id AS store_location_id,
            
            ps.ps_id,
            ps.store_id AS ps_store_id,
            ps.product_id AS ps_product_id,
            ps.average_rating AS ps_average_rating,
            ps.total_reviews AS ps_total_reviews,
            ps.min_price_store AS ps_min_price_store,
            ps.max_price_store AS ps_max_price_store,
                
            pi.ps_id,
            pi.image_id AS ps_image_id,
            pi.image_url AS ps_image_url,
            pi.type AS ps_type

        FROM product p
        LEFT JOIN location l ON p.location_id = l.location_id
        LEFT JOIN product_store ps ON ps.product_id = p.product_id
        LEFT JOIN store s ON s.store_id = ps.store_id
        LEFT JOIN product_images pi ON pi.ps_id = ps.ps_id
        {where_clause}
    """
    
    # Supabase RPC để thực thi truy vấn
    result = supabase.rpc("exec_sql", {"sql": query}).execute()
    
    return result.data

def fetch_full_data():
    query = """
        SELECT 
            p.product_id, 
            p.name AS product_name, 
            p.des AS product_des,
            p.image_url AS product_image_url,
            p.location_id AS product_location_id,
            p.tag AS product_tag,
            p.min_cost AS product_min_cost,
            p.max_cost AS product_max_cost,
                
            l.location_id,
            l.name AS location_name,
            l.max_long AS location_max_long,
            l.min_long AS location_min_long,
            l.max_lat AS location_max_lat,
            l.min_lat AS location_min_lat,
                
            s.store_id,
            s.name AS store_name,
            s.address AS store_address,
            s.lat AS store_lat,
            s.long AS store_long,
            s.location_id AS store_location_id,
            
            ps.ps_id,
            ps.store_id AS ps_store_id,
            ps.product_id AS ps_product_id,
            ps.average_rating AS ps_average_rating,
            ps.total_reviews AS ps_total_reviews,
            ps.min_price_store AS ps_min_price_store,
            ps.max_price_store AS ps_max_price_store,
                
            pi.ps_id,
            pi.image_id AS ps_image_id,
            pi.image_url AS ps_image_url,
            pi.type AS ps_type

        FROM product p
        LEFT JOIN location l ON p.location_id = l.location_id
        LEFT JOIN product_store ps ON ps.product_id = p.product_id
        LEFT JOIN store s ON s.store_id = ps.store_id
        LEFT JOIN product_images pi ON pi.ps_id = ps.ps_id
    """
    result = supabase.rpc("exec_sql", {"sql": query}).execute()
    return result.data