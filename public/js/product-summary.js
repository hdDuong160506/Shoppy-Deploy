const API_BASE = '';
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
// Biến lưu trữ sản phẩm (product object) hiện tại
// Chú ý: currentProductData.stores_raw sẽ lưu danh sách cửa hàng gốc
let currentProductData = null;
let cart = JSON.parse(localStorage.getItem('cart_v1') || '{}');

// THÊM MỚI: Cache chi tiết sản phẩm trong giỏ hàng (Đồng bộ với index/detail)
let CART_CACHE = {};

// Hàm format tiền tệ
function formatMoney(n) {
    if (typeof n !== 'number') return '0₫';
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + '₫';
}

// ======================================================================
// HÀM QUẢN LÝ LOADING OVERLAY (THÊM MỚI)
// ======================================================================

function showLoading() {
    const loading = $('#full-page-loading');
    if (loading) loading.style.display = 'flex';
}

function hideLoading() {
    const loading = $('#full-page-loading');
    if (loading) loading.style.display = 'none';
}

// ======================================================================
// PHẦN LOGIC CHUNG (ĐƯỢC TÍCH HỢP TỪ script.js)
// ======================================================================

// --- 1. LOGIC CART UI (Cập nhật - Từ product-summary.js gốc) ---

function saveCart() {
    localStorage.setItem('cart_v1', JSON.stringify(cart));
    updateCartUI();
    // Trigger fetch lại chi tiết để UI được hoàn chỉnh
    fetchCartDetails();
}

// [MỚI] Tải chi tiết sản phẩm trong giỏ hàng từ API
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
    } catch (err) { console.error("Lỗi fetchCartDetails:", err); }
}

window.changeQty = function (key, delta) {
    cart[key] = (cart[key] || 0) + delta;
    if (cart[key] <= 0) delete cart[key];
    saveCart();
}

window.removeItem = function (key) {
    // SỬ DỤNG CUSTOM MODAL thay cho confirm() gốc
    showCustomConfirm("Xóa sản phẩm này khỏi giỏ hàng?").then(confirmRemove => {
        if (confirmRemove) {
            delete cart[key];
            if (CART_CACHE[key]) delete CART_CACHE[key]; // Xóa khỏi cache
            saveCart();
        }
    });
}

// [ĐÃ CHỈNH SỬA] Cập nhật giao diện giỏ hàng sử dụng CART_CACHE
function updateCartUI() {
    const cartList = $('#cart-list');
    const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
    let total = 0;

    const cartCountBubble = $('#cart-count');
    if (cartCountBubble) {
        cartCountBubble.textContent = cartCount;
        cartCountBubble.style.display = cartCount > 0 ? 'block' : 'none';
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
            // Lấy giá ưu tiên từ ps_min_price_store, nếu không có thì dùng giá từ product.product_min_cost hoặc 0
            const price = storeInfo.ps_min_price_store || details.product_min_cost || 0;
            total += price * qty;

            // Lấy ảnh ưu tiên từ stores[0].product_images, nếu không có thì dùng product_image_url
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

// --- 2. LOGIC ACCOUNT/LOGOUT (Copy từ script.js, dùng custom modal) ---

async function updateAccountLink() {
    const accountLink = document.getElementById('account-link');
    const logoutLink = document.getElementById('logout-link');
    if (typeof supabase === 'undefined') return;

    const { data: { session } } = await supabase.auth.getSession();
    let userName = null;

    if (session && session.user) {
        // --- LOGIC TỪ script.js: Ưu tiên lấy tên từ DB (nếu có), nếu không có mới dùng metadata/email ---
        // (Không gọi API do Supabase client không có ở đây, tạm dùng LocalStorage như logic gốc của product-summary.js)
        const storedName = localStorage.getItem('userName');
        if (storedName) {
            userName = storedName;
        } else {
            // Logic fallback nếu LocalStorage trống
            userName = session.user.user_metadata.name || session.user.email.split('@')[0];
        }
        localStorage.setItem('userName', userName); // Lưu lại
    } else {
        localStorage.removeItem('userName');
    }

    if (userName && accountLink) {
        accountLink.innerHTML = `👋 Chào, <b>${userName}</b>`;
        accountLink.href = 'profile.html';
        if (logoutLink) logoutLink.style.display = 'flex';
    } else if (accountLink) {
        accountLink.textContent = 'Tài Khoản';
        accountLink.href = 'account.html';
        if (logoutLink) logoutLink.style.display = 'none';
    }
}

// Hàm custom confirm (TỪ script.js)
function showCustomConfirm(message) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-confirm-modal');
        const messageElement = modal.querySelector('#modal-message');
        const yesButton = modal.querySelector('#modal-confirm-yes');
        const noButton = modal.querySelector('#modal-confirm-no');

        if (!modal || !messageElement || !yesButton || !noButton) {
            resolve(confirm(message));
            return;
        }
        messageElement.textContent = message;
        modal.style.display = 'flex';
        const handleYes = () => { modal.style.display = 'none'; removeListeners(); resolve(true); };
        const handleNo = () => { modal.style.display = 'none'; removeListeners(); resolve(false); };
        yesButton.addEventListener('click', handleYes, { once: true });
        noButton.addEventListener('click', handleNo, { once: true });
        const removeListeners = () => {
            yesButton.removeEventListener('click', handleYes);
            noButton.removeEventListener('click', handleNo);
        };
    });
}

