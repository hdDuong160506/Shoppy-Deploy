import os
import requests
import base64
import re
from dotenv import load_dotenv
from supabase import create_client, Client
from difflib import SequenceMatcher

load_dotenv()

# Groq Llama 4 Scout Vision - Latest Model
GROQ_SEARCH_IMAGE_API_KEY = os.getenv("GROQ_SEARCH_IMAGE_API_KEY")
VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"  # Llama 4 Scout - Latest Vision model

# Supabase Configuration
DATA_BASE_SECRET_KEY_SUPABASE = os.getenv("DATA_BASE_SECRET_KEY_SUPABASE")
DATA_BASE_URL_SUPABASE = os.getenv("DATA_BASE_URL_SUPABASE")

url = DATA_BASE_URL_SUPABASE
key = DATA_BASE_SECRET_KEY_SUPABASE
supabase: Client = create_client(url, key)


# ==================== HELPER FUNCTIONS ====================

def fetch_product_names():
    """Fetches a list of product names from Supabase."""
    try:
        response = supabase.table("product").select("name").execute()
        rows = response.data
        if not rows:
            print("⚠️ Empty data received from Supabase")
            return []

        names = {row["name"].strip() for row in rows if row.get("name")}
        return list(names)

    except Exception as e:
        print(f"⚠️ Exception in fetch_product_names: {e}")
        return []


def normalize_text(text: str) -> str:
    """Normalizes text for comparison (lowercase, remove Vietnamese diacritics/punctuation)."""
    text = text.lower().strip()
    # Keeping Vietnamese characters for comparison within the database
    text = re.sub(r'[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]', '', text)
    return text


def fuzzy_match_product(detected_text: str, products: list) -> str:
    """
    Performs fuzzy matching to find the best product match using multi-level matching.
    """
    detected_normalized = normalize_text(detected_text)
    
    print(f"🔍 Searching for: '{detected_normalized}'")
    
    best_match = None
    best_score = 0.0
    
    for product in products:
        product_normalized = normalize_text(product)
        
        # Level 1: Exact match (highest priority)
        if detected_normalized == product_normalized:
            print(f"  ✓✓✓ Exact match: '{product}'")
            return product
        
        # Level 2: Substring match (detected in product or product in detected)
        if detected_normalized in product_normalized:
            score = 0.95
            print(f"  ✓✓ Substring match (detected in product): '{product}' (score: {score})")
            if score > best_score:
                best_score = score
                best_match = product
        elif product_normalized in detected_normalized:
            score = 0.90
            print(f"  ✓✓ Substring match (product in detected): '{product}' (score: {score})")
            if score > best_score:
                best_score = score
                best_match = product
        
        # Level 3: Word overlap match (ratio > 50%)
        detected_words = set(detected_normalized.split())
        product_words = set(product_normalized.split())
        
        if detected_words & product_words:
            common_words = detected_words & product_words
            # Calculate common ratio based on the larger set to be stricter
            common_ratio = len(common_words) / max(len(detected_words), len(product_words))
            
            if common_ratio > 0.5 and common_ratio > best_score:
                best_score = common_ratio
                best_match = product
                print(f"  ✓ Word match: '{product}' | Common words: {common_words} (score: {common_ratio:.2f})")
        
        # Level 4: Fuzzy similarity (SequenceMatcher ratio > 65%)
        similarity = SequenceMatcher(None, detected_normalized, product_normalized).ratio()
        if similarity > 0.65 and similarity > best_score:
            best_score = similarity
            best_match = product
            print(f"  ✓ Fuzzy match: '{product}' (score: {similarity:.2f})")
    
    if best_match:
        print(f"✅ Best match found: '{best_match}' (confidence: {best_score:.2f})")
    else:
        print(f"⚠️ No match found for '{detected_text}'")
    
    return best_match


def prepare_image_data(image_data: str):
    """
    Prepares image data for Groq API (base64).
    Returns: (base64_string, mime_type) or (None, None)
    """
    try:
        # If it's a URL
        if image_data.startswith('http://') or image_data.startswith('https://'):
            print(f"📥 Downloading image from URL: {image_data[:50]}...")
            response = requests.get(image_data, timeout=15)
            if response.status_code == 200:
                base64_data = base64.b64encode(response.content).decode('utf-8')
                mime_type = response.headers.get('Content-Type', 'image/jpeg')
                print(f"✅ Image downloaded successfully, MIME type: {mime_type}")
                return base64_data, mime_type
            else:
                print(f"⚠️ Image download error: HTTP {response.status_code}")
        
        # If it's a base64 string with data URL
        elif image_data.startswith('data:image'):
            match = re.match(r'data:([^;]+);base64,(.+)', image_data)
            if match:
                mime_type = match.group(1)
                base64_data = match.group(2)
                print(f"✅ Data URL parsed, MIME type: {mime_type}")
                return base64_data, mime_type
        
        # If it's raw base64 (no prefix)
        else:
            print("✅ Using raw base64 data")
            return image_data, "image/jpeg"
        
        return None, None
        
    except Exception as e:
        print(f"⚠️ Error in prepare_image_data: {str(e)}")
        return None, None


