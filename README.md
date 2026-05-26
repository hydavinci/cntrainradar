# 🚄 CN Train Radar

Real-time simulation of China's railway network. Train positions are calculated by interpolating between scheduled timetable stops.

**Live:** https://cntrainradar.graymammoth.com

---

## Features

- 🗺️ WebGL map rendering (MapLibre GL) — smooth 60fps
- 🚄 Real-time train position simulation based on timetable
- 🎨 Color-coded by train type (G/D/C/Z/T/K)
- 📍 Click train for details (route, speed, current/next station, progress)
- 🛤️ Railway line overlay (189 lines from OSM)
- 🖱️ Hover tooltip (train ID + route + speed)
- 📱 Mobile-friendly responsive design

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                 Browser                      │
│  ┌────────────┐  ┌──────────────────────┐   │
│  │ MapLibre GL│  │ Polling /api/trains   │   │
│  │  (WebGL)   │  │ every 10s            │   │
│  └────────────┘  └──────────────────────┘   │
└─────────────────┬───────────────────────────┘
                  │ HTTP
┌─────────────────┼───────────────────────────┐
│  Nginx          │  (reverse proxy + SSL)    │
│  :80/:443 → 127.0.0.1:3002                  │
└─────────────────┼───────────────────────────┘
                  │
┌─────────────────┼───────────────────────────┐
│  Node.js Backend (Express)                   │
│                 │                            │
│  ┌──────────────┴──────────────────┐        │
│  │         server.js                │        │
│  │  - Load timetable (schedules)    │        │
│  │  - Calculate current positions   │        │
│  │  - Linear interpolation          │        │
│  └──────────────────────────────────┘        │
│                                              │
│  Data files:                                 │
│  ├── schedules.json    (330 trains)          │
│  ├── station_coords.json (4351 stations)     │
│  └── stations.json     (3365 stations)       │
└──────────────────────────────────────────────┘
```

---

## How It Works

Unlike flight tracking (which uses real-time ADS-B GPS signals), China's railways don't broadcast live positions publicly. This project uses **timetable-based simulation**:

1. **Timetable data** — Each train has a list of stops with scheduled arrival/departure times
2. **Position interpolation** — Based on current time (UTC+8), calculate which segment the train is on
3. **Linear interpolation** — Estimate position between two stations based on progress percentage

This is the same approach used by apps like "高铁通" (China HSR Tracker).

**Limitations:**
- Positions are estimates, not real GPS
- Delays/cancellations are not reflected
- Currently covers 13 major routes (330 trains), not all ~5000+ daily services

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | MapLibre GL JS (WebGL), Vanilla JS, CSS |
| Backend | Node.js 22, Express |
| Data | 12306 station names, OSM railway GeoJSON |
| Reverse Proxy | Nginx + Cloudflare |
| Process Manager | systemd |
| Compression | gzip |

---

## Directory Structure

```
/home/CnTrainRadar/
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   └── data/
│       ├── stations.json      # 4351 station coordinates
│       └── railways.json      # Railway lines GeoJSON (189 lines)
├── backend/
│   ├── package.json
│   ├── server.js              # Express server + position calculation
│   ├── schedules.json         # Train timetables (330 trains)
│   ├── stations.json          # Station telecode lookup
│   ├── stations_raw.json      # Raw 12306 station data
│   └── station_coords.json    # Station coordinates
└── .gitignore
```

---

## Data Sources

| Data | Source | Notes |
|------|--------|-------|
| Station names + codes | 12306 `station_name.js` | 3365 stations |
| Station coordinates | [China-Railway-Station-Database](https://github.com/undef-i/China-Railway-Station-Database) | 4351 stations with lat/lon |
| Railway line geometry | OpenStreetMap via Gitee mirror | 189 lines, GeoJSON format |
| Train timetables | Simulated from known routes | 13 major corridors, 330 trains |

---

## Train Types

| Type | Name | Speed | Color |
|------|------|-------|-------|
| G | High-Speed (高铁) | ~300 km/h | 🔴 Red |
| D | EMU (动车) | ~200 km/h | 🔵 Blue |
| C | Intercity (城际) | ~180 km/h | 🟢 Green |
| Z | Direct Express (直达) | ~120 km/h | 🟠 Orange |
| T | Express (特快) | ~100 km/h | 🟣 Purple |
| K | Fast (快速) | ~80 km/h | ⚫ Grey |

---

## Routes Covered

| Route | Corridor | Stations |
|-------|----------|----------|
| 京沪高铁 | Beijing South ↔ Shanghai Hongqiao | 23 |
| 京广高铁 (North) | Beijing West ↔ Wuhan | 19 |
| 京广高铁 (South) | Wuhan ↔ Guangzhou South | 12 |
| 沪昆高铁 (East) | Shanghai Hongqiao ↔ Changsha South | 13 |
| 沪昆高铁 (West) | Changsha South ↔ Kunming South | 10 |
| 成渝高铁 | Chengdu East ↔ Chongqing North | 12 |
| 哈大高铁 | Harbin West ↔ Dalian North | 18 |
| 合福高铁 | Hefei South ↔ Fuzhou | 17 |
| 贵广高铁 | Guiyang North ↔ Guangzhou South | 17 |
| 西成高铁 | Xi'an North ↔ Chengdu East | 13 |
| 京哈线 (K) | Beijing ↔ Harbin | 9 |
| 京沪线 (T) | Beijing ↔ Shanghai | 10 |
| 京广线 (Z) | Beijing West ↔ Guangzhou | 6 |

---

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/trains` | GET | All currently active trains with positions |
| `/api/train/:id` | GET | Full schedule for a specific train |
| `/api/health` | GET | Service health + active train count |

