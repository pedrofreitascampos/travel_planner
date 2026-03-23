/* ═══════════════════════════════════════════════════════════════
   TRAVEL PLANNER — app.js
   All app logic: map, routing, weather, POI management, UI
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── Trip Registry ─────────────────────────────────────────────
const tripRegistry = [];

window.registerTrip = function(tripData) {
  tripRegistry.push(tripData);
};

// ─── Category Configuration ────────────────────────────────────
const CATEGORIES = {
  monument:      { icon: '🏛️',  color: '#7c4dff', label: 'Monument' },
  museum:        { icon: '🎨',  color: '#1976d2', label: 'Museum' },
  food:          { icon: '🍽️',  color: '#ef6c00', label: 'Food' },
  bar:           { icon: '🍷',  color: '#c62828', label: 'Bar' },
  nature:        { icon: '🌿',  color: '#388e3c', label: 'Nature' },
  park:          { icon: '🌳',  color: '#66bb6a', label: 'Park' },
  beach:         { icon: '🏖️',  color: '#00897b', label: 'Beach' },
  cave:          { icon: '🦇',  color: '#4a148c', label: 'Cave' },
  entertainment: { icon: '🎢',  color: '#d81b60', label: 'Fun' },
  neighborhood:  { icon: '🚶',  color: '#546e7a', label: 'District' },
};

// Distinct colors for each day (up to 9 days)
const DAY_COLORS = [
  '#e53935', // red
  '#e65100', // deep orange
  '#f9a825', // amber
  '#2e7d32', // green
  '#00838f', // cyan
  '#1565c0', // blue
  '#6a1b9a', // purple
  '#ad1457', // pink
  '#4e342e', // brown
];

// WMO weather code → icon + label
const WMO_CODES = {
  0:  { icon: '☀️',  label: 'Clear sky' },
  1:  { icon: '🌤️', label: 'Mainly clear' },
  2:  { icon: '⛅',  label: 'Partly cloudy' },
  3:  { icon: '☁️',  label: 'Overcast' },
  45: { icon: '🌫️', label: 'Foggy' },
  48: { icon: '🌫️', label: 'Icy fog' },
  51: { icon: '🌦️', label: 'Light drizzle' },
  53: { icon: '🌦️', label: 'Drizzle' },
  55: { icon: '🌧️', label: 'Heavy drizzle' },
  61: { icon: '🌧️', label: 'Light rain' },
  63: { icon: '🌧️', label: 'Rain' },
  65: { icon: '🌧️', label: 'Heavy rain' },
  71: { icon: '🌨️', label: 'Light snow' },
  73: { icon: '🌨️', label: 'Snow' },
  75: { icon: '❄️',  label: 'Heavy snow' },
  77: { icon: '🌨️', label: 'Snow grains' },
  80: { icon: '🌦️', label: 'Showers' },
  81: { icon: '🌧️', label: 'Rain showers' },
  82: { icon: '⛈️',  label: 'Heavy showers' },
  85: { icon: '🌨️', label: 'Snow showers' },
  86: { icon: '🌨️', label: 'Heavy snow showers' },
  95: { icon: '⛈️',  label: 'Thunderstorm' },
  96: { icon: '⛈️',  label: 'Thunderstorm + hail' },
  99: { icon: '⛈️',  label: 'Heavy hail storm' },
};

// ─── Application State ─────────────────────────────────────────
const State = {
  trip: null,
  selectedDayIndex: 0,
  plan: {},               // { 'YYYY-MM-DD': ['poi-id', ...] }
  layers: {
    showUser: true,
    showSuggested: true,
    showAllDays: false,
    routeMode: 'foot',    // 'foot' | 'driving'
    categories: Object.keys(CATEGORIES).reduce((a, k) => ({ ...a, [k]: true }), {}),
  },
  detailPoiId: null,
  weatherCache: {},       // cacheKey → weather object or null
  thumbnailCache: {},     // title → url or null
  routePolyline: null,
  markers: {},            // poiId → L.Marker
  accMarkers: [],
  map: null,
  lastRouteResult: null,
  isMobile: false,
};

// ─── Persistence (localStorage) ────────────────────────────────
const Storage = {
  key: tripId => `tripcraft_${tripId}`,
  save() {
    if (!State.trip) return;
    try {
      localStorage.setItem(Storage.key(State.trip.id), JSON.stringify({
        plan: State.plan,
        layers: State.layers,
        selectedDayIndex: State.selectedDayIndex,
      }));
    } catch (e) { /* quota exceeded — ignore */ }
  },
  load(tripId) {
    try {
      const raw = localStorage.getItem(Storage.key(tripId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  clear(tripId) {
    try { localStorage.removeItem(Storage.key(tripId)); } catch (e) {}
  },
};

// ─── Pure Utility Functions ────────────────────────────────────
function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatShortDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function formatDuration(minutes) {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDist(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getPoi(id) {
  return State.trip?.pois.find(p => p.id === id) ?? null;
}

function getDay(i) {
  return State.trip?.days[i] ?? null;
}

function getDayColor(i) {
  return DAY_COLORS[i % DAY_COLORS.length];
}

function isPoiInPlan(poiId) {
  return Object.values(State.plan).some(arr => arr.includes(poiId));
}

function getDayIndexForDate(date) {
  return State.trip?.days.findIndex(d => d.date === date) ?? -1;
}

function getPoisAvailableToAdd(dayIndex) {
  const day = getDay(dayIndex);
  if (!day) return [];
  const inPlan = State.plan[day.date] || [];
  return State.trip.pois.filter(p =>
    p.availableDays.includes(day.date) && !inPlan.includes(p.id)
  );
}

function getCostHtml(poi) {
  if (poi.cost === 0) return `<span class="badge badge-cost free">Free</span>`;
  return `<span class="badge badge-cost">${poi.costLabel}</span>`;
}

function getStarsHtml(rating) {
  let h = '<div class="stars">';
  for (let i = 1; i <= 5; i++) {
    if (rating >= i)       h += '<span class="star full">★</span>';
    else if (rating >= i - 0.5) h += '<span class="star half">★</span>';
    else                   h += '<span class="star empty">★</span>';
  }
  return h + '</div>';
}

function getKidsHtml(rating) {
  let h = '';
  for (let i = 1; i <= 5; i++) h += i <= rating ? '🧒' : '○';
  return h;
}

// ─── Toast ─────────────────────────────────────────────────────
function showToast(msg, ms = 2500) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.classList.add('fade-out');
    setTimeout(() => t.remove(), 280);
  }, ms);
}

// ─── Wikipedia Thumbnail ───────────────────────────────────────
async function fetchThumb(title) {
  if (!title) return null;
  if (State.thumbnailCache[title] !== undefined) return State.thumbnailCache[title];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    const url = d.thumbnail?.source ?? null;
    State.thumbnailCache[title] = url;
    return url;
  } catch (_) {
    State.thumbnailCache[title] = null;
    return null;
  }
}

// ─── Weather API ───────────────────────────────────────────────
async function fetchWeather(lat, lng, date) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${date}`;
  if (State.weatherCache[key] !== undefined) return State.weatherCache[key];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const url = [
      'https://api.open-meteo.com/v1/forecast',
      `?latitude=${lat}&longitude=${lng}`,
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode`,
      `&timezone=auto&start_date=${date}&end_date=${date}`,
    ].join('');
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    const w = {
      tempMax: Math.round(d.daily.temperature_2m_max[0]),
      tempMin: Math.round(d.daily.temperature_2m_min[0]),
      precip: d.daily.precipitation_probability_max[0],
      code: d.daily.weathercode[0],
    };
    State.weatherCache[key] = w;
    return w;
  } catch (_) {
    State.weatherCache[key] = null;
    return null;
  }
}

