// ======================================================================
// CẤU HÌNH & KHỞI TẠO (CHECKLIST MERGE)
// ======================================================================
const API_BASE = '';
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

// Lấy client Supabase từ window (đã init ở file supabase-init.js hoặc CDN)
const supabaseClient = window.supabase;

// State toàn cục
let cart = JSON.parse(localStorage.getItem('cart_v1') || '{}');
let CART_CACHE = {};
let currentProduct = null;
let currentQuantity = 1;
let currentPsId = null;
let currentRecognition = null; // Voice search

// State cho Image Search
let currentImageData = null;
let currentTab = 'upload';

// ======================================================================
// 2. CÁC HÀM TIỆN ÍCH (UTILS)
// ======================================================================
function formatMoney(n) {
    if (typeof n !== 'number') return '0₫';
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + '₫';
}

function saveCart() {
    localStorage.setItem('cart_v1', JSON.stringify(cart));
    updateCartUI();
    fetchCartDetails(); // THÊM: Cập nhật cache
}

// HÀM QUẢN LÝ LOADING OVERLAY (THÊM MỚI)
function showLoading() {
    const loading = $('#full-page-loading');
    if (loading) loading.style.display = 'flex';
}

function hideLoading() {
    const loading = $('#full-page-loading');
    if (loading) loading.style.display = 'none';
}

// HÀM HIỂN THỊ THÔNG BÁO CUSTOM (THAY THẾ ALERT)
let notificationTimeout;
function showNotification(message, icon = '✅') {
    const toast = $('#notification-toast');
    const msgEl = $('#toast-message');
    const iconEl = $('.toast-icon');

    if (!toast || !msgEl || !iconEl) {
        // Fallback nếu không tìm thấy HTML
        return alert(message);
    }

    // 1. Cập nhật nội dung
    msgEl.textContent = message;
    iconEl.textContent = icon;
    
    // 2. Xóa timeout cũ nếu đang chạy
    clearTimeout(notificationTimeout);

    // 3. Hiển thị
    toast.classList.remove('show'); // Reset animation
    void toast.offsetWidth; // Force reflow/repaint
    toast.classList.add('show');
    
    // 4. Tự động ẩn sau 3 giây (thời gian tương đương animation fadeout)
    notificationTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000); 
}

// Hàm kiểm tra đăng nhập và chuyển hướng (KHÔNG HIỂN THỊ POP-UP)
async function checkLoginAndRedirect(message = "Chuyển hướng đến trang đăng nhập...") {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        // Ghi log vào console (KHÔNG HIỂN THỊ BẤT KỲ GIAO DIỆN NÀO)
        console.log(message); 
        
        // 🎯 SỬA CHỮA: LƯU URL HIỆN TẠI VÀO LOCALSTORAGE TRƯỚC KHI CHUYỂN TRANG
        localStorage.setItem('redirect_after_login', window.location.href); 
        
        // Kích hoạt hiệu ứng chuyển trang và chuyển hướng
        document.body.classList.add('page-fade-out');
        setTimeout(() => {
            window.location.href = 'account.html'; 
        }, 500);
        return false;
    }
    return user;
}

// Update Account Link with User Info
async function updateAccountLink() {
    const accountLink = document.getElementById('account-link');
    const logoutLink = document.getElementById('logout-link');

    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();
    let finalName = localStorage.getItem('userName'); // Ưu tiên dùng local cache

    if (session && session.user && !finalName) {
        // Nếu chưa có tên trong cache (hoặc mới đăng nhập) -> Fetch từ DB (Tương tự script.js)
        const {
            data: profile
        } = await supabaseClient.from('profiles').select('name').eq('id', session.user.id).single();

        if (profile && profile.name) {
            finalName = profile.name;
        } else {
            finalName = session.user.user_metadata.name || session.user.email.split('@')[0];
        }
        localStorage.setItem('userName', finalName);
    } else if (!session) {
        localStorage.removeItem('userName');
        finalName = null;
    }

    // Cập nhật giao diện Header
    if (finalName && accountLink) {
        accountLink.innerHTML = `👋 Chào, <b>${finalName}</b>`;
        accountLink.href = 'profile.html';
        if (logoutLink) {
            logoutLink.style.display = 'flex';
            // Gắn sự kiện đăng xuất
            logoutLink.onclick = async () => {
                if (confirm("Bạn có chắc chắn muốn đăng xuất không?")) {
                    await handleLogout();
                }
            };
        }
    } else if (accountLink) {
        accountLink.textContent = 'Tài Khoản';
        accountLink.href = 'account.html';
        if (logoutLink) logoutLink.style.display = 'none';
    }
}

