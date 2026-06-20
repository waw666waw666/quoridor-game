import { describe, expect, it } from 'vitest';
import { isNetAction } from './network';

describe('isNetAction', () => {
  it('accepts valid move and wall actions', () => {
    expect(isNetAction({ type: 'move', r: 4, c: 5 })).toBe(true);
    expect(isNetAction({ type: 'wall', isH: true, r: 3, c: 2 })).toBe(true);
  });

  it('rejects malformed or out-of-board actions', () => {
    expect(isNetAction({ type: 'move', r: 9, c: 5 })).toBe(false);
    expect(isNetAction({ type: 'wall', isH: 'yes', r: 3, c: 2 })).toBe(false);
    expect(isNetAction({ type: 'wall', isH: false, r: 8, c: 2 })).toBe(false);
    expect(isNetAction(null)).toBe(false);
  });
});
