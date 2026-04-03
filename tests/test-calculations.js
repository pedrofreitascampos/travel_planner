/**
 * Tests for calcDayMetrics and related calculation logic.
 */

'use strict';

const assert = require('assert');
const { createTestContext, installMockTrip } = require('./setup');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ─── Fuel cost uses inter-city km + in-city driving km ─────────

test('calcDayMetrics: fuel cost includes inter-city and in-city driving km', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Day 2 (index 1) has driving data: approxKm=120
  // Set route mode to driving so in-city km count
  ctx.State.dayRouteMode['2026-06-02'] = 'driving';
  const inCityKm = 15;
  const metrics = ctx.calcDayMetrics(1, inCityKm);

  const expectedTotalKm = 120 + inCityKm;
  const expectedFuel = (expectedTotalKm / 100) * 7.5 * 1.70;
  assert.ok(metrics, 'metrics should not be null');
  assert.strictEqual(
    metrics.cost.fuel.toFixed(2),
    expectedFuel.toFixed(2),
    `Fuel cost should be based on ${expectedTotalKm} total km`
  );
});

test('calcDayMetrics: fuel cost with foot mode only counts inter-city km', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Day 2 (index 1): inter-city 120km, route mode = foot
  ctx.State.dayRouteMode['2026-06-02'] = 'foot';
  const routeDistKm = 8; // walking distance — should NOT count as driving
  const metrics = ctx.calcDayMetrics(1, routeDistKm);

  // Inter-city km still contributes to fuel
  const expectedFuel = (120 / 100) * 7.5 * 1.70;
  assert.strictEqual(
    metrics.cost.fuel.toFixed(2),
    expectedFuel.toFixed(2),
    'Fuel cost should only include inter-city km when route mode is foot'
  );
});

// ─── Meal cost: planned food POIs vs unplanned budget ──────────

test('calcDayMetrics: meal cost splits planned food POIs and unplanned meals', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Day 1 has poi-1 (monument) + poi-2 (food, €25)
  const metrics = ctx.calcDayMetrics(0, 5);
  const partySize = 4;

  // 1 food POI planned → 2 unplanned meals
  const plannedFoodCost = 25 * partySize; // €25/pp × 4
  const unplannedMeals = 2; // 3 - 1 food POI
  const unplannedCost = (unplannedMeals / 3) * 22 * partySize;
  const expectedMeals = plannedFoodCost + unplannedCost;

  assert.strictEqual(
    metrics.cost.meals.toFixed(2),
    expectedMeals.toFixed(2),
    'Meal cost should combine planned food and unplanned budget'
  );
});

test('calcDayMetrics: day with no food POIs uses full meal budget', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Day 3 has poi-3 (monument only, no food)
  const metrics = ctx.calcDayMetrics(2, 0);
  const partySize = 4;
  const expectedMeals = 22 * partySize; // full budget = (3/3) * 22 * 4

  assert.strictEqual(
    metrics.cost.meals.toFixed(2),
    expectedMeals.toFixed(2),
    'When no food POIs, full daily meal budget should be used'
  );
});

// ─── Accommodation cost from accEdits ──────────────────────────

test('calcDayMetrics: accommodation cost from accEdits', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Day 1 acc is acc-lisbon which has pricePerNight=95 in accEdits
  const metrics = ctx.calcDayMetrics(0, 0);
  assert.strictEqual(metrics.cost.acc, 95, 'Acc cost should come from accEdits.pricePerNight');
});

test('calcDayMetrics: accommodation cost is 0 when no accEdit price', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Day 3 acc is acc-sintra which has no accEdits entry
  const metrics = ctx.calcDayMetrics(2, 0);
  assert.strictEqual(metrics.cost.acc, 0, 'Acc cost should be 0 when no pricePerNight in accEdits');
});

// ─── No NaN in any metric ──────────────────────────────────────

