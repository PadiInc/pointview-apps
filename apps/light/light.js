// The Light (the Switch and Light note): the Consumer end of padi.light. It is
// on when any of its switches is on (the Profile leaves the rule to the
// Light), and writes cState ("0" off, "1" on) to say what it did, as the SDK's
// own example light does.
import { start, state, set, say, nameOf, list, row, $ } from './end.js';

let realizing = false;
let starting = false;
let failedAt = 0; // a failed write waits a little before trying again, so a refusal can't loop

const switchName = (l) => l.values.sLabel || `${nameOf(l.person.name)}'s switch`;
const heard = (c) => c.links.filter((l) => l.state !== 'waiting' && (l.values.sOut === '0' || l.values.sOut === '1'));
/** What the switches ask for: on if any is on; nothing if none has said. */
const wanted = (c) => (heard(c).length ? (heard(c).some((l) => l.values.sOut === '1') ? '1' : '0') : null);

function render() {
  const c = state.connection;
  const on = c.own.cState === '1';
  $('label').textContent = c.own.cLabel || 'Your light';
  $('bulb').classList.toggle('on', on);
  $('bulb').setAttribute('aria-label', on ? 'The light is on' : 'The light is off');
  if (document.activeElement !== $('labelInput')) $('labelInput').value = c.own.cLabel ?? '';

  const switches = c.links;
  const waitingSwitches = c.ends.filter((e) => e.role === 'provider').map((e) => nameOf(e.person.name));
  let summary;
  if (c.realm === 'unreachable') summary = 'The realm can\'t be reached just now.';
  else if (!switches.length) {
    summary = waitingSwitches.length
      ? `Waiting for the realm to connect ${list(waitingSwitches)}'s switch.`
      : (state.people.length === 2
        ? `Waiting for ${nameOf(state.people.find((p) => p.id !== state.me.id)?.name)} to open the Switch.`
        : 'No switches yet. When someone here opens the Switch, it connects to your light.');
  } else if (switches.length === 1) {
    const l = switches[0];
    summary = l.state === 'waiting' ? `Connecting with ${nameOf(l.person.name)}…`
      : l.values.sOut === undefined ? `Waiting to hear from ${switchName(l)}.`
        : `${switchName(l)} is ${l.values.sOut === '1' ? 'on' : 'off'}.`;
  } else {
    const lit = switches.filter((l) => l.values.sOut === '1').length;
    summary = `${lit} of ${switches.length} switches on.`;
  }
  $('summary').textContent = summary;

  $('linksBox').hidden = switches.length < 2;
  $('links').replaceChildren(...switches.map((l) => row(switchName(l), l.person.name,
    l.state === 'waiting' ? 'waiting for its key' : l.values.sOut === undefined ? 'not heard from yet' : l.values.sOut === '1' ? 'on' : 'off',
    l.values.sOut === '1')));
  void startValues();
  void follow();
}

/** The light does what its switches say, then says what it did. */
async function follow() {
  const c = state.connection;
  const want = c ? wanted(c) : null;
  if (realizing || starting || Date.now() - failedAt < 10_000 || !c?.holding || c.security === 'waiting' || want === null || c.own.cState === want) return;
  realizing = true;
  const r = await set('cState', want);
  realizing = false;
  if (!r.ok) failedAt = Date.now();
  $('error').textContent = r.ok ? '' : say(r.error);
}

/** The Profile asks for both values from the start: written once they can be sealed. */
async function startValues() {
  const c = state.connection;
  if (starting || Date.now() - failedAt < 10_000 || !c?.holding || c.security === 'waiting') return;
  const missing = [['cLabel', `${nameOf(state.me.name)}'s light`], ['cState', '0']].filter(([p]) => c.own[p] === undefined);
  if (!missing.length) return;
  starting = true;
  for (const [p, v] of missing) {
    const r = await set(p, v);
    if (!r.ok) { $('error').textContent = say(r.error); failedAt = Date.now(); break; }
  }
  starting = false;
}

// A sandboxed frame can't submit forms, so Save is a plain button, and Enter works too.
async function saveLabel() {
  const v = $('labelInput').value.trim();
  if (!v) return;
  const r = await set('cLabel', v);
  $('error').textContent = r.ok ? '' : say(r.error);
  $('labelInput').blur();
}
$('labelSave').addEventListener('click', () => void saveLabel());
$('labelInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') void saveLabel(); });

start(render, 'The Light needs someone else in the conversation.');
