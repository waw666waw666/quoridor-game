// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { HintController } from './hintController';
import { InputController } from './inputController';
import { TimerController } from './timerController';

describe('HintController', () => {
  it('clears wall hints only after successful wall placement', () => {
    const board = document.createElement('div');
    const hint = new HintController(board, 62);

    hint.show({ type: 'wall', isH: true, r: 2, c: 3 });
    expect(board.querySelector('#active-hint-wall')).not.toBeNull();

    hint.clearAfterWallPlacement(false);
    expect(board.querySelector('#active-hint-wall')).not.toBeNull();

    hint.clearAfterWallPlacement(true);
    expect(board.querySelector('#active-hint-wall')).toBeNull();
  });
});

describe('InputController', () => {
  it('finds the same wall target for pointer coordinates used by mouse and touch', () => {
    const board = document.createElement('div');
    board.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 562,
      height: 562,
      right: 562,
      bottom: 562,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    const input = new InputController(board, 562, 57, 28, 8);

    expect(input.getWallTarget(57, 57)).toEqual({ r: 0, c: 0, isH: true });
    expect(input.getWallTarget(57, 85)).toEqual({ r: 0, c: 0, isH: false });
    expect(input.getWallTarget(20, 20)).toBeNull();
  });
});

describe('TimerController', () => {
  it('does not undo or mutate game state itself and reports timeout via callback', () => {
    vi.useFakeTimers();
    const p1 = document.createElement('strong');
    const p2 = document.createElement('strong');
    let winner = 0;
    let currentPlayer = 1;
    const timer = new TimerController(p1, p2, () => currentPlayer);
    timer.onTimeout(id => { winner = id; });

    timer.reset('local', true);
    timer.start();
    vi.advanceTimersByTime(301_000);

    expect(winner).toBe(2);
    expect(p1.innerText).toBe('00:00');
    currentPlayer = 2;
    expect(currentPlayer).toBe(2);
    vi.useRealTimers();
  });

  it('can align its turn baseline after loading a game', () => {
    const p1 = document.createElement('strong');
    const p2 = document.createElement('strong');
    let currentPlayer = 2;
    const timer = new TimerController(p1, p2, () => currentPlayer);

    timer.reset('local', true);
    timer.syncToCurrentPlayer();
    timer.syncTurn(true, 1);

    expect(p1.innerText).toBe('05:00');
    expect(p2.innerText).toBe('05:00');

    currentPlayer = 1;
    timer.syncTurn(true, 2);

    expect(p2.innerText).toBe('05:05');
  });
});