// ─── OSRM Routing ──────────────────────────────────────────────
async function fetchRoute(waypoints, mode) {
  if (waypoints.length < 2) return null;
  const coordStr = waypoints.map(([la, ln]) => `${ln},${la}`).join(';');
  const profile = mode === 'driving' ? 'driving' : 'foot';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coordStr}?overview=full&geometries=geojson`;
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    if (d.code !== 'Ok' || !d.routes?.length) throw new Error('no route');
    const route = d.routes[0];
    return {
      geojson: route.geometry,
      distKm: route.distance / 1000,
      durMin: route.duration / 60,
      isFallback: false,
    };
  } catch (_) {
    // Fallback: straight-line Haversine estimate
    let km = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      km += haversineKm(waypoints[i][0], waypoints[i][1], waypoints[i+1][0], waypoints[i+1][1]);
    }
    const speed = mode === 'driving' ? 40 : 4.5;
    return { geojson: null, distKm: km, durMin: (km / speed) * 60, isFallback: true };
  }
}

// ─── Tiredness Calculation ─────────────────────────────────────
const KIDS_MULT = 1.35; // family with 3yo + 6yo

function calcTiredness(poiIds, walkKm = 0) {
  let raw = poiIds.reduce((sum, id) => {
    const p = getPoi(id);
    return sum + (p ? p.duration * p.energyCost : 0);
  }, 0);
  raw += walkKm * 2;
  const score = raw * KIDS_MULT;

  let level, cls;
  if      (score <  5) { level = 'Easy';        cls = 'easy';        }
  else if (score < 10) { level = 'Comfortable'; cls = 'comfortable'; }
  else if (score < 15) { level = 'Moderate';    cls = 'moderate';    }
  else if (score < 20) { level = 'Tiring';      cls = 'tiring';      }
  else                 { level = 'Exhausting';  cls = 'exhausting';  }

  return { score, level, cls, pct: Math.min((score / 25) * 100, 100) };
}

// ─── Map Setup ─────────────────────────────────────────────────
function initMap(lat, lng) {
  State.map = L.map('map', {
    center: [lat, lng],
    zoom: 8,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(State.map);
}

function makePOIIcon(poi, dayIndex) {
  const cat = CATEGORIES[poi.category] || CATEGORIES.monument;
  const color = dayIndex >= 0 ? getDayColor(dayIndex) : cat.color;
  const ring = poi.confirmedBooking
    ? `border:3px solid #f0c040;box-shadow:0 0 0 2px rgba(240,192,64,0.5),0 2px 6px rgba(0,0,0,0.3);`
    : 'border:2.5px solid rgba(255,255,255,0.9);box-shadow:0 2px 6px rgba(0,0,0,0.25);';
  const html = `<div style="width:34px;height:34px;border-radius:50%;background:${color};${ring}display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;">${cat.icon}</div>`;
  return L.divIcon({ html, className: '', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -18] });
}

function makeAccIcon() {
  const html = `<div style="width:30px;height:30px;border-radius:50%;background:#1a1a2e;border:2.5px solid rgba(255,255,255,0.9);box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:14px;">🏨</div>`;
  return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -16] });
}

function buildPopupHTML(poi) {
  const cat = CATEGORIES[poi.category] || CATEGORIES.monument;
  const booked = poi.confirmedBooking
    ? `<span style="background:#fdf3ce;color:#7a5900;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:600;">⭐ Booked</span>`
    : '';
  return `<div style="padding:10px 12px;min-width:160px;">
    <div style="font-weight:600;font-size:13px;margin-bottom:4px;line-height:1.3;">${esc(poi.name)}</div>
    <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#666;flex-wrap:wrap;margin-bottom:6px;">
      <span>${cat.icon} ${cat.label}</span>
      <span>⏱ ${poi.duration}h</span>
      ${booked}
    </div>
    <button onclick="App.openDetail('${poi.id}')"
      style="display:block;width:100%;padding:5px 8px;background:#e07b54;color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">
      View Details
    </button>
  </div>`;
}

