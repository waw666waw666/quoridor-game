import { LAST_CELL } from './constants';
import { QuoridorGame, type Player, type Position } from './game';

type Move = { type: 'move'; r: number; c: number };
type Wall = { type: 'wall'; isH: boolean; r: number; c: number };
type Action = Move | Wall;

const WIN = 100000;

export class QuoridorAI {
  private static deadline = 0;
  private static timedOut = false;

  public static getBestMove(
    game: QuoridorGame,
    difficulty: 'easy' | 'normal' | 'hard' = 'normal'
  ): Action | null {
    const ms = difficulty === 'hard' ? 1500 : difficulty === 'normal' ? 600 : 200;
    this.deadline = performance.now() + ms;
    this.timedOut = false;

    const maxDepth = difficulty === 'hard' ? 100 : difficulty === 'normal' ? 3 : 2;
    let best: Action | null = null;

    for (let depth = 1; depth <= maxDepth; depth++) {
      const [action, score] = this.rootSearch(game, depth);
      if (this.timedOut) break;
      if (action !== null) best = action;
      if (score >= WIN - depth) break;
    }

    return best;
  }

  private static rootSearch(game: QuoridorGame, depth: number): [Action | null, number] {
    const actions = this.getCandidates(game);
    if (actions.length === 0) return [null, 0];

    this.orderActions(game, actions);

    let best: Action | null = actions[0];
    let alpha = -Infinity;
    const beta = Infinity;

    for (const action of actions) {
      this.apply(game, action);
      const score = -this.negamax(game, depth - 1, -beta, -alpha);
      this.undo(game);

      if (this.timedOut) return [best, alpha];

      if (score > alpha) {
        alpha = score;
        best = action;
      }
    }

    return [best, alpha];
  }

  private static negamax(game: QuoridorGame, depth: number, alpha: number, beta: number): number {
    if (performance.now() >= this.deadline) {
      this.timedOut = true;
      return 0;
    }

    if (game.winner !== null) return -WIN;
    if (depth === 0) return this.evaluate(game);

    const actions = this.getCandidates(game);
    if (actions.length === 0) return this.evaluate(game);

    this.orderActions(game, actions);

    for (const action of actions) {
      this.apply(game, action);
      const score = -this.negamax(game, depth - 1, -beta, -alpha);
      this.undo(game);

      if (this.timedOut) return 0;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }

    return alpha;
  }

  private static evaluate(game: QuoridorGame): number {
    const me = game.currentPlayer;
    const opp = game.getOpponent(me);

    if (me.pos.r === me.goalRow) return WIN;
    if (opp.pos.r === opp.goalRow) return -WIN;

    const myDist = game.getShortestPath(me.pos, me.goalRow);
    const oppDist = game.getShortestPath(opp.pos, opp.goalRow);

    if (myDist < 0) return -WIN;
    if (oppDist < 0) return WIN;

    const distScore = (oppDist - myDist) * 15;
    const wallScore = (me.wallsLeft - opp.wallsLeft) * 2.0;
    const myProgress = me.id === 1 ? me.pos.r : (LAST_CELL - me.pos.r);
    const oppProgress = opp.id === 1 ? opp.pos.r : (LAST_CELL - opp.pos.r);
    const progressScore = (myProgress - oppProgress) * 0.5;
    const repetitionScore = this.getRepetitionScore(game);

    return distScore + wallScore + progressScore + repetitionScore;
  }

  private static getRepetitionScore(game: QuoridorGame): number {
    const h = game.history;
    let myRepPenalty = 0;
    let oppRepPenalty = 0;

    if (h.length >= 4) {
      const my1 = h[h.length - 2];
      const my2 = h[h.length - 4];
      if (my1.type === 'move' && my2.type === 'move' &&
          my1.newPos.r === my2.prevPos.r && my1.newPos.c === my2.prevPos.c) {
        myRepPenalty -= 1000;
      }
    }

    if (h.length >= 3) {
      const opp1 = h[h.length - 1];
      const opp2 = h[h.length - 3];
      if (opp1.type === 'move' && opp2.type === 'move' &&
          opp1.newPos.r === opp2.prevPos.r && opp1.newPos.c === opp2.prevPos.c) {
        oppRepPenalty -= 1000;
      }
    }

    return myRepPenalty - oppRepPenalty;
  }

