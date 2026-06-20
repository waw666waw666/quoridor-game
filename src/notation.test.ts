import { describe, expect, it } from 'vitest';
import { notationFor } from './notation';

describe('notationFor', () => {
  it('formats pawn moves and wall placements', () => {
    expect(notationFor({
      type: 'move',
      player: 1,
      prevPos: { r: 0, c: 4 },
      newPos: { r: 1, c: 4 },
    })).toBe('P1 ♙ e8');

    expect(notationFor({
      type: 'wall',
      player: 2,
      isH: false,
      r: 3,
      c: 2,
    })).toBe('P2 ▤ c5v');
  });
});
