import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGameState, saveGameState } from './persistence';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
});

describe('persistence', () => {
  it('saves non-network game state', () => {
    saveGameState({
      mode: 'local',
      aiDifficulty: 'normal',
      history: [{ type: 'move', player: 1, prevPos: { r: 0, c: 4 }, newPos: { r: 1, c: 4 } }],
    });

    expect(loadGameState()?.history).toHaveLength(1);
  });

  it('does not save network games', () => {
    saveGameState({
      mode: 'network',
      aiDifficulty: 'normal',
      history: [{ type: 'move', player: 1, prevPos: { r: 0, c: 4 }, newPos: { r: 1, c: 4 } }],
    });

    expect(loadGameState()).toBeNull();
  });
});
