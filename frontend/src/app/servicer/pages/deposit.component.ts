import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { StripePaymentService } from '../../core/services/stripe-payment.service';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';

interface DepositBalance {
  totalDeposited: number;
  currentBalance: number;
  minimumRequired: number;
  creditBalance: number;
}

interface TopUpRequest {
  id: string;
  status: string;
  amount: number;
  message: string;
}

interface CreditLogEntry {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  referenceId?: string | null;
  note?: string | null;
  createdAt: string;
}

interface WithdrawalRequest {
  id: string;
  amount: number;
  bankName: string;
  bankAccount: string;
  status: string;
  createdAt: string;
}

interface VoucherInfo {
  voucherCode: string;
  label: string;
  discount: number;
  finalAmount: number;
}

@Component({
    selector: 'app-servicer-deposit',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, ListToolbarComponent],
    template: `
    <h1>Deposit & Credit</h1>

    <!-- Balance overview -->
    @if (balance(); as b) {
      <div class="balance-cards page-child">
        <div class="card balance-card deposit" [class.low]="b.currentBalance < b.minimumRequired">
          <span class="balance-label">Deposit</span>
          <span class="balance-amount">RM {{ b.currentBalance | number:'1.2-2' }}</span>
          <span class="balance-note">Minimum: RM {{ b.minimumRequired }} - locked security buffer</span>
        </div>
        <div class="card balance-card credit">
          <span class="balance-label">Credit</span>
          <span class="balance-amount">RM {{ b.creditBalance | number:'1.2-2' }}</span>
          <span class="balance-note">Withdrawable - top up with card</span>
        </div>
        <div class="card balance-card total">
          <span class="balance-label">Total</span>
          <span class="balance-amount">RM {{ (b.currentBalance + b.creditBalance) | number:'1.2-2' }}</span>
        </div>
      </div>
    } @else if (loadingBalance()) {
      <p class="muted">Loading balance…</p>
    } @else {
      <p class="load-err">Could not load balance. Please refresh the page.</p>
    }

    <!-- Transfer between accounts -->
    <section class="card page-child">
      <h3>Transfer between accounts</h3>
      <p class="muted small">Move money between your Deposit and Credit balances. Transfers require your PIN.</p>
      <div class="transfer-row">
        <label>
          From:
          <select [(ngModel)]="transferDirection" name="tdir">
            <option value="deposit_to_credit">Deposit → Credit</option>
            <option value="credit_to_deposit">Credit → Deposit</option>
          </select>
        </label>
        <label>
          Amount: RM
          <input type="number" [(ngModel)]="transferAmount" name="tamt" min="0.01" step="0.01" />
        </label>
        <label>
          PIN
          <input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" [(ngModel)]="transferPin" name="tpin" placeholder="••••••" />
        </label>
        <button class="btn-primary" (click)="doTransfer()" [disabled]="transferring()">
          {{ transferring() ? 'Transferring…' : 'Transfer' }}
        </button>
      </div>
      @if (transferDirection() === 'deposit_to_credit') {
        <p class="muted small">Max: RM {{ maxTransferable() | number:'1.2-2' }} (RM {{ balance()?.minimumRequired ?? 100 }} minimum must stay in deposit)</p>
      }
      @if (transferError()) {
        <p class="err">{{ transferError() }}</p>
      }
      @if (transferOk()) {
        <p class="success-msg">Transfer successful!</p>
      }
    </section>

    <!-- Top up credit (Stripe) -->
    <section class="card page-child">
      <h3>Top up credit</h3>
      <p class="muted small">Add withdrawable credit to your account instantly via card.</p>
      <div class="topup-row">
        <label>
          Amount: RM
          <input type="number" [(ngModel)]="topupAmount" name="tupamt" min="1" (blur)="loadVouchers()" (change)="loadVouchers()" />
        </label>
        <button class="btn-primary" (click)="doTopup()" [disabled]="topuping()">
          {{ topuping() ? 'Processing…' : 'Top up with card' }}
        </button>
      </div>
      @if (topupError()) {
        <p class="err">{{ topupError() }}</p>
      }
    </section>

    <!-- Voucher auto-apply -->
    @if (availableVouchers().length > 0) {
      <section class="card page-child">
        <h3>You have vouchers!</h3>
        @for (v of availableVouchers(); track v.voucherCode) {
          <div class="voucher-option">
            <label>
              <input type="radio" name="voucher" [value]="v.voucherCode" [(ngModel)]="selectedVoucherCode" />
              {{ v.label }} - Save RM {{ v.discount }}
            </label>
          </div>
        }
        <p class="muted small">Voucher applies to top-up amount. Final amount charged will be reduced.</p>
      </section>
    }

    <!-- Bank transfer top-up (existing) -->
    <section class="card page-child">
      <h3>Bank transfer top-up</h3>
      <p class="muted small">
        Make a bank transfer and submit the reference number to request a deposit top-up.
        Admin will credit your deposit after verifying the payment.
      </p>
      @if (submitted(); as result) {
        <div class="success-box">
          <p>
            <strong>Top-up request received!</strong> Your request for
            RM {{ result.amount | number:'1.2-2' }} is
            <span class="status-badge">{{ result.status }}</span>.
          </p>
          <p class="muted small">{{ result.message }}</p>
          <button class="btn-ghost" (click)="submitted.set(null)">Submit another</button>
        </div>
      } @else {
        <form class="form" (ngSubmit)="submitBankTransfer()">
          <label>
            Top-up amount (RM) <span class="req">*</span>
            <input type="number" min="1" step="0.01" placeholder="e.g. 200.00" [(ngModel)]="f.amount" name="bamt" />
          </label>
          <label>
            Payment reference <span class="req">*</span>
            <input type="text" placeholder="e.g. TXN-20260615-001" [(ngModel)]="f.paymentReference" name="bref" />
            <span class="muted small">Your bank transfer transaction ID or reference number.</span>
          </label>
          @if (formError()) {
            <p class="err">{{ formError() }}</p>
          }
          <div class="form-actions">
            <button type="submit" class="btn-primary" [disabled]="submitting()">
              {{ submitting() ? 'Submitting…' : 'Submit top-up request' }}
            </button>
          </div>
        </form>
      }
    </section>

    <!-- Withdrawal -->
    <section class="card page-child">
      <h3>Withdraw credit</h3>
      <p class="muted small">
        Request a withdrawal of your credit balance to your bank account.
        Withdrawals are reviewed by admin and processed within 1-3 business days.
      </p>
      @if (profile(); as p) {
        @if (p.bankName && p.bankAccount) {
          <p class="bank-info">
            Withdraw to: <strong>{{ p.bankName }}</strong> · {{ p.bankAccount }}
          </p>
        } @else {
          <p class="warn">No bank account set. <a routerLink="/servicer/account">Go to Account Settings</a></p>
        }
      }
      <div class="withdraw-row">
        <label>
          Amount: RM
          <input type="number" [(ngModel)]="withdrawAmount" name="wamt" min="0.01" step="0.01" />
        </label>
        <label>
          PIN
          <input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" [(ngModel)]="withdrawPin" name="wpin" placeholder="••••••" />
        </label>
        <button class="btn-primary" (click)="doWithdraw()" [disabled]="withdrawing()">
          {{ withdrawing() ? 'Requesting…' : 'Request withdrawal' }}
        </button>
      </div>
      @if (withdrawError()) {
        <p class="err">{{ withdrawError() }}</p>
      }
      @if (withdrawOk()) {
        <p class="success-msg">Withdrawal requested!</p>
      }
    </section>

    <!-- Transaction history -->
    <section class="card page-child">
      <h3>Transaction history</h3>
      <app-list-toolbar>
        <input class="search" [(ngModel)]="txSearch" name="txSearch" placeholder="Search type or note…" toolbar-search />
        <div class="chips" toolbar-filters>
          <button class="chip" [class.on]="txFilter() === 'all'" (click)="txFilter.set('all')">All</button>
          <button class="chip" [class.on]="txFilter() === 'topup'" (click)="txFilter.set('topup')">Top-up</button>
          <button class="chip" [class.on]="txFilter() === 'transfer'" (click)="txFilter.set('transfer')">Transfer</button>
          <button class="chip" [class.on]="txFilter() === 'penalty'" (click)="txFilter.set('penalty')">Penalty</button>
          <button class="chip" [class.on]="txFilter() === 'withdrawal'" (click)="txFilter.set('withdrawal')">Withdrawal</button>
        </div>
        <select [(ngModel)]="txSort" name="txSort" toolbar-sort>
          <option value="recent">Most recent</option>
          <option value="oldest">Oldest first</option>
          <option value="highest">Highest amount</option>
          <option value="lowest">Lowest amount</option>
        </select>
      </app-list-toolbar>
      @if (loadingLog()) {
        <p class="muted small">Loading…</p>
      } @else if (creditLog().length === 0) {
        <p class="muted small">No transactions yet.</p>
      } @else {
        <table class="tx-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Balance</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            @for (tx of displayLog(); track tx.id) {
              <tr>
                <td class="muted small">{{ tx.createdAt | date:'shortDate' }}</td>
                <td>{{ formatTxType(tx.type) }}</td>
                <td [class.credit]="tx.amount > 0" [class.debit]="tx.amount < 0">
                  RM {{ tx.amount | number:'1.2-2' }}
                </td>
                <td>RM {{ tx.balanceAfter | number:'1.2-2' }}</td>
                <td class="muted small">{{ tx.note ?? ' - ' }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
    styles: [
        `
      :host { display: block; }
      section { margin-bottom: 1.4rem; }
      h3 { margin-top: 0; font-size: 1.05rem; }

      .balance-cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 1rem;
        margin-bottom: 1.4rem;
      }
      .balance-card {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .balance-card:hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
      }
      .balance-card.low { border-color: var(--color-danger); }
      .balance-label { font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-muted); }
      .balance-amount { font-size: 1.5rem; font-weight: 700; color: var(--color-primary); }
      .balance-card.low .balance-amount { color: var(--color-danger); }
      .balance-note { font-size: 0.75rem; color: var(--color-muted); }
      .balance-card.total .balance-amount { color: var(--color-accent); }

      .transfer-row, .topup-row, .withdraw-row {
        display: flex;
        align-items: flex-end;
        gap: 0.8rem;
        flex-wrap: wrap;
        margin-bottom: 0.5rem;
      }
      .transfer-row label, .topup-row label, .withdraw-row label {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.85rem;
        font-weight: 500;
      }
      .transfer-row select, .transfer-row input, .topup-row input, .withdraw-row input {
        width: 120px;
      }
      .transfer-row input[type=password] { width: 80px; }

      .bank-info {
        padding: 0.5rem 0.7rem;
        background: var(--color-bg);
        border-radius: var(--radius);
        font-size: 0.88rem;
        margin-bottom: 0.6rem;
      }
      .warn { color: var(--color-warning); font-size: 0.85rem; }
      .warn a { color: var(--color-primary); }

      .load-err { color: var(--color-danger); margin-bottom: 1rem; }
      .err { color: var(--color-danger); font-size: 0.85rem; }
      .success-msg { color: var(--color-success); font-size: 0.85rem; font-weight: 500; }
      .small { font-size: 0.82rem; }

      .form { display: flex; flex-direction: column; gap: 0.8rem; max-width: 420px; }
      label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; font-weight: 500; }
      .req { color: var(--color-danger); }
      .form-actions { margin-top: 0.4rem; }

      .success-box {
        border: 1px solid var(--color-success);
        border-radius: var(--radius);
        padding: 1rem 1.2rem;
        background: var(--color-status-completed-bg);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: 480px;
      }
      .success-box p { margin: 0; font-size: 0.92rem; line-height: 1.5; }
      .status-badge {
        font-size: 0.8rem;
        background: var(--color-status-completed-bg);
        color: var(--color-status-completed-text);
        padding: 0.1rem 0.5rem;
        border-radius: 999px;
        font-weight: 600;
        text-transform: capitalize;
      }

      .tx-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .tx-table th, .tx-table td { text-align: left; padding: 0.5rem 0.4rem; border-bottom: 1px solid var(--color-border); }
      .tx-table th { font-weight: 600; color: var(--color-muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }
      .tx-table .credit { color: var(--color-success); font-weight: 600; }
      .tx-table .debit { color: var(--color-danger); font-weight: 600; }
      .voucher-option {
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--color-border);
      }
      .voucher-option:last-of-type { border-bottom: none; }
      .voucher-option label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
        cursor: pointer;
      }
      .voucher-option input { width: auto; }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--color-border);
        margin-bottom: 1rem;
      }
      .search {
        min-width: 180px;
        max-width: 260px;
        border-radius: 999px;
        padding: 0.45rem 0.85rem;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text);
        font-size: 0.88rem;
        outline: none;
        height: 2rem;
        box-sizing: border-box;
        vertical-align: middle;
      }
      .search:focus { border-color: var(--color-primary); }
      select {
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
        color: var(--color-text);
        padding: 0.4rem 0.6rem;
        font-size: 0.85rem;
        outline: none;
        cursor: pointer;
        vertical-align: middle;
        height: 2rem;
        box-sizing: border-box;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .chip {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.25rem 0.75rem;
        font-size: 0.82rem;
        cursor: pointer;
        color: var(--color-muted);
        transition: background var(--transition), color var(--transition), border-color var(--transition);
      }
      .chip.on {
        background: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
      }
    `,
    ]
})
export class ServicerDepositComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private stripePayment = inject(StripePaymentService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  balance = signal<DepositBalance | null>(null);
  loadingBalance = signal(true);

  // Transfer
  transferDirection = signal<'deposit_to_credit' | 'credit_to_deposit'>('deposit_to_credit');
  transferAmount = signal<number | null>(null);
  transferPin = signal('');
  transferring = signal(false);
  transferError = signal('');
  transferOk = signal(false);

  maxTransferable = computed(() => {
    const b = this.balance();
    if (!b) return 0;
    if (this.transferDirection() === 'deposit_to_credit') {
      return Math.max(0, b.currentBalance - b.minimumRequired);
    }
    return b.creditBalance;
  });

  // Top-up
  topupAmount = signal<number | null>(null);
  topuping = signal(false);
  topupError = signal('');

  // Voucher auto-apply
  availableVouchers = signal<VoucherInfo[]>([]);
  selectedVoucherCode = signal<string | null>(null);

  // Bank transfer (existing)
  submitted = signal<TopUpRequest | null>(null);
  submitting = signal(false);
  formError = signal('');
  f = { amount: null as number | null, paymentReference: '' };

  // Withdrawal
  withdrawAmount = signal<number | null>(null);
  withdrawPin = signal('');
  withdrawing = signal(false);
  withdrawError = signal('');
  withdrawOk = signal(false);

  // Transaction history
  creditLog = signal<CreditLogEntry[]>([]);
  txSearch = signal('');
  txFilter = signal<'all' | 'topup' | 'transfer' | 'penalty' | 'withdrawal'>('all');
  txSort = signal<'recent' | 'oldest' | 'highest' | 'lowest'>('recent');
  displayLog = computed(() => {
    let list = this.creditLog();
    const q = this.txSearch().toLowerCase().trim();
    if (q) {
      list = list.filter((tx) => tx.type.toLowerCase().includes(q) || (tx.note ?? '').toLowerCase().includes(q));
    }
    const f = this.txFilter();
    if (f !== 'all') {
      list = list.filter((tx) => tx.type === f);
    }
    const s = this.txSort();
    if (s === 'recent') {
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (s === 'oldest') {
      list = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (s === 'highest') {
      list = [...list].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    } else if (s === 'lowest') {
      list = [...list].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
    }
    return list;
  });
  loadingLog = signal(true);

  // Profile (for bank info)
  profile = signal<{ bankName?: string | null; bankAccount?: string | null } | null>(null);

  ngOnInit(): void {
    this.loadBalance();
    this.loadCreditLog();
    this.loadProfile();
    this.loadVouchers();

    this.route.queryParams.pipe(finalize(() => {
      this.router.navigate([], {
        queryParams: { topup: undefined, session_id: undefined },
        replaceUrl: true,
      });
    })).subscribe(params => {
      if (params['topup'] === 'success' && params['session_id']) {
        this.api.post<{ balance: number }>('/stripe/verify-topup', { sessionId: params['session_id'] }).subscribe({
          next: (r) => {
            this.toast.success('Top-up successful!');
            this.loadBalance();
          },
          error: () => {
            this.toast.success('Top-up successful! Your credit has been updated.');
            this.loadBalance();
          },
        });
      } else if (params['topup'] === 'success') {
        this.toast.success('Top-up successful! Your credit has been updated.');
        this.loadBalance();
      }
    });
  }

  private loadBalance(): void {
    this.loadingBalance.set(true);
    this.api.get<DepositBalance>('/servicer/me/deposit').subscribe({
      next: (r) => { this.balance.set({ ...r, totalDeposited: Number(r.totalDeposited), currentBalance: Number(r.currentBalance), minimumRequired: Number(r.minimumRequired), creditBalance: Number(r.creditBalance) }); this.loadingBalance.set(false); },
      error: () => this.loadingBalance.set(false),
    });
  }

  private loadProfile(): void {
    this.api.get<{ bankName?: string | null; bankAccount?: string | null }>('/servicer/me').subscribe({
      next: (p) => this.profile.set(p),
      error: () => {},
    });
  }

  loadVouchers(): void {
    const amt = this.topupAmount() ?? 100;
    this.api.get<{ data: VoucherInfo[] }>('/rewards/active-vouchers', { topupAmount: amt }).subscribe({
      next: (r) => this.availableVouchers.set(r.data ?? []),
      error: () => {},
    });
  }

  private loadCreditLog(): void {
    this.loadingLog.set(true);
    this.api.get<{ data: CreditLogEntry[] }>('/servicer/me/credit-log').subscribe({
      next: (r) => { this.creditLog.set(r.data ?? []); this.loadingLog.set(false); },
      error: () => this.loadingLog.set(false),
    });
  }

  // ── Transfer ──
  doTransfer(): void {
    const amount = this.transferAmount();
    const pin = this.transferPin();
    if (!amount || amount <= 0) { this.transferError.set('Enter a valid amount.'); return; }
    if (!pin || pin.length !== 6) { this.transferError.set('Enter your 6-digit PIN.'); return; }

    this.transferError.set('');
    this.transferOk.set(false);
    this.transferring.set(true);

    this.api.post<{ depositBalance: number; creditBalance: number }>(
      '/servicer/me/transfer',
      { direction: this.transferDirection(), amount, pin },
    ).subscribe({
      next: (r) => {
        this.transferring.set(false);
        this.transferOk.set(true);
        this.transferAmount.set(null);
        this.transferPin.set('');
        this.balance.update((b) => b ? { ...b, currentBalance: Number(r.depositBalance), creditBalance: Number(r.creditBalance) } : b);
        this.loadCreditLog();
      },
      error: (e) => {
        this.transferring.set(false);
        this.transferError.set(e.message ?? 'Transfer failed.');
      },
    });
  }

  // ── Top-up (Stripe) ──
  doTopup(): void {
    const amount = this.topupAmount();
    if (!amount || amount < 1) { this.topupError.set('Enter a valid amount (min RM 1).'); return; }
    this.topupError.set('');
    this.topuping.set(true);

    const body: Record<string, unknown> = { amount };
    if (this.selectedVoucherCode()) {
      body['voucherCode'] = this.selectedVoucherCode();
    }

    this.api.post<{ url: string | null; sessionId: string | null }>('/servicer/me/topup', body).subscribe({
      next: (r) => {
        this.topuping.set(false);
        if (r.url && r.sessionId) {
          this.stripePayment.openPayment({
            url: r.url,
            sessionId: r.sessionId,
            onSuccess: () => {
              this.toast.success('Top-up successful!');
              this.loadBalance();
              this.loadCreditLog();
            },
          });
        } else {
          this.toast.success('Credit topped up!');
          this.topupAmount.set(null);
          this.loadBalance();
          this.loadCreditLog();
        }
      },
      error: (e) => {
        this.topuping.set(false);
        this.topupError.set(e.message ?? 'Top-up failed.');
      },
    });
  }

  // ── Bank transfer (existing) ──
  submitBankTransfer(): void {
    if (!this.f.amount || this.f.amount <= 0) {
      this.formError.set('Please enter a valid top-up amount.');
      return;
    }
    if (!this.f.paymentReference.trim()) {
      this.formError.set('Please enter your payment reference number.');
      return;
    }
    this.submitting.set(true);
    this.formError.set('');
    this.api.post<TopUpRequest>('/servicer/me/deposit', {
      amount: this.f.amount,
      paymentReference: this.f.paymentReference.trim(),
    }).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.submitted.set(res);
        this.f = { amount: null, paymentReference: '' };
        this.loadBalance();
      },
      error: (e) => {
        this.submitting.set(false);
        this.formError.set(e.message ?? 'Could not submit request.');
      },
    });
  }

  // ── Withdrawal ──
  doWithdraw(): void {
    const amount = this.withdrawAmount();
    const pin = this.withdrawPin();
    if (!amount || amount <= 0) { this.withdrawError.set('Enter a valid amount.'); return; }
    if (!pin || pin.length !== 6) { this.withdrawError.set('Enter your 6-digit PIN.'); return; }
    const p = this.profile();
    if (!p?.bankName || !p?.bankAccount) { this.withdrawError.set('Set your bank account in Account Settings first.'); return; }

    this.withdrawError.set('');
    this.withdrawOk.set(false);
    this.withdrawing.set(true);

    this.api.post('/servicer/me/withdrawal', {
      amount,
      bankName: p.bankName,
      bankAccount: p.bankAccount,
      pin,
    }).subscribe({
      next: () => {
        this.withdrawing.set(false);
        this.withdrawOk.set(true);
        this.withdrawAmount.set(null);
        this.withdrawPin.set('');
        this.loadCreditLog();
      },
      error: (e) => {
        this.withdrawing.set(false);
        this.withdrawError.set(e.message ?? 'Withdrawal request failed.');
      },
    });
  }

  formatTxType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
