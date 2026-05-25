/**
 * Regression tests for initTouchDrag (mobile drag-and-drop).
 *
 * Background: a previous version bound a non-passive `touchmove` listener
 * directly to every `.poi-list` / `.watchlist-list`. The browser then used
 * the slow scroll path for every touch in those lists, making the mobile
 * sidebar sluggish to scroll. The fix attaches the non-passive listener to
 * `document` only while a drag is actually in progress.
 */

'use strict';

const assert = require('assert');
const { createTestContext, installMockTrip, MockElement } = require('./setup');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function makeSpyingListEl() {
  const el = new MockElement('div');
  el.className = 'poi-list';
  el._registered = [];
  const origAdd = el.addEventListener.bind(el);
  el.addEventListener = (ev, fn, opts) => {
    el._registered.push({ ev, passive: opts?.passive, listener: fn });
    return origAdd(ev, fn);
  };
  // closest() is consulted inside the handlers; safe to return null here
  // because we don't simulate the touch events themselves.
  el.closest = () => null;
  el.querySelectorAll = () => [];
  return el;
}

test('initTouchDrag: never binds a non-passive listener to the list element', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  const listEl = makeSpyingListEl();

  ctx.initTouchDrag(listEl);

  const nonPassive = listEl._registered.filter(r => r.passive !== true);
  assert.strictEqual(nonPassive.length, 0,
    `Expected all list-element listeners to be passive, but found: ${JSON.stringify(nonPassive.map(r => r.ev))}`);
});

test('initTouchDrag: binds touchstart, touchend, and touchcancel on the list element', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  const listEl = makeSpyingListEl();

  ctx.initTouchDrag(listEl);

  const events = listEl._registered.map(r => r.ev).sort();
  assert.ok(events.includes('touchstart'), 'touchstart should be bound');
  assert.ok(events.includes('touchend'), 'touchend should be bound');
  assert.ok(events.includes('touchcancel'), 'touchcancel should be bound');
  // No touchmove on the list element — it lives on document during active drag.
  assert.ok(!events.includes('touchmove'),
    'touchmove should NOT be bound to the list element (it goes on document only while dragging)');
});

test('initTouchDrag: is idempotent — calling twice does not re-bind listeners', () => {
  const ctx = createTestContext();
  installMockTrip(ctx);
  const listEl = makeSpyingListEl();

  ctx.initTouchDrag(listEl);
  const firstCount = listEl._registered.length;
  ctx.initTouchDrag(listEl);
  assert.strictEqual(listEl._registered.length, firstCount,
    'Second initTouchDrag call should be a no-op');
});

module.exports = tests;
