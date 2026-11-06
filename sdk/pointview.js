// Pointview's app library: Connection Profiles in a few calls, as the
// Pointview App Architecture diagram draws them.
//
//   const hello = profile('hello.world');           take the side your YAML names
//   await hello.set('message', 'Hello world');      a propagating property: to every connection
//   hello.onChange((view) => { ... });              on any change
//   view.connections                                one entry per connection: { peer, values, mine, state, set }
//   await connection.set('response', 'Hi');         a property that doesn't propagate: to that one connection
//
// The app never names a realm, a context, a node, a role or a key. Your YAML
// says which side of the profile the app takes; Pointview reads the profile
// from the CNS/CP Registry, declares your end, seals every value on your
// device before it leaves, and opens the other ends' values here.
//
// Load it from your page as a module:
//   <script type="module" src="app.js"></script>
// and in app.js:
//   import { profile } from '../../sdk/pointview.js';
//
// Underneath it speaks Pointview's messages (POINTVIEW.md): ready, hello,
// claim, connection, set. You can use those directly instead.

const send = (msg) => window.parent.postMessage({ pv: 1, ...msg }, '*');

let next = 1;
const waiting = new Map(); // call id -> { resolve, reject }
const profiles = [];
let hello = null;

/** Sends a message Pointview answers with `<type>-result`, and waits for that answer. */
function call(type, fields) {
  const id = next++;
  send({ type, id, ...fields });
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}

window.addEventListener('message', (e) => {
  if (e.source !== window.parent) return;
  const m = e.data;
  if (!m || typeof m !== 'object' || m.pv !== 1) return;
  if (m.type === 'hello') {
    hello = m;
    document.documentElement.dataset.theme = m.theme === 'dark' ? 'dark' : 'light';
    for (const p of profiles) p.start();
  } else if (m.type === 'connection') {
    for (const p of profiles) p.update(m.connection, m.error);
  } else if (typeof m.type === 'string' && m.type.endsWith('-result') && waiting.has(m.id)) {
    const w = waiting.get(m.id);
    waiting.delete(m.id);
    if (m.ok) w.resolve();
    else w.reject(Object.assign(new Error(m.error ?? 'refused'), { code: m.error }));
  }
});

/**
 * Takes the side of `name` that your YAML names, in this conversation. Returns
 * { set(property, value), onChange(handler) }.
 */
export function profile(name) {
  const listeners = new Set();
  let view = null;
  let claimed = null;
  let started;
  const taken = new Promise((resolve) => { started = resolve; });

  const p = {
    start() {
      // Declares you as provider or consumer here; Pointview then sends where things stand, and again on each change.
      if (claimed) return;
      claimed = call('claim').catch((err) => { show({ problem: err.code }); });
      started(claimed);
      send({ type: 'connection' });
    },
    update(c, error) {
      if (!c) return show({ problem: error ?? 'no_connection' });
      if (c.profile !== name) return show({ problem: `this app's YAML names ${c.profile}, not ${name}` });
      show({
        problem: null,
        me: hello?.me ?? null,
        role: c.role,
        connections: (c.links ?? []).map((l) => ({
          peer: l.person,
          values: l.values,
          mine: l.mine ?? {},
          state: l.state === 'waiting' ? 'waiting' : 'ready',
          set: (property, value) => call('set', { property, value, connection: l.id }),
        })),
      });
    },
  };

  function show(v) {
    view = { ...(view ?? {}), ...v };
    for (const fn of listeners) fn(view);
  }

  profiles.push(p);
  if (hello) p.start();
  else if (profiles.length === 1) send({ type: 'ready' });

  return {
    /** Writes a property the profile marks as propagating: it goes to every connection. */
    async set(property, value) {
      await taken;
      return call('set', { property, value });
    },
    /** Calls `handler(view)` now if anything is known, and whenever anything changes. */
    onChange(handler) {
      listeners.add(handler);
      if (view) handler(view);
      return () => listeners.delete(handler);
    },
  };
}
