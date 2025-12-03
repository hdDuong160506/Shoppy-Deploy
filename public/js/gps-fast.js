// File: static/js/gps-fast.js

(function() {
    // [DEBUG 1] Kiểm tra xem file này có được trình duyệt tải và chạy không
    console.log("🏁 [GPS-FAST] Script bắt đầu chạy...");

    // Kiểm tra và hỏi vị trí ngay lập tức
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const long = position.coords.longitude;

                // [DEBUG 2] Kiểm tra xem đã lấy được tọa độ chưa và giá trị là bao nhiêu
                console.log("📍 [GPS-FAST] Đã lấy được tọa độ:", lat, long);

                // Gửi ngầm về Server (Bơm vào Session)
                fetch('/api/set_location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat: lat, long: long })
                }).then(() => {
                    // (Tuỳ chọn) Đánh dấu là đã gửi xong để file script.js biết
                    window.gpsSent = true; 
                    console.log("✅ [GPS-FAST] Đã đồng bộ Session");
                });
            },
            (error) => {
                console.warn("⚠️ [GPS-FAST] Không lấy được vị trí sớm:", error.message);
            },
            // Timeout 5s để không bị treo request quá lâu
            { timeout: Infinity, maximumAge: 0 } 
        );
    } else {
        console.log("🚫 [GPS-FAST] Trình duyệt không hỗ trợ Geolocation");
    }
})();