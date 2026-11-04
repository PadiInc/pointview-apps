// What this frame can see of where it is, and a hello sent up the chain.
// Nothing here reads or sends anything about the people in the conversation.
(() => {
  const facts = [];
  const add = (k, v) => facts.push([k, String(v)]);

  add('My origin', self.origin);
  // Chrome and Safari list every frame above this one, nearest first.
  const above = location.ancestorOrigins ? [...location.ancestorOrigins] : null;
  add('Frames above me', above ? (above.length ? above.join(' → ') : 'none') : 'this browser does not say');
  let depth = 0;
  for (let w = window; w !== w.parent && depth < 10; w = w.parent) depth++;
  add('How deep I am', depth);
  let storage;
  try { localStorage.setItem('probe', '1'); localStorage.removeItem('probe'); storage = 'works'; } catch { storage = 'refused (sandboxed, or no origin)'; }
  add('My own storage', storage);
  let top;
  try { void window.top.document.title; top = 'readable (same origin!)'; } catch { top = 'not readable (another origin)'; }
  add('The top page', top);

  const dl = document.getElementById('facts');
  for (const [k, v] of facts) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }

  // The hello: to the frame just above (Zoho's page) and to the top (Pointview).
  // A listener on Pointview's page shows whether it arrives, and from where.
  let n = 0;
  const hello = () => {
    n++;
    const msg = { probe: 'nested-frame', n, origin: self.origin, above, depth };
    try { window.parent.postMessage(msg, '*'); } catch { /* nothing above */ }
    try { if (window.top !== window.parent) window.top.postMessage(msg, '*'); } catch { /* nothing above */ }
    document.getElementById('sent').textContent = `Hello sent ${n} time${n === 1 ? '' : 's'}.`;
  };
  document.getElementById('again').addEventListener('click', hello);
  hello();
  // A few more, for a listener added after the page loaded.
  let left = 5;
  const timer = setInterval(() => { hello(); if (--left === 0) clearInterval(timer); }, 3000);
})();