// Logic Đăng Xuất (ĐÃ CẬP NHẬT: Tải lại trang)
window.handleLogout = async function() {
    try {
        const {
            error
        } = await supabaseClient.auth.signOut();
        if (error) throw error;

        localStorage.removeItem('accessToken');
        localStorage.removeItem('userName');
        localStorage.removeItem('cart_v1');
        // 🎯 LƯU URL HIỆN TẠI ĐỂ SAU KHI ĐĂNG NHẬP LẠI (TỪ account.html) SẼ TRỞ VỀ ĐÂY
        localStorage.setItem('redirect_after_login', window.location.href);

        // Cập nhật: Tải lại trang hiện tại (product-detail.html)
        window.location.reload(); 

    } catch (err) {
        console.error("Lỗi đăng xuất:", err);
        alert("Đăng xuất thất bại. Vui lòng thử lại.");
    }
};


// ======================================================================
// 3. LOGIC SẢN PHẨM & GIỎ HÀNG
// ======================================================================

// Tải thông tin chi tiết sản phẩm (ĐÃ THÊM LOADING VÀ ĐỘ TRỄ 1S)
async function loadMainProduct() {
    const params = new URLSearchParams(window.location.search);
    const product_id = params.get('product_id');
    const store_id = params.get('store_id');

    if (!product_id || !store_id) {
        if ($('.product-container')) $('.product-container').innerHTML = '<h2 style="padding:20px">Thiếu thông tin sản phẩm</h2>';
        return;
    }

    const key = `${product_id}_${store_id}`;
    
    showLoading(); // HIỂN THỊ LOADING

    try {
        // Gọi API Backend lấy chi tiết
        const res = await fetch('/api/cart/details', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                cart: {
                    [key]: 1
                }
            })
        });

        if (res.ok) {
            const data = await res.json();
            const productData = data[key];

            if (!productData) {
                $('.product-container').innerHTML = '<h2 style="padding:20px">Sản phẩm không tồn tại</h2>';
                return;
            }

            const storeInfo = productData.stores[0];

            // Lấy dữ liệu rating sơ bộ
            const ratingVal = storeInfo.ps_average_rating || storeInfo.average_rating || 0;
            const reviewCountVal = storeInfo.ps_total_reviews || storeInfo.total_reviews || 0;

            currentProduct = {
                id: key,
                product_id: productData.product_id,
                store_id: storeInfo.store_id,
                name: storeInfo.store_name,
                sub_name: productData.product_name,
                address: storeInfo.store_address,
                // Ưu tiên ps_min_price_store nếu có, nếu không thì dùng cost
                price: storeInfo.ps_min_price_store || storeInfo.cost || 0,
                // SỬA LỖI CÚ PHÁP: Bỏ dấu chấm thừa sau `?`
                img: storeInfo.product_images?.[0]?.ps_image_url || productData.product_image_url,
                description: productData.product_des || "Đang cập nhật...",
                ps_id: storeInfo.ps_id
            };

            // Render UI
            if ($('#product-name')) $('#product-name').textContent = currentProduct.sub_name;
            if (document.getElementById('product-subtitle')) document.getElementById('product-subtitle').innerHTML = `<div><strong>Cửa hàng:</strong> ${currentProduct.name}</div><div style="color: #777;">📍 ${currentProduct.address}</div>`;
            if ($('#product-price')) $('#product-price').textContent = formatMoney(currentProduct.price);
            if ($('#product-image-main')) $('#product-image-main').src = currentProduct.img;
            if ($('#product-description')) $('#product-description').textContent = currentProduct.description;

            // Render Rating Header lần 1
            updateReviewHeader(ratingVal, reviewCountVal);

            const crumb = document.getElementById('breadcrumb-summary-link');
            if (crumb) crumb.innerHTML = `<a href="product-summary.html?product_id=${product_id}">${currentProduct.sub_name}</a>`;

            // QUAN TRỌNG: Trigger tải đánh giá ngay khi có ps_id
            if (currentProduct.ps_id) {
                currentPsId = currentProduct.ps_id;
                loadReviews(currentPsId);
            } else {
                findPsIdAndLoadReviews(currentProduct.product_id, currentProduct.store_id);
            }
        }
    } catch (e) {
        console.error("Lỗi loadMainProduct:", e);
    } finally {
        // === ĐỘ TRỄ ĐƯỢC ĐIỀU CHỈNH THÀNH 1 GIÂY (1000ms) ===
        await new Promise(resolve => setTimeout(resolve, 1000));
        // =======================================================
        hideLoading(); // ẨN LOADING
    }
}

