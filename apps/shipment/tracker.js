// Shipment tracker: the consumer side of padi.test.shipment. One block per
// carrier connected here, with that carrier's shipments under it. Nothing is
// set up per carrier: a block appears when a carrier's connection does. The
// connection holds only the latest update, so the tracker keeps what each
// carrier reported; when a connection ends, its block stays, from those
// records, marked as ended.

import { profile } from '../../sdk/pointview.js';
import { keep } from './keep.js';
import { PROFILE, ENDED_AFTER_MS, statusWord, emptyTracker, takeUpdates, awaitingEnd, noteReceipt, byLatest, when, day } from './records.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

const shipments = profile(PROFILE);
let box = null;
let data = emptyTracker();
let view = null;
let again = null; // the timer that looks again at a carrier that went missing
const confirming = new Map(); // "<carrier>|<reference>" -> 'Confirming…' or 'Not sent, try again'

shipments.onChange((v) => {
  view = v;
  if (v.me && !box) {
    box = keep(`tracker:${v.me.id}`);
    data = box.load() ?? emptyTracker();
  }
  take();
});

/** What the connections hold now, into the records; and a second look if a carrier has just gone missing. */
function take() {
  const v = view ?? {};
  if (box && v.holding && !v.problem) {
    if (takeUpdates(data, v.connections ?? [], Date.now(), v.realm === 'ok')) box.save(data);
    clearTimeout(again);
    if (awaitingEnd(data)) again = setTimeout(take, ENDED_AFTER_MS + 50);
  }
  draw();
}

function draw() {
  const v = view ?? {};
  const carriers = Object.entries(data.carriers).sort(([, a], [, b]) => a.name.localeCompare(b.name));
  const connected = carriers.filter(([, c]) => c.endedAt === null).length;
  $('sub').textContent = [
    v.title,
    !box ? 'Opening…'
      : v.realm === 'unreachable' ? 'The realm can\'t be reached just now.'
        : carriers.length ? `${connected} ${connected === 1 ? 'carrier' : 'carriers'} connected` : '',
  ].filter(Boolean).join(' · ');
  $('problem').textContent = v.problem ?? '';
  $('storage').hidden = !box || box.kept;
  $('none').hidden = carriers.length > 0;
  $('carriers').replaceChildren(...carriers.map(([id, c]) => block(id, c)));
}

function block(id, c) {
  const ended = c.endedAt !== null;
  const card = el('section', 'card' + (ended ? ' ended' : ''));
  card.dataset.carrier = c.name;
  const head = el('header');
  head.append(el('h2', '', c.name), el('span', 'badge ' + (ended ? 'off' : 'on'), ended ? `Connection ended ${when(new Date(c.endedAt).toISOString())}` : 'Connected'));
  card.append(head);
  const all = byLatest(c.shipments);
  if (!all.length) {
    card.append(el('p', 'soft pad', ended ? 'Nothing was reported.' : 'Connected. Nothing reported yet.'));
    return card;
  }
  const table = el('table');
  const hr = el('tr');
  for (const word of ['Reference', 'Status', 'Location', 'Estimated arrival', '']) hr.append(el('th', '', word));
  const thead = el('thead');
  thead.append(hr);
  const body = el('tbody');
  const link = (view?.connections ?? []).find((x) => x.peer?.id === id && x.state === 'ready');
  for (const s of all) {
    const tr = el('tr');
    tr.dataset.reference = s.reference;
    const ref = el('td', 'ref', s.reference);
    if (s.receipt_confirmed) ref.append(el('span', 'receipt', `Receipt confirmed ${when(s.receipt_confirmed)}`));
    const status = el('td');
    status.append(el('span', `status ${s.status}`, statusWord(s.status)), el('span', 'at', `${ended ? 'Last reported' : 'Reported'} ${when(s.reported_at)}`));
    const last = el('td', 'act');
    if (!s.receipt_confirmed && s.status === 'delivered' && link) {
      const key = `${id}|${s.reference}`;
      const b = el('button', '', confirming.get(key) ?? 'Confirm receipt');
      b.type = 'button';
      b.disabled = confirming.get(key) === 'Confirming…';
      b.addEventListener('click', () => void confirm(id, s.reference, link));
      last.append(b);
    }
    tr.append(ref, status, el('td', '', s.location), el('td', '', day(s.estimated_arrival)), last);
    body.append(tr);
  }
  table.append(thead, body);
  card.append(table);
  return card;
}

/** Confirms receipt to that one carrier: which shipment, then when. Neither value goes to any other carrier. */
async function confirm(carrierId, reference, link) {
  const key = `${carrierId}|${reference}`;
  confirming.set(key, 'Confirming…');
  draw();
  try {
    const time = new Date().toISOString();
    await link.set('receipt_reference', reference);
    await link.set('receipt_confirmed', time);
    noteReceipt(data, carrierId, reference, time);
    box.save(data);
    confirming.delete(key);
  } catch {
    confirming.set(key, 'Not sent, try again');
  }
  draw();
}
