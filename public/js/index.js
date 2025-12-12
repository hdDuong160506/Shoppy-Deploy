// ======================================================================
// HÀM QUẢN LÝ LOADING OVERLAY
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
// PHẦN 1: HÀM FORMAT TIỀN, LOAD VÀ RENDER SẢN PHẨM
// ======================================================================

// Danh sách sản phẩm lấy từ server
let PRODUCTS = [];

// Giỏ hàng lưu trong localStorage (dạng object: "productId_storeId": số lượng)
let cart = JSON.parse(localStorage.getItem('cart_v1') || '{}');

// THÊM MỚI: Cache chi tiết sản phẩm trong giỏ hàng (Đồng bộ với product-detail.js)
let CART_CACHE = {};

// Hàm rút gọn querySelector
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel); // Thêm $$

// Format tiền theo dạng 100000 → "100.000₫"
function formatMoney(n) {
	if (typeof n !== 'number') return '0₫';
	return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + '₫';
}

// --------------------------------------------------------------------------
// THÊM MỚI: HÀM LẤY VÀ HIỂN THỊ GỢI Ý TÌM KIẾM
// --------------------------------------------------------------------------
let suggestionTimeout;
let highlightedIndex = -1; // Index của gợi ý đang được highlight

function showSuggestions() {
	$('#search_suggestions').style.display = 'block';
}

function hideSuggestions() {
	$('#search_suggestions').style.display = 'none';
	highlightedIndex = -1;
}

