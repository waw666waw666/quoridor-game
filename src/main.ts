import './style.css';
import {
  BOARD_SIZE,
  FISHER_INCREMENT,
  FISHER_SECONDS,
  LAST_CELL,
  TURN_SECONDS,
  WALL_GRID_SIZE,
} from './constants';
import { QuoridorGame } from './game';
import { audio } from './audio';
import { net, type NetAction } from './network';
import { QuoridorAI } from './ai';
import { notationFor } from './notation';
import { loadGameState, saveGameState } from './persistence';
import { WallRenderer } from './wallRenderer';

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
const TICK_WARNING_SECONDS = 5;
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
let p1TimeLeft = TURN_SECONDS;
let p2TimeLeft = TURN_SECONDS;
let lastPlayerId = 1;
let timerInterval: ReturnType<typeof setInterval> | null = null;

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
const btnToggleBgm = getEl<HTMLButtonElement>('btn-toggle-bgm');
const btnToggleSfx = getEl<HTMLButtonElement>('btn-toggle-sfx');
const sliderBgmVol = getEl<HTMLInputElement>('slider-bgm-vol');
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

export const proSettings = {
  evalBar: localStorage.getItem('setting-eval-bar') === 'true',
  fisherClock: localStorage.getItem('setting-fisher-clock') === 'true',

  hint: localStorage.getItem('setting-hint') === 'true'
};

function applySettings() {
  evalBarContainer.style.display = proSettings.evalBar ? 'block' : 'none';
  btnHint.style.display = proSettings.hint ? 'block' : 'none';

  const p1TimeContainer = p1TimeEl.parentElement!;
  const p2TimeContainer = p2TimeEl.parentElement!;
  if (proSettings.fisherClock) {
    p1TimeContainer.style.display = 'flex';
    p2TimeContainer.style.display = 'flex';
    if (!timerInterval && !game.winner) startTimer();
  } else {
    p1TimeContainer.style.display = 'none';
    p2TimeContainer.style.display = 'none';
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
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

const cellEls: HTMLDivElement[][] = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));

function initAudio() {
  // First interaction initializes audio context
  audio.init();
}

document.body.addEventListener('click', initAudio, { once: true });

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
    if (!isMyTurn() || document.getElementById('active-hint-wall')) return;
    
    const target = e.target as HTMLElement;
    if (target.classList.contains('cell') || target.classList.contains('player')) {
      if (hoveredIntersection) onIntersectionLeave();
      return;
    }

    const rect = boardEl.getBoundingClientRect();
    const scaleX = BOARD_POINTER_SIZE / rect.width;
    const scaleY = BOARD_POINTER_SIZE / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    let minDist = Infinity;
    let bestPos: {r: number, c: number, isH: boolean} | null = null;

    for (let r = 0; r < WALL_GRID_SIZE; r++) {
      for (let c = 0; c < WALL_GRID_SIZE; c++) {
        const cxH = c * 64 + WALL_CENTER_OFFSET;
        const cyH = r * 64 + WALL_CENTER_OFFSET;
        const dxH = Math.max(0, Math.abs(x - cxH) - WALL_CENTER_OFFSET);
        const dyH = Math.abs(y - cyH);
        const distH = Math.sqrt(dxH*dxH + dyH*dyH);
        
        if (distH < minDist) {
          minDist = distH;
          bestPos = { r, c, isH: true };
        }

        const cxV = c * 64 + WALL_CENTER_OFFSET;
        const cyV = r * 64 + WALL_CENTER_OFFSET;
        const dxV = Math.abs(x - cxV);
        const dyV = Math.max(0, Math.abs(y - cyV) - WALL_CENTER_OFFSET);
        const distV = Math.sqrt(dxV*dxV + dyV*dyV);

        if (distV < minDist) {
          minDist = distV;
          bestPos = { r, c, isH: false };
        }
      }
    }

    if (minDist < WALL_HIT_RADIUS && bestPos) {
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
}

function startTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (!proSettings.fisherClock) return;

  timerInterval = setInterval(() => {
    if (game.winner) {
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      return;
    }
    if (game.currentPlayer.id === 1) {
      p1TimeLeft--;
      if (p1TimeLeft <= 0) declareWinner(2, '超时判负 (Timeout)');
      else if (p1TimeLeft <= TICK_WARNING_SECONDS) playTickWarning(1);
    } else {
      p2TimeLeft--;
      if (p2TimeLeft <= 0) declareWinner(1, '超时判负 (Timeout)');
      else if (p2TimeLeft <= TICK_WARNING_SECONDS) playTickWarning(2);
    }
    updateTimeUI();
  }, 1000);
}

function playTickWarning(playerId: number) {
  audio.playTickSound();
  const el = playerId === 1 ? p1TimeEl : p2TimeEl;
  el.classList.add('time-warning');
  setTimeout(() => el.classList.remove('time-warning'), WARNING_FLASH_MS);
}

