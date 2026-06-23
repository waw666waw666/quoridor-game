import './style.css';
import {
  BOARD_SIZE,
  LAST_CELL,
  WALL_GRID_SIZE,
} from './constants';
import { QuoridorGame } from './game';
import { audio } from './audio';
import { net, type NetAction } from './network';
import { QuoridorAI } from './ai';
import { notationFor } from './notation';
import { loadGameState, saveGameState } from './persistence';
import { WallRenderer } from './wallRenderer';
import { HintController } from './hintController';
import { getBestMoveAsync } from './aiClient';
import { applyRemoteActionSafely } from './networkRuntime';
import { undoForMode } from './undo';
import { InputController } from './inputController';
import { TimerController } from './timerController';

declare const confetti: (options: {
  particleCount: number;
  angle: number;
  spread: number;
  origin: { x: number };
  colors: string[];
}) => void;

type Mode = 'local' | 'ai' | 'network';
type Difficulty = 'easy' | 'normal' | 'hard';

const CELL_STEP = 62;
const PLAYER_OFFSET = 7;
const WALL_OFFSET = 50;
const BOARD_POINTER_SIZE = 562;
const WALL_CENTER_OFFSET = 57;
const WALL_HIT_RADIUS = 28;
const WARNING_FLASH_MS = 500;
const SHAKE_MS = 200;
const AI_THINKING_DELAY_MS = 500;
const HINT_DELAY_MS = 50;
const HINT_VISIBLE_MS = 3000;
const CONFETTI_DURATION_MS = 3000;
const CONFETTI_PARTICLES = 5;
function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

let game = new QuoridorGame();
let isPreviewHorizontal = true;
let hoveredIntersection: { r: number, c: number } | null = null;

let mode: Mode = 'local';
let aiDifficulty: Difficulty = 'normal';
const aiPlayerId = 2;
const myNetworkId = 1;

const boardEl = getEl('board');
const p1WallsEl = getEl('p1-walls');
const p2WallsEl = getEl('p2-walls');
const p1StatusEl = getEl('p1-status');
const p2StatusEl = getEl('p2-status');
const victoryModal = getEl('victory-modal');
const victoryTitle = getEl('victory-title');
const btnRestart = getEl<HTMLButtonElement>('btn-restart');
const helpModal = getEl('help-modal');
const btnHelp = getEl<HTMLButtonElement>('btn-help');
const btnCloseHelp = getEl<HTMLButtonElement>('btn-close-help');
const p1TimeEl = getEl('p1-time');
const p2TimeEl = getEl('p2-time');
const historyListEl = getEl('history-list');
const btnUndo = getEl<HTMLButtonElement>('btn-undo');
const btnAi = getEl<HTMLButtonElement>('btn-ai');
const btnLocal = getEl<HTMLButtonElement>('btn-local');
const aiDifficultyContainer = getEl('ai-difficulty-container');
const diffBtns = document.querySelectorAll<HTMLButtonElement>('.diff-btn');
const btnToggleSfx = getEl<HTMLButtonElement>('btn-toggle-sfx');
const sliderSfxVol = getEl<HTMLInputElement>('slider-sfx-vol');
const btnSettings = getEl<HTMLButtonElement>('btn-settings');
const settingsModal = getEl('settings-modal');
const btnCloseSettings = getEl<HTMLButtonElement>('btn-close-settings');
const chkEvalBar = getEl<HTMLInputElement>('setting-eval-bar');
const chkFisherClock = getEl<HTMLInputElement>('setting-fisher-clock');
const chkHint = getEl<HTMLInputElement>('setting-hint');
const btnHint = getEl<HTMLButtonElement>('btn-hint');
const evalBarContainer = getEl('eval-bar-container');
const evalFill = getEl('eval-bar-fill');
const roomInfo = document.getElementById('room-info');
const timerController = new TimerController(
  p1TimeEl,
  p2TimeEl,
  () => game.currentPlayer.id,
  () => game.winner !== null,
  (playerId) => playTickWarning(playerId)
);
timerController.onTimeout((winnerId) => declareWinner(winnerId, '(Timeout)'));

