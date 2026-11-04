// The room's light: the consumer end of padi.light that the group itself holds
// (the Boardroom Light plan). It never claims anything: the light was declared
// when the Boardroom tile was added, and opening it only shows it. It is lit
// when any Switch in the group is on, and, since there is no real light behind
// it yet, any open tab writes the room's cState ("1" on, "0" off) when it
// doesn't already match, so the Switch sees the room answer. Messages go to
// Pointview, the top of the page this sits in (Zoho's page is in between).
(() => {
  const $ = (id) => document.getElementById(id);
  const pointview = window.top;
  let asked = 0;
  let heard = false;
  let writing = false;
  let failedAt = 0;

  const post = (msg) => pointview.postMessage({ pv: 1, ...msg }, '*');
  const first = (name) => String(name ?? '').split(' ')[0];

  const show = (on, title, summary) => {
    $('bulb').classList.toggle('on', on);
    $('bulb').setAttribute('aria-label', on ? 'The room\'s light is on' : 'The room\'s light is off');
    if (title) $('title').textContent = title;
    $('summary').textContent = summary;
  };

  const switchName = (l) => l.values.sLabel || `${first(l.person.name)}'s switch`;
  const said = (c) => c.links.filter((l) => l.state !== 'waiting' && (l.values.sOut === '0' || l.values.sOut === '1'));

  function render(c) {
    if (!c) { show(false, null, 'The room\'s light can\'t be read just now.'); return; }
    if (c.room && !c.room.set) { show(false, null, 'The room\'s light isn\'t set up. Remove and add the Boardroom tile again.'); return; }
    if (!c.holding) { show(false, null, 'This tab isn\'t the room\'s light.'); return; }
    const title = c.room?.name ? `${c.room.name.replace(/ \(the room\)$/, '')}'s light` : 'The room\'s light';
    if (c.security === 'waiting') { show(false, title, 'Waiting for this device\'s keys…'); return; }
    if (c.realm === 'unreachable') { show(c.own.cState === '1', title, 'The realm can\'t be reached just now.'); return; }
    const heardFrom = said(c);
    const on = heardFrom.some((l) => l.values.sOut === '1');
    let summary;
    if (!c.links.length) {
      const waiting = c.ends.filter((e) => e.role === 'provider');
      summary = waiting.length ? 'Connecting to the switch…' : 'No switch yet. When someone opens the Switch, it turns this light on and off.';
    } else if (c.links.length === 1) {
      const l = c.links[0];
      summary = l.state === 'waiting' ? `Getting the key from ${first(l.person.name)}…`
        : l.values.sOut === undefined ? `Waiting to hear from ${switchName(l)}.`
          : `${switchName(l)} is ${l.values.sOut === '1' ? 'on' : 'off'}.`;
    } else {
      summary = `${heardFrom.filter((l) => l.values.sOut === '1').length} of ${c.links.length} switches on.`;
    }
    show(on, title, summary);
    void answer(c, heardFrom.length ? (on ? '1' : '0') : null, title);
  }

  async function set(property, value) {
    const id = ++asked;
    post({ type: 'set', id, property, value });
    const r = await new Promise((resolve) => { answers.set(id, resolve); setTimeout(() => resolve({ ok: false, error: 'timeout' }), 15_000); });
    answers.delete(id);
    if (!r.ok) failedAt = Date.now();
    return r;
  }

  /**
   * The room says what it did: written only when it doesn't already match, by whichever open tab
   * notices first. And it gives the light its name once, as a Light does, for the Switch to show.
   */
  async function answer(c, want, title) {
    if (writing || Date.now() - failedAt < 10_000) return;
    writing = true;
    if (c.own.cLabel === undefined && (await set('cLabel', title)).ok === false) { writing = false; return; }
    if (want !== null && c.own.cState !== want) await set('cState', want);
    writing = false;
  }
  const answers = new Map();

  window.addEventListener('message', (e) => {
    if (e.source !== pointview) return;
    const m = e.data;
    if (!m || typeof m !== 'object' || m.pv !== 1) return;
    if (m.type === 'hello') {
      heard = true;
      post({ type: 'connection' });
      return;
    }
    if (m.type === 'connection') { render(m.connection); return; }
    if (m.type === 'set-result') answers.get(m.id)?.(m);
  });

  // Outside Pointview (Zoho's own published link, say) nobody answers: it says where to look instead.
  if (pointview === window) { show(false, null, 'Open this in Pointview to see the room\'s light.'); return; }
  post({ type: 'ready' });
  setTimeout(() => { if (!heard) show(false, null, 'Open this in Pointview to see the room\'s light.'); }, 4000);
})();
