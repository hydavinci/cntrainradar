import express from 'express';
import compression from 'compression';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(compression());

// Load schedule data
const schedules = JSON.parse(readFileSync(path.join(__dirname, 'schedules.json'), 'utf8'));
console.log(`Loaded ${schedules.length} train schedules`);

// Build index for O(1) lookup
const scheduleMap = new Map();
for (const train of schedules) {
  scheduleMap.set(train.id, train);
}

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend'), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

/**
 * Calculate real speed from distance and time between two stops
 */
function calcSpeed(stop1, stop2) {
  const dLat = stop2.lat - stop1.lat;
  const dLon = stop2.lon - stop1.lon;
  // Haversine approximation (km)
  const latRad = (stop1.lat + stop2.lat) / 2 * Math.PI / 180;
  const dist = Math.sqrt((dLat * 111.32) ** 2 + (dLon * 111.32 * Math.cos(latRad)) ** 2);
  const timeHours = (stop2.arrive_min - stop1.depart_min) / 60;
  if (timeHours <= 0) return 0;
  return Math.round(dist / timeHours);
}

/**
 * Calculate current position of all trains based on current time
 * Supports cross-day trains (arrive_min > 1440)
 */
function getActiveTrains() {
  const now = new Date();
  const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  // China is UTC+8
  const chinaMinute = (minuteOfDay + 480) % 1440;
  // Also check yesterday's overnight trains
  const chinaMinutePlus = chinaMinute + 1440;

  const active = [];

  for (const train of schedules) {
    const stops = train.stops;
    if (!stops || stops.length < 2) continue;

    const firstDepart = stops[0].depart_min;
    const lastArrive = stops[stops.length - 1].arrive_min;

    // Determine which "chinaMinute" applies to this train
    let currentMin = chinaMinute;
    if (lastArrive > 1440) {
      // Cross-day train: check both today's time and yesterday's offset
      if (chinaMinutePlus >= firstDepart && chinaMinutePlus <= lastArrive) {
        currentMin = chinaMinutePlus;
      } else if (chinaMinute >= firstDepart && chinaMinute <= lastArrive) {
        currentMin = chinaMinute;
      } else {
        continue;
      }
    } else {
      if (currentMin < firstDepart || currentMin > lastArrive) continue;
    }

    // Find which segment the train is on
    for (let i = 0; i < stops.length - 1; i++) {
      const departTime = stops[i].depart_min;
      const arriveTime = stops[i + 1].arrive_min;

      if (currentMin >= departTime && currentMin <= arriveTime) {
        // Interpolate position
        const timeDiff = arriveTime - departTime;
        const progress = timeDiff > 0 ? (currentMin - departTime) / timeDiff : 0;
        const lat = stops[i].lat + (stops[i + 1].lat - stops[i].lat) * progress;
        const lon = stops[i].lon + (stops[i + 1].lon - stops[i].lon) * progress;

        // Calculate heading
        const dlat = stops[i + 1].lat - stops[i].lat;
        const dlon = stops[i + 1].lon - stops[i].lon;
        const heading = Math.atan2(dlon, dlat) * 180 / Math.PI;

        // Calculate actual speed from timetable
        const speed = calcSpeed(stops[i], stops[i + 1]);

        active.push({
          id: train.id,
          type: train.type,
          routeName: train.route_name,
          from: train.from,
          to: train.to,
          lat,
          lon,
          heading: (heading + 360) % 360,
          speed,
          currentStation: stops[i].name,
          nextStation: stops[i + 1].name,
          progress: Math.round(progress * 100)
        });
        break;
      }

      // Train is stopped at station i+1
      if (i + 1 < stops.length - 1) {
        const stationArrive = stops[i + 1].arrive_min;
        const stationDepart = stops[i + 1].depart_min;
        if (currentMin >= stationArrive && currentMin <= stationDepart) {
          active.push({
            id: train.id,
            type: train.type,
            routeName: train.route_name,
            from: train.from,
            to: train.to,
            lat: stops[i + 1].lat,
            lon: stops[i + 1].lon,
            heading: 0,
            speed: 0,
            currentStation: stops[i + 1].name,
            nextStation: i + 2 < stops.length ? stops[i + 2].name : '终点',
            progress: 100,
            stopped: true
          });
          break;
        }
      }
    }
  }

  return active;
}

// --- Result cache (10s TTL) ---
let cachedTrains = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10000; // 10 seconds

function getCachedTrains() {
  const now = Date.now();
  if (!cachedTrains || now - cacheTimestamp > CACHE_TTL) {
    cachedTrains = getActiveTrains();
    cacheTimestamp = now;
  }
  return cachedTrains;
}

// API: active trains
app.get('/api/trains', (req, res) => {
  const trains = getCachedTrains();
  res.json({ trains, count: trains.length, timestamp: Date.now() });
});

// API: train detail (O(1) lookup)
app.get('/api/train/:id', (req, res) => {
  const train = scheduleMap.get(req.params.id);
  if (!train) return res.status(404).json({ error: 'Train not found' });
  res.json(train);
});

// API: health
app.get('/api/health', (req, res) => {
  const trains = getCachedTrains();
  res.json({
    status: 'ok',
    totalSchedules: schedules.length,
    activeTrains: trains.length,
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3002;
createServer(app).listen(PORT, '127.0.0.1', () => {
  console.log(`🚄 CnTrainRadar running on http://127.0.0.1:${PORT}`);
});
