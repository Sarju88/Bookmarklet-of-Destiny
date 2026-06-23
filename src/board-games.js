const clone = value => structuredClone(value);
const file = square => square % 8;
const rank = square => Math.floor(square / 8);
const inside = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
const square = (r, f) => r * 8 + f;
const algebraic = value => `${"abcdefgh"[file(value)]}${8 - rank(value)}`;
const opposite = color => color === "w" ? "b" : "w";
const pieceColor = piece => piece ? piece === piece.toUpperCase() ? "w" : "b" : null;
const pieceType = piece => piece?.toLowerCase() || "";

export function initialChessState() {
  const state = {
    board: [..."rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR"].map(piece => piece === "." ? "" : piece),
    turn: "w", castling: "KQkq", enPassant: null, halfmove: 0, fullmove: 1,
    history: [], repetition: {}, result: "playing"
  };
  state.repetition[chessPositionKey(state)] = 1;
  return state;
}

export function chessPositionKey(state) {
  return `${state.board.join("")}|${state.turn}|${state.castling || "-"}|${state.enPassant ?? "-"}`;
}

function chessAttacked(state, target, byColor) {
  const tr = rank(target), tf = file(target), board = state.board;
  const pawnSourceRank = tr + (byColor === "w" ? 1 : -1);
  for (const df of [-1, 1]) {
    const f = tf + df;
    if (inside(pawnSourceRank, f) && board[square(pawnSourceRank, f)] === (byColor === "w" ? "P" : "p")) return true;
  }
  for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const r = tr + dr, f = tf + df;
    if (inside(r, f) && board[square(r, f)] === (byColor === "w" ? "N" : "n")) return true;
  }
  for (const [dr, df, types] of [[-1,0,"rq"],[1,0,"rq"],[0,-1,"rq"],[0,1,"rq"],[-1,-1,"bq"],[-1,1,"bq"],[1,-1,"bq"],[1,1,"bq"]]) {
    let r = tr + dr, f = tf + df;
    while (inside(r, f)) {
      const piece = board[square(r, f)];
      if (piece) {
        if (pieceColor(piece) === byColor && types.includes(pieceType(piece))) return true;
        break;
      }
      r += dr; f += df;
    }
  }
  for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) {
    if (!dr && !df) continue;
    const r = tr + dr, f = tf + df;
    if (inside(r, f) && board[square(r, f)] === (byColor === "w" ? "K" : "k")) return true;
  }
  return false;
}

export function chessInCheck(state, color = state.turn) {
  const king = state.board.findIndex(piece => piece === (color === "w" ? "K" : "k"));
  return king >= 0 && chessAttacked(state, king, opposite(color));
}

