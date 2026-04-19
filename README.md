# PathLogger

PathLogger 是一个基于 Leaflet 的位置轨迹记录 Web 应用，支持实时定位、持续追踪、位置日志、历史查看和 GPX 导出。

## Features

- 实时定位与连续轨迹追踪
- 多地图图层切换
- 位置日志查看、复制、保存和清空
- 轨迹历史记录与距离统计
- GPX 导出，方便后续导入地图或运动工具
- PWA 与离线支持
- 可调刷新频率、最小记录距离、定位精度等设置

## Project Structure

```text
PathLogger/
├── index.html
├── css/
├── js/
├── images/
├── favicon_io/
├── manifest.json
└── sw.js
```

## Quick Start

这是一个纯前端静态项目，可以直接部署到任意静态托管平台，或在本地通过简单静态服务器运行。

### Local Preview

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000/PathLogger/`。

## Usage

1. 打开应用并允许浏览器获取地理位置权限
2. 点击“定位”查看当前位置
3. 点击“追踪”开始持续记录轨迹
4. 在右侧日志面板查看位置变化
5. 需要时导出 GPX 文件，或查看历史记录

## Tech Stack

- HTML
- CSS
- JavaScript
- Leaflet
- Geolocation API
- Local Storage
- Service Worker

## Notes

- 首次使用需要授予地理位置权限
- 部分功能依赖 HTTPS 或本地开发环境
- 轨迹与设置会保存在浏览器本地存储中
