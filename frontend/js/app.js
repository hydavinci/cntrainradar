/**
 * CN Train Radar - MapLibre GL frontend
 */

const TRAIN_COLORS = {
  G: [30, 136, 229],   // blue - high speed
  D: [229, 57, 53],    // red - EMU
  C: [67, 160, 71],    // green - intercity
  Z: [251, 140, 0],    // orange - direct
  T: [142, 36, 170],   // purple - express
  K: [117, 117, 117]   // grey - fast
};

const TRAIN_IMG_SIZE = 48;
let trains = [];
let filteredTrains = [];
let selectedTrain = null;
let filterText = '';

// --- Map ---
let isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
const mapTiles = [
  'https://wprd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scl=1&style=7&x={x}&y={y}&z={z}',
  'https://wprd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scl=1&style=7&x={x}&y={y}&z={z}'
];

// --- WGS84 to GCJ02 coordinate transform ---
const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function isInChina(lon, lat) {
  return (lon > 73.66 && lon < 135.05 && lat > 3.86 && lat < 53.55);
}

function transformLat(x, y) {
  let r = -100.0 + 2.0*x + 3.0*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
  r += (20.0*Math.sin(6.0*x*PI) + 20.0*Math.sin(2.0*x*PI)) * 2.0/3.0;
  r += (20.0*Math.sin(y*PI) + 40.0*Math.sin(y/3.0*PI)) * 2.0/3.0;
  r += (160.0*Math.sin(y/12.0*PI) + 320.0*Math.sin(y*PI/30.0)) * 2.0/3.0;
  return r;
}

function transformLon(x, y) {
  let r = 300.0 + x + 2.0*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
  r += (20.0*Math.sin(6.0*x*PI) + 20.0*Math.sin(2.0*x*PI)) * 2.0/3.0;
  r += (20.0*Math.sin(x*PI) + 40.0*Math.sin(x/3.0*PI)) * 2.0/3.0;
  r += (150.0*Math.sin(x/12.0*PI) + 300.0*Math.sin(x/30.0*PI)) * 2.0/3.0;
  return r;
}

function wgs84ToGcj02(lon, lat) {
  if (!isInChina(lon, lat)) return [lon, lat];
  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  dLon = (dLon * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
  return [lon + dLon, lat + dLat];
}

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {
      'carto': {
        type: 'raster',
        tiles: mapTiles,
        tileSize: 256,
        attribution: '© AutoNavi'
      }
    },
    layers: [
      { id: 'carto-layer', type: 'raster', source: 'carto', paint: { 'raster-fade-duration': 0 } }
    ]
  },
  center: [105, 35],
  zoom: 4,
  minZoom: 3,
  maxZoom: 14,
  maxBounds: [[70, 15], [140, 55]]
});

// --- Dark mode ---
let mapLoaded = false;

const TRAIN_COLORS_DARK = {
  G: [45, 151, 244],   // compensated blue
  D: [255, 125, 121],  // compensated red
  C: [54, 147, 58],    // compensated green
  Z: [199, 88, 0],     // compensated orange
  T: [255, 155, 255],  // compensated purple
  K: [138, 138, 138]   // compensated grey
};

function getTrainColors() {
  return isDarkMode ? TRAIN_COLORS_DARK : TRAIN_COLORS;
}

function applyDarkMode(dark) {
  map.getCanvas().style.filter = dark
    ? 'invert(1) hue-rotate(180deg)'
    : 'none';
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  isDarkMode = e.matches;
  applyDarkMode(isDarkMode);
  if (mapLoaded) addTrainImages();
});

