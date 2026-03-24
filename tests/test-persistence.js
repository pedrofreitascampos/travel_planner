/**
 * Tests for Storage persistence logic.
 */

'use strict';

const assert = require('assert');
const { createTestContext, installMockTrip } = require('./setup');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ─── save() includes all state fields ──────────────────────────

test('Storage.save: includes all required state fields in DB write', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Set some non-default values
  ctx.State.dayAccAssignments = { '2026-06-01': 'acc-sintra' };
  ctx.State.dayTransport = { '2026-06-02': { type: 'train', costPerPerson: 30, durationMin: 120 } };
  ctx.State.dayRouteMode = { '2026-06-01': 'driving' };
  ctx.State.dayLabels = { '2026-06-01': 'Lisbon Day' };
  ctx.State.dayEmojis = { '2026-06-01': '🌞' };

  // Capture what DB.set is called with
  let capturedPath = null;
  let capturedData = null;
  const origSet = ctx.DB.set;
  ctx.DB.set = (path, data) => {
    if (path.includes('/plan')) {
      capturedPath = path;
      capturedData = data;
    }
    return Promise.resolve();
  };

  ctx.Storage.save();

  assert.ok(capturedData, 'DB.set should have been called with plan data');
  assert.ok(capturedData.plan, 'Saved data must include plan');
  assert.ok(capturedData.dayAccAssignments, 'Saved data must include dayAccAssignments');
  assert.ok(capturedData.dayTransport, 'Saved data must include dayTransport');
  assert.ok(capturedData.dayRouteMode, 'Saved data must include dayRouteMode');
  assert.ok(capturedData.dayLabels, 'Saved data must include dayLabels');
  assert.ok(capturedData.dayEmojis, 'Saved data must include dayEmojis');
  assert.strictEqual(capturedData.dayLabels['2026-06-01'], 'Lisbon Day');
  assert.strictEqual(capturedData.dayEmojis['2026-06-01'], '🌞');

  ctx.DB.set = origSet;
});

test('Storage.save: does nothing when State.trip is null', () => {
  const ctx = createTestContext();
  ctx.State.trip = null;

  let called = false;
  const origSet = ctx.DB.set;
  ctx.DB.set = () => { called = true; return Promise.resolve(); };

  ctx.Storage.save();
  assert.ok(!called, 'DB.set should not be called when trip is null');

  ctx.DB.set = origSet;
});

// ─── savePoiEdits stores all editable fields ───────────────────

test('Storage.savePoiEdits: stores all editable POI fields', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  let capturedData = null;
  const origSet = ctx.DB.set;
  ctx.DB.set = (path, data) => {
    if (path.includes('poiEdits')) capturedData = data;
    return Promise.resolve();
  };

  ctx.Storage.savePoiEdits('test-trip');

  assert.ok(capturedData, 'poiEdits should have been saved');
  assert.ok(capturedData['poi-1'], 'Should have entry for poi-1');

  // Check all expected fields
  const edit = capturedData['poi-1'];
  const expectedFields = [
    'name', 'category', 'emoji', 'duration', 'costAmount', 'costLabel',
    'kidsFriendly', 'kidsRating', 'description', 'confirmedBooking',
    'bookingTime', 'bookingRef',
  ];
  for (const field of expectedFields) {
    assert.ok(field in edit, `poiEdits should include field "${field}"`);
  }

  // Verify poi-3 has booking data
  const edit3 = capturedData['poi-3'];
  assert.strictEqual(edit3.confirmedBooking, true, 'poi-3 should have confirmedBooking=true');
  assert.strictEqual(edit3.bookingTime, '10:00', 'poi-3 should have bookingTime');
  assert.strictEqual(edit3.bookingRef, 'REF123', 'poi-3 should have bookingRef');

  ctx.DB.set = origSet;
});

// ─── loadUserTrips returns array (not promise treated as array) ─

test('Storage.loadUserTrips: returns an array, not a raw promise', async () => {
  const ctx = createTestContext();

  // The function should always return an array (or resolve to one)
  const result = await ctx.Storage.loadUserTrips();

  assert.ok(Array.isArray(result), 'loadUserTrips must return an array');
});

