/* ═══════════════════════════════════════════════════════════════
   TRAVEL PLANNER — app.js
   All app logic: map, routing, weather, POI management, UI
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── Firebase Configuration ──────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAvWjExtINNkJJNfTP920kf84MgT4rvjOc",
  authDomain: "tripcraft-e0389.firebaseapp.com",
  databaseURL: "https://tripcraft-e0389-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "tripcraft-e0389",
  storageBucket: "tripcraft-e0389.firebasestorage.app",
  messagingSenderId: "874209627182",
  appId: "1:874209627182:web:881944909632eeb82163bf",
};
const ALLOWED_EMAILS = ['pedrofreitascampos@gmail.com', 'faye.anson@gmail.com'];

// Initialize Firebase
const firebaseApp = firebase.initializeApp(firebaseConfig);
const firebaseAuth = firebase.auth();
const firebaseDb = firebase.database();

// ─── Firebase Auth ───────────────────────────────────────────
const Auth = {
  user: null, // { uid, name, email, picture }

  init() {
    return new Promise(resolve => {
      firebaseAuth.onAuthStateChanged(user => {
        if (user) {
          // Check allowlist
          if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(user.email)) {
            alert(`Access denied for ${user.email}.\nContact the trip owner.`);
            firebaseAuth.signOut();
            Auth.showGate();
            resolve(false);
            return;
          }
          Auth.user = { uid: user.uid, name: user.displayName, email: user.email, picture: user.photoURL };
          Auth.showApp();
          resolve(true);
        } else {
          Auth.showGate();
          resolve(false);
        }
      });
    });
  },

  showGate() {
    document.getElementById('auth-gate').style.display = '';
    document.getElementById('app').style.display = 'none';
    document.getElementById('bottom-sheet')?.style.setProperty('display', 'none');
    // Render sign-in button
    const btn = document.getElementById('g-signin-btn');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.innerHTML = `<button class="auth-google-btn" id="auth-google-trigger">
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" height="20">
        Sign in with Google
      </button>`;
      btn.querySelector('#auth-google-trigger').addEventListener('click', Auth.signIn);
    }
  },

  async signIn() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await firebaseAuth.signInWithPopup(provider);
      // onAuthStateChanged will handle the rest
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') console.error('Sign-in failed:', e);
    }
  },

  showApp() {
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('app').style.display = '';
    document.getElementById('bottom-sheet')?.style.removeProperty('display');
    Auth.updateHeaderUser();
  },

  updateHeaderUser() {
    if (!Auth.user) return;
    const existing = document.getElementById('auth-user-badge');
    if (existing) existing.remove();
    const badge = document.createElement('div');
    badge.id = 'auth-user-badge';
    badge.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:auto;cursor:pointer;';
    badge.title = `${Auth.user.name}\n${Auth.user.email}\nClick to sign out`;
    badge.innerHTML = Auth.user.picture
      ? `<img src="${Auth.user.picture}" style="width:26px;height:26px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.5);" referrerpolicy="no-referrer">`
      : `<div style="width:26px;height:26px;border-radius:50%;background:var(--color-accent);color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">${Auth.user.name?.[0] || '?'}</div>`;
    badge.onclick = () => {
      if (confirm('Sign out?')) Auth.signOut();
    };
    // Settings button
    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'btn-header-settings';
    settingsBtn.title = 'Settings';
    settingsBtn.textContent = '⚙️';
    settingsBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.85);padding:5px 10px;border-radius:6px;font-size:14px;cursor:pointer;';
    settingsBtn.onclick = () => App.openSettingsModal();

    const header = document.getElementById('app-header');
    const spacer = header?.querySelector('.header-spacer');
    if (spacer) { spacer.after(settingsBtn); settingsBtn.after(badge); }
    else { header?.appendChild(settingsBtn); header?.appendChild(badge); }
  },

  signOut() {
    firebaseAuth.signOut();
    Auth.user = null;
    location.reload();
  },
};

// ─── Firebase Database helpers ───────────────────────────────
function dbRef(path) {
  return firebaseDb.ref(`users/shared/${path}`);
}

const DB = {
  async get(path) {
    try {
      const snap = await dbRef(path).once('value');
      return snap.val();
    } catch (e) { console.error('DB get failed:', path, e); return null; }
  },
  async set(path, data) {
    try {
      await dbRef(path).set(data);
    } catch (e) {
      console.error('DB set failed:', path, e);
      if (typeof showToast === 'function') showToast('⚠️ Save failed — check connection');
    }
  },
  async remove(path) {
    try {
      await dbRef(path).remove();
    } catch (e) { console.error('DB remove failed:', path, e); }
  },
};

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
  interCityPolyline: null,
  lastInterCityResult: null,
  discoveryMarkers: [],     // temporary markers for discovered places
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
    discoveryRadius: 10,      // km — nearby POI discovery
    routeDiscoveryRadius: 5,  // km — along-route discovery
  },
  importedPois: [],       // POIs imported from Google Maps
  accEdits: {},           // accId → { name, notes, pricePerNight, lat, lng }
  dayAccAssignments: {},  // 'YYYY-MM-DD' → accId override
  dayTransport: {},       // 'YYYY-MM-DD' → { type, costPerPerson, durationMin }
  dayRouteMode: {},       // 'YYYY-MM-DD' → 'foot' | 'driving'
  dayLabels: {},          // 'YYYY-MM-DD' → custom label string
  dayEmojis: {},          // 'YYYY-MM-DD' → custom emoji
  customMarkerMode: false, // true when user is dropping a custom pin
  pendingMarkerLatLng: null, // {lat, lng} of pending custom marker
};

// ─── Persistence (Firebase Realtime Database) ────────────────
// All save/load operations go to Firebase. Writes are fire-and-forget
// (async but we don't await — keeps the UI snappy). Loads are awaited
// only during init.
const Storage = {
  save() {
    if (!State.trip) return;
    DB.set(`trips/${State.trip.id}/plan`, {
      plan: State.plan,
      layers: State.layers,
      selectedDayIndex: State.selectedDayIndex,
      dayAccAssignments: State.dayAccAssignments,
      dayTransport: State.dayTransport,
      dayRouteMode: State.dayRouteMode,
      dayLabels: State.dayLabels,
      dayEmojis: State.dayEmojis,
    });
  },
  saveParty() {
    DB.set('settings/party', State.partyConfig);
  },
  saveSettings() {
    DB.set('settings/app', State.settings);
  },
  saveImported(tripId) {
    DB.set(`trips/${tripId}/imported`, State.importedPois);
  },
  async load(tripId) {
    return await DB.get(`trips/${tripId}/plan`);
  },
  async loadParty() {
    return await DB.get('settings/party');
  },
  async loadSettings() {
    return await DB.get('settings/app');
  },
  async loadImported(tripId) {
    return (await DB.get(`trips/${tripId}/imported`)) || [];
  },
  clear(tripId) {
    DB.remove(`trips/${tripId}`);
  },
  async loadUserTrips() {
    return (await DB.get('userTrips')) || [];
  },
  saveUserTrips(trips) {
    DB.set('userTrips', trips);
  },
  saveAccEdits(tripId) {
    DB.set(`trips/${tripId}/accEdits`, State.accEdits);
  },
  async loadAccEdits(tripId) {
    return (await DB.get(`trips/${tripId}/accEdits`)) || {};
  },
  saveUserAccs(tripId) {
    const userAccs = State.trip?.accommodations.filter(a => a.isUserCreated) || [];
    DB.set(`trips/${tripId}/userAccs`, userAccs);
  },
  async loadUserAccs(tripId) {
    return (await DB.get(`trips/${tripId}/userAccs`)) || [];
  },
  savePoiEdits(tripId) {
    // Save editable fields for ALL POIs (bundled + imported)
    const edits = {};
    State.trip?.pois.forEach(p => {
      edits[p.id] = {
        name: p.name || '', category: p.category || 'monument', emoji: p.emoji || '',
        duration: p.duration ?? 1, cost: p.cost ?? 0, costAmount: p.costAmount ?? 0,
        costLabel: p.costLabel || 'Free',
        kidsFriendly: p.kidsFriendly ?? p.kidsRating ?? 3,
        kidsRating: p.kidsRating ?? p.kidsFriendly ?? 3,
        description: p.description || '', confirmedBooking: p.confirmedBooking || false,
        bookingTime: p.bookingTime || '', bookingRef: p.bookingRef || '',
      };
    });
    DB.set(`trips/${tripId}/poiEdits`, edits);
  },
  async loadPoiEdits(tripId) {
    return (await DB.get(`trips/${tripId}/poiEdits`)) || {};
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
  if (!poi.costAmount || poi.costAmount === 0 || poi.cost === 'free' || poi.cost === 0) return `<span class="badge badge-cost free">Free</span>`;
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
  const dayMode = getEffectiveRouteMode(day.date);
  const walkKm = (routeDistKm != null && dayMode === 'foot') ? routeDistKm : 0;

  // ── Cost ──────────────────────────────────────────────────────
  const foodCategories = new Set(['food', 'bar']);
  const foodPois = pois.filter(p => foodCategories.has(p.category));
  const nonFoodPois = pois.filter(p => !foodCategories.has(p.category));

  const poiCostPP = p => { const a = parseFloat(p.costAmount); const f = parseFloat(p.cost); return isNaN(a) ? (isNaN(f) ? 0 : f) : a; };

  const poiEntryCost = nonFoodPois.reduce((s, p) => s + poiCostPP(p), 0) * partySize;
  const plannedFoodCost = foodPois.reduce((s, p) => s + poiCostPP(p), 0) * partySize;
  const mealsPerDay = 3;
  const unplannedMeals = Math.max(0, mealsPerDay - foodPois.length);
  const unplannedMealsCost = (unplannedMeals / mealsPerDay) * dailyMealBudget * partySize;
  const mealsCost = plannedFoodCost + unplannedMealsCost;
  const dayTransportOverride = State.dayTransport[day.date] || {};
  // Compute inter-city distance: from trip data or from acc coords
  const prevDate = State.trip.days[dayIndex - 1]?.date;
  const depAcc = prevDate ? getEffectiveAcc(prevDate) : getHomeAcc();
  const arrAcc = getEffectiveAcc(day.date);
  let interCityKm = day.driving?.approxKm || 0;
  // If no trip-data driving but accs differ, estimate from coords
  if (!interCityKm && depAcc && arrAcc && depAcc.id !== arrAcc.id) {
    const dc = getAccCoords(depAcc), ac = getAccCoords(arrAcc);
    interCityKm = Math.round(haversineKm(dc.lat, dc.lng, ac.lat, ac.lng) * 1.3); // ~30% road factor
  }
  const hasInterCity = interCityKm > 0;
  let fuelCost = 0;
  let transportCost = 0;
  const inCityDriveKm = (routeDistKm != null && dayMode === 'driving') ? routeDistKm : 0;
  const totalDriveKm = interCityKm + inCityDriveKm;
  if (totalDriveKm > 0) {
    fuelCost = (totalDriveKm / 100) * carConsumption * fuelPrice;
    transportCost = fuelCost;
  }
  const dayAcc = getEffectiveAcc(day.date);
  const accEdit = dayAcc ? (State.accEdits[dayAcc.id] || {}) : {};
  const accCost = parseFloat(accEdit.pricePerNight) || 0;
  const totalCost = poiEntryCost + mealsCost + transportCost + accCost;

  // ── Tiredness ─────────────────────────────────────────────────
  const tirednessRaw = pois.reduce((sum, p) => sum + (p.duration || 1) * (p.energyCost || 2), 0) + walkKm * 2;
  const tirednessScore = tirednessRaw * maxMult;
  const tirednessNorm = Math.min(10, tirednessScore / 3);
  let tirednessLevel, tirednessColor, tirednessEmoji;
  if      (tirednessNorm > 7)   { tirednessLevel = 'Exhausting';  tirednessColor = '#e74c3c'; tirednessEmoji = '🥵'; }
  else if (tirednessNorm > 5)   { tirednessLevel = 'Tiring';      tirednessColor = '#e67e22'; tirednessEmoji = '😓'; }
  else if (tirednessNorm > 3)   { tirednessLevel = 'Moderate';    tirednessColor = '#f39c12'; tirednessEmoji = '🙂'; }
  else if (tirednessNorm > 1.5) { tirednessLevel = 'Comfortable'; tirednessColor = '#2980b9'; tirednessEmoji = '😌'; }
  else                           { tirednessLevel = 'Easy';        tirednessColor = '#27ae60'; tirednessEmoji = '😎'; }

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

  // Build detailed cost explanation for tooltip
  const costLines = [];
  if (poiEntryCost > 0) {
    const perPerson = nonFoodPois.reduce((s, p) => s + poiCostPP(p), 0);
    costLines.push(`Entries: €${perPerson.toFixed(0)}/person × ${partySize} = €${poiEntryCost.toFixed(0)}`);
  } else {
    costLines.push('Entries: Free');
  }
  const mealParts = [];
  if (plannedFoodCost > 0) {
    const ppFood = foodPois.reduce((s, p) => s + poiCostPP(p), 0);
    mealParts.push(`${foodPois.length} planned (€${ppFood.toFixed(0)}/pp × ${partySize} = €${plannedFoodCost.toFixed(0)})`);
  }
  if (unplannedMeals > 0) {
    mealParts.push(`${unplannedMeals} unplanned (€${(dailyMealBudget/mealsPerDay).toFixed(0)}/meal/pp × ${partySize} = €${unplannedMealsCost.toFixed(0)})`);
  }
  costLines.push(`Meals: ${mealParts.join(' + ')} = €${mealsCost.toFixed(0)}`);
  if (totalDriveKm > 0) {
    costLines.push(`Fuel: ${interCityKm > 0 ? interCityKm : ''}${interCityKm > 0 && inCityDriveKm > 0 ? '+' : ''}${inCityDriveKm > 0 ? inCityDriveKm.toFixed(0) : ''} km × ${carConsumption}L/100km × €${fuelPrice}/L = €${fuelCost.toFixed(0)}`);
  }
  if (accCost > 0) costLines.push(`Accommodation: €${accCost.toFixed(0)}/night`);
  costLines.push(`Total: €${totalCost.toFixed(0)}`);
  const costExplain = costLines.join('\n');

  return {
    cost: { poi: poiEntryCost, meals: mealsCost, fuel: fuelCost, transport: transportCost, acc: accCost, total: totalCost },
    costExplain,
    tiredness: { raw: tirednessRaw, score: tirednessScore, norm: tirednessNorm, level: tirednessLevel, color: tirednessColor, emoji: tirednessEmoji },
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
  const totalEntries = allMetrics.reduce((s, m) => s + (m ? m.cost.poi : 0), 0);
  const totalMeals = allMetrics.reduce((s, m) => s + (m ? m.cost.meals : 0), 0);
  const totalTransport = allMetrics.reduce((s, m) => s + (m ? m.cost.transport : 0), 0);
  const totalAcc = allMetrics.reduce((s, m) => s + (m ? m.cost.acc : 0), 0);
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
    totalCost, totalEntries, totalMeals, totalTransport, totalAcc,
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

  const fuelHtml = metrics.cost.transport > 0
    ? `<div class="cost-item"><span class="cost-item-label">Transport</span><span class="cost-item-value">€${metrics.cost.transport.toFixed(0)}</span></div>`
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
      <div class="metric-pill cost-pill" title="${esc(metrics.costExplain)}">💰 €${metrics.cost.total.toFixed(0)}</div>
      <div class="metric-pill tiredness-pill tiredness-${tirednessLevelClass}" title="Tiredness: ${metrics.tiredness.norm.toFixed(1)}/10 — based on walking distance, activity durations, and ages in your party">${metrics.tiredness.emoji} ${metrics.tiredness.level}</div>
      <div class="metric-pill overall-pill" title="Overall day score: ${metrics.overall.toFixed(1)}/10 — weighted average of family fit, culture, food, relaxation, fun, and logistics">⭐ ${metrics.overall.toFixed(1)}/10</div>
    </div>
    <div class="party-info-line">
      👨‍👩‍👧‍👦 ${esc(partyDesc)}${esc(kidsStr)}
    </div>
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
  `;

  document.querySelectorAll('.day-metrics-widget').forEach(el => {
    el.innerHTML = html;
  });
  // Keep trip overview in sync
  updateTripOverviewContent();
}

// ─── Map Setup ─────────────────────────────────────────────────
function initMap(lat, lng) {
  State.map = L.map('map', {
    center: [lat, lng],
    zoom: 8,
    zoomControl: true,
  });

  State.mapLayers = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    }),
  };
  State.mapLayers.osm.addTo(State.map);

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
    ? (poi.bookingTime ? `<span style="background:#e8f5e9;color:#2e7d32;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:600;">🕐 ${esc(poi.bookingTime)}</span>` : `<span style="background:#fdf3ce;color:#7a5900;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:600;">✅ Booked</span>`)
    : '';
  const costStr = poi.costAmount > 0 ? `€${poi.costAmount} pp` : 'Free';
  const starsHtml = poi.rating ? `<span style="color:#f0c040;font-size:10px;">${'★'.repeat(Math.round(poi.rating))}${'☆'.repeat(5-Math.round(poi.rating))}</span>` : '';
  return `<div style="padding:10px 12px;min-width:180px;">
    <div style="font-weight:600;font-size:13px;margin-bottom:4px;line-height:1.3;">${esc(poi.name)} ${starsHtml}</div>
    <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#666;flex-wrap:wrap;margin-bottom:4px;">
      <span>${cat.icon} ${cat.label}</span>
      <span>⏱ ${poi.duration}h</span>
      <span>💰 ${costStr}</span>
      ${booked}
    </div>
    <div style="font-size:11px;color:#888;margin-bottom:6px;">${getKidsHtml(poi.kidsRating || poi.kidsFriendly || 3)}</div>
    <button onclick="App.openDetail('${poi.id}')"
      style="display:block;width:100%;padding:5px 8px;background:var(--color-accent);color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">
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

  // Available-to-add POIs as semi-transparent markers (tied to Suggested toggle)
  if (State.layers.showSuggested && currentDay) {
    const available = getPoisAvailableToAdd(State.selectedDayIndex);
    available.forEach(poi => {
      if (State.markers[poi.id]) return; // already placed
      if (!State.layers.categories[poi.category]) return;
      const cat = CATEGORIES[poi.category] || CATEGORIES.monument;
      const icon = L.divIcon({
        html: `<div style="width:34px;height:34px;border-radius:50%;background:${cat.color};border:2.5px dashed rgba(255,255,255,0.8);box-shadow:0 2px 6px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:16px;opacity:0.55;">${cat.icon}</div>`,
        className: '',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -12],
      });
      const m = L.marker([poi.lat, poi.lng], { icon })
        .addTo(State.map)
        .bindPopup(buildPopupHTML(poi), { maxWidth: 230, minWidth: 175 });
      State.markers[poi.id] = m;
    });
  }

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
  const coords = [];
  // Include departure accommodation
  const prevDate = State.trip.days[dayIndex - 1]?.date;
  const depAcc = prevDate ? getEffectiveAcc(prevDate) : getHomeAcc();
  if (depAcc) { const c = getAccCoords(depAcc); if (c.lat && c.lng) coords.push([c.lat, c.lng]); }
  // Include POIs
  (State.plan[day.date] || []).map(id => getPoi(id)).filter(Boolean).forEach(p => coords.push([p.lat, p.lng]));
  // Include arrival accommodation (resolve to home if same as departure on driving days)
  let arrAcc = getEffectiveAcc(day.date);
  if (arrAcc && depAcc && arrAcc.id === depAcc.id && day.driving) arrAcc = getHomeAcc();
  if (arrAcc) { const c = getAccCoords(arrAcc); if (c.lat && c.lng) coords.push([c.lat, c.lng]); }

  if (coords.length === 0) return;
  if (coords.length === 1) {
    State.map.setView(coords[0], 13, { animate: true });
  } else {
    State.map.fitBounds(L.latLngBounds(coords), { padding: [60, 60], maxZoom: 14, animate: true });
  }
}

function clearAllRoutes() {
  if (!State.map) return;
  // Clear in-city route
  if (State.routePolyline) {
    State.map.removeLayer(State.routePolyline);
    State.routePolyline = null;
  }
  // Clear inter-city route (can be single layer or array of layers)
  if (State.interCityPolyline) {
    if (Array.isArray(State.interCityPolyline)) {
      State.interCityPolyline.forEach(l => { try { State.map.removeLayer(l); } catch {} });
    } else {
      try { State.map.removeLayer(State.interCityPolyline); } catch {}
    }
    State.interCityPolyline = null;
  }
  State.lastRouteResult = null;
  State.lastInterCityResult = null;
}

async function drawRoute(dayIndex) {
  if (!State.map) return;
  clearAllRoutes();
  // Draw inter-city route between accommodations
  drawInterCityRoute(dayIndex);

  const day = getDay(dayIndex);
  if (!day) return;
  const plan = State.plan[day.date] || [];
  const poiWaypoints = plan.map(id => getPoi(id)).filter(Boolean).map(p => [p.lat, p.lng]);
  // Route: depart acc → POIs → arrive acc
  const prevDate = State.trip.days[dayIndex - 1]?.date;
  const depAcc = prevDate ? getEffectiveAcc(prevDate) : getHomeAcc();
  const arrAcc = getEffectiveAcc(day.date);
  const depCoords = depAcc ? getAccCoords(depAcc) : null;
  const arrCoords = arrAcc ? getAccCoords(arrAcc) : depCoords;
  const waypoints = [];
  if (depCoords?.lat && depCoords?.lng) waypoints.push([depCoords.lat, depCoords.lng]);
  waypoints.push(...poiWaypoints);
  if (arrCoords?.lat && arrCoords?.lng) waypoints.push([arrCoords.lat, arrCoords.lng]);
  if (waypoints.length < 2) {
    updateRouteSummaryUI(null);
    renderDayMetricsUI(dayIndex, 0);
    return;
  }

  const dayMode = getEffectiveRouteMode(day.date);
  const result = await fetchRoute(waypoints, dayMode);
  if (!result) {
    updateRouteSummaryUI(null);
    renderDayMetricsUI(dayIndex, 0);
    return;
  }
  State.lastRouteResult = result;

  if (result.geojson) {
    State.routePolyline = L.geoJSON(result.geojson, {
      style: {
        color: '#1565c0',
        weight: 4,
        opacity: 0.8,
        dashArray: dayMode === 'foot' ? '8,4' : null,
      },
    }).addTo(State.map);
  } else {
    State.routePolyline = L.polyline(waypoints, {
      color: '#1565c0',
      weight: 3,
      opacity: 0.6,
      dashArray: '6,6',
    }).addTo(State.map);
  }

  updateRouteSummaryUI(result);
  // Update metrics with actual walking/driving distance
  renderDayMetricsUI(dayIndex, result.distKm);
  // Fit map to show the full route including accommodations
  fitMapToDay(dayIndex);
}

// ─── Inter-City Route ──────────────────────────────────────────
function getHomeAcc() {
  return State.trip?.accommodations.find(a => a.isHome) || null;
}

function greatCirclePoints(lat1, lng1, lat2, lng2, n) {
  const toR = d => d * Math.PI / 180, toD = r => r * 180 / Math.PI;
  const φ1 = toR(lat1), λ1 = toR(lng1), φ2 = toR(lat2), λ2 = toR(lng2);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((φ1 - φ2) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ1 - λ2) / 2) ** 2
  ));
  if (d < 1e-10) return [[lat1, lng1], [lat2, lng2]];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    pts.push([toD(Math.atan2(z, Math.sqrt(x * x + y * y))), toD(Math.atan2(y, x))]);
  }
  return pts;
}

// Airport cache: { 'lat,lng' → { lat, lng, name, iata } | null }
const _airportCache = {};

async function findNearestAirport(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (_airportCache[key] !== undefined) return _airportCache[key];
  try {
    // Query both node and way — airports are usually mapped as ways/relations in OSM
    const q = `[out:json][timeout:12];
(node["aeroway"="aerodrome"]["iata"](around:200000,${lat},${lng});
 way["aeroway"="aerodrome"]["iata"](around:200000,${lat},${lng});
 relation["aeroway"="aerodrome"]["iata"](around:200000,${lat},${lng});
);out center body 5;`;
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: 'data=' + encodeURIComponent(q),
    });
    if (!r.ok) { _airportCache[key] = null; return null; }
    const data = await r.json();
    const airports = (data.elements || [])
      .filter(e => e.tags?.iata && e.tags?.name)
      .map(e => ({
        lat: e.lat ?? e.center?.lat,
        lon: e.lon ?? e.center?.lon,
        name: e.tags.name,
        iata: e.tags.iata,
      }))
      .filter(a => a.lat && a.lon)
      .sort((a, b) => haversineKm(lat, lng, a.lat, a.lon) - haversineKm(lat, lng, b.lat, b.lon));
    const best = airports[0];
    _airportCache[key] = best ? { lat: best.lat, lng: best.lon, name: best.name, iata: best.iata } : null;
    return _airportCache[key];
  } catch { _airportCache[key] = null; return null; }
}

let _interCityGen = 0; // prevents stale async responses from adding layers

async function drawInterCityRoute(dayIndex) {
  const gen = ++_interCityGen;

  const day = getDay(dayIndex);
  if (!day || !State.map) return;

  const prevDate = State.trip.days[dayIndex - 1]?.date;
  let depAcc = prevDate ? getEffectiveAcc(prevDate) : getHomeAcc();
  let arrAcc = getEffectiveAcc(day.date);
  if (arrAcc && depAcc && arrAcc.id === depAcc.id && day.driving) arrAcc = getHomeAcc();
  if (!depAcc && !arrAcc) return;
  if (!depAcc) depAcc = getHomeAcc();
  if (!arrAcc) arrAcc = getHomeAcc();
  if (!depAcc || !arrAcc || depAcc.id === arrAcc.id) return;

  const depC = getAccCoords(depAcc);
  const arrC = getAccCoords(arrAcc);

  const dayTransportOverride = State.dayTransport[day.date] || {};
  const tType = dayTransportOverride.type || 'driving';

  if (tType === 'flight') {
    const [depAirport, arrAirport] = await Promise.all([
      findNearestAirport(depC.lat, depC.lng),
      findNearestAirport(arrC.lat, arrC.lng),
    ]);
    if (gen !== _interCityGen) return; // stale

    const layers = [];
    const depAP = depAirport || { lat: depC.lat, lng: depC.lng };
    const arrAP = arrAirport || { lat: arrC.lat, lng: arrC.lng };

    const leg1 = await fetchRoute([[depC.lat, depC.lng], [depAP.lat, depAP.lng]], 'driving');
    if (gen !== _interCityGen) return;
    if (leg1?.geojson) {
      layers.push(L.geoJSON(leg1.geojson, {
        style: { color: '#78909c', weight: 3, opacity: 0.6, dashArray: '6,4' },
      }).addTo(State.map));
    }

    const pts = greatCirclePoints(depAP.lat, depAP.lng, arrAP.lat, arrAP.lng, 50);
    layers.push(L.polyline(pts, {
      color: '#e53935', weight: 3, opacity: 0.7, dashArray: '6,8',
    }).addTo(State.map));

    const leg3 = await fetchRoute([[arrAP.lat, arrAP.lng], [arrC.lat, arrC.lng]], 'driving');
    if (gen !== _interCityGen) return;
    if (leg3?.geojson) {
      layers.push(L.geoJSON(leg3.geojson, {
        style: { color: '#78909c', weight: 3, opacity: 0.6, dashArray: '6,4' },
      }).addTo(State.map));
    }

    if (depAirport) {
      layers.push(L.marker([depAirport.lat, depAirport.lng], {
        icon: L.divIcon({ html: `<div style="background:#1a1a2e;color:white;font-size:10px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;">${depAirport.iata} ✈️</div>`, className: '', iconAnchor: [20, 10] }),
      }).addTo(State.map));
    }
    if (arrAirport && arrAirport.iata !== depAirport?.iata) {
      layers.push(L.marker([arrAirport.lat, arrAirport.lng], {
        icon: L.divIcon({ html: `<div style="background:#1a1a2e;color:white;font-size:10px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;">✈️ ${arrAirport.iata}</div>`, className: '', iconAnchor: [20, 10] }),
      }).addTo(State.map));
    }

    State.interCityPolyline = layers;
    State.lastInterCityResult = { geojson: { coordinates: pts.map(([lat, lng]) => [lng, lat]) } };
    return;
  }

  // Ground transport
  const routeStyles = {
    driving: { color: '#e53935', weight: 4, opacity: 0.6, dashArray: '10,6' },
    train:   { color: '#6a1b9a', weight: 4, opacity: 0.7, dashArray: '4,8' },
    bus:     { color: '#e65100', weight: 3, opacity: 0.6, dashArray: '8,6' },
  };
  const style = routeStyles[tType] || routeStyles.driving;

  const result = await fetchRoute([[depC.lat, depC.lng], [arrC.lat, arrC.lng]], 'driving');
  if (gen !== _interCityGen) return; // stale
  if (!result) return;
  State.lastInterCityResult = result;

  if (result.geojson) {
    State.interCityPolyline = L.geoJSON(result.geojson, { style }).addTo(State.map);
  } else {
    State.interCityPolyline = L.polyline([[depC.lat, depC.lng], [arrC.lat, arrC.lng]], style).addTo(State.map);
  }
}

// ─── Effective Day Label ────────────────────────────────────────
function getEffectiveDayLabel(day) {
  if (State.dayLabels?.[day.date]) return State.dayLabels[day.date];
  const acc = getEffectiveAcc(day.date);
  if (acc) {
    // Try location field, then locationLabel from edits, then edited name
    const edit = State.accEdits?.[acc.id] || {};
    for (const src of [acc.location, edit.locationLabel, edit.name, acc.name]) {
      if (!src) continue;
      const city = src.split(',')[0].replace(/^(New\s+Accommodation|Accommodation|Home)\s*[—–-]?\s*/i, '').trim();
      if (city && city.length > 1 && city !== 'New Accommodation') return city;
    }
  }
  return day.label;
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
  const acc = getEffectiveAcc(day.date);
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
    const currentDay = getDay(State.selectedDayIndex);
    const dayMode = currentDay ? getEffectiveRouteMode(currentDay.date) : State.layers.routeMode;
    const modeIcon = dayMode === 'foot' ? '🚶' : '🚗';
    const fallback = result.isFallback ? ' (est.)' : '';
    const date = currentDay?.date || '';
    el.innerHTML = `
      <div class="route-stat"><span class="stat-icon">${modeIcon}</span>
        <span class="stat-value">${formatDuration(result.durMin)}${fallback}</span></div>
      <div class="route-stat"><span class="stat-icon">📍</span>
        <span class="stat-value">${formatDist(result.distKm)}</span></div>
      <div class="route-mode-toggle">
        <button class="route-mode-sm${dayMode === 'foot' ? ' active' : ''}"
          onclick="App.setDayRouteMode('${date}','foot')">🚶</button>
        <button class="route-mode-sm${dayMode === 'driving' ? ' active' : ''}"
          onclick="App.setDayRouteMode('${date}','driving')">🚗</button>
      </div>`;
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
      <div class="tab-emoji">${State.dayEmojis?.[day.date] || day.emoji}</div>
      <div class="tab-weather"></div>
      <div class="tab-label">${esc(getEffectiveDayLabel(day))}</div>
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

  // Accommodation for this day — compute first (needed by transport/driving HTML)
  const prevDate = State.trip.days[dayIndex - 1]?.date;
  const departureAcc = prevDate ? getEffectiveAcc(prevDate) : getHomeAcc();
  let arrivalAcc = getEffectiveAcc(day.date);
  if (arrivalAcc && departureAcc && arrivalAcc.id === departureAcc.id && day.driving) arrivalAcc = getHomeAcc();
  const hasInterCity = (departureAcc && arrivalAcc && departureAcc.id !== arrivalAcc.id) || !!day.driving;

  // Transport info (driving only)
  const km = day.driving?.approxKm || 0;
  const displayMin = day.driving?.approxMin || 0;

  const accCityName = (acc) => {
    if (!acc) return '';
    const edit = State.accEdits?.[acc.id] || {};
    // Try location, then locationLabel from search, then edited name
    for (const src of [acc.location, edit.locationLabel, edit.name, acc.name]) {
      if (!src) continue;
      const city = src.split(',')[0].replace(/^(New\s+Accommodation|Accommodation|Home)\s*[—–-]?\s*/i, '').trim();
      if (city && city.length > 1 && city !== 'New Accommodation') return city;
    }
    return '';
  };
  const depCity = accCityName(departureAcc);
  const arrCity = accCityName(arrivalAcc);
  const routeLabel = (depCity || arrCity) ? `${esc(depCity || '?')} → ${esc(arrCity || '?')}` : 'Travel day';
  const drivingHtml = hasInterCity ? `
    <div class="drive-info">
      <div class="drive-info-icon">🚗</div>
      <div class="drive-info-text">
        <div class="drive-info-label">${routeLabel}</div>
        ${km > 0 ? `<div class="drive-info-detail">${formatDuration(displayMin)} · ${km} km</div>` : ''}
      </div>
    </div>` : '';

  const allAccs = State.trip.accommodations;
  const accSelectHtml = (selectedId, date) => {
    const opts = allAccs.map(a => {
      const edit = State.accEdits[a.id] || {};
      const name = edit.name || a.name;
      return `<option value="${a.id}"${a.id === selectedId ? ' selected' : ''}>${esc(name)}</option>`;
    }).join('');
    return `<select class="acc-picker-select" onchange="App.setDayAcc('${date}', this.value)">
      <option value="">— none —</option>
      ${opts}
      <option value="__new__">➕ Add new…</option>
    </select>`;
  };

  // Read-only departure card (derived from previous night)
  const departCardHtml = (() => {
    if (!departureAcc) return '';
    const edit = State.accEdits[departureAcc.id] || {};
    const name = edit.name || departureAcc.name;
    const city = accCityName(departureAcc);
    return `
    <div class="acc-card acc-depart">
      <div class="acc-icon">${departureAcc.isHome ? '🏠' : '🏨'}</div>
      <div class="acc-info">
        <div class="acc-name"><span class="text-xs text-secondary">Depart — </span>${esc(name)}</div>
        ${city ? `<div class="acc-note">${esc(city)}</div>` : ''}
      </div>
    </div>`;
  })();

  // Editable arrival card (tonight's accommodation)
  const arriveCardHtml = (() => {
    const edit = arrivalAcc ? (State.accEdits[arrivalAcc.id] || {}) : {};
    const priceStr = edit.pricePerNight ? ` · €${parseFloat(edit.pricePerNight).toFixed(0)}/night` : '';
    const city = accCityName(arrivalAcc);
    const notes = arrivalAcc ? (edit.notes !== undefined ? edit.notes : (arrivalAcc.notes || '')) : '';
    return `
    <div class="acc-card acc-arrive">
      <div class="acc-icon">${arrivalAcc?.isHome ? '🏠' : '🏨'}</div>
      <div class="acc-info">
        <div class="acc-name"><span class="text-xs text-secondary">Arrive — </span>${accSelectHtml(arrivalAcc?.id || '', day.date)}</div>
        <div class="acc-note">${[city, notes, priceStr].filter(Boolean).join(' · ')}</div>
      </div>
      ${arrivalAcc && !arrivalAcc.isHome ? `<button class="btn-icon btn-edit-sm acc-edit-btn" onclick="App.openAccEditModal('${arrivalAcc.id}')" title="Edit accommodation">✏️</button>` : ''}
    </div>`;
  })();

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
        <div class="day-header-emoji" contenteditable="true" spellcheck="false"
          onblur="App.saveDayEmoji('${day.date}', this.textContent)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
          title="Click to change emoji">${State.dayEmojis?.[day.date] || day.emoji}</div>
        <div class="day-header-info">
          <div class="day-header-title" contenteditable="true" spellcheck="false"
            onblur="App.saveDayLabel('${day.date}', this.textContent)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${esc(getEffectiveDayLabel(day))}</div>
          <div class="day-header-date">${formatDate(day.date)} · ${esc(day.country)}</div>
        </div>
      </div>
      <div class="weather-host"></div>
      ${drivingHtml}
    </div>

    <!-- Sub-tabs: Plan / Discover / Details -->
    <div class="day-subtabs">
      <button class="day-subtab active" data-tab="plan" onclick="App.switchDayTab('plan')">📋 Plan</button>
      <button class="day-subtab" data-tab="discover" onclick="App.switchDayTab('discover')">🔍 Discover</button>
      <button class="day-subtab" data-tab="analysis" onclick="App.switchDayTab('analysis')">📊 Analysis</button>
    </div>

    <!-- TAB: Plan -->
    <div class="day-tab-panel" data-panel="plan">
      <div class="route-summary" style="display:none"></div>
      ${departCardHtml}
      <div class="poi-list" data-day="${dayIndex}">
        ${poiCardsHtml}
      </div>
      ${arriveCardHtml}
    </div>

    <!-- TAB: Discover -->
    <div class="day-tab-panel" data-panel="discover" style="display:none">
      <div class="discover-search-wrap">
        <input class="poi-search-input" type="text" placeholder="🔍 Search for a place…"
          oninput="App.searchPois(this, ${dayIndex})">
      </div>
      <div class="search-results-host"></div>

      <div class="discover-group">
        <div class="discover-group-label">
          💡 Suggestions ·
          <select class="discover-cat-filter" onchange="App.discoverNearby(${dayIndex}, this.value)">
            <option value="all">All types</option>
            <option value="food">🍽️ Restaurants</option>
            <option value="bar">🍷 Bars & Cafés</option>
            <option value="monument">🏛️ Monuments</option>
            <option value="museum">🎨 Museums</option>
            <option value="park">🌳 Parks</option>
            <option value="beach">🏖️ Beaches</option>
            <option value="entertainment">🎢 Entertainment</option>
            <option value="nature">🌿 Nature</option>
          </select>
          <button class="discover-load-btn" onclick="App.discoverNearby(${dayIndex})">Load</button>
        </div>
        <div class="nearby-discover-results">
          ${addMoreHtml || '<div class="discover-empty">Click Load to discover places nearby</div>'}
        </div>
      </div>

      ${hasInterCity ? `
      <div class="discover-group">
        <div class="discover-group-label">
          🛣️ Along the route ·
          <input type="number" class="discover-radius-input" min="1" max="50" step="1"
            value="${State.settings.routeDiscoveryRadius}"
            onchange="App.setRouteDiscoveryRadius(this.value)" title="Search radius in km"> km
          <button class="discover-load-btn" onclick="App.discoverAlongRoute(${dayIndex})">Load</button>
        </div>
        <div class="route-discover-results"></div>
      </div>` : ''}
    </div>

    <!-- TAB: Details -->
    <div class="day-tab-panel" data-panel="analysis" style="display:none">
      <div class="day-metrics-widget"></div>
    </div>

    <div style="height:16px"></div>
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
  if (poi.bookAhead && !isBooked) badges.push('<span class="badge badge-warning">⚠️ Book ahead</span>');

  return `<div class="poi-card${isBooked ? ' confirmed' : ''}" data-poi-id="${poiId}" draggable="true">
    <div class="drag-handle" title="Drag to reorder">⠿</div>
    <div class="poi-thumb" id="pt-${poiId}"><span class="thumb-fallback">${cat.icon}</span></div>
    <div class="poi-info">
      <div class="poi-card-name" title="${esc(poi.name)}">${esc(poi.name)}</div>
      <div class="poi-card-meta">
        ${getCostHtml(poi)}
        <span class="badge badge-duration">⏱ ${poi.duration}h</span>
        ${poi.confirmedBooking && poi.bookingTime ? `<span class="badge badge-booking" title="${esc(poi.bookingRef || 'Booked')}">🕐 ${esc(poi.bookingTime)}</span>` : poi.confirmedBooking ? `<span class="badge badge-booking" title="${esc(poi.bookingRef || '')}">✅ Booked</span>` : ''}
        ${badges.join('')}
      </div>
      ${poi.rating ? `<div class="poi-stars" title="Rating: ${poi.rating}/5">${'★'.repeat(Math.round(poi.rating))}${'☆'.repeat(5-Math.round(poi.rating))}</div>` : ''}
      <div class="poi-kids">${getKidsHtml(poi.kidsRating)}</div>
    </div>
    <div class="poi-actions">
      <button class="btn-icon btn-edit" onclick="App.openPoiEditModal('${poiId}')" title="Edit">✏️</button>
      <button class="btn-icon btn-detail" onclick="App.openDetail('${poiId}')" title="Details">ℹ</button>
      <select class="btn-move-day" onchange="App.movePoiToDay('${poiId}', this.value); this.selectedIndex=0;" title="Move to another day">
        <option value="">↷</option>
        ${State.trip.days.map((d, i) => i === State.selectedDayIndex ? '' :
          `<option value="${d.date}">${formatShortDate(d.date)}</option>`
        ).join('')}
      </select>
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

function movePoiToDay(poiId, targetDate) {
  if (!targetDate || !State.trip) return;
  const poi = getPoi(poiId);
  if (!poi) return;
  // Remove from current day
  const currentDay = getDay(State.selectedDayIndex);
  if (currentDay) {
    State.plan[currentDay.date] = (State.plan[currentDay.date] || []).filter(id => id !== poiId);
  }
  // Add to target day
  if (!State.plan[targetDate]) State.plan[targetDate] = [];
  if (!State.plan[targetDate].includes(poiId)) State.plan[targetDate].push(poiId);
  Storage.save();
  const targetDay = State.trip.days.find(d => d.date === targetDate);
  showToast(`Moved "${poi.name}" to ${formatShortDate(targetDate)}`);
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

// ─── Add More Toggle (no-op — section is always visible) ──────
function toggleAddMore() {}

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

  clearAllRoutes();
  clearDiscoveryMarkers();
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
  // Hide layer controls so they don't overlap the close button
  const lc = document.getElementById('layer-controls');
  if (lc) lc.style.display = 'none';

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
  const lc = document.getElementById('layer-controls');
  if (lc) lc.style.display = '';
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
  if (key === 'showSuggested') {
    // Show/hide discovery markers
    State.discoveryMarkers.forEach(m => {
      if (val) m.addTo(State.map);
      else State.map?.removeLayer(m);
    });
  }
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

function setMapStyle(style) {
  if (!State.map || !State.mapLayers) return;
  if (style === 'satellite') {
    State.map.removeLayer(State.mapLayers.osm);
    State.mapLayers.satellite.addTo(State.map);
  } else {
    State.map.removeLayer(State.mapLayers.satellite);
    State.mapLayers.osm.addTo(State.map);
  }
  document.querySelectorAll('[data-style]').forEach(b => {
    b.classList.toggle('active', b.dataset.style === style);
  });
}

// ─── Weather Overlays (OpenWeatherMap) ──────────────────────────
let OWM_KEY = ''; // Loaded from Firebase settings on init
const _weatherOverlays = {};

function toggleWeatherOverlay(type, show) {
  if (!State.map) return;
  if (!OWM_KEY) {
    showToast('Add your OpenWeatherMap key in Settings → API Keys');
    const el = document.getElementById(`toggle-${type}`);
    if (el) el.checked = false;
    return;
  }
  if (show) {
    const layerMap = {
      rain: 'precipitation_new',
      clouds: 'clouds_new',
      temp: 'temp_new',
    };
    const layerId = layerMap[type];
    if (!layerId) return;
    if (_weatherOverlays[type]) State.map.removeLayer(_weatherOverlays[type]);
    _weatherOverlays[type] = L.tileLayer(
      `https://tile.openweathermap.org/map/${layerId}/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
      { opacity: 0.5, maxZoom: 19, attribution: '© OpenWeatherMap' }
    ).addTo(State.map);
  } else {
    if (_weatherOverlays[type]) {
      State.map.removeLayer(_weatherOverlays[type]);
      delete _weatherOverlays[type];
    }
  }
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
  const owmInput = document.getElementById('settings-owm-key');
  if (owmInput) owmInput.value = OWM_KEY;

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
  const owmInput = document.getElementById('settings-owm-key');
  if (owmInput?.value.trim()) {
    OWM_KEY = owmInput.value.trim();
    DB.set('settings/owmKey', OWM_KEY);
  }

  Storage.saveParty();
  Storage.saveSettings();
  closeSettingsModal();
  renderDayMetricsUI(State.selectedDayIndex, State.lastRouteResult?.distKm || 0);
  showToast('Settings saved');
}

