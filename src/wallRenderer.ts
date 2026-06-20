export class WallRenderer {
  private readonly walls = new Map<string, HTMLElement>();
  private readonly boardEl: HTMLElement;
  private readonly previewEl: HTMLElement;
  private readonly cellStep: number;
  private readonly wallOffset: number;

  constructor(
    boardEl: HTMLElement,
    previewEl: HTMLElement,
    cellStep: number,
    wallOffset: number
  ) {
    this.boardEl = boardEl;
    this.previewEl = previewEl;
    this.cellStep = cellStep;
    this.wallOffset = wallOffset;
  }

  public updateWalls(
    horizontalWalls: number[][],
    verticalWalls: number[][],
    isNewWall: (r: number, c: number, isH: boolean) => boolean
  ): void {
    const activeKeys = new Set<string>();

    for (let r = 0; r < horizontalWalls.length; r++) {
      for (let c = 0; c < horizontalWalls[r].length; c++) {
        if (horizontalWalls[r][c] !== 0) {
          this.updateWall(true, r, c, horizontalWalls[r][c], isNewWall(r, c, true), activeKeys);
        }
        if (verticalWalls[r][c] !== 0) {
          this.updateWall(false, r, c, verticalWalls[r][c], isNewWall(r, c, false), activeKeys);
        }
      }
    }

    this.pruneRemovedWalls(activeKeys);
  }

  public renderPreview(isH: boolean, r: number, c: number, ownerId: number): void {
    this.previewEl.className = `wall wall-preview ${isH ? 'h' : 'v'}`;
    if (ownerId === 1) this.previewEl.classList.add('owner-1');
    if (ownerId === 2) this.previewEl.classList.add('owner-2');
    this.positionWall(this.previewEl, isH, r, c);
  }

  private updateWall(
    isH: boolean,
    r: number,
    c: number,
    ownerId: number,
    isNew: boolean,
    activeKeys: Set<string>
  ): void {
    const key = this.wallKey(isH, r, c);
    activeKeys.add(key);

    let wall = this.walls.get(key);
    if (!wall) {
      wall = document.createElement('div');
      this.boardEl.appendChild(wall);
      this.walls.set(key, wall);
    }

    wall.className = `wall ${isH ? 'h' : 'v'}`;
    if (isNew) wall.classList.add('new-drop');
    if (ownerId === 1) wall.classList.add('owner-1');
    if (ownerId === 2) wall.classList.add('owner-2');
    this.positionWall(wall, isH, r, c);
  }

  private pruneRemovedWalls(activeKeys: Set<string>): void {
    for (const [key, wall] of this.walls) {
      if (!activeKeys.has(key)) {
        wall.remove();
        this.walls.delete(key);
      }
    }
  }

  private positionWall(wall: HTMLElement, isH: boolean, r: number, c: number): void {
    if (isH) {
      wall.style.top = `${r * this.cellStep + this.wallOffset}px`;
      wall.style.left = `${c * this.cellStep}px`;
    } else {
      wall.style.top = `${r * this.cellStep}px`;
      wall.style.left = `${c * this.cellStep + this.wallOffset}px`;
    }
  }

  private wallKey(isH: boolean, r: number, c: number): string {
    return `${isH ? 'H' : 'V'}-${r}-${c}`;
  }
}
