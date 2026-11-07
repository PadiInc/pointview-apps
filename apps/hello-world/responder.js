// Hello World: the Responder, the consumer side of hello.world.
// It shows each Initiator's message, and answers each one on its own.

import { profile } from '../../sdk/pointview.js';

// 1. Take the side the YAML names (consumer: the Responder).
const hello = profile('hello.world');
// Kept when the list is drawn again: what you're typing to each Initiator, and how its reply is going.
const drafts = new Map();
const sending = new Map();

// 2. On any change, one row per Initiator: its message, your reply, and a box to answer it.
hello.onChange((view) => {
  const connections = view.connections ?? [];
  document.querySelector('#none').hidden = connections.length > 0;
  document.querySelector('#problem').textContent = view.problem ?? '';
  document.querySelector('#messages').replaceChildren(...connections.map((c) => {
    const row = document.querySelector('#row').content.cloneNode(true);
    row.querySelector('.from').textContent = `${c.peer.name}: ${c.values.message ?? 'nothing yet'}`;
    row.querySelector('.sent').textContent = c.mine.response ? `You replied: ${c.mine.response}` : '';
    const input = row.querySelector('input');
    const button = row.querySelector('button');
    input.value = drafts.get(c.peer.id) ?? '';
    input.addEventListener('input', () => drafts.set(c.peer.id, input.value));
    button.textContent = sending.get(c.peer.id) ?? 'Reply';
    button.disabled = sending.get(c.peer.id) === 'Sending…';
    // 3. Answer. `response` doesn't propagate, so it's set on this one connection.
    button.addEventListener('click', async () => {
      sending.set(c.peer.id, 'Sending…');
      button.textContent = 'Sending…';
      button.disabled = true;
      try {
        await c.set('response', input.value);
        sending.delete(c.peer.id);
        drafts.delete(c.peer.id);
      } catch {
        sending.set(c.peer.id, 'Not sent, try again');
        button.textContent = 'Not sent, try again';
        button.disabled = false;
      }
    });
    return row;
  }));
});
