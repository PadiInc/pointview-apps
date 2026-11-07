// Hello World: the Initiator, the provider side of hello.world.
// It says hello to every Responder here, and shows each one's reply.

import { profile } from '../../sdk/pointview.js';

const $ = (sel) => document.querySelector(sel);

// 1. Take the side the YAML names (provider: the Initiator).
const hello = profile('hello.world');

// 2. Send the message. `message` propagates, so one set reaches every Responder.
$('#send').addEventListener('click', async () => {
  $('#send').disabled = true;
  $('#send').textContent = 'Sending…';
  try {
    await hello.set('message', $('#message').value);
    $('#send').textContent = 'Sent';
  } catch {
    $('#send').textContent = 'Not sent, try again';
  }
  $('#send').disabled = false;
});
$('#message').addEventListener('input', () => { $('#send').textContent = 'Send'; });

// 3. On any change: what you last sent, and one row per Responder with its reply.
hello.onChange((view) => {
  const connections = view.connections ?? [];
  const sent = connections.find((c) => c.mine.message)?.mine.message;
  $('#sent').textContent = sent ? `You sent: ${sent}` : 'Nothing sent yet.';
  $('#none').hidden = connections.length > 0;
  $('#problem').textContent = view.problem ?? '';
  $('#replies').replaceChildren(...connections.map((c) => {
    const li = document.createElement('li');
    li.textContent = `${c.peer.name}: ${c.values.response ?? 'no reply yet'}`;
    return li;
  }));
});
