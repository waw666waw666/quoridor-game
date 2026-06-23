import { INITIAL_WALLS, LAST_CELL, WALL_GRID_SIZE } from './constants';

export type Position = { r: number; c: number };
export type Player = { id: number; pos: Position; goalRow: number; wallsLeft: number; startPos: Position };

export type Action = 
  | { type: 'move'; player: number; prevPos: Position; newPos: Position }
  | { type: 'wall'; player: number; isH: boolean; r: number; c: number };

export type SerializedGameState = {
  p1: Player;
  p2: Player;
  currentPlayerId: number;
  horizontalWalls: number[][];
  verticalWalls: number[][];
  winnerId: number | null;
  history: Action[];
};

export class QuoridorGame {
  public p1: Player;
  public p2: Player;
  public currentPlayer: Player;
  public horizontalWalls: number[][];
  public verticalWalls: number[][];
  public winner: Player | null = null;
  public history: Action[] = [];

  constructor() {
    this.p1 = { id: 1, pos: { r: 0, c: 4 }, startPos: { r: 0, c: 4 }, goalRow: LAST_CELL, wallsLeft: INITIAL_WALLS };
    this.p2 = { id: 2, pos: { r: LAST_CELL, c: 4 }, startPos: { r: LAST_CELL, c: 4 }, goalRow: 0, wallsLeft: INITIAL_WALLS };
    this.currentPlayer = this.p1;
    this.horizontalWalls = Array(WALL_GRID_SIZE).fill(null).map(() => Array(WALL_GRID_SIZE).fill(0));
    this.verticalWalls = Array(WALL_GRID_SIZE).fill(null).map(() => Array(WALL_GRID_SIZE).fill(0));
  }

  public clone(): QuoridorGame {
    return QuoridorGame.fromJSON(this.toJSON());
  }

  public toJSON(): SerializedGameState {
    return {
      p1: JSON.parse(JSON.stringify(this.p1)),
      p2: JSON.parse(JSON.stringify(this.p2)),
      currentPlayerId: this.currentPlayer.id,
      horizontalWalls: this.horizontalWalls.map(row => [...row]),
      verticalWalls: this.verticalWalls.map(row => [...row]),
      winnerId: this.winner?.id ?? null,
      history: JSON.parse(JSON.stringify(this.history)),
    };
  }

  public static fromJSON(state: SerializedGameState): QuoridorGame {
    const g = new QuoridorGame();
    g.p1 = JSON.parse(JSON.stringify(state.p1));
    g.p2 = JSON.parse(JSON.stringify(state.p2));
    g.currentPlayer = state.currentPlayerId === 1 ? g.p1 : g.p2;
    g.horizontalWalls = state.horizontalWalls.map(row => [...row]);
    g.verticalWalls = state.verticalWalls.map(row => [...row]);
    g.winner = state.winnerId === null ? null : (state.winnerId === 1 ? g.p1 : g.p2);
    g.history = JSON.parse(JSON.stringify(state.history));
    return g;
  }

  public undo(): boolean {
    if (this.history.length === 0) return false;
    const action = this.history.pop()!;
    this.winner = null;

    if (action.type === 'move') {
      const p = action.player === 1 ? this.p1 : this.p2;
      p.pos = { ...action.prevPos };
      this.currentPlayer = p;
    } else {
      const p = action.player === 1 ? this.p1 : this.p2;
      if (action.isH) this.horizontalWalls[action.r][action.c] = 0;
      else this.verticalWalls[action.r][action.c] = 0;
      p.wallsLeft++;
      this.currentPlayer = p;
    }
    return true;
  }

  public isBlocked(r1: number, c1: number, r2: number, c2: number): boolean {
    if (r1 === r2) {
      const minC = Math.min(c1, c2);
      if (minC >= 0 && minC < WALL_GRID_SIZE) {
        if (this.verticalWalls[r1] && this.verticalWalls[r1][minC] !== 0) return true;
        if (r1 - 1 >= 0 && this.verticalWalls[r1 - 1] && this.verticalWalls[r1 - 1][minC] !== 0) return true;
      }
    } else if (c1 === c2) {
      const minR = Math.min(r1, r2);
      if (minR >= 0 && minR < WALL_GRID_SIZE) {
        if (c1 < WALL_GRID_SIZE && this.horizontalWalls[minR] && this.horizontalWalls[minR][c1] !== 0) return true;
        if (c1 - 1 >= 0 && this.horizontalWalls[minR] && this.horizontalWalls[minR][c1 - 1] !== 0) return true;
      }
    }
    return false;
  }

  public getOpponent(p: Player): Player {
    return p.id === 1 ? this.p2 : this.p1;
  }

  private getAdjacent(r: number, c: number): Position[] {
    const moves: Position[] = [];
    if (r > 0 && !this.isBlocked(r, c, r - 1, c)) moves.push({ r: r - 1, c });
    if (r < LAST_CELL && !this.isBlocked(r, c, r + 1, c)) moves.push({ r: r + 1, c });
    if (c > 0 && !this.isBlocked(r, c, r, c - 1)) moves.push({ r, c: c - 1 });
    if (c < LAST_CELL && !this.isBlocked(r, c, r, c + 1)) moves.push({ r, c: c + 1 });
    return moves;
  }

