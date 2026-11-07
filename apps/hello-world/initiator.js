// Hello World: the Initiator, the provider side of hello.world.
// It says hello to every Responder here, and shows each one's reply.

import { profile } from '../../sdk/pointview.js';

// 1. Take the side the YAML names (provider: the Initiator).
const hello = profile('hello.world');

// 2. Send the message. `message` propagates, so one set reaches every Responder.
document.querySelector('#send').addEventListener('click', async () => {
  await hello.set('message', document.querySelector('#message').value);
});

// 3. On any change, one row per Responder: its reply, or that there's none yet.
hello.onChange((view) => {
  document.querySelector('#problem').textContent = view.problem ?? '';
  document.querySelector('#replies').replaceChildren(...(view.connections ?? []).map((c) => {
    const li = document.createElement('li');
    li.textContent = `${c.peer.name}: ${c.values.response ?? 'no reply yet'}`;
    return li;
  }));
});
