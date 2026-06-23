import { describe, expect, it } from 'vitest';
import { QuoridorAI } from './ai';
import { QuoridorGame } from './game';

type WallAction = { type: 'wall'; isH: boolean; r: number; c: number };

const aiInternals = QuoridorAI as unknown as {
  intersectsPath: (action: WallAction, path: { r: number; c: number }[]) => boolean;
  getCandidates: (game: QuoridorGame) => Array<{ type: 'move'; r: number; c: number } | WallAction>;
};

describe('QuoridorAI path scoring', () => {
  it('recognizes horizontal walls on later vertical path segments', () => {
    expect(aiInternals.intersectsPath(
      { type: 'wall', isH: true, r: 1, c: 4 },
      [{ r: 0, c: 4 }, { r: 1, c: 4 }, { r: 2, c: 4 }]
    )).toBe(true);
  });

  it('recognizes vertical walls on later horizontal path segments', () => {
    expect(aiInternals.intersectsPath(
      { type: 'wall', isH: false, r: 2, c: 4 },
      [{ r: 2, c: 3 }, { r: 2, c: 4 }, { r: 2, c: 5 }]
    )).toBe(true);
  });

  it('keeps defensive walls that do not damage the current player path', () => {
    const game = new QuoridorGame();
    game.p1.pos = { r: 6, c: 4 };
    game.p2.pos = { r: 2, c: 4 };
    game.currentPlayer = game.p1;
    game.verticalWalls[5][4] = 2;

    const before = game.getShortestPath(game.p1.pos, game.p1.goalRow);
    const candidates = aiInternals.getCandidates(game).filter(a => a.type === 'wall');

    const hasSafeDefensiveWall = candidates.some(action => {
      const clone = game.clone();
      if (!clone.placeWall(action.isH, action.r, action.c)) return false;
      return clone.getShortestPath(clone.p1.pos, clone.p1.goalRow) === before;
    });

    expect(hasSafeDefensiveWall).toBe(true);
  });
});
