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

  connect(): void {
    if (this.socket?.connected) return;
    this.socket = io(environment.socketUrl || '/', {
      path: '/socket.io',
      auth: { token: this.auth.accessToken ?? '' },
      transports: ['websocket'],
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
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
    (this.socket as Socket & { auth: Record<string, unknown> }).auth = { token: newToken };

    // Cycle the connection so the server receives the updated token.
    this.socket.disconnect();
    this.socket.connect();
  }

  /** Listen for a server event as an Observable stream. */
  on<T>(event: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      if (!this.socket) this.connect();
      if (event === 'connect' && this.socket?.connected) {
        subscriber.next(undefined as unknown as T);
      }
      const handler = (payload: T): void => subscriber.next(payload);
      this.socket?.on(event, handler);
      return () => this.socket?.off(event, handler);
    });
  }
}