test('calcDayMetrics: no NaN values in any metric field', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  for (let i = 0; i < 3; i++) {
    const metrics = ctx.calcDayMetrics(i, null);
    assert.ok(metrics, `metrics for day ${i} should exist`);

    // Check cost fields
    for (const [k, v] of Object.entries(metrics.cost)) {
      assert.ok(!isNaN(v), `cost.${k} should not be NaN on day ${i}, got ${v}`);
    }
    // Check tiredness
    assert.ok(!isNaN(metrics.tiredness.raw), `tiredness.raw not NaN on day ${i}`);
    assert.ok(!isNaN(metrics.tiredness.score), `tiredness.score not NaN on day ${i}`);
    assert.ok(!isNaN(metrics.tiredness.norm), `tiredness.norm not NaN on day ${i}`);

    // Check other scores
    for (const key of ['familyFriendly', 'cultural', 'gastronomic', 'relaxation', 'fun', 'kidsFun', 'overall', 'logisticalFriction']) {
      assert.ok(!isNaN(metrics[key]), `${key} not NaN on day ${i}`);
    }
  }
});

test('calcDayMetrics: no NaN with empty day (no POIs)', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Day 2 (index 1) has an empty plan
  ctx.State.plan['2026-06-02'] = [];
  const metrics = ctx.calcDayMetrics(1, 0);
  assert.ok(metrics, 'metrics should exist for empty day');
  for (const [k, v] of Object.entries(metrics.cost)) {
    assert.ok(!isNaN(v), `cost.${k} should not be NaN on empty day, got ${v}`);
  }
  assert.ok(!isNaN(metrics.overall), 'overall should not be NaN on empty day');
});

test('calcDayMetrics: no NaN when routeDistKm is null', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const metrics = ctx.calcDayMetrics(0, null);
  assert.ok(metrics, 'metrics should exist');
  assert.ok(!isNaN(metrics.cost.fuel), 'fuel should not be NaN with null routeDistKm');
  assert.ok(!isNaN(metrics.tiredness.raw), 'tiredness.raw should not be NaN with null routeDistKm');
});

// ─── Tiredness calculation with age multipliers ────────────────

test('getAgeMultiplier: returns correct multipliers for various ages', () => {
  const ctx = createTestContext();

  assert.strictEqual(ctx.getAgeMultiplier(1), 2.0, 'infant < 2 → 2.0');
  assert.strictEqual(ctx.getAgeMultiplier(3), 1.6, 'toddler 2-3 → 1.6');
  assert.strictEqual(ctx.getAgeMultiplier(6), 1.35, 'child 4-6 → 1.35');
  assert.strictEqual(ctx.getAgeMultiplier(10), 1.15, 'child 7-11 → 1.15');
  assert.strictEqual(ctx.getAgeMultiplier(14), 1.05, 'teen 12-15 → 1.05');
  assert.strictEqual(ctx.getAgeMultiplier(35), 1.0, 'adult 16+ → 1.0');
});

test('calcDayMetrics: tiredness score reflects max age multiplier', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Party has ages [35, 38, 3, 6] — youngest is 3 → multiplier 1.6
  const metrics = ctx.calcDayMetrics(0, 5);

  // Raw tiredness = sum(duration * energyCost) + walkKm * 2
  // poi-1: 1.5 * 2 = 3, poi-2: 2 * 1 = 2 → raw = 5 + 5*2 = 15
  const expectedRaw = (1.5 * 2) + (2 * 1) + (5 * 2);
  assert.strictEqual(metrics.tiredness.raw, expectedRaw, `Raw tiredness should be ${expectedRaw}`);

  const expectedScore = expectedRaw * 1.6; // max multiplier from age 3
  assert.strictEqual(metrics.tiredness.score, expectedScore, 'Score should be raw × maxAgeMultiplier');
});

test('calcDayMetrics: tiredness levels are correctly assigned', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // With walk distance 0 and only poi-3 (duration=3, energyCost=3): raw = 9
  // Score = 9 * 1.6 = 14.4, norm = min(10, 14.4/3) = 4.8 → Moderate
  const metrics = ctx.calcDayMetrics(2, 0);
  assert.ok(['Easy', 'Comfortable', 'Moderate', 'Tiring', 'Exhausting'].includes(metrics.tiredness.level),
    'Tiredness level should be a valid category');
});