// Đồng bộ giỏ hàng
async function fetchCartDetails() {
    const cartKeys = Object.keys(cart);
    if (cartKeys.length === 0) {
        CART_CACHE = {};
        updateCartUI();
        return;
    }

    const cartToFetch = {};
    cartKeys.forEach(key => {
        if (!CART_CACHE[key]) {
            cartToFetch[key] = cart[key];
        }
    });

    if (Object.keys(cartToFetch).length === 0) return;

    try {
        const res = await fetch('/api/cart/details', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                cart: cartToFetch
            })
        });
        if (res.ok) {
            const newCache = await res.json();
            CART_CACHE = { ...CART_CACHE,
                ...newCache
            };
            updateCartUI();
        }
    } catch (err) {
        console.error("Lỗi fetchCartDetails:", err);
    }
}

// UI Giỏ hàng với Skeleton Loading
function updateCartUI() {
    const cartList = $('#cart-list');
    const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
    let total = 0;

    const bubble = $('#cart-count');
    if (bubble) {
        bubble.textContent = cartCount;
        bubble.style.display = cartCount > 0 ? 'block' : 'none';
    }

    if (!cartList) return;

    cartList.innerHTML = '';
    if (cartCount === 0) {
        cartList.innerHTML = '<div style="color:#888; text-align:center; padding:10px;">Giỏ hàng trống</div>';
        if ($('#cart-total')) $('#cart-total').textContent = formatMoney(0);
        return;
    }

    Object.entries(cart).forEach(([key, qty]) => {
        const details = CART_CACHE[key];

        if (details) {
            const storeInfo = details.stores[0];
            // Lấy giá ưu tiên từ ps_min_price_store, nếu không có thì dùng cost
            const price = storeInfo.ps_min_price_store || storeInfo.cost || 0;
            total += price * qty;

            // SỬA LỖI CÚ PHÁP: Bỏ dấu chấm thừa sau `?`
            let imgUrl = storeInfo.product_images?.[0]?.ps_image_url || details.product_image_url;

            const item = document.createElement('div');
            item.className = 'cart-item';
            item.innerHTML = `
                <img src="${imgUrl}" onerror="this.src='images/placeholder.jpg'" />
                <div style="flex:1">
                    <div style="font-weight:500; font-size:14px;">${details.product_name}</div>
                    <div style="font-size:12px;color:#666">${storeInfo.store_name}</div>
                    <div style="font-size:13px;color:#333">${formatMoney(price)} x ${qty}</div>
                </div>
                <div class="qty">
                     <button class="small-btn" onclick="changeQty('${key}', -1)">-</button>
                     <div style="min-width:20px; text-align:center">${qty}</div>
                     <button class="small-btn" onclick="changeQty('${key}', 1)">+</button>
                     <button class="small-btn" style="margin-left:6px; color:red;" onclick="removeItem('${key}')">x</button>
                </div>
            `;
            cartList.appendChild(item);
        } else {
            // Skeleton Loading
            const item = document.createElement('div');
            item.className = 'cart-item';
            item.innerHTML = `
                <div style="display:flex; align-items:center; padding:10px; width:100%">
                    <div style="width:50px; height:50px; background:#eee; margin-right:10px; border-radius:4px;"></div>
                    <div style="flex:1">
                        <div style="height:14px; background:#eee; width:80%; margin-bottom:5px;"></div>
                        <div style="height:12px; background:#eee; width:50%;"></div>
                    </div>
                </div>`;
            cartList.appendChild(item);
            // Kích hoạt fetch details nếu item chưa có trong cache
            fetchCartDetails();
        }
    });

    if ($('#cart-total')) $('#cart-total').textContent = formatMoney(total);
}

