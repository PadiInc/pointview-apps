// Chess for Pointview: the game record and the rules that keep both sides in
// step (the chess note, "The game record"). No page in here, so it can be
// tested alone.
//
// Every state carries the whole game so far, never just the latest move:
//   { game: 'chess', v: 1, id, white, black, moves: ['e4', 'e5', …],
//     event: 'start' | 'move' | 'offer-draw' | 'accept-draw' | 'resign', by,
//     drawOffer: null | id, result: null | { winner: null | id, how } }
// white, black and by are the ids Pointview gives each player for this app.
//
// Rules:
//   1. Replayed, never trusted: every move is replayed from the start; one
//      illegal move and the whole state is ignored.
//   2. Only your own colour: a fresh move counts only from the player whose
//      turn it was, and only one move at a time.
//   3. The longer game wins: a state replaces the game only if it starts with
//      the same moves; old or repeated states change nothing.
//   4. One move per turn: if two of your devices move at once, the first in
//      the conversation's order stands; the other is refused.
//   5. The end is worked out, not claimed: checkmate, stalemate and the draw
//      rules come from the replay. Only resigning and agreeing a draw are events.
//   6. A state sent again for a device that joined late only fills in a game
//      that device doesn't have.

import { Chess } from './vendor/chess.js/chess.js';

const ID = /^[A-Za-z0-9_-]{6,64}$/;
const PLAYER = /^[A-Za-z0-9_-]{22}$/;
const EVENTS = new Set(['start', 'move', 'offer-draw', 'accept-draw', 'resign']);
const MAX_MOVES = 600;

/** A fresh game id. */
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);

/** Replays a record's moves; returns the position, or null if any move is illegal. */
export function replay(moves) {
  const chess = new Chess();
  for (const san of moves) {
    try {
      if (!chess.move(san, { strict: true })) return null;
    } catch {
      return null;
    }
  }
  return chess;
}