window.handleLogout = async function () {
    const confirmLogout = await showCustomConfirm("Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này không?");
    if (!confirmLogout) return;
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        localStorage.removeItem('accessToken');
        localStorage.removeItem('userName');
        localStorage.removeItem('cart_v1');
        
        // 🎯 SỬA CHỮA: LƯU URL HIỆN TẠI TRƯỚC KHI TẢI LẠI TRANG
        localStorage.setItem('redirect_after_login', window.location.href); 

        window.location.reload();
    } catch (err) {
        alert("Đăng xuất thất bại. Vui lòng thử lại.");
    }
};

// --- 3. LOGIC SEARCH (Tích hợp đầy đủ từ script.js) ---

// Các biến search (từ script.js)
let suggestionTimeout;
let highlightedIndex = -1; // Index của gợi ý đang được highlight

// Hàm ẩn suggestions (từ script.js)
function hideSuggestions() {
    const suggestionsDiv = $('#search_suggestions');
    if (suggestionsDiv) suggestionsDiv.style.display = 'none';
    highlightedIndex = -1;
}

// Hàm chuyển trang tổng quan (từ script.js)
function navigateToProductSummary(productId) {
    window.location.href = `product-summary.html?product_id=${productId}`;
    hideSuggestions();
}

// Hàm render suggestions (từ script.js)
function renderSuggestions(products, query) {
    const container = $('#search_suggestions');
    container.innerHTML = '';
    highlightedIndex = -1; // Reset index

    if (!products || products.length === 0) {
        hideSuggestions();
        return;
    }

    // --- 1. Thêm dòng "Tìm kiếm toàn bộ" ---
    const searchAllItem = document.createElement('div');
    searchAllItem.className = 'suggestion-item suggestion-search-all';
    searchAllItem.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="#1867f8">
        <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
      </svg>
      Tìm kiếm: <b>${query}</b>
  `;
    searchAllItem.addEventListener('click', () => submitSearch(query));
    container.appendChild(searchAllItem);

    // --- 2. Thêm các sản phẩm gợi ý (có ảnh) ---
    products.forEach(product => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';

        const imageUrl = product.product_image_url || 'images/placeholder.jpg';

        // Tạo HTML cho item gợi ý bao gồm ảnh, tên và vị trí (Không hiện giá)
        item.innerHTML = `
        <img class="suggestion-image" src="${imageUrl}" alt="${product.product_name}">
        <div class="suggestion-text-container">
            <div class="suggestion-name">${product.product_name}</div>
            <div class="suggestion-location">📍 ${product.location_name || 'Không rõ vị trí'}</div>
        </div>
    `;

        item.dataset.productId = product.product_id;
        item.addEventListener('click', () => navigateToProductSummary(product.product_id));
        container.appendChild(item);
    });

    showSuggestions();
}

// Hàm fetch suggestions (từ script.js)
async function fetchSuggestions(query) {
    if (!query || query.length < 2) {
        hideSuggestions();
        return;
    }

    try {
        // Giả lập gọi API gợi ý tìm kiếm (chỉ lấy 5 sản phẩm đầu tiên)
        const res = await fetch(`/api/products?search=${encodeURIComponent(query)}&limit=5`);
        const suggestions = await res.json();

        renderSuggestions(suggestions, query);

    } catch (err) {
        console.error("Lỗi khi fetch gợi ý tìm kiếm:", err);
        hideSuggestions();
    }
}

// Hàm submit search (từ script.js - ĐƯỢC CHỈNH SỬA để redirect về index.html)
function submitSearch(query) {
    const searchInput = $('#search_input');
    if (searchInput) {
        searchInput.value = query;
        // Chuyển hướng về index.html với query
        window.location.href = `index.html?search=${encodeURIComponent(query)}`;
    }
    hideSuggestions();
}


// --- 4. LOGIC VOICE SEARCH & IMAGE SEARCH (Tích hợp đầy đủ từ script.js) ---

// Lưu recognition đang chạy để dừng nếu người dùng mở lại (từ script.js)
let currentRecognition = null;

// Bắt đầu ghi âm (từ script.js)
window.startVoiceSearch = function () {
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

    recognition.onstart = function () {
        transcriptDisplay.textContent = "Đang nghe... Hãy nói gì đó!";
    };

    recognition.onresult = function (event) {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal)
                finalTranscript += transcript;
            else
                interimTranscript += transcript;
        }

        transcriptDisplay.textContent = finalTranscript || interimTranscript;

        if (finalTranscript) {
            $('#search_input').value = finalTranscript;

            setTimeout(() => {
                popup.style.display = "none";
                recognition.stop();
                // CHUYỂN HƯỚNG VỀ index.html để hiển thị kết quả tìm kiếm
                window.location.href = `index.html?search=${encodeURIComponent(finalTranscript)}`;

            }, 200);
        }
    };

    recognition.onerror = function (event) {
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
        }, 2000); // Tăng thời gian hiển thị lỗi
    };

    recognition.onend = function () {
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

// Hủy ghi âm (từ script.js)
window.cancelVoiceSearch = function () {
    if (currentRecognition) currentRecognition.abort();
    $('#voice_popup').style.display = "none";
}

// Biến cho Image Search (từ script.js)
let currentImageData = null;
let currentTab = 'upload';

// Mở popup tìm kiếm bằng hình ảnh (từ script.js)
window.openImageSearch = function () {
    const popup = document.getElementById('image_search_popup');
    popup.classList.add('active');
    popup.style.display = 'flex';

    switchImageTab('upload');
    clearAllImages();
}

// Đóng popup (từ script.js)
function closeImageSearch() {
    const popup = document.getElementById('image_search_popup');
    popup.classList.remove('active');
    setTimeout(() => {
        popup.style.display = 'none';
    }, 200);

    clearAllImages();
    hideError();
}

// Chuyển tab (từ script.js)
function switchImageTab(tabName) {
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

// Setup upload area (từ script.js)
function setupImageUpload() {
    const uploadArea = document.getElementById('imageUploadArea');
    const fileInput = document.getElementById('imageFileInput');

    if (!uploadArea || !fileInput) return;

    document.getElementById('browseBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageFile(file);
        }
    });

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
}

// Xử lý file ảnh (từ script.js)
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

// Tải ảnh từ paste (từ script.js)
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
    }
    else if (value.startsWith('data:image/')) {
        currentImageData = value;
        showImagePreview(value, 'paste');
        hideError();
    }
    else if (value.length > 100) {
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

// Hiển thị preview ảnh (từ script.js)
function showImagePreview(imageData, tab) {
    if (tab === 'upload') {
        const preview = document.getElementById('imagePreview');
        const container = document.getElementById('uploadPreviewContainer');

        preview.src = imageData;
        preview.style.display = 'block';
        container.style.display = 'block';

        document.getElementById('imageUploadArea').style.display = 'none';
    } else {
        const preview = document.getElementById('pastePreview');
        const container = document.getElementById('pastePreviewContainer');

        preview.src = imageData;
        preview.style.display = 'block';
        container.style.display = 'block';
    }
}

// Xóa ảnh upload (từ script.js)
function clearUploadImage() {
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('uploadPreviewContainer').style.display = 'none';
    document.getElementById('imageUploadArea').style.display = 'block';
    document.getElementById('imageFileInput').value = '';

    if (currentTab === 'upload') {
        currentImageData = null;
    }
}

// Xóa ảnh paste (từ script.js)
function clearPasteImage() {
    document.getElementById('pastePreview').style.display = 'none';
    document.getElementById('pastePreviewContainer').style.display = 'none';
    document.getElementById('imagePasteInput').value = '';

    if (currentTab === 'paste') {
        currentImageData = null;
    }
}

// Xóa tất cả ảnh (từ script.js)
function clearAllImages() {
    clearUploadImage();
    clearPasteImage();
    currentImageData = null;
}

// Hiển thị lỗi (từ script.js)
function showError(message) {
    const errorDiv = document.getElementById('imageSearchError');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    errorDiv.style.display = 'block';
}

// Ẩn lỗi (từ script.js)
function hideError() {
    const errorDiv = document.getElementById('imageSearchError');
    errorDiv.classList.remove('show');
    errorDiv.style.display = 'none';
}

// Tìm kiếm bằng ảnh (từ script.js - CHỈNH SỬA để redirect về index.html)
async function searchWithImage() {
    if (!currentImageData) {
        showError('Vui lòng chọn hoặc nhập ảnh trước');
        return;
    }

    const searchBtn = document.querySelector('.btn-primary');
    searchBtn.classList.add('loading');
    searchBtn.disabled = true;

    try {
        // Giả lập gọi API và lấy từ khóa tìm kiếm
        const response = await fetch('/api/search-by-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: currentImageData })
        });

        const data = await response.json();

        if (data.status === 'success') {
            closeImageSearch();
            // CHUYỂN HƯỚNG VỀ index.html với từ khóa tìm được
            const searchTerm = data.search_term || 'tìm kiếm hình ảnh';
            window.location.href = `index.html?search=${encodeURIComponent(searchTerm)}`;

        } else if (data.status === 'not_found') {
            closeImageSearch();
            const searchTerm = data.search_term || 'tìm kiếm hình ảnh';
            window.location.href = `index.html?search=${encodeURIComponent(searchTerm)}`;
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
// PHẦN LOGIC TRANG SUMMARY (Giữ nguyên từ product-summary.js gốc)
// ======================================================================

async function loadProductData(productId) {
    showLoading(); // HIỂN THỊ LOADING

    try {
        const res = await fetch(`/api/product_summary?product_id=${productId}`);

        if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
        }

        const products = await res.json();

        if (products && products.length > 0) {
            const product = products[0];
            currentProductData = product;
            // LƯU TRỮ THỨ TỰ GỐC CỦA CỬA HÀNG CHO CHẾ ĐỘ 'MẶC ĐỊNH'
            currentProductData.stores_raw = [...product.stores];
            return product;
        } else {
            $('#summary-product-name').textContent = 'Sản phẩm không tồn tại';
            $('#recommended-stores-list').innerHTML = '<div class="no-stores">Không tìm thấy thông tin sản phẩm này.</div>';
            return null;
        }

    } catch (err) {
        console.error("Lỗi khi load Product Data:", err);
        $('#recommended-stores-list').innerHTML = '<div class="no-stores" style="color:red">Lỗi kết nối server khi tải dữ liệu.</div>';
        return null;
    } finally {
        await new Promise(resolve => setTimeout(resolve, 500));
        hideLoading(); // ẨN LOADING
    }
}

// ======================================================================
// PHẦN LOGIC SẮP XẾP CỬA HÀNG (Giữ nguyên từ product-summary.js gốc)
// ======================================================================

window.sortAndRenderStores = function () {
    if (!currentProductData || !currentProductData.stores_raw) return;

    // LẤY GIÁ TRỊ TỪ RADIO BUTTON ĐANG ĐƯỢC CHỌN
    const checkedRadio = document.querySelector('input[name="store_sort_filter"]:checked');
    if (!checkedRadio) return;

    const sortValue = checkedRadio.value;
    let sortedStores = [...currentProductData.stores_raw]; // Bắt đầu từ bản gốc (stores_raw)

    switch (sortValue) {
        case 'default':
            // Mặc định: Giữ nguyên bản sao từ stores_raw
            break;
        case 'dist_asc':
            // Gần nhất: Sắp xếp Tăng dần khoảng cách (ps_distance)
            sortedStores.sort((a, b) => {
                const distA = a.ps_distance || Infinity; // Infinity nằm cuối
                const distB = b.ps_distance || Infinity;
                return distA - distB;
            });
            break;
        case 'price_asc':
            // Giá thấp: Sắp xếp Tăng dần giá (ps_min_price_store)
            sortedStores.sort((a, b) => {
                const priceA = a.ps_min_price_store || 0;
                const priceB = b.ps_min_price_store || 0;
                return priceA - priceB;
            });
            break;
        case 'rating_desc':
            // Đánh giá cao: Sắp xếp Giảm dần rating (ps_average_rating)
            sortedStores.sort((a, b) => {
                const ratingA = Number(a.ps_average_rating) || 0;
                const ratingB = Number(b.ps_average_rating) || 0;
                return ratingB - ratingA;
            });
            break;
    }

    // Cập nhật currentProductData tạm thời để render
    const productToRender = {
        ...currentProductData,
        stores: sortedStores
    };

    renderProductSummary(productToRender);
}

// Hàm phụ trợ: Tính khoảng cách giữa 2 tọa độ (km)

function haversineDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371; // Bán kính trái đất (km)
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Hàm chính: Render thông tin sản phẩm và danh sách cửa hàng

async function renderProductSummary(product) {
    const $ = document.querySelector.bind(document);

    // Nếu window.allStores chưa có, ta gọi API lấy về ngay lập tức
    if (!window.allStores) {
        try {
            const res = await fetch('/map/api/stores');
            if (res.ok) {
                window.allStores = await res.json();
            }
        } catch (e) {
            console.error("Lỗi khi tải danh sách cửa hàng:", e);
        }
    }

    // --- 1. Cập nhật thông tin tổng quan sản phẩm ---
    if ($('#summary-product-name')) $('#summary-product-name').textContent = product.product_name;
    if ($('#breadcrumb-product-name')) $('#breadcrumb-product-name').textContent = product.product_name;
    if ($('#summary-product-tag')) $('#summary-product-tag').textContent = `#${product.tag || 'Chung'}`;
    if ($('#summary-product-image')) $('#summary-product-image').src = product.product_image_url || 'images/placeholder.jpg';
    if ($('#summary-product-description')) $('#summary-product-description').textContent = product.product_des || 'Không có mô tả chi tiết cho sản phẩm này.';

    const minPrice = product.min_price || product.product_min_cost;
    const maxPrice = product.max_price || product.product_max_cost;

    let priceText = 'Liên hệ';
    if (minPrice) {
        priceText = formatMoney(minPrice);
        if (maxPrice && maxPrice !== minPrice) {
            priceText += ` - ${formatMoney(maxPrice)}`;
        }
    }
    if ($('#summary-product-price')) $('#summary-product-price').textContent = priceText;


    // --- 2. Cập nhật danh sách cửa hàng ---
    const storeList = $('#recommended-stores-list');
    if (!storeList) return;

    storeList.innerHTML = '';

    const storesToRender = product.stores || [];

    if (storesToRender.length === 0) {
        storeList.innerHTML = '<div class="no-stores">Hiện không có cửa hàng nào cung cấp sản phẩm này.</div>';
        return;
    }

    let userLat = 0;
    let userLon = 0;
    // CẤU HÌNH TỌA ĐỘ NGƯỜI DÙNG
    try {
        const response = await fetch('/map/api/get-current-location');

        if (!response.ok) {
            throw new Error('Lỗi kết nối tới Server');
        }

        const data = await response.json();

        // 3. Kiểm tra dữ liệu trả về
        if (data.lat && data.long) {
            const lat = parseFloat(data.lat);
            const lng = parseFloat(data.long);

            // Cập nhật dữ liệu người dùng
            userLat = lat;
            userLon = lng;

            console.log("📍 Đã lấy toạ độ từ Session:", lat, lng);

        } else {
            // Trường hợp Session trả về null
            throw new Error("Session chưa có dữ liệu vị trí");
        }

    } catch (error) {
        console.warn("⚠️ Không lấy được vị trí từ Session:", error);

    }

    storesToRender.forEach(store => {
        // --- Logic ảnh và giá ---
        const mainImage = store.product_images && store.product_images.length > 0
            ? (store.product_images.find(img => img.ps_type === 1) || store.product_images[0])
            : null;

        const storeImageUrl = mainImage ? mainImage.ps_image_url : product.product_image_url;

        const rating = store.ps_average_rating ? Number(store.ps_average_rating).toFixed(1) : 'Chưa có';
        const reviewCount = store.ps_total_reviews ? store.ps_total_reviews : 0;

        const storeMinPrice = store.ps_min_price_store || 0;
        const storeMaxPrice = store.ps_max_price_store || 0;

        let storePriceText = formatMoney(storeMinPrice);
        if (storeMaxPrice && storeMaxPrice !== storeMinPrice) {
            storePriceText += ` - ${formatMoney(storeMaxPrice)}`;
        }

        // --- 3. LOGIC HIỂN THỊ KHOẢNG CÁCH ---
        let distanceHtml = '';

        // Tìm thông tin đầy đủ của store trong window.allStores (để lấy lat/long chính xác)
        const fullStoreInfo = window.allStores?.find(s => String(s.store_id) === String(store.store_id));

        // Lấy tọa độ: Ưu tiên lấy từ fullStoreInfo, nếu không có thì lấy từ store hiện tại, cuối cùng là 0
        const storeLat = fullStoreInfo ? fullStoreInfo.lat : Number(store.lat || 0);
        const storeLon = fullStoreInfo ? fullStoreInfo.long : Number(store.long || 0);

        if (userLat && userLon && storeLat && storeLon) {
            // Tính toán bằng Haversine và sai số
            const distKm = haversineDistance(userLat, userLon, storeLat, storeLon) * 1.3;
            if (distKm !== null) {
                // Style màu xanh lá
                distanceHtml = `<span style="margin-left: 10px; color: #2ecc71; font-weight: 500;">| Cách bạn khoảng: ${distKm.toFixed(2)} km</span>`;
            }
        } else if (store.ps_distance) {
            // Fallback: Dùng dữ liệu khoảng cách có sẵn từ DB (nếu có)
            distanceHtml = `<span style="margin-left: 10px;">| Cách bạn khoảng : ${Number(store.ps_distance).toFixed(2)} km</span>`;
        }

        const storeCard = document.createElement('a');
        storeCard.className = 'store-item-card';
        // Truyền thêm tọa độ user vào URL nếu cần để trang sau vẽ đường ngay
        storeCard.href = `product-detail.html?product_id=${product.product_id}&store_id=${store.store_id}`;

        storeCard.innerHTML = `
            <img src="${storeImageUrl}" alt="${store.store_name}" onerror="this.src='images/placeholder.jpg'">
            <div class="store-info">
                <div class="store-name">${store.store_name}</div>
                <div style="font-size:14px; color:#555;">Địa chỉ: ${store.store_address || 'Đang cập nhật'}</div>
                <div class="store-price">Giá: ${storePriceText}</div>
                <div class="store-review">⭐ ${rating} (${reviewCount} đánh giá) ${distanceHtml}</div>
            </div>
            <div class="store-actions">
                <button>Xem Chi Tiết</button>
            </div>
        `;

        storeList.appendChild(storeCard);
    });
}