// Thêm vào giỏ hàng (ĐÃ CẬP NHẬT LOGIC KIỂM TRA ĐĂNG NHẬP và DÙNG NOTIFICATION)
window.addToCart = async function(productId, storeId, qty) {
    const user = await checkLoginAndRedirect("Chưa đăng nhập. Chuyển hướng để thêm sản phẩm vào giỏ hàng.");
    if (!user) return; 

    // Logic thêm vào giỏ hàng khi đã đăng nhập
    const key = `${productId}_${storeId}`;
    cart[key] = (cart[key] || 0) + parseInt(qty);
    saveCart();

    // Optimistic cache update
    if (currentProduct && currentProduct.id === key && !CART_CACHE[key]) {
        CART_CACHE[key] = {
            product_name: currentProduct.sub_name,
            product_image_url: currentProduct.img,
            stores: [{
                store_name: currentProduct.name,
                ps_min_price_store: currentProduct.price,
                product_images: [{
                    ps_image_url: currentProduct.img
                }]
            }]
        };
    }
    updateCartUI();
    // THAY THẾ ALERT BẰNG CUSTOM NOTIFICATION
    showNotification('Đã thêm vào giỏ hàng thành công!', '✅'); 
}

// Mua ngay (ĐÃ CẬP NHẬT LOGIC KIỂM TRA ĐĂNG NHẬP)
window.buyNow = async function() {
    const user = await checkLoginAndRedirect("Chưa đăng nhập. Chuyển hướng để mua hàng ngay.");
    if (!user) return; 
    
    // Logic mua ngay khi đã đăng nhập
    if (currentProduct) {
        const key = `${currentProduct.product_id}_${currentProduct.store_id}`;
        cart[key] = (cart[key] || 0) + currentQuantity;
        saveCart(); 
        
        document.body.classList.add('page-fade-out');
        setTimeout(() => {
            window.location.href = 'cart.html';
        }, 500);
    }
}


// ======================================================================
// 4. LOGIC XỬ LÝ REVIEWS
// ======================================================================

async function findPsIdAndLoadReviews(productId, storeId) {
    if (!supabaseClient) return;
    const {
        data
    } = await supabaseClient.from('product_store').select('ps_id').eq('product_id', productId).eq('store_id', storeId).single();
    if (data) {
        currentPsId = data.ps_id;
        loadReviews(currentPsId);
    }
}

async function loadReviews(psId) {
    if (!psId || !supabaseClient) return;

    // Check Login UI
    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();
    const formContainer = $('#review-form-container');
    const loginPrompt = $('#login-prompt');

    if (formContainer && loginPrompt) {
        if (session) {
            formContainer.style.display = 'block';
            loginPrompt.style.display = 'none';
        } else {
            formContainer.style.display = 'none';
            loginPrompt.style.display = 'block';
        }
    }

    // Lấy Reviews
    const listEl = $('#reviews-list');
    if (listEl) listEl.innerHTML = '<p style="color:#999; padding:10px">Đang tải đánh giá...</p>';

    const {
        data: reviews,
        error
    } = await supabaseClient
        .from('reviews')
        .select('*')
        .eq('ps_id', psId)
        .order('created_at', {
            ascending: false
        });

    if (error) {
        console.error("Lỗi tải review:", error);
        if (listEl) listEl.innerHTML = '<p style="color:red">Không thể tải đánh giá.</p>';
        return;
    }

    // Update Header
    if (reviews && reviews.length > 0) {
        const count = reviews.length;
        const sumRating = reviews.reduce((acc, curr) => acc + (curr.rating || 0), 0);
        const avgRating = sumRating / count;
        updateReviewHeader(avgRating, count);
    } else {
        updateReviewHeader(0, 0);
    }

    if (!listEl) return;
    listEl.innerHTML = '';

    if (!reviews || reviews.length === 0) {
        listEl.innerHTML = '<p style="color:#777; font-style: italic;">Chưa có đánh giá nào.</p>';
        return;
    }

    // Lấy thông tin User
    const userIds = [...new Set(reviews.map(r => r.user_id))];
    const {
        data: profiles
    } = await supabaseClient
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', userIds);

    const profileMap = {};
    if (profiles) profiles.forEach(p => profileMap[p.id] = p);

    reviews.forEach(r => {
        const user = profileMap[r.user_id] || {
            name: 'Người dùng ẩn danh',
            avatar_url: null
        };
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) starsHtml += `<span style="color:${i <= r.rating ? '#ffc107' : '#ddd'}">★</span>`;

        const date = new Date(r.created_at).toLocaleDateString('vi-VN');
        const avatarHtml = user.avatar_url ?
            `<img src="${user.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` :
            `<div style="width:100%;height:100%;background:#ccc;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;border-radius:50%">${user.name ? user.name.charAt(0).toUpperCase() : 'U'}</div>`;

        const item = document.createElement('div');
        item.className = 'review-item';
        item.innerHTML = `
            <div class="review-avatar" style="width:40px;height:40px;">${avatarHtml}</div>
            <div class="review-content">
                <h4 style="margin:0;font-size:14px;">${user.name}</h4>
                <div class="stars" style="font-size:12px;">${starsHtml}</div>
                <p style="margin:5px 0;font-size:14px;">${r.comment || ''}</p>
                <div class="date" style="font-size:12px;color:#999;">${date}</div>
            </div>
        `;
        listEl.appendChild(item);
    });
}

