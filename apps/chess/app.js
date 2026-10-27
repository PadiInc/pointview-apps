// Chess for Pointview: the page. It runs in a sandboxed frame on a pair's home
// page and talks only to the Pointview page around it (the chess note, "The
// app bridge"). Pointview carries each state, end-to-end encrypted, in the
// pair's conversation; game.js decides which state is the real game.

import { Chessboard, COLOR, INPUT_EVENT_TYPE, BORDER_TYPE } from './vendor/cm-chessboard/src/Chessboard.js';
import { Markers, MARKER_TYPE } from './vendor/cm-chessboard/src/extensions/markers/Markers.js';
import { PromotionDialog, PROMOTION_DIALOG_RESULT_TYPE } from './vendor/cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js';
import * as G from './game.js';

const $ = (id) => document.getElementById(id);
const host = window.parent;

let me = null;          // { id, name }
let other = null;       // the other person
let game = null;        // the game as held: a record (game.js)
let board = null;
let shownFen = null;    // the position on the board, so it is only redrawn when it changes
let pending = null;     // a move made on the board, waiting for Play it: the next record
let sending = false;
let choosing = false;   // the colour choice is showing for a new game
let putId = 0;
const answers = new Map();

const nameOf = (id) => (id === me?.id ? me.name : id === other?.id ? other.name : 'Someone');
const colourOf = (rec, id) => (rec.white === id ? 'w' : 'b');
const first = (name) => String(name).split(' ')[0];

// ---- Talking to Pointview -----------------------------------------------------------------

function post(msg) { host.postMessage({ pv: 1, ...msg }, '*'); }

function put(state) {
  const id = ++putId;
  post({ type: 'put', id, state, line: G.chatLine(state, nameOf), waitingOn: G.waitingOn(state) });
  return new Promise((resolve) => answers.set(id, resolve));
}

window.addEventListener('message', (e) => {
  if (e.source !== host) return;
  const m = e.data;
  if (!m || typeof m !== 'object' || m.pv !== 1) return;
  if (m.type === 'hello') return hello(m);
  if (m.type === 'states') { take(m.states); return render(); }
  if (m.type === 'put-result') { answers.get(m.id)?.(m); answers.delete(m.id); }
});
post({ type: 'ready' });

function hello(m) {
  document.documentElement.dataset.theme = m.theme === 'dark' ? 'dark' : 'light';
  $('opening').hidden = true;
  me = m.me;
  other = (m.members ?? []).find((p) => p.id !== me.id) ?? null;
  if (m.kind !== 'pair' || !other) {
    $('notHere').textContent = 'Chess is a game for two. Add it on a person\'s home page.';
    $('notHere').hidden = false;
    return;
  }
  for (const el of document.querySelectorAll('.otherName')) el.textContent = other.name;
  $('otherName').textContent = other.name;
  take(m.states ?? []);
  render();
}

/** Folds states into the game, in the conversation's order. Says so if one of yours lost a race. */
function take(states) {
  for (const s of [...states].sort((a, b) => a.seq - b.seq)) {
    const r = G.fold(game, { state: s.state, from: s.from, resent: s.resent });
    if (r.took) {
      game = r.game;
      if (game.result || game.event === 'start') choosing = false;
    } else if (s.mine && !s.resent && game && s.state?.id === game.id && s.state?.event === 'move') {
      $('error').textContent = 'Your other device moved first.';
    }
  }
}

// ---- Drawing -------------------------------------------------------------------------------

function render() {
  if (!me || !other) return;
  const showSetup = !game || choosing;
  $('setup').hidden = !showSetup;
  $('play').hidden = showSetup;
  $('setupCancel').hidden = !(choosing && game);
  if (game?.result) {
    $('lastResult').textContent = 'Last game: ' + resultText(game) + '.';
    $('lastResult').hidden = false;
  }
  if (showSetup) return;

  const chess = G.replay(game.moves);
  const mine = colourOf(game, me.id);
  const over = !!game.result;
  const myTurn = !over && G.toMove(game, chess) === me.id;
  ensureBoard(mine);

  const shown = pending ? G.replay(pending.moves) : chess;
  if (shown.fen() !== shownFen) {
    // A new board shows the position at once; after that, moves are animated.
    board.setPosition(shown.fen(), shownFen !== null);
    shownFen = shown.fen();
    board.removeMarkers();
    const last = shown.history({ verbose: true }).at(-1);
    if (last) { board.addMarker(MARKER_TYPE.square, last.from); board.addMarker(MARKER_TYPE.square, last.to); }
  }

  $('topName').textContent = other.name;
  $('topDot').className = 'dot ' + (mine === 'w' ? 'b' : 'w');
  $('bottomName').textContent = 'You';
  $('bottomDot').className = 'dot ' + mine;

  $('status').textContent = over ? resultText(game)
    : myTurn ? (chess.inCheck() ? 'Check. Your move' : 'Your move')
      : `Waiting for ${first(other.name)}` + (chess.inCheck() ? ' (they are in check)' : '');

  const offeredToMe = !over && game.drawOffer === other.id;
  $('drawOffered').hidden = !offeredToMe || !!pending;
  $('drawText').textContent = `${first(other.name)} offers a draw. Moving declines it.`;
  $('offerDraw').hidden = over;
  $('offerDraw').disabled = sending || game.drawOffer === me.id || offeredToMe;
  $('offerDraw').textContent = game.drawOffer === me.id ? 'Draw offered' : 'Offer a draw';
  $('resign').hidden = over;
  $('resign').disabled = sending;
  $('newGame').hidden = !over;
  $('confirm').hidden = !pending;
  // A bar above the board takes the status line's place, so it is never below the fold.
  $('status').hidden = !!pending || !$('drawOffered').hidden || !$('ask').hidden;
  if (pending) $('confirmText').textContent = `Play ${pending.moves.at(-1)}?`;
  $('confirmYes').disabled = sending;

  $('moveList').replaceChildren(...pairs(game.moves).map((p) => {
    const li = document.createElement('li');
    li.textContent = p.join('  ');
    return li;
  }));

  if (myTurn && !pending && !sending) board.enableMoveInput(onInput, mine === 'w' ? COLOR.white : COLOR.black);
  else board.disableMoveInput();
}

