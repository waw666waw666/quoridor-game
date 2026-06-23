import { QuoridorAI } from './ai';
import type { QuoridorGame } from './game';
import type { AiAction, AiWorkerRequest, AiWorkerResponse, Difficulty } from './aiTypes';

let nextRequestId = 1;

export function getBestMoveAsync(
  game: QuoridorGame,
  difficulty: Difficulty,
  timeoutMs = 2500
): Promise<AiAction | null> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(QuoridorAI.getBestMove(game, difficulty));
  }

  return new Promise(resolve => {
    const requestId = nextRequestId++;
    const worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
    let settled = false;

    const finish = (action: AiAction | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(action);
    };

    const fallback = () => finish(QuoridorAI.getBestMove(game, difficulty));
    const timeout = window.setTimeout(fallback, timeoutMs);

    worker.onmessage = (event: MessageEvent<AiWorkerResponse>) => {
      if (event.data.id !== requestId) return;
      finish(event.data.action);
    };
    worker.onerror = fallback;
    worker.onmessageerror = fallback;

    const request: AiWorkerRequest = {
      id: requestId,
      state: game.toJSON(),
      difficulty,
    };
    worker.postMessage(request);
  });
}
