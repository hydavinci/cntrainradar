# 🚄 中国列车雷达 (CN Train Radar)

基于时刻表的中国铁路列车实时模拟，通过插值计算列车在站间的估计位置。

**在线体验:** https://cntrainradar.graymammoth.com

---

## 功能特性

- 🗺️ WebGL 地图渲染 (MapLibre GL) — 流畅 60fps
- 🚄 基于时刻表的实时列车位置模拟
- 🎨 按列车类型颜色编码 (G/D/C/Z/T/K)
- 📍 点击列车查看详情（线路、速度、当前站/下一站、进度）
- 🛤️ 铁路线路叠加显示（189条线路，来源 OSM）
- 🖱️ 悬停提示（车次 + 线路 + 速度）
- 🔍 筛选功能（按车次、线路、车站搜索）
- 🌙 自动暗色模式（跟随系统主题）
- 📱 移动端自适应设计
- 🇨🇳 全中文界面

---

## 架构

```
┌─────────────────────────────────────────────┐
│                 浏览器                        │
│  ┌────────────┐  ┌──────────────────────┐   │
│  │ MapLibre GL│  │ 轮询 /api/trains      │   │
│  │  (WebGL)   │  │ 每 10 秒             │   │
│  └────────────┘  └──────────────────────┘   │
└─────────────────┬───────────────────────────┘
                  │ HTTP
┌─────────────────┼───────────────────────────┐
│  Nginx          │  (反向代理 + SSL)          │
│  :80/:443 → 127.0.0.1:3002                  │
└─────────────────┼───────────────────────────┘
                  │
┌─────────────────┼───────────────────────────┐
│  Node.js 后端 (Express)                      │
│                 │                            │
│  ┌──────────────┴──────────────────┐        │
│  │         server.js                │        │
│  │  - 加载时刻表 (schedules)         │        │
│  │  - 计算当前位置                   │        │
│  │  - 线性插值                       │        │
│  └──────────────────────────────────┘        │
│                                              │
│  数据文件:                                    │
│  ├── schedules.json    (330 趟列车)           │
│  ├── station_coords.json (4351 个车站)        │
│  └── stations.json     (3365 个车站)          │
└──────────────────────────────────────────────┘
```

---

## 工作原理

与航班追踪（使用实时 ADS-B GPS 信号）不同，中国铁路不公开广播实时位置。本项目使用**时刻表模拟**：

1. **时刻表数据** — 每趟列车有一系列停靠站及到发时刻
2. **位置插值** — 根据当前时间（UTC+8），判断列车处于哪一区间
3. **线性估算** — 按进度百分比估计在两站之间的位置

**局限性：**
- 位置为估算值，非真实 GPS
- 不反映晚点/停运
- 目前覆盖 13 条主要线路（330 趟列车），非全部 5000+ 日常车次

---

## 列车类型

| 类型 | 名称 | 速度 | 颜色 |
|------|------|------|------|
| G | 高速动车 | ~300 km/h | 🔵 蓝色 |
| D | 动车组 | ~200 km/h | 🔴 红色 |
| C | 城际 | ~180 km/h | 🟢 绿色 |
| Z | 直达 | ~120 km/h | 🟠 橙色 |
| T | 特快 | ~100 km/h | 🟣 紫色 |
| K | 快速 | ~80 km/h | ⚫ 灰色 |

---

## 覆盖线路

| 线路 | 区间 | 站数 |
|------|------|------|
| 京沪高铁 | 北京南 ↔ 上海虹桥 | 23 |
| 京广高铁（北段） | 北京西 ↔ 武汉 | 19 |
| 京广高铁（南段） | 武汉 ↔ 广州南 | 12 |
| 沪昆高铁（东段） | 上海虹桥 ↔ 长沙南 | 13 |
| 沪昆高铁（西段） | 长沙南 ↔ 昆明南 | 10 |
| 成渝高铁 | 成都东 ↔ 重庆北 | 12 |
| 哈大高铁 | 哈尔滨西 ↔ 大连北 | 18 |
| 合福高铁 | 合肥南 ↔ 福州 | 17 |
| 贵广高铁 | 贵阳北 ↔ 广州南 | 17 |
| 西成高铁 | 西安北 ↔ 成都东 | 13 |
| 京哈线 (K) | 北京 ↔ 哈尔滨 | 9 |
| 京沪线 (T) | 北京 ↔ 上海 | 10 |
| 京广线 (Z) | 北京西 ↔ 广州 | 6 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | MapLibre GL JS (WebGL)、原生 JS、CSS |
| 后端 | Node.js 22、Express |
| 地图瓦片 | 高德地图 (AutoNavi) |
| CDN | jsdelivr (MapLibre)、openmaptiles (字体) |
| 数据来源 | 12306 站名、OSM 铁路 GeoJSON |
| 反向代理 | Nginx + Cloudflare |
| 进程管理 | systemd |

