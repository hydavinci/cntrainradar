# 🚄 CN Train Radar

Real-time simulation of China's railway network. Train positions are calculated by interpolating between scheduled timetable stops.

**Live:** https://cntrainradar.graymammoth.com

---

## Features

- 🗺️ WebGL map rendering (MapLibre GL) — smooth 60fps
- 🚄 Real-time train position simulation based on timetable (~11,000 trains)
- 🎨 Color-coded by train type (G/D/C/Z/T/K)
- 📍 Click train for details + full route display on map
- 🖱️ Hover tooltip (train ID + route + speed)
- 🔍 Filter by train number, route, or station
- 🛤️ Click train to show full route with station dots on map
- 🎯 Selected train highlighted, others dimmed
- 🌙 Auto dark mode (follows system theme, with color-compensated icons)
- 📱 Mobile-friendly responsive design
- 🇨🇳 Chinese UI with Amap (AutoNavi) tiles

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
│  ├── schedules.json    (11,151 trains)       │
│  ├── station_coords.json (4,351 stations)    │
│  └── stations.json     (3,365 stations)      │
└──────────────────────────────────────────────┘
```

---

## How It Works

Unlike flight tracking (which uses real-time ADS-B GPS signals), China's railways don't broadcast live positions publicly. This project uses **timetable-based simulation**:

1. **Timetable data** — Each train has a list of stops with scheduled arrival/departure times
2. **Position interpolation** — Based on current time (UTC+8), calculate which segment the train is on
3. **Linear interpolation** — Estimate position between two stations based on progress percentage

**Limitations:**
- Positions are estimates, not real GPS
- Delays/cancellations are not reflected
- Timetable is from a static dataset (2025-02-23)

---

## Train Types

| Type | Name | Speed | Color |
|------|------|-------|-------|
| G | High-Speed (高速动车) | ~300 km/h | 🔵 Blue |
| D | EMU (动车组) | ~200 km/h | 🔴 Red |
| C | Intercity (城际) | ~180 km/h | 🟢 Green |
| Z | Direct Express (直达) | ~120 km/h | 🟠 Orange |
| T | Express (特快) | ~100 km/h | 🟣 Purple |
| K | Fast (快速) | ~80 km/h | ⚫ Grey |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | MapLibre GL JS (WebGL), Vanilla JS, CSS |
| Backend | Node.js 22, Express |
| Map Tiles | Amap / AutoNavi (高德地图) |
| CDN | jsdelivr (MapLibre), openmaptiles (fonts) |
| Data | 12306 timetable, OSM railway GeoJSON |
| Reverse Proxy | Nginx + Cloudflare |
| Process Manager | systemd |

---

## Directory Structure

```
CnTrainRadar/
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   └── data/
│       ├── stations.json      # 4,351 station coordinates
│       └── railways.json      # Railway lines GeoJSON (189 lines)
├── backend/
│   ├── package.json
│   ├── server.js              # Express server + position calculation
│   ├── schedules.json         # Train timetables (11,151 trains)
│   ├── stations.json          # Station telecode lookup
│   ├── stations_raw.json      # Raw 12306 station data
│   └── station_coords.json    # Station coordinates
└── README.md
```

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
  "count": 2864,
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
cd backend
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

### 3. Configure Nginx

```nginx
server {
    server_name cntrainradar.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3002;
    }
}
```

### 4. DNS

Add A record pointing to your server IP (Cloudflare Proxied recommended).

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

## Data Sources

| Data | Source | Notes |
|------|--------|-------|
| Station names + codes | 12306 `station_name.js` | 3,365 stations |
| Station coordinates | [China-Railway-Station-Database](https://github.com/undef-i/China-Railway-Station-Database) + OpenStreetMap (Overpass API) | 4,483 stations with lat/lon |
| Railway line geometry | OpenStreetMap | 189 lines, GeoJSON format |
| Train timetables | [RailRhythm12306](https://github.com/wj0575/RailRhythm12306) | 11,151 trains (2025-02/03 merged) |

---

## Comparison with Flight Radar

| | CN Train Radar | Flight Radar |
|---|---|---|
| Data source | Timetable simulation | Real-time ADS-B |
| Accuracy | Estimated (~5-10 km) | Real GPS (~100m) |
| Delay reflection | ❌ No | ✅ Yes |
| Coverage | 11,151 trains | Global, 6,000+ aircraft |
| Update frequency | 10s (recalculated) | 10s (live data) |
| External API needed | No (self-contained) | Yes (adsb.lol, FR24) |

---

## Future Improvements

| Priority | Feature | Description |
|----------|---------|-------------|
| 🔴 P0 | Live timetable updates | Scrape from 12306 periodically (requires China IP) |
| 🟡 P1 | Station labels | Show station names on map at higher zoom |
| 🟡 P1 | Route highlight | Click train to show full route with station dots ✅ |
| 🟡 P1 | Better train icons | Directional arrow for easier heading recognition |
| 🟢 P2 | Delay simulation | Random delay model for realism |
| 🟢 P2 | Statistics panel | Train density, speed distribution |

---

## License

Personal project. Station data from [China-Railway-Station-Database](https://github.com/undef-i/China-Railway-Station-Database). Railway geometry from OpenStreetMap. Timetable data from [RailRhythm12306](https://github.com/wj0575/RailRhythm12306).
