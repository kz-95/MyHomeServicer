import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { ModalComponent } from '../../shared/modal.component';
import { PinService } from '../../core/services/pin.service';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';

interface RewardConfig {
  pointsPerRm: number;
  pointsPerReview: number;
  pointsPerReferral: number;
  welcomePoints: number;
  redemptionRate: number;
}

interface LoyaltyTier {
  id: string;
  name: string;
  minPoints: number;
  bonusPercent: number;
  badgeColor: string | null;
  sortOrder: number;
  active: boolean;
}

interface RewardItem {
  id: string;
  name: string;
  description: string | null;
  pointCost: number;
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
  minTopup: number | null;
  active: boolean;
  sortOrder: number;
}

interface RedemptionLogEntry {
  id: string;
  user: { email: string; name?: string | null };
  reward: { name: string };
  voucherCode: string;
  status: string;
  createdAt: string;
}

interface NumSetting {
  key: string;
  label: string;
  hint: string;
  prop: string;
}

const SERVICER_SETTINGS: NumSetting[] = [
  { key: 'minimum_servicer_charge', label: 'Minimum servicer charge', hint: 'Smallest total a servicer may charge.', prop: 'amount' },
  { key: 'servicer_deposit_minimum', label: 'Deposit minimum', hint: 'Minimum deposit to take jobs.', prop: 'amount' },
  { key: 'servicer_credit_withdrawal_minimum', label: 'Withdrawal minimum', hint: 'Smallest withdrawal.', prop: 'amount' },
  { key: 'servicer_proposal_preset_limit', label: 'Proposal preset limit', hint: 'Max saved presets.', prop: 'limit' },
  { key: 'no_show_consecutive_threshold', label: 'No-show consecutive', hint: 'Consecutive no-shows before flagged.', prop: 'count' },
  { key: 'no_show_weekly_threshold', label: 'No-show weekly', hint: 'Weekly no-shows before flagged.', prop: 'count' },
  { key: 'noshow_grace_minutes', label: 'No-show grace period', hint: 'Minutes late before no-show.', prop: 'minutes' },
  { key: 'dispatch_prompt_timeout_seconds', label: 'Dispatch timeout', hint: 'Seconds each servicer has to accept before rotation.', prop: 'seconds' },
];

const PLATFORM_SETTINGS: NumSetting[] = [
  { key: 'quote_buffer_minutes', label: 'Quote buffer', hint: 'Min between servicer and customer deadline.', prop: 'minutes' },
  { key: 'sst_rate', label: 'SST rate', hint: 'Malaysian SST rate.', prop: 'rate' },
  { key: 'registered_customer_discount', label: 'Registered customer discount', hint: 'Discount for registered customers.', prop: 'rate' },
];

/** Pass-through fee baselines - travel and supplies (same rule, distinct settings). */
const FEE_BASELINE_SETTINGS: NumSetting[] = [
  { key: 'travel_fee_baseline_overall', label: 'Travel fee baseline (overall)', hint: 'Platform-wide floor for servicer travel fee (RM). Effective = max(category, overall). Baseline portion → 0% platform commission; extra above baseline is platform-%\'d.', prop: 'amount' },
  { key: 'supplies_fee_baseline_overall', label: 'Cleaning supplies fee baseline (overall)', hint: 'Platform-wide floor for cleaning supplies pass-through fee (RM). Same split rule as travel: baseline 0% / extra %\'d.', prop: 'amount' },
];

type FinancialTab = 'pricing' | 'rewards' | 'servicer_rules';

