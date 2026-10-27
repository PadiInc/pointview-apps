// Checks every app in the repo (run on every pull request): each YAML by
// Pointview's rules, each icon, and no id used twice. Prints what's wrong and
// fails if anything is.
//
//   node tools/check.mjs

import { fileURLToPath } from 'node:url';
import { walk } from './store.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { problems, entries } = await walk(root);
if (problems.length) {
  for (const p of problems) console.error('✕ ' + p);
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}; nothing is published until they're fixed.`);
  process.exit(1);
}
console.log(`✓ ${entries.length} apps checked: ${entries.map((e) => e.name).join(', ')}`);