function updateReviewHeader(rating, count) {
    const statsEl = document.getElementById('review-stats');
    if (!statsEl) return;

    if (count > 0) {
        const ratingFixed = Number(rating).toFixed(1);
        statsEl.innerHTML = `
            <span style="color:#ffc107; font-size:1.3em;">★</span>
            <b style="color:#333; font-size:1.1em; margin-left: 4px;">${ratingFixed}/5</b>
            <span style="color:#666; font-size:0.95em; margin-left:8px;">(${count} đánh giá)</span>
        `;
    } else {
        statsEl.innerHTML = `<span style="color:#999; font-style:italic; font-size:0.9em">(Chưa có đánh giá)</span>`;
    }
}

async function submitReview() {
    if (!currentPsId) {
        alert("Lỗi: Không tìm thấy mã sản phẩm.");
        return;
    }
    if (!supabaseClient) return;

    // Check Login (KHÔNG HIỂN THỊ POPUP)
    const user = await checkLoginAndRedirect("Chưa đăng nhập. Chuyển hướng để gửi đánh giá.");
    if (!user) return;

    const ratingEl = document.querySelector('input[name="rating"]:checked');
    const commentInput = $('#review-comment');
    const comment = commentInput ? commentInput.value.trim() : '';

    if (!ratingEl) {
        alert("Vui lòng chọn số sao!");
        return;
    }

    const btn = $('#btn-submit-review');
    btn.textContent = "Đang gửi...";
    btn.disabled = true;

    try {
        const {
            error
        } = await supabaseClient
            .from('reviews')
            .insert([{
                ps_id: currentPsId,
                user_id: user.id,
                rating: parseInt(ratingEl.value),
                comment: comment
            }]);

        if (error) throw error;

        alert("Cảm ơn bạn đã đánh giá!");
        commentInput.value = '';
        if (ratingEl) ratingEl.checked = false;

        loadReviews(currentPsId);

    } catch (err) {
        alert("Gửi thất bại: " + err.message);
    } finally {
        btn.textContent = "Gửi đánh giá";
        btn.disabled = false;
    }
}

// ======================================================================
// 5. LOGIC VOICE SEARCH
// ======================================================================

