// File: supabase-init.js

// 1. Điền thông tin thật của bạn vào đây
const SUPABASE_URL = 'https://cbrjblrrnyejkeazgymq.supabase.co'; // Thay URL thật
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNicmpibHJybnllamtlYXpneW1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMjY4MzUsImV4cCI6MjA3OTcwMjgzNX0.101RFX2cc1eqkE0CIc-FraF1Mm69JRZ9oukOddwfnfw'; // Thay ANON KEY thật

// 2. Kiểm tra thư viện gốc đã tải chưa
if (typeof supabase === 'undefined') {
    console.error("❌ CRITICAL ERROR: Thư viện Supabase chưa được tải!");
    alert("Lỗi hệ thống: Không thể kết nối thư viện Supabase.");
} else {
    // 3. Khởi tạo Client
    // Lưu ý: Ta dùng 'supabase.createClient' từ thư viện gốc
    const _client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // 4. GHI ĐÈ biến toàn cục 'supabase' bằng client vừa tạo
    // Điều này giúp script1.js và script.js có thể gọi: supabase.auth.signUp(...)
    window.supabase = _client;

    console.log("✅ Supabase Init: Đã khởi tạo và ghi đè biến toàn cục thành công!");
}