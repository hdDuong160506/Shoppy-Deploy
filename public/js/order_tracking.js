// ======================================================================
// ORDER TRACKING LOGIC
// ======================================================================
const supabase = window.supabase;
let currentUser = null;
let editingItem = null;
let showCompletedOrders = true; // Mặc định hiển thị đơn hàng đã hoàn thành
let allOrders = []; // Lưu tất cả đơn hàng để lọc

// Utility function
const $ = sel => document.querySelector(sel);

// Utility functions từ product-detail.js
function formatMoney(n) {
    if (typeof n !== 'number') return '0₫';
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + '₫';
}

function showNotification(message, icon = '✅') {
    // Tạo notification đơn giản
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${icon === '✅' ? '#4CAF50' : '#f44336'};
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.innerHTML = `${icon} ${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Load orders
async function loadUserOrders() {
    console.log('=== START loadUserOrders ===');
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
        console.error('Auth error:', authError);
        window.location.href = 'account.html';
        return;
    }
    
    if (!user) {
        console.log('No user found, redirecting to login');
        window.location.href = 'account.html';
        return;
    }

    currentUser = user;
    console.log('Current user loaded:', currentUser.id);
    
    try {
        // Hiển thị loading
        const fullPageLoading = $('#full-page-loading');
        if (fullPageLoading) fullPageLoading.style.display = 'flex';
        
        // Lấy danh sách đơn hàng
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading orders:', error);
            throw error;
        }

        console.log('Orders loaded:', orders); // DEBUG
        allOrders = orders; // Lưu tất cả đơn hàng
        renderOrders();
    } catch (error) {
        console.error('Lỗi tải đơn hàng:', error);
        showNotification('Không thể tải danh sách đơn hàng', '❌');
    } finally {
        // Ẩn loading
        const fullPageLoading = $('#full-page-loading');
        if (fullPageLoading) fullPageLoading.style.display = 'none';
        console.log('=== END loadUserOrders ===');
    }
}

// Lọc và render orders
function renderOrders() {
    console.log('=== START renderOrders ===');
    
    const ordersList = $('#orders-list');
    const loadingState = $('#loading-state');
    const emptyState = $('#empty-state');

    loadingState.style.display = 'none';

    // Lọc đơn hàng theo trạng thái
    let filteredOrders = allOrders;
    if (!showCompletedOrders) {
        filteredOrders = allOrders.filter(order => order.status !== 'completed');
    }

    console.log('Filtered orders count:', filteredOrders.length);
    console.log('All orders count:', allOrders.length);
    console.log('Show completed:', showCompletedOrders);

    if (!filteredOrders || filteredOrders.length === 0) {
        ordersList.style.display = 'none';
        
        // Hiển thị thông báo phù hợp
        if (allOrders.length === 0) {
            emptyState.innerHTML = `
                <div class="empty-icon">🛒</div>
                <h3>Chưa có đơn hàng nào</h3>
                <p>Hãy mua sắm và quay lại để theo dõi đơn hàng của bạn!</p>
                <a href="index.html" class="btn-primary" style="margin-top: 20px; display: inline-block;">Mua sắm ngay</a>
            `;
        } else {
            emptyState.innerHTML = `
                <div class="empty-icon">🔍</div>
                <h3>Không có đơn hàng đang xử lý</h3>
                <p>Tất cả đơn hàng của bạn đều đã hoàn thành.</p>
                <button class="btn-secondary" onclick="toggleCompletedOrders(true)" style="margin-top: 20px; display: inline-block;">
                    Hiển thị đơn hàng đã hoàn thành
                </button>
            `;
        }
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    ordersList.style.display = 'flex';
    ordersList.innerHTML = '';

    filteredOrders.forEach(order => {
        const orderCard = createOrderCard(order);
        ordersList.appendChild(orderCard);
        
        // Load order items
        loadOrderItems(order.order_id, orderCard, order.status);
    });
    
    console.log('=== END renderOrders ===');
}

// Create order card
function createOrderCard(order) {
    console.log('Creating card for order:', order.order_id, 'status:', order.status);
    
    const div = document.createElement('div');
    div.className = 'order-card';
    div.dataset.orderId = order.order_id;
    div.dataset.orderStatus = order.status;

    const statusClass = getStatusClass(order.status);
    const statusText = getStatusText(order.status);

    div.innerHTML = `
        <div class="order-header">
            <div class="order-info">
                <div class="order-id">Đơn hàng #${order.order_id}</div>
                <div class="order-date">${new Date(order.created_at).toLocaleDateString('vi-VN')}</div>
            </div>
            <div>
                <span class="order-status ${statusClass}">${statusText}</span>
            </div>
            <div class="order-total">${formatMoney(order.total_price || 0)}</div>
        </div>
        <div class="order-details">
            <div class="order-items" id="items-${order.order_id}">
                <p>Đang tải sản phẩm...</p>
            </div>
            <div class="status-timeline" id="timeline-${order.order_id}"></div>
            <div class="order-summary">
                <div class="summary-item">
                    <span class="summary-label">Tổng tiền hàng:</span>
                    <span class="summary-value">${formatMoney(order.total_price || 0)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Phương thức thanh toán:</span>
                    <span class="summary-value">${getPaymentMethodText(order.payment_method)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Địa chỉ giao hàng:</span>
                    <span class="summary-value">${order.address}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Người nhận:</span>
                    <span class="summary-value">${order.user_name}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">SĐT:</span>
                    <span class="summary-value">${order.phone}</span>
                </div>
            </div>
            <div class="order-actions" id="actions-${order.order_id}">
                ${order.status === 'pending' ? 
                    '<button class="btn-confirm" onclick="confirmDelivery(' + order.order_id + ')">Xác nhận đã nhận hàng</button>' : 
                    ''}
            </div>
        </div>
    `;

    renderStatusTimeline(order.order_id, order.status, div);
    return div;
}

// Load order items
async function loadOrderItems(orderId, orderCard, orderStatus) {
    try {
        console.log('Loading items for order:', orderId);
        
        const { data: orderItems, error } = await supabase
            .from('order_items')
            .select(`
                *,
                product_store:ps_id (
                    ps_id,
                    product:product_id (
                        product_id,
                        name,
                        image_url
                    ),
                    store:store_id (
                        store_id,
                        name
                    ),
                    min_price_store
                )
            `)
            .eq('order_id', orderId);

        if (error) {
            console.error('Error loading order items:', error);
            throw error;
        }

        console.log('Order items loaded:', orderItems);
        renderOrderItems(orderId, orderItems);
        checkReviewEligibility(orderId, orderItems, orderStatus);
    } catch (error) {
        console.error('Lỗi tải sản phẩm:', error);
        const itemsContainer = orderCard.querySelector(`#items-${orderId}`);
        itemsContainer.innerHTML = '<p style="color: red;">Lỗi tải sản phẩm</p>';
    }
}

// Render order items
function renderOrderItems(orderId, items) {
    const container = $(`#items-${orderId}`);
    if (!container) {
        console.error('Container not found for order:', orderId);
        return;
    }

    if (!items || items.length === 0) {
        container.innerHTML = '<p>Không có sản phẩm</p>';
        return;
    }

    container.innerHTML = '';

    items.forEach(item => {
        const product = item.product_store?.product;
        const store = item.product_store?.store;
        
        const itemDiv = document.createElement('div');
        itemDiv.className = 'order-item';
        itemDiv.dataset.itemId = item.item_id;
        itemDiv.dataset.psId = item.ps_id;

        const imageUrl = product?.image_url || 'images/placeholder.jpg';
        const productName = product?.name || 'Sản phẩm không xác định';
        const storeName = store?.name || 'Cửa hàng không xác định';
        const price = item.price_at_purchase || item.product_store?.min_price_store || 0;

        itemDiv.innerHTML = `
            <img src="${imageUrl}" alt="${productName}" class="item-image" 
                 onerror="this.src='images/placeholder.jpg'">
            <div class="item-info">
                <div class="item-name">${productName}</div>
                <div class="item-store">${storeName}</div>
                <div class="item-price">${formatMoney(price)}</div>
                <div class="item-quantity">Số lượng: ${item.quantity}</div>
            </div>
            <div class="item-actions">
                <button class="btn-review" 
                        onclick="openReviewModal(${orderId}, ${item.item_id}, ${item.ps_id}, '${productName.replace(/'/g, "\\'")}')"
                        id="review-btn-${item.item_id}">
                    Đánh giá
                </button>
            </div>
        `;

        container.appendChild(itemDiv);
    });
}

// Check review eligibility - CHỈ CÓ pending và completed
async function checkReviewEligibility(orderId, items, orderStatus) {
    try {
        console.log('Checking review eligibility for order:', orderId, 'status:', orderStatus);
        
        // Lấy reviews đã có cho order này
        const { data: existingReviews } = await supabase
            .from('reviews')
            .select('ps_id')
            .eq('user_id', currentUser.id)
            .in('ps_id', items.map(item => item.ps_id));

        const reviewedPsIds = existingReviews?.map(r => r.ps_id) || [];
        
        console.log('Reviewed PS IDs:', reviewedPsIds);

        items.forEach(item => {
            const reviewBtn = $(`#review-btn-${item.item_id}`);
            if (reviewBtn) {
                // Chỉ cho review nếu đơn hàng đã completed và chưa review
                const canReview = (orderStatus === 'completed') 
                    && !reviewedPsIds.includes(item.ps_id);
                
                console.log(`Item ${item.item_id}: canReview = ${canReview}, status=${orderStatus}, reviewed=${reviewedPsIds.includes(item.ps_id)}`);
                
                if (canReview) {
                    reviewBtn.disabled = false;
                    reviewBtn.classList.remove('disabled');
                    reviewBtn.title = 'Đánh giá sản phẩm';
                } else {
                    reviewBtn.disabled = true;
                    reviewBtn.classList.add('disabled');
                    
                    if (orderStatus !== 'completed') {
                        reviewBtn.title = `Chỉ có thể đánh giá khi đơn hàng đã hoàn thành (Hiện tại: ${getStatusText(orderStatus)})`;
                    } else if (reviewedPsIds.includes(item.ps_id)) {
                        reviewBtn.title = 'Bạn đã đánh giá sản phẩm này';
                    } else {
                        reviewBtn.title = 'Không thể đánh giá';
                    }
                }
            }
        });
    } catch (error) {
        console.error('Lỗi kiểm tra đánh giá:', error);
    }
}

// Status helper functions - CHỈ 2 TRẠNG THÁI
function getStatusClass(status) {
    const statusMap = {
        'pending': 'status-pending',
        'completed': 'status-delivered', // completed hiển thị màu xanh
        'cancelled': 'status-cancelled'  // nếu có
    };
    return statusMap[status] || 'status-pending';
}

function getStatusText(status) {
    const statusMap = {
        'pending': 'Chờ xử lý',
        'completed': 'Đã hoàn thành', // hoặc "Đã giao"
        'cancelled': 'Đã hủy'
    };
    return statusMap[status] || 'Chờ xử lý';
}

function getPaymentMethodText(method) {
    const methodMap = {
        'cod': 'Thanh toán khi nhận hàng',
        'momo': 'Ví MoMo',
        'bank': 'Chuyển khoản ngân hàng',
        'vnpay': 'VNPay'
    };
    return methodMap[method] || method || 'Không xác định';
}

// Status timeline 
function renderStatusTimeline(orderId, status, orderCard) {
    const timeline = orderCard.querySelector(`#timeline-${orderId}`);
    if (!timeline) return;

    // Chỉ có 2 bước: pending và completed
    const steps = [
        { id: 'pending', label: 'Chờ xử lý' },
        { id: 'completed', label: 'Đã hoàn thành' }
    ];

    let statusIndex = steps.findIndex(step => step.id === status);
    if (statusIndex === -1) statusIndex = 0; // Mặc định là pending
    
    timeline.innerHTML = steps.map((step, index) => {
        let stepClass = '';
        if (status === 'cancelled') {
            stepClass = '';
        } else if (index < statusIndex) {
            stepClass = 'completed';
        } else if (index === statusIndex) {
            stepClass = 'active';
        }

        return `
            <div class="status-step ${stepClass}">
                <div class="status-icon">${index + 1}</div>
                <div class="status-label">${step.label}</div>
            </div>
        `;
    }).join('');
}

// Confirm delivery - FIXED VERSION (no delivered_at column)
async function confirmDelivery(orderId) {
    console.log('🔍 === START confirmDelivery ===');
    console.log('Order ID:', orderId);
    console.log('Current User ID:', currentUser?.id);
    
    if (!currentUser) {
        showNotification('Vui lòng đăng nhập lại', '❌');
        return;
    }
    
    if (!confirm('Bạn có chắc chắn đã nhận được hàng?')) return;
    
    // Hiển thị loading
    const fullPageLoading = $('#full-page-loading');
    if (fullPageLoading) fullPageLoading.style.display = 'flex';
    
    try {
        // PHƯƠNG PHÁP 1: Direct update (chỉ update status và updated_at)
        console.log('🔄 1. Trying direct update (no delivered_at)...');
        const { data: updateData, error: updateError } = await supabase
            .from('orders')
            .update({ 
                status: 'completed',
                updated_at: new Date().toISOString()
            })
            .eq('order_id', orderId)
            .eq('user_id', currentUser.id)
            .select(); // Thêm select để xem kết quả

        console.log('Update response:', { updateData, updateError });
        
        if (updateError) {
            console.error('❌ Direct update failed:', updateError);
            
            // PHƯƠNG PHÁP 2: Update chỉ status
            console.log('🔄 2. Trying update only status...');
            const { data: updateData2, error: updateError2 } = await supabase
                .from('orders')
                .update({ 
                    status: 'completed'
                })
                .eq('order_id', orderId)
                .eq('user_id', currentUser.id)
                .select();

            console.log('Update 2 response:', { updateData2, updateError2 });
            
            if (updateError2) {
                console.error('❌ Update only status failed:', updateError2);
                
                // PHƯƠNG PHÁP 3: Dùng RPC function (đã sửa)
                console.log('🔄 3. Using RPC function...');
                const { data: rpcData, error: rpcError } = await supabase.rpc(
                    'update_order_to_completed_simple', // Dùng function mới
                    {
                        p_order_id: orderId,
                        p_user_id: currentUser.id
                    }
                );

                console.log('RPC response:', { rpcData, rpcError });
                
                if (rpcError) {
                    throw rpcError;
                }
                
                console.log('RPC succeeded:', rpcData);
            } else {
                console.log('Update only status succeeded:', updateData2);
            }
        } else {
            console.log('Direct update succeeded:', updateData);
        }

        showNotification('Đã xác nhận nhận hàng thành công!', '✅');
        
        // Refresh ngay lập tức
        setTimeout(() => {
            console.log('🔄 Refreshing order list...');
            loadUserOrders();
        }, 1000);
        
    } catch (error) {
        console.error('=== confirmDelivery ERROR ===', error);
        
        // Hiển thị thông báo lỗi chi tiết
        let errorMsg = 'Không thể xác nhận nhận hàng. ';
        
        if (error.code === '23502') {
            errorMsg = 'Lỗi: Thiếu dữ liệu bắt buộc.';
        } else if (error.code === '23505') {
            errorMsg = 'Lỗi: Dữ liệu trùng lặp.';
        } else if (error.code === '42501') {
            errorMsg = 'Lỗi: Không có quyền thực hiện.';
        } else if (error.message) {
            errorMsg += error.message;
        }
        
        showNotification(errorMsg, '❌');
        
    } finally {
        // Ẩn loading
        if (fullPageLoading) fullPageLoading.style.display = 'none';
        console.log('🔍 === END confirmDelivery ===');
    }
}

// Toggle completed orders visibility
function toggleCompletedOrders(forceShow = false) {
    if (forceShow) {
        showCompletedOrders = true;
    } else {
        showCompletedOrders = !showCompletedOrders;
    }
    
    // Cập nhật checkbox
    const toggle = $('#toggle-completed-orders');
    if (toggle) {
        toggle.checked = showCompletedOrders;
    }
    
    // Cập nhật text
    updateToggleText();
    
    // Re-render orders
    renderOrders();
}

function updateToggleText() {
    const labelText = $('.toggle-label-text');
    if (labelText) {
        labelText.textContent = showCompletedOrders ? 
            'Hiển thị đơn hàng đã hoàn thành' : 
            'Ẩn đơn hàng đã hoàn thành';
    }
}

// Review modal functions
function openReviewModal(orderId, itemId, psId, productName) {
    editingItem = { orderId, itemId, psId, productName };
    
    // Reset form
    document.querySelectorAll('#edit-rating-stars input').forEach(input => {
        input.checked = false;
    });
    $('#edit-review-comment').value = '';
    
    // Update modal title
    $('#edit-review-modal .modal-header h3').textContent = `Đánh giá: ${productName}`;
    
    $('#edit-review-modal').style.display = 'flex';
}

function closeEditReviewModal() {
    $('#edit-review-modal').style.display = 'none';
    editingItem = null;
}

async function submitOrderReview() {
    if (!editingItem || !currentUser) return;

    const ratingEl = document.querySelector('input[name="edit-rating"]:checked');
    const comment = $('#edit-review-comment').value.trim();

    if (!ratingEl) {
        showNotification('Vui lòng chọn số sao!', '❌');
        return;
    }

    const btn = $('#edit-review-modal .btn-primary');
    const originalText = btn.textContent;
    btn.textContent = 'Đang gửi...';
    btn.disabled = true;

    try {
        const { error } = await supabase
            .from('reviews')
            .insert([{
                ps_id: editingItem.psId,
                user_id: currentUser.id,
                rating: parseInt(ratingEl.value),
                comment: comment
            }]);

        if (error) throw error;

        showNotification('Cảm ơn bạn đã đánh giá!', '✅');
        closeEditReviewModal();
        
        // Refresh để update review button
        loadUserOrders();

    } catch (error) {
        console.error('Lỗi gửi đánh giá:', error);
        showNotification('Gửi đánh giá thất bại', '❌');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Update account link (reuse từ product-detail.js)
async function updateAccountLink() {
    console.log('Updating account link...');
    
    const accountLink = $('#account-link');
    const logoutLink = $('#logout-link');

    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
        console.error('Error getting session:', error);
        return;
    }
    
    if (session && session.user) {
        console.log('User is logged in:', session.user.id);
        
        // Lấy tên user từ profiles
        try {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('name')
                .eq('id', session.user.id)
                .single();

            if (profileError) {
                console.error('Error loading profile:', profileError);
            }

            const userName = profile?.name || session.user.email?.split('@')[0] || 'Người dùng';
            
            accountLink.innerHTML = `👋 Chào, <b>${userName}</b>`;
            accountLink.href = 'profile.html';
            
            if (logoutLink) {
                logoutLink.style.display = 'flex';
                logoutLink.onclick = async () => {
                    if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
                        await supabase.auth.signOut();
                        localStorage.removeItem('userName');
                        window.location.reload();
                    }
                };
            }
        } catch (err) {
            console.error('Error in updateAccountLink:', err);
        }
    } else {
        console.log('No active session');
        accountLink.textContent = 'Tài Khoản';
        accountLink.href = 'account.html';
        if (logoutLink) logoutLink.style.display = 'none';
    }
}

// Check database schema
async function checkDatabaseSchema() {
    console.log('=== Checking Database Schema ===');
    
    try {
        // Kiểm tra bảng orders
        const { data: ordersSample, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .limit(1)
            .single();
            
        if (ordersError) {
            console.error('Orders table error:', ordersError);
        } else {
            console.log('Orders table sample:', ordersSample);
            console.log('Columns:', Object.keys(ordersSample));
        }
        
        // Kiểm tra RLS
        console.log('Checking RLS policies...');
        // (Cần truy cập SQL Editor trong Supabase để xem)
        
    } catch (error) {
        console.error('Schema check error:', error);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('=== ORDER TRACKING INIT ===');
    
    // Kiểm tra schema
    await checkDatabaseSchema();
    
    // Update account link trước
    await updateAccountLink();
    
    // Load user orders
    await loadUserOrders();

    // Setup toggle event listener
    const toggleCheckbox = $('#toggle-completed-orders');
    if (toggleCheckbox) {
        toggleCheckbox.addEventListener('change', function() {
            showCompletedOrders = this.checked;
            updateToggleText();
            renderOrders();
        });
    }

    // Update toggle text
    updateToggleText();

    // Setup modal event listeners
    $('#edit-review-modal').addEventListener('click', (e) => {
        if (e.target === $('#edit-review-modal')) {
            closeEditReviewModal();
        }
    });

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeEditReviewModal();
        }
    });  
    console.log('=== INIT COMPLETE ===');
});

// Thêm CSS animation cho notification
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);