// Bắt đầu ghi âm
window.startVoiceSearch = function() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
        alert("Trình duyệt không hỗ trợ tìm kiếm bằng giọng nói! Hãy thử Chrome.");
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    if (currentRecognition) {
        currentRecognition.stop();
    }

    currentRecognition = recognition;

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "vi-VN";

    const popup = $('#voice_popup');
    const transcriptDisplay = $('#transcript_display');
    transcriptDisplay.textContent = "Đang nghe...";
    popup.style.display = "flex";

    recognition.onstart = function() {
        transcriptDisplay.textContent = "Đang nghe... Hãy nói gì đó!";
    };

    recognition.onresult = function(event) {
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;

            if (event.results[i].isFinal)
                finalTranscript += transcript;
        }

        transcriptDisplay.textContent = finalTranscript || "Đang nghe...";

        // Nếu có kết quả cuối → Chuyển về trang chủ và tìm kiếm
        if (finalTranscript) {
            $('#search_input').value = finalTranscript;

            setTimeout(() => {
                popup.style.display = "none";
                recognition.stop();

                // Chuyển hướng về index.html với từ khóa tìm kiếm
                document.body.classList.add('page-fade-out');
                setTimeout(() => {
                    window.location.href = `index.html?search=${encodeURIComponent(finalTranscript)}`;
                }, 500);

            }, 200);
        }
    };

    recognition.onerror = function(event) {
        console.error("Lỗi nhận diện:", event.error);

        let msg = "Lỗi: ";
        if (event.error === "not-allowed")
            msg += "Bạn chưa cấp quyền micro!";
        else if (event.error === "no-speech")
            msg += "Không phát hiện giọng nói!";
        else
            msg += event.error;

        $('#transcript_display').textContent = msg;

        setTimeout(() => {
            popup.style.display = "none";
        }, 200);
    };

    recognition.onend = function() {
        currentRecognition = null;

        if ($('#transcript_display').textContent === "Đang nghe...") {
            setTimeout(() => popup.style.display = "none", 200);
        }
    };

    try {
        recognition.start();
    } catch (error) {
        console.error("Không thể start recognition:", error);
        popup.style.display = "none";
        alert("Không thể bật giọng nói!");
    }
}

// Hủy ghi âm
window.cancelVoiceSearch = function() {
    if (currentRecognition) currentRecognition.abort();
    $('#voice_popup').style.display = "none";
}

// ======================================================================
// 6. LOGIC IMAGE SEARCH (TÍCH HỢP TỪ script.js)
// ======================================================================

// Mở popup tìm kiếm bằng hình ảnh
window.openImageSearch = function() {
    const popup = document.getElementById('image_search_popup');
    popup.classList.add('active');
    popup.style.display = 'flex';

    // Reset về tab upload
    switchImageTab('upload');
    clearAllImages();
}

// Đóng popup
window.closeImageSearch = function() {
    const popup = document.getElementById('image_search_popup');
    popup.classList.remove('active');
    setTimeout(() => {
        popup.style.display = 'none';
    }, 200);

    clearAllImages();
    hideError();
}

// Chuyển tab
window.switchImageTab = function(tabName) {
    currentTab = tabName;

    document.querySelectorAll('.tab-button').forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    const activePanel = document.getElementById(`${tabName}-tab`);
    if (activePanel) {
        activePanel.classList.add('active');
    }

    hideError();
}

// Setup upload area
function setupImageUpload() {
    const uploadArea = document.getElementById('imageUploadArea');
    const fileInput = document.getElementById('imageFileInput');

    if (!uploadArea || !fileInput) return;

    // Click to upload
    document.getElementById('browseBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageFile(file);
        }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleImageFile(file);
        } else {
            showError('Vui lòng chọn file ảnh hợp lệ');
        }
    });

    // Tự động tải ảnh khi paste hoặc nhập vào ô URL/Base64
    const pasteInput = document.getElementById('imagePasteInput');
    if (pasteInput) {
        pasteInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();

            if (!value) {
                clearPasteImage();
                hideError();
                return;
            }

            clearTimeout(pasteInput.debounceTimer);
            pasteInput.debounceTimer = setTimeout(() => {
                loadPastedImage();
            }, 0);
        });

        pasteInput.addEventListener('paste', (e) => {
            const items = e.clipboardData.items;

            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    const reader = new FileReader();

                    reader.onload = () => {
                        currentImageData = reader.result;
                        showImagePreview(currentImageData, 'paste');
                        hideError();
                    };

                    reader.readAsDataURL(blob);
                    e.preventDefault();
                    return;
                }
            }
        });
    }
}

// Xử lý file ảnh
function handleImageFile(file) {
    if (file.size > 5 * 1024 * 1024) {
        showError('Kích thước ảnh vượt quá 5MB');
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
        currentImageData = e.target.result;
        showImagePreview(currentImageData, 'upload');
        hideError();
    };

    reader.onerror = () => {
        showError('Không thể đọc file ảnh');
    };

    reader.readAsDataURL(file);
}