@Component({
    selector: 'app-admin-money-settings',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, ModalComponent, ListToolbarComponent],
    template: `
    <h1>Financial Settings</h1>

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (loadFailed()) {
      <p class="err">Could not load settings. Refresh and try again.</p>
    } @else {

      <!-- ════════ Tab Bar ════════ -->
      <div class="tabs">
        <button class="tab" [class.active]="tab() === 'pricing'" (click)="tab.set('pricing')">Pricing</button>
        <button class="tab" [class.active]="tab() === 'rewards'" (click)="tab.set('rewards')">Rewards</button>
        <button class="tab" [class.active]="tab() === 'servicer_rules'" (click)="tab.set('servicer_rules')">Servicer Rules</button>
      </div>

      <!-- ═══════════════════════ PRICING TAB ═══════════════════════ -->
      @if (tab() === 'pricing') {

        <app-list-toolbar>
          <div class="chips" toolbar-filters>
            <button class="chip" [class.on]="cardFilter() === 'all'" (click)="cardFilter.set('all')">All</button>
            @for (id of pricingCards; track id) {
              <button class="chip" [class.on]="cardFilter() === id" (click)="cardFilter.set(id)">{{ cardLabel(id) }}</button>
            }
          </div>
        </app-list-toolbar>

        @if (showCard('platform_fee')) {
        <section class="card page-child">
          <h2>Platform Fee</h2>
          <p class="muted">Total commission rate on completed pay-now bookings.</p>
          <div class="fee-row">
            <label>
              Platform fee rate (%)
              <input type="number" min="0" step="0.5" [(ngModel)]="feeRatePct" name="feerate" />
            </label>
            <button class="btn-primary" (click)="saveFeeRate()" [disabled]="savingKey() === 'platform_fee_rate'">
              {{ savingKey() === 'platform_fee_rate' ? 'Saving…' : 'Save rate' }}
            </button>
            @if (msg(); as m) { @if (m.key === 'platform_fee_rate') { <p [class.err]="m.error" class="row-msg">{{ m.text }}</p> } }
          </div>

          <h3>Fee breakdown (shown to servicers)</h3>
          <p class="muted small">Percentages of the total fee. Must sum to the platform fee rate.</p>
          @for (item of feeBreakdown; track item.key; let i = $index) {
            <div class="breakdown-row">
              <span>{{ item.label }}</span>
              <input type="number" min="0" step="0.5" [(ngModel)]="feeBreakdownValues[i]" [name]="'fb' + i" />
              <span>%</span>
            </div>
          }
          <div class="breakdown-total">
            <span>Total: {{ breakdownTotal() }}%</span>
            @if (breakdownTotal() !== (feeRatePct ?? 0)) {
              <span class="err small">Does not match platform fee rate!</span>
            }
          </div>
          <div class="actions">
            <button class="btn-primary" (click)="saveFeeBreakdown()" [disabled]="savingFeeBreakdown()">
              {{ savingFeeBreakdown() ? 'Saving…' : 'Save breakdown' }}
            </button>
          </div>
        </section>
        }

        @if (showCard('fee_baselines')) {
        <section class="card page-child">
          <h2>Pass-Through Fee Baselines</h2>
          <p class="muted small">
            Travel fee and cleaning supplies fee are pass-through fees: the baseline portion goes
            100% to the servicer (0% platform commission). The extra above the effective baseline
            is subject to the normal platform fee rate.
            Effective baseline = max(per-category baseline, overall baseline here).
          </p>
          @for (s of feeBaselineSettings; track s.key) {
            <div class="set-row">
              <div class="set-info">
                <strong>{{ s.label }}</strong>
                <span class="muted">{{ s.hint }}</span>
              </div>
              <div class="set-edit">
                <span class="set-prefix">RM</span>
                <input type="number" min="0" step="0.50" [(ngModel)]="numModel[s.key]" [name]="s.key" />
                <button class="btn-primary" (click)="saveNum(s)" [disabled]="savingKey() === s.key">
                  {{ savingKey() === s.key ? '…' : 'Save' }}
                </button>
              </div>
              @if (msg(); as m) { @if (m.key === s.key) { <span [class.err]="m.error" class="row-msg">{{ m.text }}</span> } }
            </div>
          }
        </section>
        }

        @if (showCard('timing_tax')) {
        <section class="card page-child">
          <h2>Timing & Tax</h2>
          @for (s of platformSettings; track s.key) {
            <div class="set-row">
              <div class="set-info">
                <strong>{{ s.label }}</strong>
                <span class="muted">{{ s.hint }}</span>
              </div>
              <div class="set-edit">
                <input type="number" min="0" [(ngModel)]="numModel[s.key]" [name]="s.key" />
                <button class="btn-primary" (click)="saveNum(s)" [disabled]="savingKey() === s.key">
                  {{ savingKey() === s.key ? '…' : 'Save' }}
                </button>
              </div>
              @if (msg(); as m) { @if (m.key === s.key) { <span [class.err]="m.error" class="row-msg">{{ m.text }}</span> } }
            </div>
            }
        </section>
        }
      }

      <!-- ═══════════════════════ REWARDS TAB ═══════════════════════ -->
      @if (tab() === 'rewards') {

        <app-list-toolbar>
          <div class="chips" toolbar-filters>
            <button class="chip" [class.on]="cardFilter() === 'all'" (click)="cardFilter.set('all')">All</button>
            @for (id of rewardsCards; track id) {
              <button class="chip" [class.on]="cardFilter() === id" (click)="cardFilter.set(id)">{{ cardLabel(id) }}</button>
            }
          </div>
        </app-list-toolbar>

        @if (showCard('rewards_config')) {
        <section class="card page-child">
          <h2>Rewards Program</h2>
          <div class="rewards-config">
            <label>Points per RM 1 spent<input type="number" min="0" [(ngModel)]="rewardsConfig.pointsPerRm" name="pprm" /></label>
            <label>Points per review<input type="number" min="0" [(ngModel)]="rewardsConfig.pointsPerReview" name="pprev" /></label>
            <label>Points per referral<input type="number" min="0" [(ngModel)]="rewardsConfig.pointsPerReferral" name="ppref" /></label>
            <label>Welcome points<input type="number" min="0" [(ngModel)]="rewardsConfig.welcomePoints" name="welcome" /></label>
            <label>Redemption rate (pts)<input type="number" min="0" [(ngModel)]="rewardsConfig.redemptionRate" name="redrate" /></label>
          </div>
          <div class="actions">
            <button class="btn-primary" (click)="saveRewardsConfig()" [disabled]="savingRewardsConfig()">
              {{ savingRewardsConfig() ? 'Saving…' : 'Save rewards config' }}
            </button>
          </div>
          @if (rewardsMsg(); as m) {
            <p [class.err]="m.error" class="row-msg">{{ m.text }}</p>
          }
        </section>
        }

        @if (showCard('rewards_calculator')) {
        <!-- ════════ Reward Value Calculator ════════ -->
        <section class="card page-child">
          <h2>Reward Value Calculator</h2>
          <p class="muted small">
            Server-side calculation based on current points-per-RM and redemption rate.
            Refreshes on page reload.
          </p>
          @if (calcLoading()) {
            <p class="muted">Computing…</p>
          } @else if (calcError()) {
            <p class="err">{{ calcError() }}</p>
          } @else if (calcData()) {
            <div class="calc-summary">
              <span><strong>1 point</strong> ≈ <strong>RM {{ calcData()!.pointValue }}</strong></span>
              <span><strong>Effective return rate:</strong> {{ calcData()!.effectiveReturnRate }}%</span>
              <span><strong>Effective return rate:</strong> {{ calcData()!.effectiveReturnRate }}%</span>
            </div>
            <table class="calc-table">
              <thead>
                <tr><th>Discount value</th><th>Points needed</th><th>≈ Customer spend</th><th>Cost to platform</th></tr>
              </thead>
              <tbody>
                @for (row of calcData()!.rows; track row.discount) {
                  <tr>
                    <td><strong>RM {{ row.discount }}</strong></td>
                    <td>{{ row.pointsNeeded | number:'1.0-0' }}</td>
                    <td>RM {{ row.customerSpend | number:'1.2-2' }}</td>
                    <td>{{ row.costToPlatform }}</td>
                  </tr>
                }
              </tbody>
            </table>
            <p class="muted small calc-footnote">
              <em>Customer spend</em> is the approximate revenue the customer must generate
              to earn enough points. <em>Cost to platform</em> shows whether the reward is
              sustainable. All calculations are server-side.
            </p>
          }
        </section>
        }

        @if (showCard('tiers')) {
        <section class="card page-child">
          <h2>Tiers</h2>
          <p class="muted small">Tiers compute from lifetime earned points. Sorted by min points ascending.</p>
          <button class="btn-primary btn-sm" (click)="openTierModal()">+ Add tier</button>
          @if (tiers().length === 0) {
            <p class="muted">No tiers configured.</p>
          } @else {
            <table class="crud-table">
              <thead><tr><th>Name</th><th>Min pts</th><th>Bonus %</th><th>Color</th><th>Order</th><th>Active</th><th></th></tr></thead>
              <tbody>
                @for (t of tiers(); track t.id) {
                  <tr>
                    <td>{{ t.name }}</td><td>{{ t.minPoints }}</td><td>+{{ t.bonusPercent }}%</td>
                    <td><span class="color-swatch" [style.background]="t.badgeColor || '#888'"></span></td>
                    <td>{{ t.sortOrder }}</td><td>{{ t.active ? 'Yes' : 'No' }}</td>
                    <td class="action-cell">
                      <button class="btn-ghost btn-xs" (click)="editTier(t)">Edit</button>
                      <button class="btn-ghost btn-xs" (click)="deleteTier(t)">Delete</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>
        }

        @if (showCard('rewards_catalog')) {
        <section class="card page-child">
          <h2>Reward Catalog</h2>
          <p class="muted small">Redeemable items in the customer rewards page.</p>
          <button class="btn-primary btn-sm" (click)="openRewardModal()">+ Add reward</button>
          @if (rewards().length === 0) {
            <p class="muted">No rewards configured.</p>
          } @else {
            <table class="crud-table">
              <thead><tr><th>Name</th><th>Cost (pts)</th><th>Discount</th><th>Min top-up</th><th>Active</th><th></th></tr></thead>
              <tbody>
                @for (r of rewards(); track r.id) {
                  <tr>
                    <td>{{ r.name }}</td><td>{{ r.pointCost }}</td>
                    <td>{{ r.discountType === 'percent' ? r.discountValue + '%' : 'RM ' + r.discountValue }}</td>
                    <td>{{ r.minTopup ?? ' - ' }}</td><td>{{ r.active ? 'Yes' : 'No' }}</td>
                    <td class="action-cell">
                      <button class="btn-ghost btn-xs" (click)="editReward(r)">Edit</button>
                      <button class="btn-ghost btn-xs" (click)="toggleReward(r)">{{ r.active ? 'Deactivate' : 'Activate' }}</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>
        }

        @if (showCard('redemption_log')) {
        <section class="card page-child">
          <h2>Redemption Log</h2>
          @if (redemptionLog().length === 0) {
            <p class="muted">No redemptions yet.</p>
          } @else {
            <table class="crud-table">
              <thead><tr><th>User</th><th>Reward</th><th>Voucher</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                @for (e of redemptionLog(); track e.id) {
                  <tr>
                    <td>{{ e.user.email }}</td><td>{{ e.reward.name }}</td>
                    <td class="mono">{{ e.voucherCode }}</td>
                    <td><span class="status-badge" [attr.data-status]="e.status">{{ e.status }}</span></td>
                    <td class="muted">{{ e.createdAt | date:'shortDate' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>
        }
      }

      <!-- ═══════════════════════ SERVICER RULES TAB ═══════════════════════ -->
      @if (tab() === 'servicer_rules') {
        <section class="card page-child">
          <h2>Servicer Rules</h2>
          @for (s of servicerSettings; track s.key) {
            <div class="set-row">
              <div class="set-info">
                <strong>{{ s.label }}</strong>
                <span class="muted">{{ s.hint }}</span>
              </div>
              <div class="set-edit">
                <input type="number" min="0" [(ngModel)]="numModel[s.key]" [name]="s.key" />
                <button class="btn-primary" (click)="saveNum(s)" [disabled]="savingKey() === s.key">
                  {{ savingKey() === s.key ? '…' : 'Save' }}
                </button>
              </div>
              @if (msg(); as m) { @if (m.key === s.key) { <span [class.err]="m.error" class="row-msg">{{ m.text }}</span> } }
            </div>
          }
        </section>
      }

      <!-- ── Tier modal ── -->
      @if (tierModalOpen()) {
        <app-modal [open]="true" [title]="tierEditTarget() ? 'Edit tier' : 'Add tier'" (closed)="tierModalOpen.set(false)">
          <form class="modal-form" (ngSubmit)="saveTier()">
            <label>Name *<input [(ngModel)]="tierForm.name" name="tn" required /></label>
            <label>Min points *<input type="number" min="0" [(ngModel)]="tierForm.minPoints" name="tmp" /></label>
            <label>Bonus %<input type="number" min="0" [(ngModel)]="tierForm.bonusPercent" name="tbp" /></label>
            <label>Badge color<input type="text" [(ngModel)]="tierForm.badgeColor" name="tbc" placeholder="#cd7f32" /></label>
            <label>Sort order<input type="number" min="0" [(ngModel)]="tierForm.sortOrder" name="tso" /></label>
            @if (tierError()) { <p class="err">{{ tierError() }}</p> }
            <div class="modal-actions">
              <button type="button" class="btn-ghost" (click)="tierModalOpen.set(false)">Cancel</button>
              <button type="submit" class="btn-primary" [disabled]="savingTier()">{{ savingTier() ? 'Saving…' : 'Save' }}</button>
            </div>
          </form>
        </app-modal>
      }

      <!-- ── Reward modal ── -->
      @if (rewardModalOpen()) {
        <app-modal [open]="true" [title]="rewardEditTarget() ? 'Edit reward' : 'Add reward'" [wide]="true" (closed)="rewardModalOpen.set(false)">
          <form class="modal-form" (ngSubmit)="saveReward()">
            <label>Name *<input [(ngModel)]="rewardForm.name" name="rn" required /></label>
            <label>Description<textarea [(ngModel)]="rewardForm.description" name="rd" rows="2"></textarea></label>
            <div class="form-row">
              <label>Point cost *<input type="number" min="0" [(ngModel)]="rewardForm.pointCost" name="rpc" /></label>
              <label>Discount type<select [(ngModel)]="rewardForm.discountType" name="rdt">
                <option value="topup_fixed">Top-up fixed (RM)</option>
                <option value="booking_percent">Booking % off</option>
                <option value="waiver">Waiver</option>
              </select></label>
            </div>
            <div class="form-row">
              <label>Discount value *<input type="number" min="0" step="0.01" [(ngModel)]="rewardForm.discountValue" name="rdv" /></label>
              <label>Max discount (RM)<input type="number" min="0" step="0.01" [(ngModel)]="rewardForm.maxDiscount" name="rmd" /></label>
            </div>
            <label>Min top-up (RM)<input type="number" min="0" step="0.01" [(ngModel)]="rewardForm.minTopup" name="rmt" /></label>
            @if (rewardError()) { <p class="err">{{ rewardError() }}</p> }
            <div class="modal-actions">
              <button type="button" class="btn-ghost" (click)="rewardModalOpen.set(false)">Cancel</button>
              <button type="submit" class="btn-primary" [disabled]="savingReward()">{{ savingReward() ? 'Saving…' : 'Save' }}</button>
            </div>
          </form>
        </app-modal>
      }
    }
  `,
    styles: [
        `
      :host { display: block; }
      /* Tab bar (shared pill pattern §7.10) */
      .tabs { display: flex; gap: 0.4rem; margin-bottom: 1.2rem; }
      .tab { background: transparent; border: none; border-radius: 999px;
             padding: 0.6rem 1.2rem; color: var(--color-muted); cursor: pointer; font-size: 0.9rem;
             transition: background 0.15s ease, color 0.15s ease; }
      .tab:hover:not(.active) { color: var(--color-text); background: var(--color-bg); }
      .tab.active { background: var(--color-primary); background: var(--gradient-sidebar); color: #fff; font-weight: 600; box-shadow: 0 1px 6px rgba(201, 90, 60, 0.2); }
      section { max-width: 680px; margin-bottom: 1.4rem; }
      h2 { margin-top: 0; font-size: 1.05rem; }
      h3 { font-size: 0.95rem; margin: 1rem 0 0.3rem; }
      .small { font-size: 0.82rem; }
      .err { color: var(--color-danger); font-size: 0.85rem; }
      .row-msg { font-size: 0.8rem; color: var(--color-success); margin-top: 0.3rem; width: 100%; }
      .row-msg.err { color: var(--color-danger); }
      .actions { margin-top: 0.8rem; }
      /* Fee */
      .fee-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .fee-row label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; font-weight: 500; }
      .fee-row input { width: 110px; }
      .breakdown-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem; font-size: 0.88rem; }
      .breakdown-row input { width: 80px; }
      .breakdown-total { font-size: 0.85rem; font-weight: 600; margin-top: 0.3rem; display: flex; gap: 0.5rem; align-items: center; }
      /* Rewards */
      .rewards-config { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
      .rewards-config label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; font-weight: 500; }
      .rewards-config input { width: 100%; }
      .crud-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
      .crud-table th, .crud-table td { text-align: left; padding: 0.4rem; border-bottom: 1px solid var(--color-border); }
      .crud-table th { font-weight: 600; color: var(--color-muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }
      .action-cell { white-space: nowrap; }
      .color-swatch { display: inline-block; width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--color-border); vertical-align: middle; }
      .mono { font-family: monospace; font-size: 0.8rem; }
      .status-badge { font-size: 0.72rem; padding: 0.1rem 0.45rem; border-radius: 999px; border: 1px solid var(--color-border); text-transform: capitalize; }
      .status-badge[data-status="active"] { background: var(--color-status-completed-bg); color: var(--color-status-completed-text); border-color: var(--color-status-completed-border); }
      .status-badge[data-status="used"] { background: var(--color-status-progress-bg); color: var(--color-status-progress-text); border-color: var(--color-status-progress-border); }
      .status-badge[data-status="expired"] { background: var(--color-status-cancelled-bg); color: var(--color-status-cancelled-text); border-color: var(--color-status-cancelled-border); }
      .btn-xs { font-size: 0.75rem; padding: 0.625rem 0.7rem; }
      .btn-sm { font-size: 0.82rem; padding: 0.625rem 0.7rem; margin-bottom: 0.5rem; }
      .btn-ghost { display: inline-flex; align-items: center; gap: 0.3rem; }
      /* Settings rows */
      .set-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
                 padding: 0.6rem 0; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; }
      .set-row:last-of-type { border-bottom: none; }
      .set-info { display: flex; flex-direction: column; gap: 0.1rem; min-width: 200px; flex: 1; }
      .set-info strong { font-size: 0.9rem; }
      .set-info .muted { font-size: 0.78rem; }
      .set-edit { display: flex; align-items: center; gap: 0.4rem; }
      .set-edit input { width: 90px; }
      .set-prefix { font-size: 0.85rem; font-weight: 600; color: var(--color-muted); }
      /* Modals */
      .modal-form { display: flex; flex-direction: column; gap: 0.7rem; }
      .modal-form label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; font-weight: 500; }
      .form-row { display: flex; gap: 0.7rem; }
      .form-row label { flex: 1; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
      .modal-form textarea { resize: vertical; }
      /* Reward calculator */
      .calc-summary { display: flex; gap: 1.2rem; align-items: baseline; flex-wrap: wrap;
                      padding: 0.6rem 0; margin-bottom: 0.5rem; font-size: 0.88rem; }
      .calc-summary strong { font-weight: 600; }
      .calc-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .calc-table th, .calc-table td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--color-border); }
      .calc-table th { font-weight: 600; color: var(--color-muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }
      .calc-table tbody tr:hover { background: var(--color-bg); }
      .calc-footnote { margin-top: 0.5rem; }
    `,
    ]
})
export class AdminMoneySettingsComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private pin = inject(PinService);

  tab = signal<FinancialTab>('pricing');
  cardFilter = signal<string>('all');
  readonly pricingCards = ['platform_fee', 'fee_baselines', 'timing_tax'] as const;
  readonly rewardsCards = ['rewards_config', 'rewards_calculator', 'tiers', 'rewards_catalog', 'redemption_log'] as const;

  showCard(id: string): boolean {
    const f = this.cardFilter();
    return f === 'all' || f === id;
  }

  cardLabel(id: string): string {
    const map: Record<string, string> = {
      platform_fee: 'Platform Fee', fee_baselines: 'Fee Baselines', timing_tax: 'Timing & Tax',
      rewards_config: 'Rewards Config', rewards_calculator: 'Calculator',
      tiers: 'Tiers', rewards_catalog: 'Catalog', redemption_log: 'Redemption Log',
    };
    return map[id] ?? id;
  }

  loading = signal(true);
  loadFailed = signal(false);

  // ── Platform fee ──
  feeRatePct: number | null = null;
  private feeRateRaw: Record<string, unknown> = {};
  readonly feeBreakdown = [
    { key: 'marketing', label: 'Marketing & acquisition' },
    { key: 'rewards', label: 'Rewards & promotions' },
    { key: 'operations', label: 'Platform operations' },
    { key: 'margin', label: 'Platform margin' },
  ];
  feeBreakdownValues: number[] = [5, 8, 4, 3];
  savingFeeBreakdown = signal(false);
  breakdownTotal = computed(() => this.feeBreakdownValues.reduce((a, b) => a + (b ?? 0), 0));

  // ── Rewards config ──
  rewardsConfig: RewardConfig = { pointsPerRm: 1, pointsPerReview: 50, pointsPerReferral: 200, welcomePoints: 500, redemptionRate: 100 };
  savingRewardsConfig = signal(false);
  rewardsMsg = signal<{ text: string; error: boolean } | null>(null);

  // ── Reward calculator (server-side) ──
  calcData = signal<{ effectiveReturnRate: number; pointValue: number; rows: { discount: number; pointsNeeded: number; customerSpend: number; costToPlatform: string }[] } | null>(null);
  calcLoading = signal(false);
  calcError = signal('');
  // ── Tiers ──
  tiers = signal<LoyaltyTier[]>([]);
  tierModalOpen = signal(false);
  tierEditTarget = signal<LoyaltyTier | null>(null);
  tierForm = { name: '', minPoints: 0, bonusPercent: 0, badgeColor: '', sortOrder: 0 };
  savingTier = signal(false);
  tierError = signal('');

  // ── Rewards catalog ──
  rewards = signal<RewardItem[]>([]);
  rewardModalOpen = signal(false);
  rewardEditTarget = signal<RewardItem | null>(null);
  rewardForm = { name: '', description: '', pointCost: 0, discountType: 'topup_fixed', discountValue: 0, maxDiscount: null as number | null, minTopup: null as number | null };
  savingReward = signal(false);
  rewardError = signal('');

  // ── Redemption log ──
  redemptionLog = signal<RedemptionLogEntry[]>([]);

  // ── Generic settings ──
  readonly servicerSettings = SERVICER_SETTINGS;
  readonly platformSettings = PLATFORM_SETTINGS;
  readonly feeBaselineSettings = FEE_BASELINE_SETTINGS;
  numModel: Record<string, number | null> = {};
  savingKey = signal<string | null>(null);
  msg = signal<{ key: string; text: string; error: boolean } | null>(null);

  ngOnInit(): void {
    this.api.get<{ data: { key: string; value: unknown }[] }>('/admin/settings').subscribe({
      next: (r) => {
        const byKey = new Map(r.data.map((s) => [s.key, s.value]));

        const fr = byKey.get('platform_fee_rate') as Record<string, unknown> | undefined;
        if (fr) {
          this.feeRateRaw = fr;
          this.feeRatePct = typeof fr['current_rate'] === 'number' ? Math.round((fr['current_rate'] as number) * 100 * 100) / 100 : null;
        }

        for (const s of [...SERVICER_SETTINGS, ...PLATFORM_SETTINGS, ...FEE_BASELINE_SETTINGS]) {
          const v = byKey.get(s.key) as Record<string, number> | undefined;
          const raw = v?.[s.prop];
          this.numModel[s.key] = raw == null ? null : s.key.includes('rate') || s.key.includes('sst') ? Math.round(raw * 100 * 100) / 100 : raw;
        }

        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.loadFailed.set(true); },
    });

    this.loadTiers();
    this.loadRewards();
    this.api.get<{ data: RedemptionLogEntry[] }>('/admin/rewards/redemptions').subscribe({
      next: (r) => this.redemptionLog.set(r.data ?? []),
      error: () => {},
    });

    // Load reward calculator from backend (all financial math is server-side).
    this.calcLoading.set(true);
    this.api.get<{ effectiveReturnRate: number; pointValue: number; rows: { discount: number; pointsNeeded: number; customerSpend: number; costToPlatform: string }[] }>('/admin/rewards/calculator').subscribe({
      next: (r) => {
        this.calcData.set(r);
        this.calcLoading.set(false);
      },
      error: (e) => {
        this.calcLoading.set(false);
        this.calcError.set(e.message ?? 'Failed to load calculator');
      },
    });
  }

  // ── Platform fee ──
  saveFeeRate(): void {
    if (this.feeRatePct == null || !Number.isFinite(this.feeRatePct) || this.feeRatePct < 0) {
      this.msg.set({ key: 'platform_fee_rate', text: 'Enter a valid rate.', error: true });
      return;
    }
    this.persist('platform_fee_rate', { ...this.feeRateRaw, current_rate: Number(this.feeRatePct) / 100 });
  }

  saveFeeBreakdown(): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingFeeBreakdown.set(true);
      this.api.patch('/admin/settings', { key: 'fee_breakdown', value: this.feeBreakdownValues }, { 'x-action-pin': pin }).subscribe({
        next: () => { this.savingFeeBreakdown.set(false); this.msg.set({ key: 'fee_breakdown', text: 'Saved.', error: false }); },
        error: (e) => { this.savingFeeBreakdown.set(false); this.msg.set({ key: 'fee_breakdown', text: e.message ?? 'Save failed', error: true }); },
      });
    });
  }

  // ── Rewards config ──
  saveRewardsConfig(): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingRewardsConfig.set(true); this.rewardsMsg.set(null);
      const configs = [
        { key: 'points_per_rm', value: this.rewardsConfig.pointsPerRm },
        { key: 'points_per_review', value: this.rewardsConfig.pointsPerReview },
        { key: 'points_per_referral', value: this.rewardsConfig.pointsPerReferral },
        { key: 'welcome_points', value: this.rewardsConfig.welcomePoints },
        { key: 'redemption_rate', value: this.rewardsConfig.redemptionRate },
      ];
      let completed = 0; let hasError = false;
      for (const c of configs) {
        this.api.patch('/admin/settings', { key: c.key, value: c.value }, { 'x-action-pin': pin }).subscribe({
          next: () => { completed++; if (completed === configs.length) { this.savingRewardsConfig.set(false); this.rewardsMsg.set({ text: 'Rewards config saved.', error: false }); } },
          error: (e) => { if (!hasError) { hasError = true; this.savingRewardsConfig.set(false); this.rewardsMsg.set({ text: e.message ?? 'Save failed', error: true }); } },
        });
      }
    });
  }

  // ── Tiers ──
  openTierModal(): void { this.tierEditTarget.set(null); this.tierForm = { name: '', minPoints: 0, bonusPercent: 0, badgeColor: '', sortOrder: this.tiers().length }; this.tierError.set(''); this.tierModalOpen.set(true); }
  editTier(t: LoyaltyTier): void { this.tierEditTarget.set(t); this.tierForm = { name: t.name, minPoints: t.minPoints, bonusPercent: t.bonusPercent, badgeColor: t.badgeColor ?? '', sortOrder: t.sortOrder }; this.tierError.set(''); this.tierModalOpen.set(true); }
  saveTier(): void {
    this.tierError.set(''); if (!this.tierForm.name.trim()) { this.tierError.set('Name is required.'); return; }
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return; this.savingTier.set(true);
      const body = { name: this.tierForm.name.trim(), minPoints: this.tierForm.minPoints, bonusPercent: this.tierForm.bonusPercent, badgeColor: this.tierForm.badgeColor || null, sortOrder: this.tierForm.sortOrder };
      const edit = this.tierEditTarget();
      const req = edit ? this.api.patch(`/admin/rewards/tiers/${edit.id}`, body, { 'x-action-pin': pin }) : this.api.post('/admin/rewards/tiers', body, { 'x-action-pin': pin });
      req.subscribe({ next: () => { this.savingTier.set(false); this.tierModalOpen.set(false); this.loadTiers(); }, error: (e) => { this.savingTier.set(false); this.tierError.set(e.message ?? 'Save failed.'); } });
    });
  }
  deleteTier(t: LoyaltyTier): void { this.pin.requirePin().subscribe((pin) => { if (!pin) return; this.api.delete(`/admin/rewards/tiers/${t.id}`, { 'x-action-pin': pin }).subscribe({ next: () => this.loadTiers(), error: () => {} }); }); }
  private loadTiers(): void { this.api.get<{ data: LoyaltyTier[] }>('/admin/rewards/tiers').subscribe({ next: (r) => this.tiers.set(r.data ?? []) }); }

  // ── Rewards catalog ──
  openRewardModal(): void { this.rewardEditTarget.set(null); this.rewardForm = { name: '', description: '', pointCost: 0, discountType: 'topup_fixed', discountValue: 0, maxDiscount: null, minTopup: null }; this.rewardError.set(''); this.rewardModalOpen.set(true); }
  editReward(r: RewardItem): void { this.rewardEditTarget.set(r); this.rewardForm = { name: r.name, description: r.description ?? '', pointCost: r.pointCost, discountType: r.discountType, discountValue: Number(r.discountValue), maxDiscount: r.maxDiscount ? Number(r.maxDiscount) : null, minTopup: r.minTopup ? Number(r.minTopup) : null }; this.rewardError.set(''); this.rewardModalOpen.set(true); }
  saveReward(): void {
    this.rewardError.set(''); if (!this.rewardForm.name.trim()) { this.rewardError.set('Name is required.'); return; }
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return; this.savingReward.set(true);
      const body = { name: this.rewardForm.name.trim(), description: this.rewardForm.description.trim() || null, pointCost: this.rewardForm.pointCost, discountType: this.rewardForm.discountType, discountValue: this.rewardForm.discountValue, maxDiscount: this.rewardForm.maxDiscount, minTopup: this.rewardForm.minTopup };
      const edit = this.rewardEditTarget(); const req = edit ? this.api.patch(`/admin/rewards/${edit.id}`, body, { 'x-action-pin': pin }) : this.api.post('/admin/rewards', body, { 'x-action-pin': pin });
      req.subscribe({ next: () => { this.savingReward.set(false); this.rewardModalOpen.set(false); this.loadRewards(); }, error: (e) => { this.savingReward.set(false); this.rewardError.set(e.message ?? 'Save failed.'); } });
    });
  }
  toggleReward(r: RewardItem): void { this.pin.requirePin().subscribe((pin) => { if (!pin) return; this.api.patch(`/admin/rewards/${r.id}`, { active: !r.active }, { 'x-action-pin': pin }).subscribe({ next: () => this.loadRewards(), error: () => {} }); }); }
  private loadRewards(): void { this.api.get<{ data: RewardItem[] }>('/admin/rewards').subscribe({ next: (r) => this.rewards.set(r.data ?? []) }); }

  // ── Generic settings ──
  saveNum(s: NumSetting): void {
    const raw = this.numModel[s.key];
    if (raw == null || !Number.isFinite(Number(raw)) || Number(raw) < 0) { this.msg.set({ key: s.key, text: 'Enter a valid value.', error: true }); return; }
    const stored = s.key.includes('rate') || s.key === 'sst_rate' ? Number(raw) / 100 : Number(raw);
    this.persist(s.key, { [s.prop]: stored });
  }

  private persist(key: string, value: unknown): void {
    this.msg.set(null);
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return; this.savingKey.set(key);
      this.api.patch('/admin/settings', { key, value }, { 'x-action-pin': pin }).subscribe({
        next: () => { this.savingKey.set(null); this.msg.set({ key, text: 'Saved.', error: false }); },
        error: (e) => { this.savingKey.set(null); this.msg.set({ key, text: e.message ?? 'Save failed', error: true }); },
      });
    });
  }
}
