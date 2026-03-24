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

module.exports = tests;
