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
let currentPsId = null; // [Doc 4] Key quan trọng để lấy reviews
let currentRecognition = null; // [Doc 3] Voice search

// ======================================================================
// 2. CÁC HÀM TIỆN ÍCH (UTILS) - [Doc 3]
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

// [Doc 3 + Doc 4] Update Account Link with User Info
function updateAccountLink() {
    const accountLink = document.getElementById('account-link');
    const userName = localStorage.getItem('userName');
    const logoutLink = document.getElementById('logout-link');
    
    if (accountLink) {
        if (userName) {
            accountLink.textContent = `👋 Chào, ${userName}`;
            accountLink.href = 'profile.html';
            if (logoutLink) {
                logoutLink.style.display = 'flex';
                logoutLink.onclick = async () => {
                    if (supabaseClient) await supabaseClient.auth.signOut();
                    localStorage.removeItem('accessToken');
                    localStorage.removeItem('userName');
                    localStorage.removeItem('userId');
                    document.body.classList.add('page-fade-out');
                    setTimeout(() => { window.location.href = 'index.html'; }, 500);
                };
            }
        } else {
            accountLink.textContent = 'Tài Khoản';
            accountLink.href = 'login.html'; 
            if (logoutLink) logoutLink.style.display = 'none';
        }
    }
}

// ======================================================================
// 3. LOGIC SẢN PHẨM & GIỎ HÀNG (MERGE) - ĐÃ CHỈNH SỬA GIỎ HÀNG
// ======================================================================

// [Doc 4 + 3] Tải thông tin chi tiết sản phẩm
async function loadMainProduct() {
    const params = new URLSearchParams(window.location.search);
    const product_id = params.get('product_id');
    const store_id = params.get('store_id');
    
    if (!product_id || !store_id) {
        if($('.product-container')) $('.product-container').innerHTML = '<h2 style="padding:20px">Thiếu thông tin sản phẩm</h2>';
        return;
    }

    const key = `${product_id}_${store_id}`;

    try {
        // Gọi API Backend lấy chi tiết
        const res = await fetch('/api/cart/details', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cart: { [key]: 1 } })
        });

        if (res.ok) {
            const data = await res.json();
            const productData = data[key];
            
            if (!productData) { 
                $('.product-container').innerHTML = '<h2 style="padding:20px">Sản phẩm không tồn tại</h2>'; 
                return; 
            }

            const storeInfo = productData.stores[0];

            // [Doc 4] Lấy dữ liệu rating sơ bộ
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
                img: (storeInfo.product_images?.[0]?.ps_image_url) || productData.product_image_url, 
                description: productData.product_des || "Đang cập nhật...",
                ps_id: storeInfo.ps_id // [Doc 4]
            };
            
            // Render UI
            if($('#product-name')) $('#product-name').textContent = currentProduct.sub_name; 
            if(document.getElementById('product-subtitle')) document.getElementById('product-subtitle').innerHTML = `<div><strong>Cửa hàng:</strong> ${currentProduct.name}</div><div style="color: #777;">📍 ${currentProduct.address}</div>`;
            if($('#product-price')) $('#product-price').textContent = formatMoney(currentProduct.price);
            if($('#product-image-main')) $('#product-image-main').src = currentProduct.img;
            if($('#product-description')) $('#product-description').textContent = currentProduct.description;

            // [Doc 4] Render Rating Header lần 1
            updateReviewHeader(ratingVal, reviewCountVal);

            const crumb = document.getElementById('breadcrumb-summary-link');
            if (crumb) crumb.innerHTML = `<a href="product-summary.html?product_id=${product_id}">${currentProduct.sub_name}</a>`;

            // [Doc 4] QUAN TRỌNG: Trigger tải đánh giá ngay khi có ps_id
            if (currentProduct.ps_id) {
                currentPsId = currentProduct.ps_id;
                loadReviews(currentPsId);
            } else {
                findPsIdAndLoadReviews(currentProduct.product_id, currentProduct.store_id);
            }
        }
    } catch (e) { 
        console.error("Lỗi loadMainProduct:", e); 
    }
}

