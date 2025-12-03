import os
import requests
import base64
import re
from dotenv import load_dotenv
from supabase import create_client, Client
from difflib import SequenceMatcher

load_dotenv()

# Groq Llama 4 Scout Vision - MODEL MỚI NHẤT 2025
GROQ_SEARCH_IMAGE_API_KEY = os.getenv("GROQ_SEARCH_IMAGE_API_KEY")
VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"  # Llama 4 Scout - Vision model mới nhất
# Các model khác:
# - "llama-3.2-90b-vision-preview" (Vision 3.2 - 90B)
# - "llama-3.2-11b-vision-preview" (Vision 3.2 - 11B)

# Supabase
DATA_BASE_SECRET_KEY_SUPABASE = os.getenv("DATA_BASE_SECRET_KEY_SUPABASE")
DATA_BASE_URL_SUPABASE = os.getenv("DATA_BASE_URL_SUPABASE")

url = DATA_BASE_URL_SUPABASE
key = DATA_BASE_SECRET_KEY_SUPABASE
supabase: Client = create_client(url, key)


# ==================== HELPER FUNCTIONS ====================

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


def normalize_text(text: str) -> str:
    """Chuẩn hóa text để so sánh"""
    text = text.lower().strip()
    text = re.sub(r'[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]', '', text)
    return text


def fuzzy_match_product(detected_text: str, products: list) -> str:
    """
    So sánh mờ để tìm sản phẩm phù hợp nhất với multi-level matching
    """
    detected_normalized = normalize_text(detected_text)
    
    print(f"🔍 Đang tìm kiếm cho: '{detected_normalized}'")
    
    best_match = None
    best_score = 0.0
    
    for product in products:
        product_normalized = normalize_text(product)
        
        # Level 1: Exact match (priority cao nhất)
        if detected_normalized == product_normalized:
            print(f"  ✓✓✓ Exact match: '{product}'")
            return product
        
        # Level 2: Substring match
        if detected_normalized in product_normalized:
            score = 0.95
            print(f"  ✓✓ Substring match (detected in product): '{product}' (score: {score})")
            if score > best_score:
                best_score = score
                best_match = product
        elif product_normalized in detected_normalized:
            score = 0.90
            print(f"  ✓✓ Substring match (product in detected): '{product}' (score: {score})")
            if score > best_score:
                best_score = score
                best_match = product
        
        # Level 3: Word overlap match
        detected_words = set(detected_normalized.split())
        product_words = set(product_normalized.split())
        
        if detected_words & product_words:
            common_words = detected_words & product_words
            common_ratio = len(common_words) / max(len(detected_words), len(product_words))
            
            if common_ratio > 0.5 and common_ratio > best_score:
                best_score = common_ratio
                best_match = product
                print(f"  ✓ Word match: '{product}' | Common words: {common_words} (score: {common_ratio:.2f})")
        
        # Level 4: Fuzzy similarity
        similarity = SequenceMatcher(None, detected_normalized, product_normalized).ratio()
        if similarity > 0.65 and similarity > best_score:
            best_score = similarity
            best_match = product
            print(f"  ✓ Fuzzy match: '{product}' (score: {similarity:.2f})")
    
    if best_match:
        print(f"✅ Best match found: '{best_match}' (confidence: {best_score:.2f})")
    else:
        print(f"⚠️ Không tìm thấy match cho '{detected_text}'")
    
    return best_match