// ─── Trip Overview Modal ───────────────────────────────────────
function updateTripOverviewContent() {
  const content = document.getElementById('trip-overview-content');
  if (!content) return;
  const tripMetrics = calcTripMetrics();
  if (!tripMetrics) return;

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
      <div class="cost-breakdown" style="margin-top:6px;">
        <div class="cost-item"><span class="cost-item-label">Entries</span><span class="cost-item-value">€${tripMetrics.totalEntries.toFixed(0)}</span></div>
        <div class="cost-item"><span class="cost-item-label">Meals</span><span class="cost-item-value">€${tripMetrics.totalMeals.toFixed(0)}</span></div>
        ${tripMetrics.totalTransport > 0 ? `<div class="cost-item"><span class="cost-item-label">Transport</span><span class="cost-item-value">€${tripMetrics.totalTransport.toFixed(0)}</span></div>` : ''}
        ${tripMetrics.totalAcc > 0 ? `<div class="cost-item"><span class="cost-item-label">Accommodation</span><span class="cost-item-value">€${tripMetrics.totalAcc.toFixed(0)}</span></div>` : ''}
      </div>
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

}

function openTripOverviewModal() {
  const modal = document.getElementById('trip-overview-modal');
  if (!modal) return;
  updateTripOverviewContent();
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

// ─── Per-Day Route Mode ─────────────────────────────────────────
function getEffectiveRouteMode(date) {
  return State.dayRouteMode[date] || State.layers.routeMode;
}

function switchDayTab(tabName) {
  document.querySelectorAll('.day-subtab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.day-tab-panel').forEach(p => p.style.display = p.dataset.panel === tabName ? '' : 'none');
}

function saveDayEmoji(date, text) {
  const trimmed = text.trim();
  if (!trimmed) { delete State.dayEmojis[date]; }
  else { State.dayEmojis[date] = trimmed; }
  Storage.save();
  renderDayTabs();
}

function saveDayLabel(date, text) {
  const trimmed = text.trim();
  if (!trimmed) { delete State.dayLabels[date]; }
  else { State.dayLabels[date] = trimmed; }
  Storage.save();
  renderDayTabs();
}

function setDayRouteMode(date, mode) {
  State.dayRouteMode[date] = mode;
  Storage.save();
  drawRoute(State.selectedDayIndex);
}

// ─── Day Accommodation & Transport ─────────────────────────────
function setDayAcc(date, accId) {
  if (accId === '__new__') {
    addNewAccommodation(date);
    return;
  }
  if (accId) State.dayAccAssignments[date] = accId;
  else delete State.dayAccAssignments[date];
  Storage.save();
  clearAllRoutes();
  placeMarkers();
  renderAll();
  drawRoute(State.selectedDayIndex);
  renderDayMetricsUI(State.selectedDayIndex, State.lastRouteResult?.distKm || 0);
  loadAndRenderWeatherAll(State.selectedDayIndex);
}

function addNewAccommodation(forDate) {
  const id = 'acc-user-' + Date.now();
  const newAcc = {
    id,
    name: 'New Accommodation',
    location: '',
    lat: 0,
    lng: 0,
    days: [],
    notes: '',
    isUserCreated: true,
  };
  State.trip.accommodations.push(newAcc);
  Storage.saveUserAccs(State.trip.id);
  if (forDate) {
    State.dayAccAssignments[forDate] = id;
    Storage.save();
  }
  renderAll();
  openAccEditModal(id, true);
}

function setDiscoveryRadius(value) {
  State.settings.discoveryRadius = Math.max(1, Math.min(50, parseFloat(value) || 5));
  Storage.saveSettings();
}

function setRouteDiscoveryRadius(value) {
  State.settings.routeDiscoveryRadius = Math.max(1, Math.min(50, parseFloat(value) || 5));
  Storage.saveSettings();
}

function setTransportType(date, type) {
  if (!State.dayTransport[date]) State.dayTransport[date] = {};
  State.dayTransport[date].type = type;
  Storage.save();
  renderAll();
  drawRoute(State.selectedDayIndex); // redraws inter-city route (flight GCC vs driving)
  renderDayMetricsUI(State.selectedDayIndex, State.lastRouteResult?.distKm || 0);
}

function setTransportCost(date, value) {
  if (!State.dayTransport[date]) State.dayTransport[date] = {};
  State.dayTransport[date].costPerPerson = parseFloat(value) || 0;
  Storage.save();
  renderDayMetricsUI(State.selectedDayIndex, State.lastRouteResult?.distKm || 0);
}

// ─── Accommodation Edit Modal ───────────────────────────────────
let _pendingNewAccId = null; // tracks unsaved new acc to revert on cancel

function openAccEditModal(accId, isNew) {
  const acc = State.trip?.accommodations.find(a => a.id === accId);
  if (!acc) return;
  _pendingNewAccId = isNew ? accId : null;
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
  // Show search only for new accommodations
  document.getElementById('ae-search-field').style.display = isNew ? '' : 'none';
  // Show delete only for user-created (non-bundled) accommodations
  document.getElementById('ae-delete-btn').style.display = acc.isUserCreated ? '' : 'none';
  document.getElementById('acc-edit-modal').classList.remove('hidden');
}

function closeAccEditModal() {
  // If there's a pending unsaved new acc, revert it
  if (_pendingNewAccId) {
    const idx = State.trip?.accommodations.findIndex(a => a.id === _pendingNewAccId);
    if (idx >= 0) State.trip.accommodations.splice(idx, 1);
    // Revert any day assignment pointing to it
    for (const [date, id] of Object.entries(State.dayAccAssignments)) {
      if (id === _pendingNewAccId) delete State.dayAccAssignments[date];
    }
    Storage.save();
    Storage.saveUserAccs(State.trip.id);
    _pendingNewAccId = null;
    clearAllRoutes();
    placeMarkers();
    renderAll();
    drawRoute(State.selectedDayIndex);
    renderDayMetricsUI(State.selectedDayIndex, State.lastRouteResult?.distKm || 0);
  }
  document.getElementById('acc-edit-modal').classList.add('hidden');
}

function deleteAccommodation() {
  const accId = document.getElementById('ae-acc-id').value;
  if (!accId) return;
  const acc = State.trip?.accommodations.find(a => a.id === accId);
  if (!acc?.isUserCreated) return;
  // Remove from trip
  State.trip.accommodations = State.trip.accommodations.filter(a => a.id !== accId);
  // Remove any day assignments pointing to it
  for (const [date, id] of Object.entries(State.dayAccAssignments)) {
    if (id === accId) delete State.dayAccAssignments[date];
  }
  // Remove edits
  delete State.accEdits[accId];
  Storage.save();
  Storage.saveAccEdits(State.trip.id);
  Storage.saveUserAccs(State.trip.id);
  _pendingNewAccId = null;
  document.getElementById('acc-edit-modal').classList.add('hidden');
  clearAllRoutes();
  placeMarkers();
  renderAll();
  drawRoute(State.selectedDayIndex);
  renderDayMetricsUI(State.selectedDayIndex, State.lastRouteResult?.distKm || 0);
  showToast('Accommodation deleted');
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
      });
      const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`,
        { headers: { 'Accept-Language': 'en' } });
      const results = r.ok ? await r.json() : [];
      if (!results.length) { resultsEl.innerHTML = '<div class="ae-search-empty">No results</div>'; return; }
      resultsEl.innerHTML = results.map(r => {
        const name = r.name || r.display_name.split(',')[0];
        // Extract city from addressdetails (more reliable than splitting display_name)
        const a = r.address || {};
        const city = a.city || a.town || a.village || a.municipality || a.county || '';
        const country = a.country || '';
        const addr = [city, country].filter(Boolean).join(', ') || r.display_name.split(',').slice(1, 3).join(',').trim();
        return `<div class="ae-search-result" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${esc(name)}" data-addr="${esc(addr)}"
          onclick="App.selectAccLocation(+this.dataset.lat, +this.dataset.lon, this.dataset.name, this.dataset.addr)">
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
  // Store location (city from addr) and display label separately
  if (!State._aePendingLabel) State._aePendingLabel = {};
  State._aePendingLabel[accId] = label;
  if (!State._aePendingLocation) State._aePendingLocation = {};
  // Use addr as location (e.g. "Aracena, Spain") — this is the city, not the hotel name
  State._aePendingLocation[accId] = addr || name;
}

