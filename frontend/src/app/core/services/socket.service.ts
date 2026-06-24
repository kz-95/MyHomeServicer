import { Injectable, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/**
 * Socket.io client service. Authenticates the handshake with the JWT access
 * token. Components subscribe to server events via `on()`.
 *
 * JWT refresh flow: when the HTTP interceptor silently refreshes the access
 * token it calls `updateToken()` so the socket reconnects with the new
 * credential. Without this the existing socket connection would remain open
 * with the old (now-rotated) token and the server would reject the next
 * connection attempt after a disconnect.
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private auth = inject(AuthService);
  private socket: Socket | null = null;
  /** The token the live socket handshook with — used to detect account switches. */
  private connectedToken: string | null = null;

  connect(): void {
    const token = this.auth.accessToken ?? '';

    // First connection — build the socket with the current credential.
    if (!this.socket) {
      this.connectedToken = token;
      this.socket = io(environment.socketUrl || '/', {
        path: '/socket.io',
        auth: { token },
        transports: ['websocket'],
      });
      // Expose socket for E2E test harness (dev mode only)
      if (!environment.production) {
        (window as any).__SOCKET__ = this.socket;
      }
      return;
    }

    // Account switched (token changed) — re-handshake on the SAME socket so
    // existing on() listeners stay registered, but the server drops us from the
    // previous user's room and joins the new one. Without this the singleton
    // socket keeps delivering the previous account's notifications (leak).
    if (this.connectedToken !== token) {
      this.connectedToken = token;
      (this.socket as Socket & { auth: Record<string, unknown> }).auth = { token };
      this.socket.disconnect();
      this.socket.connect();
      // Expose socket for E2E test harness (dev mode only)
      if (!environment.production) {
        (window as any).__SOCKET__ = this.socket;
      }
      return;
    }

    // Same account, socket idle (e.g. dropped) — just reconnect.
    if (!this.socket.connected) this.socket.connect();
  }

  disconnect(): void {
    this.socket?.disconnect();
    if (!environment.production) {
      (window as any).__SOCKET__ = null;
    }
    this.socket = null;
    this.connectedToken = null;
  }

  /**
   * Called by the auth interceptor after a silent token refresh completes.
   * Updates the socket's auth credential and forces a reconnect so the
   * server handshake uses the new access token.
   *
   * Socket.io's recommended pattern for credential rotation:
   *   socket.auth = { token: newToken };
   *   socket.disconnect().connect();
   */
  updateToken(): void {
    const newToken = this.auth.accessToken ?? '';
    if (!this.socket) return; // socket never connected - nothing to update

    // Update the auth object Socket.io uses on the next connect handshake.
    this.connectedToken = newToken;
    (this.socket as Socket & { auth: Record<string, unknown> }).auth = { token: newToken };

    // Cycle the connection so the server receives the updated token.
    this.socket.disconnect();
    this.socket.connect();
  }

  /** Listen for a server event as an Observable stream. */
  on<T>(event: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      // Reconcile every subscribe: builds the socket on first use and
      // re-handshakes if the account changed since the last connect.
      this.connect();
      if (event === 'connect' && this.socket?.connected) {
        subscriber.next(undefined as unknown as T);
      }
      const handler = (payload: T): void => subscriber.next(payload);
      this.socket?.on(event, handler);
      return () => this.socket?.off(event, handler);
    });
  }
}
