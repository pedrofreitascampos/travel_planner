/**
 * Tests for Oikumene export functionality.
 */

'use strict';

const assert = require('assert');
const { createTestContext, installMockTrip } = require('./setup');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ─── Category mapping ────────────────────────────────────────

test('OIKUMENE_CAT_MAP: maps all Bifrost categories', () => {
  const ctx = createTestContext();
  const map = ctx.OIKUMENE_CAT_MAP;

  assert.strictEqual(map.monument, 'monument');
  assert.strictEqual(map.museum, 'museum');
  assert.strictEqual(map.food, 'restaurant');
  assert.strictEqual(map.bar, 'bar');
  assert.strictEqual(map.nature, 'park');
  assert.strictEqual(map.park, 'park');
  assert.strictEqual(map.beach, 'location');
  assert.strictEqual(map.cave, 'location');
  assert.strictEqual(map.entertainment, 'event');
  assert.strictEqual(map.neighborhood, 'location');
});

// ─── Export structure ────────────────────────────────────────

test('buildOikumeneExport: returns correct top-level structure', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const data = ctx.buildOikumeneExport();

  assert.ok(data.exportDate, 'should have exportDate');
  assert.ok(Array.isArray(data.locations), 'should have locations array');
  assert.ok(Array.isArray(data.trips), 'should have trips array');
  assert.ok(Array.isArray(data.collections), 'should have collections array');
  assert.strictEqual(data.collections.length, 0, 'collections should be empty');
});

test('buildOikumeneExport: trip metadata is correct', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const data = ctx.buildOikumeneExport();
  assert.strictEqual(data.trips.length, 1);

  const trip = data.trips[0];
  assert.strictEqual(trip.id, 'test-trip');
  assert.ok(trip.name || trip.id, 'trip should have name or id');
  assert.ok(trip.color, 'trip should have color');
});

// ─── POI export ──────────────────────────────────────────────

test('buildOikumeneExport: exports POIs as locations with correct fields', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const data = ctx.buildOikumeneExport();
  const belem = data.locations.find(l => l.name === 'Belem Tower');

  assert.ok(belem, 'Belem Tower should be exported');
  assert.strictEqual(belem.category, 'monument');
  assert.strictEqual(belem.lat, 38.69);
  assert.strictEqual(belem.lng, -9.22);
  assert.strictEqual(belem.tripId, 'test-trip');
  assert.strictEqual(belem.needsApproval, false);
  assert.ok(Array.isArray(belem.visits), 'should have visits array');
  assert.ok(Array.isArray(belem.people), 'should have people array');
  assert.ok(Array.isArray(belem.tags), 'should have tags array');
});

test('buildOikumeneExport: food category maps to restaurant', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const data = ctx.buildOikumeneExport();
  const market = data.locations.find(l => l.name === 'Time Out Market');

  assert.ok(market, 'Time Out Market should be exported');
  assert.strictEqual(market.category, 'restaurant');
});

test('buildOikumeneExport: park category maps to park', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const data = ctx.buildOikumeneExport();
  const park = data.locations.find(l => l.name === 'Parque das Nacoes');

  assert.ok(park, 'Parque das Nacoes should be exported');
  assert.strictEqual(park.category, 'park');
});

// ─── Visit dates from plan ───────────────────────────────────

test('buildOikumeneExport: planned POIs get visit dates and status "been"', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const data = ctx.buildOikumeneExport();
  const belem = data.locations.find(l => l.name === 'Belem Tower');

  assert.strictEqual(belem.status, 'been');
  assert.strictEqual(belem.visits.length, 1);
  assert.strictEqual(belem.visits[0].date, '2026-06-01');
});

test('buildOikumeneExport: unplanned POIs get status "bucket" and no visits', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const data = ctx.buildOikumeneExport();
  const park = data.locations.find(l => l.name === 'Parque das Nacoes');

  assert.strictEqual(park.status, 'bucket');
  assert.strictEqual(park.visits.length, 0);
});

// ─── Accommodation export ────────────────────────────────────

test('buildOikumeneExport: accommodations exported as hotel category', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const data = ctx.buildOikumeneExport();
  const hotel = data.locations.find(l => l.name === 'Lisbon Hotel');

  assert.ok(hotel, 'Lisbon Hotel should be exported');
  assert.strictEqual(hotel.category, 'hotel');
  assert.ok(hotel.tags.includes('accommodation'), 'should be tagged as accommodation');
  assert.strictEqual(hotel.visits.length, 2, 'should have 2 visit dates (nights)');
});

test('buildOikumeneExport: home accommodation is excluded', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const data = ctx.buildOikumeneExport();
  const home = data.locations.find(l => l.name === 'Home');

  assert.ok(!home, 'Home accommodation should not be exported');
});

test('buildOikumeneExport: accommodations with lat/lng 0,0 are excluded', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  // Add an accommodation without coordinates
  ctx.State.trip.accommodations.push({
    id: 'acc-nocoords', name: 'No Location', location: 'Somewhere',
    lat: 0, lng: 0, days: ['2026-06-01'], notes: '',
  });

  const data = ctx.buildOikumeneExport();
  const noCoords = data.locations.find(l => l.name === 'No Location');

  assert.ok(!noCoords, 'Accommodation without coordinates should be excluded');
});

// ─── Price level mapping ─────────────────────────────────────

test('buildOikumeneExport: costAmount maps to priceLevel', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const data = ctx.buildOikumeneExport();
  const belem = data.locations.find(l => l.name === 'Belem Tower');
  // costAmount=10, ceil(10/15)=1
  assert.strictEqual(belem.priceLevel, 1);

  const market = data.locations.find(l => l.name === 'Time Out Market');
  // costAmount=25, ceil(25/15)=2
  assert.strictEqual(market.priceLevel, 2);
});

test('buildOikumeneExport: free POIs have null priceLevel', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const data = ctx.buildOikumeneExport();
  const park = data.locations.find(l => l.name === 'Parque das Nacoes');

  assert.strictEqual(park.priceLevel, null);
});

// ─── Edge case: no trip loaded ───────────────────────────────

test('buildOikumeneExport: returns null when no trip loaded', () => {
  const ctx = createTestContext();
  ctx.State.trip = null;

  const data = ctx.buildOikumeneExport();
  assert.strictEqual(data, null);
});

module.exports = tests;
