// Shipment status: what the Carrier and the Tracker share. Each end keeps its
// own records; the connection only ever holds the latest update, so these
// functions turn "what the connection holds now" into "what this end knows".
// No page, no storage in here: plain data in, plain data out, so they are
// tested on their own (records.test.mjs).
//
// The profile is padi.test.shipment. The carrier (provider) writes
//   reference, status, location, estimated_arrival, reported_at
// in that order, reported_at last: a new reported_at says the update is whole.
// On opening with nothing to report yet, the carrier writes reported_at alone,
// so its end has a value on the realm from the start.
// The logistics team (consumer) writes, on one carrier's connection,
//   receipt_reference, then receipt_confirmed (a time)
// and a new receipt_confirmed says the confirmation is whole.

export const PROFILE = 'padi.test.shipment';

export const STATUSES = [
  ['picked_up', 'Picked up'],
  ['in_transit', 'In transit'],
  ['delayed', 'Delayed'],
  ['delivered', 'Delivered'],
];
export const statusWord = (s) => STATUSES.find(([v]) => v === s)?.[1] ?? String(s ?? '');

/** The carrier's properties, in the order they are written. */
export const UPDATE_ORDER = ['reference', 'status', 'location', 'estimated_arrival', 'reported_at'];

/** How long a carrier must be missing from the connections before the Tracker says its connection ended. */
export const ENDED_AFTER_MS = 3000;

// ---- The Tracker's records: { carriers: { <peer id>: { name, accepted, acceptedRef, missingSince, endedAt, shipments: { <reference>: {...} } } } }

export const emptyTracker = () => ({ carriers: {} });

/**
 * Takes what the connections hold now into the Tracker's records. `connections`
 * is the library's list ({ peer, values, state }); `realmOk` is false while the
 * realm can't be reached, when a missing carrier is unknown, not gone. Returns
 * true if the records changed.
 */
export function takeUpdates(data, connections, now, realmOk = true) {
  let changed = false;
  const here = new Set();
  for (const c of connections) {
    const id = c.peer?.id;
    if (!id) continue;
    here.add(id);
    let carrier = data.carriers[id];
    if (!carrier) {
      carrier = data.carriers[id] = { name: c.peer.name ?? 'A carrier', accepted: null, acceptedRef: null, missingSince: null, endedAt: null, shipments: {} };
      changed = true;
    }
    // The name is kept here: once a carrier is removed, nobody can be asked for it.
    if (c.peer.name && c.peer.name !== 'Someone' && carrier.name !== c.peer.name) { carrier.name = c.peer.name; changed = true; }
    if (carrier.missingSince !== null || carrier.endedAt !== null) { carrier.missingSince = null; carrier.endedAt = null; changed = true; }
    const v = c.values ?? {};
    // A time with no shipment is the carrier saying it is here (it writes one on opening, before it has
    // anything to report). It is noted, so the first shipment's own time is what marks that update whole.
    if (v.reported_at && (!v.reference || !v.status) && carrier.accepted !== v.reported_at) { carrier.accepted = v.reported_at; carrier.acceptedRef = null; changed = true; }
    if (!v.reference || !v.status || !v.reported_at) continue;
    const fresh = v.reported_at !== carrier.accepted;
    // A new reported_at is a new update; the same one for the same shipment may still be filling in.
    if (!fresh && v.reference !== carrier.acceptedRef) continue;
    const was = carrier.shipments[v.reference];
    const next = {
      reference: v.reference, status: v.status, location: v.location ?? '', estimated_arrival: v.estimated_arrival ?? '',
      reported_at: v.reported_at, receipt_confirmed: was?.receipt_confirmed ?? '',
    };
    if (fresh || JSON.stringify(was) !== JSON.stringify(next)) {
      carrier.shipments[v.reference] = next;
      carrier.accepted = v.reported_at;
      carrier.acceptedRef = v.reference;
      changed = true;
    }
  }
  if (realmOk) {
    for (const [id, carrier] of Object.entries(data.carriers)) {
      if (here.has(id) || carrier.endedAt !== null) continue;
      if (carrier.missingSince === null) { carrier.missingSince = now; changed = true; }
      else if (now - carrier.missingSince >= ENDED_AFTER_MS) { carrier.endedAt = carrier.missingSince; changed = true; }
    }
  }
  return changed;
}

