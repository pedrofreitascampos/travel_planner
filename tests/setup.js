/**
 * Test setup — minimal DOM + Firebase + Leaflet mocks for Node.js testing.
 * Loads app.js into the global scope so all functions are accessible.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ─── Minimal DOM Mock ──────────────────────────────────────────

class MockElement {
  constructor(tag) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.id = '';
    this.className = '';
    this.innerHTML = '';
    this.textContent = '';
    this.children = [];
    this.childNodes = [];
    this.parentElement = null;
    this.style = new Proxy({}, {
      get: (t, p) => t[p] || '',
      set: (t, p, v) => { t[p] = v; return true; },
    });
    this.dataset = {};
    this.classList = {
      _set: new Set(),
      add: (...cls) => cls.forEach(c => this.classList._set.add(c)),
      remove: (...cls) => cls.forEach(c => this.classList._set.delete(c)),
      toggle: (c, force) => {
        if (force === undefined) {
          this.classList._set.has(c) ? this.classList._set.delete(c) : this.classList._set.add(c);
        } else if (force) {
          this.classList._set.add(c);
        } else {
          this.classList._set.delete(c);
        }
      },
      contains: (c) => this.classList._set.has(c),
    };
    this._listeners = {};
    this._attributes = {};
  }

  getAttribute(n) { return this._attributes[n] ?? null; }
  setAttribute(n, v) { this._attributes[n] = String(v); }
  removeAttribute(n) { delete this._attributes[n]; }
  addEventListener(ev, fn) {
    if (!this._listeners[ev]) this._listeners[ev] = [];
    this._listeners[ev].push(fn);
  }
  removeEventListener(ev, fn) {
    if (this._listeners[ev]) this._listeners[ev] = this._listeners[ev].filter(f => f !== fn);
  }
  dispatchEvent() { return true; }
  querySelector(sel) { return null; }
  querySelectorAll(sel) { return []; }
  closest(sel) { return null; }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    this.children = this.children.filter(c => c !== child);
    this.childNodes = this.childNodes.filter(c => c !== child);
    child.parentElement = null;
    return child;
  }
  remove() {
    if (this.parentElement) this.parentElement.removeChild(this);
  }
  after() {}
  cloneNode() { return new MockElement(this.tagName); }
  scrollIntoView() {}
  select() {}
  click() {}
  focus() {}
  blur() {}
}

// A map of elements by ID for getElementById
const _elementsById = {};

function ensureElement(id) {
  if (!_elementsById[id]) {
    _elementsById[id] = new MockElement('div');
    _elementsById[id].id = id;
  }
  return _elementsById[id];
}

// Pre-create elements the app expects
const requiredIds = [
  'auth-gate', 'app', 'bottom-sheet', 'g-signin-btn', 'app-header',
  'map', 'poi-detail', 'toast-container', 'layer-btn', 'layer-panel',
  'category-filters', 'layer-controls', 'trip-selector',
  'share-modal', 'share-link-area', 'share-status', 'share-link-input',
  'share-copy-btn', 'shared-plan-banner', 'shared-plan-msg',
  'auth-user-badge',
];
requiredIds.forEach(id => ensureElement(id));

const mockDocument = {
  readyState: 'complete',
  body: new MockElement('body'),
  getElementById(id) { return _elementsById[id] || null; },
  createElement(tag) { return new MockElement(tag); },
  querySelectorAll(sel) { return []; },
  querySelector(sel) { return null; },
  addEventListener(ev, fn) { /* store but don't auto-fire */ },
  removeEventListener() {},
  elementFromPoint() { return null; },
  execCommand() { return false; },
};

// ─── Globals ───────────────────────────────────────────────────

const _dbStore = {};

const mockFirebase = {
  initializeApp() { return {}; },
  auth() {
    return {
      onAuthStateChanged(cb) {
        // Simulate a signed-in user immediately
        cb({
          uid: 'test-uid',
          displayName: 'Test User',
          email: 'pedrofreitascampos@gmail.com',
          photoURL: null,
        });
      },
      signOut() { return Promise.resolve(); },
    };
  },
  database() {
    return {
      ref(path) {
        return {
          once() {
            return Promise.resolve({
              val() { return _dbStore[path] ?? null; },
            });
          },
          set(data) { _dbStore[path] = data; return Promise.resolve(); },
          remove() { delete _dbStore[path]; return Promise.resolve(); },
        };
      },
    };
  },
};
mockFirebase.auth.GoogleAuthProvider = function () {};

// Mock Leaflet
const mockL = {
  map() {
    return {
      on() {},
      removeLayer() {},
      addLayer() {},
      setView() {},
      fitBounds() {},
      invalidateSize() {},
    };
  },
  tileLayer() { return { addTo() { return this; } }; },
  marker() { return { addTo() { return this; }, bindPopup() { return this; } }; },
  divIcon() { return {}; },
  polyline() { return { addTo() { return this; } }; },
  geoJSON() { return { addTo() { return this; } }; },
  latLngBounds() { return {}; },
};

