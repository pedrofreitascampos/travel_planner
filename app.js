/* ═══════════════════════════════════════════════════════════════
   TRAVEL PLANNER — app.js
   All app logic: map, routing, weather, POI management, UI
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── Trip Registry ─────────────────────────────────────────────
// window._tripRegistry is populated by trip data files loaded before this script.
// We use a live getter so this always reflects the populated array at call time,
// even if the browser evaluates this module-level code at an unexpected moment.
const tripRegistry = {
  get _arr() { return window._tripRegistry || []; },
  get length() { return this._arr.length; },
  push(v) { this._arr.push(v); },
  find(fn) { return this._arr.find(fn); },
  map(fn) { return this._arr.map(fn); },
  filter(fn) { return this._arr.filter(fn); },
  [Symbol.iterator]() { return this._arr[Symbol.iterator](); },
};

window.registerTrip = function(tripData) {
  if (!window._tripRegistry) window._tripRegistry = [];
  if (!window._tripRegistry.includes(tripData)) window._tripRegistry.push(tripData);
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
  partyConfig: [35, 38, 3, 6],
  settings: {
    fuelPrice: 1.70,
    carConsumption: 7.5,
    dailyMealBudget: 22,
    discoveryRadius: 5,       // km — nearby POI discovery
    routeDiscoveryRadius: 3,  // km — along-route discovery
  },
  importedPois: [],       // POIs imported from Google Maps
  accEdits: {},           // accId → { name, notes, pricePerNight }
  customMarkerMode: false, // true when user is dropping a custom pin
  pendingMarkerLatLng: null, // {lat, lng} of pending custom marker
};

// ─── Persistence (localStorage) ────────────────────────────────
const Storage = {
  key: tripId => `tripcraft_${tripId}`,
  partyKey: 'tripcraft_party',
  settingsKey: 'tripcraft_settings',
  importKey: tripId => `tripcraft_${tripId}_imported`,
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
  saveParty() {
    try {
      localStorage.setItem(Storage.partyKey, JSON.stringify(State.partyConfig));
    } catch (e) {}
  },
  saveSettings() {
    try {
      localStorage.setItem(Storage.settingsKey, JSON.stringify(State.settings));
    } catch (e) {}
  },
  saveImported(tripId) {
    try {
      localStorage.setItem(Storage.importKey(tripId), JSON.stringify(State.importedPois));
    } catch (e) {}
  },
  load(tripId) {
    try {
      const raw = localStorage.getItem(Storage.key(tripId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  loadParty() {
    try {
      const raw = localStorage.getItem(Storage.partyKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  loadSettings() {
    try {
      const raw = localStorage.getItem(Storage.settingsKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  loadImported(tripId) {
    try {
      const raw = localStorage.getItem(Storage.importKey(tripId));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  },
  clear(tripId) {
    try { localStorage.removeItem(Storage.key(tripId)); } catch (e) {}
  },
  loadUserTrips() {
    try { return JSON.parse(localStorage.getItem('tripcraft_user_trips') || '[]'); }
    catch { return []; }
  },
  saveUserTrips(trips) {
    try { localStorage.setItem('tripcraft_user_trips', JSON.stringify(trips)); } catch (e) {}
  },
  accEditsKey: tripId => `tripcraft_${tripId}_acc_edits`,
  saveAccEdits(tripId) {
    try { localStorage.setItem(Storage.accEditsKey(tripId), JSON.stringify(State.accEdits)); } catch (e) {}
  },
  loadAccEdits(tripId) {
    try { return JSON.parse(localStorage.getItem(Storage.accEditsKey(tripId)) || '{}'); }
    catch { return {}; }
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

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

// ─── Party Config Helpers ──────────────────────────────────────
function getAgeMultiplier(age) {
  if (age < 2)  return 2.0;
  if (age < 4)  return 1.6;
  if (age < 7)  return 1.35;
  if (age < 12) return 1.15;
  if (age < 16) return 1.05;
  return 1.0;
}

function getMaxAgeMultiplier() {
  if (!State.partyConfig || State.partyConfig.length === 0) return 1.0;
  return Math.max(...State.partyConfig.map(age => getAgeMultiplier(age)));
}

function parsePartyDescription(ages) {
  const adults  = ages.filter(a => a >= 16).length;
  const children = ages.filter(a => a >= 4 && a < 16).length;
  const toddlers = ages.filter(a => a >= 2 && a < 4).length;
  const infants  = ages.filter(a => a < 2).length;
  const parts = [];
  if (adults  > 0) parts.push(`${adults} adult${adults > 1 ? 's' : ''}`);
  if (children > 0) parts.push(`${children} child${children > 1 ? 'ren' : ''}`);
  if (toddlers > 0) parts.push(`${toddlers} toddler${toddlers > 1 ? 's' : ''}`);
  if (infants > 0)  parts.push(`${infants} infant${infants > 1 ? 's' : ''}`);
  return parts.join(', ');
}

function hasKidsInParty() {
  return State.partyConfig.some(a => a < 16);
}

function getYoungestAge() {
  if (!State.partyConfig || State.partyConfig.length === 0) return 99;
  return Math.min(...State.partyConfig);
}

// ─── Day Metrics Calculation ────────────────────────────────────
function calcDayMetrics(dayIndex, routeDistKm) {
  const day = getDay(dayIndex);
  if (!day) return null;
  const plan = State.plan[day.date] || [];
  const pois = plan.map(id => getPoi(id)).filter(Boolean);
  const partySize = State.partyConfig.length;
  const maxMult = getMaxAgeMultiplier();
  const youngest = getYoungestAge();
  const { fuelPrice, carConsumption, dailyMealBudget } = State.settings;
  const walkKm = (routeDistKm != null && State.layers.routeMode === 'foot') ? routeDistKm : 0;

  // ── Cost ──────────────────────────────────────────────────────
  const poiEntryCost = pois.reduce((sum, p) => sum + (p.costAmount || p.cost || 0), 0) * partySize;
  const mealsCost = dailyMealBudget * partySize;
  let fuelCost = 0;
  if (day.driving) {
    const km = routeDistKm || day.driving.approxKm || 0;
    fuelCost = (km / 100) * carConsumption * fuelPrice;
  }
  const dayAcc = State.trip?.accommodations.find(a => a.days.includes(day.date));
  const accEdit = dayAcc ? (State.accEdits[dayAcc.id] || {}) : {};
  const accCost = parseFloat(accEdit.pricePerNight) || 0;
  const totalCost = poiEntryCost + mealsCost + fuelCost + accCost;

  // ── Tiredness ─────────────────────────────────────────────────
  const tirednessRaw = pois.reduce((sum, p) => sum + (p.duration || 1) * (p.energyCost || 2), 0) + walkKm * 2;
  const tirednessScore = tirednessRaw * maxMult;
  const tirednessNorm = Math.min(10, tirednessScore / 3);
  let tirednessLevel, tirednessColor;
  if      (tirednessNorm > 7)   { tirednessLevel = 'Exhausting';  tirednessColor = '#e74c3c'; }
  else if (tirednessNorm > 5)   { tirednessLevel = 'Tiring';      tirednessColor = '#e67e22'; }
  else if (tirednessNorm > 3)   { tirednessLevel = 'Moderate';    tirednessColor = '#f39c12'; }
  else if (tirednessNorm > 1.5) { tirednessLevel = 'Comfortable'; tirednessColor = '#2980b9'; }
  else                           { tirednessLevel = 'Easy';        tirednessColor = '#27ae60'; }

  // ── Family Friendly ───────────────────────────────────────────
  let familyFriendly = 0;
  if (pois.length > 0) {
    const avgKids = pois.reduce((s, p) => s + (p.kidsRating || p.kidsFriendly || 3), 0) / pois.length;
    familyFriendly = avgKids * 2; // scale 0-5 → 0-10
  } else {
    familyFriendly = 5;
  }
  const museumMonumentCount = pois.filter(p => p.category === 'museum' || p.category === 'monument').length;
  if (youngest < 4 && pois.length > 0 && museumMonumentCount / pois.length > 0.6) {
    familyFriendly -= 2;
  }
  if (day.driving && day.driving.approxMin > 120) {
    familyFriendly -= 1.5;
  }
  familyFriendly = Math.max(0, Math.min(10, familyFriendly));

  // ── Logistical Friction ───────────────────────────────────────
  let logisticalFriction = 0;
  pois.forEach(p => {
    if ((p.tags || []).includes('book-ahead') || p.bookAhead) logisticalFriction += 2.5;
  });
  const confirmedBookings = State.trip?.confirmedBookings || {};
  if (pois.some(p => confirmedBookings[p.id])) logisticalFriction += 1;
  if (day.driving && day.driving.approxMin > 90) logisticalFriction += 3;
  if (pois.length > 5) logisticalFriction += 1.5;
  logisticalFriction = Math.max(0, Math.min(10, logisticalFriction));

  // ── Cultural ──────────────────────────────────────────────────
  const culturalWeights = { monument: 3, museum: 3, neighborhood: 2, cave: 2.5, nature: 1, bar: 1, food: 0.5, park: 0.5, beach: 0.5, entertainment: 0.5 };
  let cultural = 0;
  if (pois.length > 0) {
    const avgCultural = pois.reduce((s, p) => s + (culturalWeights[p.category] || 1), 0) / pois.length;
    cultural = Math.min(10, (avgCultural / 3) * 10);
  }

  // ── Gastronomic ───────────────────────────────────────────────
  const foodPois = pois.filter(p => p.category === 'food' || p.category === 'bar');
  let gastronomic = 0;
  if (foodPois.length > 0) {
    gastronomic += 2;
    foodPois.forEach(p => {
      const ratingMult = (p.rating || 3) * ((p.costAmount || 0) > 20 ? 1.3 : 1);
      gastronomic += ratingMult;
    });
    if (pois.some(p => (p.tags || []).includes('market'))) gastronomic += 1;
    gastronomic = Math.min(10, gastronomic / (foodPois.length + 1));
  }

  // ── Relaxation ────────────────────────────────────────────────
  const relaxationWeights = { beach: 3.5, park: 3, nature: 2.5, neighborhood: 2, food: 2, bar: 2, monument: 1, museum: 0.5, cave: 1.5, entertainment: 1 };
  let relaxation = 0;
  if (pois.length > 0) {
    const avgRelax = pois.reduce((s, p) => s + (relaxationWeights[p.category] || 1), 0) / pois.length;
    relaxation = Math.min(10, (avgRelax / 3.5) * 10);
    relaxation = Math.max(0, relaxation - tirednessNorm * 0.4);
  }

  // ── Fun ───────────────────────────────────────────────────────
  const funWeights = { entertainment: 4, beach: 4, neighborhood: 2.5, food: 2.5, bar: 2.5, cave: 3, park: 2, monument: 1.5, museum: 1.5, nature: 2 };
  let fun = 0;
  if (pois.length > 0) {
    const avgFun = pois.reduce((s, p) => {
      const w = funWeights[p.category] || 1.5;
      return s + w * ((p.rating || 3) / 5);
    }, 0) / pois.length;
    fun = Math.min(10, (avgFun / 4) * 10);
    if (foodPois.length > 0) fun = Math.min(10, fun + 1);
  }

  // ── Kids Fun ──────────────────────────────────────────────────
  const kidsFunWeights = { entertainment: 5, beach: 5, park: 4.5, cave: 4, neighborhood: 3, nature: 3, food: 2.5, bar: 1, monument: 1.5, museum: 1.5 };
  let kidsFun = 0;
  if (pois.length > 0) {
    const avgKidsFun = pois.reduce((s, p) => {
      const w = kidsFunWeights[p.category] || 2;
      const kidsRating = p.kidsRating || p.kidsFriendly || 3;
      return s + w * (kidsRating / 5);
    }, 0) / pois.length;
    kidsFun = Math.min(10, (avgKidsFun / 5) * 10);
  }

  // ── Overall ───────────────────────────────────────────────────
  const overall = (
    familyFriendly * 0.2 +
    cultural * 0.15 +
    gastronomic * 0.15 +
    relaxation * 0.1 +
    fun * 0.2 +
    kidsFun * 0.2
  );

  // ── Suggestions ───────────────────────────────────────────────
  const suggestions = [];

  if (tirednessNorm > 7) {
    // Suggest removing the most tiring POI
    let mostTiringPoi = null;
    let maxTiredness = 0;
    pois.forEach(p => {
      const t = (p.duration || 1) * (p.energyCost || 2);
      if (t > maxTiredness && !p.confirmedBooking) { maxTiredness = t; mostTiringPoi = p; }
    });
    suggestions.push({
      type: 'warning',
      text: `Exhausting day — consider removing one activity${mostTiringPoi ? ` (e.g. ${mostTiringPoi.name})` : ''}`,
      poiId: null,
    });
  }

  if (kidsFun < 4 && hasKidsInParty()) {
    const available = getPoisAvailableToAdd(dayIndex);
    const bestKidPoi = available
      .filter(p => p.category === 'park' || p.category === 'beach' || p.category === 'entertainment')
      .sort((a, b) => (b.kidsRating || 3) - (a.kidsRating || 3))[0];
    if (bestKidPoi) {
      suggestions.push({
        type: 'tip',
        text: `Low kids fun — consider adding ${bestKidPoi.name}`,
        poiId: bestKidPoi.id,
      });
    } else {
      suggestions.push({ type: 'tip', text: 'Low kids fun — add parks, beaches or entertainment', poiId: null });
    }
  }

  if (gastronomic < 3) {
    const available = getPoisAvailableToAdd(dayIndex);
    const foodPoi = available.find(p => p.category === 'food' || p.category === 'bar');
    if (foodPoi) {
      suggestions.push({ type: 'tip', text: `Add a food experience — try ${foodPoi.name}`, poiId: foodPoi.id });
    }
  }

  if (logisticalFriction > 7) {
    suggestions.push({ type: 'warning', text: 'Complex day — double-check all bookings and timings', poiId: null });
  }

  if (familyFriendly < 4) {
    suggestions.push({ type: 'warning', text: 'This day is museum-heavy for young kids', poiId: null });
  }

  if (overall > 8) {
    suggestions.push({ type: 'action', text: 'This day looks great! 🌟', poiId: null });
  }

  return {
    cost: { poi: poiEntryCost, meals: mealsCost, fuel: fuelCost, acc: accCost, total: totalCost },
    tiredness: { raw: tirednessRaw, score: tirednessScore, norm: tirednessNorm, level: tirednessLevel, color: tirednessColor },
    familyFriendly,
    logisticalFriction,
    cultural,
    gastronomic,
    relaxation,
    fun,
    kidsFun,
    overall,
    suggestions,
  };
}

function calcTripMetrics() {
  if (!State.trip) return null;
  const dayCount = State.trip.days.length;
  const allMetrics = State.trip.days.map((_, i) => calcDayMetrics(i, null));

  const totalCost = allMetrics.reduce((s, m) => s + (m ? m.cost.total : 0), 0);
  const avg = key => allMetrics.reduce((s, m) => s + (m ? m[key] : 0), 0) / dayCount;

  const avgTiredness = avg('tiredness'); // Note: we use norm
  const avgTirednessNorm = allMetrics.reduce((s, m) => s + (m ? m.tiredness.norm : 0), 0) / dayCount;
  const avgFamilyFriendly = avg('familyFriendly');
  const avgLogisticalFriction = avg('logisticalFriction');
  const avgCultural = avg('cultural');
  const avgGastronomic = avg('gastronomic');
  const avgRelaxation = avg('relaxation');
  const avgFun = avg('fun');
  const avgKidsFun = avg('kidsFun');
  const overallTrip = avg('overall');

  const suggestions = [];

  if (allMetrics.some(m => m && m.tiredness.norm > 7)) {
    suggestions.push({ type: 'warning', text: 'Consider spacing out heavy activity days' });
  }
  const budget = 2000;
  if (totalCost > budget) {
    suggestions.push({ type: 'warning', text: `Over estimated budget (€${totalCost.toFixed(0)} vs €${budget})` });
  }
  if (avgKidsFun < 5) {
    suggestions.push({ type: 'tip', text: 'Low kids fun overall — add more parks and beaches' });
  }
  if (avgGastronomic < 4) {
    suggestions.push({ type: 'tip', text: 'Food experiences could be richer — add local dining spots' });
  }

  let bestDayIdx = 0, worstDayIdx = 0;
  allMetrics.forEach((m, i) => {
    if (m && m.overall > (allMetrics[bestDayIdx]?.overall || 0)) bestDayIdx = i;
    if (m && m.overall < (allMetrics[worstDayIdx]?.overall || 10)) worstDayIdx = i;
  });

  return {
    allMetrics,
    totalCost,
    avgTirednessNorm,
    avgFamilyFriendly,
    avgLogisticalFriction,
    avgCultural,
    avgGastronomic,
    avgRelaxation,
    avgFun,
    avgKidsFun,
    overallTrip,
    suggestions,
    bestDayIdx,
    worstDayIdx,
  };
}

// ─── Radar Chart SVG ───────────────────────────────────────────
function renderRadarChartSVG(metrics, accentColor) {
  const axes = [
    { label: 'Cultural',    value: metrics.cultural },
    { label: 'Gastronomy',  value: metrics.gastronomic },
    { label: 'Relaxation',  value: metrics.relaxation },
    { label: 'Fun',         value: metrics.fun },
    { label: 'Kids Fun',    value: metrics.kidsFun },
    { label: 'Family Fit',  value: metrics.familyFriendly },
  ];
  const n = axes.length;
  const cx = 100, cy = 105, r = 72;
  const color = accentColor || '#e07b54';

  function polarToXY(angleDeg, radius) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  // Axis lines and labels
  let gridLines = '';
  let labels = '';
  const labelOffset = 14;

  // Grid rings
  let gridRings = '';
  [0.25, 0.5, 0.75, 1.0].forEach(scale => {
    const pts = axes.map((_, i) => {
      const angle = (360 / n) * i;
      const pt = polarToXY(angle, r * scale);
      return `${pt.x},${pt.y}`;
    }).join(' ');
    gridRings += `<polygon points="${pts}" fill="none" stroke="#e0e0e0" stroke-width="${scale === 1.0 ? 1.5 : 0.8}"/>`;
  });

  axes.forEach((axis, i) => {
    const angle = (360 / n) * i;
    const outerPt = polarToXY(angle, r);
    const innerPt = polarToXY(angle, 0);
    gridLines += `<line x1="${innerPt.x.toFixed(1)}" y1="${innerPt.y.toFixed(1)}" x2="${outerPt.x.toFixed(1)}" y2="${outerPt.y.toFixed(1)}" stroke="#e0e0e0" stroke-width="0.8"/>`;

    const labelPt = polarToXY(angle, r + labelOffset);
    const anchor = labelPt.x < cx - 5 ? 'end' : labelPt.x > cx + 5 ? 'start' : 'middle';
    labels += `<text x="${labelPt.x.toFixed(1)}" y="${(labelPt.y + 3).toFixed(1)}" text-anchor="${anchor}" font-size="9" fill="#666" font-family="system-ui,sans-serif">${axis.label}</text>`;
  });

  // Data polygon
  const dataPoints = axes.map((axis, i) => {
    const angle = (360 / n) * i;
    const val = Math.max(0, Math.min(10, axis.value));
    const pt = polarToXY(angle, r * (val / 10));
    return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  }).join(' ');

  // Dot at each vertex
  let dots = '';
  axes.forEach((axis, i) => {
    const angle = (360 / n) * i;
    const val = Math.max(0, Math.min(10, axis.value));
    const pt = polarToXY(angle, r * (val / 10));
    dots += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="3" fill="${color}" stroke="white" stroke-width="1.5"/>`;
  });

  return `<svg viewBox="0 0 200 210" width="200" height="210" xmlns="http://www.w3.org/2000/svg">
    ${gridRings}
    ${gridLines}
    <polygon points="${dataPoints}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${dots}
    ${labels}
  </svg>`;
}

// Tooltip descriptions for each metric bar label
const METRIC_TOOLTIPS = {
  'Family Fit':   'How suitable this day is for your party — influenced by kids-friendly ratings, museum density, and drive time',
  'Cultural':     'Cultural richness of the day — monuments, museums, and historic sites',
  'Gastronomic':  'Food & drink experience — restaurants, local cuisine, markets, and bars',
  'Relaxation':   'How restful the day is — beaches, parks, and nature outweigh heavy sightseeing',
  'Fun':          'Overall enjoyment factor — entertainment, variety, and spontaneity',
  'Kids Fun':     'Fun specifically for the kids in your party — playgrounds, beaches, and kid-rated activities',
  'Logistics':    'Smoothness of the day — higher is better; penalised by transfers, bookings, and friction',
};

// ─── Metric Bar HTML ───────────────────────────────────────────
function renderMetricBar(icon, label, value, inverted) {
  const displayVal = inverted ? value : value;
  const pct = Math.max(0, Math.min(100, displayVal * 10));
  let color;
  if      (displayVal >= 7)  color = '#27ae60';
  else if (displayVal >= 5)  color = '#2980b9';
  else if (displayVal >= 3)  color = '#f39c12';
  else                        color = '#e74c3c';
  const tooltip = METRIC_TOOLTIPS[label] || label;
  return `<div class="metric-bar-row" title="${tooltip}: ${displayVal.toFixed(1)}/10">
    <span class="metric-bar-icon">${icon}</span>
    <span class="metric-bar-label">${label}</span>
    <div class="metric-bar-track">
      <div class="metric-bar-fill" style="width:${pct.toFixed(1)}%;background:${color};"></div>
    </div>
    <span class="metric-bar-score">${displayVal.toFixed(1)}</span>
  </div>`;
}

// ─── Day Metrics UI ────────────────────────────────────────────
function renderDayMetricsUI(dayIndex, routeDistKm) {
  const metrics = calcDayMetrics(dayIndex, routeDistKm);
  if (!metrics) return;

  const tirednessLevelClass = metrics.tiredness.level.toLowerCase();
  const accentColor = getDayColor(dayIndex);

  const fuelHtml = metrics.cost.fuel > 0
    ? `<div class="cost-item"><span class="cost-item-label">Fuel</span><span class="cost-item-value">€${metrics.cost.fuel.toFixed(0)}</span></div>`
    : '';
  const accCostHtml = metrics.cost.acc > 0
    ? `<div class="cost-item"><span class="cost-item-label">Accommodation</span><span class="cost-item-value">€${metrics.cost.acc.toFixed(0)}</span></div>`
    : '';

  const suggestionsHtml = metrics.suggestions.length > 0
    ? `<div class="suggestions-list">${metrics.suggestions.map(s => {
        const typeIcon = s.type === 'warning' ? '⚠️' : s.type === 'tip' ? '💡' : '✅';
        const addBtn = s.poiId ? ` <button class="suggestion-add-btn" onclick="App.addPoi('${s.poiId}')">Add</button>` : '';
        return `<div class="suggestion suggestion-${s.type}">${typeIcon} ${esc(s.text)}${addBtn}</div>`;
      }).join('')}</div>`
    : '';

  const partyDesc = parsePartyDescription(State.partyConfig);
  const kidsAges = State.partyConfig.filter(a => a < 16);
  const kidsStr = kidsAges.length > 0 ? ` (ages ${kidsAges.join(', ')})` : '';

  const html = `
    <div class="metrics-row-main">
      <div class="metric-pill cost-pill" title="Estimated day cost: entries €${metrics.cost.poi.toFixed(0)} + meals €${metrics.cost.meals.toFixed(0)}${metrics.cost.fuel > 0 ? ` + fuel €${metrics.cost.fuel.toFixed(0)}` : ''}${metrics.cost.acc > 0 ? ` + accommodation €${metrics.cost.acc.toFixed(0)}` : ''}">💰 €${metrics.cost.total.toFixed(0)}</div>
      <div class="metric-pill tiredness-pill tiredness-${tirednessLevelClass}" title="Tiredness: ${metrics.tiredness.norm.toFixed(1)}/10 — based on walking distance, activity durations, and ages in your party">😓 ${metrics.tiredness.level}</div>
      <div class="metric-pill overall-pill" title="Overall day score: ${metrics.overall.toFixed(1)}/10 — weighted average of family fit, culture, food, relaxation, fun, and logistics">⭐ ${metrics.overall.toFixed(1)}/10</div>
    </div>
    <div class="party-info-line">
      👨‍👩‍👧‍👦 ${esc(partyDesc)}${esc(kidsStr)} · <a href="#" onclick="event.preventDefault();App.openSettingsModal()" class="party-settings-link">Settings</a>
    </div>
    <details class="metrics-details">
      <summary title="Expand to see cost breakdown, score bars, radar chart, and suggestions">📊 Day Analysis</summary>
      <div class="metrics-details-inner">
        <div class="metric-section">
          <div class="metric-section-title">💰 Estimated Cost</div>
          <div class="cost-breakdown">
            <div class="cost-item"><span class="cost-item-label">Entries</span><span class="cost-item-value">€${metrics.cost.poi.toFixed(0)}</span></div>
            <div class="cost-item"><span class="cost-item-label">Meals</span><span class="cost-item-value">€${metrics.cost.meals.toFixed(0)}</span></div>
            ${fuelHtml}
            ${accCostHtml}
            <div class="cost-item cost-total"><span class="cost-item-label">Total</span><span class="cost-item-value">€${metrics.cost.total.toFixed(0)}</span></div>
          </div>
        </div>
        <div class="metric-section">
          <div class="metric-section-title">📈 Day Scores</div>
          <div class="metric-bars">
            ${renderMetricBar('👨‍👩‍👧', 'Family Fit', metrics.familyFriendly)}
            ${renderMetricBar('🏛️', 'Cultural', metrics.cultural)}
            ${renderMetricBar('🍽️', 'Gastronomic', metrics.gastronomic)}
            ${renderMetricBar('🛋️', 'Relaxation', metrics.relaxation)}
            ${renderMetricBar('🎉', 'Fun', metrics.fun)}
            ${renderMetricBar('🧒', 'Kids Fun', metrics.kidsFun)}
            ${renderMetricBar('🔧', 'Logistics', 10 - metrics.logisticalFriction, true)}
          </div>
        </div>
        <div class="radar-chart-container">
          ${renderRadarChartSVG(metrics, accentColor)}
        </div>
        ${suggestionsHtml}
      </div>
    </details>
  `;

  document.querySelectorAll('.day-metrics-widget').forEach(el => {
    el.innerHTML = html;
  });
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

  // Custom marker mode: click on map to drop a pin
  State.map.on('click', e => {
    if (!State.customMarkerMode) return;
    State.pendingMarkerLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
    disableCustomMarkerMode();
    openCustomMarkerModal(e.latlng.lat, e.latlng.lng);
  });
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
    if (poi.source === 'imported' && !State.layers.showUser) return;
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
    const { lat: aLat, lng: aLng } = getAccCoords(acc);
    const m = L.marker([aLat, aLng], { icon: makeAccIcon() })
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
    renderDayMetricsUI(dayIndex, 0);
    return;
  }

  const result = await fetchRoute(waypoints, State.layers.routeMode);
  if (!result) {
    updateRouteSummaryUI(null);
    renderDayMetricsUI(dayIndex, 0);
    return;
  }
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
  // Update metrics with actual walking/driving distance
  renderDayMetricsUI(dayIndex, result.distKm);
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
  return acc ? getAccCoords(acc) : null;
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

  const accCardHtml = (acc, label) => {
    if (!acc) return '';
    const edit = State.accEdits[acc.id] || {};
    const displayName = edit.name || acc.name;
    const displayNotes = edit.notes !== undefined ? edit.notes : (acc.notes || '');
    const priceStr = edit.pricePerNight ? ` · €${parseFloat(edit.pricePerNight).toFixed(0)}/night` : '';
    return `
    <div class="acc-card">
      <div class="acc-icon">🏨</div>
      <div class="acc-info">
        <div class="acc-name">${label ? `<span class="text-xs text-secondary">${label} — </span>` : ''}${esc(displayName)}</div>
        <div class="acc-note">${esc(displayNotes)}${priceStr}</div>
      </div>
      <button class="btn-icon btn-edit-sm acc-edit-btn" onclick="App.openAccEditModal('${acc.id}')" title="Edit accommodation">✏️</button>
    </div>`;
  };

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

    <div class="day-metrics-widget"></div>

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
        <div class="add-more-title">Add places</div>
        <div class="add-more-toggle">▼</div>
      </div>
      <div class="add-more-list" style="display:none">

        <!-- Search -->
        <div class="discover-search-wrap">
          <input class="poi-search-input" type="text" placeholder="🔍 Search for a place…"
            oninput="App.searchPois(this, ${dayIndex})">
        </div>
        <div class="search-results-host"></div>

        ${day.driving ? `
        <!-- Along the route -->
        <div class="discover-group">
          <div class="discover-group-label">
            🛣️ Along the route
            <button class="discover-load-btn" onclick="App.discoverAlongRoute(${dayIndex})">Load</button>
          </div>
          <div class="route-discover-results"></div>
        </div>` : ''}

        <!-- Nearby -->
        <div class="discover-group">
          <div class="discover-group-label">
            📍 Nearby · ${State.settings.discoveryRadius}km
            <button class="discover-load-btn" onclick="App.discoverNearby(${dayIndex})">Load</button>
          </div>
          <div class="nearby-discover-results"></div>
        </div>

        ${available.length > 0 ? `
        <!-- Trip suggestions -->
        <div class="discover-group">
          <div class="discover-group-label">💡 Suggested</div>
          ${addMoreHtml}
        </div>` : ''}

      </div>
    </div>
    <div style="height:24px"></div>
  `;

  document.querySelectorAll('.plan-content-host').forEach(el => {
    el.innerHTML = contentHtml;
    initDragDrop(el.querySelector('.poi-list'), dayIndex);
    initTouchDrag(el.querySelector('.poi-list'), dayIndex);
  });

  // Render day metrics (walkKm = 0 initially; updated after route loads)
  renderDayMetricsUI(dayIndex, 0);

  // Re-use cached route summary if available
  if (State.lastRouteResult) {
    updateRouteSummaryUI(State.lastRouteResult);
    const routeDistKm = State.lastRouteResult.distKm;
    renderDayMetricsUI(dayIndex, routeDistKm);
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
      <button class="btn-icon btn-edit" onclick="App.openPoiEditModal('${poiId}')" title="Edit">✏️</button>
      <button class="btn-icon btn-detail" onclick="App.openDetail('${poiId}')" title="Details">ℹ</button>
      ${isBooked ? '' : `<button class="btn-icon btn-remove" onclick="App.removePoi('${poiId}')" title="Remove">✕</button>`}
    </div>
  </div>`;
}

function buildAddCardHtml(poi) {
  const cat = CATEGORIES[poi.category] || CATEGORIES.monument;
  const icon = poi.emoji || cat.icon;
  return `<div class="add-poi-card">
    <div class="add-poi-icon">${icon}</div>
    <div class="add-poi-info" onclick="App.addPoi('${poi.id}')">
      <div class="add-poi-name">${esc(poi.name)}${poi.confirmedBooking ? ' ⭐' : ''}</div>
      <div class="add-poi-meta">${poi.duration}h · ${poi.costLabel || 'Free'} · ${getKidsHtml(poi.kidsRating)}</div>
    </div>
    <button class="btn-icon btn-edit-sm" onclick="App.openPoiEditModal('${poi.id}')" title="Edit">✏️</button>
    <button class="btn-add-poi" onclick="App.addPoi('${poi.id}')">+</button>
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
    poi.source === 'imported' ? '<span class="badge badge-category">📥 Imported</span>' : '',
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
        ${getStarsHtml(poi.rating || 3)}
        <span class="rating-count">${poi.rating || '?'} (${(poi.ratingCount ?? 0).toLocaleString()} reviews)</span>
      </div>
      <div class="detail-stats">
        <div class="detail-stat">
          <div class="detail-stat-icon">💰</div>
          <div class="detail-stat-value">${poi.costLabel || 'Free'}</div>
          <div class="detail-stat-label">${poi.cost > 0 ? `€${poi.cost}/person` : 'Free entry'}</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-icon">⏱️</div>
          <div class="detail-stat-value">${poi.duration}h</div>
          <div class="detail-stat-label">Duration</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-icon">🧒</div>
          <div class="detail-stat-value">${poi.kidsRating || poi.kidsFriendly || '?'}/5</div>
          <div class="detail-stat-label">Kid-friendly</div>
        </div>
      </div>
      <div class="detail-section-title">Description</div>
      <div class="detail-desc">${esc(poi.description || '')}</div>
      <div class="detail-section-title">Opening Hours</div>
      <div class="detail-hours">🕐 ${esc(poi.openingHours || 'Check locally')}</div>
      ${notesHtml}
    </div>
    <div class="detail-footer">
      ${planBtnHtml}
      <a href="${esc(poi.gmapsUrl || '#')}" target="_blank" rel="noopener" style="display:block;">
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

// ─── Settings Modal ────────────────────────────────────────────
function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;

  const partyInput = document.getElementById('settings-party');
  const fuelInput = document.getElementById('settings-fuel');
  const consumptionInput = document.getElementById('settings-consumption');
  const mealInput = document.getElementById('settings-meal');

  if (partyInput) partyInput.value = State.partyConfig.join(', ');
  if (fuelInput) fuelInput.value = State.settings.fuelPrice;
  if (consumptionInput) consumptionInput.value = State.settings.carConsumption;
  if (mealInput) mealInput.value = State.settings.dailyMealBudget;
  const radInput  = document.getElementById('settings-radius');
  const routeRadInput = document.getElementById('settings-route-radius');
  if (radInput) radInput.value = State.settings.discoveryRadius;
  if (routeRadInput) routeRadInput.value = State.settings.routeDiscoveryRadius;

  updatePartyPreview();
  modal.classList.remove('hidden');
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
}

function updatePartyPreview() {
  const input = document.getElementById('settings-party');
  const preview = document.getElementById('party-preview');
  if (!input || !preview) return;

  const raw = input.value;
  const ages = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0);
  if (ages.length === 0) {
    preview.textContent = 'Enter valid ages separated by commas';
    return;
  }
  preview.textContent = parsePartyDescription(ages);
}

function saveSettings() {
  const partyInput = document.getElementById('settings-party');
  const fuelInput = document.getElementById('settings-fuel');
  const consumptionInput = document.getElementById('settings-consumption');
  const mealInput = document.getElementById('settings-meal');

  if (partyInput) {
    const ages = partyInput.value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0);
    if (ages.length > 0) State.partyConfig = ages;
  }
  if (fuelInput) State.settings.fuelPrice = parseFloat(fuelInput.value) || 1.70;
  if (consumptionInput) State.settings.carConsumption = parseFloat(consumptionInput.value) || 7.5;
  if (mealInput) State.settings.dailyMealBudget = parseFloat(mealInput.value) || 22;
  const radInput = document.getElementById('settings-radius');
  const routeRadInput = document.getElementById('settings-route-radius');
  if (radInput) State.settings.discoveryRadius = parseFloat(radInput.value) || 5;
  if (routeRadInput) State.settings.routeDiscoveryRadius = parseFloat(routeRadInput.value) || 3;

  Storage.saveParty();
  Storage.saveSettings();
  closeSettingsModal();
  renderDayMetricsUI(State.selectedDayIndex, State.lastRouteResult?.distKm || 0);
  showToast('Settings saved');
}

// ─── Trip Overview Modal ───────────────────────────────────────
function openTripOverviewModal() {
  const modal = document.getElementById('trip-overview-modal');
  if (!modal) return;

  const tripMetrics = calcTripMetrics();
  if (!tripMetrics) return;

  const content = document.getElementById('trip-overview-content');
  if (!content) return;

  const bestDay = getDay(tripMetrics.bestDayIdx);
  const worstDay = getDay(tripMetrics.worstDayIdx);
  const accentColor = State.trip?.coverColor || '#e07b54';

  const suggestionsHtml = tripMetrics.suggestions.length > 0
    ? `<div class="suggestions-list">${tripMetrics.suggestions.map(s => {
        const typeIcon = s.type === 'warning' ? '⚠️' : s.type === 'tip' ? '💡' : '✅';
        return `<div class="suggestion suggestion-${s.type}">${typeIcon} ${esc(s.text)}</div>`;
      }).join('')}</div>`
    : '';

  const overviewMetrics = {
    cultural: tripMetrics.avgCultural,
    gastronomic: tripMetrics.avgGastronomic,
    relaxation: tripMetrics.avgRelaxation,
    fun: tripMetrics.avgFun,
    kidsFun: tripMetrics.avgKidsFun,
    familyFriendly: tripMetrics.avgFamilyFriendly,
  };

  content.innerHTML = `
    <div class="metric-section">
      <div class="metric-section-title">💰 Total Estimated Budget</div>
      <div class="trip-budget-total">€${tripMetrics.totalCost.toFixed(0)}</div>
    </div>
    <div class="metric-section">
      <div class="metric-section-title">📈 Trip Averages</div>
      <div class="metric-bars">
        ${renderMetricBar('👨‍👩‍👧', 'Family Fit', tripMetrics.avgFamilyFriendly)}
        ${renderMetricBar('🏛️', 'Cultural', tripMetrics.avgCultural)}
        ${renderMetricBar('🍽️', 'Gastronomic', tripMetrics.avgGastronomic)}
        ${renderMetricBar('🛋️', 'Relaxation', tripMetrics.avgRelaxation)}
        ${renderMetricBar('🎉', 'Fun', tripMetrics.avgFun)}
        ${renderMetricBar('🧒', 'Kids Fun', tripMetrics.avgKidsFun)}
        ${renderMetricBar('🔧', 'Logistics', 10 - tripMetrics.avgLogisticalFriction, true)}
      </div>
    </div>
    <div class="radar-chart-container">
      ${renderRadarChartSVG(overviewMetrics, accentColor)}
    </div>
    <div class="metric-section">
      <div class="metric-section-title">🏆 Highlights</div>
      <div class="day-highlights">
        <div class="day-highlight best">
          <span class="day-highlight-icon">🌟</span>
          <div>
            <div class="day-highlight-label">Best Day</div>
            <div class="day-highlight-name">${bestDay ? esc(bestDay.label) : '—'}</div>
            <div class="day-highlight-score">${(tripMetrics.allMetrics[tripMetrics.bestDayIdx]?.overall || 0).toFixed(1)}/10</div>
          </div>
        </div>
        <div class="day-highlight worst">
          <span class="day-highlight-icon">📌</span>
          <div>
            <div class="day-highlight-label">Needs Work</div>
            <div class="day-highlight-name">${worstDay ? esc(worstDay.label) : '—'}</div>
            <div class="day-highlight-score">${(tripMetrics.allMetrics[tripMetrics.worstDayIdx]?.overall || 0).toFixed(1)}/10</div>
          </div>
        </div>
      </div>
    </div>
    ${suggestionsHtml}
  `;

  modal.classList.remove('hidden');
}

function closeTripOverviewModal() {
  const modal = document.getElementById('trip-overview-modal');
  if (modal) modal.classList.add('hidden');
}

// ─── Import Modal ──────────────────────────────────────────────
function openImportModal() {
  const modal = document.getElementById('import-modal');
  if (!modal) return;
  const ta = document.getElementById('import-json');
  if (ta) ta.value = '';
  const preview = document.getElementById('import-preview');
  if (preview) preview.innerHTML = '';
  modal.classList.remove('hidden');
}

function closeImportModal() {
  const modal = document.getElementById('import-modal');
  if (modal) modal.classList.add('hidden');
}

// ─── Accommodation Edit Modal ───────────────────────────────────
function openAccEditModal(accId) {
  const acc = State.trip?.accommodations.find(a => a.id === accId);
  if (!acc) return;
  const edit = State.accEdits[accId] || {};
  const { lat, lng } = getAccCoords(acc);
  document.getElementById('ae-acc-id').value = accId;
  document.getElementById('ae-lat').value = lat;
  document.getElementById('ae-lng').value = lng;
  document.getElementById('ae-name').value = edit.name ?? acc.name;
  document.getElementById('ae-notes').value = edit.notes !== undefined ? edit.notes : (acc.notes || '');
  document.getElementById('ae-price').value = edit.pricePerNight ?? '';
  document.getElementById('ae-search').value = '';
  document.getElementById('ae-search-results').innerHTML = '';
  const badge = document.getElementById('ae-location-badge');
  if (edit.locationLabel) {
    badge.textContent = '📍 ' + edit.locationLabel;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
  document.getElementById('acc-edit-modal').classList.remove('hidden');
}

function closeAccEditModal() {
  document.getElementById('acc-edit-modal').classList.add('hidden');
}

let _aeSearchTimer = null;
function accLocationSearch(inputEl) {
  clearTimeout(_aeSearchTimer);
  const q = inputEl.value.trim();
  const resultsEl = document.getElementById('ae-search-results');
  if (q.length < 2) { resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = '<div class="ae-search-loading">🔍 Searching…</div>';
  _aeSearchTimer = setTimeout(async () => {
    try {
      // Search globally for lodging/accommodations — no bounded restriction
      const params = new URLSearchParams({
        format: 'json', limit: '6', q, addressdetails: '1',
        featuretype: 'settlement',
      });
      const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`,
        { headers: { 'Accept-Language': 'en' } });
      const results = r.ok ? await r.json() : [];
      if (!results.length) { resultsEl.innerHTML = '<div class="ae-search-empty">No results</div>'; return; }
      resultsEl.innerHTML = results.map(r => {
        const name = r.name || r.display_name.split(',')[0];
        const addr = r.display_name.split(',').slice(1, 3).join(',').trim();
        return `<div class="ae-search-result" onclick="App.selectAccLocation(${r.lat}, ${r.lon}, '${esc(name)}', '${esc(addr)}')">
          <span class="ae-result-name">${esc(name)}</span>
          <span class="ae-result-addr">${esc(addr)}</span>
        </div>`;
      }).join('');
    } catch { resultsEl.innerHTML = '<div class="ae-search-empty">Search failed</div>'; }
  }, 450);
}

function selectAccLocation(lat, lng, name, addr) {
  document.getElementById('ae-lat').value = lat;
  document.getElementById('ae-lng').value = lng;
  // Pre-fill name if still default
  const nameEl = document.getElementById('ae-name');
  const accId = document.getElementById('ae-acc-id').value;
  const acc = State.trip?.accommodations.find(a => a.id === accId);
  if (acc && nameEl.value === acc.name) nameEl.value = name;
  const label = name + (addr ? ', ' + addr : '');
  const badge = document.getElementById('ae-location-badge');
  badge.textContent = '📍 ' + label;
  badge.style.display = '';
  document.getElementById('ae-search').value = '';
  document.getElementById('ae-search-results').innerHTML = '';
  // Store label for re-opening
  if (!State._aePendingLabel) State._aePendingLabel = {};
  State._aePendingLabel[accId] = label;
}

function saveAccEdit() {
  const accId = document.getElementById('ae-acc-id').value;
  if (!accId) return;
  const lat = parseFloat(document.getElementById('ae-lat').value);
  const lng = parseFloat(document.getElementById('ae-lng').value);
  const acc = State.trip?.accommodations.find(a => a.id === accId);
  const origCoords = acc ? { lat: acc.lat, lng: acc.lng } : null;
  // Only store lat/lng if they differ from the original
  const coordsChanged = origCoords && (Math.abs(lat - origCoords.lat) > 0.0001 || Math.abs(lng - origCoords.lng) > 0.0001);
  State.accEdits[accId] = {
    name: document.getElementById('ae-name').value.trim(),
    notes: document.getElementById('ae-notes').value.trim(),
    pricePerNight: parseFloat(document.getElementById('ae-price').value) || 0,
    ...(coordsChanged ? { lat, lng } : {}),
    ...(State._aePendingLabel?.[accId] ? { locationLabel: State._aePendingLabel[accId] } : {}),
  };
  Storage.saveAccEdits(State.trip.id);
  closeAccEditModal();
  placeMarkers();
  renderAll();
  renderDayMetricsUI(State.selectedDayIndex, State.lastRouteResult?.distKm || 0);
  showToast('Accommodation updated');
}

function findNearestDestination(lat, lng) {
  if (!State.trip) return null;
  let nearest = null;
  let minDist = Infinity;
  State.trip.accommodations.forEach(acc => {
    const { lat: aLat, lng: aLng } = getAccCoords(acc);
    const d = haversineKm(lat, lng, aLat, aLng);
    if (d < minDist) { minDist = d; nearest = acc; }
  });
  return nearest;
}

// Returns effective lat/lng for an accommodation, respecting any user edits
function getAccCoords(acc) {
  const edit = State.accEdits?.[acc.id] || {};
  return {
    lat: edit.lat ?? acc.lat,
    lng: edit.lng ?? acc.lng,
  };
}

// ─── Custom Marker (drop-a-pin) ────────────────────────────────

function enableCustomMarkerMode() {
  if (!State.trip) { showToast('Load a trip first'); return; }
  State.customMarkerMode = true;
  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.style.cursor = 'crosshair';
  document.getElementById('btn-add-marker')?.classList.add('active');
  showToast('Click anywhere on the map to drop a pin', 3000);
}

function disableCustomMarkerMode() {
  State.customMarkerMode = false;
  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.style.cursor = '';
  document.getElementById('btn-add-marker')?.classList.remove('active');
}

function openCustomMarkerModal(lat, lng) {
  let modal = document.getElementById('custom-marker-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'custom-marker-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  // Build day options
  const dayOpts = (State.trip?.days || []).map((d, i) =>
    `<option value="${esc(d.date)}"${i === State.selectedDayIndex ? ' selected' : ''}>${esc(d.label)} (${formatShortDate(d.date)})</option>`
  ).join('');

  // Build category options
  const catOpts = Object.entries(CATEGORIES).map(([k, v]) =>
    `<option value="${k}">${v.icon} ${v.label}</option>`
  ).join('');

  modal.innerHTML = `
    <div class="modal-panel custom-marker-panel">
      <div class="modal-header">
        <span class="modal-title">📍 Add Custom Place</span>
        <button class="modal-close-btn" onclick="App.closeCustomMarkerModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="cm-coords">📌 ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
        <div class="settings-field">
          <label class="settings-label">Name *</label>
          <input id="cm-name" type="text" class="settings-input" placeholder="e.g. Hidden viewpoint" autocomplete="off">
        </div>
        <div class="cm-row">
          <div class="settings-field" style="flex:1">
            <label class="settings-label">Category</label>
            <select id="cm-category" class="settings-input">${catOpts}</select>
          </div>
          <div class="settings-field" style="width:80px">
            <label class="settings-label">Emoji</label>
            <input id="cm-emoji" type="text" class="settings-input" placeholder="📍" maxlength="4" style="text-align:center;font-size:18px;">
          </div>
        </div>
        <div class="settings-field">
          <label class="settings-label">Notes</label>
          <input id="cm-notes" type="text" class="settings-input" placeholder="Any notes…" autocomplete="off">
        </div>
        <div class="cm-row">
          <div class="settings-field" style="flex:1">
            <label class="settings-label">Cost</label>
            <select id="cm-cost" class="settings-input">
              <option value="free">Free</option>
              <option value="€">€ (budget)</option>
              <option value="€€" selected>€€ (moderate)</option>
              <option value="€€€">€€€ (splurge)</option>
            </select>
          </div>
          <div class="settings-field" style="flex:1">
            <label class="settings-label">Add to day</label>
            <select id="cm-day" class="settings-input">
              <option value="">— Don't add yet —</option>
              ${dayOpts}
            </select>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" onclick="App.closeCustomMarkerModal()">Cancel</button>
        <button class="modal-btn modal-btn-save" onclick="App.saveCustomMarker(${lat}, ${lng})">Add Place</button>
      </div>
    </div>`;
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('cm-name')?.focus(), 50);
}

function closeCustomMarkerModal() {
  document.getElementById('custom-marker-modal')?.classList.add('hidden');
  State.pendingMarkerLatLng = null;
}

function saveCustomMarker(lat, lng) {
  const name = document.getElementById('cm-name')?.value.trim();
  if (!name) { showToast('Please enter a name'); return; }

  const category = document.getElementById('cm-category')?.value || 'monument';
  const emoji    = document.getElementById('cm-emoji')?.value.trim() || null;
  const notes    = document.getElementById('cm-notes')?.value.trim() || '';
  const costLabel = document.getElementById('cm-cost')?.value || '€€';
  const dayDate  = document.getElementById('cm-day')?.value || null;

  const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();

  // Find nearest destination for availableDays
  const nearestAcc = findNearestDestination(lat, lng);
  const availableDays = nearestAcc
    ? nearestAcc.days
    : (State.trip?.days.map(d => d.date) || []);

  const poi = {
    id,
    name,
    category,
    source: 'custom',
    lat, lng,
    description: notes || `Custom marker added at ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    rating: null,
    ratingCount: 0,
    cost: costLabel === 'free' ? 'free' : costLabel,
    costAmount: 0,
    costLabel,
    duration: 1,
    energyCost: 2,
    kidsFriendly: 3,
    openingHours: '',
    gmapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    availableDays,
    tags: ['custom'],
    ...(emoji ? { emoji } : {}),
  };

  // Add to trip pois
  State.trip.pois.push(poi);
  // Persist with imported pois
  State.importedPois.push(poi);
  Storage.saveImported(State.trip.id);

  // Optionally add to a day's plan
  if (dayDate && State.plan[dayDate] !== undefined) {
    State.plan[dayDate].push(id);
    Storage.save();
  }

  closeCustomMarkerModal();
  placeMarkers();
  renderAll();
  showToast(`"${name}" added to the map`);
}

// ─── POI Search (Nominatim) ─────────────────────────────────────

let _searchTimer = null;

function searchPois(inputEl, dayIndex) {
  const q = inputEl.value.trim();
  const list = inputEl.closest('.add-more-list');
  const resultsEl = list?.querySelector('.search-results-host');
  if (!resultsEl) return;
  clearTimeout(_searchTimer);
  if (q.length < 2) { resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = '<div class="discover-loading">🔍 Searching…</div>';
  _searchTimer = setTimeout(async () => {
    const results = await nominatimSearch(q, dayIndex);
    if (!results?.length) {
      resultsEl.innerHTML = '<div class="discover-empty">No results found</div>';
      return;
    }
    resultsEl.innerHTML = results.map(r => buildSearchResultHtml(r, dayIndex)).join('');
  }, 450);
}

async function nominatimSearch(query, dayIndex) {
  const day = getDay(dayIndex);
  const acc = State.trip?.accommodations.find(a => a.days.includes(day?.date));
  const { lat, lng } = acc ? getAccCoords(acc) : {};
  const delta = 1.2; // ~130 km radius
  try {
    const params = new URLSearchParams({
      format: 'json', limit: '8', q: query, addressdetails: '1', extratags: '1',
      ...(lat && lng ? { viewbox: `${lng-delta},${lat+delta},${lng+delta},${lat-delta}`, bounded: '1' } : {}),
    });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`,
      { signal: ctrl.signal, headers: { 'Accept-Language': 'en' } });
    clearTimeout(t);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

function nominatimCategoryMap(type, cls) {
  const m = {
    museum: 'museum', attraction: 'monument', viewpoint: 'monument', artwork: 'monument',
    gallery: 'museum', zoo: 'entertainment', theme_park: 'entertainment', aquarium: 'entertainment',
    restaurant: 'food', bar: 'bar', cafe: 'food', pub: 'bar', fast_food: 'food',
    park: 'park', garden: 'park', beach: 'beach', stadium: 'entertainment',
    castle: 'monument', ruins: 'monument', monument: 'monument', church: 'monument',
    palace: 'monument', cliff: 'nature', peak: 'nature', cave_entrance: 'cave',
  };
  return m[type] || m[cls] || 'monument';
}

// Cache discovered results by key so data-attribute delegation works safely
// (avoids any inline-onclick escaping issues)
const _discCache = new Map();

function buildDiscoveredCardHtml(lat, lng, name, category, subtitle, dayIndex, osmTags) {
  const cat = CATEGORIES[category] || CATEGORIES.monument;
  const key = `${lat.toFixed(6)},${lng.toFixed(6)},${Date.now()},${Math.random()}`;
  _discCache.set(key, { lat, lng, name, category, dayIndex, osmTags: osmTags || {} });
  // Keep cache tidy
  if (_discCache.size > 300) _discCache.delete(_discCache.keys().next().value);

  // Mini meta from OSM tags
  const t = osmTags || {};

  // Star rating: prefer Michelin stars, fall back to hotel/venue stars tag
  let starHtml = '';
  if (t['michelin:stars']) {
    const n = Math.min(+t['michelin:stars'], 3);
    starHtml = `<span class="disc-stars" title="Michelin ${n}★">${'★'.repeat(n)}<span class="disc-stars-label"> Michelin</span></span>`;
  } else if (t.stars) {
    const n = Math.min(+t.stars, 5);
    starHtml = `<span class="disc-stars" title="${n} stars">${'★'.repeat(n)}${'☆'.repeat(5-n)}</span>`;
  }

  const bits = [
    t.cuisine       ? t.cuisine.split(';')[0].replace(/_/g,' ') : null,
    t.opening_hours ? `🕐 ${t.opening_hours.split(';')[0]}`     : null,
    t.wheelchair === 'yes' ? '♿' : null,
  ].filter(Boolean);

  return `<div class="add-poi-card search-result-card">
    <div class="add-poi-icon">${cat.icon}</div>
    <div class="add-poi-info">
      <div class="add-poi-name">${esc(name)} ${starHtml}</div>
      ${subtitle ? `<div class="add-poi-meta disc-subtitle">${esc(subtitle)}</div>` : ''}
      ${bits.length ? `<div class="disc-osm-tags">${bits.map(b => `<span>${esc(b)}</span>`).join('')}</div>` : ''}
    </div>
    <button class="btn-add-poi disc-add-btn" data-disc-key="${esc(key)}" title="Add to day">+</button>
  </div>`;
}

function buildSearchResultHtml(result, dayIndex) {
  const name = result.name || result.display_name?.split(',')[0] || 'Unknown place';
  const address = result.display_name?.split(',').slice(1, 3).join(',').trim() || '';
  const category = nominatimCategoryMap(result.type, result.class);
  const tags = result.extratags || {};
  return buildDiscoveredCardHtml(parseFloat(result.lat), parseFloat(result.lon),
    name, category, address, dayIndex, tags);
}

function addDiscoveredResult(lat, lng, name, category, dayIndex, osmTags) {
  if (!State.trip) return;
  const day = getDay(dayIndex);
  if (!day) return;
  const t = osmTags || {};
  const id = 'disc-' + name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,25) + '-' + Date.now();
  const nearestAcc = findNearestDestination(lat, lng);
  const descParts = [
    t.cuisine      ? `Cuisine: ${t.cuisine.replace(/_/g,' ')}` : null,
    t.opening_hours? `Hours: ${t.opening_hours}`               : null,
    t.website      ? `Website: ${t.website}`                   : null,
  ].filter(Boolean);
  const poi = {
    id, name, category, source: 'discovered', lat, lng,
    description: descParts.join(' · ') || 'Discovered via search/nearby',
    rating: t.stars ? Math.min(parseFloat(t.stars), 5) : null,
    ratingCount: 0, cost: 'free', costAmount: 0, costLabel: '?',
    duration: 1, energyCost: 2, kidsFriendly: 3,
    openingHours: t.opening_hours || '',
    gmapsUrl: `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat},${lng},17z`,
    availableDays: nearestAcc?.days || [day.date],
    tags: ['discovered'],
  };
  State.trip.pois.push(poi);
  State.importedPois.push(poi);
  Storage.saveImported(State.trip.id);
  if (State.plan[day.date] !== undefined) { State.plan[day.date].push(id); Storage.save(); }
  placeMarkers(); renderAll();
  showToast(`"${name}" added`);
}

// ─── Discover Nearby (Overpass API) ────────────────────────────

async function overpassQuery(lat, lng, radiusM) {
  const q = `[out:json][timeout:15];
(node["tourism"~"^(museum|attraction|viewpoint|artwork|gallery|zoo|theme_park)$"](around:${radiusM},${lat},${lng});
 node["amenity"~"^(restaurant|bar|cafe|pub)$"]["name"](around:${radiusM},${lat},${lng});
 node["leisure"~"^(park|garden|beach)$"]["name"](around:${radiusM},${lat},${lng});
 node["historic"~"^(castle|ruins|monument|building|church|palace|memorial)$"]["name"](around:${radiusM},${lat},${lng});
 node["natural"~"^(beach|cliff|peak|cave_entrance)$"]["name"](around:${radiusM},${lat},${lng});
);out body;`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ctrl.signal,
    });
    clearTimeout(t);
    return r.ok ? (await r.json()).elements || [] : null;
  } catch { return null; }
}

function renderDiscoverResults(elements, containerSel, anchorLat, anchorLng, dayIndex) {
  const existingNames = new Set(State.trip?.pois.map(p => p.name.toLowerCase()) || []);
  const fresh = (elements || [])
    .filter(e => e.tags?.name && !existingNames.has(e.tags.name.toLowerCase()))
    .slice(0, 15);
  const html = fresh.length
    ? fresh.map(e => {
        const type = e.tags?.tourism || e.tags?.amenity || e.tags?.leisure || e.tags?.historic || e.tags?.natural || 'attraction';
        const cat = nominatimCategoryMap(type, type);
        const dist = anchorLat ? haversineKm(anchorLat, anchorLng, e.lat, e.lon) : null;
        const sub = [type, dist ? formatDist(dist) : null].filter(Boolean).join(' · ');
        return buildDiscoveredCardHtml(e.lat, e.lon, e.tags.name, cat, sub, dayIndex, e.tags);
      }).join('')
    : '<div class="discover-empty">No new places found. Try increasing the radius in settings.</div>';
  document.querySelectorAll(containerSel).forEach(el => { el.innerHTML = html; });
}

async function discoverNearby(dayIndex) {
  const day = getDay(dayIndex);
  const acc = State.trip?.accommodations.find(a => a.days.includes(day?.date));
  if (!acc?.lat && !acc?.lng) { showToast('No coordinates for this day\'s accommodation'); return; }
  document.querySelectorAll('.nearby-discover-results').forEach(el => {
    el.innerHTML = '<div class="discover-loading">🔍 Searching nearby…</div>';
  });
  const radiusM = (State.settings.discoveryRadius || 5) * 1000;
  const { lat: aLat, lng: aLng } = getAccCoords(acc);
  const elements = await overpassQuery(aLat, aLng, radiusM);
  if (!elements) {
    document.querySelectorAll('.nearby-discover-results').forEach(el => {
      el.innerHTML = '<div class="discover-empty">Discovery service unavailable. Try again.</div>';
    });
    return;
  }
  renderDiscoverResults(elements, '.nearby-discover-results', aLat, aLng, dayIndex);
}

async function discoverAlongRoute(dayIndex) {
  const day = getDay(dayIndex);
  if (!day?.driving) return;
  document.querySelectorAll('.route-discover-results').forEach(el => {
    el.innerHTML = '<div class="discover-loading">🔍 Searching along route…</div>';
  });
  // Use route midpoint if available, otherwise midpoint between origin and destination accommodations
  let midLat, midLng;
  const geojsonCoords = State.lastRouteResult?.geojson?.coordinates;
  if (geojsonCoords?.length >= 2) {
    const [mLng, mLat] = geojsonCoords[Math.floor(geojsonCoords.length / 2)];
    midLat = mLat; midLng = mLng;
  } else {
    // Fall back: midpoint between departure and arrival accommodations
    const depAcc = State.trip?.accommodations.find(a =>
      a.location?.toLowerCase().includes(day.driving.from?.toLowerCase()));
    const arrAcc = State.trip?.accommodations.find(a =>
      a.location?.toLowerCase().includes(day.driving.to?.toLowerCase()));
    if (!depAcc || !arrAcc) { showToast('Load the route first for better results'); return; }
    const depCoords = getAccCoords(depAcc);
    const arrCoords = getAccCoords(arrAcc);
    midLat = (depCoords.lat + arrCoords.lat) / 2;
    midLng = (depCoords.lng + arrCoords.lng) / 2;
  }
  const radiusM = (State.settings.routeDiscoveryRadius || 3) * 1000;
  const elements = await overpassQuery(midLat, midLng, radiusM);
  if (!elements) {
    document.querySelectorAll('.route-discover-results').forEach(el => {
      el.innerHTML = '<div class="discover-empty">Discovery service unavailable. Try again.</div>';
    });
    return;
  }
  renderDiscoverResults(elements, '.route-discover-results', midLat, midLng, dayIndex);
}

// ─── POI Edit Modal ─────────────────────────────────────────────

function openPoiEditModal(poiId) {
  const poi = getPoi(poiId);
  if (!poi) return;
  let modal = document.getElementById('poi-edit-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'poi-edit-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  const catOpts = Object.entries(CATEGORIES).map(([k, v]) =>
    `<option value="${k}"${poi.category === k ? ' selected' : ''}>${v.icon} ${v.label}</option>`
  ).join('');
  const currentIcon = poi.emoji || CATEGORIES[poi.category]?.icon || '📍';
  modal.innerHTML = `
    <div class="modal-panel" style="max-width:400px">
      <div class="modal-header">
        <span class="modal-title">✏️ Edit Place</span>
        <button class="modal-close-btn" onclick="document.getElementById('poi-edit-modal').classList.add('hidden')">✕</button>
      </div>
      <div class="modal-body">
        <div class="settings-field">
          <label class="settings-label">Name</label>
          <input id="pe-name" type="text" class="settings-input" value="${esc(poi.name)}" autocomplete="off">
        </div>
        <div class="cm-row" style="align-items:flex-end;gap:10px">
          <div class="settings-field" style="flex:1">
            <label class="settings-label">Category → Icon</label>
            <select id="pe-category" class="settings-input" onchange="App.pePreviewIcon()">${catOpts}</select>
          </div>
          <div class="settings-field" style="width:76px">
            <label class="settings-label">Custom emoji</label>
            <input id="pe-emoji" type="text" class="settings-input"
              value="${esc(poi.emoji || '')}" placeholder="none"
              style="text-align:center;font-size:18px;" maxlength="4"
              oninput="App.pePreviewIcon()">
          </div>
          <div id="pe-icon-preview" style="font-size:30px;padding:4px 6px;line-height:1;align-self:flex-end">
            ${currentIcon}
          </div>
        </div>
        <div class="settings-row-2">
          <div class="settings-field">
            <label class="settings-label">Duration (h)</label>
            <input id="pe-duration" type="number" class="settings-input" min="0.25" step="0.25" value="${poi.duration || 1}">
          </div>
          <div class="settings-field">
            <label class="settings-label">Kids friendly</label>
            <select id="pe-kids" class="settings-input">
              ${[1,2,3,4,5].map(n => `<option value="${n}"${(poi.kidsFriendly||poi.kidsRating||3)===n?' selected':''}>${'🧒'.repeat(n)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="settings-field">
          <label class="settings-label">Notes / description</label>
          <input id="pe-notes" type="text" class="settings-input"
            value="${esc((poi.description || '').slice(0, 200))}" placeholder="Any notes…">
        </div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel"
          onclick="document.getElementById('poi-edit-modal').classList.add('hidden')">Cancel</button>
        <button class="modal-btn modal-btn-save" onclick="App.savePoiEdit('${poiId}')">Save</button>
      </div>
    </div>`;
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('pe-name')?.focus(), 50);
}

function pePreviewIcon() {
  const emoji = document.getElementById('pe-emoji')?.value.trim();
  const cat   = document.getElementById('pe-category')?.value;
  const prev  = document.getElementById('pe-icon-preview');
  if (prev) prev.textContent = emoji || CATEGORIES[cat]?.icon || '📍';
}

function savePoiEdit(poiId) {
  const poi = getPoi(poiId);
  if (!poi) return;
  const name     = document.getElementById('pe-name')?.value.trim();
  const category = document.getElementById('pe-category')?.value;
  const emoji    = document.getElementById('pe-emoji')?.value.trim() || null;
  const duration = parseFloat(document.getElementById('pe-duration')?.value);
  const kids     = parseInt(document.getElementById('pe-kids')?.value, 10);
  const notes    = document.getElementById('pe-notes')?.value.trim();
  if (name) poi.name = name;
  if (category) poi.category = category;
  poi.emoji = emoji;
  if (!isNaN(duration)) poi.duration = duration;
  if (!isNaN(kids)) { poi.kidsFriendly = kids; poi.kidsRating = kids; }
  if (notes !== undefined) poi.description = notes;
  if (['imported', 'custom', 'discovered'].includes(poi.source)) Storage.saveImported(State.trip.id);
  document.getElementById('poi-edit-modal')?.classList.add('hidden');
  placeMarkers(); renderAll();
  showToast('Place updated');
}

function importPois() {
  const ta = document.getElementById('import-json');
  const preview = document.getElementById('import-preview');
  if (!ta) return;

  let raw;
  try { raw = JSON.parse(ta.value); }
  catch (e) {
    if (preview) preview.innerHTML = `<div class="import-error">❌ Invalid JSON: ${esc(e.message)}</div>`;
    return;
  }

  const places = [];

  // Google Takeout format
  if (raw.type === 'FeatureCollection' && Array.isArray(raw.features)) {
    raw.features.forEach(f => {
      const name = f.properties?.Title || f.properties?.name || 'Unnamed';
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) return;
      const [lng, lat] = coords;
      const address = f.properties?.Location?.Address || f.properties?.address || '';
      const gmapsUrl = f.properties?.['Google Maps URL'] || f.properties?.url || '';
      places.push({ name, lat, lng, address, gmapsUrl });
    });
  }
  // Simple array format
  else if (Array.isArray(raw)) {
    raw.forEach(item => {
      if (item.name && item.lat != null && item.lng != null) {
        places.push({ name: item.name, lat: Number(item.lat), lng: Number(item.lng), address: item.address || '', gmapsUrl: item.gmapsUrl || '' });
      }
    });
  }
  else {
    if (preview) preview.innerHTML = `<div class="import-error">❌ Unrecognized format. Expected Google Takeout FeatureCollection or array of {name, lat, lng}.</div>`;
    return;
  }

  if (places.length === 0) {
    if (preview) preview.innerHTML = `<div class="import-error">❌ No valid places found in the file.</div>`;
    return;
  }

  let imported = 0;
  places.forEach(pl => {
    const id = `imported-${slugify(pl.name)}-${Math.floor(pl.lat * 1000)}`;
    // Don't add duplicates
    if (State.trip.pois.find(p => p.id === id)) return;

    const nearestAcc = findNearestDestination(pl.lat, pl.lng);
    const availableDays = nearestAcc ? nearestAcc.days : (State.trip.days.map(d => d.date));

    const poi = {
      id,
      name: pl.name,
      lat: pl.lat,
      lng: pl.lng,
      category: 'monument',
      source: 'imported',
      destination: nearestAcc ? nearestAcc.location : 'Unknown',
      description: pl.address || 'Imported from Google Maps',
      rating: null,
      ratingCount: 0,
      cost: 0,
      costLabel: 'Free',
      costAmount: 0,
      duration: 1,
      energyCost: 2,
      kidsRating: 3,
      kidsFriendly: 3,
      gmapsUrl: pl.gmapsUrl || `https://maps.google.com/?q=${encodeURIComponent(pl.name)}`,
      bookAhead: false,
      confirmedBooking: false,
      tags: ['imported'],
      openingHours: 'Check locally',
      availableDays,
      notes: '',
    };

    State.trip.pois.push(poi);
    State.importedPois.push(poi);
    imported++;
  });

  if (imported === 0) {
    if (preview) preview.innerHTML = `<div class="import-error">⚠️ All places were already imported.</div>`;
    return;
  }

  Storage.saveImported(State.trip.id);
  placeMarkers();
  renderDayPlanContent(State.selectedDayIndex);
  closeImportModal();
  showToast(`Imported ${imported} place${imported !== 1 ? 's' : ''}`);
}

// ─── Trip Selector ─────────────────────────────────────────────
// ─── User Trip Management ───────────────────────────────────────

function deleteUserTrip(tripId) {
  if (!confirm('Delete this trip? This cannot be undone.')) return;
  // Remove from localStorage user trips
  const userTrips = Storage.loadUserTrips().filter(t => t.id !== tripId);
  Storage.saveUserTrips(userTrips);
  // Remove from live registry
  const idx = window._tripRegistry.findIndex(t => t.id === tripId);
  if (idx !== -1) window._tripRegistry.splice(idx, 1);
  // Also wipe its plan data
  Storage.clear(tripId);
  // If the deleted trip was active, switch to first available or show selector
  if (State.trip?.id === tripId) {
    State.trip = null;
    if (tripRegistry.length > 0) {
      loadTrip(tripRegistry._arr[0].id);
    } else {
      showTripSelector([]);
    }
  } else {
    showTripSelector(tripRegistry._arr);
  }
  showToast('Trip deleted');
}

function createUserTrip(formData) {
  // formData: { name, emoji, color, destinations: [{name, country, dateFrom, dateTo, accName}] }
  const slug = formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = `user-${slug}-${Date.now()}`;

  const allDays = [];
  const accommodations = [];
  const defaultDayPlans = {};

  formData.destinations.forEach((dest, di) => {
    const start = new Date(dest.dateFrom + 'T12:00:00');
    const end   = new Date(dest.dateTo   + 'T12:00:00');
    const destDays = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      destDays.push(dateStr);
      const isFirst = allDays.length === 0;
      allDays.push({
        date: dateStr,
        label: (di === 0 && isFirst) ? `Arrive ${dest.name}` : dest.name,
        destination: dest.name,
        emoji: dest.emoji || '📍',
        country: dest.country || '',
        driving: null,
      });
      defaultDayPlans[dateStr] = [];
    }
    accommodations.push({
      id: `acc-${di}`,
      name: dest.accName || dest.name,
      location: dest.country ? `${dest.name}, ${dest.country}` : dest.name,
      lat: 0, lng: 0,
      days: destDays,
      notes: '',
    });
  });

  return {
    id,
    name: formData.name,
    subtitle: formData.destinations.map(d => d.name).join(' · '),
    coverColor: formData.color || '#e07b54',
    emoji: formData.emoji || '✈️',
    isUserCreated: true,
    startDate: formData.destinations[0].dateFrom,
    endDate: formData.destinations[formData.destinations.length - 1].dateTo,
    pois: [],
    days: allDays,
    accommodations,
    confirmedBookings: {},
    defaultDayPlans,
  };
}

function openNewTripForm() {
  let modal = document.getElementById('new-trip-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'new-trip-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-panel new-trip-panel">
      <div class="modal-header">
        <span class="modal-title">＋ New Trip</span>
        <button class="modal-close" onclick="App.closeNewTripForm()">×</button>
      </div>

      <div class="new-trip-form" id="ntf">
        <div class="ntf-row">
          <div class="ntf-field ntf-field-grow">
            <label>Trip name</label>
            <input id="ntf-name" type="text" placeholder="e.g. Lisbon Weekend" autocomplete="off">
          </div>
          <div class="ntf-field ntf-field-narrow">
            <label>Emoji</label>
            <input id="ntf-emoji" type="text" placeholder="✈️" maxlength="4" style="text-align:center;font-size:20px;">
          </div>
          <div class="ntf-field ntf-field-narrow">
            <label>Colour</label>
            <input id="ntf-color" type="color" value="#e07b54" style="height:38px;padding:2px 4px;">
          </div>
        </div>

        <div class="ntf-section-label">Destinations <button class="ntf-add-dest" onclick="App.ntfAddDestination()">＋ Add</button></div>
        <div id="ntf-destinations"></div>

        <div class="ntf-actions">
          <button class="ntf-cancel" onclick="App.closeNewTripForm()">Cancel</button>
          <button class="ntf-create" onclick="App.ntfSubmit()">Create Trip →</button>
        </div>
      </div>
    </div>`;
  modal.classList.remove('hidden');
  // Add first destination row automatically
  ntfAddDestination();
  document.getElementById('ntf-name')?.focus();
}

function closeNewTripForm() {
  document.getElementById('new-trip-modal')?.classList.add('hidden');
}

function ntfAddDestination() {
  const container = document.getElementById('ntf-destinations');
  if (!container) return;
  const idx = container.children.length;
  const row = document.createElement('div');
  row.className = 'ntf-dest-row';
  row.innerHTML = `
    <div class="ntf-dest-fields">
      <input class="ntf-dest-name" type="text" placeholder="City / place name" autocomplete="off">
      <input class="ntf-dest-country" type="text" placeholder="Country" style="max-width:120px;" autocomplete="off">
      <input class="ntf-dest-acc" type="text" placeholder="Accommodation (optional)" autocomplete="off">
      <input class="ntf-dest-from" type="date">
      <input class="ntf-dest-to"   type="date">
    </div>
    ${idx > 0 ? `<button class="ntf-dest-remove" onclick="this.closest('.ntf-dest-row').remove()" title="Remove">×</button>` : ''}`;
  container.appendChild(row);
}

function ntfSubmit() {
  const name = document.getElementById('ntf-name')?.value.trim();
  if (!name) { showToast('Please enter a trip name'); return; }

  const rows = document.querySelectorAll('#ntf-destinations .ntf-dest-row');
  if (!rows.length) { showToast('Add at least one destination'); return; }

  const destinations = [];
  let valid = true;
  rows.forEach(row => {
    const cityName = row.querySelector('.ntf-dest-name')?.value.trim();
    const country  = row.querySelector('.ntf-dest-country')?.value.trim();
    const accName  = row.querySelector('.ntf-dest-acc')?.value.trim();
    const dateFrom = row.querySelector('.ntf-dest-from')?.value;
    const dateTo   = row.querySelector('.ntf-dest-to')?.value;
    if (!cityName || !dateFrom || !dateTo) { valid = false; return; }
    if (dateTo < dateFrom) { valid = false; return; }
    destinations.push({ name: cityName, country, accName, dateFrom, dateTo });
  });

  if (!valid) { showToast('Fill in name + dates for each destination (to ≥ from)'); return; }

  const trip = createUserTrip({
    name,
    emoji: document.getElementById('ntf-emoji')?.value.trim() || '✈️',
    color: document.getElementById('ntf-color')?.value || '#e07b54',
    destinations,
  });

  // Persist
  const userTrips = Storage.loadUserTrips();
  userTrips.push(trip);
  Storage.saveUserTrips(userTrips);
  // Register live
  window._tripRegistry.push(trip);

  closeNewTripForm();
  loadTrip(trip.id);
  showToast(`"${trip.name}" created! Add places via the 📥 Import button.`);
}

function showTripSelector(trips) {
  const el = document.getElementById('trip-selector');
  const cards = document.getElementById('trip-cards');
  if (!el || !cards) return;

  const hasActiveTrip = !!State.trip;

  // Update header: show close button only when a trip is already loaded
  const titleEl = el.querySelector('.trip-selector-title');
  if (titleEl) {
    titleEl.innerHTML = `✈️ My Trips ${hasActiveTrip
      ? `<button class="ts-close-btn" onclick="App.closeTripSelector()" title="Close">×</button>`
      : ''}`;
  }

  cards.innerHTML = trips.map(t => `
    <div class="trip-card${State.trip?.id === t.id ? ' trip-card-active' : ''}"
         onclick="App.loadTrip('${esc(t.id)}')">
      <div class="trip-card-color" style="background:${t.coverColor}20;color:${t.coverColor};font-size:28px;">
        ${t.emoji || '✈️'}
      </div>
      <div class="trip-card-info">
        <div class="trip-card-name">${esc(t.name)}</div>
        <div class="trip-card-dates">${formatShortDate(t.startDate)} – ${formatShortDate(t.endDate)}</div>
        <div class="trip-card-meta">${t.pois?.length ?? 0} places · ${t.days?.length ?? 0} days</div>
      </div>
      ${t.isUserCreated ? `
        <button class="trip-card-delete" title="Delete trip"
          onclick="event.stopPropagation(); App.deleteUserTrip('${esc(t.id)}')">×</button>
      ` : ''}
    </div>`).join('');

  // "＋ New Trip" button at the bottom
  const newBtn = document.createElement('button');
  newBtn.className = 'ts-new-btn';
  newBtn.innerHTML = '＋ New Trip';
  newBtn.onclick = () => App.openNewTripForm();
  cards.appendChild(newBtn);

  el.classList.remove('hidden');
}

function closeTripSelector() {
  document.getElementById('trip-selector')?.classList.add('hidden');
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

  // Load party config and settings
  const savedParty = Storage.loadParty();
  if (savedParty && Array.isArray(savedParty)) State.partyConfig = savedParty;

  const savedSettings = Storage.loadSettings();
  if (savedSettings) Object.assign(State.settings, savedSettings);

  // Load accommodation edits
  State.accEdits = Storage.loadAccEdits(tripId);

  // Load previously imported POIs
  const importedPois = Storage.loadImported(tripId);
  State.importedPois = importedPois;
  importedPois.forEach(poi => {
    if (!State.trip.pois.find(p => p.id === poi.id)) {
      State.trip.pois.push(poi);
    }
  });

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

// ─── Modals: inject HTML ───────────────────────────────────────
function injectModals() {
  const modalsHtml = `
  <!-- Settings Modal -->
  <div id="settings-modal" class="modal-overlay hidden">
    <div class="modal-panel">
      <div class="modal-header">
        <div class="modal-title">⚙️ Trip Settings</div>
        <button class="modal-close-btn" onclick="App.closeSettingsModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="settings-field">
          <label class="settings-label">Party ages (comma-separated)</label>
          <input type="text" id="settings-party" class="settings-input"
            placeholder="e.g. 35, 38, 3, 6" oninput="App.updatePartyPreview()">
          <div id="party-preview" class="settings-preview"></div>
        </div>
        <div class="settings-field">
          <label class="settings-label">Fuel price (€/L)</label>
          <input type="number" id="settings-fuel" class="settings-input" min="0" step="0.01" placeholder="1.70">
        </div>
        <div class="settings-field">
          <label class="settings-label">Car consumption (L/100km)</label>
          <input type="number" id="settings-consumption" class="settings-input" min="0" step="0.1" placeholder="7.5">
        </div>
        <div class="settings-field">
          <label class="settings-label">Daily meal budget (€/person)</label>
          <input type="number" id="settings-meal" class="settings-input" min="0" step="1" placeholder="22">
        </div>
        <div class="settings-divider">Discovery</div>
        <div class="settings-row-2">
          <div class="settings-field">
            <label class="settings-label">Nearby radius (km)</label>
            <input type="number" id="settings-radius" class="settings-input" min="1" max="50" step="1" placeholder="5">
          </div>
          <div class="settings-field">
            <label class="settings-label">Along route (km)</label>
            <input type="number" id="settings-route-radius" class="settings-input" min="1" max="30" step="1" placeholder="3">
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" onclick="App.closeSettingsModal()">Cancel</button>
        <button class="modal-btn modal-btn-save" onclick="App.saveSettings()">Save</button>
      </div>
    </div>
  </div>

  <!-- Trip Overview Modal -->
  <div id="trip-overview-modal" class="modal-overlay hidden">
    <div class="modal-panel modal-panel-wide">
      <div class="modal-header">
        <div class="modal-title">📊 Trip Overview</div>
        <button class="modal-close-btn" onclick="App.closeTripOverviewModal()">✕</button>
      </div>
      <div class="modal-body" id="trip-overview-content">
        <!-- filled dynamically -->
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" onclick="App.closeTripOverviewModal()">Close</button>
      </div>
    </div>
  </div>

  <!-- Import Modal -->
  <div id="import-modal" class="modal-overlay hidden">
    <div class="modal-panel modal-panel-wide">
      <div class="modal-header">
        <div class="modal-title">📥 Import Places</div>
        <button class="modal-close-btn" onclick="App.closeImportModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="import-instructions">
          <p><strong>From Google Maps Saved Places:</strong></p>
          <ol>
            <li>Go to <a href="https://takeout.google.com" target="_blank" rel="noopener">takeout.google.com</a></li>
            <li>Select "Google Maps" → "Saved Places"</li>
            <li>Download and extract the ZIP</li>
            <li>Open <code>Takeout/Maps/Saved Places.json</code></li>
            <li>Paste the JSON content below</li>
          </ol>
          <p style="margin-top:8px;font-size:11px;color:var(--color-text-secondary);">Also supports a simple array of <code>{"name","lat","lng","address"}</code> objects.</p>
        </div>
        <textarea id="import-json" class="import-textarea" placeholder="Paste Google Takeout JSON here..."></textarea>
        <div id="import-preview"></div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" onclick="App.closeImportModal()">Cancel</button>
        <button class="modal-btn modal-btn-save" onclick="App.importPois()">Import</button>
      </div>
    </div>
  </div>

  <!-- Accommodation Edit Modal -->
  <div id="acc-edit-modal" class="modal-overlay hidden">
    <div class="modal-panel">
      <div class="modal-header">
        <div class="modal-title">🏨 Edit Accommodation</div>
        <button class="modal-close-btn" onclick="App.closeAccEditModal()">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="ae-acc-id">
        <input type="hidden" id="ae-lat">
        <input type="hidden" id="ae-lng">
        <div class="settings-field">
          <label class="settings-label">Search for hotel / accommodation</label>
          <input type="text" id="ae-search" class="settings-input" placeholder="🔍 Type to search…"
            oninput="App.accLocationSearch(this)">
          <div id="ae-search-results" class="ae-search-results"></div>
          <div id="ae-location-badge" class="ae-location-badge" style="display:none"></div>
        </div>
        <div class="settings-field">
          <label class="settings-label">Name</label>
          <input type="text" id="ae-name" class="settings-input" placeholder="Accommodation name">
        </div>
        <div class="settings-field">
          <label class="settings-label">Notes</label>
          <input type="text" id="ae-notes" class="settings-input" placeholder="e.g. City center, breakfast included">
        </div>
        <div class="settings-field">
          <label class="settings-label">Price per night (€)</label>
          <input type="number" id="ae-price" class="settings-input" min="0" step="1" placeholder="0">
          <div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">Added to each night's total cost</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" onclick="App.closeAccEditModal()">Cancel</button>
        <button class="modal-btn modal-btn-save" onclick="App.saveAccEdit()">Save</button>
      </div>
    </div>
  </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = modalsHtml;
  document.body.appendChild(container);
}

// ─── Header Buttons Injection ──────────────────────────────────
function injectHeaderButtons() {
  const header = document.getElementById('app-header');
  if (!header) return;

  // Make the trip title area clickable to open trip manager
  const titleWrap = header.querySelector('.header-title')?.parentElement;
  if (titleWrap) {
    titleWrap.style.cursor = 'pointer';
    titleWrap.title = 'Manage trips';
    titleWrap.onclick = () => showTripSelector(tripRegistry._arr);
  }

  // Find the reset button to insert before it
  const resetBtn = document.getElementById('btn-reset-plan');

  // "Drop a pin" button — togglable
  const btnPin = document.createElement('button');
  btnPin.id = 'btn-add-marker';
  btnPin.title = 'Drop a custom pin on the map';
  btnPin.textContent = '📍';
  btnPin.onclick = () => State.customMarkerMode ? disableCustomMarkerMode() : enableCustomMarkerMode();
  btnPin.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.85);padding:5px 10px;border-radius:6px;font-size:14px;cursor:pointer;white-space:nowrap;transition:all 0.15s;';

  const btnImport = document.createElement('button');
  btnImport.id = 'btn-import';
  btnImport.title = 'Import places from Google Maps';
  btnImport.textContent = '📥';
  btnImport.onclick = () => App.openImportModal();
  btnImport.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.85);padding:5px 10px;border-radius:6px;font-size:14px;cursor:pointer;white-space:nowrap;';

  const btnOverview = document.createElement('button');
  btnOverview.id = 'btn-trip-overview';
  btnOverview.title = 'Trip overview & metrics';
  btnOverview.textContent = '📊';
  btnOverview.onclick = () => App.openTripOverviewModal();
  btnOverview.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.85);padding:5px 10px;border-radius:6px;font-size:14px;cursor:pointer;white-space:nowrap;';

  const btnSettings = document.createElement('button');
  btnSettings.id = 'btn-settings';
  btnSettings.title = 'Trip settings';
  btnSettings.textContent = '⚙️';
  btnSettings.onclick = () => App.openSettingsModal();
  btnSettings.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.85);padding:5px 10px;border-radius:6px;font-size:14px;cursor:pointer;white-space:nowrap;';

  if (resetBtn) {
    header.insertBefore(btnPin, resetBtn);
    header.insertBefore(btnImport, resetBtn);
    header.insertBefore(btnOverview, resetBtn);
    header.insertBefore(btnSettings, resetBtn);
  } else {
    header.appendChild(btnPin);
    header.appendChild(btnImport);
    header.appendChild(btnOverview);
    header.appendChild(btnSettings);
  }
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
  openSettingsModal,
  closeSettingsModal,
  saveSettings,
  updatePartyPreview,
  openTripOverviewModal,
  closeTripOverviewModal,
  openImportModal,
  closeImportModal,
  importPois,
  closeTripSelector,
  deleteUserTrip,
  openNewTripForm,
  closeNewTripForm,
  ntfAddDestination,
  ntfSubmit,
  enableCustomMarkerMode,
  disableCustomMarkerMode,
  openCustomMarkerModal,
  closeCustomMarkerModal,
  saveCustomMarker,
  searchPois,
  addDiscoveredResult,
  discoverNearby,
  discoverAlongRoute,
  openPoiEditModal,
  pePreviewIcon,
  savePoiEdit,
  openAccEditModal,
  closeAccEditModal,
  saveAccEdit,
  accLocationSearch,
  selectAccLocation,
};

// ─── Initialization ────────────────────────────────────────────
function init() {
  State.isMobile = window.innerWidth < 768;

  // Inject modals into DOM
  injectModals();
  // Inject header buttons
  injectHeaderButtons();

  initLayerPanel();
  initBottomSheet();

  // Delegate clicks on discovered/search result "+" add buttons
  document.addEventListener('click', e => {
    const btn = e.target.closest('.disc-add-btn');
    if (!btn) return;
    const data = _discCache.get(btn.dataset.discKey);
    if (!data) { showToast('Result expired — search again'); return; }
    addDiscoveredResult(data.lat, data.lng, data.name, data.category, data.dayIndex, data.osmTags);
  });

  // Close modals on backdrop click
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.add('hidden');
    }
  });

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

  // Keyboard: Escape closes detail and modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDetail();
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
    }
  });

  // Merge user-created trips from localStorage into the live registry
  Storage.loadUserTrips().forEach(t => {
    if (!window._tripRegistry.find(x => x.id === t.id)) {
      window._tripRegistry.push(t);
    }
  });

  if (tripRegistry.length === 0) {
    console.error('No trips registered. Check trips/index.js and trip files.');
    return;
  }

  if (tripRegistry.length === 1) {
    loadTrip(tripRegistry._arr[0].id);
  } else {
    showTripSelector(tripRegistry._arr);
  }
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // Small defer to ensure trip files have executed
  setTimeout(init, 10);
}
