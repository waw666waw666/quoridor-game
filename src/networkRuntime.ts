import type { QuoridorGame } from './game';
import type { NetAction } from './network';

export type RuntimeMode = 'local' | 'ai' | 'network';

export function applyRemoteActionSafely(
  game: QuoridorGame,
  action: NetAction,
  mode: RuntimeMode,
  myNetworkId: number,
  warn: (message: string) => void = console.warn
): boolean {
  if (mode !== 'network') {
    warn('Ignored remote action outside network mode');
    return false;
  }

  if (game.currentPlayer.id === myNetworkId) {
    warn('Ignored remote action while waiting for local player');
    return false;
  }

  const applied = action.type === 'move'
    ? game.movePlayer(game.currentPlayer, action.r, action.c)
    : game.placeWall(action.isH, action.r, action.c);

  if (!applied) warn('Ignored illegal remote action');
  return applied;
}