  private static getCandidates(game: QuoridorGame): Action[] {
    const me = game.currentPlayer;
    const opp = game.getOpponent(me);
    const actions: Action[] = [];

    for (const m of game.getValidMoves(me)) {
      actions.push({ type: 'move', r: m.r, c: m.c });
    }

    if (me.wallsLeft === 0) return actions;

    const oppPath = game.getShortestPathNodes(opp.pos, opp.goalRow);
    const myPath = game.getShortestPathNodes(me.pos, me.goalRow);
    const wallSet = new Set<string>();

    this.addWallsAlongPath(oppPath, wallSet);
    this.addWallsAlongPath(myPath, wallSet);

    const oppBaseDist = oppPath.length - 1;

    for (const key of wallSet) {
      const isH = key[0] === 'H';
      const [r, c] = key.slice(1).split(',').map(Number);
      if (!game.canPlaceWall(isH, r, c)) continue;

      game.placeWall(isH, r, c);
      const newOppDist = game.getShortestPath(opp.pos, opp.goalRow);
      game.undo();

      if (newOppDist > oppBaseDist) {
        actions.push({ type: 'wall', isH, r, c });
      }
    }

    return actions;
  }

  private static addWallsAlongPath(path: Position[], wallSet: Set<string>): void {
    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i];
      const v = path[i + 1];

      if (u.c === v.c) {
        const r = Math.min(u.r, v.r);
        for (const dc of [-1, 0]) {
          const c = u.c + dc;
          if (c >= 0 && c < LAST_CELL) wallSet.add(`H${r},${c}`);
        }
      } else {
        const c = Math.min(u.c, v.c);
        for (const dr of [-1, 0]) {
          const r = u.r + dr;
          if (r >= 0 && r < LAST_CELL) wallSet.add(`V${r},${c}`);
        }
      }
    }
  }

  private static orderActions(game: QuoridorGame, actions: Action[]): void {
    const me = game.currentPlayer;
    const opp = game.getOpponent(me);
    const oppPath = game.getShortestPathNodes(opp.pos, opp.goalRow);
    const myPath = game.getShortestPathNodes(me.pos, me.goalRow);

    actions.sort((a, b) =>
      this.quickScore(b, me, oppPath, myPath) - this.quickScore(a, me, oppPath, myPath)
    );
  }

  private static quickScore(
    action: Action,
    me: Player,
    oppPath: Position[],
    myPath: Position[]
  ): number {
    if (action.type === 'move') {
      const dr = Math.abs(action.r - me.goalRow);
      return 100 - (dr * 10);
    }

    let score = 0;
    if (this.intersectsPath(action, oppPath)) score += 60;
    if (this.intersectsPath(action, myPath)) score -= 30;
    return score;
  }

  private static intersectsPath(action: Wall, path: Position[]): boolean {
    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i];
      const v = path[i + 1];

      if (action.isH && u.c === v.c) {
        const r = Math.min(u.r, v.r);
        return r === action.r && (action.c === u.c || action.c === u.c - 1);
      }

      if (!action.isH && u.r === v.r) {
        const c = Math.min(u.c, v.c);
        return c === action.c && (action.r === u.r || action.r === u.r - 1);
      }
    }

    return false;
  }

  public static getAdvantageScore(game: QuoridorGame): number {
    const p1Dist = game.getShortestPath(game.p1.pos, game.p1.goalRow);
    const p2Dist = game.getShortestPath(game.p2.pos, game.p2.goalRow);
    
    if (p1Dist === -1 || p2Dist === -1) return 50;

    let diff = p2Dist - p1Dist;
    if (diff > 10) diff = 10;
    if (diff < -10) diff = -10;
    
    return 50 + (diff * 4.5);
  }

  private static apply(game: QuoridorGame, action: Action): void {
    if (action.type === 'move') game.movePlayer(game.currentPlayer, action.r, action.c);
    else game.placeWall(action.isH, action.r, action.c);
  }

  private static undo(game: QuoridorGame): void {
    game.undo();
  }
}