function chessPseudoMoves(state, from, attacksOnly = false) {
  const board = state.board, piece = board[from], color = pieceColor(piece), type = pieceType(piece);
  if (!piece) return [];
  const moves = [], r = rank(from), f = file(from);
  const add = (to, extra = {}) => {
    if (!inside(rank(to), file(to))) return;
    const target = board[to];
    if (!target || (pieceColor(target) !== color && pieceType(target) !== "k")) moves.push({ from, to, ...extra });
  };
  if (type === "p") {
    const direction = color === "w" ? -1 : 1, start = color === "w" ? 6 : 1, promotionRank = color === "w" ? 0 : 7;
    for (const df of [-1, 1]) {
      const cr = r + direction, cf = f + df;
      if (!inside(cr, cf)) continue;
      const to = square(cr, cf), target = board[to];
      if ((target && pieceColor(target) !== color) || to === state.enPassant) {
        const extra = to === state.enPassant ? { enPassant: true } : {};
        if (cr === promotionRank) for (const promotion of ["q","r","b","n"]) add(to, { ...extra, promotion });
        else add(to, extra);
      }
    }
    if (!attacksOnly) {
      const oneRank = r + direction;
      if (inside(oneRank, f) && !board[square(oneRank, f)]) {
        const to = square(oneRank, f);
        if (oneRank === promotionRank) for (const promotion of ["q","r","b","n"]) add(to, { promotion });
        else add(to);
        const twoRank = r + direction * 2;
        if (r === start && !board[square(twoRank, f)]) add(square(twoRank, f), { doublePawn: true });
      }
    }
  }
  if (type === "n") for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const nr=r+dr,nf=f+df;if(inside(nr,nf))add(square(nr,nf));
  }
  if (["b","r","q"].includes(type)) {
    const directions = type === "b" ? [[-1,-1],[-1,1],[1,-1],[1,1]] : type === "r" ? [[-1,0],[1,0],[0,-1],[0,1]] : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr,df] of directions) {
      let nr=r+dr,nf=f+df;
      while(inside(nr,nf)){const to=square(nr,nf),target=board[to];if(!target)add(to);else{if(pieceColor(target)!==color)add(to);break}nr+=dr;nf+=df}
    }
  }
  if (type === "k") {
    for(let dr=-1;dr<=1;dr++)for(let df=-1;df<=1;df++){if(!dr&&!df)continue;const nr=r+dr,nf=f+df;if(inside(nr,nf))add(square(nr,nf))}
    if (!attacksOnly && !chessInCheck(state, color)) {
      const enemy=opposite(color), home=color==="w"?7:0;
      const kingRook=color==="w"?"R":"r";
      if(state.castling.includes(color==="w"?"K":"k")&&board[square(home,7)]===kingRook&&!board[square(home,5)]&&!board[square(home,6)]&&!chessAttacked(state,square(home,5),enemy)&&!chessAttacked(state,square(home,6),enemy))add(square(home,6),{castle:"king"});
      if(state.castling.includes(color==="w"?"Q":"q")&&board[square(home,0)]===kingRook&&!board[square(home,1)]&&!board[square(home,2)]&&!board[square(home,3)]&&!chessAttacked(state,square(home,3),enemy)&&!chessAttacked(state,square(home,2),enemy))add(square(home,2),{castle:"queen"});
    }
  }
  return moves;
}

function chessApplyRaw(state, move, track = false) {
  const next = clone(state), board = next.board, piece = board[move.from], color = pieceColor(piece), target = board[move.to];
  board[move.from] = "";
  if (move.enPassant) board[move.to + (color === "w" ? 8 : -8)] = "";
  board[move.to] = move.promotion ? (color === "w" ? move.promotion.toUpperCase() : move.promotion) : piece;
  if (move.castle) {
    const home=color==="w"?7:0, rookFrom=square(home,move.castle==="king"?7:0), rookTo=square(home,move.castle==="king"?5:3);
    board[rookTo]=board[rookFrom];board[rookFrom]="";
  }
  let rights=next.castling;
  if(pieceType(piece)==="k")rights=rights.replace(color==="w"?/[KQ]/g:/[kq]/g,"");
  const removeBySquare = value => { if(value===63)rights=rights.replace("K","");if(value===56)rights=rights.replace("Q","");if(value===7)rights=rights.replace("k","");if(value===0)rights=rights.replace("q","") };
  if(pieceType(piece)==="r")removeBySquare(move.from);if(pieceType(target)==="r")removeBySquare(move.to);
  next.castling=rights;next.enPassant=move.doublePawn?(move.from+move.to)/2:null;
  next.halfmove=pieceType(piece)==="p"||target||move.enPassant?0:next.halfmove+1;
  if(color==="b")next.fullmove++;next.turn=opposite(color);
  if(track){next.repetition={...next.repetition};const key=chessPositionKey(next);next.repetition[key]=(next.repetition[key]||0)+1}
  return next;
}

export function chessLegalMoves(state, from = null) {
  const moves = [];
  state.board.forEach((piece,index)=>{
    if(pieceColor(piece)!==state.turn||(from!==null&&index!==from))return;
    for(const move of chessPseudoMoves(state,index))if(!chessInCheck(chessApplyRaw(state,move),state.turn))moves.push(move);
  });
  return moves;
}

function insufficientMaterial(board) {
  const pieces=board.filter(Boolean).map(pieceType).filter(type=>type!=="k");
  if(!pieces.length)return true;
  if(pieces.length===1&&["b","n"].includes(pieces[0]))return true;
  if(pieces.every(type=>type==="b")){
    const colors=[];board.forEach((piece,index)=>{if(pieceType(piece)==="b")colors.push((rank(index)+file(index))%2)});
    return new Set(colors).size===1;
  }
  return false;
}

