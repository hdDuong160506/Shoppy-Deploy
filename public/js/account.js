document.addEventListener('DOMContentLoaded', () => {

    // Kiểm tra thư viện Supabase
    if (typeof supabase === 'undefined') {
        console.error("❌ Lỗi: Chưa load thư viện Supabase!");
        return;
    }

    // ============================================================
    // 1. HIỆU ỨNG UI SLIDE (GIỮ NGUYÊN THEO YÊU CẦU CỦA BẠN)
    // ============================================================
    const signUpButton = document.getElementById('signUp');
    const signInButton = document.getElementById('signIn');
    const container = document.getElementById('container');

    // Chuyển sang Đăng Ký
    if (signUpButton) {
        signUpButton.addEventListener('click', () => {
            container.classList.add("right-panel-active");
            document.querySelectorAll('.message').forEach(m => m.textContent = '');
        });
    }

    // Chuyển sang Đăng Nhập
    if (signInButton) {
        signInButton.addEventListener('click', () => {
            container.classList.remove("right-panel-active");
            document.querySelectorAll('.message').forEach(m => m.textContent = '');
        });
    }

    // ============================================================
    // 2. XỬ LÝ ĐĂNG KÝ (GỌI SERVER PYTHON CHECK EMAIL TRƯỚC)
    // ============================================================
    const registerForm = document.getElementById('register-form');
    
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('reg-name').value;
            const email = document.getElementById('reg-email').value.trim();
            const pwd = document.getElementById('reg-pwd').value;
            const msg = document.getElementById('register-message');
            const btn = e.submitter;

            msg.textContent = "⏳ Đang kiểm tra...";
            msg.className = "message";
            btn.disabled = true;

            try {
                // --- BƯỚC 1: GỌI API PYTHON CỦA BẠN ---
                // Server Python sẽ dùng Service Key để soi Database thật
                const res = await fetch('/api/user/check_email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email })
                });

                if (!res.ok) throw new Error("Lỗi kết nối Server Backend");
                const checkData = await res.json();

                if (checkData.exists) {
                    // ==> NẾU EMAIL ĐÃ CÓ: Chặn ngay lập tức
                    msg.innerHTML = "⛔ Email này đã tồn tại (hoặc đã dùng Google).<br>Vui lòng chuyển sang Đăng Nhập.";
                    msg.className = "message error";
                    btn.disabled = false;
                    return; // Dừng, không gọi Supabase
                }

                // --- BƯỚC 2: NẾU EMAIL SẠCH -> GỌI SUPABASE ---
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: pwd,
                    options: {
                        data: { name: name },
                        emailRedirectTo: window.location.origin + '/auth-callback.html'
                    }
                });

                if (error) {
                    msg.textContent = "❌ " + error.message;
                    msg.className = "message error";
                } else {
                    msg.innerHTML = `
                        <span style="color:green; font-weight:bold">✅ Đăng ký thành công!</span><br>
                        Vui lòng kiểm tra Email để kích hoạt.
                    `;
                    msg.className = "message success";

                    registerForm.reset();
                }

            } catch (err) {
                console.error(err);
                msg.textContent = "❌ Lỗi hệ thống: " + err.message;
                msg.className = "message error";
            } finally {
                btn.disabled = false;
            }
        });
    }

    // ============================================================
    // 3. XỬ LÝ ĐĂNG NHẬP (BÌNH THƯỜNG)
    // ============================================================
    const loginForm = document.getElementById('login-form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const pwd = document.getElementById('login-pwd').value;
            const msg = document.getElementById('login-message');
            const btn = e.submitter;

            msg.textContent = "⏳ Đang đăng nhập...";
            msg.className = "message";
            btn.disabled = true;

            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: pwd
            });

            if (error) {
                msg.textContent = "❌ Email hoặc mật khẩu không đúng.";
                msg.className = "message error";
                btn.disabled = false;
            } else {
                // SỬA CHỮA: Cập nhật thông báo và logic chuyển hướng
                msg.textContent = "✅ Đăng Nhập Thành công! Đang chuyển hướng...";
                msg.className = "message success";
                
                if (data.user) {
                    const userName = data.user.user_metadata.name || email.split('@')[0];
                    localStorage.setItem('userName', userName);
                }
                
                // 🎯 SỬA CHỮA: Kiểm tra và chuyển hướng về URL đã lưu (nếu có)
                const redirectUrl = localStorage.getItem('redirect_after_login') || 'index.html';
                localStorage.removeItem('redirect_after_login'); // Xóa URL đã lưu sau khi sử dụng
                
                setTimeout(() => window.location.href = redirectUrl, 1000);
            }
        });
    }

    // ============================================================
    // 4. XỬ LÝ SOCIAL LOGIN (GOOGLE & FACEBOOK)
    // CHỈ CHỌN NÚT TRONG FORM ĐĂNG NHẬP
    // ============================================================
    
    // Nút Google
    document.querySelectorAll('#login-form .google-login-link').forEach(btn => { // <--- ĐÃ CHỈNH SỬA SELECTOR
        btn.addEventListener('click', () => {
            supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin + '/auth-callback.html' }
            });
        });
    });

    // ============================================================
    // 5. XỬ LÝ QUÊN MẬT KHẨU (BỎ HẾT CÁC BƯỚC OTP)
    // ============================================================
    
    const forgotLink = document.getElementById('forgot-password-link');
    const modal = document.getElementById('modal-overlay');
    const closeModal = document.getElementById('close-modal');
    const forgotForm = document.getElementById('forgot-password-form');

    // Mở/Đóng Modal
    if (forgotLink) {
        forgotLink.addEventListener('click', (e) => { 
            e.preventDefault(); 
            modal.style.display = 'flex'; 
            document.getElementById('modal-title').textContent = "Đặt lại mật khẩu";
            document.getElementById('forgot-message').textContent = "";
            forgotForm.reset(); 
        });
    }
    if (closeModal) {
        closeModal.addEventListener('click', () => modal.style.display = 'none');
    }

    // Submit Form Quên Mật Khẩu (Chỉ còn bước nhập email và gửi link)
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const emailInput = document.getElementById('reset-email-phone-input'); 
            const msg = document.getElementById('forgot-message');
            const btn = e.submitter;

            const email = emailInput.value.trim();
            if (!email) {
                msg.textContent = "Vui lòng nhập email.";
                msg.className = "message error";
                return;
            }

            msg.textContent = "⏳ Đang kiểm tra tài khoản...";
            msg.className = "message";
            btn.disabled = true;

            try {
                // 1. GỌI API PYTHON ĐỂ KIỂM TRA
                const checkRes = await fetch('/api/user/check_email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email })
                });
                
                const data = await checkRes.json(); 
                // data trả về dạng: { "exists": true, "provider": "google" (hoặc "email") }

                // 2. LOGIC KIỂM TRA
                if (!data.exists) {
                    // Trường hợp 1: Email chưa tồn tại
                    msg.textContent = "❌ Email này chưa đăng ký tài khoản!";
                    msg.className = "message error";
                    btn.disabled = false;
                    return;
                }

                if (data.provider === 'google') {
                    // Trường hợp 2: Tài khoản Google -> CHẶN LUÔN
                    msg.innerHTML = "⛔ Tài khoản này dùng <b>Google Login</b>.<br>Bạn không cần đổi mật khẩu, hãy chọn nút 'Google' để đăng nhập.";
                    msg.className = "message error";
                    btn.disabled = false;
                    return; // Dừng lại, KHÔNG GỬI MAIL
                }

                // 3. NẾU LÀ EMAIL THƯỜNG -> GỌI SUPABASE GỬI MAIL
                msg.textContent = "⏳ Đang gửi email...";
                
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + '/reset-password.html'
                });

                if (error) {
                    msg.textContent = "❌ Lỗi: " + error.message;
                    msg.className = "message error";
                } else {
                    msg.textContent = "✅ Đã gửi link! Vui lòng kiểm tra hộp thư.";
                    msg.className = "message success";
                }

            } catch (err) {
                console.error("Lỗi quên mật khẩu:", err);
                msg.textContent = "❌ Lỗi hệ thống.";
                msg.className = "message error";
            } finally {
                btn.disabled = false;
            }
        });
    }

    // ============================================================
    // 6. ĐỒNG BỘ ĐĂNG NHẬP TỪ TAB KHÁC
    // ============================================================
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            const user = session.user;
            const name = user.user_metadata.name || user.email.split('@')[0];
            localStorage.setItem('userName', name);
            
            // 🎯 SỬA CHỮA: Kiểm tra và chuyển hướng về URL đã lưu (nếu có)
            const redirectUrl = localStorage.getItem('redirect_after_login') || 'index.html';
            localStorage.removeItem('redirect_after_login'); // Xóa URL đã lưu sau khi sử dụng

            setTimeout(() => window.location.href = redirectUrl, 500);
        }
    });

});