function ensureBoard(mine) {
  const orientation = mine === 'w' ? COLOR.white : COLOR.black;
  if (board && board.getOrientation() === orientation) return;
  if (board) board.destroy();
  shownFen = null;
  board = new Chessboard($('board'), {
    orientation,
    assetsUrl: './vendor/cm-chessboard/assets/',
    style: { cssClass: 'pointview', borderType: BORDER_TYPE.none, pieces: { file: 'pieces/standard.svg' }, animationDuration: 200 },
    extensions: [{ class: Markers, props: { autoMarkers: MARKER_TYPE.frame } }, { class: PromotionDialog }],
  });
}

function resultText(rec) {
  const r = rec.result;
  if (r.how === 'resignation') return r.winner === me.id ? `${first(other.name)} resigned. You won` : 'You resigned';
  if (r.how === 'agreement') return 'Draw agreed';
  if (r.winner === null) return `Draw by ${r.how}`;
  return r.winner === me.id ? `You won by ${r.how}` : `${first(other.name)} won by ${r.how}`;
}

const pairs = (moves) => moves.reduce((out, m, i) => (i % 2 ? out.at(-1).push(m) : out.push([`${i / 2 + 1}. ${m}`]), out), []);

// ---- Moving --------------------------------------------------------------------------------

function onInput(event) {
  const chess = G.replay(game.moves);
  switch (event.type) {
    case INPUT_EVENT_TYPE.moveInputStarted:
      $('error').textContent = '';
      return chess.moves({ square: event.squareFrom }).length > 0;
    case INPUT_EVENT_TYPE.validateMoveInput: {
      const options = chess.moves({ square: event.squareFrom, verbose: true }).filter((m) => m.to === event.squareTo);
      if (!options.length) return false;
      if (options.some((m) => m.promotion)) {
        const colour = colourOf(game, me.id) === 'w' ? COLOR.white : COLOR.black;
        board.showPromotionDialog(event.squareTo, colour, (r) => {
          if (r.type === PROMOTION_DIALOG_RESULT_TYPE.pieceSelected) propose({ from: event.squareFrom, to: event.squareTo, promotion: r.piece.charAt(1) });
          else render();
        });
        return true;
      }
      // The board finishes moving the piece itself; the confirm shows once it has (moveInputFinished).
      pending = G.play(game, me.id, { from: event.squareFrom, to: event.squareTo });
      return !!pending;
    }
    case INPUT_EVENT_TYPE.moveInputFinished:
      if (pending) setTimeout(() => { render(); $('confirmYes').focus(); }, 0);
      return true;
    default:
      return true;
  }
}

/** A promotion chosen in the dialog waits for Play it too (decided 19 Oct: confirm each move). */
function propose(move) {
  const next = G.play(game, me.id, move);
  if (!next) return render();
  pending = next;
  render();
  $('confirmYes').focus();
}

async function send(next) {
  sending = true;
  $('error').textContent = '';
  render();
  const r = await put(next);
  sending = false;
  pending = null;
  if (!r.ok) $('error').textContent = 'That didn\'t go through (' + (r.error ?? 'unknown') + '). Try again.';
  render();
}

$('confirmYes').onclick = () => pending && !sending && send(pending);
$('confirmNo').onclick = () => { pending = null; render(); };
$('offerDraw').onclick = () => game && !game.result && send(G.offerDraw(game, me.id));
$('acceptDraw').onclick = () => game && send(G.acceptDraw(game, me.id));
$('resign').onclick = () => { $('ask').hidden = false; $('actions').hidden = true; render(); $('resignNo').focus(); };
$('resignNo').onclick = () => { $('ask').hidden = true; $('actions').hidden = false; render(); };
$('resignYes').onclick = async () => {
  $('ask').hidden = true; $('actions').hidden = false;
  if (game && !game.result) await send(G.resign(game, me.id));
};
$('newGame').onclick = () => { choosing = true; render(); };
$('setupCancel').onclick = () => { choosing = false; render(); };
$('start').onclick = async () => {
  const colour = document.querySelector('input[name="colour"]:checked')?.value ?? 'w';
  $('start').disabled = true;
  const r = await put(G.start(me.id, other.id, colour));
  $('start').disabled = false;
  $('setupError').textContent = r.ok ? '' : 'That didn\'t go through (' + (r.error ?? 'unknown') + '). Try again.';
  if (!r.ok) return;
  choosing = false;
  render();
};