// --- Train icon generation ---
function createTrainImage(color) {
  const size = TRAIN_IMG_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const [r, g, b] = color;

  ctx.translate(size/2, size/2);

  // Glow
  ctx.shadowColor = `rgba(${r},${g},${b},0.4)`;
  ctx.shadowBlur = 3;

  // Locomotive (front)
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(2, -20);
  ctx.lineTo(2, -16);
  ctx.lineTo(4, -16);
  ctx.lineTo(4, -8);
  ctx.lineTo(5, -8);
  ctx.lineTo(5, -2);
  ctx.lineTo(4, -2);
  ctx.lineTo(4, 0);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-4, -2);
  ctx.lineTo(-5, -2);
  ctx.lineTo(-5, -8);
  ctx.lineTo(-4, -8);
  ctx.lineTo(-4, -16);
  ctx.lineTo(-2, -16);
  ctx.lineTo(-2, -20);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;

  // Locomotive window
  ctx.fillStyle = 'rgba(180,220,255,0.7)';
  ctx.fillRect(-2.5, -15, 5, 3);

  // Carriage 1
  ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
  ctx.fillRect(-4, 2, 8, 8);
  ctx.fillStyle = 'rgba(180,220,255,0.6)';
  ctx.fillRect(-3, 3.5, 2.5, 2);
  ctx.fillRect(0.5, 3.5, 2.5, 2);

  // Carriage 2
  ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
  ctx.fillRect(-4, 12, 8, 8);
  ctx.fillStyle = 'rgba(180,220,255,0.5)';
  ctx.fillRect(-3, 13.5, 2.5, 2);
  ctx.fillRect(0.5, 13.5, 2.5, 2);

  // Coupling links
  ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 2);
  ctx.moveTo(0, 10); ctx.lineTo(0, 12);
  ctx.stroke();

  // Wheels
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(-3, -1, 1.5, 0, Math.PI*2);
  ctx.arc(3, -1, 1.5, 0, Math.PI*2);
  ctx.arc(-3, 9, 1.5, 0, Math.PI*2);
  ctx.arc(3, 9, 1.5, 0, Math.PI*2);
  ctx.arc(-3, 19, 1.5, 0, Math.PI*2);
  ctx.arc(3, 19, 1.5, 0, Math.PI*2);
  ctx.fill();

  return canvas;
}

function addTrainImages() {
  const colors = getTrainColors();
  for (const [type, color] of Object.entries(colors)) {
    const name = `train-${type}`;
    if (map.hasImage(name)) map.removeImage(name);
    const canvas = createTrainImage(color);
    const imgData = canvas.getContext('2d').getImageData(0, 0, TRAIN_IMG_SIZE, TRAIN_IMG_SIZE);
    map.addImage(name, { width: TRAIN_IMG_SIZE, height: TRAIN_IMG_SIZE, data: new Uint8Array(imgData.data.buffer) });
  }
  // Selected (gold - compensated for dark mode)
  const goldColor = isDarkMode ? [94, 54, 0] : [255, 215, 0];
  const selCanvas = createTrainImage(goldColor);
  const selData = selCanvas.getContext('2d').getImageData(0, 0, TRAIN_IMG_SIZE, TRAIN_IMG_SIZE);
  if (map.hasImage('train-selected')) map.removeImage('train-selected');
  map.addImage('train-selected', { width: TRAIN_IMG_SIZE, height: TRAIN_IMG_SIZE, data: new Uint8Array(selData.data.buffer) });
}

// --- GeoJSON ---
function trainsToGeoJSON(trainList) {
  return {
    type: 'FeatureCollection',
    features: trainList.map(t => {
      const [lon, lat] = wgs84ToGcj02(t.lon, t.lat);
      const isSelected = t.id === selectedTrain;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          id: t.id,
          type: t.type,
          heading: t.heading || 0,
          icon: isSelected ? 'train-selected' : `train-${t.type}`,
          opacity: selectedTrain ? (isSelected ? 1 : 0.25) : 1
        }
      };
    })
  };
}