// ======================================================================
// PHẦN KHỞI TẠO (Được chỉnh sửa để tích hợp logic chung)
// ======================================================================

async function init() {
    const params = new URLSearchParams(window.location.search);
    const product_id = params.get('product_id');

    if (!product_id) {
        document.body.innerHTML = '<h2 style="padding:50px">Không tìm thấy ID sản phẩm. Vui lòng quay lại trang chủ.</h2>';
        return;
    }

    const product = await loadProductData(product_id);

    if (product) {
        // Tải dữ liệu ban đầu xong thì render lần đầu
        renderProductSummary(product);
        // Sau khi load xong, gọi sortAndRenderStores để áp dụng sort mặc định
        sortAndRenderStores();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateAccountLink();

    // THÊM: Setup Image Upload/Paste Logic
    setupImageUpload();
    const pasteInput = $('#imagePasteInput');

    if (pasteInput) {
        pasteInput.addEventListener('input', (e) => {
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

    // THÊM: Click ngoài Image Search Popup để đóng
    const imageSearchPopup = document.getElementById('image_search_popup');
    if (imageSearchPopup) {
        imageSearchPopup.addEventListener('click', (e) => {
            if (e.target === imageSearchPopup) {
                closeImageSearch();
            }
        });
    }

    // THÊM: Đóng Image Search Popup bằng ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const popup = document.getElementById('image_search_popup');
            if (popup && popup.style.display === 'flex') {
                closeImageSearch();
            }
        }
    });

    // THÊM: Logic Search Suggestion (từ script.js)
    const searchInput = $('#search_input');
    if (searchInput) {
        // Bắt sự kiện gõ phím để hiển thị gợi ý
        searchInput.addEventListener('input', () => {
            clearTimeout(suggestionTimeout);
            suggestionTimeout = setTimeout(() => {
                fetchSuggestions(searchInput.value);
            }, 300);
        });

        // Bắt sự kiện keydown để chọn gợi ý
        searchInput.addEventListener('keydown', (e) => {
            const suggestions = $$('#search_suggestions .suggestion-item');
            if (suggestions.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                suggestions[highlightedIndex]?.classList.remove('highlighted');
                highlightedIndex = (highlightedIndex + 1) % suggestions.length;
                suggestions[highlightedIndex].classList.add('highlighted');
                suggestions[highlightedIndex].scrollIntoView({ block: "nearest" });

            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                suggestions[highlightedIndex]?.classList.remove('highlighted');
                highlightedIndex = (highlightedIndex - 1 + suggestions.length) % suggestions.length;
                suggestions[highlightedIndex].classList.add('highlighted');
                suggestions[highlightedIndex].scrollIntoView({ block: "nearest" });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const highlighted = suggestions[highlightedIndex];
                if (highlighted) {
                    e.stopImmediatePropagation();
                    highlighted.click();
                } else {
                    // Nếu không có item nào được chọn, submit form (redirect về index.html)
                    document.getElementById('search_form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                }
            } else if (e.key === 'Escape') {
                hideSuggestions();
            }
        });
    }

    // Bắt sự kiện click ra ngoài để ẩn suggestions
    document.addEventListener('click', function (event) {
        const form = $('#search_form');
        const suggestions = $('#search_suggestions');
        if (form && suggestions && !form.contains(event.target) && !suggestions.contains(event.target)) {
            hideSuggestions();
        }
    });

    // Bắt sự kiện submit form (redirect về index.html)
    const searchForm = $('#search_form');
    if (searchForm) {
        searchForm.onsubmit = (e) => {
            e.preventDefault();
            const searchInput = $('#search_input');
            if (searchInput) {
                // Sử dụng hàm submitSearch để redirect
                submitSearch(searchInput.value);
            }
        };
    }

    // THÊM: Fetch chi tiết giỏ hàng ngay khi tải trang
    fetchCartDetails();
    updateCartUI();

    // Logic Khởi tạo trang chính
    init();

    // Logic Cart Popup (từ product-summary.js gốc)
    const cartBtn = $('#open-cart');
    const cartPopup = $('#cart-popup');

    if (cartBtn && cartPopup) {
        cartBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cartPopup.style.display = (cartPopup.style.display === 'block') ? 'none' : 'block';
        });

        document.addEventListener('click', (e) => {
            if (!cartBtn.contains(e.target) && !cartPopup.contains(e.target) && cartPopup.style.display === 'block') {
                cartPopup.style.display = 'none';
            }
        });
    }

    if ($('#close-cart')) {
        $('#close-cart').addEventListener('click', (e) => {
            e.stopPropagation();
            const popup = $('#cart-popup');
            if (popup) popup.style.display = 'none';
        });
    }

    // ĐỔI CHỨC NĂNG: Nút Checkout (từ product-summary.js gốc)
    if ($('#checkout')) {
        $('#checkout').addEventListener('click', (e) => {
            e.preventDefault();

            // --- ĐOẠN CODE ĐÃ BỊ XÓA ---
            // const count = Object.values(cart).reduce((s, q) => s + q, 0);
            // if (count === 0) { alert('Giỏ hàng đang rỗng.'); return; }
            // -----------------------------

            // Thêm hiệu ứng chuyển trang (Nếu cần, vì đây là trang chủ/tổng quan)
            document.body.classList.add('page-fade-out');
            setTimeout(() => {
                window.location.href = 'cart.html';
            }, 500);
        });
    }
});