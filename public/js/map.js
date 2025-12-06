// ============================================================
// 1. KHAI BÁO & CẤU HÌNH
// ============================================================
const DOM = {
  panel: document.getElementById('panel'),
  toggleBtn: document.getElementById('toggle-btn'),
  map: document.getElementById('map'),
  startSelect: document.getElementById('start-select'),
  startCoords: document.getElementById('start-coords'),
  endDisplay: document.getElementById('end-display'),
  endCoords: document.getElementById('end-coords'),
  btnDraw: document.getElementById('btn-draw'),
  statusText: document.getElementById('status-text'),
  routeResult: document.getElementById('route-result'),
  loading: document.getElementById('loading'),
  realtimeToggle: document.getElementById('realtime-toggle'),
  profileSelect: document.getElementById('profile-select'),
  legend: document.getElementById('legend'),
  btnLocate: document.getElementById('btn-locate'),
  btnLayerToggle: document.getElementById('btn-layer-toggle'),
  layerMenu: document.getElementById('layer-menu')
};

const DEFAULT_COORDS = [10.76279, 106.68258];

// Cấu hình thời gian cập nhật real-time (ms)
const REALTIME_INTERVALS = {
  'driving-car': 30000,	   // 30s
  'cycling-regular': 60000, // 60s
  'foot-walking': 90000	   // 90s
};

// Biến toàn cục theo dõi trạng thái
let routeLayer = null;
let userMarker = null;
let realtimeTimer = null;

// ============================================================
// 2. KHỞI TẠO BẢN ĐỒ
// ============================================================
const layers = {
  street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, }),
  terrain: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, })
};

const map = L.map('map', { zoomControl: false, layers: [layers.street] }).setView([10.762622, 106.660172], 13);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Khởi tạo marker người dùng mặc định
userMarker = createMarker('user', DEFAULT_COORDS[0], DEFAULT_COORDS[1], { emoji: '🏠', color: '#2563eb' }).addTo(map);
userMarker.bindPopup("<b>Điểm xuất phát</b><br>Trường ĐH Khoa học Tự nhiên - ĐHQG TP.HCM");

// ============================================================
// 3. TIỆN ÍCH GIAO DIỆN
// ============================================================

// Đổi lớp bản đồ (Cập nhật logic đóng menu)
window.switchLayer = function (type, el) {
  // 1. Logic đổi map của Leaflet (Giữ nguyên)
  Object.values(layers).forEach(l => map.removeLayer(l));
  map.addLayer(layers[type]);

  // 2. Logic đổi màu nút active (Giữ nguyên)
  document.querySelectorAll('.layer-opt').forEach(d => d.classList.remove('active'));
  el.classList.add('active');

  if (DOM.layerMenu) {
    DOM.layerMenu.classList.remove('show');
  }
};

// 1. Sự kiện Click nút "Giao diện" -> Bật/Tắt menu
if (DOM.btnLayerToggle && DOM.layerMenu) {
  DOM.btnLayerToggle.onclick = (e) => {
    e.stopPropagation();					// Ngăn không cho sự kiện click lan ra ngoài (để tránh bị đóng ngay lập tức)
    DOM.layerMenu.classList.toggle('show'); // Thêm/Xóa class .show để hiện/ẩn
  };
}

// 2. Sự kiện Click bất kỳ đâu trên màn hình -> Đóng menu (nếu đang mở)
document.addEventListener('click', (e) => {
  // Chỉ chạy nếu menu đang mở (có class show)
  if (DOM.layerMenu && DOM.layerMenu.classList.contains('show')) {

    // Nếu chỗ vừa click KHÔNG PHẢI là nút bấm VÀ KHÔNG PHẢI là menu
    if (!DOM.btnLayerToggle.contains(e.target) && !DOM.layerMenu.contains(e.target)) {
      DOM.layerMenu.classList.remove('show'); // Đóng menu
    }
  }
});

