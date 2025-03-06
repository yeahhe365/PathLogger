/**
 * PathLogger 服务工作线程
 * 提供离线访问支持
 */

const CACHE_NAME = 'pathlogger-cache-v1';

// 需要缓存的资源
const CACHE_URLS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/pathlogger.js',
  '/js/sw-register.js',
  '/manifest.json',

  '/favicon_io/favicon.ico',
  '/favicon_io/favicon-16x16.png',
  '/favicon_io/favicon-32x32.png',
  '/favicon_io/apple-touch-icon.png',
  '/favicon_io/android-chrome-192x192.png',
  '/favicon_io/android-chrome-512x512.png',
  '/favicon_io/site.webmanifest',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-control-geocoder@2.4.0/dist/Control.Geocoder.css',
  'https://unpkg.com/leaflet-control-geocoder@2.4.0/dist/Control.Geocoder.min.js',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
  'https://fonts.gstatic.com/s/materialiconsround/v107/LDItaoyNOAY6Uewc665JcIzCKsKc_M9flwmP.woff2'
];

// 安装事件：预缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('正在缓存应用资源');
        return cache.addAll(CACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// 激活事件：清除旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.filter(cacheName => {
            return cacheName !== CACHE_NAME;
          }).map(cacheName => {
            console.log('删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// 请求拦截：优先使用缓存
self.addEventListener('fetch', event => {
  // 跳过不支持的请求
  if (
    !event.request.url.startsWith('http') || 
    event.request.method !== 'GET' ||
    event.request.url.includes('chrome-extension')
  ) {
    return;
  }

  // a 地图瓦片处理：网络优先，失败时使用缓存
  if (isMapTile(event.request.url)) {
    event.respondWith(networkFirstWithCache(event.request));
    return;
  }
  
  // API请求处理：网络优先策略
  if (event.request.url.includes('nominatim.openstreetmap.org')) {
    event.respondWith(networkFirstWithTimeout(event.request));
    return;
  }

  // 静态资源：缓存优先策略
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果在缓存中找到了响应，则返回缓存
        if (response) {
          return response;
        }
        
        // 否则，请求网络
        return fetch(event.request)
          .then(networkResponse => {
            // 检查是否收到有效响应
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            
            // 克隆响应（因为响应是流，只能消费一次）
            const responseToCache = networkResponse.clone();
            
            // 将响应添加到缓存
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
              
            return networkResponse;
          })
          .catch(error => {
            console.error('Fetch failed:', error);
            
            // 对于导航请求，返回离线页面
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            
            return new Response('Network error', {
              status: 408,
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

/**
 * 检查URL是否为地图瓦片
 * @param {string} url - 请求URL
 * @returns {boolean} 是否为地图瓦片
 */
function isMapTile(url) {
  return (
    url.includes('tile.openstreetmap.org') ||
    url.includes('server.arcgisonline.com') ||
    url.includes('basemaps.cartocdn.com') ||
    url.includes('tile.opentopomap.org')
  );
}

/**
 * 网络优先策略，失败时回退到缓存
 * @param {Request} request - 请求对象
 * @returns {Promise<Response>} 响应
 */
function networkFirstWithCache(request) {
  return fetch(request)
    .then(response => {
      // 如果获取成功，克隆响应并缓存
      const responseClone = response.clone();
      caches.open(CACHE_NAME)
        .then(cache => {
          cache.put(request, responseClone);
        });
      return response;
    })
    .catch(() => {
      // 如果网络请求失败，尝试从缓存中获取
      return caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // 如果缓存中也没有，返回空响应
          return new Response(null, { status: 504 });
        });
    });
}

/**
 * 网络优先策略，带超时回退
 * @param {Request} request - 请求对象
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Response>} 响应
 */
function networkFirstWithTimeout(request, timeout = 3000) {
  return new Promise(resolve => {
    let timeoutId;
    
    // 创建超时拒绝
    const timeoutPromise = new Promise(resolveTimeout => {
      timeoutId = setTimeout(() => {
        resolveTimeout(caches.match(request));
      }, timeout);
    });
    
    // 尝试网络请求
    fetch(request)
      .then(response => {
        clearTimeout(timeoutId);
        
        // 如果成功，缓存响应
        const responseClone = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(request, responseClone);
          });
          
        resolve(response);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        
        // 如果失败，尝试从缓存获取
        caches.match(request)
          .then(cachedResponse => {
            resolve(cachedResponse || new Response(null, { status: 504 }));
          });
      });
      
    // 如果超时，使用缓存
    timeoutPromise.then(cachedResponse => {
      resolve(cachedResponse || new Response(null, { status: 504 }));
    });
  });
}