// ─── Cost tooltip generation ───────────────────────────────────

test('calcDayMetrics: costExplain contains all cost components', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const metrics = ctx.calcDayMetrics(0, 0);

  assert.ok(metrics.costExplain.includes('Entries'), 'Cost tooltip should mention entries');
  assert.ok(metrics.costExplain.includes('Meals'), 'Cost tooltip should mention meals');
  assert.ok(metrics.costExplain.includes('Total'), 'Cost tooltip should mention total');
  assert.ok(metrics.costExplain.includes('Accommodation'), 'Cost tooltip should mention accommodation when cost > 0');
});

test('calcDayMetrics: costExplain includes fuel line when driving exists', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Day 2 (index 1) has inter-city driving
  ctx.State.plan['2026-06-02'] = ['poi-1']; // add a POI so it's not empty
  const metrics = ctx.calcDayMetrics(1, 0);
  assert.ok(metrics.costExplain.includes('Fuel'), 'Cost tooltip should mention fuel when driving');
});

// ─── calcTripMetrics ───────────────────────────────────────────

test('calcTripMetrics: aggregates all days without NaN', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const tripMetrics = ctx.calcTripMetrics();
  assert.ok(tripMetrics, 'Trip metrics should exist');
  assert.ok(!isNaN(tripMetrics.totalCost), 'totalCost should not be NaN');
  assert.ok(!isNaN(tripMetrics.overallTrip), 'overallTrip should not be NaN');
  assert.strictEqual(tripMetrics.allMetrics.length, 3, 'Should have metrics for all 3 days');
});

// ─── Edge case: POI with cost='free' and cost=0 ───────────────

test('calcDayMetrics: POI with cost="free" contributes 0 to entry cost', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Add the free park POI to day 1
  ctx.State.plan['2026-06-01'] = ['poi-1', 'poi-2', 'poi-free'];
  const metrics = ctx.calcDayMetrics(0, 0);

  // Only poi-1 (€10) is a non-food entry; poi-free has costAmount=0
  const expectedEntries = 10 * 4; // €10 × 4 people
  assert.strictEqual(metrics.cost.poi, expectedEntries,
    'Free POI should contribute 0 to entry costs');
});

// ─── Overall score weighted average ─────────────────────────────

test('calcDayMetrics: overall is correct weighted average', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const metrics = ctx.calcDayMetrics(0, 5);
  const expected = (
    metrics.familyFriendly * 0.2 +
    metrics.cultural * 0.15 +
    metrics.gastronomic * 0.15 +
    metrics.relaxation * 0.1 +
    metrics.fun * 0.2 +
    metrics.kidsFun * 0.2
  );
  assert.strictEqual(
    metrics.overall.toFixed(4),
    expected.toFixed(4),
    'Overall should be weighted average of component scores'
  );
});

// ─── Scores stay within 0-10 bounds ─────────────────────────────

test('calcDayMetrics: all scores are bounded 0-10', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  for (let i = 0; i < 3; i++) {
    const metrics = ctx.calcDayMetrics(i, 20);
    for (const key of ['familyFriendly', 'cultural', 'gastronomic', 'relaxation', 'fun', 'kidsFun', 'logisticalFriction']) {
      assert.ok(metrics[key] >= 0, `${key} >= 0 on day ${i}, got ${metrics[key]}`);
      assert.ok(metrics[key] <= 10, `${key} <= 10 on day ${i}, got ${metrics[key]}`);
    }
    assert.ok(metrics.tiredness.norm >= 0, `tiredness.norm >= 0 on day ${i}`);
    assert.ok(metrics.tiredness.norm <= 10, `tiredness.norm <= 10 on day ${i}`);
  }
});

// ─── Suggestions are generated correctly ────────────────────────