test('Storage.loadUserTrips: returns empty array when DB has null', async () => {
  const ctx = createTestContext();

  // DB.get returns null by default (no data stored)
  const result = await ctx.Storage.loadUserTrips();
  assert.ok(Array.isArray(result), 'Should be an array');
  assert.strictEqual(result.length, 0, 'Should be empty array when DB has null');
});

test('Storage.loadUserTrips: result can be iterated with forEach', async () => {
  const ctx = createTestContext();

  const result = await ctx.Storage.loadUserTrips();
  // This is the pattern used in init() — must not throw
  let count = 0;
  result.forEach(() => { count++; });
  assert.strictEqual(count, 0, 'forEach should work on empty array');
});

// ─── load returns saved data correctly ─────────────────────────

test('Storage.load: returns null when no data is saved', async () => {
  const ctx = createTestContext();
  const result = await ctx.Storage.load('nonexistent-trip');
  assert.strictEqual(result, null, 'Should return null for non-existent trip');
});

// ─── saveAccEdits and loadAccEdits roundtrip ───────────────────

test('Storage.saveAccEdits/loadAccEdits: roundtrip preserves data', async () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  ctx.State.accEdits = {
    'acc-lisbon': { pricePerNight: 120, name: 'Updated Hotel', notes: 'Great view' },
    'acc-sintra': { pricePerNight: 80 },
  };

  ctx.Storage.saveAccEdits('test-trip');

  // loadAccEdits reads from the same DB
  const loaded = await ctx.Storage.loadAccEdits('test-trip');
  assert.ok(loaded, 'Loaded accEdits should exist');
  assert.strictEqual(loaded['acc-lisbon'].pricePerNight, 120);
  assert.strictEqual(loaded['acc-sintra'].pricePerNight, 80);
});

// ─── saveImported/loadImported ─────────────────────────────────

test('Storage.loadImported: returns empty array for fresh trip', async () => {
  const ctx = createTestContext();
  const result = await ctx.Storage.loadImported('new-trip');
  assert.ok(Array.isArray(result), 'Should return an array');
  assert.strictEqual(result.length, 0, 'Should be empty for fresh trip');
});

// ─── clear removes trip data ───────────────────────────────────

test('Storage.clear: calls DB.remove on the trip path', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  let removedPath = null;
  const origRemove = ctx.DB.remove;
  ctx.DB.remove = (path) => { removedPath = path; return Promise.resolve(); };

  ctx.Storage.clear('test-trip');

  assert.ok(removedPath, 'DB.remove should have been called');
  assert.ok(removedPath.includes('test-trip'), 'Should remove the trip path');

  ctx.DB.remove = origRemove;
});

// ─── Accommodation location persistence ─────────────────────────

test('saveAccEdit: updates acc.location from search result label', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const acc = ctx.State.trip.accommodations.find(a => a.id === 'acc-sintra');
  acc.location = '';

  if (!ctx.State._aePendingLabel) ctx.State._aePendingLabel = {};
  ctx.State._aePendingLabel['acc-sintra'] = 'Hotel Essentia, Aracena, Spain';
  if (!ctx.State._aePendingLocation) ctx.State._aePendingLocation = {};
  ctx.State._aePendingLocation['acc-sintra'] = 'Aracena, Spain';

  const mockModal = { classList: { add() {}, remove() {} } };
  const mockDom = {
    'ae-acc-id': { value: 'acc-sintra' },
    'ae-name': { value: 'Hotel Essentia' },
    'ae-notes': { value: 'Nice place' },
    'ae-price': { value: '80' },
    'ae-lat': { value: '37.89' },
    'ae-lng': { value: '-6.55' },
    'acc-edit-modal': mockModal,
  };
  const origGetEl = ctx.global.document.getElementById;
  ctx.global.document.getElementById = (id) => mockDom[id] || origGetEl(id);

  ctx.saveAccEdit();

  assert.strictEqual(acc.location, 'Aracena, Spain', 'acc.location should be city from search, not hotel name');
  assert.strictEqual(acc.name, 'Hotel Essentia', 'acc.name should be updated from edit');
  ctx.global.document.getElementById = origGetEl;
});