function saveAccEdit() {
  const accId = document.getElementById('ae-acc-id').value;
  if (!accId) return;
  _pendingNewAccId = null; // saved — don't revert on close
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
  // Update accommodation location and name
  if (acc) {
    const editedName = State.accEdits[accId].name;
    if (State._aePendingLocation?.[accId]) {
      // Search was used — set location to city/addr (e.g. "Aracena, Spain"), not hotel name
      acc.location = State._aePendingLocation[accId];
    } else if (!acc.location && editedName) {
      acc.location = editedName;
    }
    if (editedName) acc.name = editedName;
  }
  Storage.saveAccEdits(State.trip.id);
  Storage.saveUserAccs(State.trip.id);
  _pendingNewAccId = null;
  closeAccEditModal();
  clearAllRoutes();
  placeMarkers();
  renderAll();
  drawRoute(State.selectedDayIndex);
  renderDayMetricsUI(State.selectedDayIndex, State.lastRouteResult?.distKm || 0);
  loadAndRenderWeatherAll(State.selectedDayIndex);
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

// Returns the effective accommodation for a date (user override → trip data → null)
function getEffectiveAcc(date) {
  if (!State.trip) return null;
  const override = State.dayAccAssignments[date];
  if (override) return State.trip.accommodations.find(a => a.id === override) || null;
  return State.trip.accommodations.find(a => a.days.includes(date)) || null;
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
  if (dayDate) {
    if (!State.plan[dayDate]) State.plan[dayDate] = [];
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
  const list = inputEl.closest('.day-tab-panel') || inputEl.closest('.add-more-list');
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
  const acc = getEffectiveAcc(day?.date);
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
    playground: 'entertainment', water_park: 'entertainment', nature_reserve: 'nature',
    archaeological_site: 'monument', hot_spring: 'nature',
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
    ratingCount: 0, cost: 'free', costAmount: 0, costLabel: 'Free',
    duration: 1, energyCost: 2, kidsFriendly: 3,
    openingHours: t.opening_hours || '',
    gmapsUrl: `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat},${lng},17z`,
    availableDays: nearestAcc?.days || [day.date],
    tags: ['discovered'],
  };
  State.trip.pois.push(poi);
  State.importedPois.push(poi);
  Storage.saveImported(State.trip.id);
  if (!State.plan[day.date]) State.plan[day.date] = [];
  State.plan[day.date].push(id); Storage.save();
  placeMarkers(); renderAll();
  showToast(`"${name}" added`);
}

// ─── Discover Nearby (Overpass API) ────────────────────────────

async function overpassQuery(lat, lng, radiusM) {
  const q = `[out:json][timeout:15];
(node["tourism"~"^(museum|attraction|viewpoint|artwork|gallery|zoo|theme_park)$"](around:${radiusM},${lat},${lng});
 way["tourism"~"^(museum|attraction|viewpoint|zoo|theme_park)$"]["name"](around:${radiusM},${lat},${lng});
 node["amenity"~"^(restaurant|bar|cafe|pub)$"]["name"](around:${radiusM},${lat},${lng});
 node["leisure"~"^(park|garden|beach|water_park|playground)$"]["name"](around:${radiusM},${lat},${lng});
 way["leisure"~"^(park|garden|beach|water_park|nature_reserve)$"]["name"](around:${radiusM},${lat},${lng});
 node["historic"~"^(castle|ruins|monument|building|church|palace|memorial|archaeological_site)$"]["name"](around:${radiusM},${lat},${lng});
 way["historic"~"^(castle|ruins|monument|palace|archaeological_site)$"]["name"](around:${radiusM},${lat},${lng});
 node["natural"~"^(beach|cliff|peak|cave_entrance|hot_spring)$"]["name"](around:${radiusM},${lat},${lng});
);out center body;`;
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

function clearDiscoveryMarkers() {
  State.discoveryMarkers.forEach(m => State.map?.removeLayer(m));
  State.discoveryMarkers = [];
}

function renderDiscoverResults(elements, containerSel, anchorLat, anchorLng, dayIndex) {
  const existingNames = new Set(State.trip?.pois.map(p => p.name.toLowerCase()) || []);
  const fresh = (elements || [])
    .filter(e => e.tags?.name && !existingNames.has(e.tags.name.toLowerCase()))
    .filter(e => (e.lat && e.lon) || (e.center?.lat && e.center?.lon))
    .sort((a, b) => {
      const ra = parseFloat(a.tags?.stars || a.tags?.['michelin:stars'] || 0);
      const rb = parseFloat(b.tags?.stars || b.tags?.['michelin:stars'] || 0);
      if (rb !== ra) return rb - ra;
      if (anchorLat) {
        const da = haversineKm(anchorLat, anchorLng, a.lat ?? a.center?.lat, a.lon ?? a.center?.lon);
        const db = haversineKm(anchorLat, anchorLng, b.lat ?? b.center?.lat, b.lon ?? b.center?.lon);
        return da - db;
      }
      return 0;
    })
    .slice(0, 30);

  // Place markers on map for discovered results
  clearDiscoveryMarkers();
  if (State.map && State.layers.showSuggested) {
    fresh.forEach(e => {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      const type = e.tags?.tourism || e.tags?.amenity || e.tags?.leisure || e.tags?.historic || e.tags?.natural || '';
      const cat = CATEGORIES[nominatimCategoryMap(type, type)] || CATEGORIES.monument;
      const icon = L.divIcon({
        html: `<div style="width:24px;height:24px;border-radius:50%;background:${cat.color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:12px;opacity:0.8;">${cat.icon}</div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const m = L.marker([lat, lon], { icon })
        .addTo(State.map)
        .bindPopup(`<div style="padding:6px;font-size:12px;"><b>${esc(e.tags.name)}</b><br><span style="color:#666;">${esc(type)}</span></div>`, { maxWidth: 180 });
      State.discoveryMarkers.push(m);
    });
  }

  const html = fresh.length
    ? fresh.map(e => {
        const lat = e.lat ?? e.center?.lat;
        const lon = e.lon ?? e.center?.lon;
        const type = e.tags?.tourism || e.tags?.amenity || e.tags?.leisure || e.tags?.historic || e.tags?.natural || 'attraction';
        const cat = nominatimCategoryMap(type, type);
        const dist = anchorLat ? haversineKm(anchorLat, anchorLng, lat, lon) : null;
        const sub = [type, dist ? formatDist(dist) : null].filter(Boolean).join(' · ');
        return buildDiscoveredCardHtml(lat, lon, e.tags.name, cat, sub, dayIndex, e.tags);
      }).join('')
    : '<div class="discover-empty">No new places found. Try increasing the radius in settings.</div>';
  document.querySelectorAll(containerSel).forEach(el => { el.innerHTML = html; });
}

async function discoverNearby(dayIndex, categoryFilter) {
  const day = getDay(dayIndex);
  const acc = getEffectiveAcc(day?.date);
  if (!acc) { showToast('No accommodation set for this day'); return; }
  document.querySelectorAll('.nearby-discover-results').forEach(el => {
    el.innerHTML = '<div class="discover-loading">🔍 Searching…</div>';
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
  // Filter by category if specified
  const cat = categoryFilter || document.querySelector('.discover-cat-filter')?.value || 'all';
  const filtered = cat === 'all' ? elements : elements.filter(e => {
    const type = e.tags?.tourism || e.tags?.amenity || e.tags?.leisure || e.tags?.historic || e.tags?.natural || '';
    return nominatimCategoryMap(type, type) === cat;
  });
  renderDiscoverResults(filtered, '.nearby-discover-results', aLat, aLng, dayIndex);
}

async function discoverAlongRoute(dayIndex) {
  const day = getDay(dayIndex);
  if (!day) return;
  document.querySelectorAll('.route-discover-results').forEach(el => {
    el.innerHTML = '<div class="discover-loading">🔍 Searching along route…</div>';
  });

  // Sample 7 evenly spaced points along the inter-city route for better coverage
  const coords = State.lastInterCityResult?.geojson?.coordinates;
  let samplePoints = [];
  const samplePcts = [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9];
  if (coords?.length >= 4) {
    samplePcts.forEach(pct => {
      const idx = Math.min(Math.floor(coords.length * pct), coords.length - 1);
      const [lng, lat] = coords[idx];
      samplePoints.push({ lat, lng });
    });
  } else {
    // Fallback: interpolate between departure and arrival accommodations
    const prevDate = State.trip.days[dayIndex - 1]?.date;
    const depAcc = prevDate ? getEffectiveAcc(prevDate) : getHomeAcc();
    let arrAcc = getEffectiveAcc(day.date);
    if (arrAcc && depAcc && arrAcc.id === depAcc.id) arrAcc = getHomeAcc();
    if (!depAcc || !arrAcc) { showToast('Set accommodations for departure and arrival first'); return; }
    const d = getAccCoords(depAcc), a = getAccCoords(arrAcc);
    samplePcts.forEach(f => {
      samplePoints.push({ lat: d.lat + (a.lat - d.lat) * f, lng: d.lng + (a.lng - d.lng) * f });
    });
  }

  const radiusM = (State.settings.routeDiscoveryRadius || 3) * 1000;
  const queries = samplePoints.map(p => overpassQuery(p.lat, p.lng, radiusM));
  const results = await Promise.allSettled(queries);

  // Merge + deduplicate by name
  const seen = new Set();
  const allElements = [];
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    for (const el of r.value) {
      const key = el.tags?.name?.toLowerCase();
      if (key && !seen.has(key)) { seen.add(key); allElements.push(el); }
    }
  }

  if (!allElements.length) {
    document.querySelectorAll('.route-discover-results').forEach(el => {
      el.innerHTML = '<div class="discover-empty">No places found along route. Try increasing the radius in settings.</div>';
    });
    return;
  }
  const mid = samplePoints[Math.floor(samplePoints.length / 2)];
  renderDiscoverResults(allElements, '.route-discover-results', mid.lat, mid.lng, dayIndex);
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
          <label class="settings-label">Cost</label>
          <div class="pe-cost-row">
            <label class="pe-cost-toggle">
              <input type="checkbox" id="pe-free"
                ${!(poi.costAmount > 0) ? 'checked' : ''}
                onchange="document.getElementById('pe-cost-wrap').style.display=this.checked?'none':'flex'">
              Free entry
            </label>
            <div id="pe-cost-wrap" style="display:${poi.costAmount > 0 ? 'flex' : 'none'};align-items:center;gap:6px;margin-top:6px;flex:1">
              <span style="font-size:13px;color:var(--color-text-secondary)">€</span>
              <input id="pe-cost" type="number" class="settings-input" min="0" step="0.5"
                value="${poi.costAmount > 0 ? poi.costAmount : ''}" placeholder="0" style="flex:1">
              <span style="font-size:11px;color:var(--color-text-secondary);white-space:nowrap">per person</span>
            </div>
          </div>
        </div>
        <div class="settings-field">
          <label class="settings-label">Notes / description</label>
          <input id="pe-notes" type="text" class="settings-input"
            value="${esc((poi.description || '').slice(0, 200))}" placeholder="Any notes…">
        </div>
        <div class="settings-field">
          <label class="settings-label">Booking</label>
          <div class="pe-booking-row">
            <label class="pe-cost-toggle">
              <input type="checkbox" id="pe-booked" ${poi.confirmedBooking ? 'checked' : ''}
                onchange="document.getElementById('pe-booking-details').style.display=this.checked?'flex':'none'">
              Booked
            </label>
            <div id="pe-booking-details" style="display:${poi.confirmedBooking ? 'flex' : 'none'};align-items:center;gap:8px;flex-wrap:wrap;">
              <input id="pe-booking-time" type="time" class="settings-input" style="width:110px"
                value="${esc(poi.bookingTime || '')}" title="Booking / visit time">
              <input id="pe-booking-ref" type="text" class="settings-input" style="flex:1;min-width:100px"
                value="${esc(poi.bookingRef || '')}" placeholder="Reference / confirmation #">
            </div>
          </div>
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
  const isFree   = document.getElementById('pe-free')?.checked;
  const costAmt  = isFree ? 0 : (parseFloat(document.getElementById('pe-cost')?.value) || 0);
  if (name) poi.name = name;
  if (category) poi.category = category;
  poi.emoji = emoji;
  if (!isNaN(duration)) poi.duration = duration;
  if (!isNaN(kids)) { poi.kidsFriendly = kids; poi.kidsRating = kids; }
  if (notes !== undefined) poi.description = notes;
  poi.costAmount = costAmt;
  poi.cost = costAmt > 0 ? costAmt : 'free';
  poi.costLabel = costAmt > 0 ? `€${costAmt % 1 === 0 ? costAmt : costAmt.toFixed(1)} pp` : 'Free';
  const booked = document.getElementById('pe-booked')?.checked ?? poi.confirmedBooking;
  poi.confirmedBooking = booked;
  poi.bookingTime = booked ? (document.getElementById('pe-booking-time')?.value || '') : '';
  poi.bookingRef  = booked ? (document.getElementById('pe-booking-ref')?.value.trim() || '') : '';
  if (['imported', 'custom', 'discovered'].includes(poi.source)) Storage.saveImported(State.trip.id);
  // Save edits for ALL POIs (including bundled trip POIs) to Firebase
  Storage.savePoiEdits(State.trip.id);
  document.getElementById('poi-edit-modal')?.classList.add('hidden');
  placeMarkers(); renderAll();
  renderDayMetricsUI(State.selectedDayIndex, State.lastRouteResult?.distKm || 0);
  showToast('Place updated');
}

function parseImportData(text) {
  const places = [];
  const trimmed = text.trim();

  // Try JSON first
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const raw = JSON.parse(trimmed);
      // Google Takeout GeoJSON
      if (raw.type === 'FeatureCollection' && Array.isArray(raw.features)) {
        raw.features.forEach(f => {
          const name = f.properties?.Title || f.properties?.name || 'Unnamed';
          const coords = f.geometry?.coordinates;
          if (!coords || coords.length < 2) return;
          const [lng, lat] = coords;
          places.push({ name, lat, lng, address: f.properties?.Location?.Address || f.properties?.address || '', gmapsUrl: f.properties?.['Google Maps URL'] || '' });
        });
        return { places, format: 'Google Maps Takeout' };
      }
      // Mapstr export (JSON array with name + address + coordinates)
      if (Array.isArray(raw) && raw[0]?.name) {
        raw.forEach(item => {
          const lat = parseFloat(item.lat ?? item.latitude ?? item.coordinates?.lat);
          const lng = parseFloat(item.lng ?? item.lon ?? item.longitude ?? item.coordinates?.lng ?? item.coordinates?.lon);
          if (item.name && !isNaN(lat) && !isNaN(lng)) {
            places.push({ name: item.name, lat, lng, address: item.address || item.location || '', gmapsUrl: item.gmapsUrl || item.url || '' });
          }
        });
        return { places, format: 'JSON array' };
      }
      // GeoJSON with geometry
      if (raw.type === 'Feature' && raw.geometry) {
        const [lng, lat] = raw.geometry.coordinates || [];
        if (lat && lng) places.push({ name: raw.properties?.name || 'Imported', lat, lng, address: '', gmapsUrl: '' });
        return { places, format: 'GeoJSON Feature' };
      }
    } catch { /* not JSON, try other formats */ }
  }

  // KML format
  if (trimmed.includes('<kml') || trimmed.includes('<Placemark')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'text/xml');
    doc.querySelectorAll('Placemark').forEach(pm => {
      const name = pm.querySelector('name')?.textContent?.trim() || 'Unnamed';
      const coordStr = pm.querySelector('coordinates')?.textContent?.trim();
      if (!coordStr) return;
      const [lng, lat] = coordStr.split(',').map(Number);
      if (isNaN(lat) || isNaN(lng)) return;
      const desc = pm.querySelector('description')?.textContent?.trim() || '';
      places.push({ name, lat, lng, address: desc, gmapsUrl: '' });
    });
    return { places, format: 'KML' };
  }

  // CSV format: name,lat,lng[,address] or with headers
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const delim = lines[0].includes('\t') ? '\t' : ',';
    const header = lines[0].toLowerCase().split(delim).map(h => h.trim().replace(/"/g, ''));
    const nameIdx = header.findIndex(h => h === 'name' || h === 'title' || h === 'place');
    const latIdx  = header.findIndex(h => h === 'lat' || h === 'latitude');
    const lngIdx  = header.findIndex(h => h === 'lng' || h === 'lon' || h === 'longitude' || h === 'long');
    const addrIdx = header.findIndex(h => h === 'address' || h === 'location');

    if (nameIdx >= 0 && latIdx >= 0 && lngIdx >= 0) {
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
        const lat = parseFloat(cols[latIdx]);
        const lng = parseFloat(cols[lngIdx]);
        if (cols[nameIdx] && !isNaN(lat) && !isNaN(lng)) {
          places.push({ name: cols[nameIdx], lat, lng, address: addrIdx >= 0 ? (cols[addrIdx] || '') : '', gmapsUrl: '' });
        }
      }
      return { places, format: 'CSV' };
    }
    // Try headerless CSV: name,lat,lng
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 3) {
        const lat = parseFloat(cols[1]);
        const lng = parseFloat(cols[2]);
        if (cols[0] && !isNaN(lat) && !isNaN(lng)) {
          places.push({ name: cols[0], lat, lng, address: cols[3] || '', gmapsUrl: '' });
        }
      }
    }
    if (places.length > 0) return { places, format: 'CSV (no header)' };
  }

  return { places: [], format: null };
}

function importPois() {
  const ta = document.getElementById('import-json');
  const preview = document.getElementById('import-preview');
  if (!ta) return;

  const { places, format } = parseImportData(ta.value);

  if (!format) {
    if (preview) preview.innerHTML = `<div class="import-error">❌ Unrecognized format. Supports: Google Maps Takeout, KML, CSV (name,lat,lng), Mapstr JSON, or GeoJSON.</div>`;
    return;
  }

  if (places.length === 0) {
    if (preview) preview.innerHTML = `<div class="import-error">❌ No valid places found in the file.</div>`;
    return;
  }

  // Radius filter
  const filterEnabled = document.getElementById('import-filter-radius')?.checked;
  const maxKm = parseFloat(document.getElementById('import-radius')?.value) || 50;
  let imported = 0, skipped = 0;
  places.forEach(pl => {
    const id = `imported-${slugify(pl.name)}-${Math.floor(pl.lat * 1000)}`;
    // Don't add duplicates
    if (State.trip.pois.find(p => p.id === id)) return;

    const nearestAcc = findNearestDestination(pl.lat, pl.lng);
    // Skip if too far from any accommodation
    if (filterEnabled && nearestAcc) {
      const { lat: aLat, lng: aLng } = getAccCoords(nearestAcc);
      const dist = haversineKm(pl.lat, pl.lng, aLat, aLng);
      if (dist > maxKm) { skipped++; return; }
    }
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
  const skipMsg = skipped > 0 ? `, ${skipped} skipped (too far)` : '';
  showToast(`Imported ${imported} place${imported !== 1 ? 's' : ''} (${format})${skipMsg}`);
}

function importBooking() {
  if (!State.trip) { showToast('Load a trip first'); return; }
  const name = document.getElementById('bk-name')?.value.trim();
  const checkin = document.getElementById('bk-checkin')?.value;
  const checkout = document.getElementById('bk-checkout')?.value;
  const price = parseFloat(document.getElementById('bk-price')?.value) || 0;
  const ref = document.getElementById('bk-ref')?.value.trim() || '';

  if (!name) { showToast('Enter a hotel/venue name'); return; }
  if (!checkin || !checkout || checkout < checkin) { showToast('Set valid check-in and check-out dates'); return; }

  // Build the list of nights
  const nights = [];
  for (const d = new Date(checkin + 'T12:00:00'); d.toISOString().split('T')[0] < checkout; d.setDate(d.getDate() + 1)) {
    nights.push(d.toISOString().split('T')[0]);
  }

  // Create accommodation
  const id = 'acc-booking-' + Date.now();
  const acc = {
    id, name, location: name,
    lat: 0, lng: 0,
    days: [],
    notes: ref ? `Ref: ${ref}` : '',
    isUserCreated: true,
  };
  State.trip.accommodations.push(acc);
  State.accEdits[id] = { name, notes: acc.notes, pricePerNight: price };

  // Assign to matching trip days
  let assigned = 0;
  nights.forEach(date => {
    if (State.trip.days.find(d => d.date === date)) {
      State.dayAccAssignments[date] = id;
      assigned++;
    }
  });

  Storage.save();
  Storage.saveAccEdits(State.trip.id);
  Storage.saveUserAccs(State.trip.id);
  closeImportModal();
  renderAll();
  showToast(`Booking "${name}" added (${assigned} night${assigned !== 1 ? 's' : ''})${price ? ` · €${price}/night` : ''}`);
  // Open edit modal so user can set coordinates via search
  openAccEditModal(id, true);
}

// ─── Trip Selector ─────────────────────────────────────────────
// ─── User Trip Management ───────────────────────────────────────

async function deleteUserTrip(tripId) {
  if (!confirm('Delete this trip? This cannot be undone.')) return;
  const userTrips = (await Storage.loadUserTrips()).filter(t => t.id !== tripId);
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

function renameUserTrip(tripId, btnEl) {
  const card = btnEl.closest('.trip-card');
  if (!card) return;
  const nameEl = card.querySelector('.trip-card-name');
  if (!nameEl) return;
  const oldName = nameEl.textContent.trim();

  // Replace the name element with an input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'trip-card-name-input';
  input.value = oldName;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = async () => {
    const newName = input.value.trim() || oldName;
    const span = document.createElement('div');
    span.className = 'trip-card-name';
    span.textContent = newName;
    input.replaceWith(span);

    if (newName !== oldName) {
      // Update in registry
      const trip = window._tripRegistry.find(t => t.id === tripId);
      if (trip) trip.name = newName;
      // Persist
      const userTrips = await Storage.loadUserTrips();
      const ut = userTrips.find(t => t.id === tripId);
      if (ut) { ut.name = newName; Storage.saveUserTrips(userTrips); }
      // Update header if this is the active trip
      if (State.trip?.id === tripId) {
        State.trip.name = newName;
        const titleEl = document.querySelector('.header-title');
        if (titleEl) titleEl.textContent = newName;
      }
      showToast('Trip renamed');
    }
  };

  input.onblur = commit;
  input.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = oldName; input.blur(); }
  };
}

function createUserTrip(formData) {
  const slug = formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = `user-${slug}-${Date.now()}`;

  const allDays = [];
  const accommodations = [];
  const defaultDayPlans = {};

  // Add home as origin if provided
  if (formData.home) {
    accommodations.push({
      id: 'acc-home',
      name: `Home — ${formData.home}`,
      location: formData.home,
      lat: 0, lng: 0,
      days: [],
      notes: 'Trip origin & return',
      isHome: true,
    });
  }

  formData.destinations.forEach((dest, di) => {
    const start = new Date(dest.dateFrom + 'T12:00:00');
    const end   = new Date(dest.dateTo   + 'T12:00:00');
    const destDays = [];
    const prevDest = di > 0 ? formData.destinations[di - 1] : null;
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      destDays.push(dateStr);
      const isFirstDayOfLeg = dateStr === dest.dateFrom;
      const isFirstDay = allDays.length === 0;
      // Auto-detect travel day: first day of each leg (except the very first if no home)
      const fromCity = isFirstDay ? (formData.home || null) : (prevDest?.name || null);
      const driving = isFirstDayOfLeg && fromCity ? {
        from: fromCity,
        to: dest.name,
        approxKm: 0,
        approxMin: 0,
        note: '',
      } : null;
      allDays.push({
        date: dateStr,
        label: isFirstDayOfLeg && fromCity ? `${fromCity} → ${dest.name}` : dest.name,
        destination: dest.name,
        emoji: dest.emoji || '📍',
        country: dest.country || '',
        driving,
      });
      defaultDayPlans[dateStr] = [];
    }
    accommodations.push({
      id: `acc-${di}`,
      name: `Accommodation ${dest.name}`,
      location: dest.country ? `${dest.name}, ${dest.country}` : dest.name,
      lat: 0, lng: 0,
      days: destDays,
      notes: '',
    });
  });

  // Add return day if home is set
  const lastDest = formData.destinations[formData.destinations.length - 1];
  if (formData.home && lastDest) {
    const returnDate = new Date(lastDest.dateTo + 'T12:00:00');
    returnDate.setDate(returnDate.getDate() + 1);
    const returnDateStr = returnDate.toISOString().split('T')[0];
    allDays.push({
      date: returnDateStr,
      label: `${lastDest.name} → ${formData.home}`,
      destination: formData.home,
      emoji: '🏠',
      country: '',
      driving: { from: lastDest.name, to: formData.home, approxKm: 0, approxMin: 0, note: '' },
    });
    defaultDayPlans[returnDateStr] = [];
  }

  return {
    id,
    name: formData.name,
    subtitle: formData.destinations.map(d => d.name).join(' · '),
    coverColor: formData.color || '#e07b54',
    emoji: formData.emoji || '✈️',
    isUserCreated: true,
    startDate: allDays[0]?.date,
    endDate: allDays[allDays.length - 1]?.date,
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

        <div class="ntf-row">
          <div class="ntf-field ntf-field-grow">
            <label>Home city (origin &amp; return)</label>
            <input id="ntf-home" type="text" placeholder="e.g. Lisbon" autocomplete="off">
          </div>
        </div>

        <div class="ntf-section-label">Legs / Destinations <button class="ntf-add-dest" onclick="App.ntfAddDestination()">＋ Add</button></div>
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
      <input class="ntf-dest-emoji" type="text" placeholder="📍" maxlength="4" style="width:40px;text-align:center;font-size:18px;" autocomplete="off">
      <input class="ntf-dest-name" type="text" placeholder="City / place name" autocomplete="off">
      <input class="ntf-dest-country" type="text" placeholder="Country" style="max-width:100px;" autocomplete="off">
      <input class="ntf-dest-from" type="date" title="From">
      <input class="ntf-dest-to" type="date" title="To">
    </div>
    ${idx > 0 ? `<button class="ntf-dest-remove" onclick="this.closest('.ntf-dest-row').remove()" title="Remove">×</button>` : ''}`;
  container.appendChild(row);
}

async function ntfSubmit() {
  const name = document.getElementById('ntf-name')?.value.trim();
  if (!name) { showToast('Please enter a trip name'); return; }

  const rows = document.querySelectorAll('#ntf-destinations .ntf-dest-row');
  if (!rows.length) { showToast('Add at least one destination'); return; }

  const destinations = [];
  let valid = true;
  rows.forEach(row => {
    const emoji    = row.querySelector('.ntf-dest-emoji')?.value.trim() || '📍';
    const cityName = row.querySelector('.ntf-dest-name')?.value.trim();
    const country  = row.querySelector('.ntf-dest-country')?.value.trim();
    const dateFrom = row.querySelector('.ntf-dest-from')?.value;
    const dateTo   = row.querySelector('.ntf-dest-to')?.value;
    if (!cityName || !dateFrom || !dateTo) { valid = false; return; }
    if (dateTo < dateFrom) { valid = false; return; }
    destinations.push({ name: cityName, country, emoji, dateFrom, dateTo });
  });

  if (!valid) { showToast('Fill in name + dates for each destination (to ≥ from)'); return; }

  const trip = createUserTrip({
    name,
    emoji: document.getElementById('ntf-emoji')?.value.trim() || '✈️',
    color: document.getElementById('ntf-color')?.value || '#e07b54',
    home: document.getElementById('ntf-home')?.value.trim() || '',
    destinations,
  });

  // Persist
  const userTrips = await Storage.loadUserTrips();
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
    titleEl.innerHTML = `✦ My Trips ${hasActiveTrip
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
        <button class="trip-card-rename" title="Rename trip"
          onclick="event.stopPropagation(); App.renameUserTrip('${esc(t.id)}', this)">✏️</button>
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
async function loadTrip(tripId) {
  const trip = tripRegistry.find(t => t.id === tripId);
  if (!trip) { console.error('Trip not found:', tripId); return; }
  State.trip = trip;
  document.getElementById('trip-selector')?.classList.add('hidden');

  // Restore or initialize plan (async — reads from Firebase)
  const saved = await Storage.load(tripId);
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
    State.dayAccAssignments = saved.dayAccAssignments ?? {};
    State.dayTransport = saved.dayTransport ?? {};
    State.dayRouteMode = saved.dayRouteMode ?? {};
    State.dayLabels = saved.dayLabels ?? {};
    State.dayEmojis = saved.dayEmojis ?? {};
  } else {
    State.plan = {};
    Object.entries(trip.defaultDayPlans).forEach(([d, ids]) => { State.plan[d] = [...ids]; });
    State.selectedDayIndex = 0;
    State.dayAccAssignments = {};
    State.dayTransport = {};
    State.dayRouteMode = {};
    State.dayLabels = {};
    State.dayEmojis = {};
  }

  // Load party config and settings
  const savedParty = await Storage.loadParty();
  if (savedParty && Array.isArray(savedParty)) State.partyConfig = savedParty;
  const savedOwmKey = await DB.get('settings/owmKey');
  if (savedOwmKey) OWM_KEY = savedOwmKey;

  const savedSettings = await Storage.loadSettings();
  if (savedSettings) Object.assign(State.settings, savedSettings);

  // Load accommodation edits + user-created accommodations
  State.accEdits = await Storage.loadAccEdits(tripId);
  const userAccs = await Storage.loadUserAccs(tripId);
  userAccs.forEach(acc => {
    if (!State.trip.accommodations.find(a => a.id === acc.id)) {
      State.trip.accommodations.push(acc);
    }
  });

  // Load previously imported POIs
  const importedPois = await Storage.loadImported(tripId);
  State.importedPois = importedPois;
  importedPois.forEach(poi => {
    if (!State.trip.pois.find(p => p.id === poi.id)) {
      State.trip.pois.push(poi);
    }
  });

  // Apply saved POI edits (covers both bundled and imported POIs)
  const poiEdits = await Storage.loadPoiEdits(tripId);
  State.trip.pois.forEach(poi => {
    const edit = poiEdits[poi.id];
    if (!edit) return;
    if (edit.name) poi.name = edit.name;
    if (edit.category) poi.category = edit.category;
    poi.emoji = edit.emoji ?? poi.emoji;
    if (edit.duration != null) poi.duration = edit.duration;
    if (edit.costAmount != null) { poi.costAmount = edit.costAmount; poi.costLabel = edit.costLabel; poi.cost = edit.cost ?? poi.cost; }
    if (edit.kidsFriendly != null) { poi.kidsFriendly = edit.kidsFriendly; poi.kidsRating = edit.kidsRating; }
    if (edit.description != null) poi.description = edit.description;
    poi.confirmedBooking = edit.confirmedBooking ?? poi.confirmedBooking;
    poi.bookingTime = edit.bookingTime ?? poi.bookingTime;
    poi.bookingRef = edit.bookingRef ?? poi.bookingRef;
  });

  // Header — editable title for user-created trips
  const titleEl = document.querySelector('.header-title');
  titleEl.textContent = trip.name;
  if (trip.isUserCreated) {
    titleEl.contentEditable = 'true';
    titleEl.spellcheck = false;
    titleEl.title = 'Click to rename trip';
    titleEl.onblur = async () => {
      const newName = titleEl.textContent.trim();
      if (newName && newName !== trip.name) {
        trip.name = newName;
        const userTrips = await Storage.loadUserTrips();
        const ut = userTrips.find(t => t.id === trip.id);
        if (ut) { ut.name = newName; Storage.saveUserTrips(userTrips); }
      }
    };
    titleEl.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } };
  } else {
    titleEl.contentEditable = 'false';
  }
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
        <div class="settings-divider">API Keys</div>
        <div class="settings-field">
          <label class="settings-label">OpenWeatherMap key (for rain/cloud overlays)</label>
          <input type="text" id="settings-owm-key" class="settings-input" placeholder="Get free key at openweathermap.org">
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
          <p><strong>Supported formats:</strong></p>
          <div style="font-size:12px;color:var(--color-text-secondary);line-height:1.6;">
            📍 <strong>Google Maps</strong> — Takeout → Maps → Saved Places.json<br>
            📍 <strong>KML</strong> — Google Earth / My Maps export (.kml)<br>
            📍 <strong>CSV</strong> — name, lat, lng [, address] with or without header<br>
            📍 <strong>Mapstr</strong> — JSON export from Mapstr app<br>
            📍 <strong>GeoJSON</strong> — FeatureCollection or Feature
          </div>
        </div>
        <details class="import-booking-section">
          <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--color-accent);margin-bottom:8px;">📋 Add a booking (hotel, activity…)</summary>
          <div class="import-booking-form">
            <input id="bk-name" class="settings-input" type="text" placeholder="Hotel / venue name">
            <div style="display:flex;gap:6px;">
              <input id="bk-checkin" class="settings-input" type="date" style="flex:1" title="Check-in">
              <input id="bk-checkout" class="settings-input" type="date" style="flex:1" title="Check-out">
            </div>
            <div style="display:flex;gap:6px;">
              <input id="bk-price" class="settings-input" type="number" min="0" step="1" placeholder="€/night" style="flex:1">
              <input id="bk-ref" class="settings-input" type="text" placeholder="Booking ref (optional)" style="flex:1">
            </div>
            <button class="modal-btn modal-btn-save" style="width:100%;margin-top:4px;" onclick="App.importBooking()">Add Booking</button>
          </div>
        </details>
        <textarea id="import-json" class="import-textarea" placeholder="Paste content here (JSON, KML, or CSV)…"></textarea>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--color-text-secondary);cursor:pointer;">
            <input type="checkbox" id="import-filter-radius" checked>
            Only within
          </label>
          <input type="number" id="import-radius" class="settings-input" min="1" max="500" step="5" value="50"
            style="width:60px;padding:3px 6px;font-size:12px;">
          <span style="font-size:12px;color:var(--color-text-secondary);">km of any accommodation</span>
        </div>
        <div id="import-preview"></div>
      </div>
      <div class="modal-actions" style="flex-wrap:wrap;gap:6px;">
        <button class="modal-btn" style="background:var(--color-card-bg);border:1px solid var(--color-border);color:var(--color-text-secondary);margin-right:auto;"
          onclick="App.importPlanFile()" title="Load a previously exported plan .json file">📁 Import Plan File</button>
        <button class="modal-btn modal-btn-cancel" onclick="App.closeImportModal()">Cancel</button>
        <button class="modal-btn modal-btn-save" onclick="App.importPois()">Import Places</button>
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
        <div class="settings-field" id="ae-search-field" style="display:none">
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
        <div class="settings-field">
          <label class="settings-label">Coordinates (lat, lng)</label>
          <div style="display:flex;gap:8px;">
            <input type="number" id="ae-lat" class="settings-input" step="0.0001" placeholder="lat" style="flex:1">
            <input type="number" id="ae-lng" class="settings-input" step="0.0001" placeholder="lng" style="flex:1">
          </div>
          <div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">Updates map pin and all distance calculations</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn" id="ae-delete-btn" style="display:none;background:#e74c3c;color:white;margin-right:auto;"
          onclick="App.deleteAccommodation()">🗑️ Delete</button>
        <button class="modal-btn modal-btn-cancel" onclick="App.closeAccEditModal()">Cancel</button>
        <button class="modal-btn modal-btn-save" onclick="App.saveAccEdit()">Save</button>
      </div>
    </div>
  </div>
  `;

  const shareModalHtml = `
  <!-- Share / Export Modal -->
  <div id="share-modal" class="modal-overlay hidden">
    <div class="modal-panel">
      <div class="modal-header">
        <div class="modal-title">🔗 Share Plan</div>
        <button class="modal-close-btn" onclick="App.closeShareModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="share-options">
          <button class="share-option-btn" onclick="App.exportPlan()">
            <span class="share-option-icon">📁</span>
            <div class="share-option-text">
              <div class="share-option-label">Download .json</div>
              <div class="share-option-desc">Send the file via WhatsApp, email, etc. Recipient imports it.</div>
            </div>
          </button>
          <button class="share-option-btn" id="btn-generate-link" onclick="App.generateShareLink()">
            <span class="share-option-icon">🔗</span>
            <div class="share-option-text">
              <div class="share-option-label">Generate short link</div>
              <div class="share-option-desc">Anyone with the link can open the plan in their browser.</div>
            </div>
          </button>
        </div>
        <div id="share-link-area" style="display:none">
          <div id="share-status" class="share-status"></div>
          <div class="share-link-row">
            <input type="text" id="share-link-input" class="share-link-input" readonly placeholder="Generating…">
            <button id="share-copy-btn" class="share-copy-btn" onclick="App.copyShareLink()" disabled>Copy</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Shared Plan Banner (shown when ?share= param detected) -->
  <div id="shared-plan-banner" class="shared-plan-banner hidden">
    <span id="shared-plan-msg">📤 Someone shared a plan with you</span>
    <div class="shared-plan-actions">
      <button class="shared-plan-btn shared-plan-btn-load" onclick="App.loadSharedPlan()">Load it</button>
      <button class="shared-plan-btn" onclick="App.dismissSharedPlan()">Dismiss</button>
    </div>
  </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = modalsHtml + shareModalHtml;
  document.body.appendChild(container);
}

// ─── Export / Share ────────────────────────────────────────────

function buildSharePayload() {
  return {
    version: 2,
    tripId: State.trip.id,
    plan: State.plan,
    accEdits: State.accEdits,
    dayAccAssignments: State.dayAccAssignments,
    dayTransport: State.dayTransport,
    dayRouteMode: State.dayRouteMode,
    dayLabels: State.dayLabels,
    dayEmojis: State.dayEmojis,
    importedPois: State.importedPois,
    userAccommodations: State.trip?.accommodations.filter(a => a.isUserCreated) || [],
    partyConfig: State.partyConfig,
    settings: State.settings,
  };
}

function exportPlan() {
  if (!State.trip) return;
  const json = JSON.stringify(buildSharePayload(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${State.trip.id}-plan.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Plan downloaded');
}

async function generateShareLink() {
  if (!State.trip) return;
  const area = document.getElementById('share-link-area');
  const statusEl = document.getElementById('share-status');
  const inputEl = document.getElementById('share-link-input');
  const copyBtn = document.getElementById('share-copy-btn');
  area.style.display = '';
  statusEl.textContent = '⏳ Compressing plan…';
  inputEl.value = '';
  copyBtn.disabled = true;

  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(buildSharePayload()));
  const fullUrl = `${location.origin}${location.pathname}?share=${compressed}`;

  statusEl.textContent = '⏳ Shortening link…';
  try {
    const r = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(fullUrl)}`);
    if (!r.ok) throw new Error();
    const shortUrl = (await r.text()).trim();
    inputEl.value = shortUrl;
    statusEl.textContent = '✅ Ready — send this link to anyone';
    copyBtn.disabled = false;
  } catch {
    inputEl.value = fullUrl;
    statusEl.textContent = '⚠️ Shortener unavailable — copy the full link below';
    copyBtn.disabled = false;
  }
}

function copyShareLink() {
  const val = document.getElementById('share-link-input')?.value;
  if (!val) return;
  navigator.clipboard?.writeText(val).then(() => showToast('Copied!')).catch(() => {
    document.getElementById('share-link-input').select();
    document.execCommand('copy');
    showToast('Copied!');
  });
}

function openShareModal() {
  if (!State.trip) return;
  const area = document.getElementById('share-link-area');
  if (area) area.style.display = 'none';
  document.getElementById('share-modal')?.classList.remove('hidden');
}

function closeShareModal() {
  document.getElementById('share-modal')?.classList.add('hidden');
}

// ── Shared plan via URL ──────────────────────────────────────────
let _pendingSharedPayload = null;

function checkShareParam() {
  const param = new URLSearchParams(location.search).get('share');
  if (!param) return;
  try {
    const data = JSON.parse(LZString.decompressFromEncodedURIComponent(param));
    if (!data?.tripId || !data?.plan) return;
    _pendingSharedPayload = data;
    const banner = document.getElementById('shared-plan-banner');
    if (banner) {
      document.getElementById('shared-plan-msg').textContent =
        `📤 Shared plan for "${data.tripId}" — load it?`;
      banner.classList.remove('hidden');
    }
    // Clean URL without reloading
    history.replaceState(null, '', location.pathname);
  } catch { /* malformed share param — ignore */ }
}

function loadSharedPlan() {
  const data = _pendingSharedPayload;
  if (!data) return;
  dismissSharedPlan();
  const trip = tripRegistry.find(t => t.id === data.tripId);
  if (!trip) { showToast('Trip not found — make sure you have the same trip loaded'); return; }
  loadTrip(data.tripId);
  // Apply after loadTrip initialises state
  requestAnimationFrame(() => {
    if (data.plan) State.plan = data.plan;
    if (data.dayAccAssignments) State.dayAccAssignments = data.dayAccAssignments;
    if (data.dayTransport) State.dayTransport = data.dayTransport;
    if (data.dayRouteMode) State.dayRouteMode = data.dayRouteMode;
    if (data.dayLabels) State.dayLabels = data.dayLabels;
    if (data.dayEmojis) State.dayEmojis = data.dayEmojis;
    Storage.save();
    if (data.accEdits) { State.accEdits = data.accEdits; Storage.saveAccEdits(data.tripId); }
    // Restore user-created accommodations
    if (data.userAccommodations?.length) {
      data.userAccommodations.forEach(acc => {
        if (!State.trip.accommodations.find(a => a.id === acc.id)) State.trip.accommodations.push(acc);
      });
      Storage.saveUserAccs(data.tripId);
    }
    if (data.importedPois?.length) {
      State.importedPois = data.importedPois;
      data.importedPois.forEach(poi => {
        if (!State.trip.pois.find(p => p.id === poi.id)) State.trip.pois.push(poi);
      });
      Storage.saveImported(data.tripId);
    }
    renderAll();
    showToast('Shared plan loaded ✅');
  });
}

function dismissSharedPlan() {
  document.getElementById('shared-plan-banner')?.classList.add('hidden');
  _pendingSharedPayload = null;
}

// ── Import plan JSON file ────────────────────────────────────────
function importPlanFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.version && data.tripId && data.plan) {
        // It's a plan export
        _pendingSharedPayload = data;
        loadSharedPlan();
      } else {
        // Fall through to Google Maps import
        document.getElementById('import-json').value = text;
        openImportModal();
      }
    } catch { showToast('Could not read file'); }
  };
  input.click();
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

  const btnShare = document.createElement('button');
  btnShare.id = 'btn-share';
  btnShare.title = 'Share / export plan';
  btnShare.textContent = '🔗';
  btnShare.onclick = () => App.openShareModal();
  btnShare.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.85);padding:5px 10px;border-radius:6px;font-size:14px;cursor:pointer;white-space:nowrap;';

  const btnOverview = document.createElement('button');
  btnOverview.id = 'btn-trip-overview';
  btnOverview.title = 'Trip overview & metrics';
  btnOverview.textContent = '📊';
  btnOverview.onclick = () => App.openTripOverviewModal();
  btnOverview.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.85);padding:5px 10px;border-radius:6px;font-size:14px;cursor:pointer;white-space:nowrap;';

  header.appendChild(btnPin);
  header.appendChild(btnImport);
  header.appendChild(btnShare);
  header.appendChild(btnOverview);
}