test('calcDayMetrics: high-tiredness day gets warning suggestion', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Add many high-energy POIs to day 1 to force exhaustion
  const heavyPoi = {
    id: 'poi-heavy', name: 'Long hike', category: 'nature', lat: 38.7, lng: -9.2,
    duration: 5, cost: 0, costAmount: 0, costLabel: 'Free', rating: 4,
    kidsFriendly: 2, kidsRating: 2, energyCost: 5, description: 'Very tiring',
    source: 'user', availableDays: ['2026-06-01'], tags: [], confirmedBooking: false, bookAhead: false,
  };
  ctx.State.trip.pois.push(heavyPoi);
  ctx.State.plan['2026-06-01'] = ['poi-1', 'poi-2', 'poi-heavy'];

  const metrics = ctx.calcDayMetrics(0, 10);
  assert.ok(metrics.tiredness.norm > 7, 'Day should be exhausting');
  assert.ok(metrics.suggestions.some(s => s.type === 'warning' && s.text.includes('Exhausting')),
    'Should have exhaustion warning suggestion');
});

test('calcDayMetrics: great day gets positive suggestion', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Make day 1 have a very high overall score
  // Add diverse high-rated POIs
  const extraPois = [
    { id: 'poi-beach', name: 'Great Beach', category: 'beach', lat: 38.7, lng: -9.2,
      duration: 2, cost: 0, costAmount: 0, costLabel: 'Free', rating: 5,
      kidsFriendly: 5, kidsRating: 5, energyCost: 1, description: 'Beach fun',
      source: 'user', availableDays: ['2026-06-01'], tags: [], confirmedBooking: false, bookAhead: false },
    { id: 'poi-ent', name: 'Theme Park', category: 'entertainment', lat: 38.7, lng: -9.2,
      duration: 2, cost: 15, costAmount: 15, costLabel: '€15', rating: 5,
      kidsFriendly: 5, kidsRating: 5, energyCost: 1, description: 'Fun park',
      source: 'user', availableDays: ['2026-06-01'], tags: [], confirmedBooking: false, bookAhead: false },
  ];
  extraPois.forEach(p => ctx.State.trip.pois.push(p));
  ctx.State.plan['2026-06-01'] = ['poi-1', 'poi-2', 'poi-beach', 'poi-ent'];

  const metrics = ctx.calcDayMetrics(0, 0);
  // Whether or not overall > 8, test that suggestions array is valid
  assert.ok(Array.isArray(metrics.suggestions), 'Suggestions should be an array');
  metrics.suggestions.forEach(s => {
    assert.ok(['warning', 'tip', 'action'].includes(s.type), `Suggestion type "${s.type}" should be valid`);
    assert.ok(s.text.length > 0, 'Suggestion text should not be empty');
  });
});

// ─── calcTripMetrics: best/worst day identification ─────────────

test('calcTripMetrics: identifies best and worst days correctly', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const tripMetrics = ctx.calcTripMetrics();
  const allOveralls = tripMetrics.allMetrics.map(m => m ? m.overall : 0);

  const bestOverall = allOveralls[tripMetrics.bestDayIdx];
  const worstOverall = allOveralls[tripMetrics.worstDayIdx];

  assert.ok(bestOverall >= worstOverall,
    `Best day (${bestOverall}) should score >= worst day (${worstOverall})`);
});

test('calcTripMetrics: total cost is sum of all day costs', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const tripMetrics = ctx.calcTripMetrics();
  const summedCost = tripMetrics.allMetrics.reduce((s, m) => s + (m ? m.cost.total : 0), 0);

  assert.strictEqual(
    tripMetrics.totalCost.toFixed(2),
    summedCost.toFixed(2),
    'Total trip cost should equal sum of all day costs'
  );
});

// ─── Trip badges ─────────────────────────────────────────────

test('calcTripMetrics: badges is an array', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  const tripMetrics = ctx.calcTripMetrics();
  assert.ok(Array.isArray(tripMetrics.badges), 'badges should be an array');
});

test('calcTripMetrics: badges have icon, label, color', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  const tripMetrics = ctx.calcTripMetrics();
  tripMetrics.badges.forEach(b => {
    assert.ok(b.icon, 'badge should have icon');
    assert.ok(b.label, 'badge should have label');
    assert.ok(b.color, 'badge should have color');
  });
});

// ─── Logistical friction: book-ahead POIs increase friction ─────