// --- Map load ---
map.on('load', () => {
  mapLoaded = true;
  applyDarkMode(isDarkMode);
  addTrainImages();

  map.on('styleimagemissing', () => addTrainImages());

  // Railway lines (convert coords to GCJ02)
  fetch('/data/railways.json').then(r => r.json()).then(data => {
    for (const feature of data.features) {
      if (feature.geometry && feature.geometry.coordinates) {
        feature.geometry.coordinates = feature.geometry.coordinates.map(c => wgs84ToGcj02(c[0], c[1]));
      }
    }
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
      'icon-opacity': ['get', 'opacity'],
      'text-color': 'rgba(255,200,200,0.7)',
      'text-halo-color': 'rgba(0,0,0,0.7)',
      'text-halo-width': 1,
      'text-opacity': ['get', 'opacity']
    }
  });

  // Hover tooltip + route
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

  // Click - show detail sidebar
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
    document.getElementById('status-text').textContent = `${data.count} 列运行中`;
    updateMap();
  } catch (e) {
    document.getElementById('status-text').textContent = '加载失败';
  }
}

function updateMap() {
  filteredTrains = trains.filter(matchesFilter);
  if (map.getSource('trains')) {
    map.getSource('trains').setData(trainsToGeoJSON(filteredTrains));
  }
  document.getElementById('filter-stats').textContent =
    filterText ? `显示 ${filteredTrains.length} / ${trains.length}` : '';
}

// --- Filter (with debounce) ---
let filterDebounceTimer = null;

function matchesFilter(t) {
  if (!filterText) return true;
  const q = filterText.toUpperCase();
  if (t.id.toUpperCase().includes(q)) return true;
  if (t.routeName && t.routeName.includes(filterText)) return true;
  if (t.from && t.from.includes(filterText)) return true;
  if (t.to && t.to.includes(filterText)) return true;
  if (t.currentStation && t.currentStation.includes(filterText)) return true;
  if (t.nextStation && t.nextStation.includes(filterText)) return true;
  if (t.type.toUpperCase() === q) return true;
  return false;
}

function onFilterInput() {
  clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(applyFilter, 200);
}

function applyFilter() {
  filterText = document.getElementById('filter-input').value.trim();
  updateMap();
  // Auto-zoom to results
  if (filterText && filteredTrains.length > 0 && filteredTrains.length <= 10) {
    if (filteredTrains.length === 1) {
      const [lon, lat] = wgs84ToGcj02(filteredTrains[0].lon, filteredTrains[0].lat);
      map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 7) });
      selectTrain(filteredTrains[0].id);
    } else {
      const bounds = new maplibregl.LngLatBounds();
      filteredTrains.forEach(t => {
        const [lon, lat] = wgs84ToGcj02(t.lon, t.lat);
        bounds.extend([lon, lat]);
      });
      map.fitBounds(bounds, { padding: 60 });
    }
  }
}

function clearFilter() {
  filterText = '';
  document.getElementById('filter-input').value = '';
  updateMap();
}

function toggleFilter() {
  const panel = document.getElementById('filter-panel');
  const body = document.getElementById('filter-body');
  body.classList.toggle('open');
  panel.classList.toggle('expanded', body.classList.contains('open'));
  if (body.classList.contains('open')) {
    document.getElementById('filter-input').focus();
  }
}

