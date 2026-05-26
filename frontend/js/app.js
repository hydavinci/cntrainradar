/**
 * CN Train Radar - MapLibre GL frontend
 */

const TRAIN_COLORS = {
  G: [229, 57, 53],    // red - high speed
  D: [30, 136, 229],   // blue - EMU
  C: [67, 160, 71],    // green - intercity
  Z: [251, 140, 0],    // orange - direct
  T: [142, 36, 170],   // purple - express
  K: [117, 117, 117]   // grey - fast
};

const TRAIN_IMG_SIZE = 40;
let trains = [];
let selectedTrain = null;
let detailAnchor = null;

// --- Map ---
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'carto': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        attribution: '© OSM © CARTO'
      }
    },
    layers: [{ id: 'carto-layer', type: 'raster', source: 'carto', paint: { 'raster-fade-duration': 0 } }]
  },
  center: [108, 34],
  zoom: 4,
  minZoom: 3,
  maxZoom: 14
});

// --- Train icon generation ---
function createTrainImage(color) {
  const size = TRAIN_IMG_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const [r, g, b] = color;
  const s = size / 40;

  ctx.translate(size/2, size/2);
  
  // Glow
  ctx.shadowColor = `rgba(${r},${g},${b},0.4)`;
  ctx.shadowBlur = 4*s;

  // Body (bullet train shape)
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.beginPath();
  ctx.moveTo(0, -16*s);        // nose
  ctx.bezierCurveTo(4*s, -12*s, 5*s, -4*s, 5*s, 4*s);
  ctx.lineTo(5*s, 14*s);
  ctx.lineTo(3*s, 16*s);       // rear
  ctx.lineTo(-3*s, 16*s);
  ctx.lineTo(-5*s, 14*s);
  ctx.lineTo(-5*s, 4*s);
  ctx.bezierCurveTo(-5*s, -4*s, -4*s, -12*s, 0, -16*s);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;

  // Windshield
  ctx.fillStyle = `rgba(${Math.min(255,r+60)},${Math.min(255,g+60)},${Math.min(255,b+60)},0.6)`;
  ctx.beginPath();
  ctx.ellipse(0, -10*s, 3*s, 4*s, 0, 0, Math.PI*2);
  ctx.fill();

  // Stripe
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(-1*s, -6*s, 2*s, 16*s);

  return canvas;
}

function addTrainImages() {
  for (const [type, color] of Object.entries(TRAIN_COLORS)) {
    const name = `train-${type}`;
    if (map.hasImage(name)) map.removeImage(name);
    const canvas = createTrainImage(color);
    const imgData = canvas.getContext('2d').getImageData(0, 0, TRAIN_IMG_SIZE, TRAIN_IMG_SIZE);
    map.addImage(name, { width: TRAIN_IMG_SIZE, height: TRAIN_IMG_SIZE, data: new Uint8Array(imgData.data.buffer) });
  }
  // Selected (gold)
  const selCanvas = createTrainImage([255, 215, 0]);
  const selData = selCanvas.getContext('2d').getImageData(0, 0, TRAIN_IMG_SIZE, TRAIN_IMG_SIZE);
  if (map.hasImage('train-selected')) map.removeImage('train-selected');
  map.addImage('train-selected', { width: TRAIN_IMG_SIZE, height: TRAIN_IMG_SIZE, data: new Uint8Array(selData.data.buffer) });
}

// --- GeoJSON ---
function trainsToGeoJSON(trainList) {
  return {
    type: 'FeatureCollection',
    features: trainList.map(t => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
      properties: {
        id: t.id,
        type: t.type,
        heading: t.heading || 0,
        icon: t.id === selectedTrain ? 'train-selected' : `train-${t.type}`
      }
    }))
  };
}

