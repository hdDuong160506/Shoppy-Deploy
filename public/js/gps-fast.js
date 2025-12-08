// File: static/js/gps-fast.js

(function() {
    // [DEBUG 1] Kiểm tra xem file này có được trình duyệt tải và chạy không
    console.log("🏁 [GPS-FAST] Script bắt đầu chạy...");

    // Hàm chung để gửi dữ liệu về server
    const sendLocation = (lat, long) => {
        // Gửi ngầm về Server (Bơm vào Session)
        fetch('/api/set_location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Sử dụng lat và long, nếu là null/undefined sẽ được gửi là null trong JSON
            body: JSON.stringify({ lat: lat, long: long })
        }).then(() => {
            // (Tuỳ chọn) Đánh dấu là đã gửi xong để file index.js biết
            window.gpsSent = true; 
            console.log("✅ [GPS-FAST] Đã đồng bộ Session");
            // BẮN TÍN HIỆU
            window.dispatchEvent(new Event('location_updated'));
        }).catch(err => {
            console.error("❌ [GPS-FAST] Lỗi khi gửi dữ liệu lên server:", err);
        });
    };

    // Kiểm tra và hỏi vị trí ngay lập tức
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            // ✅ SUCCESS CALLBACK
            (position) => {
                const lat = position.coords.latitude;
                const long = position.coords.longitude;

                // [DEBUG 2] Kiểm tra xem đã lấy được tọa độ chưa và giá trị là bao nhiêu
                console.log("📍 [GPS-FAST] Đã lấy được tọa độ:", lat, long);
                
                sendLocation(lat, long); // Gửi tọa độ thành công
            },
            // ❌ ERROR CALLBACK: Xử lý khi không lấy được vị trí
            (error) => {
                console.warn("⚠️ [GPS-FAST] Không lấy được vị trí sớm:", error.message);
                
                // Gửi giá trị null/None về server
                sendLocation(null, null);
                
            },
            // Timeout 5s để không bị treo request quá lâu
            { timeout: 5000, maximumAge: 0 } 
        );
    } else {
        console.log("🚫 [GPS-FAST] Trình duyệt không hỗ trợ Geolocation");
        // Gửi giá trị null/None về server nếu trình duyệt không hỗ trợ
        sendLocation(null, null);
    }
})();