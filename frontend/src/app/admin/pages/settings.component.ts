import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ModalComponent } from '../../shared/modal.component';
import { PinService } from '../../core/services/pin.service';
import { SearchSelectComponent, SelectOption } from '../../shared/search-select.component';

interface Category {
  id: string;
  name: string;
  imageUrl?: string | null;
  allowedTimeSlots?: string[];
}

interface Postcode {
  postcode: string;
  district: string;
  state: string;
  lat?: number | null;
  lng?: number | null;
}

interface BannedEmail {
  id: string;
  email: string;
  reason: string | null;
  bannedAt: string;
  bannedBy: string | null;
  deactivations: number;
}

const ALL_TIME_SLOTS = ['morning', 'noon', 'afternoon', 'evening', 'night'];
const TIME_SLOT_LABELS: Record<string, string> = {
  morning: 'Morning (9:00–11:00)',
  noon: 'Noon (11:00–13:00)',
  afternoon: 'Afternoon (13:00–15:00)',
  evening: 'Evening (15:00–17:00)',
  night: 'Night (17:00–22:00)',
};

interface RangeRow {
  min: number | null;
  max: number | null;
}

type BudgetRangesData =
  | { ranges: RangeRow[] }
  | { ranges: Record<string, RangeRow[]> };

interface AdminPromotion {
  id: string;
  label: string;
  description?: string | null;
  triggerType: string;
  valueType: 'percent' | 'fixed';
  value: number;
  conditions?: Record<string, unknown>;
  targetRole?: string;
  active: boolean;
  usedCount: number;
  maxUses?: number | null;
  maxPerUser?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
}

type Tab = 'general' | 'categories' | 'servicer' | 'location' | 'thumbnails' | 'banned' | 'promotions';

interface NumSetting {
  key: string;
  label: string;
  hint: string;
  tab: Tab;
  prop: string;
  kind: 'money' | 'count' | 'minutes' | 'percent';
}

const NUM_SETTINGS: NumSetting[] = [
  // ── Servicer ──
  { key: 'minimum_servicer_charge', label: 'Minimum servicer charge', hint: 'Smallest total a servicer may charge for a job.', tab: 'servicer', prop: 'amount', kind: 'money' },
  { key: 'servicer_deposit_minimum', label: 'Deposit minimum', hint: 'Minimum deposit a servicer must hold to take jobs.', tab: 'servicer', prop: 'amount', kind: 'money' },
  { key: 'servicer_credit_withdrawal_minimum', label: 'Withdrawal minimum', hint: 'Smallest credit withdrawal a servicer can request.', tab: 'servicer', prop: 'amount', kind: 'money' },
  { key: 'servicer_proposal_preset_limit', label: 'Proposal preset limit', hint: 'Max saved proposal presets per servicer.', tab: 'servicer', prop: 'limit', kind: 'count' },
  { key: 'no_show_consecutive_threshold', label: 'No-show consecutive threshold', hint: 'Consecutive no-shows before the servicer is flagged.', tab: 'servicer', prop: 'count', kind: 'count' },
  { key: 'no_show_weekly_threshold', label: 'No-show weekly threshold', hint: 'No-shows within a week before the servicer is flagged.', tab: 'servicer', prop: 'count', kind: 'count' },
  { key: 'noshow_grace_minutes', label: 'No-show grace period', hint: 'Minutes a servicer can be late before it counts as a no-show.', tab: 'servicer', prop: 'minutes', kind: 'minutes' },
  // ── General ──
  { key: 'quote_buffer_minutes', label: 'Quote buffer', hint: 'Minutes between the servicer deadline and the customer deadline.', tab: 'general', prop: 'minutes', kind: 'minutes' },
  { key: 'sst_rate', label: 'SST rate', hint: 'Malaysian SST applied where relevant.', tab: 'general', prop: 'rate', kind: 'percent' },
  { key: 'registered_customer_discount', label: 'Registered customer discount', hint: 'Discount automatically applied for all registered (non-guest) customers. 15% of the 20% platform charge - servicers see the full 20% deducted; 15% funds the customer discount and 5% is platform net revenue.', tab: 'general', prop: 'rate', kind: 'percent' },
];

const POSTCODES_PER_PAGE = 20;