// ─── Marker Management ──────────────────────────────────────────
function placeMarkers() {
  if (!State.map || !State.trip) return;

  Object.values(State.markers).forEach(m => State.map.removeLayer(m));
  State.markers = {};
  State.accMarkers.forEach(m => State.map.removeLayer(m));
  State.accMarkers = [];

  const currentDay = getDay(State.selectedDayIndex);
  const showAll = State.layers.showAllDays;

  // Build set of shown dates
  const shownDates = showAll
    ? new Set(State.trip.days.map(d => d.date))
    : new Set(currentDay ? [currentDay.date] : []);

  State.trip.pois.forEach(poi => {
    // Source filter
    if (poi.source === 'user' && !State.layers.showUser) return;
    if (poi.source === 'suggested' && !State.layers.showSuggested) return;
    // Category filter
    if (!State.layers.categories[poi.category]) return;

    // Day filter: only show POIs that are in the plan for a shown date
    const planDate = State.trip.days.find(d =>
      shownDates.has(d.date) && (State.plan[d.date] || []).includes(poi.id)
    );
    if (!planDate) return;

    const dayIndex = getDayIndexForDate(planDate.date);
    const marker = L.marker([poi.lat, poi.lng], { icon: makePOIIcon(poi, dayIndex) })
      .addTo(State.map)
      .bindPopup(buildPopupHTML(poi), { maxWidth: 230, minWidth: 175 });

    State.markers[poi.id] = marker;
  });

  // Accommodation markers
  const shownDateArr = [...shownDates];
  const addedAccIds = new Set();
  State.trip.accommodations.forEach(acc => {
    if (addedAccIds.has(acc.id)) return;
    if (!acc.days.some(d => shownDateArr.includes(d))) return;
    addedAccIds.add(acc.id);
    const m = L.marker([acc.lat, acc.lng], { icon: makeAccIcon() })
      .addTo(State.map)
      .bindPopup(`<div style="padding:8px 10px;"><b>🏨 ${esc(acc.name)}</b><br><span style="font-size:11px;color:#666;">${esc(acc.notes || '')}</span></div>`, { maxWidth: 200 });
    State.accMarkers.push(m);
  });
}

function fitMapToDay(dayIndex) {
  if (!State.map || !State.trip) return;
  const day = getDay(dayIndex);
  if (!day) return;
  const coords = (State.plan[day.date] || [])
    .map(id => getPoi(id)).filter(Boolean)
    .map(p => [p.lat, p.lng]);
  if (coords.length === 0) return;
  if (coords.length === 1) {
    State.map.setView(coords[0], 13, { animate: true });
  } else {
    State.map.fitBounds(L.latLngBounds(coords), { padding: [60, 60], maxZoom: 14, animate: true });
  }
}

async function drawRoute(dayIndex) {
  if (!State.map) return;
  if (State.routePolyline) {
    State.map.removeLayer(State.routePolyline);
    State.routePolyline = null;
  }
  State.lastRouteResult = null;

  const day = getDay(dayIndex);
  if (!day) return;
  const plan = State.plan[day.date] || [];
  const waypoints = plan.map(id => getPoi(id)).filter(Boolean).map(p => [p.lat, p.lng]);
  if (waypoints.length < 2) {
    updateRouteSummaryUI(null);
    return;
  }

  const result = await fetchRoute(waypoints, State.layers.routeMode);
  if (!result) { updateRouteSummaryUI(null); return; }
  State.lastRouteResult = result;

  if (result.geojson) {
    State.routePolyline = L.geoJSON(result.geojson, {
      style: {
        color: getDayColor(dayIndex),
        weight: 4,
        opacity: 0.75,
        dashArray: State.layers.routeMode === 'foot' ? '8,4' : null,
      },
    }).addTo(State.map);
  } else {
    State.routePolyline = L.polyline(waypoints, {
      color: getDayColor(dayIndex),
      weight: 3,
      opacity: 0.55,
      dashArray: '6,6',
    }).addTo(State.map);
  }

  updateRouteSummaryUI(result);
  // Update tiredness with actual walking distance
  const walkKm = State.layers.routeMode === 'foot' ? result.distKm : 0;
  renderTirednessUI(plan, walkKm);
}

// ─── Weather Loading ───────────────────────────────────────────
function getWeatherLocation(dayIndex) {
  const day = getDay(dayIndex);
  if (!day) return null;
  const plan = State.plan[day.date] || [];
  for (const id of plan) {
    const poi = getPoi(id);
    if (poi) return { lat: poi.lat, lng: poi.lng };
  }
  const acc = State.trip.accommodations.find(a => a.days.includes(day.date));
  return acc ? { lat: acc.lat, lng: acc.lng } : null;
}

async function loadAndRenderWeatherAll(dayIndex) {
  const loc = getWeatherLocation(dayIndex);
  if (!loc) return;
  const day = getDay(dayIndex);
  if (!day) return;

  // Show loading in all weather hosts
  const loadingHtml = `<div class="weather-loading"><span class="spinner"></span> Loading weather…</div>`;
  document.querySelectorAll('.weather-host').forEach(el => { el.innerHTML = loadingHtml; });

  const w = await fetchWeather(loc.lat, loc.lng, day.date);

  if (!w) {
    document.querySelectorAll('.weather-host').forEach(el => {
      el.innerHTML = `<div class="weather-loading">Weather unavailable</div>`;
    });
    return;
  }

  const wmo = WMO_CODES[w.code] ?? WMO_CODES[0];
  const widgetHtml = `
    <div class="weather-widget">
      <div class="weather-icon-large">${wmo.icon}</div>
      <div class="weather-temps">
        <span class="weather-temp-max">${w.tempMax}°C</span>
        <span class="weather-temp-min"> / ${w.tempMin}°C</span>
        <div class="weather-desc">${wmo.label}</div>
      </div>
      <div class="weather-precip">💧 ${w.precip}%</div>
    </div>`;
  document.querySelectorAll('.weather-host').forEach(el => { el.innerHTML = widgetHtml; });

  // Update day tab weather icons
  document.querySelectorAll(`.day-tab[data-idx="${dayIndex}"] .tab-weather`).forEach(el => {
    el.textContent = wmo.icon;
  });
}

