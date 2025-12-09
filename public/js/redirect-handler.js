// ======================================================================
// redirect-handler.js - XỬ LÝ REDIRECT & ĐỒNG BỘ DỮ LIỆU SAU LOGIN
// ======================================================================

(function() {
    'use strict';

    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase chưa được khởi tạo');
        return;
    }

    if (window._redirectHandlerInitialized) {
        console.log('⚠️ Redirect handler already initialized, skipping...');
        return;
    }
    window._redirectHandlerInitialized = true;

    // 1. Hàm lấy URL redirect
    const getRedirectUrl = () => {
        const savedUrl = localStorage.getItem('redirect_after_login');
        return savedUrl || null;
    };

    // 2. Hàm lưu tên user (Giữ nguyên logic cũ)
    const saveUserName = async (session) => {
        if (!session?.user) return;
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('name')
                .eq('id', session.user.id)
                .single();

            const name = profile?.name || 
                         session.user.user_metadata?.name || 
                         session.user.email.split('@')[0];

            localStorage.setItem('userName', name);
            console.log('👤 Saved user name:', name);
        } catch (err) {
            const name = session.user.user_metadata?.name || session.user.email.split('@')[0];
            localStorage.setItem('userName', name);
        }
    };

    // --- 👇 TÍNH NĂNG MỚI: TẢI GIỎ HÀNG TỪ DB VỀ MÁY 👇 ---
    const loadCartFromDB = async (session) => {
        if (!session?.user) return;
        try {
            console.log("📥 Đang kiểm tra giỏ hàng trên Server...");
            const { data: dbCart, error } = await supabase
                .from('cart')
                .select('cart_data')
                .eq('user_id', session.user.id)
                .maybeSingle();

            if (!error && dbCart && dbCart.cart_data) {
                // Chỉ lưu nếu giỏ hàng có dữ liệu
                if (Object.keys(dbCart.cart_data).length > 0) {
                    localStorage.setItem('cart_v1', JSON.stringify(dbCart.cart_data));
                    console.log("💾 Đã đồng bộ giỏ hàng về máy:", dbCart.cart_data);
                }
            } else {
                console.log("ℹ️ Không có dữ liệu giỏ hàng cũ.");
            }
        } catch (err) {
            console.warn("⚠️ Lỗi nhẹ khi tải giỏ hàng (Bỏ qua):", err);
        }
    };
    // --- 👆 HẾT TÍNH NĂNG MỚI 👆 ---

    // 3. Hàm thực hiện Redirect
    const performRedirect = (url, delay = 500) => {
        console.log('🔄 Redirecting to:', url);
        localStorage.removeItem('redirect_after_login');
        setTimeout(() => {
            window.location.href = url;
        }, delay);
    };

    let authEventCount = 0;
    const MAX_AUTH_EVENTS = 3;

    // 4. LẮNG NGHE SỰ KIỆN ĐĂNG NHẬP (TRÁI TIM CỦA LOGIC)
    supabase.auth.onAuthStateChange(async (event, session) => {
        authEventCount++;
        if (authEventCount > MAX_AUTH_EVENTS) return;

        console.log(`🔔 Auth Event #${authEventCount}:`, event);

        // Chỉ xử lý khi ĐĂNG NHẬP THÀNH CÔNG
        if (event === 'SIGNED_IN' && session) {
            console.log('✅ Đăng nhập thành công! Bắt đầu đồng bộ dữ liệu...');
            
            // Dùng Promise.all để chạy song song cả 2 việc cho nhanh:
            // 1. Lưu tên hiển thị
            // 2. Tải giỏ hàng về
            await Promise.all([
                saveUserName(session),
                loadCartFromDB(session) // <--- Gọi hàm tải giỏ hàng ở đây
            ]);

            console.log('✅ Đồng bộ hoàn tất. Chuẩn bị chuyển trang.');

            // Sau khi đồng bộ xong xuôi mới Redirect
            const redirectUrl = getRedirectUrl();
            if (redirectUrl) {
                performRedirect(redirectUrl, 500);
            } else {
                console.log('📍 Không có URL đích, ở lại trang hiện tại (hoặc về trang chủ).');
                // Nếu muốn mặc định về trang chủ khi không có đích đến:
                // performRedirect('index.html', 500); 
            }
        }
    });

    console.log('✅ Redirect handler initialized');
})();