export const proSettings = {
  evalBar: localStorage.getItem('setting-eval-bar') !== 'false',
  fisherClock: localStorage.getItem('setting-fisher-clock') !== 'false',
  hint: localStorage.getItem('setting-hint') !== 'false'
};

function applySettings() {
  evalBarContainer.style.display = proSettings.evalBar ? 'block' : 'none';
  btnHint.style.display = proSettings.hint ? 'block' : 'none';

  const p1TimeContainer = p1TimeEl.parentElement!;
  const p2TimeContainer = p2TimeEl.parentElement!;
  if (proSettings.fisherClock) {
    p1TimeContainer.style.display = 'flex';
    p2TimeContainer.style.display = 'flex';
    if (!game.winner) startTimer();
  } else {
    p1TimeContainer.style.display = 'none';
    p2TimeContainer.style.display = 'none';
    timerController.stop();
  }


}

chkEvalBar.checked = proSettings.evalBar;
chkFisherClock.checked = proSettings.fisherClock;

chkHint.checked = proSettings.hint;
applySettings();

// Player elements
const p1El = document.createElement('div');
p1El.className = 'player p1';
const p2El = document.createElement('div');
p2El.className = 'player p2';
boardEl.appendChild(p1El);
boardEl.appendChild(p2El);

// Preview wall
const previewEl = document.createElement('div');
previewEl.className = 'wall wall-preview';
boardEl.appendChild(previewEl);
const wallRenderer = new WallRenderer(boardEl, previewEl, CELL_STEP, WALL_OFFSET);
const hintController = new HintController(boardEl, CELL_STEP);
const inputController = new InputController(boardEl, BOARD_POINTER_SIZE, WALL_CENTER_OFFSET, WALL_HIT_RADIUS, WALL_GRID_SIZE);
const touchRotateBtn = document.createElement('button');
touchRotateBtn.id = 'btn-touch-rotate';
touchRotateBtn.className = 'btn-wood touch-rotate';
touchRotateBtn.type = 'button';
touchRotateBtn.innerText = '切换墙方向';
touchRotateBtn.style.display = 'none';
boardEl.parentElement?.appendChild(touchRotateBtn);

const cellEls: HTMLDivElement[][] = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));

function initAudio() {
  // First interaction initializes audio context
  audio.init();
}

document.body.addEventListener('click', initAudio, { once: true });

touchRotateBtn.addEventListener('click', () => {
  if (!hoveredIntersection || !isMyTurn()) return;
  isPreviewHorizontal = !isPreviewHorizontal;
  onIntersectionHover(hoveredIntersection.r, hoveredIntersection.c);
});

let hoveredPlayerForPath: 1 | 2 | null = null;

function clearPaths() {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (cellEls[r][c]) {
        cellEls[r][c].classList.remove('path-dot-p1', 'path-dot-p2');
      }
    }
  }
}

function updatePaths() {
  clearPaths();
  if (hoveredPlayerForPath === null) return;
  
  const pId = hoveredPlayerForPath;
  const goal = pId === 1 ? LAST_CELL : 0;
  
  let path: {r: number, c: number}[] = [];
  
  if (hoveredIntersection && isMyTurn() && previewEl.style.opacity === '1') {
    if (game.canPlaceWall(isPreviewHorizontal, hoveredIntersection.r, hoveredIntersection.c)) {
      const clonedGame = game.clone();
      clonedGame.placeWall(isPreviewHorizontal, hoveredIntersection.r, hoveredIntersection.c);
      const p = pId === 1 ? clonedGame.p1 : clonedGame.p2;
      path = clonedGame.getShortestPathNodes(p.pos, goal);
    } else {
      const p = pId === 1 ? game.p1 : game.p2;
      path = game.getShortestPathNodes(p.pos, goal);
    }
  } else {
    const p = pId === 1 ? game.p1 : game.p2;
    path = game.getShortestPathNodes(p.pos, goal);
  }
  
  const pathClass = pId === 1 ? 'path-dot-p1' : 'path-dot-p2';
  for (const pos of path) {
    if (pos.r === game.p1.pos.r && pos.c === game.p1.pos.c) continue;
    if (pos.r === game.p2.pos.r && pos.c === game.p2.pos.c) continue;
    cellEls[pos.r][pos.c].classList.add(pathClass);
  }
}