async function preloadAllWeather() {
  if (!State.trip) return;
  for (let i = 0; i < State.trip.days.length; i++) {
    const loc = getWeatherLocation(i);
    if (!loc) continue;
    const day = State.trip.days[i];
    const w = await fetchWeather(loc.lat, loc.lng, day.date);
    if (w) {
      const wmo = WMO_CODES[w.code] ?? WMO_CODES[0];
      document.querySelectorAll(`.day-tab[data-idx="${i}"] .tab-weather`).forEach(el => {
        el.textContent = wmo.icon;
      });
    }
    await new Promise(r => setTimeout(r, 350));
  }
}

// ─── Tiredness UI ──────────────────────────────────────────────
function renderTirednessUI(poiIds, walkKm = 0) {
  document.querySelectorAll('.tiredness-widget').forEach(el => {
    const { score, level, cls, pct } = calcTiredness(poiIds, walkKm);
    el.innerHTML = `
      <div class="tiredness-header">
        <span class="tiredness-label">Energy Level</span>
        <span class="tiredness-level ${cls}">${level}</span>
      </div>
      <div class="tiredness-bar-track">
        <div class="tiredness-bar-fill ${cls}" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <div class="tiredness-score">Score: ${score.toFixed(1)} · kids ×${KIDS_MULT}</div>`;
  });
}

// ─── Route Summary UI ──────────────────────────────────────────
function updateRouteSummaryUI(result) {
  document.querySelectorAll('.route-summary').forEach(el => {
    if (!result) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    const modeIcon = State.layers.routeMode === 'foot' ? '🚶' : '🚗';
    const fallback = result.isFallback ? ' (est.)' : '';
    el.innerHTML = `
      <div class="route-stat"><span class="stat-icon">${modeIcon}</span>
        <span class="stat-value">${formatDuration(result.durMin)}${fallback}</span></div>
      <div class="route-stat"><span class="stat-icon">📍</span>
        <span class="stat-value">${formatDist(result.distKm)}</span></div>`;
  });
}

// ─── Main Render: Day Plan Panel ───────────────────────────────
// Renders into any element with class "plan-panel-root"
// We render to both #sidebar and #bottom-sheet-inner at once.

function renderAll() {
  renderDayTabs();
  renderDayPlanContent(State.selectedDayIndex);
}

function renderDayTabs() {
  if (!State.trip) return;
  const html = State.trip.days.map((day, i) => {
    const active = i === State.selectedDayIndex;
    const color = getDayColor(i);
    return `<div class="day-tab${active ? ' active' : ''}" data-idx="${i}" onclick="App.selectDay(${i})"
        style="${active ? `background:${color};` : ''}">
      <div class="tab-emoji">${day.emoji}</div>
      <div class="tab-weather"></div>
      <div class="tab-label">${esc(day.destination)}</div>
      <div class="tab-date">${formatShortDate(day.date)}</div>
    </div>`;
  }).join('');

  document.querySelectorAll('.day-tabs-host').forEach(el => { el.innerHTML = html; });
}

function renderDayPlanContent(dayIndex) {
  if (!State.trip) return;
  const day = getDay(dayIndex);
  if (!day) return;
  const plan = State.plan[day.date] || [];

  const drivingHtml = day.driving ? `
    <div class="drive-info">
      <div class="drive-info-icon">🚗</div>
      <div class="drive-info-text">
        <div class="drive-info-label">${esc(day.driving.from)} → ${esc(day.driving.to)}</div>
        <div class="drive-info-detail">~${formatDuration(day.driving.approxMin)} · ${day.driving.approxKm} km · ${esc(day.driving.note)}</div>
      </div>
    </div>` : '';

  // Accommodation for this day
  const dayAcc = State.trip.accommodations.find(a => a.days.includes(day.date));
  // Arrival accommodation (only if driving day and destination acc differs)
  const arrivalAcc = day.driving
    ? State.trip.accommodations.find(a =>
        a.days.includes(day.date) &&
        a.location.toLowerCase().includes(day.driving.to.toLowerCase())
      )
    : null;
  const departureAcc = dayAcc && dayAcc !== arrivalAcc ? dayAcc : (arrivalAcc ? null : dayAcc);

  const accCardHtml = (acc, label) => acc ? `
    <div class="acc-card">
      <div class="acc-icon">🏨</div>
      <div class="acc-info">
        <div class="acc-name">${label ? `<span class="text-xs text-secondary">${label} — </span>` : ''}${esc(acc.name)}</div>
        <div class="acc-note">${esc(acc.notes || '')}</div>
      </div>
    </div>` : '';

  // Build POI cards
  const poiCardsHtml = plan.length === 0
    ? `<div style="padding:20px 8px;text-align:center;color:var(--color-text-light);font-size:13px;">
        No places planned.<br>Add some from the list below!
      </div>`
    : plan.map((id, idx) => buildPoiCardHtml(id, idx)).join('');

  // Available to add
  const available = getPoisAvailableToAdd(dayIndex);
  const addMoreHtml = available.map(poi => buildAddCardHtml(poi)).join('');

  const contentHtml = `
    <div class="day-header">
      <div class="day-header-top">
        <div class="day-header-emoji">${day.emoji}</div>
        <div class="day-header-info">
          <div class="day-header-title">${esc(day.label)}</div>
          <div class="day-header-date">${formatDate(day.date)} · ${esc(day.country)}</div>
        </div>
      </div>
      <div class="weather-host"></div>
      ${drivingHtml}
    </div>

    <div class="tiredness-widget"><!-- filled by renderTirednessUI --></div>

    <div class="route-summary" style="display:none"></div>

    <div class="poi-list-section">
      <div class="section-label">Today's Plan</div>
      ${accCardHtml(departureAcc, day.driving ? 'Depart' : null)}
      <div class="poi-list" data-day="${dayIndex}">
        ${poiCardsHtml}
      </div>
      ${accCardHtml(arrivalAcc, day.driving ? 'Arrive' : null)}
    </div>

    <div class="add-more-section">
      <div class="add-more-header" onclick="App.toggleAddMore(this)">
        <div class="add-more-title">Add places (${available.length})</div>
        <div class="add-more-toggle">▼</div>
      </div>
      <div class="add-more-list" style="display:none">
        ${available.length === 0
          ? '<div style="padding:10px;text-align:center;color:var(--color-text-light);font-size:12px;">All available places are in your plan!</div>'
          : addMoreHtml}
      </div>
    </div>
    <div style="height:24px"></div>
  `;

  document.querySelectorAll('.plan-content-host').forEach(el => {
    el.innerHTML = contentHtml;
    initDragDrop(el.querySelector('.poi-list'), dayIndex);
    initTouchDrag(el.querySelector('.poi-list'), dayIndex);
  });

  // Tiredness from plan (walkKm = 0 initially; updated after route loads)
  renderTirednessUI(plan, 0);

  // Re-use cached route summary if available
  if (State.lastRouteResult) {
    updateRouteSummaryUI(State.lastRouteResult);
    const walkKm = State.layers.routeMode === 'foot' ? State.lastRouteResult.distKm : 0;
    renderTirednessUI(plan, walkKm);
  }

  // Load weather into all .weather-host elements (one per rendered container)
  loadAndRenderWeatherAll(dayIndex);

  // Load thumbnails async
  loadThumbsForDay(dayIndex);
}

