import os
import requests
import json
from dotenv import load_dotenv

# Load biến môi trường
load_dotenv()

# CẤU HÌNH API (Lấy từ .env giống file mẫu)
GROQ_API_KEY = os.getenv(
    "GROQ_LOCATION_API_KEY"
)  # Đặt tên biến trong .env là gì thì sửa ở đây
MODEL = "llama-3.3-70b-versatile"
API_URL = "https://api.groq.com/openai/v1/chat/completions"


def get_standard_location(user_input: str):
    """
    Dùng Groq API (qua requests) để chuẩn hóa địa chỉ về Tỉnh/Thành phố.
    Phong cách code: Requests thuần + os.getenv.
    """
    original_input = user_input

    # SYSTEM PROMPT: Logic chuẩn hóa địa lý
    system_instruction = """
    Bạn là một API chuẩn hóa địa danh Việt Nam.
    NHIỆM VỤ: Xác định Tỉnh hoặc Thành phố trực thuộc trung ương.
    
    QUY TẮC (Output Rules):
    1. ƯU TIÊN TUYỆT ĐỐI: Input thuộc TP.HCM (Q1, Sài Gòn, Thủ Đức, HCM...) -> TRẢ VỀ: "TP. Hồ Chí Minh"
    2. Input thuộc tỉnh/thành khác -> Trả về tên chuẩn (VD: Hà Nội, Đà Nẵng, Cần Thơ).
    3. Suy luận:
       - Input là Quận/Huyện/Địa danh con -> Trả về Tỉnh/TP chứa nó (VD: "Hội An" -> "Quảng Nam").
       - Viết tắt/Sai chính tả -> Tự sửa (VD: "HN" -> "Hà Nội").
    4. Không tìm thấy -> Trả về null.

    OUTPUT FORMAT: JSON Object bắt buộc
    { "location": "Tên chuẩn hoặc null" }
    """

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    data = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": f"Input: {user_input}"},
        ],
        # Ép buộc trả về JSON để code dễ đọc (Tính năng của Llama 3)
        "response_format": {"type": "json_object"},
        "temperature": 0.0,  # Nhiệt độ 0 để kết quả chính xác, không sáng tạo
        "max_tokens": 100,
    }

    try:
        response = requests.post(API_URL, headers=headers, json=data, timeout=10)

        # Log status giống file mẫu
        # print(f"🔍 Location Status: {response.status_code}")

        if response.status_code != 200:
            print(f"⚠️ API error {response.status_code}: {response.text}")
            return None

        res = response.json()

        if "choices" not in res or not res["choices"]:
            print("⚠️ Không có choices trong response")
            return None

        content_str = res["choices"][0]["message"]["content"].strip()

        # Bước này quan trọng: Parse chuỗi JSON thành Dictionary Python
        try:
            location_data = json.loads(content_str)
            final_location = location_data.get("location")

            print(f"📍 Input: '{original_input}' → Output: '{final_location}'")
            return final_location

        except json.JSONDecodeError:
            print(f"⚠️ Lỗi parse JSON từ AI: {content_str}")
            return None

    except requests.exceptions.Timeout:
        print(f"⚠️ Timeout khi gọi API Location cho: {user_input}")
        return None

    except Exception as e:
        print(f"⚠️ Exception get_standard_location: {str(e)}")
        return None


# --- TEST FUNCTION (Chạy trực tiếp file này để test) ---
if __name__ == "__main__":
    test_cases = [
        "HN",
        "Q1",
        "sai gon",
        "tp hcm",
        "Hội An",
        "quan cau giay",
        "abc xyz linh tinh",
    ]

    print(f"\n{'='*60}")
    print("KIỂM TRA CHUẨN HÓA LOCATION (DÙNG REQUESTS + ENV)")
    print(f"{'='*60}")

    for case in test_cases:
        get_standard_location(case)