p1El.addEventListener('mouseenter', () => { hoveredPlayerForPath = 1; updatePaths(); });
p1El.addEventListener('mouseleave', () => { hoveredPlayerForPath = null; updatePaths(); });
p2El.addEventListener('mouseenter', () => { hoveredPlayerForPath = 2; updatePaths(); });
p2El.addEventListener('mouseleave', () => { hoveredPlayerForPath = null; updatePaths(); });

function initBoard() {
  boardEl.innerHTML = '';
  boardEl.appendChild(p1El);
  boardEl.appendChild(p2El);
  boardEl.appendChild(previewEl);

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.gridRow = `${r * 2 + 1}`;
      cell.style.gridColumn = `${c * 2 + 1}`;
      cell.addEventListener('click', () => onCellClick(r, c));
      boardEl.appendChild(cell);
      cellEls[r][c] = cell;
    }
  }

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (hoveredIntersection && previewEl.style.opacity === '1') {
      isPreviewHorizontal = !isPreviewHorizontal;
      onIntersectionHover(hoveredIntersection.r, hoveredIntersection.c);
    }
  });

  boardEl.addEventListener('mousemove', (e) => {
    if (!isMyTurn()) return;
    
    const target = e.target as HTMLElement;
    if (target.classList.contains('cell') || target.classList.contains('player')) {
      if (hoveredIntersection) onIntersectionLeave();
      return;
    }

    const bestPos = inputController.getWallTarget(e.clientX, e.clientY);
    if (bestPos) {
      if (isPreviewHorizontal !== bestPos.isH || !hoveredIntersection || hoveredIntersection.r !== bestPos.r || hoveredIntersection.c !== bestPos.c) {
        isPreviewHorizontal = bestPos.isH;
        onIntersectionHover(bestPos.r, bestPos.c);
      }
    } else {
      if (hoveredIntersection) {
        onIntersectionLeave();
      }
    }
  });

  boardEl.addEventListener('mouseleave', () => {
    onIntersectionLeave();
  });

  boardEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('cell') || target.classList.contains('player')) return;
    
    if (hoveredIntersection && isMyTurn() && previewEl.style.opacity === '1') {
      onIntersectionClick(hoveredIntersection.r, hoveredIntersection.c);
    }
  });

  boardEl.addEventListener('touchstart', (e) => {
    if (!isMyTurn()) return;
    const touch = e.touches[0];
    if (!touch) return;

    const target = inputController.getWallTarget(touch.clientX, touch.clientY);
    if (!target) return;

    e.preventDefault();
    isPreviewHorizontal = target.isH;
    onIntersectionHover(target.r, target.c);
    touchRotateBtn.style.display = 'flex';
  }, { passive: false });

  boardEl.addEventListener('touchend', (e) => {
    if (!hoveredIntersection || !isMyTurn() || previewEl.style.opacity !== '1') return;
    e.preventDefault();
    onIntersectionClick(hoveredIntersection.r, hoveredIntersection.c);
  }, { passive: false });
}

function startTimer() {
  if (!proSettings.fisherClock) return;
  timerController.start();
}


function playTickWarning(playerId: number) {
  audio.playTickSound();
  const el = playerId === 1 ? p1TimeEl : p2TimeEl;
  el.classList.add('time-warning');
  setTimeout(() => el.classList.remove('time-warning'), WARNING_FLASH_MS);
}

