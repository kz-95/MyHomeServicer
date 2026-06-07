import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { loadStripe, Stripe, StripeElements, StripeCardElement } from '@stripe/stripe-js';
import { environment } from '../../environments/environment';

@Component({
    selector: 'app-stripe-card-form',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="stripe-card-form">
      <div #cardElement class="card-element-wrapper" [class.card-element--error]="!!cardError()"></div>

      @if (cardError()) {
        <p class="card-error">{{ cardError() }}</p>
      }

      <div class="card-form-actions">
        <button type="button" class="btn-ghost" (click)="cancel.emit()" [disabled]="processing()">
          Cancel
        </button>
        <button type="button" class="btn-primary" (click)="pay()" [disabled]="processing() || !canPay()">
          @if (processing()) {
            Processing…
          } @else {
            Pay RM {{ amount | number:'1.2-2' }}
          }
        </button>
      </div>
    </div>
  `,
    styles: [`
      .stripe-card-form {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        padding: 0.8rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
      }
      .card-element-wrapper {
        padding: 0.6rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-bg);
        transition: border-color 0.15s ease;
      }
      .card-element-wrapper.card-element--error {
        border-color: var(--color-danger);
      }
      .card-element-wrapper:focus-within {
        border-color: var(--color-primary);
      }
      .card-error {
        font-size: 0.82rem;
        color: var(--color-danger);
        margin: 0;
      }
      .card-form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
    `]
})
export class StripeCardFormComponent implements OnInit, OnDestroy {
  @Input() clientSecret!: string;
  @Input() amount!: number;
  @Input() loading = false;
  @Output() paymentSuccess = new EventEmitter<void>();
  @Output() paymentError = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  cardError = signal('');
  processing = signal(false);

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private card: StripeCardElement | null = null;

  canPay(): boolean {
    return !!this.clientSecret && this.amount > 0;
  }

  async ngOnInit(): Promise<void> {
    const key = environment.stripePublishableKey;
    if (!key) {
      this.cardError.set('Stripe is not configured. Please contact support.');
      return;
    }
    this.stripe = await loadStripe(key);
    if (!this.stripe) {
      this.cardError.set('Could not load Stripe.');
      return;
    }
    this.elements = this.stripe.elements();
    this.card = this.elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#424770',
          '::placeholder': { color: '#aab7c4' },
        },
        invalid: { color: '#dc2626' },
      },
    });
    this.card.mount('.card-element-wrapper');
    this.card.on('change', (event) => {
      if (event.error) {
        this.cardError.set(event.error.message ?? '');
      } else {
        this.cardError.set('');
      }
    });
  }

  ngOnDestroy(): void {
    this.card?.destroy();
  }

  async pay(): Promise<void> {
    if (!this.stripe || !this.card || !this.clientSecret) return;
    this.processing.set(true);
    this.cardError.set('');

    try {
      const { error, paymentIntent } = await this.stripe.confirmCardPayment(this.clientSecret, {
        payment_method: { card: this.card },
      });

      if (error) {
        this.cardError.set(error.message ?? 'Payment failed.');
        this.paymentError.emit(error.message ?? 'Payment failed.');
        this.processing.set(false);
      } else if (paymentIntent?.status === 'succeeded') {
        this.paymentSuccess.emit();
        this.processing.set(false);
      } else {
        this.cardError.set('Payment could not be completed.');
        this.paymentError.emit('Payment could not be completed.');
        this.processing.set(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      this.cardError.set(msg);
      this.paymentError.emit(msg);
      this.processing.set(false);
    }
  }
}
