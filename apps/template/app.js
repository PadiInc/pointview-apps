// A template Pointview app: a number everyone in the conversation shares.
// Copy it and make it yours. It shows the messages every app uses
// (POINTVIEW.md has them all):
//
//   app -> Pointview   { pv: 1, type: 'ready' }                  once loaded
//   Pointview -> app   { pv: 1, type: 'hello', kind, title, theme, app, me, members, states, settings }
//   Pointview -> app   { pv: 1, type: 'states', states }         each new state, as it arrives
//   app -> Pointview   { pv: 1, type: 'put', id, state, line? }  save a new state for everyone here
//   Pointview -> app   { pv: 1, type: 'put-result', id, ok, error? }
//
// A state is any JSON (up to 16 KB). Pointview seals it into the
// conversation, end-to-end encrypted, and hands it to everyone's copy of the
// app. People are { id, name }, the id made for this app in this conversation.
// The app runs in a sandboxed frame: no cookies, no storage, no network beyond
// its own files. Everything it knows comes from these messages.

const $ = (id) => document.getElementById(id);
let me = null;
let people = new Map();
let count = 0;
let lastBy = null;
let next = 1;

// Pointview's address differs in the browser, the desktop app and on phones, so the app can't name it: '*'.
const send = (msg) => window.parent.postMessage({ pv: 1, ...msg }, '*');

/** The newest state wins: here, the highest count. */
function take(states) {
  for (const s of states) {
    const n = Number(s.state?.count);
    if (Number.isInteger(n) && n >= count) { count = n; lastBy = s.from; }
  }
  draw();
}

function draw() {
  $('count').textContent = String(count);
  $('who').textContent = lastBy ? `Last added by ${lastBy === me?.id ? 'you' : people.get(lastBy) ?? 'someone'}` : 'Nobody has added one yet';
}

window.addEventListener('message', (e) => {
  if (e.source !== window.parent) return;
  const m = e.data;
  if (!m || typeof m !== 'object' || m.pv !== 1) return;
  if (m.type === 'hello') {
    document.documentElement.dataset.theme = m.theme === 'dark' ? 'dark' : 'light';
    me = m.me;
    people = new Map((m.members ?? []).map((p) => [p.id, p.name]));
    take(m.states ?? []);
    $('add').disabled = false;
  } else if (m.type === 'states') {
    take(m.states ?? []);
  } else if (m.type === 'put-result') {
    $('add').disabled = false;
    $('problem').hidden = m.ok;
    if (!m.ok) $('problem').textContent = `Couldn't save that (${m.error}).`;
  }
});

$('add').addEventListener('click', () => {
  $('add').disabled = true;
  // `line` is what the conversation's list shows for it, up to 80 characters.
  send({ type: 'put', id: next++, state: { count: count + 1 }, line: `Counter: ${count + 1}` });
});

send({ type: 'ready' });
