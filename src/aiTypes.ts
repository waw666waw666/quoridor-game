import type { SerializedGameState } from './game';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type AiMoveAction = { type: 'move'; r: number; c: number };
export type AiWallAction = { type: 'wall'; isH: boolean; r: number; c: number };
export type AiAction = AiMoveAction | AiWallAction;

export type AiWorkerRequest = {
  id: number;
  state: SerializedGameState;
  difficulty: Difficulty;
};

export type AiWorkerResponse = {
  id: number;
  action: AiAction | null;
  error?: string;
};
