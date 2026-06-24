import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { routeFor } from '../../core/route-for';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-setup-wizard',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="setup-wizard">
      <h1>Admin Setup</h1>
      <p>Step {{ step() }} of 3</p>

      @if (step() === 1) {
        <div class="step">
          <h2>Backup Email</h2>
          <p>This email will receive recovery codes if you forget your password.</p>
          <input type="email" [(ngModel)]="backupEmail" placeholder="your-backup@email.com" />
          <input type="email" [(ngModel)]="confirmEmail" placeholder="Confirm backup email" />
          <button (click)="next1()" [disabled]="!backupEmail || backupEmail !== confirmEmail">Next</button>
        </div>
      }

      @if (step() === 2) {
        <div class="step">
          <h2>Action PIN</h2>
          <p>This PIN is required for sensitive admin operations.</p>
          <input type="password" [(ngModel)]="pin" placeholder="6-digit PIN" maxlength="6" inputmode="numeric" pattern="[0-9]*" />
          <input type="password" [(ngModel)]="confirmPin" placeholder="Confirm PIN" maxlength="6" />
          <button (click)="next2()" [disabled]="!pin || pin.length !== 6 || pin !== confirmPin">Next</button>
        </div>
      }

      @if (step() === 3) {
        <div class="step">
          <h2>Change Password</h2>
          <p>Must be at least 8 characters and contain a number.</p>
          <input type="password" [(ngModel)]="newPassword" placeholder="New password" />
          <input type="password" [(ngModel)]="confirmPassword" placeholder="Confirm password" />
          <button (click)="next3()" [disabled]="!newPassword || newPassword.length < 8 || newPassword !== confirmPassword">Complete Setup</button>
        </div>
      }

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </div>
  `,
  styles: [`
    .setup-wizard { max-width: 480px; margin: 4rem auto; padding: 2rem; }
    .step { display: flex; flex-direction: column; gap: 1rem; }
    input { padding: 0.75rem; border: 1px solid var(--color-border, #ccc); border-radius: 8px; }
    button { padding: 0.75rem; background: var(--color-primary, #c95a3c); color: #fff; border: none; border-radius: 8px; cursor: pointer; }
    button:disabled { opacity: 0.5; }
    .error { color: #e53e3e; }
    .note { font-size: 0.85rem; color: var(--color-muted, #666); }
  `],
})
export class SetupWizardComponent {
  protected step = signal(1);
  protected error = signal('');

  protected backupEmail = '';
  protected confirmEmail = '';
  protected pin = '';
  protected confirmPin = '';
  protected newPassword = '';
  protected confirmPassword = '';

  constructor(private http: HttpClient, private auth: AuthService, private router: Router) {}

  private setError(msg: string): void {
    this.error.set(msg);
  }

  next1(): void {
    this.setError('');
    this.http.patch('/api/v1/admin/me/backup-email', { email: this.backupEmail }).subscribe({
      next: () => this.step.set(2),
      error: (e) => this.setError(e.error?.message || 'Failed to save backup email'),
    });
  }

  next2(): void {
    this.setError('');
    this.http.patch('/api/v1/admin/me/pin', { oldPin: '1234', newPin: this.pin }).subscribe({
      next: () => this.step.set(3),
      error: (e) => this.setError(e.error?.message || 'Failed to update PIN'),
    });
  }

  next3(): void {
    this.setError('');
    this.http.patch('/api/v1/admin/me/password', { oldPassword: 'Demo@2026', newPassword: this.newPassword }).subscribe({
      next: () => {
        this.auth.refresh().subscribe({
          next: () => this.router.navigate([routeFor('admin')]),
          error: () => {
            this.auth.logout();
            this.router.navigate([routeFor('login')]);
          },
        });
      },
      error: (e) => this.setError(e.error?.message || 'Failed to update password'),
    });
  }
}