export function chessResult(state) {
  const legal=chessLegalMoves(state);
  if(!legal.length)return chessInCheck(state)?(state.turn==="w"?"black-won":"white-won"):"stalemate";
  if(state.halfmove>=100)return"fifty-move";
  if(Object.values(state.repetition||{}).some(count=>count>=3))return"repetition";
  if(insufficientMaterial(state.board))return"insufficient";
  return"playing";
}

function chessSan(before, move, after) {
  const piece=before.board[move.from],type=pieceType(piece),capture=!!before.board[move.to]||move.enPassant;
  if(move.castle)return move.castle==="king"?"O-O":"O-O-O";
  let san=type==="p"?(capture?"abcdefgh"[file(move.from)]:""):type.toUpperCase();
  if(type!=="p"){
    const siblings=chessLegalMoves(before).filter(other=>other.to===move.to&&other.from!==move.from&&pieceType(before.board[other.from])===type);
    if(siblings.length)san+=siblings.some(other=>file(other.from)===file(move.from))?8-rank(move.from):"abcdefgh"[file(move.from)];
  }
  if(capture)san+="x";san+=algebraic(move.to);if(move.promotion)san+=`=${move.promotion.toUpperCase()}`;
  const result=chessResult(after);if(["white-won","black-won"].includes(result))san+="#";else if(chessInCheck(after))san+="+";
  return san;
}

export function chessMove(state, move) {
  const legal=chessLegalMoves(state).find(item=>item.from===move.from&&item.to===move.to&&(item.promotion||null)===(move.promotion||null));
  if(!legal)return null;
  let next=chessApplyRaw(state,legal,true);next.history=[...(state.history||[]),chessSan(state,legal,next)];next.result=chessResult(next);return next;
}

const chessValues={p:100,n:320,b:330,r:500,q:900,k:20000};
function chessEvaluate(state, color) {
  let value=0;state.board.forEach((piece,index)=>{if(!piece)return;const type=pieceType(piece),center=3.5-Math.abs(3.5-file(index))+3.5-Math.abs(3.5-rank(index));const score=chessValues[type]+(type!=="k"?center*2:0);value+=pieceColor(piece)===color?score:-score});return value;
}
export function chooseChessMove(state, difficulty = "normal", maxMs = 160) {
  const legal=chessLegalMoves(state);if(!legal.length)return null;
  if(difficulty==="easy")return legal[Math.floor(Math.random()*legal.length)];
  const color=state.turn,deadline=performance.now()+maxMs,depth=difficulty==="hard"?3:2;
  const search=(position,d,alpha,beta)=>{
    if(performance.now()>deadline||d===0||position.result!=="playing")return chessEvaluate(position,color);
    const moves=chessLegalMoves(position);if(!moves.length)return chessEvaluate(position,color);
    let best=position.turn===color?-Infinity:Infinity;
    for(const move of moves){const next=chessMove(position,move);const value=search(next,d-1,alpha,beta);if(position.turn===color){best=Math.max(best,value);alpha=Math.max(alpha,value)}else{best=Math.min(best,value);beta=Math.min(beta,value)}if(beta<=alpha||performance.now()>deadline)break}
    return best;
  };
  let bestMove=legal[0],best=-Infinity;
  for(const move of legal){const next=chessMove(state,move),value=search(next,depth-1,-Infinity,Infinity)+(Math.random()*.2);if(value>best){best=value;bestMove=move}if(performance.now()>deadline)break}
  return bestMove;
}