@Component({
    selector: 'app-admin-settings',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, SearchSelectComponent, ModalComponent],
    template: `
    <h1>Platform settings</h1>

    <div class="tabs">
      <button class="tab" [class.active]="tab() === 'general'" (click)="tab.set('general')">General</button>
      <button class="tab" [class.active]="tab() === 'categories'" (click)="tab.set('categories')">Categories</button>
      <button class="tab" [class.active]="tab() === 'servicer'" (click)="tab.set('servicer')">Servicer</button>
      <button class="tab" [class.active]="tab() === 'location'" (click)="tab.set('location'); loadPostcodes()">Location</button>
      <button class="tab" [class.active]="tab() === 'thumbnails'" (click)="tab.set('thumbnails')">Thumbnails</button>
      <button class="tab" [class.active]="tab() === 'banned'" (click)="tab.set('banned')">Banned</button>
      <button class="tab" [class.active]="tab() === 'promotions'" (click)="tab.set('promotions'); loadPromotions()">Promotions</button>
    </div>

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (loadFailed()) {
      <p class="err">Could not load settings. Please refresh and try again.</p>
    } @else {

      <!-- ════════ GENERAL ════════ -->
      @if (tab() === 'general') {
        <section class="card page-child">
          <h2>Platform fee rate</h2>
          <p class="muted">
            The platform's commission on completed pay-now bookings (taken from the
            servicer payout). Scheduled future rate changes are preserved on save.
          </p>
          <div class="charge-row">
            <input type="number" min="0" step="0.5" [(ngModel)]="feeRatePct" name="feerate" />
            <span class="affix">%</span>
          </div>
          <div class="actions">
            <button class="btn-primary" (click)="saveFeeRate()" [disabled]="savingKey() === 'platform_fee_rate'">
              {{ savingKey() === 'platform_fee_rate' ? 'Saving…' : 'Save fee rate' }}
            </button>
          </div>
          @if (msg(); as m) { @if (m.key === 'platform_fee_rate') { <p [class.err]="m.error" class="row-msg">{{ m.text }}</p> } }
        </section>

        <section class="card page-child">
          <h2>Notifications</h2>
          <div class="set-row">
            <div class="set-info">
              <strong>Notification sound</strong>
              <span class="muted">Play a chime when a new notification arrives.</span>
            </div>
            <div class="set-edit">
              <label class="toggle-label">
                <input type="checkbox" [ngModel]="notifSoundEnabled()" (ngModelChange)="notifSoundEnabled.set($event); saveNotifSound()" name="notifSound" />
                {{ notifSoundEnabled() ? 'On' : 'Off' }}
              </label>
            </div>
          </div>
          <div class="set-row">
            <div class="set-info">
              <strong>Chat message sound</strong>
              <span class="muted">Play a chime when a new chat message arrives.</span>
            </div>
            <div class="set-edit">
              <label class="toggle-label">
                <input type="checkbox" [ngModel]="chatSoundEnabled()" (ngModelChange)="chatSoundEnabled.set($event); saveChatSound()" name="chatSound" />
                {{ chatSoundEnabled() ? 'On' : 'Off' }}
              </label>
            </div>
          </div>
          <div class="set-row">
            <div class="set-info">
              <strong>Typing sound</strong>
              <span class="muted">Play a subtle click when someone is typing in chat.</span>
            </div>
            <div class="set-edit">
              <label class="toggle-label">
                <input type="checkbox" [ngModel]="typingSoundEnabled()" (ngModelChange)="typingSoundEnabled.set($event); saveTypingSound()" name="typingSound" />
                {{ typingSoundEnabled() ? 'On' : 'Off' }}
              </label>
            </div>
          </div>
        </section>

        <section class="card page-child">
          <h2>Timing &amp; tax</h2>
          @for (s of settingsFor('general'); track s.key) {
            <div class="set-row">
              <div class="set-info">
                <strong>{{ s.label }}</strong>
                <span class="muted">{{ s.hint }}</span>
              </div>
              <div class="set-edit">
                <input type="number" min="0" [(ngModel)]="numModel[s.key]" [name]="s.key" />
                @if (s.kind === 'percent') { <span class="affix">%</span> }
                @if (s.kind === 'minutes') { <span class="affix">min</span> }
                <button class="btn-primary" (click)="saveNum(s)" [disabled]="savingKey() === s.key">
                  {{ savingKey() === s.key ? '…' : 'Save' }}
                </button>
              </div>
              @if (msg(); as m) { @if (m.key === s.key) { <span [class.err]="m.error" class="row-msg">{{ m.text }}</span> } }
            </div>
          }
        </section>

        <section class="card page-child">
          <h2>No-response discount</h2>
          <p class="muted">
            When no servicer responds to a customer's quote in time, the customer is
            offered this discount to try again.
          </p>
          <div class="discount-row">
            <label>
              Type
              <select [(ngModel)]="discount.type" name="dtype">
                <option value="fixed">Fixed (RM)</option>
                <option value="percent">Percentage (%)</option>
              </select>
            </label>
            <label>
              Value
              <input type="number" min="0" [(ngModel)]="discount.value" name="dval" />
            </label>
            <label>
              Expires (days)
              <input type="number" min="1" [(ngModel)]="discount.expires" name="dexp" />
            </label>
          </div>
          <div class="actions">
            <button class="btn-primary" (click)="saveDiscount()" [disabled]="savingKey() === 'no_response_discount'">
              {{ savingKey() === 'no_response_discount' ? 'Saving…' : 'Save discount' }}
            </button>
          </div>
          @if (msg(); as m) { @if (m.key === 'no_response_discount') { <p [class.err]="m.error" class="row-msg">{{ m.text }}</p> } }
        </section>

        <section class="card page-child">
          <h2>Condo entry note</h2>
          <p class="muted">
            This note is shown to customers when they select "Condo" as property type in the quote form.
          </p>
          <textarea
            class="condo-textarea"
            rows="3"
            [(ngModel)]="condoEntryNote"
            name="condoNote"
            placeholder="If you live in a condo, please inform your management and guide the servicer on how to enter your building. Each condo has its own visitor policy."
          ></textarea>
          <div class="actions">
            <button class="btn-primary" (click)="saveCondoNote()" [disabled]="savingCondoNote()">
              {{ savingCondoNote() ? 'Saving…' : 'Save note' }}
            </button>
          </div>
          @if (condoMsg(); as m) {
            <p [class.err]="m.error" class="row-msg">{{ m.text }}</p>
          }
        </section>
      }

      <!-- ════════ CATEGORIES ════════ -->
      @if (tab() === 'categories') {
        <section class="card page-child">
          <h2>Budget ranges</h2>
          <p class="muted">
            Configure budget brackets per category. Select a category, then add or
            edit the price ranges customers choose from on the quote form. Leave the
            upper value blank for an open-ended top range (e.g. "RM 350+").
          </p>
          <label class="cat-select">
            Category
            <app-search-select
              [ngModel]="selectedCategoryId()"
              (ngModelChange)="selectCategory($event)"
              name="cat"
              [options]="categoryOptions()"
              placeholder=" - Select a category - "
              searchPlaceholder="Search categories…"
            />
          </label>
          @if (selectedCategoryId()) {
            @for (r of currentRanges(); track $index) {
              <div class="range-row">
                <span>RM</span>
                <input type="number" [(ngModel)]="r.min" [name]="'min' + $index" />
                <span>–</span>
                <input type="number" [(ngModel)]="r.max" [name]="'max' + $index" placeholder="(open)" />
                <button class="btn-ghost" (click)="removeRange($index)">✕</button>
              </div>
            }
            <button class="btn-ghost" (click)="addRange()">+ Add range</button>
            <div class="actions">
              <button class="btn-primary" (click)="save()" [disabled]="saving()">
                {{ saving() ? 'Saving…' : 'Save budget ranges' }}
              </button>
            </div>
          }
          @if (message()) {
            <p [class.err]="isError()">{{ message() }}</p>
          }
        </section>

        <section class="card page-child">
          <h2>Allowed time slots</h2>
          <p class="muted">Control which time slots customers can book for each category.</p>
          <div class="slot-cat-list">
            @for (cat of categories(); track cat.id) {
              <div class="slot-cat-row">
                <strong class="slot-cat-name">{{ cat.name }}</strong>
                <div class="slot-chips">
                  @for (slot of ALL_TIME_SLOTS; track slot) {
                    <label class="slot-chip" [class.on]="catTimeSlots(cat.id)(slot)">
                      <input
                        type="checkbox"
                        [checked]="catTimeSlots(cat.id)(slot)"
                        (change)="toggleTimeSlot(cat.id, slot, $event)"
                        hidden
                      />
                      {{ TIME_SLOT_LABELS[slot] }}
                    </label>
                  }
                </div>
                <div class="slot-cat-actions">
                  <button
                    class="btn-ghost btn-xs"
                    (click)="saveTimeSlots(cat)"
                    [disabled]="savingTimeSlots().has(cat.id)"
                  >
                    {{ savingTimeSlots().has(cat.id) ? 'Saving…' : 'Save' }}
                  </button>
                  @if (timeSlotMsg(); as m) { @if (m.id === cat.id) {
                    <span class="row-msg" [class.err]="m.error">{{ m.text }}</span>
                  } }
                </div>
              </div>
            }
          </div>
        </section>
      }

      <!-- ════════ SERVICER ════════ -->
      @if (tab() === 'servicer') {
        <section class="card page-child">
          <h2>Servicer rules</h2>
          <p class="muted">Charge floors, deposit/withdrawal limits, and no-show enforcement.</p>
          @for (s of settingsFor('servicer'); track s.key) {
            <div class="set-row">
              <div class="set-info">
                <strong>{{ s.label }}</strong>
                <span class="muted">{{ s.hint }}</span>
              </div>
              <div class="set-edit">
                @if (s.kind === 'money') { <span class="affix">RM</span> }
                <input type="number" min="0" [(ngModel)]="numModel[s.key]" [name]="s.key" />
                @if (s.kind === 'percent') { <span class="affix">%</span> }
                @if (s.kind === 'minutes') { <span class="affix">min</span> }
                <button class="btn-primary" (click)="saveNum(s)" [disabled]="savingKey() === s.key">
                  {{ savingKey() === s.key ? '…' : 'Save' }}
                </button>
              </div>
              @if (msg(); as m) { @if (m.key === s.key) { <span [class.err]="m.error" class="row-msg">{{ m.text }}</span> } }
            </div>
          }
        </section>
      }

      <!-- ════════ LOCATION ════════ -->
      @if (tab() === 'location') {
        <section class="card page-child loc-section">
          <h2>Postcode directory</h2>
          <p class="muted">Manage the postcode-to-district/state lookup table used for address auto-fill and radius matching.</p>

          <div class="loc-toolbar">
            <input
              type="text"
              [ngModel]="postcodeSearch()"
              (ngModelChange)="postcodeSearch.set($event); postcodePage.set(1)"
              name="pcq"
              placeholder="Search postcode, district or state…"
              class="loc-search"
            />
            <button class="btn-primary" (click)="openPostcodeModal()">+ Add</button>
            <button class="btn-ghost" (click)="loadPostcodes()" [disabled]="loadingPostcodes()">Refresh</button>
          </div>

          @if (loadingPostcodes()) {
            <p class="muted">Loading postcodes…</p>
          } @else if (postcodeLoadError()) {
            <p class="err">{{ postcodeLoadError() }}</p>
          } @else if (filteredPostcodes().length === 0) {
            <p class="muted">No postcodes found{{ postcodeSearch() ? ' matching "' + postcodeSearch() + '"' : '' }}.</p>
          } @else {
            <table class="loc-table">
              <thead>
                <tr>
                  <th>Postcode</th>
                  <th>District</th>
                  <th>State</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (p of pagedPostcodes(); track p.postcode) {
                  <tr>
                    <td class="loc-code">{{ p.postcode }}</td>
                    <td>{{ p.district }}</td>
                    <td>{{ p.state }}</td>
                    <td class="loc-acts">
                      <button class="btn-ghost btn-xs" (click)="openEditPostcodeModal(p)">Edit</button>
                      <button class="btn-ghost btn-xs" style="color:var(--color-danger)" (click)="deletePostcodeTarget.set(p)">Delete</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            @if (totalPostcodePages() > 1) {
              <div class="loc-pagination">
                <button class="btn-ghost btn-xs" (click)="postcodePage.set(postcodePage() - 1)" [disabled]="postcodePage() <= 1">‹ Prev</button>
                <span class="muted">Page {{ postcodePage() }} / {{ totalPostcodePages() }}</span>
                <button class="btn-ghost btn-xs" (click)="postcodePage.set(postcodePage() + 1)" [disabled]="postcodePage() >= totalPostcodePages()">Next ›</button>
              </div>
            }
            <p class="muted small">{{ filteredPostcodes().length }} postcode(s) total.</p>
          }

          <div class="loc-import">
            <span class="muted small">Bulk import:</span>
            <button class="btn-ghost btn-xs" disabled title="Coming soon">CSV import</button>
          </div>
        </section>

        @if (postcodeModalOpen()) {
          <app-modal [open]="true" [title]="postcodeEditTarget() ? 'Edit Postcode' : 'Add Postcode'" (closed)="postcodeModalOpen.set(false)">
            <form class="pc-form" (ngSubmit)="savePostcode()">
              <label>Postcode *
                <input [(ngModel)]="postcodeForm.postcode" name="pcCode" placeholder="e.g. 47500" [attr.readonly]="postcodeEditTarget() ? '' : null" />
              </label>
              <label>District *
                <input [(ngModel)]="postcodeForm.district" name="pcDistrict" placeholder="e.g. Subang Jaya" />
              </label>
              <label>State *
                <input [(ngModel)]="postcodeForm.state" name="pcState" placeholder="e.g. Selangor" />
              </label>
              @if (postcodeSaveError()) { <p class="err">{{ postcodeSaveError() }}</p> }
              <div class="modal-actions">
                <button type="button" class="btn-ghost" (click)="postcodeModalOpen.set(false)">Cancel</button>
                <button type="submit" class="btn-primary" [disabled]="savingPostcode()">
                  {{ savingPostcode() ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </form>
          </app-modal>
        }

        @if (deletePostcodeTarget(); as p) {
          <app-modal [open]="true" title="Delete postcode?" (closed)="deletePostcodeTarget.set(null)">
            <p>Remove <strong>{{ p.postcode }}</strong> ({{ p.district }}, {{ p.state }}) from the lookup table?</p>
            @if (postcodeDeleteError()) { <p class="err">{{ postcodeDeleteError() }}</p> }
            <div class="modal-actions">
              <button class="btn-ghost" (click)="deletePostcodeTarget.set(null)">Cancel</button>
              <button class="btn-danger" (click)="doDeletePostcode(p)" [disabled]="deletingPostcode()">
                {{ deletingPostcode() ? 'Deleting…' : 'Delete' }}
              </button>
            </div>
          </app-modal>
        }
      }

      <!-- ════════ THUMBNAILS ════════ -->
      @if (tab() === 'thumbnails') {
        <section class="card page-child">
          <h2>Category thumbnails</h2>
          <p class="muted">
            Upload a thumbnail image for each category. These images appear on
            the customer-facing service listing cards. The category icon serves
            as the fallback when no thumbnail is set.
          </p>
          <div class="thumb-list">
            @for (cat of categories(); track cat.id) {
              <div class="thumb-row">
                <div class="thumb-preview">
                  @if (cat.imageUrl) {
                    <img [src]="cat.imageUrl" class="thumb-img" alt="" />
                  } @else {
                    <span class="thumb-empty">No image</span>
                  }
                </div>
                <div class="thumb-info">
                  <strong class="thumb-name">{{ cat.name }}</strong>
                  <div class="thumb-acts">
                    <label class="btn-ghost btn-xs thumb-upload-btn" [class.disabled]="uploading().has(cat.id)">
                      {{ uploading().has(cat.id) ? 'Uploading…' : 'Upload' }}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        [disabled]="uploading().has(cat.id)"
                        (change)="uploadThumbnail(cat, $event)"
                        hidden
                      />
                    </label>
                    @if (cat.imageUrl) {
                      <button type="button" class="btn-ghost btn-xs" (click)="clearThumbnail(cat)" [disabled]="uploading().has(cat.id)">
                        Clear
                      </button>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        </section>
      }

      <!-- ════════ BANNED ════════ -->
      @if (tab() === 'banned') {
        <section class="card page-child">
          <h2>Banned emails</h2>
          <p class="muted">
            View and manage banned email addresses. Banned emails cannot register
            new accounts. Auto-bans occur after 10 deactivations on the same email.
          </p>

          <div class="ban-toolbar">
            <input type="text" [(ngModel)]="banQuery" name="bq" placeholder="Search by email…" class="ban-search" />
            <button class="btn-primary" (click)="openBanModal()">+ Ban</button>
          </div>

          @if (bannedEmails().length === 0) {
            <div class="ban-empty">
              <p class="muted">No banned emails.</p>
              <p class="muted small">Banned accounts from deactivation or manual admin action will appear here.</p>
            </div>
          } @else {
            <table class="ban-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Reason</th>
                  <th>Banned</th>
                  <th>Deactivations</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                @for (b of filteredBanned(); track b.id) {
                  <tr>
                    <td class="ban-email">{{ b.email }}</td>
                    <td class="ban-reason">{{ b.reason ?? ' - ' }}</td>
                    <td class="muted">{{ b.bannedAt | date: 'mediumDate' }}</td>
                    <td>{{ b.deactivations }}</td>
                    <td>
                      <button class="btn-ghost btn-xs" (click)="unban(b)">☑ Unban</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <p class="muted small">Showing {{ filteredBanned().length }} of {{ bannedEmails().length }} result(s).</p>
          }
        </section>
      }

      <!-- ════════ PROMOTIONS ════════ -->
      @if (tab() === 'promotions') {
        <section class="card page-child">
          <div class="promo-toolbar">
            <input type="text" [(ngModel)]="promoQuery" name="pq" placeholder="Search by label…" class="promo-search" />
            <button class="btn-primary" (click)="openPromoModal()">+ Add promo</button>
          </div>

          @if (loadingPromotions()) {
            <p class="muted">Loading promotions…</p>
          } @else if (promotions().length === 0) {
            <p class="muted">No promotions yet.</p>
          } @else {
            @if (activePromotions().length) {
              <h4 class="promo-section-title">Active</h4>
              <div class="promo-list">
                @for (p of activePromotions(); track p.id) {
                  <div class="promo-card">
                    <div class="promo-header">
                      <span class="promo-label">{{ p.label }}</span>
                      <span class="promo-trigger">{{ p.triggerType || 'promo_code' }}</span>
                      <span class="promo-value">{{ p.value }}{{ p.valueType === 'percent' ? '%' : ' RM' }}</span>
                    </div>
                    @if (p.description) {
                      <p class="muted promo-desc">{{ p.description }}</p>
                    }
                    <div class="promo-meta">
                      {{ p.active ? 'Active' : 'Inactive' }} ·
                      {{ p.usedCount }}/{{ p.maxUses ?? '∞' }} uses ·
                      @if (p.endDate) { Ends {{ p.endDate | date:'shortDate' }} }
                      @else { No end date }
                    </div>
                    <div class="promo-actions">
                      <button class="btn-ghost btn-sm" (click)="editPromo(p)">Edit</button>
                      <button class="btn-ghost btn-sm" (click)="togglePromo(p)">{{ p.active ? 'Deactivate' : 'Activate' }}</button>
                    </div>
                  </div>
                }
              </div>
            }

            @if (inactivePromotions().length) {
              <h4 class="promo-section-title">Inactive</h4>
              <div class="promo-list">
                @for (p of inactivePromotions(); track p.id) {
                  <div class="promo-card">
                    <div class="promo-header">
                      <span class="promo-label">{{ p.label }}</span>
                      <span class="promo-trigger">{{ p.triggerType || 'promo_code' }}</span>
                      <span class="promo-value">{{ p.value }}{{ p.valueType === 'percent' ? '%' : ' RM' }}</span>
                    </div>
                    @if (p.description) {
                      <p class="muted promo-desc">{{ p.description }}</p>
                    }
                    <div class="promo-meta">
                      Inactive ·
                      {{ p.usedCount }}/{{ p.maxUses ?? '∞' }} uses ·
                      @if (p.endDate) { Ends {{ p.endDate | date:'shortDate' }} }
                      @else { No end date }
                    </div>
                    <div class="promo-actions">
                      <button class="btn-ghost btn-sm" (click)="editPromo(p)">Edit</button>
                      <button class="btn-ghost btn-sm" (click)="togglePromo(p)">Activate</button>
                    </div>
                  </div>
                }
              </div>
            }
          }
        </section>

        @if (promoModalOpen()) {
          <app-modal [open]="true" [title]="promoEditTarget() ? 'Edit Promotion' : 'Add Promotion'" [wide]="true" (closed)="promoModalOpen.set(false)">
            <form class="promo-form" (ngSubmit)="savePromo()">
              <label>Label *
                <input [(ngModel)]="promoForm.label" name="pLabel" placeholder="e.g. Welcome Bonus" />
              </label>
              <label>Description
                <textarea [(ngModel)]="promoForm.description" name="pDesc" rows="2" placeholder="Brief description…"></textarea>
              </label>
              <div class="promo-form-row">
                <label>Trigger type *
                  <select [(ngModel)]="promoForm.triggerType" name="pTrigger" (change)="onPromoTriggerChange()">
                    <option value="topup_any">Top-up (any amount)</option>
                    <option value="topup_min_amount">Top-up min amount</option>
                    <option value="first_topup">First top-up</option>
                    <option value="order_percent">Order % discount</option>
                    <option value="order_fixed_discount">Order fixed discount</option>
                    <option value="first_booking">First booking</option>
                    <option value="nth_booking">Nth booking</option>
                    <option value="booking_min_amount">Booking min amount</option>
                    <option value="category_booking">Category booking</option>
                    <option value="signup_bonus">Signup bonus</option>
                    <option value="referral_giver">Referral giver</option>
                    <option value="referral_receiver">Referral receiver</option>
                    <option value="seasonal_percent">Seasonal percent</option>
                    <option value="seasonal_fixed">Seasonal fixed</option>
                  </select>
                </label>
                <label>Value type
                  <select [(ngModel)]="promoForm.valueType" name="pDiscType">
                    <option value="percent">Percent (%)</option>
                    <option value="fixed">Fixed (RM)</option>
                  </select>
                </label>
                <label>Value *
                  <input type="number" min="0" step="0.01" [(ngModel)]="promoForm.value" name="pVal" />
                </label>
              </div>

              @if (promoForm.triggerType === 'topup_min_amount') {
                <label>Min amount (RM)
                  <input type="number" min="0" [(ngModel)]="promoForm.minAmount" name="pMinAmt" />
                </label>
              }
              @if (promoForm.triggerType === 'category_booking') {
                <label>Category
                  <select [(ngModel)]="promoForm.categoryId" name="pCat">
                    <option value=""> - Select - </option>
                    @for (cat of categories(); track cat.id) {
                      <option [value]="cat.id">{{ cat.name }}</option>
                    }
                  </select>
                </label>
              }
              @if (promoForm.triggerType === 'nth_booking') {
                <label>Nth number
                  <input type="number" min="1" [(ngModel)]="promoForm.nthNumber" name="pNth" />
                </label>
              }
              @if (promoForm.triggerType === 'booking_min_amount') {
                <label>Min booking amount (RM)
                  <input type="number" min="0" [(ngModel)]="promoForm.minBookingAmount" name="pMinBk" />
                </label>
              }

              <div class="promo-form-row">
                <label>Target role
                  <select [(ngModel)]="promoForm.targetRole" name="pRole">
                    <option value="all">All</option>
                    <option value="customer">Customers</option>
                    <option value="servicer">Servicers</option>
                  </select>
                </label>
                <label>Max uses
                  <input type="number" min="0" [(ngModel)]="promoForm.maxUses" name="pMaxUses" placeholder="∞" />
                </label>
                <label>Per user
                  <input type="number" min="1" [(ngModel)]="promoForm.maxPerUser" name="pPerUser" />
                </label>
              </div>
              @if (promoForm.triggerType === 'seasonal_percent' || promoForm.triggerType === 'seasonal_fixed' || promoForm.triggerType === 'topup_min_amount') {
                <div class="promo-form-row">
                  @if (promoForm.triggerType === 'seasonal_percent' || promoForm.triggerType === 'seasonal_fixed') {
                    <label>Start date
                      <input type="date" [(ngModel)]="promoForm.startDate" name="pStart" />
                    </label>
                  }
                  <label>End date
                    <input type="date" [(ngModel)]="promoForm.endDate" name="pEnd" />
                  </label>
                </div>
              }
              @if (promoForm.triggerType !== 'seasonal_percent' && promoForm.triggerType !== 'seasonal_fixed') {
                <div class="promo-form-row">
                  <label>End date
                    <input type="date" [(ngModel)]="promoForm.endDate" name="pEnd2" />
                  </label>
                </div>
              }

              @if (promoSavingError()) {
                <p class="err">{{ promoSavingError() }}</p>
              }
              <div class="modal-actions">
                <button type="button" class="btn-ghost" (click)="promoModalOpen.set(false)">Cancel</button>
                <button type="submit" class="btn-primary" [disabled]="promoSaving()">
                  {{ promoSaving() ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </form>
          </app-modal>
        }
      }

      <!-- ── Ban email modal ── -->
      @if (banModalOpen()) {
        <app-modal [open]="true" title="Ban email" (closed)="banModalOpen.set(false)">
          <form class="ban-form" (ngSubmit)="doBan()">
            <label>Email *
              <input type="email" [(ngModel)]="banForm.email" name="banEmail" required placeholder="spammer@example.com" />
            </label>
            <label>Reason
              <input type="text" [(ngModel)]="banForm.reason" name="banReason" placeholder="(optional)" />
            </label>
            @if (banError()) { <p class="err">{{ banError() }}</p> }
            <div class="modal-actions">
              <button type="button" class="btn-ghost" (click)="banModalOpen.set(false)">Cancel</button>
              <button type="submit" class="btn-primary" [disabled]="banning()">{{ banning() ? 'Banning…' : 'Ban' }}</button>
            </div>
          </form>
        </app-modal>
      }

      <!-- ── Unban confirm modal ── -->
      @if (unbanTarget(); as t) {
        <app-modal [open]="true" title="Unban email?" (closed)="unbanTarget.set(null)">
          <p><strong>{{ t.email }}</strong> will be allowed to register again.</p>
          @if (unbanError()) { <p class="err">{{ unbanError() }}</p> }
          <div class="modal-actions">
            <button class="btn-ghost" (click)="unbanTarget.set(null)">Cancel</button>
            <button class="btn-primary" (click)="doUnban(t)" [disabled]="unbanning()">{{ unbanning() ? 'Unbanning…' : 'Unban' }}</button>
          </div>
        </app-modal>
      }
    }
  `,
    styles: [
        `
      section { max-width: 620px; }
      h2 { margin-top: 0; font-size: 1.05rem; }
      .tabs {
        display: flex;
        gap: 0.4rem;
        margin-bottom: 1rem;
        flex-wrap: wrap;
      }
      .tab {
        background: transparent;
        border: none;
        border-radius: 999px;
        padding: 0.6rem 1.2rem;
        font-size: 0.92rem;
        font-weight: 500;
        color: var(--color-muted);
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .tab:hover:not(.active) { color: var(--color-text); background: var(--color-bg); }
      .tab.active { background: var(--color-primary); background: var(--gradient-sidebar); color: #fff; font-weight: 600; box-shadow: 0 1px 6px rgba(201, 90, 60, 0.2); }
      .cat-select {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.9rem;
        font-weight: 500;
        margin-bottom: 1rem;
      }
      .range-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
      .range-row input { width: 110px; }
      .charge-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
      .charge-row input { width: 110px; }
      .discount-row { display: flex; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
      .discount-row label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; font-weight: 500; }
      .discount-row input, .discount-row select { width: 130px; }
      .actions { margin-top: 1rem; }
      .set-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.7rem 0;
        border-bottom: 1px solid var(--color-border);
        flex-wrap: wrap;
      }
      .set-row:last-of-type { border-bottom: none; }
      .set-info { display: flex; flex-direction: column; gap: 0.15rem; min-width: 220px; flex: 1; }
      .set-info strong { font-size: 0.92rem; }
      .set-info .muted { font-size: 0.78rem; }
      .set-edit { display: flex; align-items: center; gap: 0.4rem; }
      .set-edit input { width: 90px; }
      .affix { font-size: 0.82rem; color: var(--color-muted); }
      .row-msg { font-size: 0.8rem; color: var(--color-success); margin-top: 0.3rem; width: 100%; }
      .row-msg.err, .err { color: var(--color-danger); }
      /* ── Thumbnails ── */
      .thumb-list { display: flex; flex-direction: column; gap: 0.5rem; }
      .thumb-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0; border-bottom: 1px solid var(--color-border); }
      .thumb-row:last-of-type { border-bottom: none; }
      .thumb-preview {
        width: 80px; height: 80px; border-radius: var(--radius);
        background: var(--color-bg); display: flex; align-items: center;
        justify-content: center; flex-shrink: 0; overflow: hidden;
        border: 1px solid var(--color-border);
      }
      .thumb-img { width: 100%; height: 100%; object-fit: cover; }
      .thumb-empty { font-size: 0.72rem; color: var(--color-muted); text-align: center; }
      .thumb-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.4rem; }
      .thumb-name { font-size: 0.92rem; }
      .thumb-acts { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      .thumb-upload-btn { cursor: pointer; display: inline-flex; }
      .thumb-upload-btn input { display: none; }
      .btn-xs { font-size: 0.75rem; padding: 0.625rem 0.7rem; }
      .btn-xs.disabled { opacity: 0.5; pointer-events: none; }
      /* ── Time slots (Categories tab) ── */
      .slot-cat-list { display: flex; flex-direction: column; gap: 0; }
      .slot-cat-row {
        display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
        padding: 0.65rem 0; border-bottom: 1px solid var(--color-border);
      }
      .slot-cat-row:last-of-type { border-bottom: none; }
      .slot-cat-name { font-size: 0.9rem; min-width: 140px; }
      .slot-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; flex: 1; }
      .slot-chip {
        display: inline-flex; align-items: center; gap: 0.25rem;
        padding: 0.2rem 0.55rem; border-radius: 999px; border: 1px solid var(--color-border);
        font-size: 0.75rem; cursor: pointer; color: var(--color-muted);
        background: transparent; transition: background var(--transition), color var(--transition), border-color var(--transition);
        user-select: none;
      }
      .slot-chip.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
      .slot-cat-actions { display: flex; align-items: center; gap: 0.4rem; }
      /* ── Condo textarea ── */
      .condo-textarea {
        width: 100%; max-width: 480px; padding: 0.5rem; font-size: 0.88rem;
        border: 1px solid var(--color-border); border-radius: var(--radius);
        background: var(--color-surface); color: var(--color-text);
        font-family: inherit; resize: vertical; outline: none;
      }
      .condo-textarea:focus { border-color: var(--color-primary); }
      /* ── Banned tab ── */
      .ban-toolbar { display: flex; gap: 0.5rem; margin-bottom: 1rem; align-items: center; }
      .ban-search { flex: 1; max-width: 320px; }
      .ban-empty { padding: 1.5rem 0; text-align: center; }
      .ban-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
      .ban-table th, .ban-table td { text-align: left; padding: 0.5rem 0.4rem; border-bottom: 1px solid var(--color-border); }
      .ban-email { font-weight: 600; font-family: monospace; font-size: 0.82rem; }
      .ban-reason { color: var(--color-muted); }
      .ban-form { display: flex; flex-direction: column; gap: 0.7rem; }
      /* ── Location tab ── */
      .loc-section { max-width: 700px; }
      .loc-toolbar { display: flex; gap: 0.5rem; margin-bottom: 1rem; align-items: center; flex-wrap: wrap; }
      .loc-search { flex: 1; min-width: 200px; max-width: 320px; }
      .loc-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
      .loc-table th, .loc-table td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid var(--color-border); }
      .loc-table th { font-size: 0.78rem; font-weight: 600; color: var(--color-muted); }
      .loc-code { font-family: monospace; font-weight: 600; font-size: 0.85rem; }
      .loc-acts { display: flex; gap: 0.35rem; }
      .loc-pagination { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.75rem; }
      .loc-import { display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--color-border); }
      .pc-form { display: flex; flex-direction: column; gap: 0.7rem; }
      .pc-form label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; font-weight: 500; }
      /* ── Promotions tab ── */
      .promo-toolbar { display: flex; gap: 0.5rem; margin-bottom: 1rem; align-items: center; }
      .promo-search { flex: 1; max-width: 320px; }
      .promo-section-title { margin: 1rem 0 0.5rem; font-size: 0.95rem; }
      .promo-list { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1rem; }
      .promo-card {
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 0.8rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .promo-header { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
      .promo-label { font-weight: 600; font-size: 0.92rem; }
      .promo-trigger {
        font-size: 0.72rem;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.1rem 0.5rem;
        color: var(--color-muted);
        font-family: monospace;
      }
      .promo-value { font-weight: 700; color: var(--color-primary); font-size: 0.95rem; margin-left: auto; }
      .promo-desc { font-size: 0.82rem; margin: 0; }
      .promo-meta { font-size: 0.78rem; color: var(--color-muted); }
      .promo-actions { display: flex; gap: 0.4rem; margin-top: 0.2rem; }
      .btn-sm { font-size: 0.78rem; padding: 0.625rem 0.7rem; }
      .promo-form { display: flex; flex-direction: column; gap: 0.7rem; }
      .promo-form label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; font-weight: 500; }
      .promo-form-row { display: flex; gap: 0.7rem; flex-wrap: wrap; }
      .promo-form-row label { flex: 1; min-width: 100px; }
      .promo-form textarea { resize: vertical; }
      .small { font-size: 0.78rem; }
    `,
    ]
})
export class AdminSettingsComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private pin = inject(PinService);

  tab = signal<Tab>('general');

  categories = signal<Category[]>([]);
  selectedCategoryId = signal('');
  loading = signal(true);
  loadFailed = signal(false);

  readonly ALL_TIME_SLOTS = ALL_TIME_SLOTS;
  readonly TIME_SLOT_LABELS = TIME_SLOT_LABELS;

  private editableSlots = signal<Map<string, Set<string>>>(new Map());

  catTimeSlots(catId: string): (slot: string) => boolean {
    return (slot: string) => this.editableSlots().get(catId)?.has(slot)
      ?? this.categories().find((c) => c.id === catId)?.allowedTimeSlots?.includes(slot)
      ?? true;
  }

  savingTimeSlots = signal<Set<string>>(new Set());
  timeSlotMsg = signal<{ id: string; text: string; error: boolean } | null>(null);

  condoEntryNote = signal('');
  savingCondoNote = signal(false);
  condoMsg = signal<{ text: string; error: boolean } | null>(null);

  // ── Location (Postcodes) ───────────────────────────────────────────────────
  postcodes = signal<Postcode[]>([]);
  postcodeSearch = signal('');
  loadingPostcodes = signal(false);
  postcodeLoadError = signal('');
  postcodePage = signal(1);

  filteredPostcodes = computed(() => {
    const q = this.postcodeSearch().toLowerCase().trim();
    if (!q) return this.postcodes();
    return this.postcodes().filter((p) =>
      p.postcode.toLowerCase().includes(q) ||
      p.district.toLowerCase().includes(q) ||
      p.state.toLowerCase().includes(q),
    );
  });

  totalPostcodePages = computed(() =>
    Math.max(1, Math.ceil(this.filteredPostcodes().length / POSTCODES_PER_PAGE)),
  );

  pagedPostcodes = computed(() => {
    const start = (this.postcodePage() - 1) * POSTCODES_PER_PAGE;
    return this.filteredPostcodes().slice(start, start + POSTCODES_PER_PAGE);
  });

  postcodeModalOpen = signal(false);
  postcodeEditTarget = signal<Postcode | null>(null);
  postcodeForm = { postcode: '', district: '', state: '' };
  savingPostcode = signal(false);
  postcodeSaveError = signal('');

  deletePostcodeTarget = signal<Postcode | null>(null);
  deletingPostcode = signal(false);
  postcodeDeleteError = signal('');

  loadPostcodes(): void {
    if (this.loadingPostcodes()) return;
    this.loadingPostcodes.set(true);
    this.postcodeLoadError.set('');
    this.api.get<{ data: Postcode[] }>('/admin/postcodes').subscribe({
      next: (r) => {
        this.postcodes.set(r.data ?? []);
        this.loadingPostcodes.set(false);
      },
      error: (e) => {
        this.loadingPostcodes.set(false);
        this.postcodeLoadError.set(e.message ?? 'Could not load postcodes.');
      },
    });
  }

  openPostcodeModal(): void {
    this.postcodeEditTarget.set(null);
    this.postcodeForm = { postcode: '', district: '', state: '' };
    this.postcodeSaveError.set('');
    this.postcodeModalOpen.set(true);
  }

  openEditPostcodeModal(p: Postcode): void {
    this.postcodeEditTarget.set(p);
    this.postcodeForm = { postcode: p.postcode, district: p.district, state: p.state };
    this.postcodeSaveError.set('');
    this.postcodeModalOpen.set(true);
  }

  savePostcode(): void {
    const f = this.postcodeForm;
    if (!f.postcode.trim() || !f.district.trim() || !f.state.trim()) {
      this.postcodeSaveError.set('All fields are required.');
      return;
    }
    this.postcodeSaveError.set('');
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingPostcode.set(true);
      const edit = this.postcodeEditTarget();
      const request = edit
        ? this.api.patch(`/admin/postcodes/${edit.postcode}`, { district: f.district.trim(), state: f.state.trim() }, { 'x-action-pin': pin })
        : this.api.post('/admin/postcodes', { postcode: f.postcode.trim(), district: f.district.trim(), state: f.state.trim() }, { 'x-action-pin': pin });
      request.subscribe({
        next: () => {
          this.savingPostcode.set(false);
          this.postcodeModalOpen.set(false);
          this.loadPostcodes();
        },
        error: (e) => {
          this.savingPostcode.set(false);
          this.postcodeSaveError.set(e.message ?? 'Save failed.');
        },
      });
    });
  }

  doDeletePostcode(p: Postcode): void {
    this.postcodeDeleteError.set('');
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.deletingPostcode.set(true);
      this.api.delete(`/admin/postcodes/${p.postcode}`, { 'x-action-pin': pin }).subscribe({
        next: () => {
          this.deletingPostcode.set(false);
          this.deletePostcodeTarget.set(null);
          this.loadPostcodes();
        },
        error: (e) => {
          this.deletingPostcode.set(false);
          this.postcodeDeleteError.set(e.message ?? 'Delete failed.');
        },
      });
    });
  }

  // ── Banned accounts ───────────────────────────────────────────────────────
  banQuery = signal('');
  bannedEmails = signal<BannedEmail[]>([]);
  filteredBanned = computed(() => {
    const q = this.banQuery().toLowerCase().trim();
    if (!q) return this.bannedEmails();
    return this.bannedEmails().filter((b) => b.email.toLowerCase().includes(q));
  });
  banModalOpen = signal(false);
  banForm = { email: '', reason: '' };
  banError = signal('');
  banning = signal(false);
  unbanTarget = signal<BannedEmail | null>(null);
  unbanError = signal('');
  unbanning = signal(false);

  // ── Promotions ────────────────────────────────────────────────────────────
  promotions = signal<AdminPromotion[]>([]);
  promoQuery = signal('');
  loadingPromotions = signal(false);
  promoModalOpen = signal(false);
  promoEditTarget = signal<AdminPromotion | null>(null);
  promoSaving = signal(false);
  promoSavingError = signal('');

  activePromotions = computed(() => {
    const q = this.promoQuery().toLowerCase().trim();
    const all = this.promotions().filter((p) => p.active);
    if (!q) return all;
    return all.filter((p) => p.label.toLowerCase().includes(q));
  });

  inactivePromotions = computed(() => {
    const q = this.promoQuery().toLowerCase().trim();
    const all = this.promotions().filter((p) => !p.active);
    if (!q) return all;
    return all.filter((p) => p.label.toLowerCase().includes(q));
  });

  promoForm = {
    label: '',
    description: '',
    triggerType: 'topup_min_amount',
    valueType: 'percent' as 'percent' | 'fixed',
    value: null as number | null,
    minAmount: null as number | null,
    categoryId: '',
    nthNumber: null as number | null,
    minBookingAmount: null as number | null,
    targetRole: 'all',
    maxUses: null as number | null,
    maxPerUser: 1,
    startDate: '',
    endDate: '',
  };

  loadPromotions(): void {
    this.loadingPromotions.set(true);
    this.api.get<{ data: AdminPromotion[] }>('/admin/promotions').subscribe({
      next: (r) => { this.promotions.set(r.data ?? []); this.loadingPromotions.set(false); },
      error: () => this.loadingPromotions.set(false),
    });
  }

  openPromoModal(): void {
    this.promoEditTarget.set(null);
    this.promoForm = {
      label: '', description: '', triggerType: 'topup_min_amount',
      valueType: 'percent', value: null, minAmount: null,
      categoryId: '', nthNumber: null, minBookingAmount: null,
      targetRole: 'all', maxUses: null, maxPerUser: 1,
      startDate: '', endDate: '',
    };
    this.promoSavingError.set('');
    this.promoModalOpen.set(true);
  }

  editPromo(p: AdminPromotion): void {
    this.promoEditTarget.set(p);
    this.promoForm = {
      label: p.label,
      description: p.description ?? '',
      triggerType: p.triggerType,
      valueType: p.valueType,
      value: p.value,
      minAmount: (p.conditions?.['minAmount'] as number | null) ?? null,
      categoryId: (p.conditions?.['categoryId'] as string) ?? '',
      nthNumber: (p.conditions?.['nthNumber'] as number | null) ?? null,
      minBookingAmount: (p.conditions?.['minBookingAmount'] as number | null) ?? null,
      targetRole: p.targetRole ?? 'all',
      maxUses: p.maxUses ?? null,
      maxPerUser: p.maxPerUser ?? 1,
      startDate: p.startDate ? p.startDate.slice(0, 10) : '',
      endDate: p.endDate ? p.endDate.slice(0, 10) : '',
    };
    this.promoSavingError.set('');
    this.promoModalOpen.set(true);
  }

  onPromoTriggerChange(): void {
    this.promoForm.minAmount = null;
    this.promoForm.categoryId = '';
    this.promoForm.nthNumber = null;
    this.promoForm.minBookingAmount = null;
    this.promoForm.startDate = '';
    this.promoForm.endDate = '';
  }

  savePromo(): void {
    this.promoSavingError.set('');
    const f = this.promoForm;
    if (!f.label.trim()) { this.promoSavingError.set('Label is required.'); return; }
    if (f.value == null || f.value <= 0) { this.promoSavingError.set('Value is required.'); return; }

    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;

      const conditions: Record<string, unknown> = {};
      if (f.minAmount != null) conditions['minAmount'] = f.minAmount;
      if (f.categoryId) conditions['categoryId'] = f.categoryId;
      if (f.nthNumber != null) conditions['nthNumber'] = f.nthNumber;
      if (f.minBookingAmount != null) conditions['minBookingAmount'] = f.minBookingAmount;

      const body: Record<string, unknown> = {
        label: f.label.trim(),
        description: f.description.trim() || undefined,
        triggerType: f.triggerType,
        valueType: f.valueType,
        value: f.value,
        conditions: Object.keys(conditions).length ? conditions : undefined,
        targetRole: f.targetRole,
        maxUses: f.maxUses || null,
        maxPerUser: f.maxPerUser ?? 1,
        startDate: f.startDate || null,
        endDate: f.endDate || null,
      };

      this.promoSaving.set(true);
      const edit = this.promoEditTarget();
      const request = edit
        ? this.api.patch(`/admin/promotions/${edit.id}`, body, { 'x-action-pin': pin })
        : this.api.post('/admin/promotions', body, { 'x-action-pin': pin });

      request.subscribe({
        next: () => {
          this.promoSaving.set(false);
          this.promoModalOpen.set(false);
          this.loadPromotions();
        },
        error: (e) => {
          this.promoSaving.set(false);
          this.promoSavingError.set(e.message ?? 'Save failed.');
        },
      });
    });
  }

  togglePromo(p: AdminPromotion): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.api.patch(`/admin/promotions/${p.id}`, { active: !p.active }, { 'x-action-pin': pin }).subscribe({
        next: () => this.loadPromotions(),
        error: () => {},
      });
    });
  }

  // ── Thumbnails ────────────────────────────────────────────────────────────
  uploading = signal<Set<string>>(new Set());

  // ── Budget ranges (Categories tab) ───────────────────────────────────────
  currentRanges = signal<RangeRow[]>([]);
  saving = signal(false);
  message = signal('');
  isError = signal(false);
  private rawBudgetRanges = signal<RangeRow[] | Record<string, RangeRow[]> | null>(null);

  categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map((c) => ({ value: c.id, label: c.name + this.categoryRange(c.id) })),
  );

  readonly numSettings = NUM_SETTINGS;
  numModel: Record<string, number | null> = {};
  savingKey = signal<string | null>(null);
  msg = signal<{ key: string; text: string; error: boolean } | null>(null);

  private feeRateRaw: Record<string, unknown> = {};
  feeRatePct: number | null = null;

  notifSoundEnabled = signal(true);
  chatSoundEnabled = signal(true);
  typingSoundEnabled = signal(true);

  discount = { type: 'fixed' as 'fixed' | 'percent', value: null as number | null, expires: null as number | null };

  settingsFor(tab: Tab): NumSetting[] {
    return this.numSettings.filter((s) => s.tab === tab);
  }

  categoryRange(id: string): string {
    const map = this.rawBudgetRanges();
    const ranges = map && !Array.isArray(map) ? map[id] : Array.isArray(map) ? map : undefined;
    if (!ranges || ranges.length === 0) return '';
    const lo = Math.min(...ranges.map((r) => Number(r.min) || 0));
    const capped = ranges.filter((r) => r.max != null).map((r) => Number(r.max));
    const hi = capped.length ? Math.max(...capped) : null;
    const open = ranges.some((r) => r.max == null);
    if (hi == null) return ` - RM ${lo}+`;
    return open ? ` - RM ${lo}–${hi}+` : ` - RM ${lo}–${hi}`;
  }

  ngOnInit(): void {
    this.api.get<{ data: Category[] }>('/categories').subscribe({
      next: (r) => this.categories.set(r.data ?? []),
      error: () => {},
    });

    this.loadBanned();

    this.api.get<{ data: { key: string; value: unknown }[] }>('/admin/settings').subscribe({
      next: (r) => {
        const byKey = new Map(r.data.map((s) => [s.key, s.value]));

        const br = byKey.get('budget_ranges') as BudgetRangesData | undefined;
        if (br) this.rawBudgetRanges.set(br.ranges);

        for (const s of this.numSettings) {
          const v = byKey.get(s.key) as Record<string, number> | undefined;
          const raw = v?.[s.prop];
          this.numModel[s.key] = raw == null ? null : s.kind === 'percent' ? round2(raw * 100) : raw;
        }

        const fr = byKey.get('platform_fee_rate') as Record<string, unknown> | undefined;
        if (fr) {
          this.feeRateRaw = fr;
          this.feeRatePct = typeof fr['current_rate'] === 'number' ? round2((fr['current_rate'] as number) * 100) : null;
        }

        const ns = byKey.get('notification_sound_enabled');
        if (ns != null) this.notifSoundEnabled.set(ns === true);

        const cs = byKey.get('chat_sound_enabled');
        if (cs != null) this.chatSoundEnabled.set(cs === true);

        const ts = byKey.get('typing_sound_enabled');
        if (ts != null) this.typingSoundEnabled.set(ts === true);

        const cn = byKey.get('condo_entry_note');
        if (cn != null) this.condoEntryNote.set(cn as string);

        const dc = byKey.get('no_response_discount') as
          | { discount_type?: 'fixed' | 'percent'; value?: number; expires_in_days?: number }
          | undefined;
        if (dc) {
          this.discount.type = dc.discount_type ?? 'fixed';
          this.discount.value = dc.value ?? null;
          this.discount.expires = dc.expires_in_days ?? null;
        }

        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  // ── Budget ranges ─────────────────────────────────────────────────────────
  selectCategory(id: string): void {
    this.selectedCategoryId.set(id);
    if (!id) {
      this.currentRanges.set([]);
      return;
    }
    const raw = this.rawBudgetRanges();
    if (raw && !Array.isArray(raw)) {
      const ranges = raw[id];
      this.currentRanges.set((ranges ?? []).map((r) => ({ min: r.min, max: r.max })));
    } else if (Array.isArray(raw)) {
      this.currentRanges.set(raw.map((r) => ({ min: r.min, max: r.max })));
    } else {
      this.currentRanges.set([]);
    }
  }

  addRange(): void {
    this.currentRanges.update((rs) => [...rs, { min: 0, max: null }]);
  }

  removeRange(i: number): void {
    this.currentRanges.update((rs) => rs.filter((_, idx) => idx !== i));
  }

  save(): void {
    const catId = this.selectedCategoryId();
    if (!catId) return;
    const ranges = this.currentRanges()
      .map((r) => ({
        min: Number(r.min) || 0,
        max: r.max === null || (r.max as unknown) === '' ? null : Number(r.max),
      }))
      .sort((a, b) => a.min - b.min);
    if (ranges.length === 0) {
      this.isError.set(true);
      this.message.set('Add at least one budget range.');
      return;
    }
    this.message.set('');
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.saving.set(true);
      const allRanges: Record<string, RangeRow[]> = {};
      const existing = this.rawBudgetRanges();
      if (existing && !Array.isArray(existing)) {
        Object.assign(allRanges, existing);
      }
      allRanges[catId] = ranges;
      this.api
        .patch('/admin/settings', { key: 'budget_ranges', value: { ranges: allRanges } }, { 'x-action-pin': pin })
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.isError.set(false);
            this.rawBudgetRanges.set(allRanges);
            this.message.set('Budget ranges saved.');
          },
          error: (e) => {
            this.saving.set(false);
            this.isError.set(true);
            this.message.set(e.message ?? 'Could not save settings');
          },
        });
    });
  }

  // ── Generic numeric setting save ─────────────────────────────────────────
  saveNum(s: NumSetting): void {
    const raw = this.numModel[s.key];
    if (raw == null || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      this.msg.set({ key: s.key, text: 'Enter a valid value.', error: true });
      return;
    }
    const stored = s.kind === 'percent' ? Number(raw) / 100 : Number(raw);
    this.persist(s.key, { [s.prop]: stored });
  }

  saveFeeRate(): void {
    if (this.feeRatePct == null || !Number.isFinite(Number(this.feeRatePct)) || Number(this.feeRatePct) < 0) {
      this.msg.set({ key: 'platform_fee_rate', text: 'Enter a valid rate.', error: true });
      return;
    }
    this.persist('platform_fee_rate', { ...this.feeRateRaw, current_rate: Number(this.feeRatePct) / 100 });
  }

  saveNotifSound(): void {
    this.persist('notification_sound_enabled', this.notifSoundEnabled());
  }

  saveChatSound(): void {
    this.persist('chat_sound_enabled', this.chatSoundEnabled());
  }

  saveTypingSound(): void {
    this.persist('typing_sound_enabled', this.typingSoundEnabled());
  }

  saveDiscount(): void {
    const value = Number(this.discount.value);
    const expires = Number(this.discount.expires);
    if (!Number.isFinite(value) || value < 0 || !Number.isFinite(expires) || expires < 1) {
      this.msg.set({ key: 'no_response_discount', text: 'Enter a valid value and expiry.', error: true });
      return;
    }
    this.persist('no_response_discount', { discount_type: this.discount.type, value, expires_in_days: expires });
  }

  saveCondoNote(): void {
    this.condoMsg.set(null);
    const value = this.condoEntryNote().trim() || null;
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingCondoNote.set(true);
      this.api.patch('/admin/settings', { key: 'condo_entry_note', value }, { 'x-action-pin': pin }).subscribe({
        next: () => {
          this.savingCondoNote.set(false);
          this.condoMsg.set({ text: 'Condo note saved.', error: false });
        },
        error: (e) => {
          this.savingCondoNote.set(false);
          this.condoMsg.set({ text: e.message ?? 'Save failed', error: true });
        },
      });
    });
  }

  // ── Thumbnails ────────────────────────────────────────────────────────────
  uploadThumbnail(cat: Category, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.msg.set({ key: 'thumb', text: 'Image must be under 5 MB.', error: true });
      input.value = '';
      return;
    }

    this.uploading.update((s) => new Set(s).add(cat.id));

    this.api
      .post<{ uploadUrl: string; fileId: string }>('/files/presign', {
        purpose: 'category_thumbnail',
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
      })
      .pipe(
        switchMap(({ uploadUrl, fileId }) =>
          this.http.put(uploadUrl, file, {
            headers: { 'Content-Type': file.type || 'image/jpeg' },
          }).pipe(
            switchMap(() => this.api.post<{ fileUrl: string }>(`/files/${fileId}/confirm`, {})),
            switchMap(({ fileUrl }) => this.api.patch(`/admin/categories/${cat.id}`, { imageUrl: fileUrl })),
          ),
        ),
      )
      .subscribe({
        next: () => {
          this.uploading.update((s) => { const n = new Set(s); n.delete(cat.id); return n; });
          this.refreshCategories();
          this.msg.set({ key: 'thumb', text: 'Thumbnail updated.', error: false });
          input.value = '';
        },
        error: (e) => {
          this.uploading.update((s) => { const n = new Set(s); n.delete(cat.id); return n; });
          this.msg.set({ key: 'thumb', text: e.message ?? 'Upload failed.', error: true });
          input.value = '';
        },
      });
  }

  clearThumbnail(cat: Category): void {
    this.uploading.update((s) => new Set(s).add(cat.id));
    this.api.patch(`/admin/categories/${cat.id}`, { imageUrl: null }).subscribe({
      next: () => {
        this.categories.update((list) =>
          list.map((c) => (c.id === cat.id ? { ...c, imageUrl: null } : c)),
        );
        this.uploading.update((s) => { const n = new Set(s); n.delete(cat.id); return n; });
        this.msg.set({ key: 'thumb', text: 'Thumbnail cleared.', error: false });
      },
      error: (e) => {
        this.uploading.update((s) => { const n = new Set(s); n.delete(cat.id); return n; });
        this.msg.set({ key: 'thumb', text: e.message ?? 'Clear failed.', error: true });
      },
    });
  }

  toggleTimeSlot(catId: string, slot: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.editableSlots.update((m) => {
      const next = new Map(m);
      let set = next.get(catId);
      if (!set) {
        set = new Set(this.categories().find((c) => c.id === catId)?.allowedTimeSlots ?? ALL_TIME_SLOTS);
      } else {
        set = new Set(set);
      }
      if (checked) set.add(slot); else set.delete(slot);
      next.set(catId, set);
      return next;
    });
  }

  saveTimeSlots(cat: Category): void {
    this.timeSlotMsg.set(null);
    const slots = this.editableSlots().get(cat.id);
    if (!slots) return;
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingTimeSlots.update((s) => new Set(s).add(cat.id));
      this.api
        .patch(`/admin/categories/${cat.id}`, { allowedTimeSlots: [...slots] }, { 'x-action-pin': pin })
        .subscribe({
          next: () => {
            this.savingTimeSlots.update((s) => { const n = new Set(s); n.delete(cat.id); return n; });
            this.categories.update((list) =>
              list.map((c) => (c.id === cat.id ? { ...c, allowedTimeSlots: [...slots] } : c)),
            );
            this.timeSlotMsg.set({ id: cat.id, text: 'Saved.', error: false });
            this.editableSlots.update((m) => { const next = new Map(m); next.delete(cat.id); return next; });
          },
          error: (e) => {
            this.savingTimeSlots.update((s) => { const n = new Set(s); n.delete(cat.id); return n; });
            this.timeSlotMsg.set({ id: cat.id, text: e.message ?? 'Save failed', error: true });
          },
        });
    });
  }

  // ── Banned accounts ───────────────────────────────────────────────────────
  private loadBanned(): void {
    this.api.get<{ data: BannedEmail[] }>('/admin/banned-emails').subscribe({
      next: (r) => this.bannedEmails.set(r.data ?? []),
      error: () => {},
    });
  }

  openBanModal(): void {
    this.banForm = { email: '', reason: '' };
    this.banError.set('');
    this.banModalOpen.set(true);
  }

  doBan(): void {
    this.banError.set('');
    if (!this.banForm.email.trim()) { this.banError.set('Email is required.'); return; }
    this.banning.set(true);
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) { this.banning.set(false); return; }
      this.api.post('/admin/banned-emails', { email: this.banForm.email.trim(), reason: this.banForm.reason.trim() || undefined }, { 'x-action-pin': pin })
        .subscribe({
          next: () => {
            this.banning.set(false);
            this.banModalOpen.set(false);
            this.loadBanned();
          },
          error: (e) => {
            this.banning.set(false);
            this.banError.set(e.error?.message ?? e.message ?? 'Ban failed.');
          },
        });
    });
  }

  unban(target: BannedEmail): void {
    this.unbanTarget.set(target);
    this.unbanError.set('');
    this.unbanning.set(false);
  }

  doUnban(target: BannedEmail): void {
    this.unbanError.set('');
    this.unbanning.set(true);
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) { this.unbanning.set(false); return; }
      this.api.delete(`/admin/banned-emails/${target.id}`, { 'x-action-pin': pin })
        .subscribe({
          next: () => {
            this.unbanning.set(false);
            this.unbanTarget.set(null);
            this.loadBanned();
          },
          error: (e) => {
            this.unbanning.set(false);
            this.unbanError.set(e.error?.message ?? e.message ?? 'Unban failed.');
          },
        });
    });
  }

  private refreshCategories(): void {
    this.api.get<{ data: Category[] }>('/categories').subscribe({
      next: (r) => this.categories.set(r.data ?? []),
      error: () => {},
    });
  }

  private persist(key: string, value: unknown): void {
    this.msg.set(null);
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingKey.set(key);
      this.api.patch('/admin/settings', { key, value }, { 'x-action-pin': pin }).subscribe({
        next: () => {
          this.savingKey.set(null);
          this.msg.set({ key, text: 'Saved.', error: false });
        },
        error: (e) => {
          this.savingKey.set(null);
          this.msg.set({ key, text: e.message ?? 'Save failed', error: true });
        },
      });
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
