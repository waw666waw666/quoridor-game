import { describe, expect, it } from 'vitest';
import { QuoridorGame } from './game';

const movesOf = (game: QuoridorGame, player = game.p1) =>
  game.getValidMoves(player).map(({ r, c }) => `${r},${c}`).sort();

describe('QuoridorGame movement rules', () => {
  it('allows a straight jump when players are face-to-face and no wall is behind the opponent', () => {
    const game = new QuoridorGame();
    game.p1.pos = { r: 4, c: 4 };
    game.p2.pos = { r: 5, c: 4 };

    expect(movesOf(game)).toContain('6,4');
  });

  it('allows only open side jumps when the straight jump is blocked by a wall', () => {
    const game = new QuoridorGame();
    game.p1.pos = { r: 4, c: 4 };
    game.p2.pos = { r: 5, c: 4 };
    game.horizontalWalls[5][4] = 1;
    game.verticalWalls[5][3] = 1;

    expect(movesOf(game)).toEqual(['3,4', '4,3', '4,5', '5,5']);
  });

  it('allows side jumps when the opponent is against the board edge', () => {
    const game = new QuoridorGame();
    game.p1.pos = { r: 1, c: 4 };
    game.p2.pos = { r: 0, c: 4 };

    expect(movesOf(game)).toEqual(['0,3', '0,5', '1,3', '1,5', '2,4']);
  });

  it('does not allow any jump over the opponent when straight and both sides are blocked', () => {
    const game = new QuoridorGame();
    game.p1.pos = { r: 4, c: 4 };
    game.p2.pos = { r: 5, c: 4 };
    game.horizontalWalls[5][4] = 1;
    game.verticalWalls[5][3] = 1;
    game.verticalWalls[5][4] = 1;

    expect(movesOf(game)).toEqual(['3,4', '4,3', '4,5']);
  });
});

describe('QuoridorGame wall and history rules', () => {
  it('rejects a wall that would leave a player with no path', () => {
    const game = new QuoridorGame();
    game.p1.pos = { r: 7, c: 4 };
    game.p2.pos = { r: 0, c: 4 };

    for (let c = 0; c < 8; c++) {
      if (c !== 4) game.horizontalWalls[7][c] = 1;
    }

    expect(game.canPlaceWall(true, 7, 4)).toBe(false);
  });

  it('undoes moves and restores the previous current player', () => {
    const game = new QuoridorGame();

    expect(game.movePlayer(game.p1, 1, 4)).toBe(true);
    expect(game.currentPlayer.id).toBe(2);
    expect(game.undo()).toBe(true);

    expect(game.p1.pos).toEqual({ r: 0, c: 4 });
    expect(game.currentPlayer.id).toBe(1);
  });
});