export function initialCheckersState() {
  const board=Array(64).fill("");
  for(let r=0;r<3;r++)for(let f=0;f<8;f++)if((r+f)%2)board[square(r,f)]="b";
  for(let r=5;r<8;r++)for(let f=0;f<8;f++)if((r+f)%2)board[square(r,f)]="r";
  return {board,turn:"r",forcedFrom:null,history:[],result:"playing"};
}
const checkerColor=piece=>piece?.toLowerCase()||null;
function checkerCaptures(state,from) {
  const piece=state.board[from],color=checkerColor(piece);if(!piece)return[];
  const r=rank(from),f=file(from),dirs=piece===piece.toUpperCase()?[-1,1]:[color==="r"?-1:1];
  const moves=[];for(const dr of dirs)for(const df of[-1,1]){const mr=r+dr,mf=f+df,tr=r+dr*2,tf=f+df*2;if(inside(tr,tf)&&state.board[square(mr,mf)]&&checkerColor(state.board[square(mr,mf)])!==color&&!state.board[square(tr,tf)])moves.push({from,to:square(tr,tf),capture:square(mr,mf)})}return moves;
}
export function checkersLegalMoves(state,from=null) {
  const sources=state.forcedFrom!==null?[state.forcedFrom]:state.board.map((_,i)=>i);
  const captures=sources.flatMap(index=>checkerColor(state.board[index])===state.turn?checkerCaptures(state,index):[]);
  if(captures.length)return from===null?captures:captures.filter(move=>move.from===from);
  if(state.forcedFrom!==null)return[];
  const moves=[];state.board.forEach((piece,index)=>{if(checkerColor(piece)!==state.turn||(from!==null&&index!==from))return;const r=rank(index),f=file(index),dirs=piece===piece.toUpperCase()?[-1,1]:[state.turn==="r"?-1:1];for(const dr of dirs)for(const df of[-1,1]){const nr=r+dr,nf=f+df;if(inside(nr,nf)&&!state.board[square(nr,nf)])moves.push({from:index,to:square(nr,nf)})}});return moves;
}
export function checkersResult(state) {
  const red=state.board.some(piece=>checkerColor(piece)==="r"),black=state.board.some(piece=>checkerColor(piece)==="b");
  if(!red)return"black-won";if(!black)return"red-won";if(!checkersLegalMoves(state).length)return state.turn==="r"?"black-won":"red-won";return"playing";
}
export function checkersMove(state,move) {
  const legal=checkersLegalMoves(state).find(item=>item.from===move.from&&item.to===move.to);if(!legal)return null;
  const next=clone(state),piece=next.board[legal.from];next.board[legal.from]="";next.board[legal.to]=piece;if(legal.capture!==undefined)next.board[legal.capture]="";
  const promotion=(checkerColor(piece)==="r"&&rank(legal.to)===0)||(checkerColor(piece)==="b"&&rank(legal.to)===7);
  if(promotion)next.board[legal.to]=piece.toUpperCase();
  next.history=[...state.history,`${algebraic(legal.from)}${legal.capture!==undefined?"x":"-"}${algebraic(legal.to)}`];
  if(legal.capture!==undefined&&!promotion&&checkerCaptures(next,legal.to).length)next.forcedFrom=legal.to;
  else{next.forcedFrom=null;next.turn=next.turn==="r"?"b":"r"}
  next.result=checkersResult(next);return next;
}
const checkerValue=piece=>piece?piece===piece.toUpperCase()?175:100:0;
function checkerEvaluate(state,color){let value=0;state.board.forEach(piece=>{if(piece)value+=checkerColor(piece)===color?checkerValue(piece):-checkerValue(piece)});return value}
export function chooseCheckersMove(state,difficulty="normal",maxMs=100) {
  const legal=checkersLegalMoves(state);if(!legal.length)return null;if(difficulty==="easy")return legal[Math.floor(Math.random()*legal.length)];
  const color=state.turn,depth=difficulty==="hard"?5:3,deadline=performance.now()+maxMs;
  const search=(position,d,alpha,beta)=>{if(d===0||position.result!=="playing"||performance.now()>deadline)return checkerEvaluate(position,color);const moves=checkersLegalMoves(position);let best=position.turn===color?-Infinity:Infinity;for(const move of moves){const next=checkersMove(position,move),value=search(next,d-1,alpha,beta);if(position.turn===color){best=Math.max(best,value);alpha=Math.max(alpha,value)}else{best=Math.min(best,value);beta=Math.min(beta,value)}if(beta<=alpha||performance.now()>deadline)break}return best};
  let bestMove=legal[0],best=-Infinity;for(const move of legal){const value=search(checkersMove(state,move),depth-1,-Infinity,Infinity)+Math.random()*.1;if(value>best){best=value;bestMove=move}if(performance.now()>deadline)break}return bestMove;
}

export { algebraic };
