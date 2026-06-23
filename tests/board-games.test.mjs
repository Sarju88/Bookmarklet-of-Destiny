import test from "node:test";
import assert from "node:assert/strict";
import {
  checkersLegalMoves, checkersMove, checkersResult, chessInCheck, chessLegalMoves,
  chessMove, chessResult, chooseCheckersMove, chooseChessMove, initialCheckersState,
  initialChessState
} from "../src/board-games.js";

const sq = value => (8 - Number(value[1])) * 8 + "abcdefgh".indexOf(value[0]);
const emptyChess = ({ turn = "w", castling = "", enPassant = null, halfmove = 0 } = {}) => ({
  board: Array(64).fill(""), turn, castling, enPassant, halfmove, fullmove: 1,
  history: [], repetition: {}, result: "playing"
});
const put = (state, entries) => { for (const [name, piece] of Object.entries(entries)) state.board[sq(name)] = piece; return state; };
const move = (state, from, to, promotion = null) => chessMove(state, { from: sq(from), to: sq(to), promotion });

test("chess enforces standard movement, check, castling, en passant, and promotion", () => {
  let state = initialChessState();
  assert.equal(chessLegalMoves(state).length, 20);
  assert.equal(chessLegalMoves(state, sq("a1")).length, 0);
  assert.deepEqual(chessLegalMoves(state, sq("g1")).map(item => item.to).sort((a,b)=>a-b), [sq("f3"), sq("h3")].sort((a,b)=>a-b));
  state = move(state, "e2", "e4");
  state = move(state, "e7", "e5");
  state = move(state, "g1", "f3");
  assert.deepEqual(state.history, ["e4", "e5", "Nf3"]);

  let castle = put(emptyChess({ castling: "KQ" }), { e1:"K", a1:"R", h1:"R", e8:"k" });
  const castles = chessLegalMoves(castle, sq("e1"));
  assert.ok(castles.some(item => item.castle === "king"));
  assert.ok(castles.some(item => item.castle === "queen"));
  castle = chessMove(castle, castles.find(item => item.castle === "king"));
  assert.equal(castle.board[sq("g1")], "K");
  assert.equal(castle.board[sq("f1")], "R");

  let ep = put(emptyChess({ turn:"b" }), { e1:"K", e8:"k", e5:"P", d7:"p" });
  ep = move(ep, "d7", "d5");
  assert.equal(ep.enPassant, sq("d6"));
  const epMove = chessLegalMoves(ep, sq("e5")).find(item => item.enPassant);
  assert.equal(epMove.to, sq("d6"));
  ep = chessMove(ep, epMove);
  assert.equal(ep.board[sq("d5")], "");
  assert.equal(ep.board[sq("d6")], "P");

  for (const promotion of ["q","r","b","n"]) {
    let promote = put(emptyChess(), { e1:"K", e8:"k", a7:"P" });
    promote = move(promote, "a7", "a8", promotion);
    assert.equal(promote.board[sq("a8")], promotion.toUpperCase());
  }

  const pinned = put(emptyChess(), { e1:"K", e2:"R", e8:"r", a8:"k" });
  assert.equal(chessLegalMoves(pinned, sq("e2")).some(item => item.to === sq("d2")), false);
  assert.equal(chessInCheck(pinned, "w"), false);
});

test("chess resolves checkmate, stalemate, and all requested draw rules", () => {
  let mate = initialChessState();
  mate = move(mate,"f2","f3"); mate = move(mate,"e7","e5"); mate = move(mate,"g2","g4"); mate = move(mate,"d8","h4");
  assert.equal(mate.result, "black-won");
  assert.match(mate.history.at(-1), /#$/);

  const stalemate = put(emptyChess({ turn:"b" }), { a8:"k", c6:"K", b6:"Q" });
  assert.equal(chessResult(stalemate), "stalemate");
  const insufficient = put(emptyChess(), { e1:"K", e8:"k", c1:"B" });
  assert.equal(chessResult(insufficient), "insufficient");
  const fifty = put(emptyChess({ halfmove:100 }), { e1:"K", e8:"k", a1:"R" });
  assert.equal(chessResult(fifty), "fifty-move");
  const repetition = put(emptyChess(), { e1:"K", e8:"k", a1:"R" });
  repetition.repetition = { repeated: 3 };
  assert.equal(chessResult(repetition), "repetition");
});

test("chess CPUs return legal moves within a bounded time", () => {
  for (const difficulty of ["easy","normal","hard"]) {
    const state = initialChessState(), start = performance.now();
    const chosen = chooseChessMove(state, difficulty, 80);
    assert.ok(chessLegalMoves(state).some(move => move.from === chosen.from && move.to === chosen.to && (move.promotion || null) === (chosen.promotion || null)));
    assert.ok(performance.now() - start < 600);
  }
});

test("American checkers enforces movement, mandatory and chained captures, kings, and endings", () => {
  let state = initialCheckersState();
  assert.equal(checkersLegalMoves(state).length, 7);

  state = { board:Array(64).fill(""), turn:"r", forcedFrom:null, history:[], result:"playing" };
  state.board[sq("c3")] = "r"; state.board[sq("d4")] = "b"; state.board[sq("f6")] = "b";
  const mandatory = checkersLegalMoves(state);
  assert.equal(mandatory.length, 1);
  assert.equal(mandatory[0].to, sq("e5"));
  state = checkersMove(state, mandatory[0]);
  assert.equal(state.forcedFrom, sq("e5"));
  assert.equal(state.turn, "r");
  state = checkersMove(state, checkersLegalMoves(state)[0]);
  assert.equal(state.turn, "b");
  assert.equal(state.board[sq("g7")], "r");

  let king = { board:Array(64).fill(""), turn:"r", forcedFrom:null, history:[], result:"playing" };
  king.board[sq("b7")] = "r"; king.board[sq("h1")] = "b";
  king = checkersMove(king, { from:sq("b7"), to:sq("a8") });
  assert.equal(king.board[sq("a8")], "R");
  king.turn = "r"; king.result = "playing";
  assert.ok(checkersLegalMoves(king, sq("a8")).some(item => item.to === sq("b7")));

  const blocked = { board:Array(64).fill(""), turn:"b", forcedFrom:null, history:[], result:"playing" };
  blocked.board[sq("a1")] = "b"; blocked.board[sq("c3")] = "r";
  assert.equal(checkersResult(blocked), "red-won");
});

test("checkers CPUs always choose legal moves", () => {
  for (const difficulty of ["easy","normal","hard"]) {
    const state=initialCheckersState(),chosen=chooseCheckersMove(state,difficulty,60);
    assert.ok(checkersLegalMoves(state).some(move => move.from === chosen.from && move.to === chosen.to));
  }
});
