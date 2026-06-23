import { FISHER_INCREMENT, FISHER_SECONDS, TURN_SECONDS } from './constants';

export type TimerMode = 'local' | 'ai' | 'network';

export class TimerController {
  private p1TimeLeft = TURN_SECONDS;
  private p2TimeLeft = TURN_SECONDS;
  private lastPlayerId = 1;
  private interval: ReturnType<typeof setInterval> | null = null;
  private timeoutCallback: ((winnerId: number) => void) | null = null;
  private readonly p1TimeEl: HTMLElement;
  private readonly p2TimeEl: HTMLElement;
  private readonly getCurrentPlayerId: () => number;
  private readonly isGameOver: () => boolean;
  private readonly playWarning: (playerId: number) => void;

  constructor(
    p1TimeEl: HTMLElement,
    p2TimeEl: HTMLElement,
    getCurrentPlayerId: () => number,
    isGameOver: () => boolean = () => false,
    playWarning: (playerId: number) => void = () => {}
  ) {
    this.p1TimeEl = p1TimeEl;
    this.p2TimeEl = p2TimeEl;
    this.getCurrentPlayerId = getCurrentPlayerId;
    this.isGameOver = isGameOver;
    this.playWarning = playWarning;
  }

  public onTimeout(callback: (winnerId: number) => void): void {
    this.timeoutCallback = callback;
  }

  public start(): void {
    this.stop();

    this.interval = setInterval(() => {
      if (this.isGameOver()) {
        this.stop();
        return;
      }

      const currentPlayerId = this.getCurrentPlayerId();
      if (currentPlayerId === 1) {
        this.p1TimeLeft--;
        if (this.p1TimeLeft <= 0) this.timeoutCallback?.(2);
        else if (this.p1TimeLeft <= 5) this.playWarning(1);
      } else {
        this.p2TimeLeft--;
        if (this.p2TimeLeft <= 0) this.timeoutCallback?.(1);
        else if (this.p2TimeLeft <= 5) this.playWarning(2);
      }

      this.updateUI();
    }, 1000);
  }

  public stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  public reset(_mode: TimerMode, fisherClock: boolean): void {
    this.stop();
    this.lastPlayerId = 1;
    this.p1TimeLeft = fisherClock ? FISHER_SECONDS : TURN_SECONDS;
    this.p2TimeLeft = fisherClock ? FISHER_SECONDS : TURN_SECONDS;
    this.updateUI();
  }

  public syncTurn(fisherClock: boolean, historyLength: number): void {
    const currentPlayerId = this.getCurrentPlayerId();
    if (currentPlayerId !== this.lastPlayerId) {
      if (fisherClock) {
        if (this.lastPlayerId === 1) this.p1TimeLeft += FISHER_INCREMENT;
        else this.p2TimeLeft += FISHER_INCREMENT;
      } else if (currentPlayerId === 1) {
        this.p1TimeLeft = TURN_SECONDS;
      } else {
        this.p2TimeLeft = TURN_SECONDS;
      }
      this.lastPlayerId = currentPlayerId;
    } else if (!fisherClock && historyLength === 0) {
      this.p1TimeLeft = TURN_SECONDS;
      this.p2TimeLeft = TURN_SECONDS;
    }
    this.updateUI();
  }

  public syncToCurrentPlayer(): void {
    this.lastPlayerId = this.getCurrentPlayerId();
    this.updateUI();
  }

  public clearWarningClasses(): void {
    this.p1TimeEl.classList.remove('time-warning');
    this.p2TimeEl.classList.remove('time-warning');
  }

  private updateUI(): void {
    this.p1TimeEl.innerText = this.formatTime(this.p1TimeLeft);
    this.p2TimeEl.innerText = this.formatTime(this.p2TimeLeft);
  }

  private formatTime(secs: number): string {
    if (secs <= 0) return '00:00';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
}
