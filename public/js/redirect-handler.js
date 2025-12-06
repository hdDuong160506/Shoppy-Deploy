// ======================================================================
// redirect-handler.js - XỬ LÝ REDIRECT SAU KHI ĐĂNG NHẬP (FIXED)
// ======================================================================

(function() {
    'use strict';

    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase chưa được khởi tạo');
        return;
    }

    // 🎯 KIỂM TRA XEM ĐÃ XỬ LÝ REDIRECT CHƯA (TRÁNH CHẠY 2 LẦN)
    if (window._redirectHandlerInitialized) {
        console.log('⚠️ Redirect handler already initialized, skipping...');
        return;
    }
    window._redirectHandlerInitialized = true;

    // Lấy URL redirect (ưu tiên localStorage, fallback về index.html)
    const getRedirectUrl = () => {
        const savedUrl = localStorage.getItem('redirect_after_login');
        console.log('📍 Saved redirect URL:', savedUrl);
        
        // 🎯 NẾU KHÔNG CÓ URL LƯU -> RETURN NULL (KHÔNG REDIRECT)
        return savedUrl || null;
    };

    // Lưu tên user vào localStorage
    const saveUserName = async (session) => {
        if (session && session.user) {
            try {
                // Ưu tiên lấy từ database
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('name')
                    .eq('id', session.user.id) // 🎯 FIXED: BỎ "eq." TRONG QUERY
                    .single();

                const name = profile?.name || 
                            session.user.user_metadata?.name || 
                            session.user.email.split('@')[0];

                localStorage.setItem('userName', name);
                console.log('👤 Saved user name:', name);
            } catch (err) {
                console.error('⚠️ Error saving user name:', err);
                // Fallback
                const name = session.user.user_metadata?.name || session.user.email.split('@')[0];
                localStorage.setItem('userName', name);
            }
        }
    };

    // Thực hiện redirect
    const performRedirect = (url, delay = 1000) => {
        console.log('🔄 Redirecting to:', url);
        
        // 🎯 XÓA URL ĐÃ LƯU TRƯỚC KHI REDIRECT
        localStorage.removeItem('redirect_after_login');
        
        setTimeout(() => {
            window.location.href = url;
        }, delay);
    };

    // 🎯 BIẾN ĐẾM SỐ LẦN XỬ LÝ (TRÁNH LOOP VÔ HẠN)
    let authEventCount = 0;
    const MAX_AUTH_EVENTS = 3;

    // Lắng nghe sự kiện đăng nhập
    supabase.auth.onAuthStateChange(async (event, session) => {
        authEventCount++;
        
        if (authEventCount > MAX_AUTH_EVENTS) {
            console.warn('⚠️ Too many auth events, stopping...');
            return;
        }

        console.log(`🔔 Auth Event #${authEventCount}:`, event, 'Session:', !!session);

        // 🎯 CHỈ XỬ LÝ KHI EVENT LÀ 'SIGNED_IN' 
        if (event === 'SIGNED_IN' && session) {
            console.log('✅ Đăng nhập thành công!');
            
            // Lưu tên user
            await saveUserName(session);

            // Lấy URL đích
            const redirectUrl = getRedirectUrl();
            
            if (redirectUrl) {
                console.log('📍 Found redirect URL:', redirectUrl);
                performRedirect(redirectUrl, 500);
            } else {
                console.log('📍 No redirect URL found, staying on current page');
            }
        }
    });

    console.log('✅ Redirect handler initialized');
})();