def prepare_image_data(image_data: str):
    """
    Chuẩn bị image data cho Groq API (base64)
    Returns: (base64_string, mime_type) hoặc (None, None)
    """
    try:
        # Nếu là URL
        if image_data.startswith('http://') or image_data.startswith('https://'):
            print(f"📥 Đang tải ảnh từ URL: {image_data[:50]}...")
            response = requests.get(image_data, timeout=15)
            if response.status_code == 200:
                base64_data = base64.b64encode(response.content).decode('utf-8')
                mime_type = response.headers.get('Content-Type', 'image/jpeg')
                print(f"✅ Đã tải ảnh thành công, MIME type: {mime_type}")
                return base64_data, mime_type
            else:
                print(f"⚠️ Lỗi tải ảnh: HTTP {response.status_code}")
        
        # Nếu là base64 string với data URL
        elif image_data.startswith('data:image'):
            match = re.match(r'data:([^;]+);base64,(.+)', image_data)
            if match:
                mime_type = match.group(1)
                base64_data = match.group(2)
                print(f"✅ Đã parse data URL, MIME type: {mime_type}")
                return base64_data, mime_type
        
        # Nếu là raw base64 (không có prefix)
        else:
            print("✅ Sử dụng raw base64 data")
            return image_data, "image/jpeg"
        
        return None, None
        
    except Exception as e:
        print(f"⚠️ Lỗi prepare_image_data: {str(e)}")
        return None, None


def safe_extract_text_from_groq_response(response_data: dict):
    """
    Trích xuất text từ response Groq một cách an toàn
    """
    try:
        if not response_data:
            return None
        
        # Kiểm tra error
        if "error" in response_data:
            error = response_data["error"]
            error_msg = error.get('message', 'Unknown error')
            error_type = error.get('type', 'unknown')
            print(f"⚠️ Groq API error [{error_type}]: {error_msg}")
            return None
        
        # Lấy content từ choices
        if "choices" in response_data and response_data["choices"]:
            choice = response_data["choices"][0]
            
            # Kiểm tra finish_reason
            finish_reason = choice.get("finish_reason")
            if finish_reason:
                print(f"ℹ️ Finish reason: {finish_reason}")
            
            if finish_reason and finish_reason not in ["stop", "length"]:
                print(f"⚠️ Unusual finish_reason: {finish_reason}")
            
            # Lấy text
            if "message" in choice and "content" in choice["message"]:
                text = choice["message"]["content"].strip()
                if text:
                    print(f"✅ Extracted text: '{text}'")
                    return text
        
        print("⚠️ Không tìm thấy content trong response")
        return None
        
    except Exception as e:
        print(f"⚠️ Error parsing Groq response: {e}")
        return None


def clean_detected_text(text: str) -> str:
    """
    Làm sạch text từ AI response - version nâng cao
    """
    if not text:
        return ""
    
    original_text = text
    
    # Làm sạch ký tự đặc biệt
    text = text.replace('"', '').replace('*', '').replace('`', '').replace('[', '').replace(']', '').strip()
    
    # Xử lý các format có thể có
    if ":" in text:
        text = text.split(":")[-1].strip()
    if "\n" in text:
        text = text.split("\n")[0].strip()
    
    # Loại bỏ các từ thừa (expanded list)
    stop_words = [
        "output", "result", "product", "món", "là", "is", "answer", ":", 
        "tên", "sản phẩm", "đáp án", "the", "this is", "it is",
        "looks like", "appears to be", "seems to be", "probably"
    ]
    
    text_lower = text.lower()
    for word in stop_words:
        if text_lower.startswith(word):
            text = text[len(word):].strip()
            text_lower = text.lower()
    
    # Loại bỏ dấu chấm câu cuối
    text = text.rstrip('.,;:!?')
    
    if text != original_text:
        print(f"🧹 Cleaned: '{original_text}' → '{text}'")
    
    return text


# ==================== MAIN FUNCTION ====================