  public getValidMoves(player: Player): Position[] {
    const opp = this.getOpponent(player);
    const moves: Position[] = [];
    const inBounds = (r: number, c: number) => r >= 0 && r <= LAST_CELL && c >= 0 && c <= LAST_CELL;
    const addIfOpen = (from: Position, to: Position) => {
      if (inBounds(to.r, to.c) && !this.isBlocked(from.r, from.c, to.r, to.c)) {
        moves.push(to);
      }
    };

    for (const adj of this.getAdjacent(player.pos.r, player.pos.c)) {
      if (adj.r === opp.pos.r && adj.c === opp.pos.c) {
        const dr = opp.pos.r - player.pos.r;
        const dc = opp.pos.c - player.pos.c;
        const jumpR = opp.pos.r + dr;
        const jumpC = opp.pos.c + dc;
        
        if (inBounds(jumpR, jumpC) && !this.isBlocked(opp.pos.r, opp.pos.c, jumpR, jumpC)) {
          moves.push({ r: jumpR, c: jumpC });
        } else {
          const diagonals = dr !== 0
            ? [{ r: opp.pos.r, c: opp.pos.c - 1 }, { r: opp.pos.r, c: opp.pos.c + 1 }]
            : [{ r: opp.pos.r - 1, c: opp.pos.c }, { r: opp.pos.r + 1, c: opp.pos.c }];

          for (const diagonal of diagonals) {
            addIfOpen(opp.pos, diagonal);
          }
        }
      } else {
        moves.push(adj);
      }
    }
    return moves;
  }

  public movePlayer(player: Player, r: number, c: number): boolean {
    if (this.winner) return false;
    if (player.id !== this.currentPlayer.id) return false;

    const validMoves = this.getValidMoves(player);
    const isValid = validMoves.some(m => m.r === r && m.c === c);
    if (isValid) {
      const prevPos = { ...player.pos };
      player.pos = { r, c };
      this.history.push({ type: 'move', player: player.id, prevPos, newPos: { r, c } });

      if (player.pos.r === player.goalRow) {
        this.winner = player;
      } else {
        this.currentPlayer = this.getOpponent(player);
      }
      return true;
    }
    return false;
  }

  public canPlaceWall(isH: boolean, r: number, c: number): boolean {
    if (r < 0 || r >= WALL_GRID_SIZE || c < 0 || c >= WALL_GRID_SIZE) return false;
    if (this.currentPlayer.wallsLeft <= 0) return false;

    if (this.horizontalWalls[r][c] !== 0 || this.verticalWalls[r][c] !== 0) return false;

    if (isH) {
      if (c > 0 && this.horizontalWalls[r][c - 1] !== 0) return false;
      if (c < WALL_GRID_SIZE - 1 && this.horizontalWalls[r][c + 1] !== 0) return false;
    } else {
      if (r > 0 && this.verticalWalls[r - 1][c] !== 0) return false;
      if (r < WALL_GRID_SIZE - 1 && this.verticalWalls[r + 1][c] !== 0) return false;
    }

    if (isH) this.horizontalWalls[r][c] = this.currentPlayer.id;
    else this.verticalWalls[r][c] = this.currentPlayer.id;

    const p1Path = this.hasPath(this.p1.pos, this.p1.goalRow);
    const p2Path = this.hasPath(this.p2.pos, this.p2.goalRow);

    if (isH) this.horizontalWalls[r][c] = 0;
    else this.verticalWalls[r][c] = 0;

    return p1Path && p2Path;
  }

  public placeWall(isH: boolean, r: number, c: number): boolean {
    if (this.winner) return false;
    if (this.canPlaceWall(isH, r, c)) {
      if (isH) this.horizontalWalls[r][c] = this.currentPlayer.id;
      else this.verticalWalls[r][c] = this.currentPlayer.id;
      this.currentPlayer.wallsLeft--;
      
      this.history.push({ type: 'wall', player: this.currentPlayer.id, isH, r, c });
      this.currentPlayer = this.getOpponent(this.currentPlayer);
      return true;
    }
    return false;
  }

  // Returns shortest path length instead of just boolean
  public getShortestPath(start: Position, goalRow: number): number {
    const q: { p: Position, dist: number }[] = [{ p: start, dist: 0 }];
    const visited = Array(LAST_CELL + 1).fill(null).map(() => Array(LAST_CELL + 1).fill(false));
    visited[start.r][start.c] = true;

    let head = 0;
    while (head < q.length) {
      const curr = q[head++];
      if (curr.p.r === goalRow) return curr.dist;

      const adjs = this.getAdjacent(curr.p.r, curr.p.c);
      for (const adj of adjs) {
        if (!visited[adj.r][adj.c]) {
          visited[adj.r][adj.c] = true;
          q.push({ p: adj, dist: curr.dist + 1 });
        }
      }
    }
    return -1;
  }

  // Returns the actual path as an array of positions
  public getShortestPathNodes(start: Position, goalRow: number): Position[] {
    const q: { p: Position, path: Position[] }[] = [{ p: start, path: [start] }];
    const visited = Array(LAST_CELL + 1).fill(null).map(() => Array(LAST_CELL + 1).fill(false));
    visited[start.r][start.c] = true;

    let head = 0;
    while (head < q.length) {
      const curr = q[head++];
      if (curr.p.r === goalRow) return curr.path;

      const adjs = this.getAdjacent(curr.p.r, curr.p.c);
      for (const adj of adjs) {
        if (!visited[adj.r][adj.c]) {
          visited[adj.r][adj.c] = true;
          q.push({ p: adj, path: [...curr.path, adj] });
        }
      }
    }
    return [];
  }

  private hasPath(start: Position, goalRow: number): boolean {
    return this.getShortestPath(start, goalRow) !== -1;
  }
}