function buildPoiCardHtml(poiId, idx) {
  const poi = getPoi(poiId);
  if (!poi) return '';
  const cat = CATEGORIES[poi.category] || CATEGORIES.monument;
  const isBooked = poi.confirmedBooking;
  const badges = [];
  if (isBooked) badges.push('<span class="badge badge-confirmed">⭐ Booked</span>');
  if (poi.bookAhead && !isBooked) badges.push('<span class="badge badge-warning">⚠️ Book ahead</span>');

  return `<div class="poi-card${isBooked ? ' confirmed' : ''}" data-poi-id="${poiId}" draggable="true">
    <div class="drag-handle" title="Drag to reorder">⠿</div>
    <div class="poi-thumb" id="pt-${poiId}"><span class="thumb-fallback">${cat.icon}</span></div>
    <div class="poi-info">
      <div class="poi-card-name" title="${esc(poi.name)}">${esc(poi.name)}</div>
      <div class="poi-card-meta">
        ${getCostHtml(poi)}
        <span class="badge badge-duration">⏱ ${poi.duration}h</span>
        ${badges.join('')}
      </div>
      <div class="poi-kids">${getKidsHtml(poi.kidsRating)}</div>
    </div>
    <div class="poi-actions">
      <button class="btn-icon btn-detail" onclick="App.openDetail('${poiId}')" title="Details">ℹ</button>
      ${isBooked ? '' : `<button class="btn-icon btn-remove" onclick="App.removePoi('${poiId}')" title="Remove">✕</button>`}
    </div>
  </div>`;
}

function buildAddCardHtml(poi) {
  const cat = CATEGORIES[poi.category] || CATEGORIES.monument;
  return `<div class="add-poi-card" onclick="App.addPoi('${poi.id}')">
    <div class="add-poi-icon">${cat.icon}</div>
    <div class="add-poi-info">
      <div class="add-poi-name">${esc(poi.name)}${poi.confirmedBooking ? ' ⭐' : ''}</div>
      <div class="add-poi-meta">${poi.duration}h · ${poi.costLabel} · ${getKidsHtml(poi.kidsRating)}</div>
    </div>
    <button class="btn-add-poi" onclick="event.stopPropagation();App.addPoi('${poi.id}')">+</button>
  </div>`;
}

// ─── Thumbnail Loading ─────────────────────────────────────────
async function loadThumbsForDay(dayIndex) {
  const day = getDay(dayIndex);
  if (!day) return;
  const plan = State.plan[day.date] || [];
  for (const id of plan) {
    const poi = getPoi(id);
    if (!poi?.wikipediaTitle) continue;
    const url = await fetchThumb(poi.wikipediaTitle);
    if (!url) continue;
    // Update all rendered thumbnail elements (desktop sidebar + mobile sheet)
    document.querySelectorAll(`[id="pt-${id}"]`).forEach(el => {
      el.innerHTML = `<img src="${url}" alt="${esc(poi.name)}" loading="lazy">`;
    });
  }
}

// ─── Drag and Drop (Desktop HTML5) ─────────────────────────────
function initDragDrop(listEl, dayIndex) {
  if (!listEl) return;
  let srcId = null;

  listEl.querySelectorAll('.poi-card[draggable]').forEach(card => {
    card.addEventListener('dragstart', e => {
      srcId = card.dataset.poiId;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      listEl.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      listEl.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      const tgtId = card.dataset.poiId;
      if (!srcId || srcId === tgtId) return;
      reorderPlan(dayIndex, srcId, tgtId);
    });
  });
}