// [Doc 3] Đồng bộ giỏ hàng
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
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cart: cartToFetch })
        });
        if (res.ok) { 
            const newCache = await res.json();
            CART_CACHE = { ...CART_CACHE, ...newCache };
            updateCartUI(); 
        }
    } catch (err) { console.error(err); }
}

// [Doc 3] UI Giỏ hàng với Skeleton Loading
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
            
            let imgUrl = (storeInfo.product_images?.[0]?.ps_image_url) || details.product_image_url;
            
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
            // Skeleton Loading from Doc 3
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

// ======================================================================
// 4. LOGIC XỬ LÝ REVIEWS - [DOC 4] (FULL)
// ======================================================================

async function findPsIdAndLoadReviews(productId, storeId) {
    if (!supabaseClient) return;
    const { data } = await supabaseClient.from('product_store').select('ps_id').eq('product_id', productId).eq('store_id', storeId).single();
    if (data) {
        currentPsId = data.ps_id;
        loadReviews(currentPsId);
    }
}

async function loadReviews(psId) {
    if (!psId || !supabaseClient) return;

    // Check Login UI
    const { data: { session } } = await supabaseClient.auth.getSession();
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
    if(listEl) listEl.innerHTML = '<p style="color:#999; padding:10px">Đang tải đánh giá...</p>';

    const { data: reviews, error } = await supabaseClient
        .from('reviews')
        .select('*')
        .eq('ps_id', psId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Lỗi tải review:", error);
        if(listEl) listEl.innerHTML = '<p style="color:red">Không thể tải đánh giá.</p>';
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
    const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', userIds);
    
    const profileMap = {};
    if (profiles) profiles.forEach(p => profileMap[p.id] = p);

    reviews.forEach(r => {
        const user = profileMap[r.user_id] || { name: 'Người dùng ẩn danh', avatar_url: null };
        let starsHtml = '';
        for(let i=1; i<=5; i++) starsHtml += `<span style="color:${i <= r.rating ? '#ffc107' : '#ddd'}">★</span>`;
        
        const date = new Date(r.created_at).toLocaleDateString('vi-VN');
        const avatarHtml = user.avatar_url 
            ? `<img src="${user.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` 
            : `<div style="width:100%;height:100%;background:#ccc;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;border-radius:50%">${user.name ? user.name.charAt(0).toUpperCase() : 'U'}</div>`;

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
    if (!currentPsId) { alert("Lỗi: Không tìm thấy mã sản phẩm."); return; }
    if (!supabaseClient) return;

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        alert("Vui lòng đăng nhập để đánh giá.");
        window.location.href = "login.html";
        return;
    }

    const ratingEl = document.querySelector('input[name="rating"]:checked');
    const commentInput = $('#review-comment');
    const comment = commentInput ? commentInput.value.trim() : '';

    if (!ratingEl) { alert("Vui lòng chọn số sao!"); return; }

    const btn = $('#btn-submit-review');
    btn.textContent = "Đang gửi...";
    btn.disabled = true;

    try {
        const { error } = await supabaseClient
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
        if(ratingEl) ratingEl.checked = false;
        
        loadReviews(currentPsId); 

    } catch (err) {
        alert("Gửi thất bại: " + err.message);
    } finally {
        btn.textContent = "Gửi đánh giá";
        btn.disabled = false;
    }
}

// ======================================================================
// 5. GLOBAL EXPORTS & EVENT LISTENERS
// ======================================================================

// [Doc 3] Cart Actions (with Optimistic Update)
window.addToCart = function (productId, storeId, qty) {
    const key = `${productId}_${storeId}`;
    cart[key] = (cart[key] || 0) + parseInt(qty);
    saveCart();
    
    // Optimistic cache update
    if (currentProduct && currentProduct.id === key && !CART_CACHE[key]) {
         CART_CACHE[key] = {
            product_name: currentProduct.sub_name,
            product_image_url: currentProduct.img,
            stores: [{ store_name: currentProduct.name, ps_min_price_store: currentProduct.price, product_images: [{ps_image_url: currentProduct.img}] }]
         };
    }
    updateCartUI();
    alert('Đã thêm vào giỏ!');
}

window.changeQty = function (key, delta) {
    cart[key] = (cart[key] || 0) + delta;
    if (cart[key] <= 0) delete cart[key];
    saveCart();
}

window.removeItem = function (key) {
    if (confirm("Xóa sản phẩm này khỏi giỏ hàng?")) { 
        delete cart[key]; 
        if (CART_CACHE[key]) delete CART_CACHE[key]; // Xóa khỏi cache
        saveCart(); 
    } 
}

// [Doc 3] Filter & Voice
window.toggleFilterMenu = function() {
    const menu = $('#filter-dropdown');
    if (menu) menu.classList.toggle('active');
};

window.startVoiceSearch = function() {
    $('#voice_popup').style.display = "flex";
    setTimeout(() => { $('#transcript_display').textContent = "Đang nghe..."; }, 500);
};

window.cancelVoiceSearch = function() {
    $('#voice_popup').style.display = "none";
};

// KHỞI ĐỘNG
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load Data
    await Promise.all([
        loadMainProduct(),
        fetchCartDetails()
    ]);
    
    updateAccountLink();
    updateCartUI();

    // 2. Bind Events
    const searchForm = $('#search_form');
    if (searchForm) {
        searchForm.onsubmit = (e) => {
            e.preventDefault();
            const term = $('#search_input').value;
            document.body.classList.add('page-fade-out');
            setTimeout(() => { window.location.href = `index.html?search=${encodeURIComponent(term)}`; }, 500);
        };
    }

    // Popup Events
    if ($('#open-cart')) $('#open-cart').onclick = () => { 
        const popup = $('#cart-popup'); 
        // Dùng style.display như đã thống nhất
        popup.style.display = (popup.style.display === 'block') ? 'none' : 'block'; 
    };
    if ($('#close-cart')) $('#close-cart').onclick = () => $('#cart-popup').style.display = 'none';
    
    // LOẠI BỎ: Logic clear cart
    
    // ĐỔI CHỨC NĂNG: Thanh toán -> Xem Giỏ hàng
    if ($('#checkout')) $('#checkout').onclick = () => {
        if(Object.keys(cart).length === 0) return alert("Giỏ hàng trống");
        document.body.classList.add('page-fade-out');
        setTimeout(() => window.location.href = 'cart.html', 500);
    };

    // Product Detail Events
    const qtyInput = $('#qty-input');
    if (qtyInput) {
        qtyInput.value = currentQuantity;
        $('#qty-minus').onclick = () => { if (currentQuantity > 1) qtyInput.value = --currentQuantity; };
        $('#qty-plus').onclick = () => { qtyInput.value = ++currentQuantity; };
    }

    if ($('#add-to-cart-btn')) $('#add-to-cart-btn').onclick = () => {
        if (currentProduct) addToCart(currentProduct.product_id, currentProduct.store_id, currentQuantity);
    };

    if ($('#buy-now-btn')) $('#buy-now-btn').onclick = () => {
        if (currentProduct) {
            addToCart(currentProduct.product_id, currentProduct.store_id, currentQuantity);
            document.body.classList.add('page-fade-out');
            setTimeout(() => { window.location.href = 'cart.html'; }, 500);
        }
    };

    // Review Event
    if ($('#btn-submit-review')) $('#btn-submit-review').onclick = submitReview;

    // Map Event
    const mapBtn = document.getElementById('map-btn');
    if (mapBtn) {
        mapBtn.onclick = () => {
            if (!currentProduct) { alert('Chưa tải được thông tin cửa hàng!'); return; }
            localStorage.setItem('TARGET_STORE', JSON.stringify({
                id: currentProduct.store_id,
                name: currentProduct.name,
                address: currentProduct.address
            }));
            window.location.href = '/map/'; 
        };
    }
});