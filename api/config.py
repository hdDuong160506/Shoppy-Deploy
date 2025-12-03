import os
from dotenv import load_dotenv

# Load file .env từ thư mục gốc (backend/)
load_dotenv()

class Config:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-key")