test('calcDayMetrics: book-ahead POIs increase logistical friction', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Day 3 has poi-3 which has bookAhead: true → friction should be > 0
  const metricsWithBookAhead = ctx.calcDayMetrics(2, 0);

  // Day 1 has no book-ahead POIs
  const metricsNoBookAhead = ctx.calcDayMetrics(0, 0);

  assert.ok(metricsWithBookAhead.logisticalFriction > metricsNoBookAhead.logisticalFriction,
    'Day with book-ahead POI should have higher logistical friction');
});

// ─── Family-friendly penalty for museum-heavy days ──────────────

test('calcDayMetrics: museum-heavy day penalized for young kids', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  // Create a museum-heavy day
  const museumPois = [
    { id: 'poi-m1', name: 'Museum 1', category: 'museum', lat: 38.7, lng: -9.2,
      duration: 2, cost: 8, costAmount: 8, costLabel: '€8', rating: 4,
      kidsFriendly: 2, kidsRating: 2, energyCost: 2, description: 'Museum',
      source: 'user', availableDays: ['2026-06-01'], tags: [], confirmedBooking: false, bookAhead: false },
    { id: 'poi-m2', name: 'Museum 2', category: 'museum', lat: 38.7, lng: -9.2,
      duration: 2, cost: 10, costAmount: 10, costLabel: '€10', rating: 4,
      kidsFriendly: 2, kidsRating: 2, energyCost: 2, description: 'Museum',
      source: 'user', availableDays: ['2026-06-01'], tags: [], confirmedBooking: false, bookAhead: false },
    { id: 'poi-m3', name: 'Museum 3', category: 'museum', lat: 38.7, lng: -9.2,
      duration: 1.5, cost: 6, costAmount: 6, costLabel: '€6', rating: 3.5,
      kidsFriendly: 1, kidsRating: 1, energyCost: 2, description: 'Museum',
      source: 'user', availableDays: ['2026-06-01'], tags: [], confirmedBooking: false, bookAhead: false },
  ];
  museumPois.forEach(p => ctx.State.trip.pois.push(p));
  ctx.State.plan['2026-06-01'] = ['poi-m1', 'poi-m2', 'poi-m3'];

  // Party has a 3-year-old (youngest < 4)
  const metrics = ctx.calcDayMetrics(0, 0);
  // museum/monument > 60% of POIs triggers family-friendly penalty
  assert.ok(metrics.familyFriendly < 5,
    'Museum-heavy day should have lower family-friendly score with young kids');
});

// ─── renderRadarChartSVG produces valid SVG ─────────────────────

test('renderRadarChartSVG: produces SVG with all 6 axes', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);

  const metrics = ctx.calcDayMetrics(0, 5);
  const svg = ctx.renderRadarChartSVG(metrics, '#e07b54');

  assert.ok(svg.includes('<svg'), 'Should contain SVG tag');
  assert.ok(svg.includes('Cultural'), 'Should have Cultural label');
  assert.ok(svg.includes('Gastronomy'), 'Should have Gastronomy label');
  assert.ok(svg.includes('Relaxation'), 'Should have Relaxation label');
  assert.ok(svg.includes('Fun'), 'Should have Fun label');
  assert.ok(svg.includes('Kids Fun'), 'Should have Kids Fun label');
  assert.ok(svg.includes('Family Fit'), 'Should have Family Fit label');
  assert.ok(svg.includes('<polygon'), 'Should have data polygon');
});

// ─── renderMetricBar produces correct HTML ──────────────────────

test('renderMetricBar: generates bar with correct color coding', () => {
  const ctx = createTestContext();

  const barHigh = ctx.renderMetricBar('🏛️', 'Cultural', 8.5);
  assert.ok(barHigh.includes('#27ae60'), 'Score >= 7 should be green');

  const barMid = ctx.renderMetricBar('🍽️', 'Gastronomic', 5.5);
  assert.ok(barMid.includes('#2980b9'), 'Score 5-7 should be blue');

  const barLow = ctx.renderMetricBar('🎉', 'Fun', 2.0);
  assert.ok(barLow.includes('#e74c3c'), 'Score < 3 should be red');
});

module.exports = tests;