// Mock fetch
function mockFetch() {
  return Promise.resolve({
    ok: true,
    status: 200,
    json() { return Promise.resolve({}); },
    text() { return Promise.resolve(''); },
  });
}

// Mock AbortController
class MockAbortController {
  constructor() { this.signal = {}; }
  abort() {}
}

// ─── Build the sandbox ────────────────────────────────────────

function createTestContext() {
  // Reset element store
  Object.keys(_elementsById).forEach(k => delete _elementsById[k]);
  requiredIds.forEach(id => ensureElement(id));
  // Reset DB store
  Object.keys(_dbStore).forEach(k => delete _dbStore[k]);

  const sandbox = {
    // Browser globals
    window: {},
    __APP_CONFIG: {
      firebase: { apiKey: 'test', authDomain: 'test', databaseURL: 'test', projectId: 'test' },
      allowedEmails: ['pedrofreitascampos@gmail.com'],
    },
    document: mockDocument,
    firebase: mockFirebase,
    L: mockL,
    fetch: mockFetch,
    AbortController: MockAbortController,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    console,
    alert: () => {},
    confirm: () => true,
    prompt: () => '',
    location: { search: '', origin: 'https://test.example.com', pathname: '/', reload() {} },
    history: { replaceState() {} },
    navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
    URL: { createObjectURL() { return 'blob:mock'; }, revokeObjectURL() {} },
    Blob: function (parts, opts) { this.parts = parts; this.type = opts?.type; },
    URLSearchParams,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Symbol,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Proxy,
    Reflect,
    RegExp,
    Error,
    TypeError,
    RangeError,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    LZString: {
      compressToEncodedURIComponent(s) { return s; },
      decompressFromEncodedURIComponent(s) { return s; },
    },
  };

  // window === sandbox (self-referencing)
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  // Create VM context
  const ctx = vm.createContext(sandbox);

  // Load app.js
  const appCode = fs.readFileSync(
    path.join(__dirname, '..', 'app.js'),
    'utf-8'
  );

  // We need to prevent the auto-init at the bottom of app.js
  // Replace the boot trigger with a no-op
  let patchedCode = appCode
    .replace(
      /if\s*\(document\.readyState\s*===\s*'loading'\)\s*\{[\s\S]*?\}\s*else\s*\{[\s\S]*?\}/,
      '// auto-init disabled for tests'
    );

  // Strip 'use strict' so function declarations leak to global scope
  patchedCode = patchedCode.replace(/^'use strict';/m, '// use strict disabled for tests');

  // Append explicit exports of const-declared objects to window
  patchedCode += `
    window.State = State;
    window.Storage = Storage;
    window.DB = DB;
    window.Auth = Auth;
    window.CATEGORIES = CATEGORIES;
    window.DAY_COLORS = DAY_COLORS;
    window.WMO_CODES = WMO_CODES;
    window.ALLOWED_EMAILS = ALLOWED_EMAILS;
    window.tripRegistry = tripRegistry;
    window.METRIC_TOOLTIPS = METRIC_TOOLTIPS;
    window.EMOJI_GRID = EMOJI_GRID;
    window.saveAccEdit = saveAccEdit;
    window.savePoiEdit = savePoiEdit;
    window._pendingNewAccId = typeof _pendingNewAccId !== 'undefined' ? _pendingNewAccId : null;
    window.isGoogleMode = isGoogleMode;
    window.trackApiRequest = trackApiRequest;
    window.resetApiQuota = resetApiQuota;
    window.loadApiQuota = loadApiQuota;
    window.updateQuotaDisplay = updateQuotaDisplay;
    window.setMapStyle = setMapStyle;
    window.Log = Log;
    window.renderRadarChartSVG = renderRadarChartSVG;
    window.renderMetricBar = renderMetricBar;
    window.renderDayMetricsUI = renderDayMetricsUI;
    window.calcDayMetrics = calcDayMetrics;
    window.calcTripMetrics = calcTripMetrics;
    window.generateDayNarrative = generateDayNarrative;
    window.renderComparisonRadarSVG = renderComparisonRadarSVG;
    window.renderPackingWeatherSummary = renderPackingWeatherSummary;
    window.OIKUMENE_CAT_MAP = OIKUMENE_CAT_MAP;
    window.buildOikumeneExport = buildOikumeneExport;
    window.getPoiTransportMode = getPoiTransportMode;
    window.togglePoiTransport = togglePoiTransport;
    window.copyDayPois = copyDayPois;
    window.resolveGoogleMapsLink = resolveGoogleMapsLink;
    window.addFromGoogleLink = addFromGoogleLink;
    window.buildCalendarUrl = buildCalendarUrl;
    window.THEME_CYCLE = THEME_CYCLE;
    window.enrichPoi = enrichPoi;
    window.addToShortlist = addToShortlist;
    window.reorderPlan = reorderPlan;
    window.promoteFromShortlist = promoteFromShortlist;
    window.removeFromShortlist = removeFromShortlist;
    window.isPoiShortlisted = isPoiShortlisted;
    window.cycleWatchlistPriority = cycleWatchlistPriority;
    window.getWatchlistPriority = getWatchlistPriority;
    window.getEffectiveLegMode = getEffectiveLegMode;
  `;

  vm.runInContext(patchedCode, ctx, { filename: 'app.js' });

  // Expose the sandbox as ctx.global for tests that need to mock document
  ctx.global = sandbox;

  return ctx;
}