function declareWinner(playerId: number, reason: string = '') {
  game.winner = playerId === 1 ? game.p1 : game.p2;
  victoryTitle.innerText = `Player ${playerId} Wins! ${reason}`;
  victoryTitle.style.color = playerId === 1 ? 'var(--p1-color)' : 'var(--p2-color)';
  victoryModal.classList.add('show');

  // Trigger Confetti
  const end = Date.now() + CONFETTI_DURATION_MS;
  const colors = playerId === 1 ? ['#60a5fa', '#1d4ed8', '#ffffff'] : ['#f87171', '#b91c1c', '#ffffff'];

  (function frame() {
    confetti({
      particleCount: CONFETTI_PARTICLES,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: colors
    });
    confetti({
      particleCount: CONFETTI_PARTICLES,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: colors
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  }());
}

function updateUI() {
  p1El.style.top = `${game.p1.pos.r * CELL_STEP + PLAYER_OFFSET}px`;
  p1El.style.left = `${game.p1.pos.c * CELL_STEP + PLAYER_OFFSET}px`;
  p2El.style.top = `${game.p2.pos.r * CELL_STEP + PLAYER_OFFSET}px`;
  p2El.style.left = `${game.p2.pos.c * CELL_STEP + PLAYER_OFFSET}px`;

  p1WallsEl.innerText = game.p1.wallsLeft.toString();
  p2WallsEl.innerText = game.p2.wallsLeft.toString();

  if (game.currentPlayer.id === 1) {
    p1StatusEl.classList.add('active');
    p2StatusEl.classList.remove('active');
  } else {
    p2StatusEl.classList.add('active');
    p1StatusEl.classList.remove('active');
  }

  const lastAction = game.history[game.history.length - 1];
  const isNewWall = (r: number, c: number, isH: boolean) => {
    return lastAction && lastAction.type === 'wall' && lastAction.r === r && lastAction.c === c && lastAction.isH === isH;
  };

  wallRenderer.updateWalls(game.horizontalWalls, game.verticalWalls, isNewWall);

  // --- Juicy Game Feel ---
  if (lastAction && lastAction.type === 'wall') {
    boardEl.classList.remove('shake');
    void boardEl.offsetWidth; // trigger reflow
    boardEl.classList.add('shake');
  } else {
    boardEl.classList.remove('shake');
  }

  const p1Dist = game.getShortestPath(game.p1.pos, game.p1.goalRow);
  const p2Dist = game.getShortestPath(game.p2.pos, game.p2.goalRow);
  if ((p1Dist >= 0 && p1Dist <= 2) || (p2Dist >= 0 && p2Dist <= 2)) {
    boardEl.classList.add('match-point-warning');
  } else {
    boardEl.classList.remove('match-point-warning');
  }
  // -----------------------

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      cellEls[r][c].className = 'cell';
    }
  }

  timerController.syncTurn(proSettings.fisherClock, game.history.length);
  timerController.clearWarningClasses();

  if (proSettings.evalBar) {
    const score = QuoridorAI.getAdvantageScore(game);
    evalFill.style.width = `${score}%`;
  }

  if (!game.winner && isMyTurn()) {
    const validMoves = game.getValidMoves(game.currentPlayer);
    const playerClass = game.currentPlayer.id === 1 ? 'valid-move-p1' : 'valid-move-p2';
    validMoves.forEach(m => {
      cellEls[m.r][m.c].classList.add('valid-move', playerClass);
    });
  }

  // Update history
  historyListEl.innerHTML = '';
  for (let i = 0; i < game.history.length; i += 2) {
    const act1 = game.history[i];
    const act2 = game.history[i + 1];
    const turnNum = Math.floor(i / 2) + 1;
    
    const li = document.createElement('li');
    li.className = 'history-row';
    
    const spanNum = document.createElement('span');
    spanNum.className = 'turn-num';
    spanNum.innerText = `${turnNum}.`;
    
    const spanP1 = document.createElement('span');
    spanP1.className = 'p1-move';
    spanP1.innerText = act1.player === 1 ? notationFor(act1) : '';

    const spanP2 = document.createElement('span');
    spanP2.className = 'p2-move';
    
    // Handle edge case where first move might be from P2 somehow (undo/load), though usually P1 goes first.
    // If act1 is P1, act2 is P2.
    if (act1.player === 2) {
      spanP1.innerText = '...';
      spanP2.innerText = notationFor(act1);
      i--; // Adjust offset so next is act2
    } else {
      spanP2.innerText = act2 ? notationFor(act2) : '';
    }
    
    li.appendChild(spanNum);
    li.appendChild(spanP1);
    li.appendChild(spanP2);
    historyListEl.appendChild(li);
  }
  
  if (historyListEl.lastElementChild) {
    historyListEl.lastElementChild.scrollIntoView();
  }

  if (game.winner && victoryModal.className.indexOf('show') === -1) {
    declareWinner(game.winner.id);
  }

  saveGame();
}