function formatTime(secs: number) {
  if (secs <= 0) return "00:00";
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateTimeUI() {
  p1TimeEl.innerText = formatTime(p1TimeLeft);
  p2TimeEl.innerText = formatTime(p2TimeLeft);
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

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      cellEls[r][c].className = 'cell';
    }
  }

  // Timer logic for Fisher Clock
  if (game.currentPlayer.id !== lastPlayerId) {
    if (proSettings.fisherClock) {
      if (lastPlayerId === 1) p1TimeLeft += FISHER_INCREMENT;
      else p2TimeLeft += FISHER_INCREMENT;
    } else {
      if (game.currentPlayer.id === 1) p1TimeLeft = TURN_SECONDS;
      else p2TimeLeft = TURN_SECONDS;
    }
    lastPlayerId = game.currentPlayer.id;
  } else if (!proSettings.fisherClock && game.history.length === 0) {
    p1TimeLeft = TURN_SECONDS;
    p2TimeLeft = TURN_SECONDS;
  }
  updateTimeUI();
  p1TimeEl.classList.remove('time-warning');
  p2TimeEl.classList.remove('time-warning');

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
    
    lastPlayerId = game.currentPlayer.id;
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
    setTimeout(() => {
      const best = QuoridorAI.getBestMove(game, aiDifficulty);
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
  if (activeHint) {
    if (activeHint.dataset.r === r.toString() && activeHint.dataset.c === c.toString() && activeHint.dataset.isH === isPreviewHorizontal.toString()) {
      activeHint.style.opacity = '0';
    } else {
      activeHint.style.opacity = '1';
    }
  }

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

  const activeHint = document.getElementById('active-hint-wall');
  if (activeHint) activeHint.style.opacity = '1';
  
  updatePaths();
}

function onIntersectionClick(r: number, c: number) {
  if (!isMyTurn()) return;
  
  if (game.placeWall(isPreviewHorizontal, r, c)) {
    previewEl.style.opacity = '0';
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
  if (action.type === 'move') {
    game.movePlayer(game.currentPlayer, action.r, action.c);
    audio.playMoveSound();
  } else {
    game.placeWall(action.isH, action.r, action.c);
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

let lastBgmVol = parseFloat(sliderBgmVol.value) || 0.5;
let lastSfxVol = parseFloat(sliderSfxVol.value) || 1.0;

btnToggleBgm.addEventListener('click', () => {
  const isEnabled = !audio.bgmEnabled;
  if (isEnabled) {
    audio.toggleBGM(true);
    if (lastBgmVol === 0) lastBgmVol = 0.5;
    sliderBgmVol.value = lastBgmVol.toString();
    audio.setBGMVolume(lastBgmVol);
    btnToggleBgm.classList.add('active');
    btnToggleBgm.innerText = '🎵 开启背景音乐';
    btnToggleBgm.style.opacity = '1';
  } else {
    audio.toggleBGM(false);
    if (parseFloat(sliderBgmVol.value) > 0) {
      lastBgmVol = parseFloat(sliderBgmVol.value);
    }
    sliderBgmVol.value = '0';
    audio.setBGMVolume(0);
    btnToggleBgm.classList.remove('active');
    btnToggleBgm.innerText = '🎵 背景音乐: 关闭';
    btnToggleBgm.style.opacity = '0.7';
  }
});

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

sliderBgmVol.addEventListener('input', (e) => {
  const vol = parseFloat((e.target as HTMLInputElement).value);
  if (vol > 0) lastBgmVol = vol;
  audio.setBGMVolume(vol);

  if (vol > 0 && !audio.bgmEnabled) {
    audio.toggleBGM(true);
    btnToggleBgm.classList.add('active');
    btnToggleBgm.innerText = '🎵 开启背景音乐';
    btnToggleBgm.style.opacity = '1';
  } else if (vol === 0 && audio.bgmEnabled) {
    audio.toggleBGM(false);
    btnToggleBgm.classList.remove('active');
    btnToggleBgm.innerText = '🎵 背景音乐: 关闭';
    btnToggleBgm.style.opacity = '0.7';
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
  if (mode === 'network') return; // Undo disabled in network
  if (game.undo()) {
    if (mode === 'ai') game.undo(); // Undo AI move as well
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
  const bestAction = QuoridorAI.getBestMove(game, 'normal');

  btnHint.innerText = '💡 获取提示 (AI 支招)';
  btnHint.disabled = false;

  if (bestAction) {
    if (bestAction.type === 'move') {
      const cell = cellEls[bestAction.r][bestAction.c];
      cell.classList.add('hint-dot');
      setTimeout(() => cell.classList.remove('hint-dot'), HINT_VISIBLE_MS);
    } else {
      const hintWall = document.createElement('div');
      hintWall.className = 'wall';
      hintWall.id = 'active-hint-wall';
      hintWall.dataset.r = bestAction.r.toString();
      hintWall.dataset.c = bestAction.c.toString();
      hintWall.dataset.isH = bestAction.isH.toString();
      hintWall.style.pointerEvents = 'none';
      hintWall.style.backgroundColor = 'rgba(0, 255, 0, 0.4)';
      hintWall.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.6)';
      hintWall.style.zIndex = WALL_GRID_SIZE.toString();
      if (bestAction.isH) {
        hintWall.style.gridRow = `${bestAction.r * 2 + 2}`;
        hintWall.style.gridColumn = `${bestAction.c * 2 + 1} / span 3`;
        hintWall.style.width = '100%';
        hintWall.style.height = '14px';
      } else {
        hintWall.style.gridRow = `${bestAction.r * 2 + 1} / span 3`;
        hintWall.style.gridColumn = `${bestAction.c * 2 + 2}`;
        hintWall.style.width = '14px';
        hintWall.style.height = '100%';
      }
      boardEl.appendChild(hintWall);
      setTimeout(() => hintWall.remove(), HINT_VISIBLE_MS);
    }
  }
});



function resetGame(newMode: Mode) {
  mode = newMode;
  game = new QuoridorGame();
  lastPlayerId = 1;
  if (proSettings.fisherClock) {
    p1TimeLeft = FISHER_SECONDS;
    p2TimeLeft = FISHER_SECONDS;
  } else {
    p1TimeLeft = TURN_SECONDS;
    p2TimeLeft = TURN_SECONDS;
  }
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
