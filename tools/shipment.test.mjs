// The shipment demo's records (labs/shipment/records.js): how each end turns
// "what the connection holds now" into what it knows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTracker, takeUpdates, awaitingEnd, noteReceipt, emptyCarrier, report, problemWith, takeReceipts, byLatest, ENDED_AFTER_MS } from '../labs/shipment/records.js';

const A = { id: 'a', name: 'Carrier A' };
const B = { id: 'b', name: 'Carrier B' };
const conn = (peer, values, state = 'ready') => ({ peer, values, state });
const update = (reference, status, at, more = {}) => ({ reference, status, location: 'Memphis, TN', estimated_arrival: '2026-11-24', reported_at: at, ...more });

test('tracker: many shipments over one connection, keyed by reference, each carrier in its own block', () => {
  const d = emptyTracker();
  assert.equal(takeUpdates(d, [conn(A, {})], 0), true, 'a block as soon as the carrier connects');
  assert.deepEqual(Object.keys(d.carriers.a.shipments), []);
  takeUpdates(d, [conn(A, update('S-1', 'picked_up', 't1'))], 1);
  takeUpdates(d, [conn(A, update('S-2', 'in_transit', 't2')), conn(B, update('S-9', 'delayed', 't3'))], 2);
  assert.deepEqual(Object.keys(d.carriers.a.shipments), ['S-1', 'S-2']);
  assert.deepEqual(Object.keys(d.carriers.b.shipments), ['S-9']);
  takeUpdates(d, [conn(A, update('S-1', 'delivered', 't4')), conn(B, update('S-9', 'delayed', 't3'))], 3);
  assert.equal(d.carriers.a.shipments['S-1'].status, 'delivered');
  assert.equal(d.carriers.a.shipments['S-2'].status, 'in_transit', 'the other shipment keeps its last report');
  assert.equal(takeUpdates(d, [conn(A, update('S-1', 'delivered', 't4')), conn(B, update('S-9', 'delayed', 't3'))], 4), false, 'nothing new, nothing changed');
});

test('tracker: an update half written is not taken: the next reference with the last update\'s time waits for its own', () => {
  const d = emptyTracker();
  takeUpdates(d, [conn(A, update('S-1', 'delivered', 't1'))], 0);
  // The carrier has started on S-2: reference first, the rest still S-1's.
  takeUpdates(d, [conn(A, update('S-2', 'delivered', 't1'))], 1);
  assert.equal(d.carriers.a.shipments['S-2'], undefined);
  takeUpdates(d, [conn(A, update('S-2', 'picked_up', 't1'))], 2);
  assert.equal(d.carriers.a.shipments['S-2'], undefined);
  takeUpdates(d, [conn(A, update('S-2', 'picked_up', 't2'))], 3);
  assert.equal(d.carriers.a.shipments['S-2'].status, 'picked_up');
  assert.equal(d.carriers.a.shipments['S-1'].status, 'delivered');
});

test('tracker: a connection that ends keeps its block, marked ended with the time; the other carrier carries on', () => {
  const d = emptyTracker();
  takeUpdates(d, [conn(A, update('S-1', 'in_transit', 't1')), conn(B, update('S-9', 'delayed', 't2'))], 1000);
  takeUpdates(d, [conn(B, update('S-9', 'delayed', 't2'))], 5000);
  assert.equal(d.carriers.a.endedAt, null, 'not said at once');
  assert.equal(awaitingEnd(d), true);
  takeUpdates(d, [conn(B, update('S-9', 'delivered', 't3'))], 5000 + ENDED_AFTER_MS);
  assert.equal(d.carriers.a.endedAt, 5000, 'ended when it was first missing');
  assert.equal(d.carriers.a.name, 'Carrier A');
  assert.equal(d.carriers.a.shipments['S-1'].status, 'in_transit', 'its last reported values stay');
  assert.equal(d.carriers.b.endedAt, null);
  assert.equal(d.carriers.b.shipments['S-9'].status, 'delivered');
  assert.equal(awaitingEnd(d), false);
});

test('tracker: a realm that can\'t be reached is not a connection ending; nor is a blink', () => {
  const d = emptyTracker();
  takeUpdates(d, [conn(A, update('S-1', 'in_transit', 't1'))], 0);
  takeUpdates(d, [], 10_000, false);
  takeUpdates(d, [], 20_000, false);
  assert.equal(d.carriers.a.missingSince, null);
  takeUpdates(d, [], 30_000);
  takeUpdates(d, [conn(A, update('S-1', 'in_transit', 't1'))], 31_000);
  assert.equal(d.carriers.a.endedAt, null);
  assert.equal(d.carriers.a.missingSince, null);
});