function saveGame() {
  saveGameState({
    version: 1,
    mode,
    aiDifficulty,
    history: game.history
  });
}

function loadGame(): boolean {
  try {
    const state = loadGameState();
    if (!state) return false;
    
    mode = state.mode || 'local';
    aiDifficulty = state.aiDifficulty || 'normal';
    
    if (mode === 'ai') {
      btnAi.classList.add('active');
      btnLocal.classList.remove('active');
      aiDifficultyContainer.style.display = 'block';
    } else {
      btnLocal.classList.add('active');
      btnAi.classList.remove('active');
      aiDifficultyContainer.style.display = 'none';
    }
    diffBtns.forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.level === aiDifficulty));

    game = new QuoridorGame();
    for (const act of state.history) {
      if (act.type === 'move') {
        const p = act.player === 1 ? game.p1 : game.p2;
        game.movePlayer(p, act.newPos.r, act.newPos.c);
      } else {
        game.placeWall(act.isH, act.r, act.c);
      }
    }
    
    timerController.syncToCurrentPlayer();
    updateUI();
    startTimer();
    return true;
  } catch (e) {
    console.error('Failed to load save', e);
    return false;
  }
}

function isMyTurn() {
  if (game.winner) return false;
  if (mode === 'ai' && game.currentPlayer.id === aiPlayerId) return false;
  if (mode === 'network' && game.currentPlayer.id !== myNetworkId) return false;
  return true;
}

function triggerAI() {
  if (mode !== 'ai' || game.winner) return;
  if (game.currentPlayer.id === aiPlayerId) {
    document.body.classList.add('thinking');
    setTimeout(async () => {
      const best = await getBestMoveAsync(game, aiDifficulty);
      if (best) {
        if (best.type === 'move') {
          game.movePlayer(game.currentPlayer, best.r, best.c);
          audio.playMoveSound();
        } else {
          game.placeWall(best.isH, best.r, best.c);
          audio.playWallSound();
          const boardContainer = boardEl.parentElement;
          if (boardContainer) {
            boardContainer.classList.add('shake');
            setTimeout(() => boardContainer.classList.remove('shake'), SHAKE_MS);
          }
        }
        updateUI();
      }
      document.body.classList.remove('thinking');
    }, AI_THINKING_DELAY_MS);
  }
}

function onCellClick(r: number, c: number) {
  if (!isMyTurn()) return;
  const p = game.currentPlayer;
  if (game.movePlayer(p, r, c)) {
    audio.playMoveSound();

    if (mode === 'network') net.send({ type: 'move', r, c });
    updateUI();
    if (mode === 'ai') triggerAI();
  }
}