// ─── Touch Drag (Mobile) ───────────────────────────────────────
function initTouchDrag(listEl, dayIndex) {
  if (!listEl) return;

  listEl.querySelectorAll('.drag-handle').forEach(handle => {
    let srcId = null;
    let ghost = null;
    let origCard = null;
    let lastY = 0;

    handle.addEventListener('touchstart', e => {
      origCard = handle.closest('.poi-card');
      if (!origCard) return;
      srcId = origCard.dataset.poiId;
      lastY = e.touches[0].clientY;
      origCard.style.opacity = '0.4';

      ghost = origCard.cloneNode(true);
      const rect = origCard.getBoundingClientRect();
      ghost.style.cssText = `
        position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;
        z-index:9999;opacity:0.9;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,0.25);
        border-radius:10px;background:white;`;
      document.body.appendChild(ghost);
    }, { passive: true });

    handle.addEventListener('touchmove', e => {
      if (!ghost) return;
      e.preventDefault();
      const dy = e.touches[0].clientY - lastY;
      lastY = e.touches[0].clientY;
      const top = parseFloat(ghost.style.top) + dy;
      ghost.style.top = top + 'px';

      // Find card under finger
      ghost.style.visibility = 'hidden';
      const underEl = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
      ghost.style.visibility = '';
      listEl.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
      const tgtCard = underEl?.closest('.poi-card');
      if (tgtCard && tgtCard !== origCard) tgtCard.classList.add('drag-over');
    }, { passive: false });

    handle.addEventListener('touchend', e => {
      if (ghost) { ghost.remove(); ghost = null; }
      if (origCard) origCard.style.opacity = '';

      ghost = null;
      const touch = e.changedTouches[0];
      const underEl = document.elementFromPoint(touch.clientX, touch.clientY);
      listEl.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
      const tgtCard = underEl?.closest('.poi-card');
      if (tgtCard && srcId && tgtCard.dataset.poiId !== srcId) {
        reorderPlan(dayIndex, srcId, tgtCard.dataset.poiId);
      }
      srcId = null; origCard = null;
    });
  });
}

function reorderPlan(dayIndex, srcId, tgtId) {
  const day = getDay(dayIndex);
  if (!day) return;
  const plan = [...(State.plan[day.date] || [])];
  const si = plan.indexOf(srcId);
  const ti = plan.indexOf(tgtId);
  if (si < 0 || ti < 0) return;
  plan.splice(si, 1);
  plan.splice(ti, 0, srcId);
  State.plan[day.date] = plan;
  Storage.save();
  refreshDay(dayIndex, true);
  showToast('Order updated');
}

// ─── POI Add / Remove ──────────────────────────────────────────
function addPoi(poiId) {
  const poi = getPoi(poiId);
  if (!poi) return;
  const day = getDay(State.selectedDayIndex);
  if (!day) return;
  if (!poi.availableDays.includes(day.date)) {
    showToast('Not available on this day');
    return;
  }
  const plan = State.plan[day.date] || [];
  if (plan.includes(poiId)) { showToast('Already in plan'); return; }
  State.plan[day.date] = [...plan, poiId];
  Storage.save();
  showToast(`Added: ${poi.name}`);
  refreshDay(State.selectedDayIndex, true);
}

function removePoi(poiId) {
  const poi = getPoi(poiId);
  if (!poi) return;
  if (poi.confirmedBooking) { showToast('Cannot remove a confirmed booking'); return; }
  const day = getDay(State.selectedDayIndex);
  if (!day) return;
  State.plan[day.date] = (State.plan[day.date] || []).filter(id => id !== poiId);
  Storage.save();
  showToast(`Removed: ${poi.name}`);
  refreshDay(State.selectedDayIndex, true);
}

function togglePoiInPlan(poiId) {
  if (isPoiInPlan(poiId)) {
    removePoi(poiId);
  } else {
    addPoi(poiId);
  }
  closeDetail();
}

// ─── Add More Toggle ───────────────────────────────────────────
function toggleAddMore(headerEl) {
  const list = headerEl.nextElementSibling;
  const toggle = headerEl.querySelector('.add-more-toggle');
  if (!list) return;
  const open = list.style.display !== 'none';
  list.style.display = open ? 'none' : 'block';
  if (toggle) toggle.style.transform = open ? '' : 'rotate(180deg)';
}

// ─── Refresh Day ───────────────────────────────────────────────
function refreshDay(dayIndex, redrawRoute = false) {
  State.lastRouteResult = null;
  renderDayPlanContent(dayIndex);
  placeMarkers();
  fitMapToDay(dayIndex);
  if (redrawRoute) drawRoute(dayIndex);
}

// ─── Day Selection ─────────────────────────────────────────────
function selectDay(index) {
  if (!State.trip || index < 0 || index >= State.trip.days.length) return;
  State.selectedDayIndex = index;
  Storage.save();

  // Update tab styles (use data-idx attribute, not forEach index)
  document.querySelectorAll('.day-tab').forEach(tab => {
    const i = parseInt(tab.dataset.idx, 10);
    tab.classList.toggle('active', i === index);
    tab.style.background = i === index ? getDayColor(i) : '';
  });

  // Scroll active tab into view
  document.querySelectorAll(`.day-tab[data-idx="${index}"]`).forEach(tab => {
    tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });

  State.lastRouteResult = null;
  renderDayPlanContent(index);
  placeMarkers();
  fitMapToDay(index);
  drawRoute(index);

  // Expand bottom sheet on mobile when day is selected
  if (State.isMobile) expandBottomSheet();
}