// Cập nhật CSS class khi zoom
function updateZoomClass() {
  const zoom = map.getZoom();
  if (zoom >= 14) {
    DOM.map.classList.add('map-zoomed-in');
    DOM.map.classList.remove('map-zoomed-out');
  } else {
    DOM.map.classList.add('map-zoomed-out');
    DOM.map.classList.remove('map-zoomed-in');
  }
}
map.on('zoomend', updateZoomClass);
updateZoomClass();

// Đóng/Mở Panel bên trái
DOM.toggleBtn.onclick = () => {
  DOM.panel.classList.toggle('collapsed');
  const isCollapsed = DOM.panel.classList.contains('collapsed');
  DOM.toggleBtn.querySelector('svg').innerHTML = isCollapsed
    ? '<polyline points="9 18 15 12 9 6"></polyline>'
    : '<polyline points="15 18 9 12 15 6"></polyline>';
};

// Tạo Marker Custom
function createMarker(type, lat, lng, opts = {}) {
  const emoji = opts.emoji || (type === 'store' ? '🏬' : '🏠');
  const bg = opts.color || '#2563eb';
  const border = opts.borderColor || '#ffffff';

  const style = `
    background:${bg}; border-color:${border};
    width:var(--marker-size); height:var(--marker-size);
    display:flex; align-items:center; justify-content:center;
    border-radius:50%; font-size:14px; color:white;
  `;

  const html = `<div class="marker-pin" style="${style}">${emoji}</div>`;
  const icon = L.divIcon({ className: 'custom-div-icon', html, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] });
  return L.marker([lat, lng], { icon: icon });
}

// ============================================================
// 4. HỆ THỐNG TAG & LEGEND
// ============================================================
const tagMap = {
  "street food": { emoji: '🍜', label: 'Đồ ăn đường phố', color: '#F4C7AB' },
  "main course": { emoji: '🍽️', label: 'Món chính', color: '#F8AFA6' },
  "dessert": { emoji: '🍰', label: 'Đồ ăn vặt', color: '#F7D6E0' },
  "drink": { emoji: '🥤', label: 'Nước uống', color: '#CDE7F0' },
  "edible souvenir": { emoji: '🍯', label: 'Quà', color: '#E6D8F5' },
  "souvenir": { emoji: '🎁', label: 'Quà lưu niệm', color: '#F9E8C9' },
  "default": { emoji: '🏬', label: 'Khác', color: '#D6DEE5' }
};

function colorForTag(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return '#' + ('00000' + (h & 0xFFFFFF).toString(16)).slice(-6);
}

function normalizeTag(t) {
  if (!t) return '';
  let s = String(t).trim().toLowerCase().replace(/[_-]/g, ' ');
  const synonyms = { 'maincourse': 'main course', 'streetfood': 'street food', 'ediblesouvenir': 'edible souvenir' };
  return synonyms[s] || s;
}

function getTagIcon(tag) {
  if (!tag) return tagMap['default'];
  const key = normalizeTag(tag);
  if (tagMap[key]) return tagMap[key];

  let emoji = '📍';
  if (key.includes('food') || key.includes('meal'))
    emoji = '🍽️';
  else if (key.includes('drink') || key.includes('coffee'))
    emoji = '🥤';
  else if (key.includes('souvenir'))
    emoji = '🎁';

  return { emoji, label: key, color: colorForTag(key) };
}

