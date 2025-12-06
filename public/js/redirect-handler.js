// ======================================================================
// redirect-handler.js - XỬ LÝ REDIRECT SAU KHI ĐĂNG NHẬP
// ======================================================================

(function() {
    'use strict';

    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase chưa được khởi tạo');
        return;
    }

    // Lấy URL redirect (ưu tiên localStorage, fallback về index.html)
    const getRedirectUrl = () => {
        const savedUrl = localStorage.getItem('redirect_after_login');
        console.log('📍 Saved redirect URL:', savedUrl);
        return savedUrl || 'index.html';
    };

    // Lưu tên user vào localStorage
    const saveUserName = (session) => {
        if (session && session.user) {
            const name = session.user.user_metadata.name || session.user.email.split('@')[0];
            localStorage.setItem('userName', name);
            console.log('👤 Saved user name:', name);
        }
    };

    // Thực hiện redirect
    const performRedirect = (url, delay = 500) => {
        console.log('🔄 Redirecting to:', url);
        setTimeout(() => {
            window.location.href = url;
        }, delay);
    };

    // Lắng nghe sự kiện đăng nhập
    supabase.auth.onAuthStateChange((event, session) => {
        console.log('🔔 Auth State Changed:', event);

        if (event === 'SIGNED_IN' && session) {
            console.log('✅ Đăng nhập thành công!');
            
            // Lưu tên user
            saveUserName(session);

            // Lấy URL đích
            const redirectUrl = getRedirectUrl();
            
            // Xóa URL đã lưu
            localStorage.removeItem('redirect_after_login');
            
            // Redirect
            performRedirect(redirectUrl);
        }
    });

    console.log('✅ Redirect handler initialized');
})();