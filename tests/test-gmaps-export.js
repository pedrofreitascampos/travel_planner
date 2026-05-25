/**
 * Tests for buildDayGoogleMapsUrl — the Google Maps directions URL builder
 * used by the "Open in Maps" button.
 */

'use strict';

const assert = require('assert');
const { createTestContext, installMockTrip } = require('./setup');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function parseUrl(url) {
  const u = new URL(url);
  const p = u.searchParams;
  return {
    base: `${u.origin}${u.pathname}`,
    api: p.get('api'),
    origin: p.get('origin'),
    destination: p.get('destination'),
    waypoints: p.get('waypoints'),
    travelmode: p.get('travelmode'),
  };
}

test('buildDayGoogleMapsUrl: day 0 (in-city, 2 POIs) returns origin=acc, destination=acc, waypoints=POIs', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  const url = ctx.buildDayGoogleMapsUrl(0);
  assert.ok(url, 'URL should be built');
  const p = parseUrl(url);
  assert.strictEqual(p.base, 'https://www.google.com/maps/dir/');
  assert.strictEqual(p.api, '1');
  assert.strictEqual(p.origin, '38.72,-9.14', 'Origin = Lisbon hotel');
  assert.strictEqual(p.destination, '38.72,-9.14', 'Destination = Lisbon hotel (in-city loop)');
  assert.strictEqual(p.waypoints, '38.69,-9.22|38.71,-9.15', 'Waypoints = Belem Tower then Time Out Market');
});

test('buildDayGoogleMapsUrl: day with empty plan and same acc returns null', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  // Day 1 (index 1) has empty plan, same Lisbon acc as day 0 — no route to build.
  const url = ctx.buildDayGoogleMapsUrl(1);
  assert.strictEqual(url, null);
});

test('buildDayGoogleMapsUrl: inter-city day with POI returns origin=depAcc, destination=arrAcc', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  // Day 2 (index 2): depAcc=Lisbon (38.72,-9.14), arrAcc=Sintra (38.80,-9.39), plan=[poi-3 Pena Palace (38.79,-9.39)]
  const url = ctx.buildDayGoogleMapsUrl(2);
  assert.ok(url);
  const p = parseUrl(url);
  assert.strictEqual(p.origin, '38.72,-9.14', 'Origin = previous-night Lisbon');
  assert.strictEqual(p.destination, '38.8,-9.39', 'Destination = Sintra B&B');
  assert.strictEqual(p.waypoints, '38.79,-9.39', 'Pena Palace as waypoint');
});

test('buildDayGoogleMapsUrl: invalid day index returns null', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  assert.strictEqual(ctx.buildDayGoogleMapsUrl(99), null);
  assert.strictEqual(ctx.buildDayGoogleMapsUrl(-1), null);
});

test('buildDayGoogleMapsUrl: skips POIs with missing lat/lng', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  // Inject a broken POI into day 0's plan.
  ctx.State.trip.pois.push({ id: 'poi-broken', name: 'Broken', category: 'monument', lat: null, lng: null });
  ctx.State.plan['2026-06-01'] = ['poi-1', 'poi-broken', 'poi-2'];
  const url = ctx.buildDayGoogleMapsUrl(0);
  const p = parseUrl(url);
  assert.strictEqual(p.waypoints, '38.69,-9.22|38.71,-9.15', 'Broken POI excluded from waypoints');
});

test('buildDayGoogleMapsUrl: travelmode defaults to driving when POIs >3km from start (auto-detect)', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  // Day 0: acc Lisbon (38.72,-9.14), POI Belem (38.69,-9.22) ~7km, POI Time Out (38.71,-9.15) ~1km from prev
  // First leg >3km → auto-driving. Second leg <3km → foot. 1 driving vs 1 foot → tie → driving (default).
  const url = ctx.buildDayGoogleMapsUrl(0);
  const p = parseUrl(url);
  assert.strictEqual(p.travelmode, 'driving');
});

test('buildDayGoogleMapsUrl: travelmode is walking when POI explicitly set to foot and legs are short', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  // Force both POIs to foot, and put POIs very close together to defeat auto-driving.
  ctx.State.trip.pois.find(p => p.id === 'poi-1').lat = 38.720;
  ctx.State.trip.pois.find(p => p.id === 'poi-1').lng = -9.141;
  ctx.State.trip.pois.find(p => p.id === 'poi-2').lat = 38.721;
  ctx.State.trip.pois.find(p => p.id === 'poi-2').lng = -9.142;
  ctx.State.poiTransport = { 'poi-1': 'foot', 'poi-2': 'foot' };
  const url = ctx.buildDayGoogleMapsUrl(0);
  const p = parseUrl(url);
  assert.strictEqual(p.travelmode, 'walking');
});

test('buildDayGoogleMapsUrl: URL is well-formed and parseable', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  const url = ctx.buildDayGoogleMapsUrl(0);
  // Should not throw.
  const parsed = new URL(url);
  assert.strictEqual(parsed.protocol, 'https:');
  assert.strictEqual(parsed.host, 'www.google.com');
  assert.strictEqual(parsed.pathname, '/maps/dir/');
});

module.exports = tests;