test('saveAccEdit: sets location from name when no search was used', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const acc = ctx.State.trip.accommodations.find(a => a.id === 'acc-sintra');
  acc.location = '';
  ctx.State._aePendingLabel = {};

  const mockModal = { classList: { add() {}, remove() {} } };
  const mockDom = {
    'ae-acc-id': { value: 'acc-sintra' },
    'ae-name': { value: 'Casa Rural Aracena' },
    'ae-notes': { value: '' },
    'ae-price': { value: '0' },
    'ae-lat': { value: '0' },
    'ae-lng': { value: '0' },
    'acc-edit-modal': mockModal,
  };
  const origGetEl = ctx.global.document.getElementById;
  ctx.global.document.getElementById = (id) => mockDom[id] || origGetEl(id);

  ctx.saveAccEdit();

  assert.strictEqual(acc.location, 'Casa Rural Aracena', 'acc.location should fallback to edited name');
  ctx.global.document.getElementById = origGetEl;
});

test('saveAccEdit: preserves existing location when no search used', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const acc = ctx.State.trip.accommodations.find(a => a.id === 'acc-lisbon');
  const origLoc = acc.location;
  ctx.State._aePendingLabel = {};

  const mockModal = { classList: { add() {}, remove() {} } };
  const mockDom = {
    'ae-acc-id': { value: 'acc-lisbon' },
    'ae-name': { value: 'Updated Name' },
    'ae-notes': { value: '' },
    'ae-price': { value: '100' },
    'ae-lat': { value: String(acc.lat) },
    'ae-lng': { value: String(acc.lng) },
    'acc-edit-modal': mockModal,
  };
  const origGetEl = ctx.global.document.getElementById;
  ctx.global.document.getElementById = (id) => mockDom[id] || origGetEl(id);

  ctx.saveAccEdit();

  assert.strictEqual(acc.location, origLoc, 'existing location should not be overwritten');
  ctx.global.document.getElementById = origGetEl;
});

// ─── POI edit persistence ───────────────────────────────────────

test('savePoiEdit: persists cost, booking, duration changes', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const poi = ctx.State.trip.pois[0];
  const origName = poi.name;

  const mockDom = {
    'pe-name': { value: 'Renamed POI' },
    'pe-category': { value: 'food' },
    'pe-emoji': { value: '🍕', trim() { return '🍕'; } },
    'pe-duration': { value: '2.5' },
    'pe-kids': { value: '4' },
    'pe-notes': { value: 'Great spot', trim() { return 'Great spot'; } },
    'pe-free': { checked: false },
    'pe-cost': { value: '15' },
    'pe-booked': { checked: true },
    'pe-booking-time': { value: '14:30' },
    'pe-booking-ref': { value: 'REF999', trim() { return 'REF999'; } },
    'poi-edit-modal': { classList: { add() {} } },
  };
  const origGetEl = ctx.global.document.getElementById;
  ctx.global.document.getElementById = (id) => mockDom[id] || origGetEl(id);

  ctx.savePoiEdit(poi.id);

  assert.strictEqual(poi.name, 'Renamed POI');
  assert.strictEqual(poi.category, 'food');
  assert.strictEqual(poi.duration, 2.5);
  assert.strictEqual(poi.costAmount, 15);
  assert.strictEqual(poi.confirmedBooking, true);
  assert.strictEqual(poi.bookingTime, '14:30');
  assert.strictEqual(poi.bookingRef, 'REF999');

  ctx.global.document.getElementById = origGetEl;
});

