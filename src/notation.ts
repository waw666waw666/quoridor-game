import { BOARD_SIZE, LAST_CELL } from './constants';
import type { Action } from './game';

const BOARD_COLUMNS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

export function notationFor(action: Action): string {
  if (action.type === 'move') {
    return `P${action.player} ♙ ${BOARD_COLUMNS[action.newPos.c]}${BOARD_SIZE - action.newPos.r}`;
  }

  return `P${action.player} ▤ ${BOARD_COLUMNS[action.c]}${LAST_CELL - action.r}${action.isH ? 'h' : 'v'}`;
}