/** Whether some carrier is missing but not yet said to have ended: the Tracker should look again shortly. */
export const awaitingEnd = (data) => Object.values(data.carriers).some((c) => c.missingSince !== null && c.endedAt === null);

/** The Tracker confirmed receipt of one shipment. */
export function noteReceipt(data, carrierId, reference, time) {
  const s = data.carriers[carrierId]?.shipments[reference];
  if (s) s.receipt_confirmed = time;
}

// ---- The Carrier's records: { shipments: { <reference>: {..., sent } }, known: [<peer id>], receipts: { <peer id>: <last time taken> } }

export const emptyCarrier = () => ({ shipments: {}, known: [], receipts: {} });

/** Adds a shipment, or reports a change to one. Returns its record, not yet sent. */
export function report(data, fields, now) {
  const reference = String(fields.reference ?? '').trim();
  const was = data.shipments[reference];
  return (data.shipments[reference] = {
    reference, status: fields.status, location: String(fields.location ?? '').trim(), estimated_arrival: String(fields.estimated_arrival ?? '').trim(),
    reported_at: new Date(now).toISOString(), receipt_confirmed: was?.receipt_confirmed ?? '', sent: false,
  });
}

/** What's wrong with a form's fields, in plain words, or '' if nothing. */
export function problemWith(fields) {
  const reference = String(fields.reference ?? '').trim();
  if (!reference) return 'Give the shipment a reference.';
  if (reference.length > 60) return 'The reference is longer than 60 characters.';
  if (!STATUSES.some(([v]) => v === fields.status)) return 'Choose a status.';
  if (!String(fields.location ?? '').trim()) return 'Say where the shipment is.';
  if (String(fields.location).trim().length > 120) return 'The location is longer than 120 characters.';
  if (!String(fields.estimated_arrival ?? '').trim()) return 'Give an estimated arrival.';
  return '';
}

/**
 * Takes what the connections hold now into the Carrier's records: receipts the
 * other end confirmed, and which connections are new. Returns { changed,
 * started }: `started` is true if a connection is here that wasn't before, so
 * every shipment should be sent again for it.
 */
export function takeReceipts(data, connections) {
  let changed = false;
  let started = false;
  for (const c of connections) {
    const id = c.peer?.id;
    if (!id || c.state === 'waiting') continue;
    if (!data.known.includes(id)) { data.known.push(id); started = true; changed = true; }
    const v = c.values ?? {};
    if (!v.receipt_reference || !v.receipt_confirmed || v.receipt_confirmed === data.receipts[id]) continue;
    data.receipts[id] = v.receipt_confirmed;
    changed = true;
    const s = data.shipments[v.receipt_reference];
    if (s) s.receipt_confirmed = v.receipt_confirmed;
  }
  // A connection that ended is forgotten, so the same party connecting again gets everything again.
  const here = new Set(connections.map((c) => c.peer?.id));
  const still = data.known.filter((id) => here.has(id));
  if (still.length !== data.known.length) { data.known = still; changed = true; }
  return { changed, started };
}

/** The shipments in the order they're shown: the latest report first. */
export const byLatest = (shipments) => Object.values(shipments).sort((a, b) => (a.reported_at < b.reported_at ? 1 : a.reported_at > b.reported_at ? -1 : a.reference.localeCompare(b.reference)));

// ---- Shown the same way at both ends

/** A time as people read it: "22 Nov, 2:14 PM". Empty for nothing. */
export function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** A day as people read it: "24 Nov 2026"; anything that isn't a date, as written. */
export function day(text) {
  if (!text) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return String(text);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
