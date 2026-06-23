import type { Action } from './game';

export type SavedMode = 'local' | 'ai' | 'network';
export type SavedDifficulty = 'easy' | 'normal' | 'hard';

export type SavedGameStateV1 = {
  version: 1;
  mode: SavedMode;
  aiDifficulty: SavedDifficulty;
  history: Action[];
};
export type SavedGameState = SavedGameStateV1;

const SAVE_KEY = 'quoridor-save';
const modes: SavedMode[] = ['local', 'ai', 'network'];
const difficulties: SavedDifficulty[] = ['easy', 'normal', 'hard'];

export function saveGameState(state: SavedGameState): void {
  if (state.mode === 'network') return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function loadGameState(): SavedGameState | null {
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) return null;

  const parsed = JSON.parse(saved) as Partial<SavedGameState>;
  if (!Array.isArray(parsed.history) || parsed.history.length === 0) return null;

  const mode = modes.includes(parsed.mode as SavedMode) ? parsed.mode as SavedMode : 'local';
  const aiDifficulty = difficulties.includes(parsed.aiDifficulty as SavedDifficulty)
    ? parsed.aiDifficulty as SavedDifficulty
    : 'normal';

  return {
    version: 1,
    mode,
    aiDifficulty,
    history: parsed.history,
  };
}
