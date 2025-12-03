import os
import requests
import re
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Groq API - MIỄN PHÍ & CỰC NHANH
GROQ_FIX_TEXT_API_KEY = os.getenv("GROQ_FIX_TEXT_API_KEY")
MODEL = "llama-3.3-70b-versatile"  # Model mạnh nhất, free

# Supabase
DATA_BASE_SECRET_KEY_SUPABASE = os.getenv("DATA_BASE_SECRET_KEY_SUPABASE")
DATA_BASE_URL_SUPABASE = os.getenv("DATA_BASE_URL_SUPABASE")

url = DATA_BASE_URL_SUPABASE
key = DATA_BASE_SECRET_KEY_SUPABASE
supabase: Client = create_client(url, key)

def fetch_product_names():
    """Lấy danh sách tên product từ Supabase"""
    try:
        response = supabase.table("product").select("name").execute()
        rows = response.data
        if not rows:
            print("⚠️ Dữ liệu rỗng từ Supabase")
            return []

        names = {row["name"].strip() for row in rows if row.get("name")}
        return list(names)

    except Exception as e:
        print(f"⚠️ Exception fetch_product_names: {e}")
        return []


PRODUCTS = fetch_product_names()
PRODUCT_SCOPE = ", ".join(PRODUCTS)

def looks_like_foreign(text: str):
    """
    Nếu chuỗi KHÔNG có dấu tiếng Việt → coi như tiếng nước ngoài.
    """
    return not bool(re.search(r"[àáạảãâấầậẩẫăằắặẳẵèéẹẻẽêềếệểễ"
                              r"ìíịỉĩòóọỏõôồốộổỗơờớợởỡ"
                              r"ùúụủũưừứựửữỳýỵỷỹđ]", text.lower()))

def groq_fix_query(query: str):
    """
    Dùng Groq API (FREE & FAST) để fix query và match products
    """
    # Lưu query gốc để so sánh
    original_query = query
    
    url = "https://api.groq.com/openai/v1/chat/completions"

    if looks_like_foreign(query):
        prompt = (
            f"Extract and match Vietnamese product names from: '{query}'\n\n"
            f"Available products: {PRODUCT_SCOPE}\n\n"
            "Rules:\n"
            "1. Match partial words (e.g., 'bún' → all dishes with 'bún')\n"
            "2. GENERAL input → return ALL matching products (comma-separated)\n"
            "3. SPECIFIC input → return exact product only\n"
            "4. Output ONLY product names, no explanations\n\n"
            "Product names:"
        )
    else:
        prompt = (
            f"Fix spelling and match Vietnamese product names from: '{query}'\n\n"
            f"Available products: {PRODUCT_SCOPE}\n\n"
            "Rules:\n"
            "1. Fix any spelling mistakes first\n"
            "2. Match partial words (e.g., 'bún' → all dishes with 'bún')\n"
            "3. GENERAL input → return ALL matching products (comma-separated)\n"
            "4. SPECIFIC input → return exact product only\n"
            "5. Output ONLY product names, no explanations\n\n"
            "Product names:"
        )

    headers = {
        "Authorization": f"Bearer {GROQ_FIX_TEXT_API_KEY}",
        "Content-Type": "application/json"
    }

    data = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": "You are a Vietnamese product name matcher. Return only product names, nothing else."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.1,
        "max_tokens": 200
    }

    try:
        response = requests.post(url, headers=headers, json=data, timeout=10)
        
        print(f"🔍 Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"⚠️ API error {response.status_code}: {response.text}")
            print(f"📝 Query cũ: '{original_query}' → Query mới: '{original_query}' (không thay đổi)")
            return query
        
        res = response.json()
        # print(f"🔍 Full response: {res}")  # Comment out để giảm log

        # Groq response structure (OpenAI-compatible)
        if "choices" not in res or not res["choices"]:
            print("⚠️ Không có choices trong response")
            print(f"📝 Query cũ: '{original_query}' → Query mới: '{original_query}' (không thay đổi)")
            return query

        text = res["choices"][0]["message"]["content"].strip()

        if not text:
            print("⚠️ Groq trả về text rỗng")
            print(f"📝 Query cũ: '{original_query}' → Query mới: '{original_query}' (không thay đổi)")
            return query

        # Làm sạch
        text = text.replace('"', '').replace('*', '').strip()

        # Xóa prefix nếu có
        if ":" in text:
            tmp = text.split(":")[-1].strip()
            if tmp:
                text = tmp

        # IN RA SO SÁNH CŨ VÀ MỚI
        print(f"📝 Query cũ: '{original_query}' → Query mới: '{text}'")
        
        return text

    except requests.exceptions.Timeout:
        print(f"⚠️ Timeout - dùng query gốc: {query}")
        print(f"📝 Query cũ: '{original_query}' → Query mới: '{original_query}' (timeout)")
        return query

    except Exception as e:
        print(f"⚠️ Lỗi ({type(e).__name__}): {str(e)}")
        print(f"📝 Query cũ: '{original_query}' → Query mới: '{original_query}' (lỗi)")
        return query


# Test function
if __name__ == "__main__":
    test_queries = [
        "cho tôi món cơm",
        "bun cha",
        "phở bò",
        "món bún",
    ]
    
    for q in test_queries:
        print(f"\n{'='*60}")
        print(f"🔍 Test Query: {q}")
        print(f"{'='*60}")
        result = groq_fix_query(q)
        print(f"➡️ Kết quả cuối: {result}")
        print(f"{'='*60}\n")