// ─── POI Detail Panel ──────────────────────────────────────────
async function openDetail(poiId) {
  const poi = getPoi(poiId);
  if (!poi) return;
  State.detailPoiId = poiId;

  const cat = CATEGORIES[poi.category] || CATEGORIES.monument;
  const inPlan = isPoiInPlan(poiId);
  const currentDay = getDay(State.selectedDayIndex);

  const badges = [
    `<span class="badge" style="background:${cat.color}20;color:${cat.color}">${cat.icon} ${cat.label}</span>`,
    poi.confirmedBooking ? '<span class="badge badge-confirmed">⭐ Confirmed</span>' : '',
    poi.bookAhead && !poi.confirmedBooking ? '<span class="badge badge-warning">⚠️ Book ahead</span>' : '',
    poi.source === 'suggested' ? '<span class="badge badge-category">💡 Suggested</span>' : '',
  ].filter(Boolean).join('');

  const notesHtml = poi.notes ? `
    <div class="detail-warning">
      <span class="detail-warning-icon">${poi.confirmedBooking ? '⭐' : '⚠️'}</span>
      <span class="detail-warning-text">${esc(poi.notes)}</span>
    </div>` : '';

  const planBtnHtml = poi.confirmedBooking
    ? `<div class="badge badge-confirmed" style="text-align:center;padding:10px;font-size:13px;">⭐ Already booked — enjoy!</div>`
    : `<button class="btn-primary ${inPlan ? 'remove' : 'add'}" onclick="App.togglePoiInPlan('${poiId}')">
        ${inPlan ? '✕ Remove from plan' : `+ Add to ${currentDay ? esc(currentDay.label) : 'plan'}`}
      </button>`;

  const panel = document.getElementById('poi-detail');
  panel.innerHTML = `
    <button class="detail-close" onclick="App.closeDetail()">✕</button>
    <div class="detail-hero" id="det-hero">
      <div class="detail-hero-fallback">${cat.icon}</div>
    </div>
    <div class="detail-body">
      <div class="detail-badges">${badges}</div>
      <div class="detail-name">${esc(poi.name)}</div>
      <div class="detail-rating">
        ${getStarsHtml(poi.rating)}
        <span class="rating-count">${poi.rating} (${(poi.ratingCount ?? 0).toLocaleString()} reviews)</span>
      </div>
      <div class="detail-stats">
        <div class="detail-stat">
          <div class="detail-stat-icon">💰</div>
          <div class="detail-stat-value">${poi.costLabel}</div>
          <div class="detail-stat-label">${poi.cost > 0 ? `€${poi.cost}/person` : 'Free entry'}</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-icon">⏱️</div>
          <div class="detail-stat-value">${poi.duration}h</div>
          <div class="detail-stat-label">Duration</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-icon">🧒</div>
          <div class="detail-stat-value">${poi.kidsRating}/5</div>
          <div class="detail-stat-label">Kid-friendly</div>
        </div>
      </div>
      <div class="detail-section-title">Description</div>
      <div class="detail-desc">${esc(poi.description)}</div>
      <div class="detail-section-title">Opening Hours</div>
      <div class="detail-hours">🕐 ${esc(poi.openingHours || 'Check locally')}</div>
      ${notesHtml}
    </div>
    <div class="detail-footer">
      ${planBtnHtml}
      <a href="${esc(poi.gmapsUrl)}" target="_blank" rel="noopener" style="display:block;">
        <button class="btn-primary maps">🗺 Open in Google Maps</button>
      </a>
    </div>`;

  panel.classList.add('open');

  // Async hero image
  if (poi.wikipediaTitle) {
    const url = await fetchThumb(poi.wikipediaTitle);
    const heroEl = document.getElementById('det-hero');
    if (url && heroEl) heroEl.innerHTML = `<img src="${url}" alt="${esc(poi.name)}">`;
  }
}

function closeDetail() {
  State.detailPoiId = null;
  document.getElementById('poi-detail').classList.remove('open');
}

// ─── Layer Controls ────────────────────────────────────────────
function initLayerPanel() {
  const btn = document.getElementById('layer-btn');
  const panel = document.getElementById('layer-panel');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove('open');
  });

  // Build category checkboxes
  document.getElementById('category-filters').innerHTML = Object.entries(CATEGORIES).map(([key, cfg]) => `
    <label class="cat-filter">
      <input type="checkbox" ${State.layers.categories[key] ? 'checked' : ''}
        onchange="App.toggleCategory('${key}', this.checked)">
      <span class="cat-check"></span>
      <span class="cat-label">${cfg.icon} ${cfg.label}</span>
    </label>`).join('');
}

function toggleLayer(key, val) {
  State.layers[key] = val;
  Storage.save();
  placeMarkers();
  if (key === 'showAllDays') fitMapToDay(State.selectedDayIndex);
}

function toggleCategory(key, val) {
  State.layers.categories[key] = val;
  Storage.save();
  placeMarkers();
}

function setRouteMode(mode) {
  State.layers.routeMode = mode;
  Storage.save();
  document.querySelectorAll('.route-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  State.lastRouteResult = null;
  drawRoute(State.selectedDayIndex);
}

function syncLayerUI() {
  const map = {
    'toggle-my-pois': State.layers.showUser,
    'toggle-suggested': State.layers.showSuggested,
    'toggle-all-days': State.layers.showAllDays,
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.checked = val;
  });
  document.querySelectorAll('.route-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === State.layers.routeMode);
  });
}

// ─── Reset Plan ────────────────────────────────────────────────
function resetPlan() {
  if (!State.trip) return;
  if (!confirm('Reset to default plan? All changes will be lost.')) return;
  State.plan = {};
  Object.entries(State.trip.defaultDayPlans).forEach(([date, ids]) => {
    State.plan[date] = [...ids];
  });
  Storage.save();
  State.lastRouteResult = null;
  renderAll();
  placeMarkers();
  fitMapToDay(State.selectedDayIndex);
  drawRoute(State.selectedDayIndex);
  showToast('Plan reset to defaults');
}

// ─── Mobile Bottom Sheet ───────────────────────────────────────
function expandBottomSheet() {
  const sheet = document.getElementById('bottom-sheet');
  if (sheet) {
    sheet.classList.remove('collapsed');
    sheet.classList.add('expanded');
  }
}

function collapseBottomSheet() {
  const sheet = document.getElementById('bottom-sheet');
  if (sheet) {
    sheet.classList.remove('expanded');
    sheet.classList.add('collapsed');
  }
}