async function fetchSuggestions(query) {
	if (!query || query.length < 2) {
		hideSuggestions();
		return;
	}

	try {
		// Giả lập gọi API gợi ý tìm kiếm (chỉ lấy 5 sản phẩm đầu tiên)
		// CẦN THAY THẾ bằng API thật khi triển khai
		const res = await fetch(`/api/products?search=${encodeURIComponent(query)}&limit=5`);
		const suggestions = await res.json();

		renderSuggestions(suggestions, query);

	} catch (err) {
		console.error("Lỗi khi fetch gợi ý tìm kiếm:", err);
		hideSuggestions();
	}
}

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
            <div class="suggestion-location">📍 ${product.location_name}</div>
        </div>
    `;

		item.dataset.productId = product.product_id;
		item.addEventListener('click', () => navigateToProductSummary(product.product_id));
		container.appendChild(item);
	});

	showSuggestions();
}

function scrollToSearchResults() { // HÀM CUỘN TRANG MỚI
	const resultsTitle = $('#search-results-title');

	if (resultsTitle) {
		// Cuộn đến vị trí của tiêu đề kết quả
		resultsTitle.scrollIntoView({
			behavior: 'smooth', // Hiệu ứng cuộn mượt
			block: 'center'	 // Cuộn đến đầu của phần tử
		});
	}
}

function submitSearch(query) {
	// Đặt giá trị vào ô input và submit form
	$('#search_input').value = query;
	hideSuggestions();

	// Ẩn tiêu đề sản phẩm gợi ý
	const suggestedTitle = $('#suggested-products-title');
	if (suggestedTitle) {
		suggestedTitle.style.display = 'none';
	}

	// Hiển thị tiêu đề kết quả tìm kiếm
	const resultsTitle = $('#search-results-title');
	if (resultsTitle) {
		resultsTitle.textContent = `🔍 Kết quả tìm kiếm cho "${query}"`;
		resultsTitle.style.display = 'block';
	}

	const searchForm = $('#search_form');
	// Trigger submit để tải sản phẩm
	searchForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

	// THÊM: Cuộn xuống kết quả
	scrollToSearchResults();
}

function navigateToProductSummary(productId) {
	// Chuyển sang trang tổng quan sản phẩm
	window.location.href = `product-summary.html?product_id=${productId}`;
	hideSuggestions();
}
// --------------------------------------------------------------------------

// Load sản phẩm từ API (ĐÃ BỎ THAM SỐ distance VÀ price)
async function loadProducts(search = '') {
	const wrap = $('#suggested-products-list');

	showLoading(); // HIỂN THỊ LOADING

	// Xóa nội dung hiển thị cũ
	if (wrap) {
		wrap.innerHTML = '';
	}

	try {
		// Gọi API kèm query filter
		const res = await fetch(`/api/products?search=${encodeURIComponent(search)}`);

		// Kết quả JSON chứa danh sách sản phẩm
		PRODUCTS = await res.json();

		// Render kết quả tìm kiếm vào phần gợi ý
		renderSearchResults(PRODUCTS, search);

	} catch (err) {
		console.error("Lỗi khi load sản phẩm:", err);

		// Hiển thị thông báo lỗi
		renderSearchResultsError('Không thể kết nối đến server.');
	} finally {
		hideLoading(); // ẨN LOADING DÙ THÀNH CÔNG HAY THẤT BẠI
	}
}

// HÀM CHUNG: Tạo product card element
function createProductCard(product) {
	const detailUrl = `product-summary.html?product_id=${product.product_id}`;
	const imageUrl = product.product_image_url || 'images/placeholder.jpg';

	// Xử lý giá - hỗ trợ cả 2 định dạng từ API
	const minPrice = product.min_price || product.product_min_cost;
	const maxPrice = product.max_price || product.product_max_cost;

	let priceText = '';
	if (minPrice && minPrice > 0 && maxPrice && maxPrice > 0) {
		const minFormatted = minPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
		const maxFormatted = maxPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
		priceText = `${minFormatted} - ${maxFormatted}₫`;
	} else if (minPrice && minPrice > 0) {
		priceText = formatMoney(minPrice);
	} else {
		priceText = 'Liên hệ qua facebook';
	}

	// Khung chứa sản phẩm
	const productContainer = document.createElement('div');
	productContainer.className = 'product-container';

	productContainer.innerHTML = `
      <div class="product-info">
        <a href="${detailUrl}">
          <img src="${imageUrl}" alt="${product.product_name}">
        </a>
        <div>
            <a href="${detailUrl}" style="text-decoration:none; color:inherit;">
              <h3>${product.product_name}</h3>
            </a>
            <p class="product-location">📍 ${product.location_name}</p>
        </div>
        <div class="product-actions-main">
            <a href="${detailUrl}" style="text-decoration:none; color:inherit;">
              <p class="product-price">${priceText}</p>
              <p style="font-size:12px; color:#555;">(Giá trung bình từ các cửa hàng)</p>
            </a>
        </div>
      </div>
    `;

	// Hiệu ứng hover
	productContainer.addEventListener('mouseenter', () => {
		productContainer.style.transform = 'translateY(-5px) scale(1.03)';
		productContainer.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.2)';
	});

	productContainer.addEventListener('mouseleave', () => {
		productContainer.style.transform = 'translateY(0) scale(1)';
		productContainer.style.boxShadow = '0 4px 18px rgba(9, 11, 14, 0.06)';
	});

	return productContainer;
}

// Render kết quả tìm kiếm vào phần gợi ý
function renderSearchResults(products, searchQuery = '') {
	const wrap = $('#suggested-products-list');

	if (!wrap) return;

	// Nếu không có sản phẩm
	if (!products || products.length === 0) {
		wrap.innerHTML = `
			<div class="no-results" style="text-align:center; padding:40px 20px; width:100%; color:#666;">
				<svg xmlns="http://www.w3.org/2000/svg" height="60" viewBox="0 -960 960 960" width="60" fill="#ccc" style="margin-bottom:20px;">
					<path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
				</svg>
				<h3 style="margin:10px 0; color:#333;">Không tìm thấy sản phẩm "${searchQuery}"</h3>
				<p style="color:#888; font-size:14px;">Hãy thử tìm kiếm với từ khóa khác hoặc dùng hình ảnh để tìm kiếm</p>
			</div>
		`;
		return;
	}

	wrap.innerHTML = '';

	products.forEach(product => {
		const productCard = createProductCard(product);
		wrap.appendChild(productCard);
	});

	if (products && products.length > 0) {
		addBackToSuggestionsButton();
	}
}

// Hiển thị lỗi tìm kiếm
function renderSearchResultsError(message) {
	const wrap = $('#suggested-products-list');
	if (wrap) {
		wrap.innerHTML = `<p style="color:red; text-align:center; grid-column:1/-1;">${message}</p>`;
	}
}

// --------------------------------------------------------------------------
// PHẦN MỚI: LOAD VÀ RENDER SẢN PHẨM GỢI Ý
// --------------------------------------------------------------------------

// Load sản phẩm gợi ý từ API
async function loadSuggestedProducts(locationName = null, useGps = false) {
	const wrap = $('#suggested-products-list');

	showLoading(); // HIỂN THỊ LOADING

	// Xóa nội dung hiển thị cũ
	if (wrap) {
		wrap.innerHTML = '';
	}

	// ẨN TIÊU ĐỀ KẾT QUẢ TÌM KIẾM & HIỂN THỊ TIÊU ĐỀ SẢN PHẨM GỢI Ý
	const resultsTitle = $('#search-results-title');
	if (resultsTitle) {
		resultsTitle.style.display = 'none';
	}

	const suggestedTitle = $('#suggested-products-title');
	if (suggestedTitle) {
		suggestedTitle.style.display = 'none';
	}


	

	try {
		// Gọi API với param use_gps
		const res = await fetch('/api/suggest_products', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				location_name: locationName,
				use_gps: useGps,
				limit: 100
			})
		});

		const data = await res.json();

		if (data.status === 'success' && data.products) {
			renderSuggestedProducts(data.products);

			// Lấy location_name từ API và đẩy vào ô địa chỉ
			if (data.location_name && $('#search_address_input')) {
				$('#search_address_input').value = data.location_name;
			}
		} else {
			$('#suggested-products-list').innerHTML = '<p style="color:#888; text-align:center; grid-column:1/-1; padding:40px 20px;">Không có sản phẩm gợi ý.</p>';
		}

	} catch (err) {
		console.error("Lỗi khi load sản phẩm gợi ý:", err);
		$('#suggested-products-list').innerHTML = '<p style="color:red; text-align:center; grid-column:1/-1; padding:40px 20px;">❌ Lỗi kết nối. Vui lòng thử lại.</p>';
	} finally {
		hideLoading(); // ẨN LOADING DÙ THÀNH CÔNG HAY THẤT BẠI
	}
}

let LOCATIONS = [];

// Hàm fetch locations từ API
async function fetchLocations() {
	try {
		const response = await fetch('/api/locations');
		const data = await response.json();

		if (data.status === 'success' && data.locations) {
			LOCATIONS = data.locations;
			renderLocationList();
		} else {
			console.error('❌ Không thể lấy danh sách locations:', data);
			renderLocationError();
		}
	} catch (error) {
		console.error('❌ Lỗi khi fetch locations:', error);
		renderLocationError();
	}
}

// Render danh sách locations vào dropdown
function renderLocationList() {
	const listWrap = $('#location-list');
	if (!listWrap) return;

	listWrap.innerHTML = ''; // Xóa loading message

	if (LOCATIONS.length === 0) {
		listWrap.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Không có địa điểm nào</div>';
		return;
	}

	LOCATIONS.forEach(loc => {
		const div = document.createElement('div');
		div.className = 'location-item';
		div.dataset.location = loc;
		div.innerHTML = `📍 ${loc}`;

		div.addEventListener('click', () => {
			const addressInput = $('#search_address_input');
			const dropdownMenu = $('#location-dropdown-menu');

			if (addressInput) addressInput.value = loc;
			if (dropdownMenu) dropdownMenu.classList.remove('active');

			// Lưu vào localStorage và load sản phẩm gợi ý
			localStorage.setItem('suggest_location_name', loc);
			localStorage.removeItem('suggest_use_gps');
			loadSuggestedProducts(loc);
		});

		listWrap.appendChild(div);
	});
}

// Hiển thị lỗi khi không load được locations
function renderLocationError() {
	const listWrap = $('#location-list');
	if (!listWrap) return;

	listWrap.innerHTML = '<div style="padding: 20px; text-align: center; color: #e74c3c;">❌ Không thể tải danh sách địa điểm</div>';
}
// Render sản phẩm gợi ý
function renderSuggestedProducts(products) {
	const wrap = $('#suggested-products-list');
	wrap.innerHTML = '';

	// Xóa nút "Xem sản phẩm gợi ý" nếu tồn tại
	const backButton = $('#back-to-suggestions-btn');
	if (backButton) {
		backButton.remove();
	}

	if (!products || products.length === 0) {
		wrap.innerHTML = '<p style="color:#888; text-align:center; grid-column:1/-1; padding:40px 20px;">Không có sản phẩm gợi ý.</p>';
		return;
	}

	products.forEach(product => {
		const productCard = createProductCard(product);
		wrap.appendChild(productCard);
	});
}

// Thêm nút để quay lại xem sản phẩm gợi ý
function addBackToSuggestionsButton() {
	const container = $('.suggested-products-section');
	if (!container) return;

	// Kiểm tra xem nút đã tồn tại chưa
	if ($('#back-to-suggestions-btn')) {
		$('#back-to-suggestions-btn').remove();
	}

	const backButton = document.createElement('button');
	backButton.id = 'back-to-suggestions-btn';
	backButton.innerHTML = '← Xem sản phẩm gợi ý';
	backButton.style.cssText = `
		display: block;
		margin: 20px auto;
		padding: 10px 20px;
		background: #f0f0f0;
		border: 1px solid #ddd;
		border-radius: 20px;
		cursor: pointer;
		color: #333;
		font-size: 14px;
		transition: all 0.3s;
		font-weight: 500;
	`;

	backButton.addEventListener('mouseenter', () => {
		backButton.style.background = '#e0e0e0';
		backButton.style.borderColor = '#ccc';
	});

	backButton.addEventListener('mouseleave', () => {
		backButton.style.background = '#f0f0f0';
		backButton.style.borderColor = '#ddd';
	});

	backButton.addEventListener('click', () => {
		resetToSuggestedProducts();
		backButton.remove();
	});

	// Thêm nút vào cuối container
	container.appendChild(backButton);
}

// Reset về trạng thái hiển thị sản phẩm gợi ý
function resetToSuggestedProducts() {
	// Xóa kết quả tìm kiếm
	$('#search_input').value = '';

	// Ẩn tiêu đề kết quả tìm kiếm
	const resultsTitle = $('#search-results-title');
	if (resultsTitle) {
		resultsTitle.style.display = 'none';
	}

	// Hiển thị lại tiêu đề sản phẩm gợi ý
	const suggestedTitle = $('#suggested-products-title');
	if (suggestedTitle) {
		suggestedTitle.style.display = 'block';
	}

	// Load lại sản phẩm gợi ý
	const savedLocationName = localStorage.getItem('suggest_location_name');
	const savedUseGps = localStorage.getItem('suggest_use_gps');

	if (savedUseGps === 'true') {
		// Nếu trước đó dùng GPS, load lại theo GPS
		loadSuggestedProducts(null, true);
	} else if (savedLocationName) {
		// Nếu trước đó nhập địa chỉ, khôi phục và load lại
		const addressInput = $('#search_address_input');
		if (addressInput) {
			addressInput.value = savedLocationName;
		}
		loadSuggestedProducts(savedLocationName);
	} else {
		// Mặc định: load sản phẩm gợi ý thông thường
		loadSuggestedProducts();
	}
}

// ======================================================================
// PHẦN 2: XỬ LÝ TÌM KIẾM & LỌC SẢN PHẨM
// ======================================================================

// Kiểm tra form tồn tại rồi mới gắn event submit
if (document.getElementById('search_form')) {

	document.getElementById('search_form').addEventListener('submit', async (e) => {
		e.preventDefault();
		hideSuggestions(); // Ẩn gợi ý khi submit

		const searchText = $('#search_input').value.trim(); // Thêm .trim() ngay từ đầu

		console.log('Tìm kiếm:', searchText);

		// NẾU CHUỖI RỖNG -> RESET VỀ SẢN PHẨM GỢI Ý
		if (!searchText) {
			resetToSuggestedProducts();
			return; // Dừng xử lý tiếp
		}

		// CÓ TỪ KHÓA TÌM KIẾM -> HIỂN THỊ KẾT QUẢ
		// Ẩn tiêu đề sản phẩm gợi ý
		const suggestedTitle = $('#suggested-products-title');
		if (suggestedTitle) {
			suggestedTitle.style.display = 'none';
		}

		// Hiển thị tiêu đề kết quả tìm kiếm
		const resultsTitle = $('#search-results-title');
		if (resultsTitle) {
			resultsTitle.textContent = `🔍 Kết quả tìm kiếm cho "${searchText}"`;
			resultsTitle.style.display = 'block';
		}

		// Load sản phẩm (ĐÃ BỎ THAM SỐ FILTER)
		await loadProducts(searchText);

		// THÊM: Cuộn xuống kết quả sau khi load xong sản phẩm
		scrollToSearchResults();
	});

	// --------------------------------------------------------------------------
	// THÊM MỚI: XỬ LÝ SỰ KIỆN GÕ PHÍM CHO GỢI Ý
	// --------------------------------------------------------------------------
	const searchInput = $('#search_input');

	// Lấy gợi ý khi gõ chữ
	searchInput.addEventListener('input', () => {
		clearTimeout(suggestionTimeout);
		suggestionTimeout = setTimeout(() => {
			fetchSuggestions(searchInput.value);
		}, 300); // Debounce 300ms
	});

	// Xử lý phím ESC (ẩn gợi ý), ArrowDown/Up (chọn), Enter (chọn/tìm kiếm)
	searchInput.addEventListener('keydown', (e) => {
		const suggestions = $$('#search_suggestions .suggestion-item');
		if (suggestions.length === 0) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			suggestions[highlightedIndex]?.classList.remove('highlighted');
			highlightedIndex = (highlightedIndex + 1) % suggestions.length;
			suggestions[highlightedIndex].classList.add('highlighted');

			// Focus vào item được chọn (cuộn nếu cần)
			suggestions[highlightedIndex].scrollIntoView({ block: "nearest" });

		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			suggestions[highlightedIndex]?.classList.remove('highlighted');
			highlightedIndex = (highlightedIndex - 1 + suggestions.length) % suggestions.length;
			suggestions[highlightedIndex].classList.add('highlighted');

			// Focus vào item được chọn (cuộn nếu cần)
			suggestions[highlightedIndex].scrollIntoView({ block: "nearest" });
		} else if (e.key === 'Enter') {
			const highlighted = suggestions[highlightedIndex];
			if (highlighted) {
				// Có gợi ý được chọn -> chặn submit và click vào gợi ý
				e.preventDefault();
				e.stopImmediatePropagation();
				highlighted.click(); // Kích hoạt hành động của item được chọn
			}
			// Nếu không có item nào được chọn -> để form submit tự nhiên (không cần preventDefault)
		} else if (e.key === 'Escape') {
			hideSuggestions();
		}
	});

	// Ẩn suggestions khi click ra ngoài
	document.addEventListener('click', function (event) {
		const form = $('#search_form');
		const suggestions = $('#search_suggestions');
		if (form && suggestions && !form.contains(event.target) && !suggestions.contains(event.target)) {
			hideSuggestions();
		}
	});
}


// ======================================================================
// PHẦN 3: GHI ÂM GIỌNG NÓI (VOICE SEARCH)
// ======================================================================

// Lưu recognition đang chạy để dừng nếu người dùng mở lại
let currentRecognition = null;

// Bắt đầu ghi âm
function startVoiceSearch() {

	// Kiểm tra trình duyệt hỗ trợ Web Speech API
	if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
		alert("Trình duyệt không hỗ trợ tìm kiếm bằng giọng nói! Hãy thử Chrome.");
		return;
	}

	const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
	const recognition = new SpeechRecognition();

	// Dừng phiên ghi âm trước đó (nếu có)
	if (currentRecognition) {
		currentRecognition.stop();
	}

	currentRecognition = recognition;

	recognition.continuous = false;
	recognition.interimResults = true;
	recognition.lang = "vi-VN";

	// Mở popup UI
	const popup = $('#voice_popup');
	const transcriptDisplay = $('#transcript_display');
	transcriptDisplay.textContent = "Đang nghe...";
	popup.style.display = "flex";

	// Khi bắt đầu nghe
	recognition.onstart = function () {
		transcriptDisplay.textContent = "Đang nghe... Hãy nói gì đó!";
	};

	// Nhận kết quả
	recognition.onresult = function (event) {
		let finalTranscript = '';
		let interimTranscript = '';

		// Ghép text từ event
		for (let i = event.resultIndex; i < event.results.length; i++) {
			const transcript = event.results[i][0].transcript;

			if (event.results[i].isFinal)
				finalTranscript += transcript;
			else
				interimTranscript += transcript;
		}

		// Hiển thị ra popup
		transcriptDisplay.textContent = finalTranscript || interimTranscript;

		// ✅ Nếu đã có kết quả cuối → Hiển thị suggestions
		if (finalTranscript) {
			$('#search_input').value = finalTranscript;

			setTimeout(async () => {
				popup.style.display = "none";
				recognition.stop();

				// ✅ TỰ ĐỘNG THỰC HIỆN TÌM KIẾM (KHÔNG cần user ấn Enter)
				// Ẩn tiêu đề sản phẩm gợi ý
				const suggestedTitle = $('#suggested-products-title');
				if (suggestedTitle) {
					suggestedTitle.style.display = 'none';
				}

				// Hiển thị tiêu đề kết quả tìm kiếm
				const resultsTitle = $('#search-results-title');
				if (resultsTitle) {
					resultsTitle.textContent = `🔍 Kết quả tìm kiếm cho "${finalTranscript}"`;
					resultsTitle.style.display = 'block';
				}

				// Load sản phẩm với kết quả từ giọng nói
				await loadProducts(finalTranscript);

				// THÊM: Cuộn xuống kết quả sau khi load xong sản phẩm
				scrollToSearchResults();
			}, 200);
		}
	};

	// Khi xảy ra lỗi micro / không nói
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
		}, 200);
	};

	// Khi kết thúc
	recognition.onend = function () {
		currentRecognition = null;

		if ($('#transcript_display').textContent === "Đang nghe...") {
			setTimeout(() => popup.style.display = "none", 200);
		}
	};

	// Start recognition
	try {
		recognition.start();
	} catch (error) {
		console.error("Không thể start recognition:", error);
		popup.style.display = "none";
		alert("Không thể bật giọng nói!");
	}
}

// Hủy ghi âm
function cancelVoiceSearch() {
	if (currentRecognition) currentRecognition.abort();
	$('#voice_popup').style.display = "none";
}

// ======================================================================
// PHẦN 4: TÌM KIẾM BẰNG HÌNH ẢNH (IMAGE SEARCH)
// ======================================================================

let currentImageData = null;
let currentTab = 'upload';

// Mở popup tìm kiếm bằng hình ảnh
function openImageSearch() {
	const popup = document.getElementById('image_search_popup');
	popup.classList.add('active');
	popup.style.display = 'flex';

	// Reset về tab upload
	switchImageTab('upload');
	clearAllImages();
}

// Đóng popup
function closeImageSearch() {
	const popup = document.getElementById('image_search_popup');
	popup.classList.remove('active');
	setTimeout(() => {
		popup.style.display = 'none';
	}, 200);

	clearAllImages();
	hideError();
}

// Chuyển tab
function switchImageTab(tabName) {
	currentTab = tabName;

	// Update tab buttons
	document.querySelectorAll('.tab-button').forEach(btn => {
		if (btn.dataset.tab === tabName) {
			btn.classList.add('active');
		} else {
			btn.classList.remove('active');
		}
	});

	// Update tab panels
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
		e.stopPropagation(); // chặn bubble
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
}

// Xử lý file ảnh
function handleImageFile(file) {
	// Kiểm tra dung lượng (5MB)
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

// Tải ảnh từ paste - ĐÃ SỬA
function loadPastedImage() {
	const input = document.getElementById('imagePasteInput');
	const value = input.value.trim();

	if (!value) {
		// Ẩn preview nếu không có giá trị
		clearPasteImage();
		return;
	}

	// Check if it's a URL
	if (value.startsWith('http://') || value.startsWith('https://')) {
		// Validate URL format
		try {
			new URL(value);
			currentImageData = value;
			showImagePreview(value, 'paste');
			hideError();
		} catch (e) {
			showError('URL không hợp lệ');
		}
	}
	// Check if it's base64
	else if (value.startsWith('data:image/')) {
		currentImageData = value;
		showImagePreview(value, 'paste');
		hideError();
	}
	// Assume it's raw base64
	else if (value.length > 100) { // Chỉ xử lý nếu là base64 dài (tránh nhầm với text thường)
		try {
			// Thử decode để kiểm tra có phải base64 hợp lệ không
			atob(value);
			currentImageData = `data:image/jpeg;base64,${value}`;
			showImagePreview(currentImageData, 'paste');
			hideError();
		} catch (e) {
			showError('Base64 không hợp lệ');
		}
	}
	// Nếu là text thường, không làm gì
}

// Hiển thị preview ảnh
function showImagePreview(imageData, tab) {
	if (tab === 'upload') {
		const preview = document.getElementById('imagePreview');
		const container = document.getElementById('uploadPreviewContainer');

		preview.src = imageData;
		preview.style.display = 'block';
		container.style.display = 'block';

		// Ẩn upload zone
		document.getElementById('imageUploadArea').style.display = 'none';
	} else {
		const preview = document.getElementById('pastePreview');
		const container = document.getElementById('pastePreviewContainer');

		preview.src = imageData;
		preview.style.display = 'block';
		container.style.display = 'block';
	}
}

// Xóa ảnh upload
function clearUploadImage() {
	document.getElementById('imagePreview').style.display = 'none';
	document.getElementById('uploadPreviewContainer').style.display = 'none';
	document.getElementById('imageUploadArea').style.display = 'block';
	document.getElementById('imageFileInput').value = '';

	if (currentTab === 'upload') {
		currentImageData = null;
	}
}

// Xóa ảnh paste
function clearPasteImage() {
	document.getElementById('pastePreview').style.display = 'none';
	document.getElementById('pastePreviewContainer').style.display = 'none';
	document.getElementById('imagePasteInput').value = '';

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
	errorDiv.textContent = message;
	errorDiv.classList.add('show');
	errorDiv.style.display = 'block';
}

// Ẩn lỗi
function hideError() {
	const errorDiv = document.getElementById('imageSearchError');
	errorDiv.classList.remove('show');
	errorDiv.style.display = 'none';
}

// Tìm kiếm bằng ảnh - ĐÃ SỬA
async function searchWithImage() {
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

		if (data.status === 'success') {
			// Đóng popup
			closeImageSearch();

			// Cập nhật danh sách sản phẩm
			PRODUCTS = data.products || [];

			// Render kết quả tìm kiếm vào phần gợi ý
			renderSearchResults(PRODUCTS, data.search_term || 'Hình ảnh đã tải lên');

			// Cập nhật search input với từ khóa tìm được
			const searchInput = document.getElementById('search_input');
			if (searchInput && data.search_term) {
				searchInput.value = data.search_term;
			}

			// Ẩn tiêu đề sản phẩm gợi ý
			const suggestedTitle = $('#suggested-products-title');
			if (suggestedTitle) {
				suggestedTitle.style.display = 'none';
			}

			// Hiển thị tiêu đề kết quả tìm kiếm
			const resultsTitle = $('#search-results-title');
			if (resultsTitle) {
				resultsTitle.textContent = `🔍 Kết quả tìm kiếm hình ảnh: "${data.search_term || 'Hình ảnh của bạn'}"`;
				resultsTitle.style.display = 'block';
			}

			// THÊM: Cuộn xuống kết quả
			scrollToSearchResults();

			console.log('✅ Image search successful:', data.products.length + ' products found');

		} else if (data.status === 'not_found') {
			// Hiển thị thông báo không tìm thấy trong phần gợi ý
			renderSearchResults([], data.search_term || '');

			// Ẩn tiêu đề sản phẩm gợi ý
			const suggestedTitle = $('#suggested-products-title');
			if (suggestedTitle) {
				suggestedTitle.style.display = 'none';
			}

			// Hiển thị tiêu đề kết quả tìm kiếm
			const resultsTitle = $('#search-results-title');
			if (resultsTitle) {
				resultsTitle.textContent = `🔍 Kết quả tìm kiếm hình ảnh: "${data.search_term || 'Hình ảnh của bạn'}"`;
				resultsTitle.style.display = 'block';
			}

			showError(`❌ ${data.message}`);
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

// Thêm vào phần Khởi tạo khi trang load
document.addEventListener('DOMContentLoaded', () => {
	setupImageUpload();

	// Tự động tải ảnh khi paste hoặc nhập vào ô URL/Base64
	const pasteInput = document.getElementById('imagePasteInput');

	pasteInput.addEventListener('input', (e) => {
		const value = e.target.value.trim();

		// Nếu xóa hết text thì ẩn preview
		if (!value) {
			clearPasteImage();
			hideError();
			return;
		}

		// Chờ một chút để người dùng nhập/xong
		clearTimeout(pasteInput.debounceTimer);
		pasteInput.debounceTimer = setTimeout(() => {
			loadPastedImage();
		}, 0); // Chờ 800ms sau khi ngừng gõ
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

	// Close popup khi click outside
	const popup = document.getElementById('image_search_popup');
	if (popup) {
		popup.addEventListener('click', (e) => {
			if (e.target === popup) {
				closeImageSearch();
			}
		});
	}

	// ESC key to close
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			const popup = document.getElementById('image_search_popup');
			if (popup && popup.style.display === 'flex') {
				closeImageSearch();
			}
		}
	});
});

// Close popup khi click outside
const popup = document.getElementById('image_search_popup');
if (popup) {
	popup.addEventListener('click', (e) => {
		if (e.target === popup) {
			closeImageSearch();
		}
	});
}

// ESC key to close
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') {
		const popup = document.getElementById('image_search_popup');
		if (popup && popup.style.display === 'flex') {
			closeImageSearch();
		}
	}
});

// ======================================================================
// PHẦN 5: LOGIC GIỎ HÀNG ĐỒNG BỘ (ĐÃ CHỈNH SỬA)
// ======================================================================

// Biến toàn cục để quản lý bộ đếm thời gian (đặt ở ngoài hàm saveCart)
let syncTimeout; 

function saveCart() {
    // 1. LƯU LOCALSTORAGE & UPDATE UI (Chạy ngay lập tức để app mượt)
    localStorage.setItem('cart_v1', JSON.stringify(cart));
    updateCartUI();
    
    // Trigger fetch lại chi tiết để UI được hoàn chỉnh (nếu hàm này có sẵn)
    if (typeof fetchCartDetails === 'function') {
        fetchCartDetails();
    }

    // 2. LƯU DATABASE (Chạy ngầm với Debounce)
    if (typeof supabase !== 'undefined') {
        // Xóa lệnh chờ cũ nếu người dùng thao tác tiếp trong vòng 1s
        clearTimeout(syncTimeout);

        // Thiết lập lệnh chờ mới
        syncTimeout = setTimeout(async () => {
            try {
                // Lấy session hiện tại
                const { data: { session } } = await supabase.auth.getSession();

                // Chỉ lưu nếu người dùng đã đăng nhập
                if (session && session.user) {
                    console.log("⏳ Đang đồng bộ giỏ hàng lên Database...");

                    const { error } = await supabase
                        .from('cart')
                        .upsert({ 
                            user_id: session.user.id, 
                            cart_data: cart, // Biến cart global đang chứa dữ liệu mới nhất
                            updated_at: new Date()
                        }, { onConflict: 'user_id' });

                    if (error) {
                        console.error("❌ Lỗi sync:", error.message);
                    } else {
                        console.log("✅ Đã đồng bộ xong!");
                    }
                }
            } catch (err) {
                console.warn("Lỗi hệ thống khi sync:", err);
            }
        }, 1000); // Đợi 1000ms (1 giây) sau khi ngừng thao tác mới đẩy lên
    }
}

// [TỪ product-detail.js] Tải chi tiết sản phẩm trong giỏ hàng từ API
async function fetchCartDetails() {
	const cartKeys = Object.keys(cart);
	if (cartKeys.length === 0) {
		CART_CACHE = {};
		updateCartUI();
		return;
	}

	// Đổi logic: chỉ lấy những key chưa có trong cache để tối ưu API call
	const cartToFetch = {};
	cartKeys.forEach(key => {
		if (!CART_CACHE[key]) {
			cartToFetch[key] = cart[key];
		}
	});

	// Nếu không có gì mới cần fetch
	if (Object.keys(cartToFetch).length === 0) return;

	try {
		const res = await fetch('/api/cart/details', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ cart: cartToFetch })
		});
		if (res.ok) {
			// Merge cache mới vào cache cũ
			const newCache = await res.json();
			CART_CACHE = { ...CART_CACHE, ...newCache };
			updateCartUI();
		}
	} catch (err) {
		console.error("Lỗi fetchCartDetails:", err);
	}
}

// [TỪ product-detail.js] Cập nhật giao diện giỏ hàng
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
                     <button class="small-btn" onclick="changeQty('${key}', -1, event)">-</button>
                     <div style="min-width:20px; text-align:center">${qty}</div>
                     <button class="small-btn" onclick="changeQty('${key}', 1, event)">+</button>
                     <button class="small-btn" style="margin-left:6px; color:red;" onclick="removeItem('${key}', event)">x</button>
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

// Thêm vào giỏ với key dạng "productId_storeId"
function addToCart(productId, storeId) {
	alert("Vui lòng vào trang Chi Tiết Sản Phẩm để thêm vào giỏ hàng!");
}

// ======================================================================
// SỬA: Thêm tham số event và chặn lan truyền để popup giỏ hàng không bị đóng
// ======================================================================

// Tăng/giảm số lượng
window.changeQty = function (key, delta, event) { // Thêm event
	// CHẶN event lan truyền ra document, ngăn popup đóng
	if (event && typeof event.stopPropagation === 'function') {
		event.stopPropagation(); 
	}
	
	cart[key] = (cart[key] || 0) + delta;
	if (cart[key] <= 0) delete cart[key];
	saveCart();
}

// Xóa khỏi giỏ
window.removeItem = async function (key, event) { // THÊM ASYNC
	// CHẶN event lan truyền ra document, ngăn popup đóng
	if (event && typeof event.stopPropagation === 'function') {
		event.stopPropagation();
	}
	
	// Thay thế confirm() bằng showCustomConfirm()
	const confirmDelete = await showCustomConfirm('Xóa sản phẩm này khỏi giỏ hàng?');

	if (confirmDelete) { // Nếu người dùng xác nhận
		delete cart[key];
		if (CART_CACHE[key]) delete CART_CACHE[key]; // Xóa khỏi cache
		saveCart();
	}
}


// ĐỔI TÊN & CHỨC NĂNG: Nút Thanh toán -> Xem Giỏ hàng
if ($('#checkout')) {
	// 1. Đổi Text button
	$('#checkout').textContent = 'Xem Giỏ hàng';

	// 2. Cập nhật Event Listener VỚI LOGIC KIỂM TRA ĐĂNG NHẬP
	$('#checkout').addEventListener('click', async () => {
		// Lấy session hiện tại
		const { data: { session } } = await supabase.auth.getSession();

		if (!session || !session.user) {

			// Chuyển hướng đến trang đăng nhập
			document.body.classList.add('page-fade-out');
			setTimeout(() => {
				window.location.href = 'account.html'; // Hoặc đường dẫn đăng nhập phù hợp
			}, 500);
			return;
		}

		// Nếu đã đăng nhập -> Chuyển đến trang giỏ hàng bình thường
		document.body.classList.add('page-fade-out');

		setTimeout(() => {
			window.location.href = 'cart.html';
		}, 500);
	});
}

// Toggle popup giỏ hàng (Chuyển sang dùng Click/JS show/hide)
const cartBtn = $('#open-cart');
const cartPopup = $('#cart-popup');

if (cartBtn && cartPopup) {
	// Thêm logic click mới
	cartBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		cartPopup.style.display = (cartPopup.style.display === 'block') ? 'none' : 'block';
	});

	// Nút Đóng trong popup
	if ($('#close-cart')) {
		$('#close-cart').addEventListener('click', (e) => {
			e.stopPropagation();
			cartPopup.style.display = 'none';
		});
	}

	// Đóng khi click ra ngoài popup
	document.addEventListener('click', (e) => {
		if (cartPopup.style.display === 'block' && !cartPopup.contains(e.target) && !cartBtn.contains(e.target)) {
			cartPopup.style.display = 'none';
		}
	});
}

// ======================================================================
// PHẦN 6: CẬP NHẬT GIAO DIỆN TÀI KHOẢN
// ======================================================================

async function updateAccountLink() {
	const accountLink = document.getElementById('account-link');
	const logoutLink = document.getElementById('logout-link');

	// 1. Lấy thông tin User hiện tại
	const { data: { session } } = await supabase.auth.getSession();

	let finalName = null;

	if (session && session.user) {
		// --- [LOGIC MỚI: Ưu tiên lấy tên từ Database] ---

		// Gọi Supabase lấy tên trong bảng profiles
		const { data: profile, error } = await supabase
			.from('profiles')
			.select('name')
			.eq('id', session.user.id)
			.single();

		if (profile && profile.name) {
			// Nếu trong DB có tên -> Dùng tên DB (Tên cũ)
			finalName = profile.name;
		} else {
			// Nếu chưa có trong DB -> Mới dùng tên từ Google/Email
			finalName = session.user.user_metadata.name || session.user.email.split('@')[0];
		}

		// Lưu lại vào LocalStorage để dùng cho các trang khác
		localStorage.setItem('userName', finalName);
	} else {
		localStorage.removeItem('userName');
	}

	// Cập nhật giao diện Header
	if (finalName && accountLink) {
		accountLink.innerHTML = `👋 Chào, <b>${finalName}</b>`;
		accountLink.href = 'profile.html';
		if (logoutLink) logoutLink.style.display = 'flex';
	} else if (accountLink) {
		accountLink.textContent = 'Tài Khoản';
		accountLink.href = 'account.html';
		if (logoutLink) logoutLink.style.display = 'none';
	}
}

// ======================================================================
// PHẦN 7: ĐĂNG XUẤT (LOGOUT)
// ======================================================================

// Lắng nghe sự kiện real-time (Để đồng bộ Tab A và Tab B)
supabase.auth.onAuthStateChange((event, session) => {
	if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
		updateAccountLink();
	}
});

// ======================================================================
// PHẦN 8: LẤY VỊ TRÍ THỰC VÀ HIỂN THỊ (REVERSE GEOCODING)
// ======================================================================

/**
 * Hàm dịch ngược tọa độ thành tên địa điểm (chỉ Thành phố và Quốc gia).
 */

async function reverseGeocode(latitude, longitude) {
	// Chỉ cần zoom thấp (ví dụ 10) để ưu tiên thông tin tổng quát hơn
	const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`;

	try {
		const response = await fetch(url);
		const data = await response.json();

		const address = data.address;

		// Lấy các trường Thành phố (City) và Quốc gia (Country)
		const city = address.city || address.town || address.village || address.state || address.province || '';
		const country = address.country || '';

		// Xây dựng chuỗi kết quả: City, Country
		const result = [city, country].filter(Boolean).join(', ');

		// Sử dụng tọa độ nếu không lấy được thông tin cơ bản
		return result || `Tọa độ: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

	} catch (error) {
		console.error("Lỗi khi dịch ngược tọa độ:", error);
		return "Vị trí không khả dụng (Lỗi API)";
	}
}

/**
 * Lấy vị trí Geolocation và cập nhật lên UI (index.html).
 */
function updateCurrentLocationDisplay() {
	const locationElement = document.getElementById('current-location');
	if (!locationElement) return;

	// Chỉ lấy tọa độ để hiển thị TÊN ĐƯỜNG cho đẹp (UI)
	// Không cần gọi fetch('/api/set_location') nữa vì file gps-fast.js đã làm rồi
	navigator.geolocation.getCurrentPosition(
		async (position) => {
			const lat = position.coords.latitude;
			const long = position.coords.longitude;

			// Chỉ làm nhiệm vụ hiển thị UI
			const locationName = await reverseGeocode(lat, long);
			locationElement.textContent = `📍 Vị trí hiện tại: ${locationName}`;
		},
		(err) => {
			locationElement.textContent = "📍 Không thể xác định vị trí";
		});
}
// ======================================================================
// PHẦN 9: HÀM CUSTOM MODAL (DÙNG CHO ĐĂNG XUẤT)
// ======================================================================
function showCustomConfirm(message) {
	return new Promise(resolve => {
		const modal = document.getElementById('custom-confirm-modal');
		const messageElement = modal.querySelector('#modal-message');
		const yesButton = modal.querySelector('#modal-confirm-yes');
		const noButton = modal.querySelector('#modal-confirm-no');

		// Đảm bảo các phần tử modal tồn tại trước khi thao tác
		if (!modal || !messageElement || !yesButton || !noButton) {
			console.error("Lỗi: Không tìm thấy các phần tử Custom Modal trong index.html.");
			// Quay về dùng confirm() gốc nếu modal bị lỗi
			resolve(confirm(message));
			return;
		}

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
// ======================================================================

// ======================================================================
// PHẦN 10: KHỞI TẠO VÀ XỬ LÝ SỰ KIỆN
// ======================================================================

// Khi trang load → tải toàn bộ sản phẩm + cập nhật giỏ hàng
window.onload = async function () {
	// THÊM: Fetch chi tiết giỏ hàng ngay khi tải trang
	await fetchCartDetails();
	updateCartUI();

	// === 1. Cập nhật tên người dùng ===
	updateAccountLink();

	// === 2. KIỂM TRA SESSION & CẬP NHẬT VỊ TRÍ LÊN DB ===
	const { data: { session } } = await supabase.auth.getSession();

	if (session && session.user) {
		updateUserLocation(session.user.id);
	}

	// === 3. ✅ KIỂM TRA URL PARAMETER ?search=... (THÊM MỚI) ===
	const params = new URLSearchParams(window.location.search);
	const searchText = params.get('search');

	if (searchText) {
		// ✅ CÓ PARAMETER SEARCH TRONG URL

		// Gán vào ô search input
		const input = document.getElementById('search_input');
		if (input) input.value = searchText;

		// Ẩn tiêu đề sản phẩm gợi ý
		const suggestedTitle = $('#suggested-products-title');
		if (suggestedTitle) {
			suggestedTitle.style.display = 'none';
		}

		// Hiển thị tiêu đề kết quả tìm kiếm
		const resultsTitle = $('#search-results-title');
		if (resultsTitle) {
			resultsTitle.textContent = `🔍 Kết quả tìm kiếm cho "${searchText}"`;
			resultsTitle.style.display = 'block';
		}

		// Load và hiển thị kết quả tìm kiếm
		await loadProducts(searchText);

		// Cuộn xuống kết quả
		scrollToSearchResults();

	} else {
		// ✅ KHÔNG CÓ SEARCH PARAMETER -> HIỂN THỊ SẢN PHẨM GỢI Ý

		// Load sản phẩm gợi ý (khôi phục trạng thái từ localStorage nếu có)
		const savedLocationName = localStorage.getItem('suggest_location_name');
		const savedUseGps = localStorage.getItem('suggest_use_gps');

		if (savedUseGps === 'true') {
			// Nếu trước đó dùng GPS, load lại theo GPS
			loadSuggestedProducts(null, true);
		} else if (savedLocationName) {
			// Nếu trước đó nhập địa chỉ, khôi phục và load lại
			const addressInput = $('#search_address_input');
			if (addressInput) {
				addressInput.value = savedLocationName;
			}
			loadSuggestedProducts(savedLocationName);
		} else {
			// Mặc định: load sản phẩm gợi ý thông thường
			loadSuggestedProducts();
		}
	}

	// === 4. Xử lý event cho ô địa chỉ ===
	const addressInput = $('#search_address_input');
	if (addressInput) {
		addressInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const locationName = addressInput.value.trim();
				if (locationName) {
					// Lưu trạng thái vào localStorage
					localStorage.setItem('suggest_location_name', locationName);
					localStorage.removeItem('suggest_use_gps');
					// Load sản phẩm gợi ý theo tên địa điểm (vẫn là sản phẩm gợi ý)
					loadSuggestedProducts(locationName);
				} else {
					// Nếu xóa hết text và ấn Enter -> Reset về mặc định
					localStorage.removeItem('suggest_location_name');
					localStorage.removeItem('suggest_use_gps');
					loadSuggestedProducts();
				}
			}
		});

		// Lắng nghe sự kiện xóa text (input event)
		addressInput.addEventListener('input', (e) => {
			const locationName = e.target.value.trim();
			if (!locationName) {
				// Nếu người dùng xóa hết text -> Reset ngay lập tức
				localStorage.removeItem('suggest_location_name');
				localStorage.removeItem('suggest_use_gps');
				loadSuggestedProducts();
			}
		});
	}

	// === 5. Xử lý event cho nút "Gợi ý theo GPS" ===
	const suggestByGpsBtn = $('#suggest-by-gps-btn');
	if (suggestByGpsBtn) {
		suggestByGpsBtn.addEventListener('click', () => {
			// Lưu trạng thái vào localStorage
			localStorage.setItem('suggest_use_gps', 'true');
			localStorage.removeItem('suggest_location_name');
			// Load sản phẩm gợi ý theo GPS
			loadSuggestedProducts(null, true);
		});
	}

	// 5. Hiệu ứng khi nhấn vào link Tài Khoản và Kênh Người Bán (ĐÃ THÊM MỚI)
	function applyClickEffect(e) {
		e.preventDefault(); // Ngăn hành động chuyển trang mặc định
		const link = e.currentTarget;
		const targetUrl = link.getAttribute('href');

		link.classList.add('pulsing'); // Thêm class hiệu ứng

		setTimeout(() => {
			link.classList.remove('pulsing'); // Xóa class
			// Thực hiện chuyển trang sau khi hiệu ứng kết thúc
			document.body.classList.add('page-fade-out');
			setTimeout(() => {
				window.location.href = targetUrl;
			}, 500);
		}, 400); // 400ms = thời gian của animation
	}

	const accountLink = document.getElementById('account-link');
	const sellerLink = document.getElementById('seller-link');

	// Gắn sự kiện cho Tài Khoản
	if (accountLink) {
		accountLink.addEventListener('click', applyClickEffect);
	}

	// Gắn sự kiện cho Kênh Người Bán
	if (sellerLink) {
		sellerLink.addEventListener('click', applyClickEffect);
	}

	// 6. Hiệu ứng hiển thị trang (SỐ THỨ TỰ CŨ LÀ 5)
	document.body.classList.remove('page-fade-out');
};

// Hàm đăng xuất toàn cục (gắn vào window để html gọi được)
window.handleLogout = async function () {
	// SỬ DỤNG CUSTOM MODAL THAY CHO CONFIRM()
	const confirmLogout = await showCustomConfirm("Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này không?");

	if (!confirmLogout) return;

	// Nếu người dùng đồng ý (confirmLogout là true)
	try {
		// 1. Gọi Supabase đăng xuất
		const { error } = await supabase.auth.signOut();
		if (error) throw error;

		// 2. Xóa sạch LocalStorage
		localStorage.removeItem('accessToken');
		localStorage.removeItem('userName');
		localStorage.removeItem('cart_v1');

		// 3. Tải lại trang để cập nhật giao diện
		window.location.reload();

	} catch (err) {
		console.error("Lỗi đăng xuất:", err);
		alert("Đăng xuất thất bại. Vui lòng thử lại.");
	}
};

// --- HÀM CẬP NHẬT VỊ TRÍ & THỜI GIAN (LƯU VÀO DB) ---
async function updateUserLocation(userId) {
	if (!navigator.geolocation) return;

	navigator.geolocation.getCurrentPosition(
		async (position) => {
			const { latitude, longitude } = position.coords;

			// Gọi Supabase update
			const { error } = await supabase
				.from('profiles')
				.update({
					lat: latitude,
					long: longitude,
					updated_at: new Date()
				})
				.eq('id', userId);

			if (!error) {
				console.log(`✅ Đã cập nhật vị trí lên DB: ${latitude}, ${longitude}`);
			} else {
				console.warn("⚠️ Lỗi update vị trí (có thể do mạng hoặc RLS):", error.message);
			}
		},
		(err) => {
			console.warn("⚠️ Không lấy được vị trí (User từ chối hoặc lỗi):", err.message);
		});
}

// ======================================================================
// PHẦN 11: XỬ LÝ LOCATION DROPDOWN
// ======================================================================

// Khởi tạo location dropdown
async function initLocationDropdown() {
	const dropdownBtn = $('#location-dropdown-btn');
	const dropdownMenu = $('#location-dropdown-menu');
	const addressInput = $('#search_address_input');

	if (!dropdownBtn || !dropdownMenu || !addressInput) return;

	// Fetch locations từ API ngay khi khởi tạo
	await fetchLocations();

	// Toggle dropdown khi click vào nút
	dropdownBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		dropdownMenu.classList.toggle('active');
	});

	// Đóng dropdown khi click ra ngoài
	document.addEventListener('click', (e) => {
		if (!dropdownMenu.contains(e.target) && !dropdownBtn.contains(e.target)) {
			dropdownMenu.classList.remove('active');
		}
	});

	// Đóng dropdown khi nhấn ESC
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && dropdownMenu.classList.contains('active')) {
			dropdownMenu.classList.remove('active');
		}
	});
}

// Gọi hàm khởi tạo khi trang load
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initLocationDropdown);
} else {
	initLocationDropdown();
}

// ======================================================================
// XỬ LÝ LƯU URL TRƯỚC KHI ĐĂNG NHẬP
// ======================================================================

(function () {
	const accountLink = document.getElementById('account-link');

	if (accountLink) {
		accountLink.addEventListener('click', function (e) {
			// Kiểm tra session (bất đồng bộ)
			supabase.auth.getSession().then(({ data: { session } }) => {
				if (!session) {
					// Chưa đăng nhập → Lưu URL hiện tại
					localStorage.setItem('redirect_after_login', window.location.href);
					console.log('💾 Saved URL:', window.location.href);
				}
			});
		});
	}
})();