import { describe, expect, it, vi } from 'vitest';
import { QuoridorGame } from './game';
import { applyRemoteActionSafely } from './networkRuntime';
import { undoForMode } from './undo';
import { computeAiWorkerResponse } from './aiWorker';

describe('applyRemoteActionSafely', () => {
  it('ignores remote actions when it is still the local player turn', () => {
    const game = new QuoridorGame();
    const warn = vi.fn();

    expect(applyRemoteActionSafely(game, { type: 'move', r: 1, c: 4 }, 'network', 1, warn)).toBe(false);

    expect(game.p1.pos).toEqual({ r: 0, c: 4 });
    expect(game.history).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it('applies only legal remote actions on the remote player turn', () => {
    const game = new QuoridorGame();
    game.movePlayer(game.p1, 1, 4);
    const warn = vi.fn();

    expect(applyRemoteActionSafely(game, { type: 'move', r: 7, c: 4 }, 'network', 1, warn)).toBe(true);
    expect(game.p2.pos).toEqual({ r: 7, c: 4 });

    const before = game.toJSON();
    expect(applyRemoteActionSafely(game, { type: 'move', r: 8, c: 8 }, 'network', 1, warn)).toBe(false);
    expect(game.toJSON()).toEqual(before);
  });
});

describe('undoForMode', () => {
  it('leaves empty history unchanged', () => {
    const game = new QuoridorGame();
    expect(undoForMode(game, 'ai', 2)).toBe(false);
    expect(game.history).toHaveLength(0);
  });

  it('undoes one action if the AI has not moved yet', () => {
    const game = new QuoridorGame();
    game.movePlayer(game.p1, 1, 4);

    expect(undoForMode(game, 'ai', 2)).toBe(true);

    expect(game.p1.pos).toEqual({ r: 0, c: 4 });
    expect(game.currentPlayer.id).toBe(1);
  });

  it('undoes player plus AI when the last action belongs to AI', () => {
    const game = new QuoridorGame();
    game.movePlayer(game.p1, 1, 4);
    game.movePlayer(game.p2, 7, 4);

    expect(undoForMode(game, 'ai', 2)).toBe(true);

    expect(game.p1.pos).toEqual({ r: 0, c: 4 });
    expect(game.p2.pos).toEqual({ r: 8, c: 4 });
    expect(game.currentPlayer.id).toBe(1);
  });
});

describe('computeAiWorkerResponse', () => {
  it('restores serialized state and returns an AI action', () => {
    const game = new QuoridorGame();
    game.movePlayer(game.p1, 1, 4);

    const response = computeAiWorkerResponse({
      id: 7,
      state: game.toJSON(),
      difficulty: 'easy',
    });

    expect(response.id).toBe(7);
    expect(response.action).not.toBeNull();
    expect(response.error).toBeUndefined();
  });
});
