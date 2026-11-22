// Carrier status: the provider side of padi.test.shipment. A carrier keeps its
// shipments on this contract here and reports each change; every report goes
// to the trackers it is connected to. One connection carries all of a
// carrier's shipments: each update names its shipment by reference.

import { profile } from '../../sdk/pointview.js';
import { keep } from './keep.js';
import { PROFILE, STATUSES, UPDATE_ORDER, statusWord, emptyCarrier, report, problemWith, takeReceipts, byLatest, when, day } from './records.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** Between one shipment's update and the next, so the other end sees each one. */
const PAUSE_MS = 1200;
const RETRY_MS = 10_000;

const shipments = profile(PROFILE);
let box = null;
let data = emptyCarrier();
let view = null;
const queue = []; // references waiting to be sent
let sending = false;
let failedAt = 0;
let sendProblem = '';
let editing = null; // null, 'new', or a reference

// The status: one choice of four, each a button-sized label, so it is one click and plain what they are.
for (const [value, word] of STATUSES) {
  const input = el('input');
  input.type = 'radio';
  input.name = 'fStatus';
  input.value = value;
  const label = el('label', `choice ${value}`);
  label.append(input, el('span', '', word));
  $('fStatus').append(label);
}
const statusChosen = () => document.querySelector('input[name=fStatus]:checked')?.value ?? '';
const chooseStatus = (value) => { for (const i of document.querySelectorAll('input[name=fStatus]')) i.checked = i.value === value; };
/** Receipts already shown on this page, so a new one is marked as it arrives, once. */
const receiptsShown = new Set();
let firstDraw = true;

const ready = () => (view?.connections ?? []).filter((c) => c.state === 'ready');
const save = () => box?.save(data);
const enqueue = (reference) => { if (!queue.includes(reference)) queue.push(reference); };

shipments.onChange((v) => {
  view = v;
  if (v.me && !box) {
    box = keep(`carrier:${v.me.id}`);
    data = box.load() ?? emptyCarrier();
    for (const s of Object.values(data.shipments)) if (!s.sent) enqueue(s.reference);
  }
  if (box && v.holding && v.realm === 'ok' && !v.problem) {
    const r = takeReceipts(data, v.connections ?? []);
    // A tracker that just connected hasn't heard anything yet: every shipment, one update after another.
    if (r.started) for (const s of byLatest(data.shipments).reverse()) enqueue(s.reference);
    if (r.changed) save();
  }
  if (box && v.holding && v.realm === 'ok' && !v.problem) void declare();
  draw();
  void pump();
});

/**
 * This end's values go on the realm as soon as the app opens, whether or not a
 * tracker is connected yet: the latest shipment again if there is one, or else
 * the time alone, which says only that the carrier is here. Once per opening.
 */
let declared = false;
async function declare() {
  if (declared || (view?.connections ?? []).length) return;
  declared = true;
  const latest = byLatest(data.shipments)[0];
  if (latest) { enqueue(latest.reference); return; }
  try { await shipments.set('reported_at', new Date().toISOString()); } catch { declared = false; }
}