// --- Select train (floating panel) ---
let detailAnchor = null;

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
    <div class="td-route">${t.from} → ${t.to}</div>
    <div class="td-grid">
      <div class="td-field"><span class="label">类型</span><span class="value">${t.type}-${t.type==='G'?'高速动车':t.type==='D'?'动车组':t.type==='C'?'城际':t.type==='Z'?'直达':t.type==='T'?'特快':'快速'}</span></div>
      <div class="td-field"><span class="label">速度</span><span class="value">${t.speed} km/h</span></div>
      <div class="td-field"><span class="label">当前站</span><span class="value">${t.currentStation}</span></div>
      <div class="td-field"><span class="label">下一站</span><span class="value">${t.nextStation}</span></div>
      <div class="td-field"><span class="label">状态</span><span class="value">${t.stopped ? '🟡 停靠中' : '🟢 运行中'}</span></div>
      <div class="td-field"><span class="label">进度</span><span class="value">${t.progress}%</span></div>
    </div>`;
  
  const [lon, lat] = wgs84ToGcj02(t.lon, t.lat);
  detailAnchor = { lng: lon, lat: lat };
  positionDetail();
  
  if (map.getSource('trains')) map.getSource('trains').setData(trainsToGeoJSON(trains));

  // Show route on map
  showTrainRoute(id);
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
  document.getElementById('train-detail').style.display = '';
  selectedTrain = null;
  detailAnchor = null;
  clearTrainRoute();
  if (map.getSource('trains')) map.getSource('trains').setData(trainsToGeoJSON(trains));
}

// --- Route display (with cache) ---
const routeCache = new Map();
const ROUTE_CACHE_MAX = 50;
let routeRequestId = 0;

async function showTrainRoute(trainId) {
  clearTrainRoute();
  const reqId = ++routeRequestId;

  let data = routeCache.get(trainId);
  if (!data) {
    try {
      const resp = await fetch(`/api/train/${trainId}`);
      if (!resp.ok || reqId !== routeRequestId) return;
      data = await resp.json();
      if (reqId !== routeRequestId) return;
      // Cache it
      if (routeCache.size >= ROUTE_CACHE_MAX) {
        const firstKey = routeCache.keys().next().value;
        routeCache.delete(firstKey);
      }
      routeCache.set(trainId, data);
    } catch (e) {
      return;
    }
  } else {
    if (reqId !== routeRequestId) return;
  }

  const stops = data.stops;
  if (!stops || stops.length < 2) return;

  // Build route line (convert to GCJ02)
  const coords = stops.map(s => wgs84ToGcj02(s.lon, s.lat));
  const routeColor = TRAIN_COLORS[data.type] || [150,150,150];
  const [r, g, b] = routeColor;

  map.addSource('train-route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords }
    }
  });

  map.addLayer({
    id: 'train-route-line',
    type: 'line',
    source: 'train-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': `rgba(${r},${g},${b},0.8)`,
      'line-width': 3,
      'line-dasharray': [2, 2]
    }
  }, 'trains-layer');

  // Station dots
  map.addSource('train-route-stops', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: stops.map(s => {
        const [lon, lat] = wgs84ToGcj02(s.lon, s.lat);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: { name: s.name }
        };
      })
    }
  });

  map.addLayer({
    id: 'train-route-stops-layer',
    type: 'circle',
    source: 'train-route-stops',
    paint: {
      'circle-radius': 4,
      'circle-color': `rgb(${r},${g},${b})`,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#fff'
    }
  }, 'trains-layer');

  // Station labels
  map.addLayer({
    id: 'train-route-labels',
    type: 'symbol',
    source: 'train-route-stops',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Regular'],
      'text-size': 11,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'text-optional': true
    },
    paint: {
      'text-color': `rgb(${r},${g},${b})`,
      'text-halo-color': 'rgba(0,0,0,0.7)',
      'text-halo-width': 1
    }
  }, 'trains-layer');
}

function clearTrainRoute() {
  if (map.getLayer('train-route-labels')) map.removeLayer('train-route-labels');
  if (map.getLayer('train-route-stops-layer')) map.removeLayer('train-route-stops-layer');
  if (map.getLayer('train-route-line')) map.removeLayer('train-route-line');
  if (map.getSource('train-route-stops')) map.removeSource('train-route-stops');
  if (map.getSource('train-route')) map.removeSource('train-route');
}

// --- Exports ---
window.closeTrainDetail = closeTrainDetail;
window.toggleFilter = toggleFilter;
window.onFilterInput = onFilterInput;
window.applyFilter = applyFilter;
window.clearFilter = clearFilter;