test('savePoiEdit: calls Storage.savePoiEdits', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  let savedTripId = null;
  const origSave = ctx.Storage.savePoiEdits;
  ctx.Storage.savePoiEdits = (tripId) => { savedTripId = tripId; };

  const poi = ctx.State.trip.pois[0];
  const mockDom = {
    'pe-name': { value: poi.name },
    'pe-category': { value: poi.category },
    'pe-emoji': { value: '', trim() { return ''; } },
    'pe-duration': { value: '1' },
    'pe-kids': { value: '3' },
    'pe-notes': { value: '', trim() { return ''; } },
    'pe-free': { checked: true },
    'pe-cost': { value: '0' },
    'pe-booked': { checked: false },
    'pe-booking-time': { value: '' },
    'pe-booking-ref': { value: '', trim() { return ''; } },
    'poi-edit-modal': { classList: { add() {} } },
  };
  const origGetEl = ctx.global.document.getElementById;
  ctx.global.document.getElementById = (id) => mockDom[id] || origGetEl(id);

  ctx.savePoiEdit(poi.id);

  assert.strictEqual(savedTripId, 'test-trip', 'savePoiEdits should be called with trip ID');

  ctx.Storage.savePoiEdits = origSave;
  ctx.global.document.getElementById = origGetEl;
});

// ─── Accommodation change triggers full recalculation ────────────

test('setDayAcc: calls clearAllRoutes + drawRoute + renderDayMetricsUI', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  let routeCleared = false;
  let routeDrawn = false;
  let metricsRendered = false;

  const origClear = ctx.clearAllRoutes;
  const origDraw = ctx.drawRoute;
  const origMetrics = ctx.renderDayMetricsUI;
  ctx.clearAllRoutes = () => { routeCleared = true; };
  ctx.drawRoute = () => { routeDrawn = true; };
  ctx.renderDayMetricsUI = () => { metricsRendered = true; };

  ctx.setDayAcc('2026-06-01', 'acc-sintra');

  assert.ok(routeCleared, 'clearAllRoutes should be called');
  assert.ok(routeDrawn, 'drawRoute should be called');
  assert.ok(metricsRendered, 'renderDayMetricsUI should be called');

  ctx.clearAllRoutes = origClear;
  ctx.drawRoute = origDraw;
  ctx.renderDayMetricsUI = origMetrics;
});

test('deleteAccommodation: clears routes and recalculates metrics', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Add a user-created acc to delete
  const acc = { id: 'acc-delete-me', name: 'Delete Me', location: 'Test', lat: 0, lng: 0, days: [], isUserCreated: true };
  ctx.State.trip.accommodations.push(acc);
  ctx.State.dayAccAssignments['2026-06-01'] = 'acc-delete-me';

  let routeCleared = false;
  let routeDrawn = false;
  const origClear = ctx.clearAllRoutes;
  const origDraw = ctx.drawRoute;
  ctx.clearAllRoutes = () => { routeCleared = true; };
  ctx.drawRoute = () => { routeDrawn = true; };

  // Mock DOM for deleteAccommodation
  const origGetEl = ctx.global.document.getElementById;
  ctx.global.document.getElementById = (id) => {
    if (id === 'ae-acc-id') return { value: 'acc-delete-me' };
    if (id === 'acc-edit-modal') return { classList: { add() {} } };
    return origGetEl(id);
  };

  ctx.deleteAccommodation();

  assert.ok(routeCleared, 'clearAllRoutes should be called on delete');
  assert.ok(routeDrawn, 'drawRoute should be called on delete');
  assert.ok(!ctx.State.dayAccAssignments['2026-06-01'], 'Assignment should be removed');

  ctx.clearAllRoutes = origClear;
  ctx.drawRoute = origDraw;
  ctx.global.document.getElementById = origGetEl;
});

test('loadPoiEdits: restores POI edits on trip load', async () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Simulate saved POI edits in Firebase
  const edits = {
    'poi-1': { name: 'Edited Name', costAmount: 25, confirmedBooking: true, bookingTime: '10:00' },
  };
  await ctx.DB.set('trips/test-trip/poiEdits', edits);

  const loaded = await ctx.Storage.loadPoiEdits('test-trip');
  assert.ok(loaded['poi-1'], 'Should have poi-1 edits');
  assert.strictEqual(loaded['poi-1'].name, 'Edited Name');
  assert.strictEqual(loaded['poi-1'].costAmount, 25);
  assert.strictEqual(loaded['poi-1'].confirmedBooking, true);
});

module.exports = tests;