---

## 目录结构

```
CnTrainRadar/
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   └── data/
│       ├── stations.json      # 4351 个车站坐标
│       └── railways.json      # 铁路线路 GeoJSON（189 条）
├── backend/
│   ├── package.json
│   ├── server.js              # Express 服务 + 位置计算
│   ├── schedules.json         # 列车时刻表（330 趟）
│   ├── stations.json          # 车站电报码查询
│   ├── stations_raw.json      # 12306 原始站名数据
│   └── station_coords.json    # 车站坐标
└── README.md
```

---

## API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/trains` | GET | 所有在运列车及位置 |
| `/api/train/:id` | GET | 指定车次完整时刻表 |
| `/api/health` | GET | 服务健康状态 + 在运数量 |

### 响应示例 (`/api/trains`)

```json
{
  "trains": [
    {
      "id": "G5",
      "type": "G",
      "routeName": "京沪高铁",
      "from": "北京南",
      "to": "上海虹桥",
      "lat": 35.123,
      "lon": 117.456,
      "heading": 165,
      "speed": 300,
      "currentStation": "济南西",
      "nextStation": "泰安",
      "progress": 42
    }
  ],
  "count": 82,
  "timestamp": 1716688555000
}
```

---

## 部署

### 前置要求

- Node.js 18+
- Nginx

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 创建 systemd 服务

```bash
sudo tee /etc/systemd/system/cn-train-radar.service << 'EOF'
[Unit]
Description=CN Train Radar
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/CnTrainRadar/backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=PORT=3002

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable cn-train-radar
sudo systemctl start cn-train-radar
```

### 3. 配置 Nginx

```nginx
server {
    server_name cntrainradar.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3002;
    }
}
```

### 4. DNS

添加 A 记录指向服务器 IP（建议 Cloudflare 代理）

---

## 运维

```bash
# 服务状态
sudo systemctl status cn-train-radar

# 实时日志
sudo journalctl -u cn-train-radar -f

# 重启
sudo systemctl restart cn-train-radar

# 健康检查
curl http://127.0.0.1:3002/api/health
```

---

## 数据来源

| 数据 | 来源 | 说明 |
|------|------|------|
| 车站名称 + 编码 | 12306 `station_name.js` | 3365 个车站 |
| 车站坐标 | [China-Railway-Station-Database](https://github.com/undef-i/China-Railway-Station-Database) | 4351 个车站经纬度 |
| 铁路线路 | OpenStreetMap | 189 条线路，GeoJSON 格式 |
| 列车时刻表 | 根据已知线路模拟 | 13 条主要走廊，330 趟列车 |

---

## 与航班雷达对比

| | 中国列车雷达 | 航班雷达 |
|---|---|---|
| 数据来源 | 时刻表模拟 | 实时 ADS-B |
| 精度 | 估算（~5-10 km） | 真实 GPS（~100m） |
| 反映延误 | ❌ 否 | ✅ 是 |
| 覆盖范围 | 13 条线路，330 趟 | 全球 6000+ 航班 |
| 更新频率 | 10 秒（重新计算） | 10 秒（实时数据） |
| 外部 API 依赖 | 无（自包含） | 是（adsb.lol 等） |

---

## 未来计划

| 优先级 | 功能 | 说明 |
|--------|------|------|
| 🔴 P0 | 真实时刻表 | 从 12306 获取（需国内 IP） |
| 🔴 P0 | 更多线路 | 覆盖所有主要铁路走廊（50+ 条） |
| 🟡 P1 | 车站标注 | 高缩放级别显示车站名 |
| 🟡 P1 | 线路高亮 | 点击列车显示完整运行路线 |
| 🟢 P2 | 延误模拟 | 随机延误模型增加真实感 |
| 🟢 P2 | 统计面板 | 列车密度、速度分布 |

---

## 许可

个人项目。车站数据来自 [China-Railway-Station-Database](https://github.com/undef-i/China-Railway-Station-Database)，铁路线路来自 OpenStreetMap。
