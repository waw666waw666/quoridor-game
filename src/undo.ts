import type { QuoridorGame } from './game';

export type UndoMode = 'local' | 'ai' | 'network';

export function undoForMode(game: QuoridorGame, mode: UndoMode, aiPlayerId: number): boolean {
  if (mode === 'network') return false;
  if (game.history.length === 0) return false;

  if (mode === 'ai' && game.history[game.history.length - 1]?.player === aiPlayerId) {
    const undoneAi = game.undo();
    const undonePlayer = game.undo();
    return undoneAi || undonePlayer;
  }

  return game.undo();
}
