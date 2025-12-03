const $ = sel => document.querySelector(sel);
let cart = JSON.parse(localStorage.getItem('cart_v1') || '{}');
let checkoutItemsData = []; // Mảng chứa dữ liệu chuẩn bị gửi lên DB
let totalAmount = 0;

function formatMoney(n) { 
    if (typeof n !== 'number') return '0₫';
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + '₫'; 
}

// 1. Load dữ liệu giỏ hàng
async function loadCheckoutInfo() {
    const cartKeys = Object.keys(cart);
    if (cartKeys.length === 0) {
        alert("Giỏ hàng trống!");
        window.location.href = "index.html";
        return;
    }

    // Tự động điền tên nếu đã đăng nhập
    const savedName = localStorage.getItem('userName');
    if(savedName) {
        const nameInput = $('#cus_name');
        if(nameInput) nameInput.value = savedName;
    }

    try {
        // Gọi API Python lấy thông tin hiển thị (Tên, giá, ảnh...)
        const res = await fetch('/api/cart/details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cart: cart })
        });

        if (res.ok) {
            const data = await res.json();
            // Gọi hàm render (đã chuyển thành async để tra cứu ID nếu thiếu)
            await renderOrderSummary(data);
        } else {
            console.error("Lỗi API:", res.status);
            $('#checkout-items').innerHTML = '<p style="color:red">Lỗi tải dữ liệu.</p>';
        }
    } catch (err) { 
        console.error(err); 
        $('#checkout-items').innerHTML = '<p style="color:red">Lỗi kết nối.</p>';
    }
}

// 2. Hiển thị & Chuẩn bị dữ liệu (Quan trọng: Xử lý tìm ps_id)
async function renderOrderSummary(data) {
    const listDiv = $('#checkout-items');
    listDiv.innerHTML = '';
    totalAmount = 0;
    checkoutItemsData = [];

    // Dùng Promise.all để xử lý bất đồng bộ (tìm ID) cho từng món hàng
    const promises = Object.entries(cart).map(async ([key, qty]) => {
        const details = data[key];
        if (!details) return;

        // Tách ID từ key (VD: "123_456" -> prodId=123, storeId=456)
        const [prodId, storeId] = key.split('_');
        const storeInfo = details.stores[0];
        
        // Lấy giá
        const price = storeInfo.ps_min_price_store || storeInfo.min_price_store || 0;
        const subtotal = price * qty;
        
        // === FIX LỖI NULL ps_id TẠI ĐÂY ===
        // 1. Thử lấy ps_id từ API
        let finalPsId = storeInfo.ps_id;

        // 2. Nếu API không trả về ps_id, tự tra cứu trong Supabase
        if (!finalPsId) {
            console.warn(`Thiếu ps_id cho sản phẩm ${prodId}, đang tìm trong DB...`);
            const { data: dbData } = await supabase
                .from('product_store')
                .select('ps_id')
                .eq('product_id', prodId)
                .eq('store_id', storeId)
                .single();
            
            if (dbData) {
                finalPsId = dbData.ps_id;
            } else {
                console.error(`Không tìm thấy ps_id cho ${key}`);
                return; // Bỏ qua món lỗi này để không hỏng cả đơn
            }
        }

        // 3. Cộng dồn tiền (chỉ cộng khi item hợp lệ)
        totalAmount += subtotal;

        // 4. Đẩy vào mảng gửi đi (đảm bảo ps_id luôn có giá trị)
        checkoutItemsData.push({
            ps_id: finalPsId,
            quantity: qty,
            price: price
        });

        // 5. Trả về HTML để render (để sắp xếp đúng thứ tự sau này nếu cần)
        const row = document.createElement('div');
        row.className = 'order-item';
        
        // Cấu trúc HTML đã được sửa trong CSS để hiển thị rõ ràng hơn
        row.innerHTML = `
            <div style="display:flex; justify-content:space-between; width:100%">
                <span><b>${qty}x ${details.product_name}</b></span>
                <span style="font-weight: bold;">${formatMoney(subtotal)}</span>
            </div>
            <div style="font-size:12px; color:#888; margin-top: 3px;">
                ${storeInfo.store_name} | ${formatMoney(price)}/sản phẩm
            </div>
        `;
        return row;
    });

    // Đợi tất cả các món hàng được xử lý xong
    const rows = await Promise.all(promises);
    
    // Render ra màn hình
    rows.forEach(row => {
        if(row) listDiv.appendChild(row);
    });

    // Cập nhật tổng tiền
    $('#final-total').textContent = formatMoney(totalAmount);
}

// 3. Xử lý nút ĐẶT HÀNG
async function handlePlaceOrder() {
    const name = $('#cus_name').value.trim();
    const phone = $('#cus_phone').value.trim();
    const address = $('#cus_address').value.trim();
    const paymentMethodEl = document.querySelector('input[name="payment"]:checked');
    const paymentMethod = paymentMethodEl ? paymentMethodEl.value : 'COD';

    // Validate
    if (!name || !phone || !address) {
        alert("Vui lòng điền đầy đủ thông tin giao hàng!");
        return;
    }

    if (checkoutItemsData.length === 0) {
        alert("Danh sách sản phẩm trống hoặc lỗi dữ liệu. Vui lòng tải lại trang.");
        return;
    }

    const btn = $('#btn-place-order');
    const originalText = btn.textContent;
    btn.textContent = "Đang xử lý...";
    btn.disabled = true;

    try {
        // GỌI HÀM SQL create_new_order
        const { data, error } = await supabase.rpc('create_new_order', {
            p_user_name: name,
            p_phone: phone,
            p_address: address,
            p_payment_method: paymentMethod,
            p_total_price: totalAmount,
            p_items: checkoutItemsData 
        });

        if (error) throw error;

        // Thành công
        alert(`✅ Đặt hàng thành công!\nMã đơn hàng: #${data}`);
        
        // Xóa giỏ hàng & về trang chủ
        localStorage.removeItem('cart_v1');
        window.location.href = "index.html"; 

    } catch (err) {
        console.error("Lỗi đặt hàng:", err);
        alert("Lỗi hệ thống: " + (err.message || err.details || JSON.stringify(err)));
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadCheckoutInfo();
    const btnPlaceOrder = $('#btn-place-order');
    if (btnPlaceOrder) {
        btnPlaceOrder.addEventListener('click', handlePlaceOrder);
    }
});