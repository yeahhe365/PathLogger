/**
 * 注册服务工作线程以支持离线功能
 */
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
	  navigator.serviceWorker.register('/sw.js')
		.then(registration => {
		  console.log('ServiceWorker 注册成功: ', registration.scope);
		})
		.catch(error => {
		  console.log('ServiceWorker 注册失败: ', error);
		});
	});
  }