// Tải ảnh từ paste
function loadPastedImage() {
    const input = document.getElementById('imagePasteInput');
    const value = input.value.trim();

    if (!value) {
        clearPasteImage();
        return;
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
        try {
            new URL(value);
            currentImageData = value;
            showImagePreview(value, 'paste');
            hideError();
        } catch (e) {
            showError('URL không hợp lệ');
        }
    } else if (value.startsWith('data:image/')) {
        currentImageData = value;
        showImagePreview(value, 'paste');
        hideError();
    } else if (value.length > 100) {
        try {
            atob(value);
            currentImageData = `data:image/jpeg;base64,${value}`;
            showImagePreview(currentImageData, 'paste');
            hideError();
        } catch (e) {
            showError('Base64 không hợp lệ');
        }
    }
}

// Hiển thị preview ảnh
function showImagePreview(imageData, tab) {
    if (tab === 'upload') {
        const preview = document.getElementById('imagePreview');
        const container = document.getElementById('uploadPreviewContainer');

        if (preview) {
            preview.src = imageData;
            preview.style.display = 'block';
            if (container) container.style.display = 'block';

            const uploadArea = document.getElementById('imageUploadArea');
            if (uploadArea) uploadArea.style.display = 'none';
        }

    } else {
        const preview = document.getElementById('pastePreview');
        const container = document.getElementById('pastePreviewContainer');

        if (preview) {
            preview.src = imageData;
            preview.style.display = 'block';
            if (container) container.style.display = 'block';
        }
    }
}

// Xóa ảnh upload
window.clearUploadImage = function() {
    const preview = document.getElementById('imagePreview');
    const container = document.getElementById('uploadPreviewContainer');
    const uploadArea = document.getElementById('imageUploadArea');
    const fileInput = document.getElementById('imageFileInput');

    if (preview) preview.style.display = 'none';
    if (container) container.style.display = 'none';
    if (uploadArea) uploadArea.style.display = 'block';
    if (fileInput) fileInput.value = '';

    if (currentTab === 'upload') {
        currentImageData = null;
    }
}

// Xóa ảnh paste
window.clearPasteImage = function() {
    const preview = document.getElementById('pastePreview');
    const container = document.getElementById('pastePreviewContainer');
    const input = document.getElementById('imagePasteInput');

    if (preview) preview.style.display = 'none';
    if (container) container.style.display = 'none';
    if (input) input.value = '';

    if (currentTab === 'paste') {
        currentImageData = null;
    }
}

// Xóa tất cả ảnh
function clearAllImages() {
    clearUploadImage();
    clearPasteImage();
    currentImageData = null;
}

// Hiển thị lỗi
function showError(message) {
    const errorDiv = document.getElementById('imageSearchError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
        errorDiv.style.display = 'block';
    }
}

// Ẩn lỗi
function hideError() {
    const errorDiv = document.getElementById('imageSearchError');
    if (errorDiv) {
        errorDiv.classList.remove('show');
        errorDiv.style.display = 'none';
    }
}

// Tìm kiếm bằng ảnh
window.searchWithImage = async function() {
    if (!currentImageData) {
        showError('Vui lòng chọn hoặc nhập ảnh trước');
        return;
    }

    const searchBtn = document.querySelector('.btn-primary');
    searchBtn.classList.add('loading');
    searchBtn.disabled = true;

    try {
        const response = await fetch('/api/search-by-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: currentImageData
            })
        });

        const data = await response.json();

        if (data.status === 'success' || data.status === 'not_found') {
            closeImageSearch();
            const searchTerm = data.search_term || 'Hình ảnh của bạn';

            // CHUYỂN HƯỚNG VỀ TRANG CHỦ VỚI TỪ KHÓA TÌM KIẾM
            document.body.classList.add('page-fade-out');
            setTimeout(() => {
                window.location.href = `index.html?search=${encodeURIComponent(searchTerm)}`;
            }, 500);

        } else {
            showError(`❌ Lỗi: ${data.message}`);
        }

    } catch (error) {
        console.error('Search error:', error);
        showError('❌ Lỗi kết nối. Vui lòng thử lại');
    } finally {
        searchBtn.classList.remove('loading');
        searchBtn.disabled = false;
    }
}

