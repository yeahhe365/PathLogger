/**
 * PathLogger - 优化版本
 * 跟踪和记录位置数据的Web应用
 * 
 * 特性:
 * - 实时位置跟踪和可视化
 * - 轨迹记录和回放
 * - 导出GPX格式数据
 * - 离线支持
 * - 日志管理
 * - 多地图图层支持
 * - 响应式设计
 */

// 使用IIFE模式创建应用命名空间
const PathLoggerApp = (function() {
	'use strict';
  
	// ===== 配置常量 =====
	const DEFAULT_ZOOM = 15;
	const DEFAULT_POSITION = [0, 0]; // 默认地图中心
	const MIN_DISTANCE_THRESHOLD = 0; // 默认最小距离阈值(米)
	const DEFAULT_REFRESH_RATE = 5; // 默认刷新频率(秒)
	const DEFAULT_STORAGE_LIMIT = 100; // 默认日志存储限制
	const INITIAL_DELAY = 800; // 初始加载延迟(毫秒)
  
	// ===== 应用状态 =====
	const state = {
	  tracking: false,         // 是否正在追踪
	  autoZoom: true,          // 是否自动缩放到当前位置
	  darkMode: false,         // 是否启用暗色模式
	  highAccuracy: true,      // 是否使用高精度定位
	  notifications: true,     // 是否显示通知
	  addressLookup: true,     // 是否查询地址
	  exactCoords: true,       // 是否记录精确坐标
	  refreshRate: DEFAULT_REFRESH_RATE, // 刷新频率(秒)
	  minDistance: MIN_DISTANCE_THRESHOLD, // 最小记录距离(米)
	  zoomLevel: DEFAULT_ZOOM, // 缩放级别
	  storageLimit: DEFAULT_STORAGE_LIMIT, // 存储限制
	  totalDistance: 0,        // 总移动距离(公里)
	  lastPosition: null,      // 上一个位置
	  currentPosition: null,   // 当前位置
	  isFirstLocation: true,   // 是否是第一次定位
	  trackStartTime: null,    // 追踪开始时间
	  offline: false,          // 是否离线
	  currentAddress: null,    // 当前地址
	  updateInterval: null,    // 更新间隔ID
	  historyGroups: {}        // 历史数据分组
	};
  
	// ===== DOM元素缓存 =====
	let elements = {};
  
	// ===== 地图相关变量 =====
	let map, marker, polyline, positionCircle;
	
	// 地图图层配置
	const mapLayers = {
	  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
	  }),
	  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
		attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
	  }),
	  terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
		attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
	  }),
	  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
	  })
	};
  
	// ===== 辅助函数 =====
  
	/**
	 * 事件委托辅助函数
	 * @param {string} selector - CSS选择器
	 * @param {string} event - 事件名称
	 * @param {Function} handler - 事件处理函数
	 */
	function delegate(selector, event, handler) {
	  document.addEventListener(event, function(e) {
		const target = e.target.closest(selector);
		if (target) {
		  handler.call(target, e);
		}
	  }, false);
	}
  
	/**
	 * 创建节流函数
	 * @param {Function} func - 要节流的函数
	 * @param {number} delay - 延迟时间(毫秒)
	 * @returns {Function} 节流后的函数
	 */
	function throttle(func, delay) {
	  let lastCall = 0;
	  return function(...args) {
		const now = new Date().getTime();
		if (now - lastCall < delay) {
		  return;
		}
		lastCall = now;
		return func(...args);
	  };
	}
  
	/**
	 * 创建防抖函数
	 * @param {Function} func - 要防抖的函数
	 * @param {number} delay - 延迟时间(毫秒)
	 * @returns {Function} 防抖后的函数
	 */
	function debounce(func, delay) {
	  let timer;
	  return function(...args) {
		clearTimeout(timer);
		timer = setTimeout(() => {
		  func.apply(this, args);
		}, delay);
	  };
	}
  
	/**
	 * 格式化日期
	 * @param {Date} date - 日期对象
	 * @param {boolean} includeTime - 是否包含时间
	 * @returns {string} 格式化后的日期字符串
	 */
	function formatDate(date, includeTime = true) {
	  if (!date) return '';
	  
	  const options = { 
		year: 'numeric', 
		month: '2-digit', 
		day: '2-digit'
	  };
	  
	  if (includeTime) {
		options.hour = '2-digit';
		options.minute = '2-digit';
		options.second = '2-digit';
		options.hour12 = false;
	  }
	  
	  return date.toLocaleString('zh-CN', options);
	}
  
	/**
	 * 格式化持续时间
	 * @param {number} seconds - 总秒数
	 * @returns {string} 格式化后的时间字符串 (HH:MM:SS)
	 */
	function formatDuration(seconds) {
	  if (!seconds) return '00:00:00';
	  
	  const hours = Math.floor(seconds / 3600);
	  const minutes = Math.floor((seconds % 3600) / 60);
	  const secs = Math.floor(seconds % 60);
	  
	  return [hours, minutes, secs]
		.map(v => v < 10 ? "0" + v : v)
		.join(":");
	}
  
	/**
	 * 计算两点之间的距离(公里)
	 * @param {number} lat1 - 第一点纬度
	 * @param {number} lon1 - 第一点经度
	 * @param {number} lat2 - 第二点纬度
	 * @param {number} lon2 - 第二点经度
	 * @returns {number} 距离(公里)
	 */
	function calculateDistance(lat1, lon1, lat2, lon2) {
	  if (lat1 === lat2 && lon1 === lon2) {
		return 0;
	  }
	  
	  const R = 6371; // 地球半径(公里)
	  const dLat = deg2rad(lat2 - lat1);
	  const dLon = deg2rad(lon2 - lon1);
	  const a = 
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
		Math.sin(dLon / 2) * Math.sin(dLon / 2);
	  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	  return R * c;
	}
  
	/**
	 * 角度转弧度
	 * @param {number} deg - 角度值
	 * @returns {number} 弧度值
	 */
	function deg2rad(deg) {
	  return deg * (Math.PI / 180);
	}
  
	/**
	 * 模糊坐标(隐私保护)
	 * @param {number} coord - 坐标值(经度或纬度)
	 * @returns {number} 模糊后的坐标值
	 */
	function obfuscateCoordinate(coord) {
	  if (state.exactCoords) {
		return coord;
	  }
	  // 在第4位小数上添加小的随机偏移(约10-20米)
	  const offset = (Math.random() - 0.5) * 0.001;
	  return Math.round((coord + offset) * 10000) / 10000;
	}
  
	/**
	 * 生成唯一ID
	 * @returns {string} UUID
	 */
	function generateUUID() {
	  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	  });
	}
  
	/**
	 * 检查两个位置之间的距离是否足够大以记录
	 * @param {object} newPosition - 新位置
	 * @param {object} lastPosition - 上一个位置
	 * @returns {boolean} 是否应该记录
	 */
	function shouldRecordPosition(newPosition, lastPosition) {
	  if (!lastPosition) return true;
	  
	  const { latitude: lat1, longitude: lon1 } = lastPosition.coords;
	  const { latitude: lat2, longitude: lon2 } = newPosition.coords;
	  
	  // 计算距离(米)
	  const distance = calculateDistance(lat1, lon1, lat2, lon2) * 1000;
	  
	  // 如果距离大于设定的最小阈值，则记录
	  return distance >= state.minDistance;
	}
  
	/**
	 * 显示通知
	 * @param {string} title - 通知标题
	 * @param {string} message - 通知内容
	 * @param {string} type - 通知类型 (info, success, warning, error)
	 * @param {number} duration - 持续时间(毫秒)
	 */
	function showNotification(title, message, type = 'info', duration = 5000) {
	  if (!state.notifications) return;
	  
	  const container = elements.notificationContainer;
	  const notification = document.createElement('div');
	  notification.className = `notification ${type}`;
	  
	  // 图标映射
	  const icons = {
		info: 'info',
		success: 'check_circle',
		warning: 'warning',
		error: 'error'
	  };
	  
	  notification.innerHTML = `
		<span class="material-icons-round">${icons[type] || 'info'}</span>
		<div class="notification-content">
		  <h4 class="notification-title">${title}</h4>
		  <p class="notification-message">${message}</p>
		</div>
		<button class="notification-close" aria-label="关闭通知">
		  <span class="material-icons-round">close</span>
		</button>
	  `;
	  
	  // 关闭按钮事件
	  const closeBtn = notification.querySelector('.notification-close');
	  closeBtn.addEventListener('click', () => {
		notification.style.opacity = '0';
		notification.style.transform = 'translateY(-10px)';
		setTimeout(() => {
		  notification.remove();
		}, 300);
	  });
	  
	  container.appendChild(notification);
	  
	  // 自动关闭 - 避免使用内联样式，保持所有动画在CSS中
	  setTimeout(() => {
		if (notification.parentNode) {
		  notification.classList.add('fading');
		  setTimeout(() => {
			notification.remove();
		  }, 300);
		}
	  }, duration);
	}
  
	/**
	 * 显示按钮操作反馈
	 * @param {HTMLElement} button - 按钮元素
	 * @param {string} message - 反馈消息
	 * @param {boolean} isError - 是否为错误消息
	 */
	function showButtonFeedback(button, message, isError = false) {
	  button.setAttribute('data-tooltip', message);
	  button.classList.add(isError ? 'feedback-error' : 'feedback-success');
	  
	  setTimeout(() => {
		button.classList.remove('feedback-error', 'feedback-success');
		// 恢复原来的tooltip
		if (button.dataset.originalTooltip) {
		  button.setAttribute('data-tooltip', button.dataset.originalTooltip);
		}
	  }, 2000);
	}
  
	/**
	 * 更新状态栏信息
	 */
	function updateStatusBar() {
	  if (!state.currentPosition) return;
	  
	  const { latitude, longitude } = state.currentPosition.coords;
	  
	  // 更新坐标显示
	  elements.latLngText.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
	  
	  // 更新距离显示
	  elements.distanceText.textContent = `总距离: ${state.totalDistance.toFixed(2)} km`;
	  
	  // 更新时间显示
	  if (state.tracking && state.trackStartTime) {
		const duration = Math.floor((Date.now() - state.trackStartTime) / 1000);
		elements.durationText.textContent = formatDuration(duration);
	  }
	}
  
	/**
	 * 更新追踪时间显示
	 */
	function updateTrackingTime() {
	  if (state.tracking && state.trackStartTime) {
		const duration = Math.floor((Date.now() - state.trackStartTime) / 1000);
		elements.durationText.textContent = formatDuration(duration);
	  }
	}
  
	// ===== 本地存储函数 =====
  
	/**
	 * 保存日志到本地存储
	 * @param {string} logContent - 日志内容
	 * @param {object} position - 位置对象
	 * @param {string} address - 地址
	 */
	function saveToLocalStorage(logContent, position, address) {
	  // 复制位置对象，避免循环引用
	  const positionCopy = position ? {
		coords: {
		  latitude: position.coords.latitude,
		  longitude: position.coords.longitude,
		  altitude: position.coords.altitude,
		  accuracy: position.coords.accuracy,
		  altitudeAccuracy: position.coords.altitudeAccuracy,
		  heading: position.coords.heading,
		  speed: position.coords.speed
		},
		timestamp: position.timestamp
	  } : null;
	  
	  // 创建日志条目
	  const logEntry = {
		id: generateUUID(),
		content: logContent,
		position: positionCopy,
		address: address,
		timestamp: Date.now(),
		date: formatDate(new Date()),
		distance: state.lastPosition ? calculateDistance(
		  state.lastPosition.coords.latitude,
		  state.lastPosition.coords.longitude,
		  position.coords.latitude,
		  position.coords.longitude
		) : 0
	  };
	  
	  // 获取现有日志
	  let logs = JSON.parse(localStorage.getItem('pathlogger_logs') || '[]');
	  
	  // 添加新日志
	  logs.push(logEntry);
	  
	  // 如果超出限制，删除旧日志
	  if (state.storageLimit > 0 && logs.length > state.storageLimit) {
		logs = logs.slice(-state.storageLimit);
	  }
	  
	  // 保存到本地存储
	  localStorage.setItem('pathlogger_logs', JSON.stringify(logs));
	  
	  // 保存位置历史
	  savePositionHistory(positionCopy, address);
	}
  
	/**
	 * 保存位置历史到本地存储
	 * @param {object} position - 位置对象
	 * @param {string} address - 地址
	 */
	function savePositionHistory(position, address) {
	  if (!position) return;
	  
	  // 获取现有历史
	  let history = JSON.parse(localStorage.getItem('pathlogger_history') || '[]');
	  
	  // 创建历史条目
	  const historyEntry = {
		id: generateUUID(),
		position: position,
		address: address,
		timestamp: Date.now(),
		date: formatDate(new Date(), false) // 只包含日期，不包含时间
	  };
	  
	  // 添加新历史条目
	  history.push(historyEntry);
	  
	  // 保存到本地存储
	  localStorage.setItem('pathlogger_history', JSON.stringify(history));
	}
  
	/**
	 * 从本地存储加载日志
	 */
	function loadLogsFromLocalStorage() {
	  const logs = JSON.parse(localStorage.getItem('pathlogger_logs') || '[]');
	  
	  // 清空现有日志显示
	  elements.log.innerHTML = '';
	  
	  // 添加日志
	  logs.forEach(log => {
		addLogToDOM(log.content, new Date(log.timestamp));
	  });
	}
  
	/**
	 * 从本地存储加载位置历史
	 */
	function loadHistoryFromLocalStorage() {
	  const history = JSON.parse(localStorage.getItem('pathlogger_history') || '[]');
	  
	  // 按日期分组
	  const historyByDate = history.reduce((groups, item) => {
		const date = item.date;
		if (!groups[date]) {
		  groups[date] = [];
		}
		groups[date].push(item);
		return groups;
	  }, {});
	  
	  state.historyGroups = historyByDate;
	  
	  return historyByDate;
	}
  
	/**
	 * 加载设置
	 */
	function loadSettings() {
	  // 从本地存储加载设置
	  state.darkMode = localStorage.getItem('darkMode') === 'true';
	  state.autoZoom = localStorage.getItem('autoZoom') !== 'false'; // 默认为 true
	  state.refreshRate = parseInt(localStorage.getItem('refreshRate')) || DEFAULT_REFRESH_RATE;
	  state.minDistance = parseInt(localStorage.getItem('minDistance')) || MIN_DISTANCE_THRESHOLD;
	  state.zoomLevel = parseInt(localStorage.getItem('zoomLevel')) || DEFAULT_ZOOM;
	  state.highAccuracy = localStorage.getItem('highAccuracy') !== 'false'; // 默认为 true
	  state.notifications = localStorage.getItem('notifications') !== 'false'; // 默认为 true
	  state.addressLookup = localStorage.getItem('addressLookup') !== 'false'; // 默认为 true
	  state.exactCoords = localStorage.getItem('exactCoords') !== 'false'; // 默认为 true
	  state.storageLimit = parseInt(localStorage.getItem('storageLimit')) || DEFAULT_STORAGE_LIMIT;
	  
	  // 更新UI以反映设置
	  updateSettingsUI();
	  
	  // 应用暗色模式
	  if (state.darkMode) {
		document.body.classList.add('dark-mode');
	  }
	}
  
	/**
	 * 保存设置
	 */
	function saveSettings() {
	  // 获取表单值
	  state.refreshRate = parseInt(elements.refreshRate.value);
	  state.minDistance = parseInt(elements.minDistance.value);
	  state.darkMode = elements.darkModeToggle.checked;
	  state.autoZoom = elements.autoZoomToggle.checked;
	  state.highAccuracy = elements.highAccuracyToggle.checked;
	  state.notifications = elements.notificationsToggle.checked;
	  state.addressLookup = elements.addressLookupToggle.checked;
	  state.exactCoords = elements.exactCoordsToggle.checked;
	  state.zoomLevel = parseInt(elements.zoomLevel.value);
	  state.storageLimit = parseInt(elements.storageLimit.value);
	  
	  // 保存到本地存储
	  localStorage.setItem('darkMode', state.darkMode);
	  localStorage.setItem('autoZoom', state.autoZoom);
	  localStorage.setItem('refreshRate', state.refreshRate);
	  localStorage.setItem('minDistance', state.minDistance);
	  localStorage.setItem('highAccuracy', state.highAccuracy);
	  localStorage.setItem('notifications', state.notifications);
	  localStorage.setItem('addressLookup', state.addressLookup);
	  localStorage.setItem('exactCoords', state.exactCoords);
	  localStorage.setItem('zoomLevel', state.zoomLevel);
	  localStorage.setItem('storageLimit', state.storageLimit);
	  
	  // 切换暗色模式
	  document.body.classList.toggle('dark-mode', state.darkMode);
	  
	  // 修改地图图层
	  changeMapLayer();
	  
	  // 若正在追踪，则重置间隔
	  if (state.tracking) {
		resetTrackingInterval();
	  }
	  
	  // 关闭设置面板
	  closeSettings();
	  
	  // 显示通知
	  showNotification('设置已保存', '您的偏好设置已成功应用', 'success');
	}
  
	/**
	 * 更新设置UI
	 */
	function updateSettingsUI() {
	  elements.refreshRate.value = state.refreshRate;
	  elements.refreshRateValue.textContent = `${state.refreshRate}秒`;
	  
	  elements.minDistance.value = state.minDistance;
	  elements.minDistanceValue.textContent = `${state.minDistance}米`;
	  
	  elements.darkModeToggle.checked = state.darkMode;
	  elements.autoZoomToggle.checked = state.autoZoom;
	  elements.highAccuracyToggle.checked = state.highAccuracy;
	  elements.notificationsToggle.checked = state.notifications;
	  elements.addressLookupToggle.checked = state.addressLookup;
	  elements.exactCoordsToggle.checked = state.exactCoords;
	  
	  elements.zoomLevel.value = state.zoomLevel;
	  elements.zoomLevelValue.textContent = state.zoomLevel;
	  
	  elements.storageLimit.value = state.storageLimit;
	  
	  // 更新地图图层选择
	  const currentLayer = localStorage.getItem('mapLayer') || 'osm';
	  elements.layerSelect.value = currentLayer;
	}
  
	/**
	 * 重置应用状态
	 */
	function resetAppState() {
	  // 重置追踪状态
	  if (state.updateInterval) {
		clearInterval(state.updateInterval);
		state.updateInterval = null;
	  }
	  
	  state.tracking = false;
	  state.totalDistance = 0;
	  state.lastPosition = null;
	  state.currentPosition = null;
	  state.isFirstLocation = true;
	  state.trackStartTime = null;
	  
	  // 重置UI
	  elements.trackBtn.classList.remove('tracking');
	  elements.durationText.textContent = '00:00:00';
	  elements.distanceText.textContent = '总距离: 0.00 km';
	  elements.latLngText.textContent = '等待定位...';
	  
	  // 重置地图
	  if (polyline) {
		polyline.setLatLngs([]);
	  }
	  
	  if (marker) {
		marker.removeFrom(map);
		marker = null;
	  }
	  
	  if (positionCircle) {
		positionCircle.removeFrom(map);
		positionCircle = null;
	  }
	}
  
	// ===== 地图功能 =====
  
	/**
	 * 初始化地图
	 */
	function initMap() {
	  // 创建地图
	  map = L.map('map', {
		center: DEFAULT_POSITION,
		zoom: state.zoomLevel,
		zoomControl: false,
		attributionControl: false
	  });
	  
	  // 添加缩放控件
	  L.control.zoom({
		position: 'bottomright'
	  }).addTo(map);
	  
	  // 添加归因控件
	  L.control.attribution({
		position: 'bottomleft'
	  }).addTo(map);
	  
	  // 添加默认图层
	  const defaultLayer = localStorage.getItem('mapLayer') || 'osm';
	  mapLayers[defaultLayer].addTo(map);
	  
	  // 创建轨迹线 - 使用更美观的样式
	  polyline = L.polyline([], { 
		color: '#2563eb',
		weight: 4,
		opacity: 0.8,
		lineJoin: 'round',
		lineCap: 'round',
		dashArray: state.tracking ? null : '5, 10' // 追踪时实线，否则虚线
	  }).addTo(map);
	  
	  // 添加自定义CSS到页面以支持标记动画
	  const customCSS = `
		.custom-marker {
		  background: transparent;
		  border: none;
		}
		.position-marker {
		  width: 24px;
		  height: 24px;
		  background: rgba(37, 99, 235, 0.2);
		  border-radius: 50%;
		  position: relative;
		  animation: pulse 2s infinite;
		}
		.inner-marker {
		  width: 12px;
		  height: 12px;
		  background: #2563eb;
		  border-radius: 50%;
		  position: absolute;
		  top: 50%;
		  left: 50%;
		  transform: translate(-50%, -50%);
		  box-shadow: 0 0 8px rgba(37, 99, 235, 0.6);
		}
		@keyframes pulse {
		  0% {
			transform: scale(0.8);
			opacity: 1;
		  }
		  70% {
			transform: scale(1.2);
			opacity: 0.7;
		  }
		  100% {
			transform: scale(0.8);
			opacity: 1;
		  }
		}
	  `;
	  
	  // 将自定义CSS添加到页面
	  const style = document.createElement('style');
	  style.textContent = customCSS;
	  document.head.appendChild(style);
	  
	  // 添加地图搜索
	  L.Control.geocoder({
		defaultMarkGeocode: false,
		position: 'topright',
		placeholder: '搜索地点...',
		errorMessage: '找不到该地点',
		showResultIcons: true
	  })
	  .on('markgeocode', function(e) {
		if (map) {
		  const latlng = e.geocode.center;
		  
		  // 缩放到找到的位置
		  map.setView(latlng, 15);
		  
		  // 添加临时标记
		  const tempMarker = L.marker(latlng).addTo(map);
		  tempMarker.bindPopup(e.geocode.name).openPopup();
		  
		  // 5秒后移除临时标记
		  setTimeout(() => {
			map.removeLayer(tempMarker);
		  }, 5000);
		}
	  })
	  .addTo(map);
	  
	  // 缩放时刷新地图大小
	  map.on('zoomend', function() {
		map.invalidateSize();
	  });
	  
	  // 监听地图点击
	  map.on('click', function(e) {
		const { lat, lng } = e.latlng;
		
		// 创建弹出窗口
		const popup = L.popup()
		  .setLatLng(e.latlng)
		  .setContent(`
			<div>
			  <strong>位置信息</strong><br>
			  纬度: ${lat.toFixed(6)}<br>
			  经度: ${lng.toFixed(6)}<br>
			  <button id="copyCoords" class="popup-button">复制坐标</button>
			</div>
		  `)
		  .openOn(map);
		  
		// 为弹出窗口中的按钮添加点击事件
		document.getElementById('copyCoords').addEventListener('click', function() {
		  navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
			.then(() => {
			  this.textContent = '已复制!';
			})
			.catch(() => {
			  this.textContent = '复制失败';
			});
		});
	  });
	}
  
	/**
	 * 改变地图图层
	 */
	function changeMapLayer() {
	  const selectedLayer = elements.layerSelect.value;
	  
	  Object.keys(mapLayers).forEach(key => {
		if (key === selectedLayer) {
		  map.addLayer(mapLayers[key]);
		} else {
		  if (map.hasLayer(mapLayers[key])) {
			map.removeLayer(mapLayers[key]);
		  }
		}
	  });
	  
	  localStorage.setItem('mapLayer', selectedLayer);
	}
  
	// ===== 位置追踪功能 =====
  
	/**
	 * 获取当前位置
	 */
	function getLocation() {
	  if (!navigator.geolocation) {
		addLog("错误: 该浏览器不支持地理定位。");
		showNotification('定位错误', '您的浏览器不支持地理定位功能', 'error');
		return;
	  }
	  
	  // 显示加载指示器
	  elements.mapLoader.classList.add('active');
	  
	  // 定位选项
	  const options = {
		enableHighAccuracy: state.highAccuracy,
		timeout: 30000,
		maximumAge: 0
	  };
	  
	  navigator.geolocation.getCurrentPosition(
		position => processPosition(position),
		error => handleLocationError(error),
		options
	  );
	}
  
	/**
	 * 处理位置信息
	 * @param {object} position - 地理位置对象
	 */
	function processPosition(position) {
	  // 隐藏加载指示器
	  elements.mapLoader.classList.remove('active');
	  
	  // 检查是否应该记录这个位置
	  if (!shouldRecordPosition(position, state.lastPosition) && !state.isFirstLocation) {
		console.log('位置变化太小，忽略此更新');
		return;
	  }
	  
	  const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;
	  const timestamp = position.timestamp ? new Date(position.timestamp) : new Date();
	  
	  // 应用坐标混淆（如果启用）
	  const displayLat = obfuscateCoordinate(latitude);
	  const displayLng = obfuscateCoordinate(longitude);
	  
	  // 构建日志内容
	  let logContent = `位置更新:
纬度: ${displayLat}
经度: ${displayLng}
精度: ${accuracy ? accuracy.toFixed(2) + ' 米' : '未知'}
时间: ${formatDate(timestamp)}`;

	  // 添加可选信息
	  if (altitude) logContent += `\n海拔: ${altitude.toFixed(2)} 米`;
	  if (heading) logContent += `\n方向: ${heading.toFixed(2)}°`;
	  if (speed) {
		const speedKmh = (speed * 3.6).toFixed(2);
		logContent += `\n速度: ${speedKmh} km/h`;
		
		// 添加速度描述
		if (speedKmh < 5) {
		  logContent += ` (步行速度)`;
		} else if (speedKmh < 15) {
		  logContent += ` (跑步/骑行)`;
		} else if (speedKmh < 50) {
		  logContent += ` (车辆)`;
		} else {
		  logContent += ` (高速移动)`;
		}
	  }
	  
	  // 更新状态
	  state.currentPosition = position;
	  
	  // 初始化地图（如果尚未初始化）
	  if (!map) {
		initMap();
	  }
	  
	  // 更新地图视图（如果自动缩放启用或首次定位）
	  if (state.autoZoom || state.isFirstLocation) {
		map.setView([latitude, longitude], state.isFirstLocation ? state.zoomLevel : map.getZoom());
	  }
	  
	  // 更新或创建标记 - 添加带动画的标记
	  if (marker) {
		marker.setLatLng([latitude, longitude]);
	  } else {
		// 创建自定义的位置图标
		const positionIcon = L.divIcon({
		  className: 'custom-marker',
		  html: `<div class="position-marker"><div class="inner-marker"></div></div>`,
		  iconSize: [24, 24],
		  iconAnchor: [12, 12]
		});
		
		marker = L.marker([latitude, longitude], {
		  icon: positionIcon
		}).addTo(map);
	  }
	  
	  // 更新或创建精度圆 - 使用更美观的样式
	  if (positionCircle) {
		positionCircle.setLatLng([latitude, longitude]);
		positionCircle.setRadius(accuracy);
	  } else {
		positionCircle = L.circle([latitude, longitude], {
		  radius: accuracy,
		  color: '#2563eb',
		  fillColor: '#3b82f6',
		  fillOpacity: 0.1,
		  weight: 2
		}).addTo(map);
	  }
	  
	  // 添加点到轨迹线
	  polyline.addLatLng([latitude, longitude]);
	  
	  // 计算移动距离
	  if (state.lastPosition) {
		const distance = calculateDistance(
		  state.lastPosition.coords.latitude,
		  state.lastPosition.coords.longitude,
		  latitude,
		  longitude
		);
		
		// 添加到总距离
		state.totalDistance += distance;
		
		// 添加到日志
		logContent += `\n移动距离: ${distance.toFixed(2)} 公里`;
		logContent += `\n总移动距离: ${state.totalDistance.toFixed(2)} 公里`;
	  }
	  
	  state.lastPosition = position;
	  state.isFirstLocation = false;
	  
	  // 更新状态栏
	  updateStatusBar();
	  
	  // 尝试获取地址（如果启用）
	  if (state.addressLookup) {
		fetchAddress(latitude, longitude)
		  .then(address => {
			state.currentAddress = address;
			logContent += `\n地址: ${address}`;
			addLog(logContent);
			saveToLocalStorage(logContent, position, address);
		  })
		  .catch(error => {
			console.error('Error fetching address:', error);
			addLog(`${logContent}\n地址: 无法获取地址信息`);
			saveToLocalStorage(logContent, position, '未知地址');
		  });
	  } else {
		addLog(logContent);
		saveToLocalStorage(logContent, position, '地址查询已禁用');
	  }
	}
  
	/**
	 * 处理位置错误
	 * @param {object} error - 错误对象
	 */
	function handleLocationError(error) {
	  // 隐藏加载指示器
	  elements.mapLoader.classList.remove('active');
	  
	  let errorMessage;
	  let notificationMessage;
	  
	  switch(error.code) {
		case error.PERMISSION_DENIED:
		  errorMessage = "错误: 用户拒绝了地理定位请求。请确保已授予位置权限。";
		  notificationMessage = "位置权限被拒绝，请在浏览器设置中允许位置访问";
		  break;
		case error.POSITION_UNAVAILABLE:
		  errorMessage = "错误: 位置信息不可用。请检查设备的GPS是否开启。";
		  notificationMessage = "无法获取位置信息，请检查GPS是否开启";
		  break;
		case error.TIMEOUT:
		  errorMessage = "错误: 请求用户地理位置超时。请检查网络连接并重试。";
		  notificationMessage = "定位请求超时，请检查网络连接";
		  break;
		default:
		  errorMessage = "错误: 发生未知错误，代码: " + error.code + "。请稍后重试。";
		  notificationMessage = "定位发生未知错误，请稍后重试";
		  break;
	  }
	  
	  addLog(errorMessage);
	  showNotification('定位错误', notificationMessage, 'error');
	  
	  // 如果处于追踪模式，停止追踪
	  if (state.tracking) {
		stopTracking();
	  }
	}
  
	/**
	 * 尝试获取地址
	 * @param {number} latitude - 纬度
	 * @param {number} longitude - 经度
	 * @returns {Promise<string>} 地址
	 */
	function fetchAddress(latitude, longitude) {
	  if (!state.addressLookup || state.offline) {
		return Promise.resolve('地址查询已禁用或离线状态');
	  }
	  
	  return fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, {
		headers: {
		  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
		  'User-Agent': 'PathLogger/1.0'
		}
	  })
	  .then(response => {
		if (!response.ok) {
		  throw new Error('网络响应异常');
		}
		return response.json();
	  })
	  .then(data => {
		return data.display_name || '未知地址';
	  })
	  .catch(error => {
		console.error('地址查询失败:', error);
		return '无法获取地址';
	  });
	}
  
	/**
	 * 开始追踪
	 */
	function startTracking() {
	  state.tracking = true;
	  state.trackStartTime = Date.now();
	  
	  elements.trackBtn.classList.add('tracking');
	  
	  // 获取一次初始位置
	  getLocation();
	  
	  // 设置定期更新
	  state.updateInterval = setInterval(getLocation, state.refreshRate * 1000);
	  
	  // 设置时间更新
	  state.timeUpdateInterval = setInterval(updateTrackingTime, 1000);
	  
	  // 添加日志
	  addLog(`信息: 已开始实时追踪位置（每${state.refreshRate}秒一次）`);
	  
	  // 显示通知
	  showNotification('追踪已开始', `位置将每${state.refreshRate}秒更新一次`, 'info');
	}
  
	/**
	 * 停止追踪
	 */
	function stopTracking() {
	  state.tracking = false;
	  
	  elements.trackBtn.classList.remove('tracking');
	  
	  // 清除更新间隔
	  if (state.updateInterval) {
		clearInterval(state.updateInterval);
		state.updateInterval = null;
	  }
	  
	  // 清除时间更新间隔
	  if (state.timeUpdateInterval) {
		clearInterval(state.timeUpdateInterval);
		state.timeUpdateInterval = null;
	  }
	  
	  // 记录追踪时间
	  const duration = state.trackStartTime ? Math.floor((Date.now() - state.trackStartTime) / 1000) : 0;
	  const formattedDuration = formatDuration(duration);
	  
	  // 添加日志
	  addLog(`信息: 已停止实时追踪位置
  追踪时长: ${formattedDuration}
  总移动距离: ${state.totalDistance.toFixed(2)} 公里`);
	  
	  // 显示通知
	  showNotification('追踪已停止', `总距离: ${state.totalDistance.toFixed(2)} 公里，时长: ${formattedDuration}`, 'success');
	}
  
	/**
	 * 重新设置追踪间隔
	 */
	function resetTrackingInterval() {
	  if (state.tracking && state.updateInterval) {
		clearInterval(state.updateInterval);
		state.updateInterval = setInterval(getLocation, state.refreshRate * 1000);
		
		addLog(`信息: 已更新实时追踪频率（每${state.refreshRate}秒一次）`);
	  }
	}
  
	/**
	 * 分享当前位置
	 */
	function shareLocation() {
	  if (!state.currentPosition) {
		showNotification('无法分享', '请先获取您的位置', 'warning');
		return;
	  }
	  
	  const { latitude, longitude } = state.currentPosition.coords;
	  let shareText = `我的位置: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
	  
	  if (state.currentAddress) {
		shareText += `\n地址: ${state.currentAddress}`;
	  }
	  
	  const shareUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
	  
	  // 检查Web Share API是否可用
	  if (navigator.share) {
		navigator.share({
		  title: '我的位置',
		  text: shareText,
		  url: shareUrl
		})
		.then(() => {
		  showNotification('分享成功', '位置信息已成功分享', 'success');
		})
		.catch((error) => {
		  console.error('分享失败:', error);
		  fallbackShare();
		});
	  } else {
		fallbackShare();
	  }
	  
	  // 备用分享方法：复制到剪贴板
	  function fallbackShare() {
		const fullShareText = `${shareText}\n${shareUrl}`;
		
		navigator.clipboard.writeText(fullShareText)
		  .then(() => {
			showNotification('已复制位置', '位置链接已复制到剪贴板', 'success');
			addLog(`位置链接已复制到剪贴板：<a href="${shareUrl}" target="_blank">${shareUrl}</a>`);
		  })
		  .catch(() => {
			showNotification('复制失败', '无法复制位置信息到剪贴板', 'error');
			addLog(`错误: 复制到剪贴板失败，请手动复制链接: ${shareUrl}`);
		  });
	  }
	}
  
	/**
	 * 导出GPX轨迹
	 */
	function exportGPX() {
	  if (!polyline || polyline.getLatLngs().length === 0) {
		showNotification('导出失败', '没有轨迹可导出', 'warning');
		return;
	  }
	  
	  const gpx = generateGPX();
	  const blob = new Blob([gpx], { type: "application/gpx+xml" });
	  const url = URL.createObjectURL(blob);
	  
	  const a = document.createElement("a");
	  a.href = url;
	  a.download = `pathlogger_track_${formatDate(new Date(), false).replace(/\//g, '-')}.gpx`;
	  document.body.appendChild(a);
	  a.click();
	  document.body.removeChild(a);
	  
	  // 释放URL对象
	  setTimeout(() => {
		URL.revokeObjectURL(url);
	  }, 100);
	  
	  showNotification('导出成功', 'GPX轨迹文件已导出', 'success');
	}
  
	/**
	 * 生成GPX内容
	 * @returns {string} GPX XML内容
	 */
	function generateGPX() {
	  const tracks = polyline.getLatLngs();
	  const now = new Date().toISOString();
	  const startTime = state.trackStartTime ? new Date(state.trackStartTime).toISOString() : now;
	  
	  // 计算时间戳
	  let trackPoints = '';
	  let timeIncrement = 0;
	  const totalPoints = tracks.length;
	  
	  tracks.forEach((point, index) => {
		// 计算时间戳 - 在开始时间和当前时间之间平均分布
		const pointTime = new Date(state.trackStartTime + (timeIncrement * (Date.now() - state.trackStartTime) / totalPoints)).toISOString();
		timeIncrement++;
		
		// 添加轨迹点
		trackPoints += `      <trkpt lat="${point.lat}" lon="${point.lng}">
		  <ele>${point.alt || 0}</ele>
		  <time>${pointTime}</time>
		</trkpt>\n`;
	  });
	  
	  // 构建完整GPX文档
	  const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
  <gpx version="1.1" creator="PathLogger" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
	<metadata>
	  <name>PathLogger Track</name>
	  <desc>Track recorded with PathLogger</desc>
	  <time>${startTime}</time>
	</metadata>
	<trk>
	  <name>PathLogger Track ${formatDate(new Date())}</name>
	  <desc>Total distance: ${state.totalDistance.toFixed(2)} km</desc>
	  <trkseg>
  ${trackPoints}    </trkseg>
	</trk>
  </gpx>`;
  
	  return gpxContent;
	}
  
	/**
	 * 导出所有数据
	 */
	function exportAllData() {
	  // 收集所有数据
	  const data = {
		logs: JSON.parse(localStorage.getItem('pathlogger_logs') || '[]'),
		history: JSON.parse(localStorage.getItem('pathlogger_history') || '[]'),
		settings: {
		  darkMode: state.darkMode,
		  autoZoom: state.autoZoom,
		  refreshRate: state.refreshRate,
		  minDistance: state.minDistance,
		  highAccuracy: state.highAccuracy,
		  notifications: state.notifications,
		  addressLookup: state.addressLookup,
		  exactCoords: state.exactCoords,
		  zoomLevel: state.zoomLevel,
		  storageLimit: state.storageLimit,
		  mapLayer: localStorage.getItem('mapLayer') || 'osm'
		},
		exportDate: new Date().toISOString(),
		appVersion: '2.0.0'
	  };
	  
	  // 创建下载
	  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	  const url = URL.createObjectURL(blob);
	  
	  const a = document.createElement('a');
	  a.href = url;
	  a.download = `pathlogger_data_${formatDate(new Date(), false).replace(/\//g, '-')}.json`;
	  document.body.appendChild(a);
	  a.click();
	  document.body.removeChild(a);
	  
	  // 释放URL对象
	  setTimeout(() => {
		URL.revokeObjectURL(url);
	  }, 100);
	  
	  showNotification('导出成功', '所有数据已导出为JSON文件', 'success');
	}
  
	/**
	 * 导入数据
	 * @param {File} file - 导入的文件
	 */
	function importData(file) {
	  const reader = new FileReader();
	  
	  reader.onload = function(e) {
		try {
		  const data = JSON.parse(e.target.result);
		  
		  // 验证数据格式
		  if (!data.logs || !data.history || !data.settings) {
			throw new Error('数据格式无效');
		  }
		  
		  // 导入日志
		  localStorage.setItem('pathlogger_logs', JSON.stringify(data.logs));
		  
		  // 导入历史
		  localStorage.setItem('pathlogger_history', JSON.stringify(data.history));
		  
		  // 导入设置
		  if (data.settings) {
			Object.entries(data.settings).forEach(([key, value]) => {
			  localStorage.setItem(key, value);
			});
		  }
		  
		  // 刷新UI
		  loadSettings();
		  loadLogsFromLocalStorage();
		  
		  showNotification('导入成功', '所有数据已成功导入', 'success');
		  
		  // 关闭设置面板
		  closeSettings();
		  
		  // 重新加载页面以应用所有更改
		  setTimeout(() => {
			window.location.reload();
		  }, 1500);
		  
		} catch (error) {
		  console.error('导入数据错误:', error);
		  showNotification('导入失败', '文件格式无效或数据已损坏', 'error');
		}
	  };
	  
	  reader.onerror = function() {
		showNotification('导入失败', '读取文件时发生错误', 'error');
	  };
	  
	  reader.readAsText(file);
	}
  
	// ===== 日志处理功能 =====
  
	/**
	 * 添加日志
	 * @param {string} message - 日志消息
	 * @param {Date} timestamp - 时间戳(可选)
	 */
	function addLog(message, timestamp = new Date()) {
	  // 创建日志条目元素
	  const logEntry = document.createElement("div");
	  logEntry.className = "log-entry";
	  
	  // 检测日志类型
	  let logType = "info";
	  if (message.startsWith("错误:")) {
		logType = "error";
	  } else if (message.startsWith("警告:")) {
		logType = "warning";
	  } else if (message.includes("已成功") || message.includes("成功") || message.includes("已停止")) {
		logType = "success";
	  }
	  
	  // 添加时间戳和类型标签
	  const timestampElement = document.createElement("div");
	  timestampElement.className = "log-timestamp";
	  timestampElement.innerHTML = `
		<span>[${formatDate(timestamp)}]</span>
		<span class="log-entry-type ${logType}">${logType}</span>
	  `;
	  
	  // 添加内容
	  const contentElement = document.createElement("div");
	  contentElement.className = "log-content";
	  contentElement.innerHTML = message.replace(/\n/g, "<br>");
	  
	  // 高亮坐标
	  contentElement.innerHTML = contentElement.innerHTML.replace(
		/(-?\d+\.\d+),\s*(-?\d+\.\d+)/g, 
		'<span style="color:var(--primary)">$1, $2</span>'
	  );
	  
	  // 组装日志条目
	  logEntry.appendChild(timestampElement);
	  logEntry.appendChild(contentElement);
	  
	  // 将日志添加到顶部
	  elements.log.prepend(logEntry);
	  
	  // 淡入动画 - 通过 CSS 动画处理
	}
  
	/**
	 * 添加日志到DOM
	 * @param {string} message - 日志消息
	 * @param {Date} timestamp - 时间戳
	 */
	function addLogToDOM(message, timestamp) {
	  addLog(message, timestamp);
	}
  
	/**
	 * 复制日志
	 */
	function copyLog() {
	  const logContent = elements.log.innerText;
	  
	  navigator.clipboard.writeText(logContent)
		.then(() => {
		  showNotification('复制成功', '日志内容已复制到剪贴板', 'success');
		})
		.catch(() => {
		  showNotification('复制失败', '无法复制到剪贴板', 'error');
		});
	}
  
	/**
	 * 保存日志到文件
	 */
	function saveLog() {
	  const logContent = elements.log.innerText;
	  const blob = new Blob([logContent], { type: "text/plain;charset=utf-8" });
	  const url = URL.createObjectURL(blob);
	  
	  const a = document.createElement("a");
	  a.href = url;
	  a.download = `pathlogger_log_${formatDate(new Date(), false).replace(/\//g, '-')}.txt`;
	  document.body.appendChild(a);
	  a.click();
	  document.body.removeChild(a);
	  
	  // 释放URL对象
	  setTimeout(() => {
		URL.revokeObjectURL(url);
	  }, 100);
	  
	  showNotification('保存成功', '日志已保存为文本文件', 'success');
	}
  
	/**
	 * 清除日志
	 */
	function clearLog() {
	  if (confirm('确定要清除所有日志吗？')) {
		elements.log.innerHTML = "";
		localStorage.removeItem('pathlogger_logs');
		
		addLog("信息: 日志已清除");
		showNotification('清除成功', '所有日志记录已被清除', 'info');
	  }
	}
  
	/**
	 * 清除所有数据
	 */
	function clearAllData() {
	  if (confirm('确定要清除所有数据和设置吗？此操作无法撤销！')) {
		// 停止任何正在进行的追踪
		if (state.tracking) {
		  stopTracking();
		}
		
		// 清除本地存储
		localStorage.clear();
		
		// 重置应用状态
		resetAppState();
		
		// 清除日志显示
		elements.log.innerHTML = "";
		
		// 添加新日志
		addLog("信息: 所有数据已清除，应用已重置为默认设置");
		
		// 显示通知
		showNotification('已重置', '所有数据和设置已被清除', 'info');
		
		// 关闭设置面板
		closeSettings();
		
		// 延迟后重新加载页面以完全重置应用
		setTimeout(() => {
		  window.location.reload();
		}, 1500);
	  }
	}
  
	// ===== 面板功能 =====
  
	/**
	 * 打开设置面板
	 */
	function openSettings() {
	  // 更新设置UI以反映当前状态
	  updateSettingsUI();
	  
	  // 显示设置面板和遮罩
	  elements.settingsPanel.classList.add('active');
	  elements.overlay.classList.add('active');
	}
  
	/**
	 * 关闭设置面板
	 */
	function closeSettings() {
	  elements.settingsPanel.classList.remove('active');
	  elements.overlay.classList.remove('active');
	}
  
	/**
	 * 打开历史面板
	 */
	function openHistory() {
	  // 加载历史数据
	  const historyByDate = loadHistoryFromLocalStorage();
	  
	  // 清空历史列表
	  elements.historyList.innerHTML = '';
	  
	  // 检查是否有历史数据
	  if (Object.keys(historyByDate).length === 0) {
		elements.historyList.innerHTML = `
		  <div class="empty-state">
			<span class="material-icons-round">explore</span>
			<p>暂无历史记录</p>
			<small>开始追踪您的位置后会在这里显示记录</small>
			<button id="startTrackingNowBtn" class="button-primary">
			  <span class="material-icons-round">my_location</span>
			  立即开始追踪
			</button>
		  </div>
		`;
		
		// 为"立即开始追踪"按钮添加事件
		const startTrackingBtn = document.getElementById('startTrackingNowBtn');
		if (startTrackingBtn) {
		  startTrackingBtn.addEventListener('click', () => {
			closeHistory();
			startTracking();
		  });
		}
	  } else {
		// 添加历史记录
		Object.entries(historyByDate)
		  .sort((a, b) => new Date(b[0]) - new Date(a[0])) // 按日期倒序排序
		  .forEach(([date, items]) => {
			// 创建日期组
			const dateGroup = document.createElement('div');
			dateGroup.className = 'history-date-group';
			
			// 计算该日期的总距离
			const totalDistance = items.reduce((sum, item) => {
			  return sum + (item.distance || 0);
			}, 0);
			
			// 添加日期标题
			dateGroup.innerHTML = `
			  <h3 class="history-date-title">${date} (${items.length}个位置点, ${totalDistance.toFixed(2)}km)</h3>
			  <div class="history-items"></div>
			`;
			
			const historyItems = dateGroup.querySelector('.history-items');
			
			// 添加每个位置记录
			items.forEach(item => {
			  const historyItem = document.createElement('div');
			  historyItem.className = 'history-item';
			  historyItem.dataset.id = item.id;
			  
			  const time = new Date(item.timestamp);
			  
			  historyItem.innerHTML = `
				<div class="history-item-header">
				  <h4 class="history-item-title">${formatDate(time, true).split(' ')[1]}</h4>
				  <span class="history-item-date">${formatDate(time, false)}</span>
				</div>
				<div class="history-item-details">
				  ${item.position ? `
					<div class="history-item-detail">
					  <span class="material-icons-round">place</span>
					  <span>${item.position.coords.latitude.toFixed(6)}, ${item.position.coords.longitude.toFixed(6)}</span>
					</div>
				  ` : ''}
				  ${item.distance ? `
					<div class="history-item-detail">
					  <span class="material-icons-round">straighten</span>
					  <span>${item.distance.toFixed(2)} km</span>
					</div>
				  ` : ''}
				</div>
				${item.address ? `<div class="history-item-address">${item.address}</div>` : ''}
				<div class="history-item-actions">
				  <button class="button-outlined show-on-map-btn" data-lat="${item.position?.coords.latitude}" data-lng="${item.position?.coords.longitude}">
					<span class="material-icons-round">map</span>
					在地图上显示
				  </button>
				</div>
			  `;
			  
			  historyItems.appendChild(historyItem);
			});
			
			elements.historyList.appendChild(dateGroup);
		  });
		
		// 为"在地图上显示"按钮添加事件
		const showOnMapBtns = document.querySelectorAll('.show-on-map-btn');
		showOnMapBtns.forEach(btn => {
		  btn.addEventListener('click', (e) => {
			const lat = parseFloat(e.currentTarget.dataset.lat);
			const lng = parseFloat(e.currentTarget.dataset.lng);
			
			// 关闭历史面板
			closeHistory();
			
			// 显示位置在地图上
			if (map && !isNaN(lat) && !isNaN(lng)) {
			  // 创建临时标记
			  const tempMarker = L.marker([lat, lng]).addTo(map);
			  
			  // 缩放到位置
			  map.setView([lat, lng], 17);
			  
			  // 显示详细信息
			  tempMarker.bindPopup(`
				<div>
				  <strong>历史位置</strong><br>
				  纬度: ${lat.toFixed(6)}<br>
				  经度: ${lng.toFixed(6)}<br>
				  时间: ${formatDate(new Date(parseInt(btn.closest('.history-item').dataset.timestamp || Date.now())))}
				</div>
			  `).openPopup();
			  
			  // 在弹出窗口关闭时移除标记
			  tempMarker.on('popupclose', () => {
				map.removeLayer(tempMarker);
			  });
			  
			  // 添加突出效果
			  tempMarker._icon.classList.add('highlighted-marker');
			  
			  // 10秒后移除标记
			  setTimeout(() => {
				if (map.hasLayer(tempMarker)) {
				  map.removeLayer(tempMarker);
				}
			  }, 10000);
			}
		  });
		});
	  }
	  
	  // 显示历史面板和遮罩
	  elements.historyPanel.classList.add('active');
	  elements.overlay.classList.add('active');
	}
  
	/**
	 * 关闭历史面板
	 */
	function closeHistory() {
	  elements.historyPanel.classList.remove('active');
	  elements.overlay.classList.remove('active');
	}
  
	/**
	 * 回放历史轨迹
	 */
	function playbackHistory() {
	  // 获取选中的日期
	  const selectedDate = elements.historyDateFilter.value;
	  
	  if (!selectedDate) {
		showNotification('请选择日期', '请先选择要回放的日期', 'warning');
		return;
	  }
	  
	  // 获取该日期的历史数据
	  const historyData = state.historyGroups[selectedDate];
	  
	  if (!historyData || historyData.length === 0) {
		showNotification('无数据', '所选日期没有轨迹数据', 'warning');
		return;
	  }
	  
	  // 关闭历史面板
	  closeHistory();
	  
	  // 停止当前追踪
	  if (state.tracking) {
		stopTracking();
	  }
	  
	  // 清除当前轨迹
	  if (polyline) {
		polyline.setLatLngs([]);
	  }
	  
	  // 排序历史数据
	  const sortedData = historyData.sort((a, b) => a.timestamp - b.timestamp);
	  
	  // 显示回放开始通知
	  showNotification('回放开始', `正在回放 ${selectedDate} 的轨迹`, 'info');
	  
	  // 添加日志
	  addLog(`信息: 开始回放 ${selectedDate} 的轨迹数据`);
	  
	  // 创建轨迹点数组
	  const points = sortedData.map(item => {
		if (item.position && item.position.coords) {
		  return [item.position.coords.latitude, item.position.coords.longitude];
		}
		return null;
	  }).filter(point => point !== null);
	  
	  // 如果没有有效点，终止回放
	  if (points.length === 0) {
		showNotification('回放失败', '无法回放轨迹，没有有效的位置数据', 'error');
		return;
	  }
	  
	  // 缩放地图以显示所有点
	  const bounds = L.latLngBounds(points);
	  map.fitBounds(bounds, { padding: [50, 50] });
	  
	  // 创建回放动画
	  let currentIndex = 0;
	  const totalPoints = points.length;
	  
	  // 创建临时标记
	  const playbackMarker = L.marker(points[0]).addTo(map);
	  playbackMarker.bindPopup('回放模式').openPopup();
	  
	  // 创建进度条
	  const progressContainer = document.createElement('div');
	  progressContainer.className = 'playback-progress-container';
	  progressContainer.innerHTML = `
		<div class="playback-progress">
		  <div class="playback-progress-inner" style="width: 0%"></div>
		</div>
		<div class="playback-controls">
		  <button id="stopPlaybackBtn">
			<span class="material-icons-round">stop</span>
			停止回放
		  </button>
		</div>
	  `;
	  document.body.appendChild(progressContainer);
	  
	  const progressInner = progressContainer.querySelector('.playback-progress-inner');
	  const stopBtn = progressContainer.querySelector('#stopPlaybackBtn');
	  
	  stopBtn.addEventListener('click', () => {
		// 停止回放
		clearInterval(playbackInterval);
		map.removeLayer(playbackMarker);
		progressContainer.remove();
		showNotification('回放已停止', '轨迹回放已手动停止', 'info');
	  });
	  
	  // 开始回放动画
	  const playbackInterval = setInterval(() => {
		// 更新进度条
		const progress = (currentIndex / (totalPoints - 1)) * 100;
		progressInner.style.width = `${progress}%`;
		
		// 添加点到轨迹
		polyline.addLatLng(points[currentIndex]);
		
		// 移动标记
		playbackMarker.setLatLng(points[currentIndex]);
		
		// 如果启用了自动缩放，跟随标记
		if (state.autoZoom) {
		  map.setView(points[currentIndex], map.getZoom());
		}
		
		// 增加索引
		currentIndex++;
		
		// 检查是否完成
		if (currentIndex >= totalPoints) {
		  clearInterval(playbackInterval);
		  
		  // 移除临时UI
		  setTimeout(() => {
			map.removeLayer(playbackMarker);
			progressContainer.remove();
			
			showNotification('回放完成', '轨迹回放已完成', 'success');
			addLog(`信息: ${selectedDate} 的轨迹回放已完成`);
		  }, 1000);
		}
	  }, 500); // 每点间隔500毫秒
	}
  
	// ===== 调整面板大小 =====
  
	/**
	 * 初始化调整面板大小功能
	 */
	function initResize() {
	  const leftPanel = document.querySelector('.left-panel');
	  const rightPanel = document.querySelector('.right-panel');
	  const resizer = elements.dragMe;
	  
	  let isResizing = false;
	  let lastDownX = 0;
	  let lastDownY = 0;
	  
	  // 处理鼠标按下
	  function handleMouseDown(e) {
		isResizing = true;
		lastDownX = e.clientX;
		lastDownY = e.clientY;
		
		document.body.classList.add('resizing');
		
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
		
		// 阻止文本选择
		e.preventDefault();
	  }
	  
	  // 处理鼠标移动
	  function handleMouseMove(e) {
		if (!isResizing) return;
		
		// 小屏（纵向拖拽）
		if (window.innerWidth < 768) {
		  const dy = e.clientY - lastDownY;
		  const newHeight = rightPanel.offsetHeight - dy;
		  
		  // 限制日志面板的最小和最大高度
		  if (newHeight > 100 && newHeight < window.innerHeight * 0.8) {
			rightPanel.style.height = `${newHeight}px`;
			lastDownY = e.clientY;
			
			// 刷新地图大小
			if (map) {
			  setTimeout(() => map.invalidateSize(), 0);
			}
		  }
		} else {
		  // 大屏（横向拖拽）
		  const dx = e.clientX - lastDownX;
		  
		  // 获取当前面板的实际宽度
		  const leftWidth = leftPanel.offsetWidth + dx;
		  const rightWidth = rightPanel.offsetWidth - dx;
		  
		  // 设置最小宽度限制
		  if (leftWidth > 300 && rightWidth > 200) {
			leftPanel.style.width = `${leftWidth}px`;
			rightPanel.style.width = `${rightWidth}px`;
			lastDownX = e.clientX;
			
			// 刷新地图大小
			if (map) {
			  setTimeout(() => map.invalidateSize(), 0);
			}
		  }
		}
	  }
	  
	  // 处理鼠标松开
	  function handleMouseUp() {
		isResizing = false;
		document.body.classList.remove('resizing');
		
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
		
		// 保存面板尺寸到本地存储
		if (window.innerWidth < 768) {
		  localStorage.setItem('rightPanelHeight', rightPanel.offsetHeight);
		} else {
		  localStorage.setItem('rightPanelWidth', rightPanel.offsetWidth);
		}
		
		// 刷新地图大小
		if (map) {
		  setTimeout(() => map.invalidateSize(), 0);
		}
	  }
	  
	  // 为触摸设备添加支持
	  function handleTouchStart(e) {
		const touch = e.touches[0];
		isResizing = true;
		lastDownX = touch.clientX;
		lastDownY = touch.clientY;
		
		document.body.classList.add('resizing');
	  }
	  
	  function handleTouchMove(e) {
		if (!isResizing) return;
		
		const touch = e.touches[0];
		
		// 小屏（纵向拖拽）
		if (window.innerWidth < 768) {
		  const dy = touch.clientY - lastDownY;
		  const newHeight = rightPanel.offsetHeight - dy;
		  
		  // 限制日志面板的最小和最大高度
		  if (newHeight > 100 && newHeight < window.innerHeight * 0.8) {
			rightPanel.style.height = `${newHeight}px`;
			lastDownY = touch.clientY;
			
			// 刷新地图大小
			if (map) {
			  setTimeout(() => map.invalidateSize(), 0);
			}
		  }
		} else {
		  // 大屏（横向拖拽）
		  const dx = touch.clientX - lastDownX;
		  
		  // 获取当前面板的实际宽度
		  const leftWidth = leftPanel.offsetWidth + dx;
		  const rightWidth = rightPanel.offsetWidth - dx;
		  
		  // 设置最小宽度限制
		  if (leftWidth > 300 && rightWidth > 200) {
			leftPanel.style.width = `${leftWidth}px`;
			rightPanel.style.width = `${rightWidth}px`;
			lastDownX = touch.clientX;
			
			// 刷新地图大小
			if (map) {
			  setTimeout(() => map.invalidateSize(), 0);
			}
		  }
		}
		
		// 阻止滚动
		e.preventDefault();
	  }
	  
	  function handleTouchEnd() {
		isResizing = false;
		document.body.classList.remove('resizing');
		
		// 保存面板尺寸到本地存储
		if (window.innerWidth < 768) {
		  localStorage.setItem('rightPanelHeight', rightPanel.offsetHeight);
		} else {
		  localStorage.setItem('rightPanelWidth', rightPanel.offsetWidth);
		}
		
		// 刷新地图大小
		if (map) {
		  setTimeout(() => map.invalidateSize(), 0);
		}
	  }
	  
	  // 添加鼠标事件监听器
	  resizer.addEventListener('mousedown', handleMouseDown);
	  
	  // 添加触摸事件监听器
	  resizer.addEventListener('touchstart', handleTouchStart);
	  resizer.addEventListener('touchmove', handleTouchMove);
	  resizer.addEventListener('touchend', handleTouchEnd);
	  
	  // 恢复保存的面板尺寸
	  if (window.innerWidth < 768) {
		const savedHeight = localStorage.getItem('rightPanelHeight');
		if (savedHeight) {
		  rightPanel.style.height = `${savedHeight}px`;
		}
	  } else {
		const savedWidth = localStorage.getItem('rightPanelWidth');
		if (savedWidth) {
		  rightPanel.style.width = `${savedWidth}px`;
		}
	  }
	}
  
	// ===== 网络状态监测 =====
	
	/**
	 * 监测并处理网络状态变化
	 */
	function setupNetworkMonitoring() {
	  // 获取网络状态元素
	  const offlineAlert = elements.offlineAlert;
	  
	  // 检查初始状态
	  state.offline = !navigator.onLine;
	  if (state.offline) {
		offlineAlert.classList.add('active');
	  }
	  
	  // 监听在线状态变化
	  window.addEventListener('online', () => {
		state.offline = false;
		offlineAlert.classList.remove('active');
		showNotification('已恢复连接', '您已重新连接到网络', 'success');
	  });
	  
	  window.addEventListener('offline', () => {
		state.offline = true;
		offlineAlert.classList.add('active');
		showNotification('连接已断开', '您当前处于离线状态，部分功能可能不可用', 'warning');
	  });
	}
  
	// ===== 初始化 =====
  
	/**
	 * 缓存DOM元素
	 */
	function cacheDOMElements() {
	  elements = {
		// 主要元素
		map: document.getElementById('map'),
		log: document.getElementById('log'),
		mapLoader: document.getElementById('mapLoader'),
		dragMe: document.getElementById('dragMe'),
		overlay: document.getElementById('overlay'),
		
		// 按钮
		locateBtn: document.getElementById('locateBtn'),
		trackBtn: document.getElementById('trackBtn'),
		shareBtn: document.getElementById('shareBtn'),
		settingsBtn: document.getElementById('settingsBtn'),
		exportBtn: document.getElementById('exportBtn'),
		historyBtn: document.getElementById('historyBtn'),
		
		// 面板元素
		settingsPanel: document.getElementById('settingsPanel'),
		historyPanel: document.getElementById('historyPanel'),
		
		// 日志操作按钮
		copyLogBtn: document.getElementById('copyLogBtn'),
		saveLogBtn: document.getElementById('saveLogBtn'),
		clearLogBtn: document.getElementById('clearLogBtn'),
		
		// 设置面板元素
		layerSelect: document.getElementById('layerSelect'),
		autoZoomToggle: document.getElementById('autoZoomToggle'),
		darkModeToggle: document.getElementById('darkModeToggle'),
		refreshRate: document.getElementById('refreshRate'),
		refreshRateValue: document.getElementById('refreshRateValue'),
		minDistance: document.getElementById('minDistance'),
		minDistanceValue: document.getElementById('minDistanceValue'),
		highAccuracyToggle: document.getElementById('highAccuracyToggle'),
		notificationsToggle: document.getElementById('notificationsToggle'),
		addressLookupToggle: document.getElementById('addressLookupToggle'),
		exactCoordsToggle: document.getElementById('exactCoordsToggle'),
		zoomLevel: document.getElementById('zoomLevel'),
		zoomLevelValue: document.getElementById('zoomLevelValue'),
		storageLimit: document.getElementById('storageLimit'),
		
		// 设置相关按钮
		saveSettingsBtn: document.getElementById('saveSettingsBtn'),
		closeSettingsBtn: document.getElementById('closeSettingsBtn'),
		exportDataBtn: document.getElementById('exportDataBtn'),
		importDataBtn: document.getElementById('importDataBtn'),
		clearDataBtn: document.getElementById('clearDataBtn'),
		
		// 历史面板元素
		historyList: document.getElementById('historyList'),
		historyDateFilter: document.getElementById('historyDateFilter'),
		playHistoryBtn: document.getElementById('playHistoryBtn'),
		closeHistoryBtn: document.getElementById('closeHistoryBtn'),
		
		// 状态栏元素
		latLngText: document.getElementById('latLngText'),
		distanceText: document.getElementById('distanceText'),
		durationText: document.getElementById('durationText'),
		
		// 其他UI元素
		loadingScreen: document.getElementById('loadingScreen'),
		notificationContainer: document.getElementById('notificationContainer'),
		fileInput: document.getElementById('fileInput'),
		offlineAlert: document.getElementById('offlineAlert')
	  };
	}
  
	/**
	 * 设置事件监听器
	 */
	function setupEventListeners() {
	  // 基本操作
	  elements.locateBtn.addEventListener('click', getLocation);
	  elements.trackBtn.addEventListener('click', toggleTracking);
	  elements.shareBtn.addEventListener('click', shareLocation);
	  elements.exportBtn.addEventListener('click', exportGPX);
	  
	  // 面板操作
	  elements.settingsBtn.addEventListener('click', openSettings);
	  elements.closeSettingsBtn.addEventListener('click', closeSettings);
	  elements.historyBtn.addEventListener('click', openHistory);
	  elements.closeHistoryBtn.addEventListener('click', closeHistory);
	  elements.playHistoryBtn.addEventListener('click', playbackHistory);
	  
	  // 日志操作
	  elements.copyLogBtn.addEventListener('click', copyLog);
	  elements.saveLogBtn.addEventListener('click', saveLog);
	  elements.clearLogBtn.addEventListener('click', clearLog);
	  
	  // 设置面板操作
	  elements.saveSettingsBtn.addEventListener('click', saveSettings);
	  elements.layerSelect.addEventListener('change', changeMapLayer);
	  elements.clearDataBtn.addEventListener('click', clearAllData);
	  elements.exportDataBtn.addEventListener('click', exportAllData);
	  elements.importDataBtn.addEventListener('click', () => elements.fileInput.click());
	  
	  // 文件导入
	  elements.fileInput.addEventListener('change', (e) => {
		if (e.target.files && e.target.files[0]) {
		  importData(e.target.files[0]);
		}
	  });
	  
	  // 遮罩点击关闭面板
	  elements.overlay.addEventListener('click', () => {
		closeSettings();
		closeHistory();
	  });
	  
	  // 滑块值更新
	  elements.refreshRate.addEventListener('input', () => {
		elements.refreshRateValue.textContent = `${elements.refreshRate.value}秒`;
	  });
	  
	  elements.minDistance.addEventListener('input', () => {
		elements.minDistanceValue.textContent = `${elements.minDistance.value}米`;
	  });
	  
	  elements.zoomLevel.addEventListener('input', () => {
		elements.zoomLevelValue.textContent = elements.zoomLevel.value;
	  });
	  
	  // 窗口大小变化时调整地图
	  window.addEventListener('resize', throttle(() => {
		if (map) {
		  map.invalidateSize();
		}
	  }, 100));
	  
	  // ESC键关闭面板
	  document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
		  closeSettings();
		  closeHistory();
		}
	  });
	}
  
	/**
	 * 切换追踪状态
	 */
	function toggleTracking() {
	  if (state.tracking) {
		stopTracking();
	  } else {
		startTracking();
	  }
	}
  
	/**
	 * 初始化应用
	 */
	function init() {
	  // 缓存DOM元素
	  cacheDOMElements();
	  
	  // 设置事件监听器
	  setupEventListeners();
	  
	  // 加载设置
	  loadSettings();
	  
	  // 初始化地图
	  initMap();
	  
	  // 初始化调整面板大小功能
	  initResize();
	  
	  // 加载日志
	  loadLogsFromLocalStorage();
	  
	  // 设置网络监测
	  setupNetworkMonitoring();
	  
	  // 获取初始位置
	  getLocation();
	  
	  // 延迟关闭加载屏幕
	  setTimeout(() => {
		elements.loadingScreen.classList.remove('active');
	  }, INITIAL_DELAY);
	  
	  // 添加欢迎日志 - 改进版的欢迎消息
	  addLog(`
<strong>PathLogger 2.0 已启动</strong>
欢迎使用 PathLogger - 您的位置轨迹记录器。

<strong>基本操作：</strong>
• 点击"<span style="color:var(--primary)">定位</span>"获取当前位置
• 点击"<span style="color:var(--primary)">追踪</span>"开始实时记录移动轨迹
• 点击"<span style="color:var(--primary)">分享</span>"分享您的当前位置
• 点击"<span style="color:var(--primary)">导出</span>"下载GPX格式的轨迹文件

<strong>提示：</strong> 您可以在设置中调整刷新频率、地图样式和其他选项。
	  `);
	}
  
	// ===== 公共API =====
	return {
	  init,
	  getLocation,
	  shareLocation,
	  toggleTracking,
	  exportGPX,
	  exportAllData,
	  copyLog,
	  saveLog,
	  clearLog,
	  openSettings,
	  closeSettings,
	  openHistory,
	  closeHistory,
	  playbackHistory,
	  saveSettings
	};
})();
  
// 初始化应用
document.addEventListener('DOMContentLoaded', PathLoggerApp.init);