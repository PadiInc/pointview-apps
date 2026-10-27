// Builds what GitHub Pages publishes (run on every merge to main): the apps'
// folders as they are, the store's list (index.json), and a plain page
// listing the apps for anyone who looks.
//
//   node tools/build-index.mjs [out folder, default site/]

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { walk, PAGES_BASE } from './store.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(process.argv[2] ?? join(root, 'site'));
const { problems, entries } = await walk(root);
if (problems.length) {
  for (const p of problems) console.error('✕ ' + p);
  process.exit(1);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(join(root, 'apps'), join(out, 'apps'), { recursive: true });
// Published as files: no Jekyll, which would skip some names.
await writeFile(join(out, '.nojekyll'), '');
await writeFile(join(out, 'index.json'), JSON.stringify({ format: 1, base: PAGES_BASE, apps: entries }, null, 2) + '\n');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rows = entries.map((e) => `<li>${e.icon ? `<img src="${esc(e.icon)}" alt="" width="40" height="40">` : ''}<div><strong>${esc(e.name)}</strong> <span>by ${esc(e.publisher.name)}</span><br>${esc(e.summary)}</div></li>`).join('\n');
await writeFile(join(out, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pointview apps</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; color: #1F1E1C; background: #FAF7F1; }
  ul { list-style: none; padding: 0; } li { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid #e5e0d6; }
  img { border-radius: 9px; } span { color: #6b665e; font-size: 14px; }
</style>
</head>
<body>
<h1>Pointview apps</h1>
<p>The apps you can add to a Pointview group or conversation. Pointview reads <a href="index.json">index.json</a>; the source is <a href="https://github.com/PadiInc/pointview-apps">PadiInc/pointview-apps</a>.</p>
<ul>
${rows}
</ul>
</body>
</html>
`);
console.log(`✓ ${out}: ${entries.length} apps, index.json and index.html`);
