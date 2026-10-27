// Hello (Group as an App, Hello Prototype Plan): one button that asks
// Pointview for your name, through the frame's messages, and says hello.
//
//   here -> Pointview   { pv: 1, type: 'ready' }                                 on load, for the theme
//   Pointview -> here   { pv: 1, type: 'hello', theme, … }
//   here -> Pointview   { pv: 1, type: 'ask', id, profile, field }              on each press
//   Pointview -> here   { pv: 1, type: 'ask-result', id, ok, value? , error? }
//
// Pointview answers only if this app's YAML declares the profile, and only
// with a field that profile allows. Anything else, or no answer in 5 seconds,
// and it says "Hello, there".

const PROFILE = 'padi.test.hello.name'; // the placeholder: see pointview-app.yaml
const FIELD = 'displayName';
const WAIT_MS = 5000;

const greeting = document.getElementById('greeting');
const button = document.getElementById('hello');
let next = 1;
const waiting = new Map();

// The app runs in a sandboxed frame inside Pointview, whose address differs in
// the browser, the desktop app and on phones, so it can't name it: '*'. It sends
// nothing secret; the answer comes back to this frame only.
const send = (msg) => window.parent.postMessage({ pv: 1, ...msg }, '*');

window.addEventListener('message', (e) => {
  if (e.source !== window.parent) return;
  const m = e.data;
  if (!m || typeof m !== 'object' || m.pv !== 1) return;
  if (m.type === 'hello') {
    document.documentElement.dataset.theme = m.theme === 'dark' ? 'dark' : 'light';
  } else if (m.type === 'ask-result' && waiting.has(m.id)) {
    const done = waiting.get(m.id);
    waiting.delete(m.id);
    done(m.ok && typeof m.value === 'string' && m.value.trim() ? m.value.trim() : null);
  }
});

/** Asks Pointview for one field; resolves the value, or null if refused or unanswered. */
function ask(profile, field) {
  const id = next++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { waiting.delete(id); resolve(null); }, WAIT_MS);
    waiting.set(id, (value) => { clearTimeout(timer); resolve(value); });
    send({ type: 'ask', id, profile, field });
  });
}

button.addEventListener('click', async () => {
  button.disabled = true;
  const name = await ask(PROFILE, FIELD);
  greeting.textContent = name ? `Hello, ${name}` : 'Hello, there';
  button.disabled = false;
});

send({ type: 'ready' });
