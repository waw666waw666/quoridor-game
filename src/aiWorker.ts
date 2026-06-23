import { QuoridorAI } from './ai';
import { QuoridorGame } from './game';
import type { AiWorkerRequest, AiWorkerResponse } from './aiTypes';

export function computeAiWorkerResponse(request: AiWorkerRequest): AiWorkerResponse {
  try {
    const game = QuoridorGame.fromJSON(request.state);
    return {
      id: request.id,
      action: QuoridorAI.getBestMove(game, request.difficulty),
    };
  } catch (error) {
    return {
      id: request.id,
      action: null,
      error: error instanceof Error ? error.message : 'AI worker failed',
    };
  }
}

type WorkerScope = {
  addEventListener?: (type: 'message', listener: (event: MessageEvent<AiWorkerRequest>) => void) => void;
  postMessage?: (response: AiWorkerResponse) => void;
};

const workerScope = globalThis as WorkerScope;

if (typeof workerScope.addEventListener === 'function' && typeof workerScope.postMessage === 'function') {
  workerScope.addEventListener('message', (event: MessageEvent<AiWorkerRequest>) => {
    workerScope.postMessage?.(computeAiWorkerResponse(event.data));
  });
}