function onIntersectionHover(r: number, c: number) {
  hoveredIntersection = { r, c };
  if (!isMyTurn()) return;
  previewEl.style.opacity = '1';

  const activeHint = document.getElementById('active-hint-wall');
  hintController.setPreviewConflict(
    activeHint?.dataset.r === r.toString() &&
    activeHint.dataset.c === c.toString() &&
    activeHint.dataset.isH === isPreviewHorizontal.toString()
  );

  wallRenderer.renderPreview(isPreviewHorizontal, r, c, game.currentPlayer.id);
  if (game.canPlaceWall(isPreviewHorizontal, r, c)) {
    previewEl.classList.remove('invalid');
  } else {
    previewEl.classList.add('invalid');
  }
  
  updatePaths();
}

function onIntersectionLeave() {
  hoveredIntersection = null;
  previewEl.style.opacity = '0';
  previewEl.classList.remove('invalid');

  hintController.setPreviewConflict(false);
  
  updatePaths();
}

function onIntersectionClick(r: number, c: number) {
  if (!isMyTurn()) return;
  
  if (game.placeWall(isPreviewHorizontal, r, c)) {
    previewEl.style.opacity = '0';
    hintController.clearAfterWallPlacement(true);
    audio.playWallSound();

    const boardContainer = boardEl.parentElement;
    if (boardContainer) {
      boardContainer.classList.add('shake');
      setTimeout(() => boardContainer.classList.remove('shake'), SHAKE_MS);
    }

    if (mode === 'network') net.send({ type: 'wall', isH: isPreviewHorizontal, r, c });
    updateUI();
    if (mode === 'ai') triggerAI();
  }
}

// Network callbacks
net.onConnected = () => {
  if (roomInfo) roomInfo.innerText = "✅ Connected!";
  resetGame('network');
};

net.onAction = (action: NetAction) => {
  if (!applyRemoteActionSafely(game, action, mode, myNetworkId)) return;

  if (action.type === 'move') {
    audio.playMoveSound();
  } else {
    audio.playWallSound();
  }
  updateUI();
};

btnLocal.addEventListener('click', () => {
  resetGame('local');
  btnLocal.classList.add('active');
  btnAi.classList.remove('active');
  aiDifficultyContainer.style.display = 'none';
});

btnAi.addEventListener('click', () => {
  resetGame('ai');
  btnAi.classList.add('active');
  btnLocal.classList.remove('active');
  aiDifficultyContainer.style.display = 'block';
});

diffBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    diffBtns.forEach(b => b.classList.remove('active'));
    const target = e.target as HTMLElement;
    target.classList.add('active');
    aiDifficulty = target.dataset.level as Difficulty;
  });
});

let lastSfxVol = parseFloat(sliderSfxVol.value) || 1.0;

btnToggleSfx.addEventListener('click', () => {
  const isEnabled = !audio.sfxEnabled;
  if (isEnabled) {
    audio.toggleSFX(true);
    if (lastSfxVol === 0) lastSfxVol = 1.0;
    sliderSfxVol.value = lastSfxVol.toString();
    audio.setSFXVolume(lastSfxVol);
    btnToggleSfx.classList.add('active');
    btnToggleSfx.innerText = '🔊 音效: 开启';
    btnToggleSfx.style.opacity = '1';
  } else {
    audio.toggleSFX(false);
    if (parseFloat(sliderSfxVol.value) > 0) {
      lastSfxVol = parseFloat(sliderSfxVol.value);
    }
    sliderSfxVol.value = '0';
    audio.setSFXVolume(0);
    btnToggleSfx.classList.remove('active');
    btnToggleSfx.innerText = '🔇 音效: 关闭';
    btnToggleSfx.style.opacity = '0.7';
  }
});

sliderSfxVol.addEventListener('input', (e) => {
  const vol = parseFloat((e.target as HTMLInputElement).value);
  if (vol > 0) lastSfxVol = vol;
  audio.setSFXVolume(vol);

  if (vol > 0 && !audio.sfxEnabled) {
    audio.toggleSFX(true);
    btnToggleSfx.classList.add('active');
    btnToggleSfx.innerText = '🔊 音效: 开启';
    btnToggleSfx.style.opacity = '1';
  } else if (vol === 0 && audio.sfxEnabled) {
    audio.toggleSFX(false);
    btnToggleSfx.classList.remove('active');
    btnToggleSfx.innerText = '🔇 音效: 关闭';
    btnToggleSfx.style.opacity = '0.7';
  }
});