/** Sends what's waiting, one shipment at a time: its five values, reported_at last. */
async function pump() {
  if (sending || !box || !view?.holding || !queue.length || Date.now() - failedAt < RETRY_MS) return;
  sending = true;
  while (queue.length) {
    const s = data.shipments[queue[0]];
    if (!s) { queue.shift(); continue; }
    try {
      for (const p of UPDATE_ORDER) await shipments.set(p, s[p]);
    } catch (err) {
      failedAt = Date.now();
      sendProblem = 'Not sent yet. It will be tried again in a moment.';
      setTimeout(() => void pump(), RETRY_MS + 100);
      break;
    }
    queue.shift();
    sendProblem = '';
    // Only if nothing newer was reported while this one was on its way.
    if (data.shipments[s.reference]?.reported_at === s.reported_at) { data.shipments[s.reference].sent = true; save(); }
    else enqueue(s.reference);
    draw();
    if (queue.length) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  sending = false;
  draw();
}

function draw() {
  const v = view ?? {};
  const names = ready().map((c) => c.peer.name);
  $('sub').textContent = [
    v.title,
    !box ? 'Opening…'
      : v.realm === 'unreachable' ? 'The realm can\'t be reached just now.'
        : names.length ? `Reporting to ${list(names)}`
          : 'No tracker is connected yet. What you report is kept here and sent again when one connects.',
  ].filter(Boolean).join(' · ');
  $('problem').textContent = v.problem ?? sendProblem;
  $('storage').hidden = !box || box.kept;

  const all = byLatest(data.shipments);
  $('none').hidden = all.length > 0;
  $('table').hidden = all.length === 0;
  $('resend').hidden = all.length === 0 || !names.length;
  $('resend').disabled = sending || queue.length > 0;
  $('rows').replaceChildren(...all.map((s) => {
    const tr = el('tr', 'pick');
    tr.dataset.reference = s.reference;
    tr.tabIndex = 0;
    tr.title = 'Report a change';
    const ref = el('td', 'ref', s.reference);
    if (!s.sent && !s.receipt_confirmed) ref.append(el('span', 'waiting', 'Sending…'));
    const status = el('td');
    status.append(el('span', `status ${s.status}`, statusWord(s.status)));
    if (s.receipt_confirmed) {
      // The loop closing: the other end has confirmed receipt. Marked once as it arrives.
      const fresh = !firstDraw && !receiptsShown.has(s.reference);
      receiptsShown.add(s.reference);
      status.append(el('span', 'receipt received' + (fresh ? ' fresh' : ''), 'Received'));
      status.append(el('span', 'at', `Reported ${when(s.reported_at)}`), el('span', 'at good', `Receipt confirmed ${when(s.receipt_confirmed)}`));
    } else {
      status.append(el('span', 'at', `Reported ${when(s.reported_at)}`));
    }
    tr.append(ref, status, el('td', '', s.location), el('td', '', day(s.estimated_arrival)));
    tr.addEventListener('click', () => open(s.reference));
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(s.reference); });
    return tr;
  }));
  if (box) firstDraw = false;
}

const list = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The form: blank for a new shipment, or filled with one to report a change. */
function open(reference) {
  editing = reference ?? 'new';
  const s = reference ? data.shipments[reference] : null;
  $('formTitle').textContent = s ? `Report a change: ${s.reference}` : 'New shipment';
  $('fReference').value = s?.reference ?? '';
  $('fReference').readOnly = !!s;
  chooseStatus(s?.status ?? 'picked_up');
  // A change keeps the shipment's own location and estimate, so only what changed is touched. A new
  // shipment starts at the place this carrier last reported from; its estimate is given once, here.
  $('fLocation').value = s?.location ?? byLatest(data.shipments)[0]?.location ?? '';
  $('fEta').value = s?.estimated_arrival ?? '';
  $('fProblem').textContent = '';
  $('formCard').hidden = false;
  (s ? document.querySelector('input[name=fStatus]:checked') : $('fReference'))?.focus();
}

function close() {
  editing = null;
  $('formCard').hidden = true;
}

function send() {
  if (!box) return;
  const fields = { reference: $('fReference').value, status: statusChosen(), location: $('fLocation').value, estimated_arrival: $('fEta').value };
  let problem = problemWith(fields);
  if (!problem && editing === 'new' && data.shipments[fields.reference.trim()]) problem = 'That reference is already in your list. Pick it from the list to report a change.';
  $('fProblem').textContent = problem;
  if (problem) return;
  const s = report(data, fields, Date.now());
  save();
  enqueue(s.reference);
  close();
  draw();
  void pump();
}

$('add').addEventListener('click', () => open(null));
$('fCancel').addEventListener('click', close);
$('fSend').addEventListener('click', send);
for (const id of ['fReference', 'fLocation', 'fEta']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
$('resend').addEventListener('click', () => {
  for (const s of byLatest(data.shipments).reverse()) enqueue(s.reference);
  draw();
  void pump();
});
