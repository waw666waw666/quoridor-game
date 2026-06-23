import { LAST_CELL } from './constants';
import { QuoridorGame, type Player, type Position } from './game';

type Move = { type: 'move'; r: number; c: number };
type Wall = { type: 'wall'; isH: boolean; r: number; c: number };
type Action = Move | Wall;

const WIN = 100000;

export class QuoridorAI {
  private static deadline = 0;
  private static timedOut = false;
  private static currentDifficulty: 'easy' | 'normal' | 'hard' = 'normal';

  public static getBestMove(
    game: QuoridorGame,
    difficulty: 'easy' | 'normal' | 'hard' = 'normal'
  ): Action | null {
    this.currentDifficulty = difficulty;
    const ms = difficulty === 'hard' ? 1500 : difficulty === 'normal' ? 400 : 200;
    this.deadline = performance.now() + ms;
    this.timedOut = false;

    // Hard: deep search. Normal: look ahead 2 plies. Easy: look ahead 1 ply.
    const maxDepth = difficulty === 'hard' ? 100 : difficulty === 'normal' ? 2 : 1;
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

    if (game.winner !== null) {
      // Opponent just moved and won. We are losing, but we prefer states where we are closer to our goal.
      const meDist = game.getShortestPath(game.currentPlayer.pos, game.currentPlayer.goalRow);
      return -WIN + (100 - meDist);
    }
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

    const myDist = game.getShortestPath(me.pos, me.goalRow);
    const oppDist = game.getShortestPath(opp.pos, opp.goalRow);

    if (me.pos.r === me.goalRow) return WIN;
    if (opp.pos.r === opp.goalRow) return -WIN + (100 - myDist);

    if (myDist < 0) return -WIN;
    if (oppDist < 0) return WIN;

    const distScore = (oppDist - myDist) * 15;
    const wallScore = (me.wallsLeft - opp.wallsLeft) * 2.0;
    const myProgress = me.id === 1 ? me.pos.r : (LAST_CELL - me.pos.r);
    const oppProgress = opp.id === 1 ? opp.pos.r : (LAST_CELL - opp.pos.r);
    const progressScore = (myProgress - oppProgress) * 0.5;
    const repetitionScore = this.getRepetitionScore(game);

    let totalScore = distScore + wallScore + progressScore + repetitionScore;

    // Inject "human error" / random noise based on difficulty
    if (this.currentDifficulty === 'normal') {
      totalScore += (Math.random() * 4 - 2); // Random noise [-2, +2]
    } else if (this.currentDifficulty === 'easy') {
      totalScore += (Math.random() * 12 - 6); // Random noise [-6, +6]
    }

    return totalScore;
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
    const myBaseDist = myPath.length - 1;

    for (const key of wallSet) {
      const isH = key[0] === 'H';
      const [r, c] = key.slice(1).split(',').map(Number);
      if (!game.canPlaceWall(isH, r, c)) continue;

      game.placeWall(isH, r, c);
      const newOppDist = game.getShortestPath(opp.pos, opp.goalRow);
      const newMyDist = game.getShortestPath(me.pos, me.goalRow);
      game.undo();

      if (newOppDist > oppBaseDist || newMyDist === myBaseDist) {
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
        if (r === action.r && (action.c === u.c || action.c === u.c - 1)) return true;
      }

      if (!action.isH && u.r === v.r) {
        const c = Math.min(u.c, v.c);
        if (c === action.c && (action.r === u.r || action.r === u.r - 1)) return true;
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