function initBottomSheet() {
  const sheet = document.getElementById('bottom-sheet');
  const handle = document.getElementById('sheet-handle');
  if (!sheet || !handle) return;

  let startY = 0, startH = 0, dragging = false;

  handle.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    startH = sheet.offsetHeight;
    dragging = true;
    sheet.style.transition = 'none';
  }, { passive: true });

  handle.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dy = startY - e.touches[0].clientY;
    const newH = Math.min(Math.max(startH + dy, 72), window.innerHeight * 0.88);
    sheet.style.height = newH + 'px';
    const inner = document.getElementById('bottom-sheet-inner');
    if (inner) inner.style.display = newH > 130 ? '' : 'none';
  }, { passive: true });

  handle.addEventListener('touchend', () => {
    dragging = false;
    sheet.style.transition = '';
    sheet.style.height = '';
    const h = sheet.offsetHeight;
    const inner = document.getElementById('bottom-sheet-inner');
    if (inner) inner.style.display = '';

    if (h > window.innerHeight * 0.25) {
      sheet.classList.add('expanded');
      sheet.classList.remove('collapsed');
    } else {
      sheet.classList.add('collapsed');
      sheet.classList.remove('expanded');
    }
  });

  // Tap handle to toggle
  let tapTimer = null;
  handle.addEventListener('click', () => {
    if (tapTimer) return;
    tapTimer = setTimeout(() => { tapTimer = null; }, 300);
    sheet.classList.toggle('expanded');
    sheet.classList.toggle('collapsed');
  });
}

// ─── Sidebar & Bottom Sheet: Build DOM ─────────────────────────
function buildSidebarDOM() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <div style="background:var(--color-header);flex-shrink:0;">
      <div class="day-tabs-host" style="display:flex;overflow-x:auto;padding:8px 8px 8px;gap:4px;scrollbar-width:none;-webkit-overflow-scrolling:touch;"></div>
    </div>
    <div class="plan-content-host" style="flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--color-border-dark) transparent;"></div>
  `;
}

function buildBottomSheetDOM() {
  const inner = document.getElementById('bottom-sheet-inner');
  if (!inner) return;
  inner.innerHTML = `
    <div style="background:var(--color-header);flex-shrink:0;border-radius:16px 16px 0 0;">
      <div class="day-tabs-host" style="display:flex;overflow-x:auto;padding:8px 8px 8px;gap:4px;scrollbar-width:none;-webkit-overflow-scrolling:touch;"></div>
    </div>
    <div class="plan-content-host" style="flex:1;overflow-y:auto;scrollbar-width:thin;"></div>
  `;
  inner.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';
}

// ─── Trip Selector ─────────────────────────────────────────────
function showTripSelector(trips) {
  const el = document.getElementById('trip-selector');
  const cards = document.getElementById('trip-cards');
  if (!el || !cards) return;
  cards.innerHTML = trips.map(t => `
    <div class="trip-card" onclick="App.loadTrip('${t.id}')">
      <div class="trip-card-color" style="background:${t.coverColor}20;color:${t.coverColor};font-size:28px;">✈️</div>
      <div class="trip-card-info">
        <div class="trip-card-name">${esc(t.name)}</div>
        <div class="trip-card-dates">${formatShortDate(t.startDate)} – ${formatShortDate(t.endDate)}</div>
        <div class="trip-card-meta">${t.pois.length} places · ${t.days.length} days</div>
      </div>
    </div>`).join('');
  el.classList.remove('hidden');
}

// ─── Trip Loading ──────────────────────────────────────────────
function loadTrip(tripId) {
  const trip = tripRegistry.find(t => t.id === tripId);
  if (!trip) { console.error('Trip not found:', tripId); return; }
  State.trip = trip;
  document.getElementById('trip-selector')?.classList.add('hidden');

  // Restore or initialize plan
  const saved = Storage.load(tripId);
  if (saved) {
    State.plan = saved.plan ?? {};
    if (saved.layers) {
      Object.assign(State.layers, saved.layers);
      Object.keys(CATEGORIES).forEach(k => {
        if (State.layers.categories[k] === undefined) State.layers.categories[k] = true;
      });
    }
    State.selectedDayIndex = Math.min(
      saved.selectedDayIndex ?? 0,
      trip.days.length - 1
    );
  } else {
    State.plan = {};
    Object.entries(trip.defaultDayPlans).forEach(([d, ids]) => { State.plan[d] = [...ids]; });
    State.selectedDayIndex = 0;
  }

  // Header
  document.querySelector('.header-title').textContent = trip.name;
  document.querySelector('.header-subtitle').textContent = trip.subtitle ?? '';

  // Build panel DOM
  buildSidebarDOM();
  buildBottomSheetDOM();

  // Init map
  if (!State.map) {
    const acc = trip.accommodations[0];
    initMap(acc?.lat ?? trip.pois[0]?.lat ?? 38, acc?.lng ?? trip.pois[0]?.lng ?? -7);
  }

  // Sync layer controls
  syncLayerUI();

  // Render
  renderAll();
  placeMarkers();
  fitMapToDay(State.selectedDayIndex);
  drawRoute(State.selectedDayIndex);

  // Background weather preload
  setTimeout(preloadAllWeather, 2000);
}

// ─── Public API ────────────────────────────────────────────────
window.App = {
  selectDay,
  openDetail,
  closeDetail,
  togglePoiInPlan,
  addPoi,
  removePoi,
  toggleAddMore,
  toggleLayer,
  toggleCategory,
  setRouteMode,
  resetPlan,
  loadTrip,
};

// ─── Initialization ────────────────────────────────────────────
function init() {
  State.isMobile = window.innerWidth < 768;

  initLayerPanel();
  initBottomSheet();

  // Handle resize
  window.addEventListener('resize', () => {
    const wasMobile = State.isMobile;
    State.isMobile = window.innerWidth < 768;
    if (wasMobile !== State.isMobile && State.trip) {
      // Re-render tabs/content in the right container
      renderAll();
    }
    if (State.map) State.map.invalidateSize();
  });

  // Keyboard: Escape closes detail
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDetail();
  });

  if (tripRegistry.length === 0) {
    console.error('No trips registered. Check trips/index.js and trip files.');
    return;
  }

  if (tripRegistry.length === 1) {
    loadTrip(tripRegistry[0].id);
  } else {
    showTripSelector(tripRegistry);
  }
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // Small defer to ensure trip files have executed
  setTimeout(init, 10);
}
