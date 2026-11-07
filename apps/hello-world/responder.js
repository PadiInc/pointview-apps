// Hello World: the Responder, the consumer side of hello.world.
// It shows each Initiator's message, and answers each one on its own.

import { profile } from '../../sdk/pointview.js';

// 1. Take the side the YAML names (consumer: the Responder).
const hello = profile('hello.world');
const drafts = new Map(); // what you're typing to each Initiator, kept when the list is drawn again

// 2. On any change, one row per Initiator: its message, and a box to answer it.
hello.onChange((view) => {
  document.querySelector('#problem').textContent = view.problem ?? '';
  document.querySelector('#messages').replaceChildren(...(view.connections ?? []).map((c) => {
    const row = document.querySelector('#row').content.cloneNode(true);
    row.querySelector('.from').textContent = `${c.peer.name}: ${c.values.message ?? 'nothing yet'}`;
    const input = row.querySelector('input');
    input.value = drafts.get(c.peer.id) ?? c.mine.response ?? '';
    input.addEventListener('input', () => drafts.set(c.peer.id, input.value));
    // 3. Answer. `response` doesn't propagate, so it's set on this one connection.
    row.querySelector('button').addEventListener('click', async () => {
      await c.set('response', input.value);
      drafts.delete(c.peer.id);
    });
    return row;
  }));
});
