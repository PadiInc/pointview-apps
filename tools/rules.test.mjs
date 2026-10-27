// The rules (rules.mjs) and the walk over the apps folder (store.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkApp, checkBuiltIn } from './rules.mjs';
import { walk, pngSize } from './store.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const root = here('..');

test('the shared cases: what Pointview accepts, the store accepts, saying the same', async () => {
  const { cases } = JSON.parse(await readFile(here('examples/cases.json'), 'utf8'));
  for (const c of cases) {
    const r = checkApp(await readFile(here('examples/' + c.file), 'utf8'));
    assert.equal(r.ok, c.ok, c.file + (r.ok ? '' : ': ' + r.detail));
    if (!c.ok) assert.ok(r.detail.startsWith(c.detail), `${c.file}: ${r.detail}`);
  }
});

test('the store\'s own lines: about, keywords, icon and group_home are optional and checked', async () => {
  const good = await readFile(here('examples/good-app.yaml'), 'utf8');
  const plain = checkApp(good);
  assert.equal(plain.ok, true);
  assert.deepEqual([plain.app.about, plain.app.keywords, plain.app.icon, plain.app.groupHome], [null, [], null, false]);
  const full = checkApp(good + 'about: "More words"\nkeywords: [one, two-words]\nicon: "icon.png"\ngroup_home: true\n');
  assert.deepEqual([full.app.about, full.app.keywords, full.app.icon, full.app.groupHome], ['More words', ['one', 'two-words'], 'icon.png', true]);
  assert.match(checkApp(good + 'about: unquoted\n').detail, /^about must be quoted/);
  assert.match(checkApp(good + 'keywords: [Capitals]\n').detail, /^keywords must list/);
  assert.match(checkApp(good + `keywords: [${Array.from({ length: 11 }, (_, i) => 'k' + i).join(', ')}]\n`).detail, /^keywords must list up to 10/);
  assert.match(checkApp(good + 'icon: "../elsewhere.png"\n').detail, /^icon must be the name of a \.png/);
  assert.match(checkApp(good + 'group_home: yes please\n').detail, /^group_home must be true or false/);
});

test('an app\'s page must be in its own folder on the store\'s pages', async () => {
  const good = await readFile(here('examples/good-app.yaml'), 'utf8');
  assert.equal(checkApp(good, { launchBase: 'https://padiinc.github.io/pointview-apps/apps/good/' }).ok, true);
  assert.match(checkApp(good, { launchBase: 'https://padiinc.github.io/pointview-apps/apps/other/' }).detail, /^launch must be the app's own page/);
});

test('a built-in entry names where Pointview serves the real YAML', () => {
  const entry = 'pointview_builtin: 1\nid: io.padi.call\nname: "Video call"\npublisher:\n  name: "Padi"\npath: "/apps/call/call.yaml"\nfits:\n  people: true\n  groups: true\n';
  const r = checkBuiltIn(entry);
  assert.equal(r.ok, true);
  assert.equal(r.app.path, '/apps/call/call.yaml');
  assert.match(checkBuiltIn(entry.replace('/apps/call/call.yaml', 'https://elsewhere.example/call.yaml')).detail, /^path must be where Pointview serves/);
  assert.match(checkBuiltIn(entry.replace('pointview_builtin: 1', 'pointview_builtin: 2')).detail, /^pointview_builtin must be 1/);
});

test('this repo: every app passes, the template is checked but not listed, and the list says where everything is', async () => {
  const { problems, entries } = await walk(root);
  assert.deepEqual(problems, []);
  assert.deepEqual(entries.map((e) => e.id), ['io.padi.chess', 'io.padi.drive', 'io.padi.hello', 'io.padi.light', 'io.padi.switch', 'io.padi.call']);
  assert.ok(!entries.some((e) => e.id === 'io.example.counter'), 'the template is not in the store');
  const chess = entries.find((e) => e.id === 'io.padi.chess');
  assert.equal(chess.yaml, 'https://padiinc.github.io/pointview-apps/apps/chess/pointview-app.yaml');
  assert.equal(chess.icon, 'https://padiinc.github.io/pointview-apps/apps/chess/icon.png');
  assert.deepEqual(chess.uses, [{ profile: 'padi.test.app.chess', role: 'consumer' }]);
  const call = entries.find((e) => e.id === 'io.padi.call');
  assert.deepEqual([call.kind, call.path, call.yaml], ['builtin', '/apps/call/call.yaml', null]);
  assert.equal(entries.find((e) => e.id === 'io.padi.hello').groupHome, true);
  for (const e of entries) assert.ok(e.icon, `${e.name} has an icon`);
});

test('the walk catches a missing icon, a small one, a reused id and a badly named folder', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv-apps-'));
  await mkdir(join(dir, 'apps'));
  const yaml = (folder, id, extra = '') => `pointview_app: 1\nid: ${id}\nname: "X"\npublisher:\n  name: "P"\nlaunch: "https://padiinc.github.io/pointview-apps/apps/${folder}/"\nfits:\n  people: true\n  groups: true\nconnections:\n  - profile: "a.b"\n    role: consumer\n${extra}`;
  for (const [folder, id, extra] of [['one', 'io.x.one', 'icon: "icon.png"\n'], ['two', 'io.x.one', ''], ['three', 'io.x.three', 'icon: "icon.png"\n'], ['Bad_Name', 'io.x.four', '']]) {
    await mkdir(join(dir, 'apps', folder));
    await writeFile(join(dir, 'apps', folder, 'app.yaml'), yaml(folder, id, extra));
  }
  // three's icon: a real PNG, but too small.
  await cp(here('../apps/chess/icon.png'), join(dir, 'apps/three/full.png'));
  const small = Buffer.from(await readFile(join(dir, 'apps/three/full.png')));
  small.writeUInt32BE(64, 16); small.writeUInt32BE(64, 20);
  await writeFile(join(dir, 'apps/three/icon.png'), small);
  const { problems } = await walk(dir);
  assert.deepEqual(problems.sort(), [
    'apps/Bad_Name: a folder\'s name is lower-case letters, digits and -',
    'apps/one/app.yaml: icon icon.png is not in the folder',
    'apps/three/app.yaml: icon icon.png must be square, at least 128 pixels (it is 64 by 64)',
    'apps/two/app.yaml: id io.x.one is already used by apps/one/app.yaml',
  ].sort());
});

test('a PNG\'s size is read from its header', async () => {
  assert.deepEqual(pngSize(await readFile(here('../apps/chess/icon.png'))), { width: 256, height: 256 });
  assert.equal(pngSize(Buffer.from('not a png at all, not at all')), null);
});
