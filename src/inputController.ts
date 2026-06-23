export type WallTarget = { r: number; c: number; isH: boolean };

export class InputController {
  private readonly boardEl: HTMLElement;
  private readonly boardPointerSize: number;
  private readonly wallCenterOffset: number;
  private readonly wallHitRadius: number;
  private readonly wallGridSize: number;

  constructor(
    boardEl: HTMLElement,
    boardPointerSize: number,
    wallCenterOffset: number,
    wallHitRadius: number,
    wallGridSize: number
  ) {
    this.boardEl = boardEl;
    this.boardPointerSize = boardPointerSize;
    this.wallCenterOffset = wallCenterOffset;
    this.wallHitRadius = wallHitRadius;
    this.wallGridSize = wallGridSize;
  }

  public getWallTarget(clientX: number, clientY: number): WallTarget | null {
    const rect = this.boardEl.getBoundingClientRect();
    const scaleX = this.boardPointerSize / rect.width;
    const scaleY = this.boardPointerSize / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    let minDist = Infinity;
    let bestPos: WallTarget | null = null;

    for (let r = 0; r < this.wallGridSize; r++) {
      for (let c = 0; c < this.wallGridSize; c++) {
        const cxH = c * 64 + this.wallCenterOffset;
        const cyH = r * 64 + this.wallCenterOffset;
        const dxH = Math.max(0, Math.abs(x - cxH) - this.wallCenterOffset);
        const dyH = Math.abs(y - cyH);
        const distH = Math.sqrt(dxH * dxH + dyH * dyH);

        if (distH < minDist) {
          minDist = distH;
          bestPos = { r, c, isH: true };
        }

        const cxV = c * 64 + this.wallCenterOffset;
        const cyV = r * 64 + this.wallCenterOffset;
        const dxV = Math.abs(x - cxV);
        const dyV = Math.max(0, Math.abs(y - cyV) - this.wallCenterOffset);
        const distV = Math.sqrt(dxV * dxV + dyV * dyV);

        if (distV < minDist) {
          minDist = distV;
          bestPos = { r, c, isH: false };
        }
      }
    }

    if (minDist >= this.wallHitRadius) return null;
    return bestPos;
  }
}