(function renderLegend() {
  ['street food', 'main course', 'dessert', 'drink', 'edible souvenir', 'souvenir', 'default'].forEach(key => {
    if (!tagMap[key]) return;
    const t = tagMap[key];
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div>${t.emoji} ${t.label}</div>`;
    DOM.legend.appendChild(item);
  });
})();

// ============================================================
// 5. LOGIC GPS & ĐỊNH VỊ
// ============================================================

// Hàm dịch ngược tọa độ -> Tên địa điểm
async function reverseGeocode(latitude, longitude) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const address = data.address;

    const shortName = address.road || address.building || address.hamlet || '';
    const city = address.city || address.town || address.district || '';

    let result = '';
    if (shortName && city)
      result = `${shortName}, ${city}`;
    else
      result = data.display_name.split(',').slice(0, 3).join(',');

    return result || `Tọa độ: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  } catch (error) {
    console.error("Lỗi Geocode:", error);
    return "Vị trí hiện tại";
  }
}

// Hàm khởi tạo vị trí người dùng (Load từ Session Server)
async function initUserLocation() {
  const gpsOption = DOM.startSelect.querySelector('option[value="gps"]');

  // 1. Cập nhật UI: Đang tải
  if (gpsOption) gpsOption.textContent = "📍 Đang đồng bộ vị trí...";

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

      console.log("📍 Đã lấy toạ độ từ Session:", lat, lng);

      // Cập nhật giá trị input hidden (nếu có)
      DOM.startCoords.value = `${lng},${lat}`;

      // Di chuyển Marker
      userMarker.setLatLng([lat, lng]);

      // Zoom map tới vị trí
      map.setView([lat, lng], 18);

      // Lấy tên địa chỉ (Reverse Geocoding)
      const addressName = await reverseGeocode(lat, lng);

      // Cập nhật Select box
      if (gpsOption) {
        gpsOption.textContent = `📍 ${addressName}`;
        DOM.startSelect.value = 'gps'; // Tự động chọn option GPS
      }

      userMarker.bindPopup(`<b>Vị trí của bạn</b><br>${addressName}`).openPopup();

    } else {
      // Trường hợp Session trả về null
      throw new Error("Session chưa có dữ liệu vị trí");
    }

  } catch (error) {
    console.warn("⚠️ Không lấy được vị trí từ Session:", error);

    // Xử lý lỗi giao diện
    if (gpsOption) gpsOption.textContent = "📍 Không xác định được vị trí";
    DOM.startSelect.value = 'default'; // Quay về mặc định

  } finally {
    // Tắt loading
    if (DOM.loading) DOM.loading.style.display = 'none';
  }
}

// Sự kiện khi người dùng đổi Dropdown "Bắt đầu"
DOM.startSelect.addEventListener('change', (e) => {
  if (e.target.value === 'default') {
    DOM.startCoords.value = `${DEFAULT_COORDS[1]},${DEFAULT_COORDS[0]}`;
    userMarker.setLatLng(DEFAULT_COORDS).bindPopup("<b>Điểm xuất phát</b><br>Trường ĐH Khoa học Tự nhiên - ĐHQG TP.HCM").openPopup();
    map.setView(DEFAULT_COORDS, 14);
  } else {
    // Nếu chọn GPS thủ công -> Gọi lại hàm định vị
    DOM.loading.style.display = 'flex';
    initUserLocation();
  }
});

// Sự kiện click nút GPS
if (DOM.btnLocate) {
  DOM.btnLocate.onclick = () => {
    // Gọi lại hàm định vị
    initUserLocation();

    // Thêm hiệu ứng xoay nhẹ icon để báo đang load
    const icon = DOM.btnLocate.querySelector('svg');
    if (icon) {
      icon.style.transition = 'transform 0.5s';
      icon.style.transform = 'rotate(360deg)';
      setTimeout(() => icon.style.transform = 'rotate(0deg)', 500);
    }
  };
}

// ============================================================
// 6. LOGIC TÌM ĐƯỜNG
// ============================================================
function parseCoord(str) { return str ? str.split(',').map(Number) : null; }