// ─── Public API ────────────────────────────────────────────────
window.App = {
  selectDay,
  openDetail,
  closeDetail,
  togglePoiInPlan,
  addPoi,
  removePoi,
  movePoiToDay,
  toggleAddMore,
  toggleLayer,
  toggleCategory,
  setRouteMode,
  setMapStyle,
  toggleWeatherOverlay,
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
  renameUserTrip,
  importBooking,
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
  setDayAcc,
  switchDayTab,
  saveDayLabel,
  saveDayEmoji,
  setDiscoveryRadius,
  setRouteDiscoveryRadius,
  addNewAccommodation,
  setDayRouteMode,
  setTransportType,
  setTransportCost,
  openAccEditModal,
  closeAccEditModal,
  saveAccEdit,
  deleteAccommodation,
  accLocationSearch,
  selectAccLocation,
  exportPlan,
  generateShareLink,
  copyShareLink,
  openShareModal,
  closeShareModal,
  loadSharedPlan,
  dismissSharedPlan,
  importPlanFile,
};

// ─── Initialization ────────────────────────────────────────────
let _appBooted = false;

async function init() {
  // Auth gate — wait for Firebase auth state
  if (!Auth.user) {
    const signedIn = await Auth.init();
    if (!signedIn) return; // shows sign-in gate; onAuthStateChanged will re-trigger
  }
  // Ensure app is visible
  document.getElementById('auth-gate').style.display = 'none';
  document.getElementById('app').style.display = '';

  // Only inject DOM elements once (modals, header buttons, listeners)
  if (!_appBooted) {
    _appBooted = true;
    State.isMobile = window.innerWidth < 768;
    injectModals();
  // Inject header buttons
  injectHeaderButtons();
  // Check for ?share= URL param (must be after modals are injected)
  checkShareParam();

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

  } // end of one-time boot

  // Merge user-created trips from Firebase into the live registry
  const userTrips = await Storage.loadUserTrips();
  userTrips.forEach(t => {
    if (!window._tripRegistry.find(x => x.id === t.id)) {
      window._tripRegistry.push(t);
    }
  });

  if (tripRegistry.length === 0) {
    console.error('No trips registered. Check trips/index.js and trip files.');
    return;
  }

  if (tripRegistry.length === 1) {
    await loadTrip(tripRegistry._arr[0].id);
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
