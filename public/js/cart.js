// ---
// JavaScript cho trang cart.html (Đã tối ưu hóa API)
// ---

let CART_DATA = {}; // Chứa dữ liệu chi tiết từ API /api/cart/details
let cart = JSON.parse(localStorage.getItem('cart_v1') || '{}');
const $ = sel => document.querySelector(sel);

function formatMoney(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + '₫';
}

// 1. Hàm tải dữ liệu chi tiết giỏ hàng (Gọi API Cart Details)
async function loadCartData() {
    const cartKeys = Object.keys(cart);

    // Nếu giỏ rỗng thì render luôn (trống)
    if (cartKeys.length === 0) {
        renderCartPage();
        return;
    }

    try {
        const res = await fetch('/api/cart/details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cart: cart })
        });

        if (res.ok) {
            CART_DATA = await res.json();
            renderCartPage();
        } else {
            console.error("Lỗi API:", res.status);
            $('#cart-page-list').innerHTML = '<p style="color:red; text-align:center; padding:20px">Lỗi khi tải thông tin giỏ hàng.</p>';
        }
    } catch (err) {
        console.error("Lỗi kết nối:", err);
        $('#cart-page-list').innerHTML = '<p style="color:red; text-align:center; padding:20px">Không thể kết nối đến máy chủ.</p>';
    }
}

function saveCart() {
    localStorage.setItem('cart_v1', JSON.stringify(cart));
    renderCartPage();
}

// Cần định nghĩa ở global scope để HTML có thể gọi
window.changeQty = function (key, delta) {
    cart[key] = (cart[key] || 0) + delta;
    if (cart[key] <= 0) delete cart[key];
    saveCart();
}

// Cần định nghĩa ở global scope để HTML có thể gọi
window.removeItem = function (key) {
    if (confirm('Bạn chắc chắn muốn xóa sản phẩm này?')) {
        delete cart[key];
        saveCart();
    }
}

// 2. Hàm Render Giỏ hàng (Dùng dữ liệu từ CART_DATA)
function renderCartPage() {
    const cartList = $('#cart-page-list');
    const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
    let total = 0;

    if (cartCount === 0) {
        cartList.innerHTML = '<div class="empty-cart">Giỏ hàng của bạn đang trống <br><br> <a href="index.html" style="font-size:16px; color:#005FFF">Đi mua sắm ngay</a></div>';
        $('#cart-page-total').innerHTML = `Tổng cộng (0 Sản phẩm): <span>0₫</span>`;
        // Ẩn nút "Mua ngay" nếu giỏ trống
        $('#cart-page-checkout').disabled = true;
        return;
    }
    
    // Bật nút "Mua ngay"
    $('#cart-page-checkout').disabled = false;

    cartList.innerHTML = '';

    // Duyệt qua từng item trong LocalStorage
    Object.entries(cart).forEach(([key, qty]) => {
        // Lấy thông tin chi tiết từ CART_DATA đã fetch
        const itemDetails = CART_DATA[key];

        if (!itemDetails) {
            // Trường hợp có trong localStorage nhưng API không trả về (lỗi hoặc sp bị xóa)
            // Có thể chọn ẩn đi hoặc hiển thị loading
            return;
        }

        // Lấy thông tin cửa hàng (API trả về mảng stores với 1 phần tử)
        const storeInfo = itemDetails.stores[0];

        // Giá ưu tiên lấy từ store
        const price = storeInfo.ps_min_price_store || 0;
        const itemTotal = price * qty;
        total += itemTotal;

        // Xử lý ảnh (Ưu tiên ảnh cửa hàng, fallback ảnh sản phẩm gốc)
        let displayImage = itemDetails.product_image_url;
        if (storeInfo.product_images && storeInfo.product_images.length > 0) {
            displayImage = storeInfo.product_images[0].ps_image_url;
        }

        const item = document.createElement('div');
        item.className = 'cart-page-item';

        item.innerHTML = `
      <div class="col-product">
        <input type="checkbox" checked style="margin-right: 10px;" />
        <img src="${displayImage}" alt="${itemDetails.product_name}" onerror="this.src='images/placeholder.jpg'" />
        <div class="product-info">
          <h4>${itemDetails.product_name}</h4>
          <div class="shop-info">🏪 ${storeInfo.store_name}</div>
          <div class="shop-info" style="font-size:12px; color:#888">📍 ${storeInfo.store_address}</div>
        </div>
      </div>
      <div class="col-price" style="text-align:center;">${formatMoney(price)}</div>
      <div class="col-qty">
        <div class="qty-selector">
          <button class="qty-btn" onclick="changeQty('${key}', -1)">-</button>
          <div class="qty-display">${qty}</div>
          <button class="qty-btn" onclick="changeQty('${key}', 1)">+</button>
        </div>
      </div>
      <div class="col-total" style="text-align:center; font-weight: 500;">${formatMoney(itemTotal)}</div>
      <div class="col-action" style="text-align: right;">
        <a class="delete-btn" onclick="removeItem('${key}')">Xóa</a>
      </div>
    `;

        cartList.appendChild(item);
    });

    $('#cart-page-total').innerHTML = `Tổng cộng (${cartCount} Sản phẩm): <span>${formatMoney(total)}</span>`;
}

// THAY ĐỔI LỚN: Nút "Mua ngay" chuyển hướng đến checkout.html
$('#cart-page-checkout').addEventListener('click', () => {
    const count = Object.values(cart).reduce((s, q) => s + q, 0);
    if (count === 0) { 
        alert('Giỏ hàng đang trống!'); 
        return; 
    }

    // Chuyển hướng đến trang thanh toán
    window.location.href = 'checkout.html';
});

// Khởi chạy khi tải trang
window.onload = function () {
    loadCartData();
};