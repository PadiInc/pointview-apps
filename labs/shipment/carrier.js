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

for (const [value, word] of STATUSES) $('fStatus').append(new Option(word, value));

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
  draw();
  void pump();
});

/** Sends what's waiting, one shipment at a time: its five values, reported_at last. */
async function pump() {
  if (sending || !box || !queue.length || !ready().length || Date.now() - failedAt < RETRY_MS) return;
  sending = true;
  while (queue.length && ready().length) {
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
          : 'No tracker is connected yet. What you report is kept here and sent when one connects.',
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
    if (s.receipt_confirmed) ref.append(el('span', 'receipt', `Receipt confirmed ${when(s.receipt_confirmed)}`));
    else if (!s.sent) ref.append(el('span', 'waiting', names.length ? 'Sending…' : 'Waiting for a tracker'));
    const status = el('td');
    status.append(el('span', `status ${s.status}`, statusWord(s.status)), el('span', 'at', `Reported ${when(s.reported_at)}`));
    tr.append(ref, status, el('td', '', s.location), el('td', '', day(s.estimated_arrival)));
    tr.addEventListener('click', () => open(s.reference));
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(s.reference); });
    return tr;
  }));
}

const list = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The form: blank for a new shipment, or filled with one to report a change. */
function open(reference) {
  editing = reference ?? 'new';
  const s = reference ? data.shipments[reference] : null;
  $('formTitle').textContent = s ? `Report a change: ${s.reference}` : 'New shipment';
  $('fReference').value = s?.reference ?? '';
  $('fReference').readOnly = !!s;
  $('fStatus').value = s?.status ?? 'picked_up';
  $('fLocation').value = s?.location ?? '';
  $('fEta').value = s?.estimated_arrival ?? '';
  $('fProblem').textContent = '';
  $('formCard').hidden = false;
  (s ? $('fStatus') : $('fReference')).focus();
}

function close() {
  editing = null;
  $('formCard').hidden = true;
}

function send() {
  if (!box) return;
  const fields = { reference: $('fReference').value, status: $('fStatus').value, location: $('fLocation').value, estimated_arrival: $('fEta').value };
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