/** How the position ends the game, if it does: { winner: null | 'w' | 'b', how }, or null. */
export function endOf(chess) {
  if (chess.isCheckmate()) return { winner: chess.turn() === 'w' ? 'b' : 'w', how: 'checkmate' };
  if (chess.isStalemate()) return { winner: null, how: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { winner: null, how: 'insufficient material' };
  if (chess.isThreefoldRepetition()) return { winner: null, how: 'threefold repetition' };
  if (chess.isDrawByFiftyMoves()) return { winner: null, how: 'the fifty-move rule' };
  return null;
}

/** The player whose turn it is in a record's position. */
export function toMove(rec, chess) {
  return chess.turn() === 'w' ? rec.white : rec.black;
}

/** The other player. */
export const opponentOf = (rec, id) => (id === rec.white ? rec.black : rec.white);

/** Checks a record's shape and replays it. Returns { rec, chess } or null. */
export function check(rec) {
  if (!rec || typeof rec !== 'object' || rec.game !== 'chess' || rec.v !== 1) return null;
  if (!ID.test(rec.id ?? '') || !PLAYER.test(rec.white ?? '') || !PLAYER.test(rec.black ?? '') || rec.white === rec.black) return null;
  if (!Array.isArray(rec.moves) || rec.moves.length > MAX_MOVES || !rec.moves.every((m) => typeof m === 'string' && m.length <= 10)) return null;
  if (!EVENTS.has(rec.event) || ![rec.white, rec.black].includes(rec.by)) return null;
  if (rec.drawOffer !== null && ![rec.white, rec.black].includes(rec.drawOffer)) return null;
  const chess = replay(rec.moves);
  if (!chess) return null;
  // The result must be what the moves and the events say: never just claimed.
  const ended = endOf(chess);
  const r = rec.result;
  if (ended) {
    const winner = ended.winner === null ? null : ended.winner === 'w' ? rec.white : rec.black;
    if (!r || r.how !== ended.how || r.winner !== winner) return null;
  } else if (rec.event === 'resign') {
    if (!r || r.how !== 'resignation' || r.winner !== opponentOf(rec, rec.by)) return null;
  } else if (rec.event === 'accept-draw') {
    if (!r || r.how !== 'agreement' || r.winner !== null) return null;
  } else if (r !== null) {
    return null;
  }
  return { rec, chess };
}

/**
 * Folds one state into the game this device holds. `current` is the record
 * held (or null), `incoming` { state, from, resent }. Returns
 * { game: the record now held, took: true if the state was taken, why?: if refused }.
 */
export function fold(current, { state, from, resent }) {
  const checked = check(state);
  if (!checked) return { game: current, took: false, why: 'not a valid game' };
  const next = checked.rec;
  // Rule 6: a state sent again only fills in a game this device doesn't have.
  if (resent) return current ? { game: current, took: false, why: 'already have a game' } : { game: next, took: true };
  if (next.by !== from) return { game: current, took: false, why: 'sent by someone else' };

  // A new game: only when none is going.
  if (!current || next.id !== current.id) {
    if (current && !current.result) return { game: current, took: false, why: 'a game is going' };
    if (next.event !== 'start' || next.moves.length || next.result || next.drawOffer) return { game: current, took: false, why: 'a game starts with no moves' };
    return { game: next, took: true };
  }

  // The same game: it must start with the moves held (rule 3) and come before any end.
  if (current.result) return { game: current, took: false, why: 'the game is over' };
  const before = replay(current.moves);
  const sameStart = next.moves.length >= current.moves.length && current.moves.every((m, i) => next.moves[i] === m);
  if (!sameStart) return { game: current, took: false, why: 'not the same moves' };
  const added = next.moves.length - current.moves.length;

  switch (next.event) {
    case 'move':
      // Rules 2 and 4: one move, by the player whose turn it was.
      if (added !== 1 || toMove(current, before) !== from) return { game: current, took: false, why: 'not their move' };
      // A draw offered by the mover stands; one offered to them lapses with their move.
      if (next.drawOffer !== null && next.drawOffer !== from) return { game: current, took: false, why: 'draw offer' };
      return { game: next, took: true };
    case 'offer-draw':
      if (added !== 0 || next.drawOffer !== from) return { game: current, took: false, why: 'draw offer' };
      return { game: next, took: true };
    case 'accept-draw':
      if (added !== 0 || current.drawOffer !== opponentOf(current, from)) return { game: current, took: false, why: 'no draw offered' };
      return { game: next, took: true };
    case 'resign':
      if (added !== 0) return { game: current, took: false, why: 'resign' };
      return { game: next, took: true };
    default:
      return { game: current, took: false, why: 'not a move' };
  }
}

// ---- Making the next state ----------------------------------------------------------

/** A new game. `colour`: 'w', 'b' or 'random' for `me`. */
export function start(me, other, colour, random = Math.random) {
  const white = colour === 'w' ? me : colour === 'b' ? other : random() < 0.5 ? me : other;
  return {
    game: 'chess', v: 1, id: newId(), white, black: white === me ? other : me,
    moves: [], event: 'start', by: me, drawOffer: null, result: null,
  };
}

/** Plays a move (standard notation, or { from, to, promotion }) for `me`. Returns the next record, or null if illegal. */
export function play(rec, me, move) {
  const chess = replay(rec.moves);
  if (!chess || rec.result || toMove(rec, chess) !== me) return null;
  let m;
  try { m = chess.move(move); } catch { return null; }
  if (!m) return null;
  const ended = endOf(chess);
  return {
    ...rec, moves: [...rec.moves, m.san], event: 'move', by: me,
    drawOffer: rec.drawOffer === me ? me : null,
    result: ended ? { winner: ended.winner === null ? null : ended.winner === 'w' ? rec.white : rec.black, how: ended.how } : null,
  };
}

export const offerDraw = (rec, me) => ({ ...rec, event: 'offer-draw', by: me, drawOffer: me });
export const acceptDraw = (rec, me) => ({ ...rec, event: 'accept-draw', by: me, result: { winner: null, how: 'agreement' } });
export const resign = (rec, me) => ({ ...rec, event: 'resign', by: me, drawOffer: null, result: { winner: opponentOf(rec, me), how: 'resignation' } });

/** Who the game waits on after this record: the player to move, or nobody once it's over. */
export function waitingOn(rec) {
  if (rec.result) return [];
  const chess = replay(rec.moves);
  const turn = chess ? [toMove(rec, chess)] : [];
  // A draw offer waits on the other player too.
  return rec.drawOffer ? [...new Set([...turn, opponentOf(rec, rec.drawOffer)])] : turn;
}

/** The line for the chat when a game starts or ends; null otherwise. `name(id)` gives a player's name. */
export function chatLine(rec, name) {
  if (rec.event === 'start') return `${name(rec.by)} started a game`;
  const r = rec.result;
  if (!r) return null;
  if (r.how === 'resignation') return `${name(rec.by)} resigned. ${name(r.winner)} won`;
  if (r.how === 'agreement') return 'Draw agreed';
  if (r.winner === null) return `Draw by ${r.how}`;
  return `${name(r.winner)} won by ${r.how}`;
}
