import express from 'express';
import compression from 'compression';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Load schedule data
const schedules = JSON.parse(readFileSync(path.join(__dirname, 'schedules.json'), 'utf8'));
console.log(`Loaded ${schedules.length} train schedules`);

// Build indexes for O(1) lookup and small polling payloads
const scheduleMap = new Map();
const trainMeta = [];
for (const train of schedules) {
  scheduleMap.set(train.id, train);
  trainMeta.push([train.id, train.route_name, train.from, train.to]);
}

function roundCoord(value) {
  return Math.round(value * 100000) / 100000;
}

function toActiveTrain(train, stop, nextStop, progress, heading, speed, stopped = false) {
  return {
    id: train.id,
    type: train.type,
    lat: roundCoord(stopped ? stop.lat : stop.lat + (nextStop.lat - stop.lat) * progress),
    lon: roundCoord(stopped ? stop.lon : stop.lon + (nextStop.lon - stop.lon) * progress),
    heading: Math.round((heading + 360) % 360),
    speed,
    currentStation: stop.name,
    nextStation: stopped ? (nextStop?.name || '终点') : nextStop.name,
    progress: Math.round(progress * 100),
    ...(stopped ? { stopped: true } : {})
  };
}

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend'), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
    if (filePath.endsWith('.webmanifest')) {
      res.setHeader('Content-Type', 'application/manifest+json');
    }
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
        // Calculate heading
        const dlat = stops[i + 1].lat - stops[i].lat;
        const dlon = stops[i + 1].lon - stops[i].lon;
        const heading = Math.atan2(dlon, dlat) * 180 / Math.PI;

        // Calculate actual speed from timetable
        const speed = calcSpeed(stops[i], stops[i + 1]);

        active.push(toActiveTrain(train, stops[i], stops[i + 1], progress, heading, speed));
        break;
      }

      // Train is stopped at station i+1
      if (i + 1 < stops.length - 1) {
        const stationArrive = stops[i + 1].arrive_min;
        const stationDepart = stops[i + 1].depart_min;
        if (currentMin >= stationArrive && currentMin <= stationDepart) {
          active.push(toActiveTrain(train, stops[i + 1], stops[i + 2], 1, 0, 0, true));
          break;
        }
      }
    }
  }

  return active;
}

// --- Result cache (10s TTL) ---
let cachedTrains = null;
let cachedPayload = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10000; // 10 seconds

function getCachedTrains() {
  const now = Date.now();
  if (!cachedTrains || now - cacheTimestamp > CACHE_TTL) {
    cachedTrains = getActiveTrains();
    cachedPayload = JSON.stringify({ trains: cachedTrains, count: cachedTrains.length, timestamp: now });
    cacheTimestamp = now;
  }
  return cachedTrains;
}

function getCachedPayload() {
  getCachedTrains();
  return cachedPayload;
}

// API: active trains
app.get('/api/trains', (req, res) => {
  res.type('application/json').send(getCachedPayload());
});

// API: static train metadata, separated from the 10s polling payload
app.get('/api/meta', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({ trains: trainMeta });
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