// ─── Test helpers ─────────────────────────────────────────────

/** Set up a minimal trip in State for testing */
function installMockTrip(ctx) {
  const trip = {
    id: 'test-trip',
    days: [
      { date: '2026-06-01', label: 'Day 1', emoji: '🏖️', country: 'Portugal' },
      { date: '2026-06-02', label: 'Day 2', emoji: '🏛️', country: 'Portugal', driving: { approxKm: 120, approxMin: 90 } },
      { date: '2026-06-03', label: 'Day 3', emoji: '🌿', country: 'Portugal' },
    ],
    accommodations: [
      { id: 'acc-home', name: 'Home', location: 'Berlin, Germany', lat: 52.52, lng: 13.405, days: [], isHome: true },
      { id: 'acc-lisbon', name: 'Lisbon Hotel', location: 'Lisbon, Portugal', lat: 38.72, lng: -9.14, days: ['2026-06-01', '2026-06-02'] },
      { id: 'acc-sintra', name: 'Sintra B&B', location: 'Sintra, Portugal', lat: 38.80, lng: -9.39, days: ['2026-06-03'] },
    ],
    pois: [
      {
        id: 'poi-1', name: 'Belem Tower', category: 'monument', lat: 38.69, lng: -9.22,
        duration: 1.5, cost: 10, costAmount: 10, costLabel: '€10', rating: 4.5,
        kidsFriendly: 3, kidsRating: 3, energyCost: 2, description: 'Historic tower',
        source: 'user', availableDays: ['2026-06-01', '2026-06-02'],
        tags: [], confirmedBooking: false, bookAhead: false,
      },
      {
        id: 'poi-2', name: 'Time Out Market', category: 'food', lat: 38.71, lng: -9.15,
        duration: 2, cost: 25, costAmount: 25, costLabel: '€25', rating: 4,
        kidsFriendly: 4, kidsRating: 4, energyCost: 1, description: 'Food hall',
        source: 'user', availableDays: ['2026-06-01', '2026-06-02'],
        tags: ['market'], confirmedBooking: false, bookAhead: false,
      },
      {
        id: 'poi-3', name: 'Pena Palace', category: 'monument', lat: 38.79, lng: -9.39,
        duration: 3, cost: 14, costAmount: 14, costLabel: '€14', rating: 4.8,
        kidsFriendly: 3, kidsRating: 3, energyCost: 3, description: 'Palace in Sintra',
        source: 'user', availableDays: ['2026-06-03'],
        tags: ['book-ahead'], confirmedBooking: true, bookAhead: true,
        bookingTime: '10:00', bookingRef: 'REF123',
      },
      {
        id: 'poi-free', name: 'Parque das Nacoes', category: 'park', lat: 38.77, lng: -9.10,
        duration: 1, cost: 'free', costAmount: 0, costLabel: 'Free', rating: 4,
        kidsFriendly: 5, kidsRating: 5, energyCost: 1, description: 'Park area',
        source: 'suggested', availableDays: ['2026-06-01', '2026-06-02', '2026-06-03'],
        tags: [], confirmedBooking: false, bookAhead: false,
      },
    ],
    defaultDayPlans: {
      '2026-06-01': ['poi-1', 'poi-2'],
      '2026-06-02': ['poi-3'],
      '2026-06-03': [],
    },
    confirmedBookings: { 'poi-3': true },
  };

  ctx.State.trip = trip;
  ctx.State.plan = {
    '2026-06-01': ['poi-1', 'poi-2'],
    '2026-06-02': [],
    '2026-06-03': ['poi-3'],
  };
  ctx.State.partyConfig = [35, 38, 3, 6];
  ctx.State.settings = {
    fuelPrice: 1.70,
    carConsumption: 7.5,
    dailyMealBudget: 22,
    discoveryRadius: 5,
    routeDiscoveryRadius: 5,
    dataSource: 'osm',
  };
  ctx.State.accEdits = {
    'acc-lisbon': { pricePerNight: 95 },
  };
  ctx.State.dayAccAssignments = {};
  ctx.State.dayTransport = {};
  ctx.State.dayRouteMode = {};
  ctx.State.dayLabels = {};
  ctx.State.dayEmojis = {};
  ctx.State.importedPois = [];
  ctx.State.selectedDayIndex = 0;
  ctx.State.layers = {
    showUser: true,
    showSuggested: true,
    showAllDays: false,
    routeMode: 'foot',
    categories: { monument: true, museum: true, food: true, bar: true, nature: true, park: true, beach: true, cave: true, entertainment: true, neighborhood: true },
  };
}

module.exports = { createTestContext, installMockTrip, ensureElement, MockElement };
