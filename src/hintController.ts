import type { Position } from './game';

type HintAction =
  | { type: 'move'; r: number; c: number }
  | { type: 'wall'; isH: boolean; r: number; c: number };

export class HintController {
  private activeHint: HTMLElement | null = null;
  private readonly boardEl: HTMLElement;
  private readonly cellStep: number;

  constructor(
    boardEl: HTMLElement,
    cellStep: number
  ) {
    this.boardEl = boardEl;
    this.cellStep = cellStep;
  }

  public show(action: HintAction): void {
    this.clear();

    if (action.type === 'move') {
      return;
    }

    const hintWall = document.createElement('div');
    hintWall.className = 'wall';
    hintWall.id = 'active-hint-wall';
    hintWall.dataset.r = action.r.toString();
    hintWall.dataset.c = action.c.toString();
    hintWall.dataset.isH = action.isH.toString();
    hintWall.style.pointerEvents = 'none';
    hintWall.style.backgroundColor = 'rgba(0, 255, 0, 0.4)';
    hintWall.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.6)';
    hintWall.style.zIndex = '8';
    hintWall.dataset.cellStep = this.cellStep.toString();

    if (action.isH) {
      hintWall.style.gridRow = `${action.r * 2 + 2}`;
      hintWall.style.gridColumn = `${action.c * 2 + 1} / span 3`;
      hintWall.style.width = '100%';
      hintWall.style.height = '14px';
    } else {
      hintWall.style.gridRow = `${action.r * 2 + 1} / span 3`;
      hintWall.style.gridColumn = `${action.c * 2 + 2}`;
      hintWall.style.width = '14px';
      hintWall.style.height = '100%';
    }

    this.activeHint = hintWall;
    this.boardEl.appendChild(hintWall);
  }

  public showMove(pos: Position, cellEls: HTMLDivElement[][], visibleMs: number): void {
    const cell = cellEls[pos.r][pos.c];
    cell.classList.add('hint-dot');
    setTimeout(() => cell.classList.remove('hint-dot'), visibleMs);
  }

  public clear(): void {
    this.activeHint?.remove();
    this.activeHint = null;
  }

  public clearAfterWallPlacement(success: boolean): void {
    if (success) this.clear();
  }

  public setPreviewConflict(isConflict: boolean): void {
    if (!this.activeHint) return;
    this.activeHint.style.opacity = isConflict ? '0' : '1';
  }
}
