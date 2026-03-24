/**
 * Tests for route logic — waypoint building, fitMapToDay, inter-city detection.
 */

'use strict';

const assert = require('assert');
const { createTestContext, installMockTrip } = require('./setup');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ─── drawRoute waypoints: depart acc → POIs → arrive acc ──────

test('drawRoute waypoints: day 1 starts from home acc, ends at day acc', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Verify the logic manually: for day 0, prevDate is undefined so dep = homeAcc
  // arrAcc = getEffectiveAcc('2026-06-01') = acc-lisbon
  const prevDate = ctx.State.trip.days[0 - 1]?.date;
  assert.strictEqual(prevDate, undefined, 'Day 0 has no previous date');

  const depAcc = ctx.getHomeAcc();
  assert.ok(depAcc, 'Home acc should exist');
  assert.strictEqual(depAcc.id, 'acc-home', 'Departure acc for day 0 should be home');

  const arrAcc = ctx.getEffectiveAcc('2026-06-01');
  assert.ok(arrAcc, 'Arrival acc should exist');
  assert.strictEqual(arrAcc.id, 'acc-lisbon', 'Arrival acc for day 1 should be Lisbon hotel');
});

test('drawRoute waypoints: day 2 departs from previous night acc', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Day 2 (index 1): prevDate = '2026-06-01' → depAcc = acc-lisbon
  const prevDate = ctx.State.trip.days[1 - 1]?.date;
  assert.strictEqual(prevDate, '2026-06-01');

  const depAcc = ctx.getEffectiveAcc(prevDate);
  assert.ok(depAcc);
  assert.strictEqual(depAcc.id, 'acc-lisbon', 'Day 2 departs from Lisbon (previous night)');

  const arrAcc = ctx.getEffectiveAcc('2026-06-02');
  assert.strictEqual(arrAcc.id, 'acc-lisbon', 'Day 2 arrives at Lisbon too');
});

test('drawRoute waypoints: day 3 departs from day 2 acc, arrives at Sintra', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const prevDate = ctx.State.trip.days[2 - 1]?.date;
  assert.strictEqual(prevDate, '2026-06-02');

  const depAcc = ctx.getEffectiveAcc(prevDate);
  assert.strictEqual(depAcc.id, 'acc-lisbon');

  const arrAcc = ctx.getEffectiveAcc('2026-06-03');
  assert.strictEqual(arrAcc.id, 'acc-sintra');
});

test('drawRoute waypoint order: acc → POIs → acc', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Simulate the waypoint assembly logic from drawRoute for day 0
  const dayIndex = 0;
  const day = ctx.getDay(dayIndex);
  const plan = ctx.State.plan[day.date] || [];
  const poiWaypoints = plan.map(id => ctx.getPoi(id)).filter(Boolean).map(p => [p.lat, p.lng]);

  const prevDate = ctx.State.trip.days[dayIndex - 1]?.date;
  const depAcc = prevDate ? ctx.getEffectiveAcc(prevDate) : ctx.getHomeAcc();
  const arrAcc = ctx.getEffectiveAcc(day.date);
  const depCoords = depAcc ? ctx.getAccCoords(depAcc) : null;
  const arrCoords = arrAcc ? ctx.getAccCoords(arrAcc) : depCoords;

  const waypoints = [];
  if (depCoords?.lat && depCoords?.lng) waypoints.push([depCoords.lat, depCoords.lng]);
  waypoints.push(...poiWaypoints);
  if (arrCoords?.lat && arrCoords?.lng) waypoints.push([arrCoords.lat, arrCoords.lng]);

  // Expected: home(52.52,13.405) → poi-1(38.69,-9.22) → poi-2(38.71,-9.15) → acc-lisbon(38.72,-9.14)
  assert.strictEqual(waypoints.length, 4, 'Should have 4 waypoints: dep + 2 POIs + arr');
  assert.deepStrictEqual(waypoints[0], [52.52, 13.405], 'First waypoint should be home acc');
  assert.deepStrictEqual(waypoints[1], [38.69, -9.22], 'Second waypoint should be poi-1');
  assert.deepStrictEqual(waypoints[2], [38.71, -9.15], 'Third waypoint should be poi-2');
  assert.deepStrictEqual(waypoints[3], [38.72, -9.14], 'Last waypoint should be Lisbon acc');
});

// ─── fitMapToDay includes acc coords ───────────────────────────

test('fitMapToDay: coordinate list includes both departure and arrival acc', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Replicate fitMapToDay coordinate collection for day 2 (index 2)
  const dayIndex = 2;
  const day = ctx.getDay(dayIndex);
  const coords = [];

  // Departure acc
  const prevDate = ctx.State.trip.days[dayIndex - 1]?.date;
  const depAcc = prevDate ? ctx.getEffectiveAcc(prevDate) : ctx.getHomeAcc();
  if (depAcc) { const c = ctx.getAccCoords(depAcc); if (c.lat && c.lng) coords.push([c.lat, c.lng]); }

  // POIs
  (ctx.State.plan[day.date] || []).map(id => ctx.getPoi(id)).filter(Boolean).forEach(p => coords.push([p.lat, p.lng]));

  // Arrival acc
  const arrAcc = ctx.getEffectiveAcc(day.date);
  if (arrAcc) { const c = ctx.getAccCoords(arrAcc); if (c.lat && c.lng) coords.push([c.lat, c.lng]); }

  // Day 3: dep = acc-lisbon, POIs = poi-3, arr = acc-sintra
  assert.ok(coords.length >= 3, 'Should include dep acc, POI, and arr acc');
  assert.deepStrictEqual(coords[0], [38.72, -9.14], 'First coord should be dep acc (Lisbon)');
  assert.deepStrictEqual(coords[coords.length - 1], [38.80, -9.39], 'Last coord should be arr acc (Sintra)');
});

