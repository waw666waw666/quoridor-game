import { describe, expect, it } from 'vitest';
import { QuoridorGame } from './game';

describe('QuoridorGame serialization', () => {
  it('round-trips board, history, winner, and current player', () => {
    const game = new QuoridorGame();
    game.movePlayer(game.p1, 1, 4);
    game.placeWall(true, 4, 4);
    game.movePlayer(game.p1, 2, 4);
    game.horizontalWalls[3][2] = 2;

    const restored = QuoridorGame.fromJSON(game.toJSON());

    expect(restored.p1).toEqual(game.p1);
    expect(restored.p2).toEqual(game.p2);
    expect(restored.currentPlayer.id).toBe(game.currentPlayer.id);
    expect(restored.horizontalWalls).toEqual(game.horizontalWalls);
    expect(restored.verticalWalls).toEqual(game.verticalWalls);
    expect(restored.history).toEqual(game.history);
    expect(restored.getValidMoves(restored.currentPlayer)).toEqual(game.getValidMoves(game.currentPlayer));
  });
});
