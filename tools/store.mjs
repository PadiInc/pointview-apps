// Walks the apps folder: every app's YAML checked, and the store's list built
// from them (App Store design note, 27 Oct 2026). Used by check.mjs (on every
// pull request) and build-index.mjs (on every merge to main).

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { checkApp, checkBuiltIn } from './rules.mjs';

/** Where the repo is published. Each app's page must be under <base>/apps/<folder>/. */
export const PAGES_BASE = (process.env.PAGES_BASE ?? 'https://padiinc.github.io/pointview-apps').replace(/\/+$/, '');
/** A folder that is a sample to copy, checked but never listed in the store. */
export const TEMPLATE = 'template';
const FOLDER = /^[a-z0-9][a-z0-9-]{0,39}$/;
const YAML_FILE = /^[A-Za-z0-9_-]{1,60}\.ya?ml$/;
const MIN_ICON = 128;

/** A PNG's width and height from its header, or null if it isn't a PNG. */
export function pngSize(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !sig.every((b, i) => bytes[i] === b)) return null;
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Checks every app under `root`/apps. Returns { problems: string[], entries }:
 * a problem names the file and what's wrong; entries are the store's list.
 */
export async function walk(root, { base = PAGES_BASE } = {}) {
  const problems = [];
  const entries = [];
  const ids = new Map();
  const appsDir = join(root, 'apps');
  let folders = [];
  try { folders = (await readdir(appsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch {
    return { problems: ['there is no apps/ folder'], entries };
  }
  for (const folder of folders) {
    if (!FOLDER.test(folder)) { problems.push(`apps/${folder}: a folder's name is lower-case letters, digits and -`); continue; }
    const files = (await readdir(join(appsDir, folder))).filter((f) => /\.ya?ml$/.test(f)).sort();
    if (!files.length) { problems.push(`apps/${folder}: no YAML file`); continue; }
    for (const file of files) {
      const at = `apps/${folder}/${file}`;
      if (!YAML_FILE.test(file)) { problems.push(`${at}: a YAML file's name is letters, digits, - and _`); continue; }
      const text = await readFile(join(appsDir, folder, file), 'utf8');
      const builtIn = /^pointview_builtin:/m.test(text);
      const r = builtIn ? checkBuiltIn(text) : checkApp(text, { launchBase: `${base}/apps/${folder}/` });
      if (!r.ok) { problems.push(`${at}: ${r.detail}`); continue; }
      const a = r.app;
      if (ids.has(a.id)) { problems.push(`${at}: id ${a.id} is already used by ${ids.get(a.id)}`); continue; }
      ids.set(a.id, at);
      let icon = null;
      if (a.icon) {
        const iconAt = join(appsDir, folder, a.icon);
        const size = await stat(iconAt).then(() => readFile(iconAt)).then(pngSize, () => undefined);
        if (size === undefined) { problems.push(`${at}: icon ${a.icon} is not in the folder`); continue; }
        if (!size) { problems.push(`${at}: icon ${a.icon} is not a PNG`); continue; }
        if (size.width !== size.height || size.width < MIN_ICON) { problems.push(`${at}: icon ${a.icon} must be square, at least ${MIN_ICON} pixels (it is ${size.width} by ${size.height})`); continue; }
        icon = `${base}/apps/${folder}/${a.icon}`;
      }
      if (folder === TEMPLATE) continue; // checked, so the sample stays right, but not in the store
      entries.push({
        id: a.id,
        kind: builtIn ? 'builtin' : 'app',
        name: a.name,
        summary: a.summary,
        about: a.about,
        keywords: a.keywords,
        publisher: a.publisher,
        fits: a.fits,
        uses: builtIn ? [] : a.connections,
        groupHome: builtIn ? false : a.groupHome,
        yaml: builtIn ? null : `${base}/apps/${folder}/${file}`,
        path: builtIn ? a.path : null,
        icon,
      });
    }
  }
  entries.sort((x, y) => x.name.localeCompare(y.name, 'en') || x.id.localeCompare(y.id));
  return { problems, entries };
}