def safe_extract_text_from_groq_response(response_data: dict):
    """
    Safely extracts text from the Groq response.
    """
    try:
        if not response_data:
            return None
        
        # Check for error
        if "error" in response_data:
            error = response_data["error"]
            error_msg = error.get('message', 'Unknown error')
            error_type = error.get('type', 'unknown')
            print(f"⚠️ Groq API error [{error_type}]: {error_msg}")
            return None
        
        # Get content from choices
        if "choices" in response_data and response_data["choices"]:
            choice = response_data["choices"][0]
            
            finish_reason = choice.get("finish_reason")
            if finish_reason:
                print(f"ℹ️ Finish reason: {finish_reason}")
            
            if finish_reason and finish_reason not in ["stop", "length"]:
                print(f"⚠️ Unusual finish_reason: {finish_reason}")
            
            # Get text
            if "message" in choice and "content" in choice["message"]:
                text = choice["message"]["content"].strip()
                if text:
                    print(f"✅ Extracted text: '{text}'")
                    return text
        
        print("⚠️ No content found in response")
        return None
        
    except Exception as e:
        print(f"⚠️ Error parsing Groq response: {e}")
        return None


def clean_detected_text(text: str) -> str:
    """
    Cleans up text from the AI response - advanced version.
    """
    if not text:
        return ""
    
    original_text = text
    
    # Clean special characters
    text = text.replace('"', '').replace('*', '').replace('`', '').replace('[', '').replace(']', '').strip()
    
    # Handle possible formats (e.g., "Output: name" or multiline)
    if ":" in text:
        text = text.split(":")[-1].strip()
    if "\n" in text:
        text = text.split("\n")[0].strip()
    
    # Remove unnecessary starting words (expanded list)
    stop_words = [
        "output", "result", "product", "mon", "is", "answer", "ten", "san pham", "dap an", "the", 
        "this is", "it is", "looks like", "appears to be", "seems to be", "probably", "may be",
        "name", "general name", "specific name", "item"
    ]
    
    text_lower = text.lower()
    for word in stop_words:
        if text_lower.startswith(word):
            text = text[len(word):].strip()
            text_lower = text.lower()
    
    # Remove trailing punctuation
    text = text.rstrip('.,;:!?')
    
    if text != original_text:
        print(f"🧹 Cleaned: '{original_text}' → '{text}'")
    
    return text


# ==================== MAIN FUNCTION ====================

