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

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend'), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

/**
 * Calculate current position of all trains based on current time
 */
function getActiveTrains() {
  const now = new Date();
  const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  // China is UTC+8
  const chinaMinute = (minuteOfDay + 480) % 1440;

  const active = [];

  for (const train of schedules) {
    const stops = train.stops;
    if (!stops || stops.length < 2) continue;

    const firstDepart = stops[0].depart_min;
    const lastArrive = stops[stops.length - 1].arrive_min;

    // Check if train is currently running
    if (chinaMinute < firstDepart || chinaMinute > lastArrive) continue;

    // Find which segment the train is on
    for (let i = 0; i < stops.length - 1; i++) {
      const departTime = stops[i].depart_min;
      const arriveTime = stops[i + 1].arrive_min;

      if (chinaMinute >= departTime && chinaMinute <= arriveTime) {
        // Interpolate position
        const progress = (chinaMinute - departTime) / (arriveTime - departTime);
        const lat = stops[i].lat + (stops[i + 1].lat - stops[i].lat) * progress;
        const lon = stops[i].lon + (stops[i + 1].lon - stops[i].lon) * progress;

        // Calculate heading
        const dlat = stops[i + 1].lat - stops[i].lat;
        const dlon = stops[i + 1].lon - stops[i].lon;
        const heading = Math.atan2(dlon, dlat) * 180 / Math.PI;

        // Estimate speed based on train type
        const speedMap = { G: 300, D: 200, C: 180, Z: 120, T: 100, K: 80 };

        active.push({
          id: train.id,
          type: train.type,
          routeName: train.route_name,
          from: train.from,
          to: train.to,
          lat,
          lon,
          heading: (heading + 360) % 360,
          speed: speedMap[train.type] || 100,
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
        if (chinaMinute >= stationArrive && chinaMinute <= stationDepart) {
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

// API: active trains
app.get('/api/trains', (req, res) => {
  const trains = getActiveTrains();
  res.json({ trains, count: trains.length, timestamp: Date.now() });
});

// API: train detail
app.get('/api/train/:id', (req, res) => {
  const train = schedules.find(t => t.id === req.params.id);
  if (!train) return res.status(404).json({ error: 'Train not found' });
  res.json(train);
});

// API: health
app.get('/api/health', (req, res) => {
  const trains = getActiveTrains();
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