async function performRouting(start, end, profile) {
  if (!start || !end) return;

  try {
    DOM.loading.style.display = 'flex';
    DOM.statusText.innerText = 'Đang tính đường...';

    // Gọi API qua Blueprint
    const res = await fetch('/map/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end, profile })
    });

    if (!res.ok) throw new Error(`Lỗi Server: ${res.status}`);
    const geojson = await res.json();

    if (routeLayer) map.removeLayer(routeLayer);

    if (geojson?.features?.length > 0) {
      routeLayer = L.geoJSON(geojson, {
        style: { color: '#3b82f6', weight: 5, opacity: 0.9, lineCap: 'round' }
      }).addTo(map);

      map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

      const s = geojson.features[0].properties.summary;
      // time scaling + human-friendly formatting
      const timeSec = s.duration; // seconds (giây)
      const distanceKm = (s.distance / 1000).toFixed(1); // km (kilomet)

      // Nếu profile là xe đạp -> chia cho 120, còn lại (ô tô, đi bộ...) chia cho 60
      const divisor = (profile === 'cycling-regular') ? 120 : 60; // divisor (mẫu số)

      let Depreciation = 1;
      if(profile === 'driving-car') Depreciation = 1.8;
      else if (profile === 'cycling-regular') Depreciation = 2.4;
      else Depreciation = 1;


      const minutesScaled = Depreciation * timeSec / divisor; // scaled minutes (phút đã điều chỉnh)

      // Chuyển đổi hiển thị: phút -> giờ -> ngày
      let timeDisplay;
      const totalMinutes = Math.ceil(minutesScaled); // Tổng phút đã làm tròn lên (rounded up)

      // Số phút trong 1 ngày và 1 giờ (constants)
      const MINUTES_PER_HOUR = 60;
      const MINUTES_PER_DAY = 60 * 24;

      if (totalMinutes >= MINUTES_PER_DAY) {
        // Tính days, hours, minutes (ngày, giờ, phút)
        const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
        let remAfterDays = totalMinutes - days * MINUTES_PER_DAY;

        const hours = Math.floor(remAfterDays / MINUTES_PER_HOUR);
        const minutes = remAfterDays - hours * MINUTES_PER_HOUR;

        // Tạo mảng phần hiển thị, bỏ phần = 0 để tối ưu
        const parts = [];
        if (days > 0) parts.push(`${days} ngày`); // days
        if (hours > 0) parts.push(`${hours} giờ`); // hours
        if (minutes > 0) parts.push(`${minutes} phút`); // minutes

        timeDisplay = parts.join(' ');
      } else if (totalMinutes >= MINUTES_PER_HOUR) {
        // Tính hours, minutes (giờ, phút)
        const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
        const minutes = totalMinutes - hours * MINUTES_PER_HOUR;

        if (minutes === 0) {
          timeDisplay = `${hours} giờ`; // exact hours only
        } else {
          timeDisplay = `${hours} giờ ${minutes} phút`; // hours + minutes
        }
      } else {
        // Chỉ phút (minutes)
        timeDisplay = `${totalMinutes} phút`;
      }


      // Ghi ra UI
      DOM.routeResult.innerHTML = `${distanceKm} km • ${timeDisplay}`;

      DOM.routeResult.style.display = 'block';
      DOM.statusText.innerText = 'Hoàn tất!';
    } else {
      DOM.statusText.innerText = 'Không tìm thấy đường.';
    }
  } catch (e) {
    console.error(e);
    DOM.statusText.innerText = 'Lỗi dịch vụ.';
  } finally {
    DOM.loading.style.display = 'none';
  }
}
// Logic Realtime
function clearRealtime() {
  if (realtimeTimer) {
    clearInterval(realtimeTimer);
    realtimeTimer = null;
  }
  DOM.statusText.innerText = 'Real-time tắt';
}

function startRealtimeIfNeeded() {
  if (!DOM.realtimeToggle.checked) {
    clearRealtime();
    return;
  }

  const start = parseCoord(DOM.startCoords.value);
  const end = parseCoord(DOM.endCoords.value);
  if (!start || !end) {
    DOM.statusText.innerText = 'Chưa đủ thông tin real-time';
    return;
  }

  if (realtimeTimer) clearInterval(realtimeTimer);

  const profile = DOM.profileSelect.value;
  const interval = REALTIME_INTERVALS[profile] || 60000;

  // Chạy ngay lần đầu
  performRouting(start, end, profile);

  // Lên lịch chạy định kỳ
  realtimeTimer = setInterval(() => {
    const s = parseCoord(DOM.startCoords.value);
    const e = parseCoord(DOM.endCoords.value);
    if (s && e)
      performRouting(s, e, profile);
    else
      clearRealtime();
  }, interval);

  DOM.statusText.innerText = `Real-time ON (${Math.round(interval / 1000)}s)`;
}

