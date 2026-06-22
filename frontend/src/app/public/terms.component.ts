import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="terms-scroll-wrap">
    <div class="terms-page">
      <div class="terms-card card">
        <h1 class="terms-heading">Terms &amp; Conditions</h1>
        <p class="terms-updated muted">Last updated: June 2026</p>

        <section class="terms-section">
          <h2>1. Platform Role</h2>
          <p>HomeServices connects customers with independent servicers. We do not employ servicers directly. Our role is to facilitate booking, payment, and dispute resolution between customers and servicers. Servicers are independent contractors responsible for the quality and completion of their work.</p>
        </section>

        <section class="terms-section">
          <h2>2. Quotes &amp; Pricing</h2>
          <p>Quotes provided through the platform are estimates based on the information you supply. The budget range you select represents the maximum amount you are willing to spend. We hold your budget ceiling to secure the booking. The servicer's final proposal constitutes the actual price for the job. Any difference between the held amount and the final accepted price will be refunded to you automatically.</p>
        </section>

        <section class="terms-section">
          <h2>3. Holds &amp; Refunds</h2>
          <p>When you choose Pay Now, the full budget ceiling is held from your payment method upfront before a servicer accepts. The refundable portion - the difference between the hold and the servicer's final accepted price - is returned automatically when the booking is confirmed. The following fees are non-refundable once incurred: travel fees charged by the servicer, and inspection fees once an inspection has been completed.</p>
        </section>

        <section class="terms-section">
          <h2>4. Payments</h2>
          <p>Card payments are processed securely via Stripe. Wallet payments use your prepaid credit balance held on the platform. Cash payments are settled directly between you and the servicer after the job is completed. All currency amounts are in Malaysian Ringgit (RM).</p>
        </section>

        <section class="terms-section">
          <h2>5. Cancellations</h2>
          <p>Customers may cancel a booking request before a servicer accepts it at no charge. Servicers who do not show up for a confirmed booking are subject to a penalty deduction of RM 50. Once a job has been marked as done by the servicer, cancellation is no longer available - please use the dispute resolution process instead.</p>
        </section>

        <section class="terms-section">
          <h2>6. Data &amp; Privacy</h2>
          <p>Your contact details are shared with the matched servicer only after a booking has been confirmed. Payment data is handled by Stripe and is subject to their PCI-DSS compliant policies - we do not store raw card numbers. Chat messages exchanged through the platform are stored for the purpose of dispute resolution.</p>
        </section>

        <section class="terms-section">
          <h2>7. Disputes</h2>
          <p>If you have a dispute regarding a completed job, please contact our support team within 7 days of the job completion date. We will review all available evidence including chat logs, job photos, and payment records. Our decision following the review is final and binding on both parties.</p>
        </section>

        <section class="terms-section">
          <h2>8. Amendments</h2>
          <p>We reserve the right to update these Terms &amp; Conditions at any time. We will provide at least 14 days notice before changes take effect. Continued use of the platform after the notice period constitutes acceptance of the updated terms.</p>
        </section>
      </div>
    </div>
    </div>
  `,
  styles: [`
    .terms-scroll-wrap {
      height: 100vh;
      overflow-y: auto;
    }
    .terms-scroll-wrap::-webkit-scrollbar {
      width: 8px;
    }
    .terms-scroll-wrap::-webkit-scrollbar-thumb {
      background: var(--color-border, #ccc);
      border-radius: 4px;
    }
    .terms-page {
      max-width: 960px;
      margin: 0 auto;
      padding: 2.5rem 1rem 3rem;
    }
    .terms-card {
      padding: 2.5rem 2rem;
      background: var(--color-surface);
      color: var(--color-text);
    }
    .terms-heading {
      font-size: 1.75rem;
      margin: 0 0 0.25rem;
    }
    .terms-updated {
      font-size: 0.85rem;
      margin: 0 0 2rem;
    }
    .terms-section {
      margin-bottom: 1.75rem;
    }
    .terms-section h2 {
      font-size: 1.05rem;
      font-weight: 600;
      margin: 0 0 0.5rem;
      color: var(--color-text);
    }
    .terms-section p {
      font-size: 0.95rem;
      line-height: 1.7;
      margin: 0;
      color: var(--color-text);
    }
    @media (max-width: 560px) {
      .terms-page {
        padding: 1rem 0.75rem 2rem;
      }
      .terms-card {
        padding: 1.25rem 0.75rem;
      }
      .terms-heading {
        font-size: 1.2rem;
      }
      .terms-updated {
        margin-bottom: 1.25rem;
      }
      .terms-section {
        margin-bottom: 1rem;
      }
      .terms-section p {
        font-size: 0.88rem;
        line-height: 1.55;
      }
    }
  `],
})
export class TermsComponent {}
