// File: profile.js

// === HÀM XỬ LÝ CUSTOM MODAL ===
function showCustomConfirm(message) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-confirm-modal');
        const messageElement = modal.querySelector('#modal-message');
        const yesButton = modal.querySelector('#modal-confirm-yes');
        const noButton = modal.querySelector('#modal-confirm-no');
        
        messageElement.textContent = message;
        modal.style.display = 'flex';

        const handleYes = () => {
            modal.style.display = 'none';
            removeListeners();
            resolve(true); // Trả về true (Đồng ý)
        };

        const handleNo = () => {
            modal.style.display = 'none';
            removeListeners();
            resolve(false); // Trả về false (Hủy)
        };

        // Gắn sự kiện (đảm bảo chỉ gắn một lần)
        yesButton.addEventListener('click', handleYes, { once: true });
        noButton.addEventListener('click', handleNo, { once: true });

        // Hàm gỡ bỏ listeners dự phòng
        const removeListeners = () => {
            yesButton.removeEventListener('click', handleYes);
            noButton.removeEventListener('click', handleNo);
        };
    });
}
// === END: HÀM XỬ LÝ CUSTOM MODAL ===


document.addEventListener('DOMContentLoaded', async () => {

    // Kiểm tra Supabase và User
    if (typeof supabase === 'undefined') {
        console.error("❌ Lỗi: Thư viện Supabase chưa được tải.");
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        alert("Bạn cần đăng nhập để xem trang này.");
        window.location.href = 'account.html';
        return;
    }

    const profileForm = document.getElementById('profile-form');
    const profileMessage = document.getElementById('profile-message');
    const nameInput = document.getElementById('profile-name');
    const changePassBtn = document.getElementById('change-password-btn');
    
    loadUserProfile(user);

    // ============================================================
    // 2. XỬ LÝ CẬP NHẬT PROFILE
    // ============================================================
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const newName = nameInput.value.trim();
        const submitBtn = e.submitter;

        profileMessage.textContent = "⏳ Đang cập nhật...";
        profileMessage.className = "profile-message";
        submitBtn.disabled = true;

        try {
            const { data, error } = await supabase.auth.updateUser({
                data: { name: newName }
            });

            if (error) throw new Error(error.message);

            localStorage.setItem('userName', newName);

            const { error: dbError } = await supabase
                .from('profiles')
                .update({ name: newName, updated_at: new Date() })
                .eq('id', user.id);
            
            if (dbError) {
                console.error("Lỗi cập nhật bảng profiles:", dbError.message);
            }

            profileMessage.textContent = "✅ Cập nhật profile thành công!";
            profileMessage.className = "profile-message success";

        } catch (err) {
            console.error("Lỗi cập nhật profile:", err);
            profileMessage.textContent = "❌ Lỗi: " + err.message;
            profileMessage.className = "profile-message error";
        } finally {
            submitBtn.disabled = false;
        }
    });

    // ============================================================
    // 3. XỬ LÝ ĐỔI MẬT KHẨU (ĐÃ SỬA: CHẶN GOOGLE LOGIN)
    // ============================================================
    changePassBtn.addEventListener('click', async () => {
        
        // Reset thông báo cũ
        profileMessage.textContent = "";
        profileMessage.className = "profile-message";
        changePassBtn.disabled = true;

        try {
            // --- BƯỚC 1: KIỂM TRA LOẠI TÀI KHOẢN (GỌI API PYTHON) ---
            const checkRes = await fetch('/api/user/check_email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email })
            });
            
            const checkData = await checkRes.json();
            
            // Nếu là Google -> CHẶN
            if (checkData.exists && checkData.provider === 'google') {
                profileMessage.innerHTML = "⛔ Tài khoản này đăng nhập bằng <b>Google</b>.<br>Bạn không cần đổi mật khẩu.";
                profileMessage.className = "profile-message error";
                changePassBtn.disabled = false;
                return; // Dừng lại ngay
            }

            // --- BƯỚC 2: NẾU LÀ EMAIL THƯỜNG -> HIỆN POPUP XÁC NHẬN ---
            // Chỉ hiện popup khi đã chắc chắn là user thường
            const confirmChange = await showCustomConfirm("Bạn có chắc muốn đổi mật khẩu? Chúng tôi sẽ gửi link đến email của bạn.");
            
            if (!confirmChange) {
                changePassBtn.disabled = false;
                return;
            }

            profileMessage.textContent = "⏳ Đang gửi email đặt lại mật khẩu...";
            profileMessage.className = "profile-message";

            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                redirectTo: window.location.origin + '/reset-password.html' 
            });

            if (error) {
                profileMessage.textContent = "❌ Lỗi gửi email: " + error.message;
                profileMessage.className = "profile-message error";
            } else {
                profileMessage.textContent = "✅ Đã gửi link! Vui lòng kiểm tra hộp thư để đổi mật khẩu.";
                profileMessage.className = "profile-message success";
            }

        } catch (err) {
            console.error("Lỗi check user:", err);
            profileMessage.textContent = "❌ Lỗi hệ thống khi kiểm tra tài khoản.";
            profileMessage.className = "profile-message error";
        } finally {
            changePassBtn.disabled = false;
        }
    });

    // ============================================================
    // 4. XỬ LÝ ĐĂNG XUẤT (SỬ DỤNG CUSTOM MODAL)
    // ============================================================
    document.getElementById('logout-link').addEventListener('click', async (e) => {
        e.preventDefault();
        
        const confirmLogout = await showCustomConfirm("Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này không?"); 
        if (!confirmLogout) return;
        
        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error("Lỗi Đăng xuất:", error.message);
            alert("Đăng xuất thất bại!");
        } else {
            localStorage.removeItem('userName');
            window.location.href = 'account.html';
        }
    });
});

// --- HÀM LOAD DỮ LIỆU VÀO FORM ---
async function loadUserProfile(user) { 
    const defaultName = user.email.split('@')[0];
    let displayName = defaultName;
    
    // 1. Lấy tên từ profiles table (ưu tiên)
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single();
        
    if (profile && profile.name) {
        displayName = profile.name;
    } 
    // 2. Nếu không có trong profiles, lấy từ user_metadata
    else if (user.user_metadata.name) {
        displayName = user.user_metadata.name;
    }

    document.getElementById('profile-email').value = user.email;
    document.getElementById('profile-name').value = displayName; 

    const createdAt = new Date(user.created_at);
    document.getElementById('profile-created').value = createdAt.toLocaleDateString('vi-VN');
}