### Response Example (`/api/trains`)

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

## Deployment

### Prerequisites

- Node.js 18+
- Nginx

### 1. Install Dependencies

```bash
cd /home/CnTrainRadar/backend
npm install
```

### 2. Create systemd Service

```bash
sudo tee /etc/systemd/system/cn-train-radar.service << 'EOF'
[Unit]
Description=CN Train Radar
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/CnTrainRadar/backend
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

### 3. Configure Nginx

```bash
# See the nginx config: proxy to port 3002
# Same pattern as flightradar project
```

### 4. DNS

Add A record: `cntrainradar` → your server IP (Cloudflare Proxied recommended)

---

## Operations

```bash
# Service status
sudo systemctl status cn-train-radar

# Live logs
sudo journalctl -u cn-train-radar -f

# Restart
sudo systemctl restart cn-train-radar

# Health check
curl http://127.0.0.1:3002/api/health
```

---

## Future Improvements

| Priority | Feature | Description |
|----------|---------|-------------|
| 🔴 P0 | Real timetable data | Scrape from 12306 (requires China IP) |
| 🔴 P0 | More routes | Add all major rail corridors (~50+ routes) |
| 🟡 P1 | Station labels | Show station names on map at higher zoom |
| 🟡 P1 | Train search/filter | Search by train number, route, type |
| 🟡 P1 | Route highlight | Click train to show its full route on map |
| 🟢 P2 | Delay simulation | Random delay model for realism |
| 🟢 P2 | Multi-language | EN/中文 switching |
| 🟢 P2 | Statistics panel | Train density, speed distribution |

---

## Comparison with Flight Radar

| | CN Train Radar | Flight Radar |
|---|---|---|
| Data source | Timetable simulation | Real-time ADS-B |
| Accuracy | Estimated (~5-10 km) | Real GPS (~100m) |
| Delay reflection | ❌ No | ✅ Yes |
| Coverage | 13 routes, 330 trains | Global, 6000+ aircraft |
| Update frequency | 10s (recalculated) | 10s (live data) |
| External API needed | No (self-contained) | Yes (adsb.lol, FR24) |

---

## License

Personal project. Station data from [China-Railway-Station-Database](https://github.com/undef-i/China-Railway-Station-Database). Railway geometry from OpenStreetMap.
