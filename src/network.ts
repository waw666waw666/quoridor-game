import Peer, { type DataConnection } from 'peerjs';
import { isCellCoord, isWallCoord } from './constants';

export type NetAction = { type: 'move', r: number, c: number } | { type: 'wall', isH: boolean, r: number, c: number };

export function isNetAction(data: unknown): data is NetAction {
  if (typeof data !== 'object' || data === null) return false;
  const action = data as Record<string, unknown>;

  if (action.type === 'move') {
    return typeof action.r === 'number' && typeof action.c === 'number' &&
      isCellCoord(action.r) && isCellCoord(action.c);
  }

  if (action.type === 'wall') {
    return typeof action.isH === 'boolean' &&
      typeof action.r === 'number' && typeof action.c === 'number' &&
      isWallCoord(action.r) && isWallCoord(action.c);
  }

  return false;
}

export class NetworkSystem {
  public peer: Peer | null = null;
  public conn: DataConnection | null = null;
  public isHost = false;
  public isNetworked = false;
  
  public onAction: ((action: NetAction) => void) | null = null;
  public onConnected: (() => void) | null = null;
  public onError: ((err: string) => void) | null = null;

  public host(onReady: (id: string) => void) {
    this.peer = new Peer();
    this.peer.on('open', (id) => {
      this.isHost = true;
      this.isNetworked = true;
      onReady(id);
    });

    this.peer.on('connection', (c) => {
      this.conn = c;
      this.setupConn();
      if (this.onConnected) this.onConnected();
    });

    this.peer.on('error', (e) => {
      if (this.onError) this.onError(e.message);
    });
  }

  public join(hostId: string) {
    this.peer = new Peer();
    this.peer.on('open', () => {
      this.isHost = false;
      this.isNetworked = true;
      this.conn = this.peer!.connect(hostId);
      this.setupConn();
      this.conn.on('open', () => {
        if (this.onConnected) this.onConnected();
      });
    });

    this.peer.on('error', (e) => {
      if (this.onError) this.onError(e.message);
    });
  }

  private setupConn() {
    if (!this.conn) return;
    this.conn.on('data', (data: unknown) => {
      if (this.onAction && isNetAction(data)) this.onAction(data);
    });
  }

  public send(action: NetAction) {
    if (this.conn && this.conn.open) {
      this.conn.send(action);
    }
  }
}

export const net = new NetworkSystem();