// Sự kiện UI: Nút Tìm Đường
DOM.btnDraw.onclick = () => {
  const start = parseCoord(DOM.startCoords.value);
  const end = parseCoord(DOM.endCoords.value);
  const profile = DOM.profileSelect.value;

  if (!start || !end) {
    alert('Vui lòng chọn đủ điểm đi và đến!');
    return;
  }

  performRouting(start, end, profile).then(() => {
    if (DOM.realtimeToggle.checked) startRealtimeIfNeeded();
  });
};

DOM.realtimeToggle.addEventListener('change', startRealtimeIfNeeded);
DOM.profileSelect.addEventListener('change', () => { if (DOM.realtimeToggle.checked) startRealtimeIfNeeded(); });

// ============================================================
// 7. LOGIC CỬA HÀNG
// ============================================================
async function loadStores() {
  // CẤU HÌNH CACHE
  const CACHE_KEY = 'MAP_STORES_DATA';
  const CACHE_DURATION = 60 * 60 * 1000; // 1 tiếng (ms)

  try {
    let stores = []; 
    let shouldFetch = true; // Mặc định là cần fetch mới

    console.log("🚀 Bắt đầu tải danh sách cửa hàng...");

    // --- KIỂM TRA LOCALSTORAGE & TIMESTAMP ---
    const cachedRaw = localStorage.getItem(CACHE_KEY);

    if (cachedRaw) {
      try {
        const cachedObj = JSON.parse(cachedRaw);
        const now = Date.now();
        const age = now - cachedObj.timestamp;

        // Kiểm tra xem cache còn hạn không
        if (age < CACHE_DURATION) {
          console.log(`♻️ Dùng dữ liệu từ LocalStorage (Cache còn hạn ${(CACHE_DURATION - age)/60000} phút).`);
          stores = cachedObj.data;
          shouldFetch = false; // Không cần fetch nữa
        } else {
          console.log("⚠️ Cache đã hết hạn (quá 1 tiếng). Tiến hành tải lại.");
        }
      } catch (err) {
        console.warn("Lỗi đọc cache, sẽ tải mới:", err);
      }
    }

    // --- GỌI API NẾU CẦN ---
    if (shouldFetch) {
      console.log("globe Đang gọi API lấy dữ liệu mới...");
      const res = await fetch('/map/api/stores');
      if (!res.ok) throw new Error('API Error');
      
      stores = await res.json();

      // Lưu vào LocalStorage kèm Timestamp
      const cacheData = {
        timestamp: Date.now(),
        data: stores
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      console.log("💾 Đã lưu dữ liệu mới vào LocalStorage.");
    }


    // Kiểm tra LocalStorage (Target Store - Đích đến)
    const targetData = localStorage.getItem('TARGET_STORE');
    let targetStoreId = null;

    if (targetData) {
      try {
        const parsed = JSON.parse(targetData);
        targetStoreId = parsed.id;
        console.log("📦 ID mục tiêu:", targetStoreId);

        localStorage.removeItem('TARGET_STORE');
      } catch (e) {
        console.error("❌ Lỗi đọc TARGET_STORE", e);
      }
    }

    // 3. Duyệt danh sách và vẽ Marker
    stores.forEach(s => {
      let lat = Number(s.lat ?? s.latitude ?? s.lat_str);
      let lng = Number(s.long ?? s.longitude ?? s.long_str);
      if (!lat || !lng) return;

      // Xử lý Tags
      let tags = Array.isArray(s.tags) ? s.tags : (s.tags ? s.tags.split(',') : []);
      tags = tags.map(normalizeTag).filter(Boolean);
      let primary = normalizeTag(s.primary_tag);
      if (!primary) {
        const priority = ['street food', 'main course', 'dessert', 'drink', 'edible souvenir', 'souvenir'];
        primary = priority.find(p => tags.includes(p)) || tags[0] || 'default';
      }

      const iconData = getTagIcon(primary);
      const marker = createMarker('store', lat, lng, { emoji: iconData.emoji, color: iconData.color }).addTo(map);

      // --- KIỂM TRA XEM CÓ PHẢI LÀ CỬA HÀNG MỤC TIÊU KHÔNG ---
      let isTargetStore = false;
      const currentId = s.store_id;

      if (targetStoreId !== null && String(currentId) === String(targetStoreId)) {
        isTargetStore = true; // Đánh dấu đây là đích đến
        console.log(`✅ Đã tìm thấy đích đến: ${s.name}`);

        // 1. Điền thông tin vào ô Input
        DOM.endDisplay.value = s.address ? `${s.name} - ${s.address}` : s.name;
        DOM.endCoords.value = `${lng},${lat}`;
        DOM.statusText.innerText = "Đã chọn điểm đến.";

        // 2. Zoom sâu vào địa điểm (Mức 18 là rất gần)
        setTimeout(() => {
          map.setView([lat, lng], 18);
          marker.openPopup();
        }, 800);

        // 3. Tự động vẽ đường nếu đã có GPS
        if (DOM.startCoords.value) {
          DOM.btnDraw.click();
        }
      }

      // --- TẠO POPUP ---
      const popupContent = document.createElement('div');
      popupContent.className = 'popup-content';

      let tagsHtml = '';
      if (tags.length) {
        tagsHtml = `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-bottom:8px;">
          ${tags.map(t => {
          const ic = getTagIcon(t);
          return `<span class="tag-badge" style="background:${ic.color}">${ic.emoji} <span style="text-transform:capitalize">${ic.label || t}</span></span>`;
        }).join('')}
        </div>`;
      }

      const safeName = s.name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      popupContent.innerHTML = `<h3>${safeName}</h3><p>${s.address || ''}</p>${tagsHtml}`;

      // ẨN NÚT NẾU LÀ ĐÍCH ĐẾN ---
      if (!isTargetStore) {
        // Chỉ tạo 1 nút "Chỉ đường" duy nhất
        const btnRouteNow = document.createElement('button');
        btnRouteNow.className = 'btn-route';
        btnRouteNow.innerText = '🚙 Chỉ đường';

        btnRouteNow.onclick = () => {
          // --- 1. Thực hiện logic gán điểm đến ---
          DOM.endDisplay.value = s.address ? `${s.name} - ${s.address}` : s.name;
          DOM.endCoords.value = `${lng},${lat}`;
          DOM.statusText.innerText = "Đang tìm đường...";

          marker.closePopup(); // Đóng popup cho đỡ vướng

          // Mở panel nếu đang đóng để xem kết quả
          if (DOM.panel.classList.contains('collapsed')) DOM.toggleBtn.click();

          // --- 2. Gọi hàm vẽ đường ngay lập tức ---
          DOM.btnDraw.click();
        };

        // Chỉ append nút này vào popup
        popupContent.append(btnRouteNow);

      } else {
        // Hiển thị text nếu là đích đến
        const infoText = document.createElement('div');
        infoText.style.color = 'green';
        infoText.style.fontWeight = 'bold';
        infoText.style.marginTop = '8px';
        infoText.innerText = '🎯 Điểm đến của bạn';
        popupContent.append(infoText);
      }
      // ------------------------------------------

      marker.bindPopup(popupContent);
    });
  } catch (e) {
    console.error('🔥 Lỗi load store:', e);
  }
}
// ============================================================
// 8. KHỞI CHẠY
// ============================================================
// Bước 1: Lấy vị trí user
initUserLocation();

// Bước 2: Tải cửa hàng lên map
loadStores();