btnUndo.addEventListener('click', () => {
  if (undoForMode(game, mode, aiPlayerId)) {
    updateUI();
  }
});

// Modal events
btnRestart.addEventListener('click', () => {
  victoryModal.classList.remove('show');
  resetGame(mode);
});

btnHelp.addEventListener('click', () => {
  helpModal.classList.add('show');
});

btnCloseHelp.addEventListener('click', () => {
  helpModal.classList.remove('show');
});

helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) btnCloseHelp.click();
});

btnSettings.addEventListener('click', () => {
  settingsModal.classList.add('show');
});

btnCloseSettings.addEventListener('click', () => {
  proSettings.evalBar = chkEvalBar.checked;
  proSettings.fisherClock = chkFisherClock.checked;

  proSettings.hint = chkHint.checked;

  localStorage.setItem('setting-eval-bar', proSettings.evalBar.toString());
  localStorage.setItem('setting-fisher-clock', proSettings.fisherClock.toString());

  localStorage.setItem('setting-hint', proSettings.hint.toString());

  settingsModal.classList.remove('show');
  applySettings();
  updateUI();
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) btnCloseSettings.click();
});

btnHint.addEventListener('click', async () => {
  if (game.winner || !isMyTurn()) return;

  btnHint.innerText = '💡 AI 正在思考...';
  btnHint.disabled = true;

  await new Promise(r => setTimeout(r, HINT_DELAY_MS));
  const bestAction = await getBestMoveAsync(game, 'normal');

  btnHint.innerText = '💡 获取提示 (AI 支招)';
  btnHint.disabled = false;

  if (bestAction) {
    if (bestAction.type === 'move') {
      hintController.showMove(bestAction, cellEls, HINT_VISIBLE_MS);
    } else {
      hintController.show(bestAction);
      setTimeout(() => hintController.clear(), HINT_VISIBLE_MS);
    }
  }
});



function resetGame(newMode: Mode) {
  mode = newMode;
  game = new QuoridorGame();
  timerController.reset(newMode, proSettings.fisherClock);
  updateUI();
  startTimer();
}

// Keydown Hotkeys
document.addEventListener('keydown', (e) => {
  if (game.winner) return;
  if (!isMyTurn()) return;

  // Undo (Z)
  if (e.key.toLowerCase() === 'z') {
    btnUndo.click();
    return;
  }
  
  // Restart (R)
  if (e.key.toLowerCase() === 'r') {
    btnRestart.click();
    return;
  }

  // Toggle wall preview (Space)
  if (e.code === 'Space') {
    if (hoveredIntersection) {
      e.preventDefault(); // Prevent scrolling
      isPreviewHorizontal = !isPreviewHorizontal;
      onIntersectionHover(hoveredIntersection.r, hoveredIntersection.c);
    }
    return;
  }

  // Arrow keys for movement
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault(); // Prevent scrolling
    const validMoves = game.getValidMoves(game.currentPlayer);
    const pos = game.currentPlayer.pos;
    let target = null;

    if (e.key === 'ArrowUp') target = validMoves.find(m => m.r < pos.r);
    else if (e.key === 'ArrowDown') target = validMoves.find(m => m.r > pos.r);
    else if (e.key === 'ArrowLeft') target = validMoves.find(m => m.c < pos.c);
    else if (e.key === 'ArrowRight') target = validMoves.find(m => m.c > pos.c);

    if (target) {
      onCellClick(target.r, target.c);
    }
  }
});

// Init
initBoard();
if (!loadGame()) {
  resetGame('local');
}