test('tracker: a removed carrier\'s name is kept; "Someone" never replaces it; a receipt is remembered', () => {
  const d = emptyTracker();
  takeUpdates(d, [conn(A, update('S-1', 'delivered', 't1'))], 0);
  takeUpdates(d, [conn({ id: 'a', name: 'Someone' }, update('S-1', 'delivered', 't1'))], 1);
  assert.equal(d.carriers.a.name, 'Carrier A');
  noteReceipt(d, 'a', 'S-1', 'r1');
  takeUpdates(d, [conn(A, update('S-1', 'delivered', 't2'))], 2);
  assert.equal(d.carriers.a.shipments['S-1'].receipt_confirmed, 'r1', 'a later report keeps the receipt');
});

test('carrier: reporting, the form\'s checks, and the list latest first', () => {
  const d = emptyCarrier();
  assert.match(problemWith({ reference: ' ', status: 'in_transit', location: 'x', estimated_arrival: '2026-11-24' }), /reference/);
  assert.match(problemWith({ reference: 'S-1', status: 'lost', location: 'x', estimated_arrival: '2026-11-24' }), /status/);
  assert.match(problemWith({ reference: 'S-1', status: 'in_transit', location: '', estimated_arrival: '2026-11-24' }), /where/);
  assert.match(problemWith({ reference: 'S-1', status: 'in_transit', location: 'x', estimated_arrival: '' }), /arrival/);
  assert.equal(problemWith({ reference: 'S-1', status: 'in_transit', location: 'x', estimated_arrival: '2026-11-24' }), '');
  const s = report(d, { reference: ' S-1 ', status: 'picked_up', location: ' Memphis, TN ', estimated_arrival: '2026-11-24' }, Date.UTC(2026, 10, 22, 18));
  assert.deepEqual(s, { reference: 'S-1', status: 'picked_up', location: 'Memphis, TN', estimated_arrival: '2026-11-24', reported_at: '2026-11-22T18:00:00.000Z', receipt_confirmed: '', sent: false });
  report(d, { reference: 'S-2', status: 'in_transit', location: 'x', estimated_arrival: '2026-11-25' }, Date.UTC(2026, 10, 22, 19));
  assert.deepEqual(byLatest(d.shipments).map((x) => x.reference), ['S-2', 'S-1']);
});

test('carrier: a connection that starts gets everything; a receipt lands on its shipment once it is whole', () => {
  const d = emptyCarrier();
  report(d, { reference: 'S-1', status: 'delivered', location: 'x', estimated_arrival: '2026-11-24' }, 1);
  report(d, { reference: 'S-2', status: 'delivered', location: 'x', estimated_arrival: '2026-11-24' }, 2);
  const T = { id: 't', name: 'Government Logistics Office' };
  assert.deepEqual(takeReceipts(d, [conn(T, {}, 'waiting')]), { changed: false, started: false }, 'not while its key is on the way');
  assert.deepEqual(takeReceipts(d, [conn(T, {})]), { changed: true, started: true });
  assert.deepEqual(takeReceipts(d, [conn(T, {})]), { changed: false, started: false }, 'once');
  takeReceipts(d, [conn(T, { receipt_reference: 'S-1' })]);
  assert.equal(d.shipments['S-1'].receipt_confirmed, '', 'no time yet');
  takeReceipts(d, [conn(T, { receipt_reference: 'S-1', receipt_confirmed: 'r1' })]);
  assert.equal(d.shipments['S-1'].receipt_confirmed, 'r1');
  // The next confirmation: its reference arrives before its time, and the old time is not taken for it.
  takeReceipts(d, [conn(T, { receipt_reference: 'S-2', receipt_confirmed: 'r1' })]);
  assert.equal(d.shipments['S-2'].receipt_confirmed, '');
  takeReceipts(d, [conn(T, { receipt_reference: 'S-2', receipt_confirmed: 'r2' })]);
  assert.equal(d.shipments['S-2'].receipt_confirmed, 'r2');
  // The tracker's connection ends and starts again: everything again.
  assert.equal(takeReceipts(d, []).changed, true);
  assert.equal(takeReceipts(d, [conn(T, { receipt_reference: 'S-2', receipt_confirmed: 'r2' })]).started, true);
});