// ======================================================================
// 7. GLOBAL EXPORTS & EVENT LISTENERS
// ======================================================================

// Cart Actions (with Optimistic Update)
// ĐÃ CHUYỂN logic này vào window.addToCart ở trên

window.changeQty = function(key, delta) {
    cart[key] = (cart[key] || 0) + delta;
    if (cart[key] <= 0) delete cart[key];
    saveCart();
}

window.removeItem = function(key) {
    if (confirm("Xóa sản phẩm này khỏi giỏ hàng?")) {
        delete cart[key];
        if (CART_CACHE[key]) delete CART_CACHE[key]; // Xóa khỏi cache
        saveCart();
    }
}

// KHỞI ĐỘNG
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load Data
    await Promise.all([
        loadMainProduct(),
        fetchCartDetails()
    ]);

    updateAccountLink();
    updateCartUI();
    setupImageUpload(); // Khởi tạo Image Upload

    // 2. Bind Events
    const searchForm = $('#search_form');
    if (searchForm) {
        searchForm.onsubmit = (e) => {
            e.preventDefault();
            const term = $('#search_input').value.trim();
            if (!term) return; // Nếu rỗng thì không làm gì
            document.body.classList.add('page-fade-out');
            setTimeout(() => {
                window.location.href = `index.html?search=${encodeURIComponent(term)}`;
            }, 500);
        };
    }

    // Popup Events
    const cartBtn = $('#open-cart');
    const cartPopup = $('#cart-popup');

    if (cartBtn && cartPopup) {
        cartBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cartPopup.style.display = (cartPopup.style.display === 'block') ? 'none' : 'block';
        });

        if ($('#close-cart')) $('#close-cart').onclick = () => $('#cart-popup').style.display = 'none';

        // Đóng khi click ra ngoài popup
        document.addEventListener('click', (e) => {
            if (cartPopup.style.display === 'block' && !cartPopup.contains(e.target) && !cartBtn.contains(e.target)) {
                cartPopup.style.display = 'none';
            }
        });
    }

    // Đóng Image Search popup khi click outside hoặc ESC
    const imageSearchPopup = document.getElementById('image_search_popup');
    if (imageSearchPopup) {
        imageSearchPopup.addEventListener('click', (e) => {
            if (e.target === imageSearchPopup) {
                closeImageSearch();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const popup = document.getElementById('image_search_popup');
            if (popup && popup.style.display === 'flex') {
                closeImageSearch();
            }
        }
    });

    // ĐỔI CHỨC NĂNG: Thanh toán -> Xem Giỏ hàng
    if ($('#checkout')) $('#checkout').onclick = () => {
        document.body.classList.add('page-fade-out');
        setTimeout(() => window.location.href = 'cart.html', 500);
    };

    // Product Detail Events
    const qtyInput = $('#qty-input');
    if (qtyInput) {
        qtyInput.value = currentQuantity;
        $('#qty-minus').onclick = () => {
            if (currentQuantity > 1) {
                currentQuantity--;
                qtyInput.value = currentQuantity;
            }
        };
        $('#qty-plus').onclick = () => {
            currentQuantity++;
            qtyInput.value = currentQuantity;
        };
    }

    // Gắn lại sự kiện cho Thêm vào giỏ và Mua ngay (Sử dụng hàm đã được check login)
    if ($('#add-to-cart-btn')) $('#add-to-cart-btn').onclick = () => {
        if (currentProduct) window.addToCart(currentProduct.product_id, currentProduct.store_id, currentQuantity);
    };

    if ($('#buy-now-btn')) $('#buy-now-btn').onclick = window.buyNow;

    // Review Event (Đã có check login bên trong submitReview)
    if ($('#btn-submit-review')) $('#btn-submit-review').onclick = submitReview;

    // Map Event
    const mapBtn = document.getElementById('map-btn');
    if (mapBtn) {
        mapBtn.onclick = () => {
            if (!currentProduct) {
                alert('Chưa tải được thông tin cửa hàng!');
                return;
            }
            localStorage.setItem('TARGET_STORE', JSON.stringify({
                id: currentProduct.store_id,
                name: currentProduct.name,
                address: currentProduct.address
            }));
            window.location.href = '/map/';
        };
    }
});