def groq_search_product_by_image(image_data: str):
    """
    Searches for a product by image using Groq Llama 4 Scout Vision API.
    
    Args:
        image_data: Image URL, base64 string, or data URL.
    
    Returns:
        str: The matched product name, or None if no match is found.
    """
    print("\n" + "="*70)
    print("🚀 GROQ LLAMA 4 SCOUT VISION - PRODUCT SEARCH")
    print("="*70)
    
    # Step 1: Fetch product names
    print("\n📦 [1/7] Fetching product list from Supabase...")
    products = fetch_product_names()
    
    if not products:
        print("❌ Empty product list")
        return None
    
    print(f"✅ Loaded {len(products)} products")
    
    if not GROQ_SEARCH_IMAGE_API_KEY:
        print("❌ GROQ_SEARCH_IMAGE_API_KEY is missing in .env")
        return None
    
    # Step 2: Prepare image data
    print("\n🖼️ [2/7] Processing image data...")
    base64_image, mime_type = prepare_image_data(image_data)
    
    if not base64_image:
        print("❌ Could not process image data")
        return None
    
    # Step 3: Create optimized prompt for Llama 4 Scout
    print("\n✍️ [3/7] Creating optimized English prompt...")
    
    # Prompt Setup (Max 100 items listed for token efficiency)
    if len(products) > 100:
        print(f"⚠️ Large product list ({len(products)} items), listing top 100.")
        product_list = "\n".join([f"{i+1}. {p}" for i, p in enumerate(products[:100])])
        product_list += f"\n... and {len(products)-100} more items"
    else:
        product_list = "\n".join([f"• {p}" for p in products])
    
    
    PROMPT_EN = f"""
You are an expert image recognition system for an e-commerce platform specializing in Vietnamese products and cuisine. Your task is to identify the main subject/product in the image and provide the BEST possible search term based on the provided product list.

### PRODUCT LIST / DATABASE ITEMS:
{product_list}

### STRICT RULES FOR IDENTIFICATION & OUTPUT:

1. **IDENTIFICATION PRIORITY (High to Low):**
    a. **Specific Match (95%+ Certainty):** If the image clearly shows a specific item from the list.
       → Return the **FULL SPECIFIC NAME** (Rule 1a).
    b. **Category Match (70%+ Certainty):** If the image shows a product type that generalizes several items.
       → Return the **GENERAL CATEGORY NAME** (Rule 1b).
    c. **Descriptive Fallback (<70% Certainty or Complex):** If uncertain, unclear, low-quality, or contains multiple complex items.
       → Return the **MOST DESCRIPTIVE KEYWORD** (Rule 1c).

2. **COMPLEX SCENARIO (Multiple Items):**
    - If the image contains multiple distinguishable products.
    - → Return a comma-separated list of the 2-3 main general items (e.g., "Bánh Mì, Cà Phê").

3. **GENERALIZATION EXAMPLES (Tie-Breaking):**
    - Generic shirt image → "Áo Thun"
    - Generic pastry image → "Bánh" (Cake/Pastry)

---

### 🇻🇳 VIETNAMESE FOOD CLASSIFICATION PRIORITY (Critical)

Analyze the core structure and composition to correctly classify Vietnamese dishes.

**A. BASE COMPONENT ANALYSIS (CẤP 1):**
- **SQUARE/ROUND CRISPY RICE SHEETS (Bánh Đa/Bánh Tráng):** If mixed with herbs/sauce → **Bánh Tráng Trộn** (Mixed Rice Paper).
- **CRISPY GOLDEN RICE GRAINS (Gạo Cháy/Cơm Chiên Giòn):** If mixed with herbs/salad → **Cơm Cháy** (Crispy Rice). *Prioritize the base component: If the base is CRISPY RICE, return "Cơm Cháy" or a specific "Cơm Cháy" variant from the list.*
- **ROUND WHITE NOODLE STRANDS (Sợi Tròn):** If in soup → **Bún** (Round Noodle)
- **FLAT WHITE NOODLE STRANDS (Sợi Dẹt):** If in soup → **Phở** (Flat Noodle)
- **RICE GRAINS (Unbroken/Broken):** If served with meat/side dishes → **Cơm** (Rice).

**B. TIE-BREAKING EXAMPLES (General Match - Rule 1b):**
- Image of Bún in soup, exact type unclear (e.g., Bún Bò vs Bún Riêu) → **Bún**
- Image of Phở, meat unclear → **Phở**
- Image of Cơm Tấm served with meat, meat type unclear → **Cơm Tấm** (Broken Rice)

---

### MANDATORY OUTPUT FORMAT:

**You must strictly return ONLY the determined product name(s) or keyword(s) as a single text string.**
**DO NOT** add any introductory phrases, explanations, confidence scores, or punctuation (commas are only allowed to separate multiple items).
"""
    
    # Step 4: Call Groq Llama 4 Scout Vision API
    print(f"\n🤖 [4/7] Calling Groq API with model: {VISION_MODEL}...")
    
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
                        "text": PROMPT_EN
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
        "temperature": 0.01,  # Low temp for consistent result
        "max_tokens": 400,    # Enough for product names/keywords
        "top_p": 0.98,
        "stream": False
    }
    
    try:
        response = requests.post(api_url, headers=headers, json=payload, timeout=10000)
        
        print(f"📡 Vision API Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ API error {response.status_code}: {response.text[:200]}")
            return None
        
        res = response.json()
        
        # Step 5: Extract text
        print("\n📝 [5/7] Extracting result...")
        text = safe_extract_text_from_groq_response(res)
        
        if not text:
            print("❌ Could not extract text from response")
            return None
        
        # Step 6: Clean text
        print("\n🧹 [6/7] Cleaning output...")
        text = clean_detected_text(text)
        print(f"🎯 Llama 4 Scout detected: '{text}'")
        
        # Step 7: Fuzzy matching
        print("\n🔍 [7/7] Fuzzy matching with database...")
        matched_product = fuzzy_match_product(text, products)
        
        if matched_product:
            print("\n" + "="*70)
            print(f"✅ SUCCESS! Found product: '{matched_product}'")
            print("="*70)
            return matched_product
        
        # Step 8: Fallback strategy - keyword matching (optional, can be removed if prompt is perfect)
        print("\n⚠️ Fuzzy matching failed, trying fallback strategy...")
        
        # Fallback Keywords (Vietnamese)
        keywords = [
             "cơm", "phở", "bún", "bánh", "chả", "gà", "bò", "heo", "tôm", "cá",
             "trà", "cà phê", "nước", "áo", "quần", "sách", "bút"
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
        print(f"❌ FAILED: No suitable product found for '{text}'")
        print("="*70)
        return None
        
    except requests.exceptions.Timeout:
        print("❌ Timeout: API did not respond within 30 seconds")
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
    
    # Test 1: Image from URL (Replace with an actual test URL)
    test_url = "https://via.placeholder.com/300/F0F0F0/000000?text=Food+Item"
    print("\n" + "="*70)
    print("TEST 1: Image from URL (Placeholder)")
    print("="*70)
    result = groq_search_product_by_image(test_url)
    print(f"\n📊 FINAL RESULT: {result}")
    
    # Test 2: Base64 from local file (Instructions retained for reference)
    print("\n\n" + "="*70)
    print("TEST 2: Image from local file (uncomment to test)")
    print("="*70)
    print("""
    # To test with a local file:
    # import os
    # 
    # image_path = "path/to/your/image.jpg"
    # 
    # if os.path.exists(image_path):
    #     with open(image_path, "rb") as f:
    #         base64_data = base64.b64encode(f.read()).decode('utf-8')
    #         result = groq_search_product_by_image(base64_data)
    #         print(f"📊 FINAL RESULT: {result}")
    # else:
    #     print(f"⚠️ File not found: {image_path}")
    """)