test('fitMapToDay: empty plan still includes acc coords', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Make day 2 empty
  ctx.State.plan['2026-06-02'] = [];

  const dayIndex = 1;
  const day = ctx.getDay(dayIndex);
  const coords = [];
  const prevDate = ctx.State.trip.days[dayIndex - 1]?.date;
  const depAcc = prevDate ? ctx.getEffectiveAcc(prevDate) : ctx.getHomeAcc();
  if (depAcc) { const c = ctx.getAccCoords(depAcc); if (c.lat && c.lng) coords.push([c.lat, c.lng]); }
  (ctx.State.plan[day.date] || []).map(id => ctx.getPoi(id)).filter(Boolean).forEach(p => coords.push([p.lat, p.lng]));
  const arrAcc = ctx.getEffectiveAcc(day.date);
  if (arrAcc) { const c = ctx.getAccCoords(arrAcc); if (c.lat && c.lng) coords.push([c.lat, c.lng]); }

  assert.ok(coords.length >= 1, 'Even with empty plan, acc coords should be included');
});

// ─── Inter-city detection when accs differ ─────────────────────

test('inter-city detection: different accs trigger inter-city km estimation', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Day 3 (index 2): dep = acc-lisbon, arr = acc-sintra — different accs
  const dayIndex = 2;
  const day = ctx.getDay(dayIndex);
  const prevDate = ctx.State.trip.days[dayIndex - 1]?.date;
  const depAcc = prevDate ? ctx.getEffectiveAcc(prevDate) : ctx.getHomeAcc();
  const arrAcc = ctx.getEffectiveAcc(day.date);

  assert.ok(depAcc && arrAcc, 'Both accs should exist');
  assert.notStrictEqual(depAcc.id, arrAcc.id, 'Accs should differ for inter-city');

  // The code computes: haversineKm * 1.3
  const dc = ctx.getAccCoords(depAcc);
  const ac = ctx.getAccCoords(arrAcc);
  const straightLine = ctx.haversineKm(dc.lat, dc.lng, ac.lat, ac.lng);
  const estimated = Math.round(straightLine * 1.3);
  assert.ok(estimated > 0, 'Inter-city km should be > 0 when accs differ');
});

test('inter-city detection: same acc means no inter-city', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Day 2 (index 1): dep = acc-lisbon, arr = acc-lisbon — same acc
  const dayIndex = 1;
  const day = ctx.getDay(dayIndex);
  const prevDate = ctx.State.trip.days[dayIndex - 1]?.date;
  const depAcc = prevDate ? ctx.getEffectiveAcc(prevDate) : ctx.getHomeAcc();
  const arrAcc = ctx.getEffectiveAcc(day.date);

  // Note: day.driving has approxKm=120 which overrides the same-acc check
  // But if we remove driving data, same accs should give 0 inter-city km
  delete ctx.State.trip.days[1].driving;

  const interCityKm = day.driving?.approxKm || 0;
  assert.strictEqual(interCityKm, 0, 'No driving data → interCityKm starts at 0');
  // Same acc → no estimation
  assert.strictEqual(depAcc.id, arrAcc.id, 'Same acc means no inter-city');
});

// ─── getAccCoords respects accEdits ────────────────────────────

test('getAccCoords: uses edited coords when available', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  ctx.State.accEdits['acc-lisbon'] = { lat: 38.75, lng: -9.20, pricePerNight: 95 };

  const acc = ctx.State.trip.accommodations.find(a => a.id === 'acc-lisbon');
  const coords = ctx.getAccCoords(acc);
  assert.strictEqual(coords.lat, 38.75, 'Should use edited lat');
  assert.strictEqual(coords.lng, -9.20, 'Should use edited lng');
});

test('getAccCoords: falls back to original coords when no edit', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  ctx.State.accEdits = {};
  const acc = ctx.State.trip.accommodations.find(a => a.id === 'acc-lisbon');
  const coords = ctx.getAccCoords(acc);
  assert.strictEqual(coords.lat, 38.72, 'Should use original lat');
  assert.strictEqual(coords.lng, -9.14, 'Should use original lng');
});

// ─── getEffectiveRouteMode ─────────────────────────────────────

test('getEffectiveRouteMode: returns per-day override when set', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  ctx.State.dayRouteMode['2026-06-01'] = 'driving';
  assert.strictEqual(ctx.getEffectiveRouteMode('2026-06-01'), 'driving');
});

test('getEffectiveRouteMode: falls back to global route mode', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  ctx.State.layers.routeMode = 'foot';
  assert.strictEqual(ctx.getEffectiveRouteMode('2026-06-01'), 'foot');
});

// ─── haversineKm ───────────────────────────────────────────────

test('haversineKm: known distance Berlin→Lisbon ≈ 2300 km', () => {
  const ctx = createTestContext();
  const dist = ctx.haversineKm(52.52, 13.405, 38.72, -9.14);
  assert.ok(dist > 2200 && dist < 2500, `Berlin→Lisbon should be ~2300km, got ${dist.toFixed(0)}`);
});

test('haversineKm: same point gives 0', () => {
  const ctx = createTestContext();
  const dist = ctx.haversineKm(38.72, -9.14, 38.72, -9.14);
  assert.strictEqual(dist, 0, 'Same point should give 0 distance');
});

module.exports = tests;