def groq_search_product_by_image(image_data: str):
    """
    Tìm sản phẩm bằng hình ảnh sử dụng Groq Llama 4 Scout Vision API
    
    Args:
        image_data: URL ảnh, base64 string, hoặc data URL
    
    Returns:
        str: Tên sản phẩm tìm được, hoặc None nếu không tìm thấy
    """
    print("\n" + "="*70)
    print("🚀 GROQ LLAMA 4 SCOUT VISION - PRODUCT SEARCH")
    print("="*70)
    
    # Bước 1: Lấy danh sách sản phẩm
    print("\n📦 [1/7] Đang lấy danh sách sản phẩm từ Supabase...")
    products = fetch_product_names()
    
    if not products:
        print("❌ Danh sách sản phẩm rỗng")
        return None
    
    print(f"✅ Đã load {len(products)} sản phẩm")
    
    if not GROQ_SEARCH_IMAGE_API_KEY:
        print("❌ Thiếu GROQ_SEARCH_IMAGE_API_KEY trong .env")
        return None
    
    # Bước 2: Chuẩn bị image data
    print("\n🖼️ [2/7] Đang xử lý image data...")
    base64_image, mime_type = prepare_image_data(image_data)
    
    if not base64_image:
        print("❌ Không thể xử lý image data")
        return None
    
    # Bước 3: Tạo prompt tối ưu cho Llama 4 Scout
    print("\n✍️ [3/7] Đang tạo prompt...")
    
    # Chia nhỏ danh sách nếu quá dài (tránh vượt token limit)
    if len(products) > 100:
        print(f"⚠️ Danh sách sản phẩm lớn ({len(products)} items), sử dụng format tối ưu")
        product_list = "\n".join([f"{i+1}. {p}" for i, p in enumerate(products[:100])])
        product_list += f"\n... and {len(products)-100} more items"
    else:
        product_list = "\n".join([f"• {p}" for p in products])
    
        # PROMPT TỐI ƯU - XỬ LÝ CẢ ĐỒ ĂN VÀ SẢN PHẨM KHÁC
    prompt = f"""Bạn là chuyên gia nhận diện hình ảnh với khả năng xác định sản phẩm chính xác.

### DANH SÁCH SẢN PHẨM TRONG CỬA HÀNG (PHÂN LOẠI):
{product_list}

### QUY TẮC XỬ LÝ ĐẶC BIỆT QUAN TRỌNG:

1. **TRƯỜNG HỢP 1: NHẬN DIỆN RÕ RÀNG**
   - Nếu hình ảnh rõ ràng, nhận diện được sản phẩm CỤ THỂ trong danh sách
   - → Trả về tên sản phẩm CỤ THỂ đó

2. **TRƯỜNG HỢP 2: KHÓ PHÂN BIỆT GIỮA 2+ SẢN PHẨM TÊN GẦN GIỐNG**
   - Nếu hình ảnh món ăn khó phân biệt giữa các biến thể
   - HOẶC nhận diện chung chung một loại sản phẩm
   - → Trả về tên CHUNG/TỔNG QUÁT (để match với nhiều sản phẩm)

   **VÍ DỤ:**
   - Ảnh cơm không rõ loại → "cơm" (match với: cơm tấm, cơm cháy, cơm gà...)
   - Ảnh bún không rõ loại → "bún" (match với: bún bò, bún riêu, bún chả...)
   - Ảnh phở không rõ loại → "phở" (match với: phở bò, phở gà...)
   - Ảnh áo thun chung → "áo thun" (match với: áo thun nam, áo thun nữ...)

3. **TRƯỜNG HỢP 3: ẢNH CÓ NHIỀU SẢN PHẨM**
   - Nếu ảnh có nhiều món/sản phẩm khác nhau
   - → Trả về danh sách "sản phẩm 1, sản phẩm 2, ..." (tên chung)
   - Giới hạn tối đa 3 sản phẩm chính

4. **TRƯỜNG HỢP 4: KHÔNG NHẬN DIỆN ĐƯỢC**
   - Nếu không chắc chắn với bất kỳ sản phẩm nào
   - → Trả về từ khóa mô tả chung nhất

### PHÂN TÍCH HÌNH ẢNH THEO CẤP ĐỘ:

**CẤP 1: PHÂN LOẠI CHÍNH**
- ĐỒ ĂN/THỨC UỐNG hay SẢN PHẨM KHÁC?
- Nếu đồ ăn: Cơm/Bún/Phở/Mì/Bánh/Thức uống?
- Nếu sản phẩm khác: Văn phòng phẩm/Đồ dùng/Quần áo?

**CẤP 2: PHÂN BIỆT CHI TIẾT (CHỈ KHI RÕ RÀNG)**
- Với đồ ăn: Loại cụ thể? Có thịt gà/bò/heo?
- Với sản phẩm: Kiểu dáng/màu sắc/chất liệu?

**CẤP 3: ĐỘ CHÍNH XÁC**
- Rất rõ (90-100%): Trả tên cụ thể
- Tương đối rõ (70-90%): Trả tên chung
- Không rõ (<70%): Trả từ khóa chung

### QUY TẮC ƯU TIÊN CHO ĐỒ ĂN VIỆT NAM:

**NHẬN BIẾT LOẠI THỰC PHẨM:**
- HẠT CƠM → "cơm" (không phải bún/phở)
- SỢI TRẮNG TRÒN → "bún"
- SỢI TRẮNG DẸT → "phở"
- SỢI VÀNG → "mì"
- NƯỚC DÙNG → xác định loại (trong/đỏ/đậm)

**PHÂN BIỆT MÓN TƯƠNG TỰ:**
- CƠM GÀ vs BÚN GÀ: Có nước dùng không? Sợi hay hạt?
- BÚN BÒ vs PHỞ BÒ: Sợi tròn hay dẹt? Nước dùng màu gì?
- CƠM TẤM vs CƠM THƯỜNG: Gạo tấm vỡ hay nguyên hạt?

### XỬ LÝ TÊN GẦN GIỐNG TRONG DATABASE:

Nếu database có các sản phẩm:
- "Cơm tấm sườn"
- "Cơm tấm trứng"
- "Cơm tấm chả"
- "Cơm gà xối mỡ"
- "Cơm bò lúc lắc"

**KHI ẢNH KHÔNG RÕ:**
- Ảnh cơm chung → "cơm" (match với TẤT CẢ món cơm)
- Ảnh cơm tấm không rõ loại → "cơm tấm" (match với cơm tấm sườn/trứng/chả)
- Ảnh cơm có thịt gà → "cơm gà" (match với cơm gà xối mỡ/...)

### ĐẦU RA LỊNH HOẠT THEO TÌNH HUỐNG:

**TÌNH HUỐNG 1: 1 sản phẩm rõ ràng**
→ "Tên sản phẩm cụ thể"

**TÌNH HUỐNG 2: 1 sản phẩm không rõ loại**
→ "Tên chung" (vd: "cơm", "bún", "áo thun")

**TÌNH HUỐNG 3: Nhiều sản phẩm**
→ "sản phẩm 1, sản phẩm 2, sản phẩm 3" (tên chung)

**TÌNH HUỐNG 4: Không chắc chắn**
→ "từ khóa mô tả" (vd: "đồ ăn", "thức uống", "văn phòng phẩm")

### CUỐI CÙNG - QUYẾT ĐỊNH:
1. Quan sát ảnh kỹ
2. So sánh với danh sách sản phẩm
3. Áp dụng quy tắc xử lý phù hợp
4. Trả về kết quả theo đúng format

### ĐẦU RA BẮT BUỘC:
Chỉ trả về:
- Tên sản phẩm CỤ THỂ (nếu rõ)
- HOẶC Tên CHUNG (nếu không rõ)
- HOẶC "sản phẩm 1, sản phẩm 2" (nếu nhiều sản phẩm)
KHÔNG thêm bất kỳ chữ nào khác, không giải thích.
"""
    
    # Bước 4: Gọi Groq Llama 4 Scout Vision API
    print(f"\n🤖 [4/7] Đang gọi Groq API với model: {VISION_MODEL}...")
    
    api_url = "https://api.groq.com/openai/v1/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {GROQ_SEARCH_IMAGE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{base64_image}"
                        }
                    }
                ]
            }
        ],
        "temperature": 0.05,  # Rất thấp để có kết quả nhất quán
        "max_tokens": 200,    # Đủ cho tên sản phẩm
        "top_p": 0.9,
        "stream": False
    }
    
    try:
        response = requests.post(api_url, headers=headers, json=payload, timeout=30)
        
        print(f"📡 Vision API Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ API error {response.status_code}: {response.text[:200]}")
            return None
        
        res = response.json()
        
        # Bước 5: Trích xuất text
        print("\n📝 [5/7] Đang trích xuất kết quả...")
        text = safe_extract_text_from_groq_response(res)
        
        if not text:
            print("❌ Không trích xuất được text từ response")
            return None
        
        # Bước 6: Làm sạch text
        print("\n🧹 [6/7] Đang làm sạch output...")
        text = clean_detected_text(text)
        print(f"🎯 Llama 4 Scout detected: '{text}'")
        
        # Bước 7: Fuzzy matching
        print("\n🔍 [7/7] Đang so khớp với database...")
        matched_product = fuzzy_match_product(text, products)
        
        if matched_product:
            print("\n" + "="*70)
            print(f"✅ SUCCESS! Found product: '{matched_product}'")
            print("="*70)
            return matched_product
        
        # Bước 8: Fallback strategy - keyword matching
        print("\n⚠️ Fuzzy matching failed, trying fallback strategy...")
        
        keywords = [
            # Đồ ăn
            "cơm", "phở", "bún", "bánh", "chả", "gà", "bò", "heo", "tôm", "cá",
            "mì", "canh", "lẩu", "nem", "gỏi", "xôi", "cháo",
            # Đồ uống  
            "trà", "cà phê", "nước", "sinh tố", "sữa", "bia", "rượu", "chanh",
            # Đồ dùng
            "bút", "vở", "sách", "balo", "túi", "áo", "quần"
        ]
        
        text_lower = text.lower()
        for keyword in keywords:
            if keyword in text_lower:
                print(f"🔑 Found keyword: '{keyword}'")
                for product in products:
                    if keyword in product.lower():
                        print(f"⚠️ Fallback match: '{product}'")
                        return product
        
        print("\n" + "="*70)
        print(f"❌ FAILED: Không tìm thấy sản phẩm phù hợp cho '{text}'")
        print("="*70)
        return None
        
    except requests.exceptions.Timeout:
        print("❌ Timeout: API không phản hồi trong 30 giây")
        return None
    
    except requests.exceptions.RequestException as e:
        print(f"❌ Request error: {str(e)}")
        return None
    
    except Exception as e:
        print(f"❌ Unexpected error: {type(e).__name__} - {str(e)}")
        return None


# ==================== TEST FUNCTION ====================

if __name__ == "__main__":
    print("\n" + "🎯"*35)
    print("GROQ LLAMA 4 SCOUT VISION - PRODUCT SEARCH TEST")
    print(f"Model: {VISION_MODEL}")
    print("🎯"*35 + "\n")
    
    # Test 1: URL ảnh
    test_url = "https://example.com/food.jpg"
    print("\n" + "="*70)
    print("TEST 1: Image from URL")
    print("="*70)
    result = groq_search_product_by_image(test_url)
    print(f"\n📊 FINAL RESULT: {result}")
    
    # Test 2: Base64 từ file local
    print("\n\n" + "="*70)
    print("TEST 2: Image from local file (uncomment to test)")
    print("="*70)
    print("""
    # Để test với file local:
    import os
    
    image_path = "path/to/your/image.jpg"
    
    if os.path.exists(image_path):
        with open(image_path, "rb") as f:
            base64_data = base64.b64encode(f.read()).decode('utf-8')
            result = groq_search_product_by_image(base64_data)
            print(f"📊 FINAL RESULT: {result}")
    else:
        print(f"⚠️ File not found: {image_path}")
    """)