// --- Map load ---
map.on('load', () => {
  addTrainImages();

  map.on('styleimagemissing', () => addTrainImages());

  // Railway lines
  fetch('/data/railways.json').then(r => r.json()).then(data => {
    map.addSource('railways', { type: 'geojson', data });
    map.addLayer({
      id: 'railways-layer', type: 'line', source: 'railways',
      paint: { 'line-color': 'rgba(255,255,255,0.12)', 'line-width': 1 }
    });
  }).catch(() => {});

  // Trains source
  map.addSource('trains', { type: 'geojson', data: trainsToGeoJSON([]) });
  map.addLayer({
    id: 'trains-layer', type: 'symbol', source: 'trains',
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 6, 0.6, 10, 0.8],
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['step', ['zoom'], '', 7, ['get', 'id']],
      'text-font': ['Open Sans Regular'],
      'text-size': 9,
      'text-offset': [1.2, 0],
      'text-anchor': 'left',
      'text-optional': true
    },
    paint: {
      'text-color': 'rgba(255,200,200,0.7)',
      'text-halo-color': 'rgba(0,0,0,0.7)',
      'text-halo-width': 1
    }
  });

  // Hover tooltip
  const tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -10], className: 'train-tooltip' });
  
  map.on('mouseenter', 'trains-layer', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    if (e.features.length > 0) {
      const id = e.features[0].properties.id;
      const t = trains.find(x => x.id === id);
      if (t) {
        tooltip.setLngLat(e.lngLat).setHTML(`<strong>${t.id}</strong> ${t.from}→${t.to}<br>${t.speed} km/h`).addTo(map);
      }
    }
  });
  map.on('mousemove', 'trains-layer', (e) => { if (e.features.length) tooltip.setLngLat(e.lngLat); });
  map.on('mouseleave', 'trains-layer', () => { map.getCanvas().style.cursor = ''; tooltip.remove(); });

  // Click
  map.on('click', 'trains-layer', (e) => {
    if (e.features.length > 0) selectTrain(e.features[0].properties.id);
  });
  map.on('click', (e) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['trains-layer'] });
    if (f.length === 0) closeTrainDetail();
  });

  // Move: reposition detail
  map.on('move', () => {
    if (detailAnchor) positionDetail();
  });

  // Start polling
  fetchTrains();
  setInterval(fetchTrains, 10000);
});

// --- Fetch trains ---
async function fetchTrains() {
  try {
    const resp = await fetch('/api/trains');
    const data = await resp.json();
    trains = data.trains || [];
    document.getElementById('train-count').textContent = data.count;
    document.getElementById('status-text').textContent = `${data.count} trains`;
    if (map.getSource('trains')) {
      map.getSource('trains').setData(trainsToGeoJSON(trains));
    }
  } catch (e) {
    document.getElementById('status-text').textContent = 'Error';
  }
}

// --- Select train ---
function selectTrain(id) {
  if (selectedTrain === id) { closeTrainDetail(); return; }
  selectedTrain = id;
  const t = trains.find(x => x.id === id);
  if (!t) return;
  
  const panel = document.getElementById('train-detail');
  panel.className = 'visible';
  panel.innerHTML = `
    <button class="td-close" onclick="closeTrainDetail()">✕</button>
    <div class="td-id">${t.id}</div>
    <div class="td-route">${t.routeName} · ${t.from} → ${t.to}</div>
    <div class="td-grid">
      <div class="td-field"><span class="label">Type</span><span class="value">${t.type}-${t.type==='G'?'High Speed':t.type==='D'?'EMU':t.type==='C'?'Intercity':t.type==='Z'?'Direct':t.type==='T'?'Express':'Fast'}</span></div>
      <div class="td-field"><span class="label">Speed</span><span class="value">${t.speed} km/h</span></div>
      <div class="td-field"><span class="label">Current</span><span class="value">${t.currentStation}</span></div>
      <div class="td-field"><span class="label">Next</span><span class="value">${t.nextStation}</span></div>
      <div class="td-field"><span class="label">Status</span><span class="value">${t.stopped ? '🟡 Stopped' : '🟢 Running'}</span></div>
      <div class="td-field"><span class="label">Progress</span><span class="value">${t.progress}%</span></div>
    </div>`;
  
  detailAnchor = { lng: t.lon, lat: t.lat };
  positionDetail();
  
  if (map.getSource('trains')) map.getSource('trains').setData(trainsToGeoJSON(trains));
}

function positionDetail() {
  if (!detailAnchor) return;
  const panel = document.getElementById('train-detail');
  const point = map.project([detailAnchor.lng, detailAnchor.lat]);
  const rect = map.getContainer().getBoundingClientRect();
  let left = point.x + 20, top = point.y - 20;
  if (left + 320 > rect.width) left = point.x - 340;
  if (top + 250 > rect.height) top = rect.height - 260;
  if (top < 10) top = 10;
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
}

function closeTrainDetail() {
  document.getElementById('train-detail').className = '';
  document.getElementById('train-detail').style.display = 'none';
  selectedTrain = null;
  detailAnchor = null;
  if (map.getSource('trains')) map.getSource('trains').setData(trainsToGeoJSON(trains));
}

window.closeTrainDetail = closeTrainDetail;
