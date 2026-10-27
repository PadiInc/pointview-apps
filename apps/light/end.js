// The Switch and the Light, for Pointview: what both pages share (the Switch
// and Light note). Each page runs in a sandboxed frame and talks only to the
// Pointview page around it, which carries the connections through the
// service: see appHost.js for the messages. Opening the app makes you that
// end in this conversation (step 3); in a group, every Switch connects with
// every Light. Pointview seals each value on this device before it leaves,
// and opens the others' here, so the service and the realm only carry sealed
// text.

const $ = (id) => document.getElementById(id);
const host = window.parent;
let asked = 0;
const answers = new Map();
let claiming = false;
let claimFailed = false;

export const state = { me: null, people: [], connection: null, error: '' };

function post(msg) { host.postMessage({ pv: 1, ...msg }, '*'); }

function ask(type, fields = {}) {
  const id = ++asked;
  post({ type, id, ...fields });
  return new Promise((resolve) => answers.set(id, resolve));
}

/** Writes one of this end's own values. */
export const set = (property, value) => ask('set', { property, value });

const errors = {
  other_end_yours: 'You hold the other end in this conversation.',
  not_your_end: 'This end isn\'t yours.',
  no_key_yet: 'Not sent yet: this device is still getting its keys. Try again in a moment.',
  realm_unreachable: 'The realm can\'t be reached just now. Try again in a moment.',
  conversation_gone: 'This conversation has ended.',
  app_gone: 'This app was removed from the conversation.',
};
export const say = (code) => errors[code] ?? `Something went wrong (${code}).`;
export const first = (name) => String(name ?? '').split(' ')[0];

/** A person's first name, or their full name when someone else here has the same first name. */
export function nameOf(name) {
  const f = first(name);
  const same = state.people.filter((p) => first(p.name) === f).length;
  return same > 1 ? String(name ?? '') : f;
}

/** Opening is taking (step 3): the end this app offers becomes yours, unless you hold the other one here. */
async function take() {
  const c = state.connection;
  if (claiming || claimFailed || !c || c.holding || c.otherEnd) return;
  claiming = true;
  const r = await ask('claim');
  claiming = false;
  if (!r.ok) {
    claimFailed = true;
    state.error = say(r.error);
  }
}

/**
 * Starts the page: `render` runs on every change. `notHere` is the words for
 * a conversation with nobody else in it.
 */
export function start(render, notHere) {
  window.addEventListener('message', (e) => {
    if (e.source !== host) return;
    const m = e.data;
    if (!m || typeof m !== 'object' || m.pv !== 1) return;
    if (m.type === 'hello') {
      document.documentElement.dataset.theme = m.theme === 'dark' ? 'dark' : 'light';
      $('opening').hidden = true;
      state.me = m.me;
      state.people = m.members ?? [];
      if (!state.people.some((p) => p.id !== m.me.id)) {
        $('notHere').textContent = notHere;
        $('notHere').hidden = false;
        return;
      }
      post({ type: 'connection' });
      return;
    }
    if (m.type === 'connection') {
      state.connection = m.connection;
      state.error = m.connection ? (claimFailed ? state.error : '') : say(m.error);
      $('problem').textContent = state.error;
      $('problem').hidden = !state.error;
      const c = m.connection;
      $('otherEnd').hidden = !c?.otherEnd;
      $('panel').hidden = !c?.holding;
      if (c?.holding) render();
      else void take();
      showSecurity(c);
      showRealm(c);
      return;
    }
    if (m.type === 'claim-result' || m.type === 'set-result') {
      answers.get(m.id)?.(m);
      answers.delete(m.id);
    }
  });
  post({ type: 'ready' });
}

/** Whether values are sealed, said openly; plain text is never silent (the note). */
function showSecurity(c) {
  const line = $('security');
  let text = '';
  let kind = '';
  if (c?.holding) {
    const waitingFor = c.links.filter((l) => l.state === 'waiting').map((l) => nameOf(l.person.name));
    if (c.security === 'waiting') {
      kind = 'waiting';
      text = 'This device doesn\'t have your account key yet, so it can\'t seal anything. Open Pointview on another of your devices.';
    } else if (c.security === 'plain') {
      kind = 'plain';
      const plain = c.links.filter((l) => l.state === 'plain').map((l) => nameOf(l.person.name));
      text = `Not encrypted: ${list(plain)} ${plain.length === 1 ? 'sends' : 'send'} plain text, which whoever runs the realm can read. Yours stay sealed.`;
    } else {
      kind = 'sealed';
      text = 'Sealed end to end: only the ends connected here can read these values. Pointview and the realm see scrambled text.';
    }
    if (waitingFor.length) text += ` Connecting with ${list(waitingFor)}…`;
    if (c.unreadable) text += ' Some values can\'t be opened here (sealed with a key this device doesn\'t have).';
  }
  line.textContent = text;
  line.className = 'security ' + kind;
  line.hidden = !text;
}

export const list = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** "What Arete sees": every key under padi.light in this conversation's context, as the realm stores it. */
function showRealm(c) {
  const rows = $('rawRows');
  rows.replaceChildren();
  for (const { key, value } of c?.raw ?? []) {
    const tr = document.createElement('tr');
    const k = document.createElement('td');
    k.textContent = shortKey(key);
    k.title = key;
    const v = document.createElement('td');
    v.textContent = value;
    tr.append(k, v);
    rows.append(tr);
  }
  $('rawEmpty').hidden = !!c?.raw?.length;
}

/** A realm key without its System and with ids cut short: "nodes/k3Fq…/provider/padi.light/properties/sOut". */
export function shortKey(key) {
  return String(key)
    .replace(/^cns\/[^/]+\//, '')
    .replace(/^nodes\/([^/]{6})[^/]*\//, 'nodes/$1…/')
    .replace(/\/contexts\/[^/]+\//, '/')
    .replace(/\/connections\/([^/]{6})[^/]*\//, '/connections/$1…/');
}

/** One row of a list: a name, who it belongs to, and how it is. */
export function row(name, owner, status, on) {
  const li = document.createElement('li');
  const dot = document.createElement('span');
  dot.className = 'dot' + (on ? ' on' : '');
  const words = document.createElement('span');
  words.className = 'words';
  const n = document.createElement('span');
  n.className = 'name';
  n.textContent = name;
  const o = document.createElement('span');
  o.className = 'owner';
  o.textContent = owner;
  words.append(n, o);
  const s = document.createElement('span');
  s.className = 'state';
  s.textContent = status;
  li.append(dot, words, s);
  return li;
}

export { $ };
