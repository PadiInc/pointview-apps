// The Switch (the Switch and Light note): the Provider end of padi.light. It
// has one output, sOut ("0" off, "1" on), which Arete carries to every Light
// it is connected to; each Light's cState comes back on its own connection,
// so this page shows what every light actually did.
import { start, state, set, say, nameOf, list, row, $ } from './end.js';

let busy = false;
let starting = false;
let failedAt = 0; // a failed write waits a little before trying again, so a refusal can't loop

const lightName = (l) => l.values.cLabel || `${nameOf(l.person.name)}'s light`;

function lightStatus(l, on) {
  if (l.state === 'waiting') return 'waiting for its key';
  if (l.values.cState === undefined) return 'not heard from yet';
  if (l.values.cState !== (on ? '1' : '0')) return on ? 'turning on…' : 'turning off…';
  return l.values.cState === '1' ? 'on' : 'off';
}

function render() {
  const c = state.connection;
  const on = c.own.sOut === '1';
  $('label').textContent = c.own.sLabel || 'Your switch';
  $('toggle').setAttribute('aria-pressed', String(on));
  $('toggle').classList.toggle('on', on);
  $('toggleWord').textContent = on ? 'On' : 'Off';
  $('toggle').disabled = busy || c.security === 'waiting';
  if (document.activeElement !== $('labelInput')) $('labelInput').value = c.own.sLabel ?? '';

  const lights = c.links;
  const waitingLights = c.ends.filter((e) => e.role === 'consumer').map((e) => nameOf(e.person.name));
  let summary;
  if (c.realm === 'unreachable') summary = 'The realm can\'t be reached just now.';
  else if (!lights.length) {
    summary = waitingLights.length
      ? `Waiting for the realm to connect ${list(waitingLights)}'s light.`
      : (state.people.length === 2
        ? `Waiting for ${nameOf(state.people.find((p) => p.id !== state.me.id)?.name)} to open the Light.`
        : 'No lights yet. When someone here opens the Light, it connects to your switch.');
  } else if (lights.length === 1) {
    const l = lights[0];
    const s = lightStatus(l, on);
    summary = s === 'on' || s === 'off' ? `${lightName(l)} is ${s}.`
      : s === 'turning on…' || s === 'turning off…' ? `Turning ${lightName(l)} ${on ? 'on' : 'off'}…`
        : s === 'waiting for its key' ? `Connecting with ${nameOf(l.person.name)}…` : `Waiting to hear from ${lightName(l)}.`;
  } else {
    const lit = lights.filter((l) => l.state !== 'waiting' && l.values.cState === '1').length;
    summary = `${lit} of ${lights.length} lights on.`;
  }
  $('summary').textContent = summary;

  // In a group, the lights this switch reaches, each as it reports itself.
  $('linksBox').hidden = lights.length < 2;
  $('links').replaceChildren(...lights.map((l) => row(lightName(l), l.person.name, lightStatus(l, on), l.values.cState === '1')));
  void startValues();
}

async function write(property, value) {
  busy = true;
  if (state.connection?.holding) render();
  const r = await set(property, value);
  busy = false;
  $('error').textContent = r.ok ? '' : say(r.error);
  if (!r.ok) failedAt = Date.now();
  return r.ok;
}

/** The Profile asks for both values from the start: written once they can be sealed. */
async function startValues() {
  const c = state.connection;
  if (starting || Date.now() - failedAt < 10_000 || !c?.holding || c.security === 'waiting') return;
  const missing = [['sLabel', `${nameOf(state.me.name)}'s switch`], ['sOut', '0']].filter(([p]) => c.own[p] === undefined);
  if (!missing.length) return;
  starting = true;
  for (const [p, v] of missing) if (!(await write(p, v))) break;
  starting = false;
}

$('toggle').addEventListener('click', () => {
  const on = state.connection?.own.sOut === '1';
  void write('sOut', on ? '0' : '1');
});

// A sandboxed frame can't submit forms, so Save is a plain button, and Enter works too.
function saveLabel() {
  const v = $('labelInput').value.trim();
  if (v) void write('sLabel', v).then(() => $('labelInput').blur());
}
$('labelSave').addEventListener('click', saveLabel);
$('labelInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveLabel(); });

start(render, 'The Switch needs someone else in the conversation.');
