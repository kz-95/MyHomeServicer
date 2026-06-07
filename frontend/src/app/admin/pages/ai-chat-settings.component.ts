import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { PinService } from '../../core/services/pin.service';
import { ModalComponent } from '../../shared/modal.component';
import { environment } from '../../../environments/environment';

interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  sortOrder: number;
  isPublished: boolean;
  tier: string;
}

interface BannedUser {
  id: string;
  name: string;
  email: string;
  chatStrikeCount: number;
  updatedAt: string;
}

interface FaqForm {
  question: string;
  answer: string;
  category: string;
  isPublished: boolean;
  tier: string;
}

type Tab = 'general' | 'faq' | 'admin';

function emptyForm(tier: string): FaqForm {
  return { question: '', answer: '', category: '', isPublished: true, tier };
}

@Component({
    selector: 'app-admin-ai-chat-settings',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, ModalComponent],
    template: `
    <h1>AI Chat Settings</h1>

    <div class="tabs">
      <button class="tab" [class.active]="tab() === 'general'" (click)="tab.set('general')">General</button>
      <button class="tab" [class.active]="tab() === 'faq'" (click)="switchFaqTab('faq')">FAQ</button>
      <button class="tab" [class.active]="tab() === 'admin'" (click)="switchFaqTab('admin')">Admin FAQ</button>
      @if (tab() === 'faq' || tab() === 'admin') {
        <button class="btn-ghost" style="margin-left:auto;font-size:0.82rem" (click)="showBans.set(true); loadBans()">Banned users</button>
      }
    </div>

    <!-- ════════════ GENERAL ════════════ -->
    @if (tab() === 'general') {
      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (loadFailed()) {
        <p class="err">Could not load settings. Refresh and try again.</p>
      } @else {
        <section class="card page-child">
          <h2>General</h2>
          <div class="set-row">
            <div class="set-info"><strong>AI Assistant enabled</strong><span class="muted">Master switch for the AI chat assistant.</span></div>
            <label class="toggle-label"><input type="checkbox" [ngModel]="assistantEnabled()" (ngModelChange)="assistantEnabled.set($event); saveGeneral()" name="assistantEnabled" />{{ assistantEnabled() ? 'On' : 'Off' }}</label>
          </div>
          <div class="set-row">
            <div class="set-info"><strong>Quote assistant enabled</strong><span class="muted">Allow AI to help customers create quote requests.</span></div>
            <label class="toggle-label"><input type="checkbox" [ngModel]="quoteEnabled()" (ngModelChange)="quoteEnabled.set($event); saveGeneral()" name="quoteEnabled" />{{ quoteEnabled() ? 'On' : 'Off' }}</label>
          </div>
          <div class="set-row">
            <div class="set-info"><strong>Profile assistant enabled</strong><span class="muted">Allow AI to help servicers set up their profile.</span></div>
            <label class="toggle-label"><input type="checkbox" [ngModel]="profileEnabled()" (ngModelChange)="profileEnabled.set($event); saveGeneral()" name="profileEnabled" />{{ profileEnabled() ? 'On' : 'Off' }}</label>
          </div>
          <div class="set-row">
            <div class="set-info"><strong>Guest chat enabled</strong><span class="muted">Allow unauthenticated users to use the chat.</span></div>
            <label class="toggle-label"><input type="checkbox" [ngModel]="guestEnabled()" (ngModelChange)="guestEnabled.set($event); saveGeneral()" name="guestEnabled" />{{ guestEnabled() ? 'On' : 'Off' }}</label>
          </div>
          <div class="set-row">
            <div class="set-info"><strong>Chat history limit</strong><span class="muted">Max messages kept per session (10–200).</span></div>
            <div class="set-edit"><input type="number" class="num-input" [ngModel]="historyLimit()" (ngModelChange)="historyLimit.set($event); saveGeneral()" name="historyLimit" min="10" max="200" /></div>
          </div>
          <div class="set-row">
            <div class="set-info"><strong>Auto-open for guests</strong><span class="muted">Auto-open the chat panel for guest visitors.</span></div>
            <label class="toggle-label"><input type="checkbox" [ngModel]="guestAutoOpen()" (ngModelChange)="guestAutoOpen.set($event); saveGeneral()" name="guestAutoOpen" />{{ guestAutoOpen() ? 'On' : 'Off' }}</label>
          </div>
          <div class="set-row">
            <div class="set-info"><strong>Auto-open delay (ms)</strong><span class="muted">Delay before the chat opens for guests.</span></div>
            <div class="set-edit"><input type="number" class="num-input" [ngModel]="autoOpenDelay()" (ngModelChange)="autoOpenDelay.set($event); saveGeneral()" name="autoOpenDelay" min="1000" max="30000" step="500" /></div>
          </div>
        </section>

        <section class="card page-child">
          <h2>System Prompt</h2>
          <div class="content-field">
            <label>Custom instructions<span class="muted">Extra instructions the AI assistant follows.</span>
              <textarea rows="4" [(ngModel)]="customPrompt" name="customPrompt" placeholder="You are a friendly assistant..." maxlength="2000"></textarea>
            </label>
            <div class="actions">
              <button class="btn-primary" (click)="savePrompt()" [disabled]="savingPrompt()">{{ savingPrompt() ? 'Saving…' : 'Save prompt' }}</button>
            </div>
            @if (promptMsg(); as m) { <p [class.err]="m.error" class="row-msg">{{ m.text }}</p> }
          </div>
          <div class="set-row">
            <div class="set-info"><strong>Tone</strong><span class="muted">The assistant's speaking style.</span></div>
            <div class="set-edit">
              <select [ngModel]="tone()" (ngModelChange)="tone.set($event); saveTone()" name="tone">
                <option value="friendly">Friendly</option>
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
              </select>
            </div>
          </div>
        </section>

        <section class="card page-child">
          <h2>Greetings</h2>
          <p class="muted small">Preset greeting messages shown when chat opens. Min 10, max 50.</p>
          <div class="search-row" style="margin-bottom:0.5rem">
            <input placeholder="Search greetings…" [ngModel]="greetingSearch()" (ngModelChange)="greetingSearch.set($event)" aria-label="Search greetings" />
          </div>
          <div class="greeting-list">
            @for (g of filteredGreetings(); track i; let i = $index) {
              <div class="greeting-row">
                <span class="greeting-idx">{{ i + 1 }}</span>
              <input type="text" [ngModel]="g" (ngModelChange)="updateGreetingByValue(g, $event)" name="greeting_{{i}}" placeholder="Enter greeting message" maxlength="500" />
              <button class="icon-btn" (click)="removeGreetingByValue(g)" title="Remove greeting" [disabled]="greetings().length <= 10">&times;</button>
              </div>
            }
          </div>
          @if (greetings().length < 50) {
            <button class="btn-outline" (click)="addGreeting()">+ Add greeting</button>
          }
          <div class="actions">
            <button class="btn-primary" (click)="saveGreetings()" [disabled]="savingGreetings()">{{ savingGreetings() ? 'Saving…' : 'Save greetings' }}</button>
          </div>
          @if (greetingsMsg(); as m) { <p [class.err]="m.error" class="row-msg">{{ m.text }}</p> }
        </section>

        <section class="card page-child">
          <h2>Banned Words</h2>
          <p class="muted small">Words or characters the AI must never use in responses. The AI is instructed to avoid them, and they are filtered server-side as a safety net.</p>
          <div class="search-row" style="margin-bottom:0.5rem">
            <input placeholder="Search banned words…" [ngModel]="bannedWordSearch()" (ngModelChange)="bannedWordSearch.set($event)" aria-label="Search banned words" />
          </div>
          <div class="greeting-list">
            @for (w of filteredBannedWords(); track i; let i = $index) {
              <div class="greeting-row">
                <span class="greeting-idx">{{ i + 1 }}</span>
                <input type="text" [ngModel]="w" (ngModelChange)="updateBannedWord(w, $event)" name="bannedWord_{{i}}" placeholder="Enter banned word or character" maxlength="100" />
                <button class="icon-btn" (click)="removeBannedWord(w)" title="Remove word">&times;</button>
              </div>
            }
          </div>
          @if (bannedWords().length < 200) {
            <button class="btn-outline" (click)="addBannedWord()">+ Add word</button>
          }
          <div class="actions">
            <button class="btn-primary" (click)="saveBannedWords()" [disabled]="savingBannedWords()">{{ savingBannedWords() ? 'Saving…' : 'Save banned words' }}</button>
          </div>
          @if (bannedWordsMsg(); as m) { <p [class.err]="m.error" class="row-msg">{{ m.text }}</p> }
        </section>

        @if (saveMsg(); as m) { <p [class.err]="m.error" class="row-msg global-msg">{{ m.text }}</p> }
      }
    }

    <!-- ════════════ FAQ / ADMIN FAQ ════════════ -->
    @if (tab() === 'faq' || tab() === 'admin') {
      @if (loadFailed()) {
        <div class="card load-err"><p>Could not load entries. <button class="btn-ghost" (click)="load()">Retry</button></p></div>
      } @else {
        <div class="sticky-header">
          <div class="search-row">
            <input placeholder="Search question, answer or category…" [ngModel]="search()" (ngModelChange)="search.set($event)" aria-label="Search entries" />
            <button class="btn-primary" (click)="openCreate()">Add entry</button>
            <button class="btn-ghost" (click)="exportCsv()">Export CSV</button>
            <button class="btn-ghost" (click)="fileInput.click()">Import CSV</button>
            <input #fileInput type="file" accept=".csv" hidden (change)="importCsv($event)" />
          </div>

          <div class="filter-row">
            @if (tab() === 'faq') {
              <div class="filter-group">
                <span class="filter-label">Tier</span>
                <div class="chips">
                  <button class="chip" [class.active]="tierFilter() === ''" (click)="tierFilter.set('')">All</button>
                  <button class="chip" [class.active]="tierFilter() === 'guest'" (click)="tierFilter.set('guest')">Guest</button>
                  <button class="chip" [class.active]="tierFilter() === 'customer'" (click)="tierFilter.set('customer')">Customer</button>
                  <button class="chip" [class.active]="tierFilter() === 'servicer'" (click)="tierFilter.set('servicer')">Servicer</button>
                </div>
              </div>
            }
            <div class="filter-group">
              <span class="filter-label">Status</span>
              <div class="chips">
                <button class="chip" [class.active]="pubFilter() === ''" (click)="pubFilter.set('')">All</button>
                <button class="chip" [class.active]="pubFilter() === 'published'" (click)="pubFilter.set('published')">Published</button>
                <button class="chip" [class.active]="pubFilter() === 'unpublished'" (click)="pubFilter.set('unpublished')">Unpublished</button>
              </div>
            </div>
            <div class="filter-group">
              <span class="filter-label">Category</span>
              <select [ngModel]="catFilter()" (ngModelChange)="catFilter.set($event)" aria-label="Filter by category">
                <option value="">All</option>
                @for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }
              </select>
            </div>
            <span class="muted count">{{ sortedItems().length }} entries</span>
          </div>
        </div>

        @if (importMsg()) { <p [class.err]="importErr()" [class.ok]="!importErr()">{{ importMsg() }}</p> }

        <table class="card page-child">
          <thead>
            <tr>
              <th class="sortable" [class.sorted]="faqSortCol() === 'category'" (click)="sortFaq('category')">Category <span class="sort-ic">{{ faqSortIcon('category') }}</span></th>
              <th class="sortable" [class.sorted]="faqSortCol() === 'question'" (click)="sortFaq('question')">Question <span class="sort-ic">{{ faqSortIcon('question') }}</span></th>
              <th>Answer</th>
              <th class="sortable" [class.sorted]="faqSortCol() === 'tier'" (click)="sortFaq('tier')">Tier <span class="sort-ic">{{ faqSortIcon('tier') }}</span></th>
              <th class="sortable" [class.sorted]="faqSortCol() === 'isPublished'" (click)="sortFaq('isPublished')">Published <span class="sort-ic">{{ faqSortIcon('isPublished') }}</span></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (e of sortedItems(); track e.id) {
              <tr>
                <td class="muted">{{ e.category || ' - ' }}</td>
                <td>{{ e.question }}</td>
                <td class="muted">{{ e.answer.length > 120 ? e.answer.slice(0, 120) + '…' : e.answer }}</td>
                <td><span class="badge badge-tier">{{ e.tier }}</span></td>
                <td><span class="badge" [class.badge-completed]="e.isPublished" [class.badge-cancelled]="!e.isPublished">{{ e.isPublished ? 'Yes' : 'No' }}</span></td>
                <td class="actions">
                  <button class="btn-ghost" (click)="togglePublish(e)">{{ e.isPublished ? 'Unpublish' : 'Publish' }}</button>
                  <button class="btn-ghost" (click)="openEdit(e)">Edit</button>
                  <button class="btn-ghost" (click)="remove(e)">Delete</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="muted">{{ loading() ? 'Loading entries…' : emptyMessage() }}</td></tr>
            }
          </tbody>
        </table>
      }
    }

    <app-modal [open]="!!editingId()" [title]="editingId() && editingId() !== '__new__' ? 'Edit entry' : 'Add entry'" (closed)="closeEdit()">
      <div class="form-v">
        <label>Category <span class="muted">(e.g. payment, category, cancel)</span>
          <input [(ngModel)]="f.category" name="fcat" placeholder="general" />
        </label>
        <label>Audience tier
          <select [(ngModel)]="f.tier" name="ftier">
            <option value="guest">Guest - visible to everyone</option>
            <option value="customer">Customer - customers, servicers, admins</option>
            <option value="servicer">Servicer - servicers and admins</option>
            <option value="admin">Admin - admins only</option>
          </select>
        </label>
        <label>Question<input [(ngModel)]="f.question" name="fq" required /></label>
        <label>Answer<textarea [(ngModel)]="f.answer" name="fa" rows="3" required></textarea></label>
        <label class="row-label"><input type="checkbox" [(ngModel)]="f.isPublished" name="fpub" /> Published</label>
      </div>
      <div class="modal-actions">
        <button class="btn-ghost" (click)="closeEdit()">Cancel</button>
        <button class="btn-primary" [disabled]="saving() || !f.question.trim() || !f.answer.trim()" (click)="save()">{{ saving() ? 'Saving…' : 'Save' }}</button>
      </div>
    </app-modal>

    <app-modal [open]="showBans()" title="Banned chat users" (closed)="showBans.set(false)">
      @if (bansLoading()) { <p class="muted">Loading…</p> }
      @else if (bannedUsers().length === 0) { <p class="muted">No banned users.</p> }
      @else {
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Strikes</th><th>Banned</th><th></th></tr></thead>
          <tbody>
            @for (b of bannedUsers(); track b.id) {
              <tr>
                <td>{{ b.name }}</td>
                <td class="muted">{{ b.email }}</td>
                <td>{{ b.chatStrikeCount }}</td>
                <td class="muted">{{ b.updatedAt | date:'mediumDate' }}</td>
                <td><button class="btn-ghost" (click)="unban(b)" [disabled]="unbanning() === b.id">{{ unbanning() === b.id ? '…' : 'Unban' }}</button></td>
              </tr>
            }
          </tbody>
        </table>
      }
    </app-modal>
  `,
    styles: [`
    :host { display: block; }
    h2 { margin-top: 0; font-size: 1.05rem; }

    .tabs { display: flex; gap: 0; margin-bottom: 1rem; border-bottom: 2px solid var(--color-border); align-items: center; }
    .tab { background: transparent; border: none; border-bottom: 2px solid transparent; margin-bottom: -2px; padding: 0.5rem 1.1rem; font-size: 0.88rem; font-weight: 500; color: var(--color-muted); cursor: pointer; font-family: inherit; transition: color 0.15s ease, border-color 0.15s ease; }
    .tab:hover { color: var(--color-text); }
    .tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); font-weight: 600; }

    section { max-width: 680px; margin-bottom: 1.4rem; }
    .err { color: var(--color-danger); font-size: 0.85rem; }
    .row-msg { font-size: 0.8rem; color: var(--color-success); margin-top: 0.3rem; }
    .row-msg.err { color: var(--color-danger); }
    .global-msg { margin-top: 1rem; }
    .small { font-size: 0.82rem; }

    .set-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.7rem 0; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; }
    .set-row:last-of-type { border-bottom: none; }
    .set-info { display: flex; flex-direction: column; gap: 0.15rem; min-width: 220px; flex: 1; }
    .set-info strong { font-size: 0.92rem; }
    .set-info .muted, .muted { font-size: 0.78rem; }
    .set-edit { display: flex; align-items: center; gap: 0.4rem; }
    .set-edit select { font-size: 0.85rem; padding: 0.3rem 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); color: var(--color-text); }
    .toggle-label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; cursor: pointer; }
    .toggle-label input { width: auto; }
    .num-input { width: 80px; font-size: 0.85rem; padding: 0.3rem 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius); }
    .content-field { padding: 0.7rem 0; border-bottom: 1px solid var(--color-border); }
    .content-field:last-of-type { border-bottom: none; }
    .content-field label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; font-weight: 500; }
    .content-field textarea { width: 100%; max-width: 480px; padding: 0.5rem; font-size: 0.88rem; border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); color: var(--color-text); font-family: inherit; outline: none; resize: vertical; }
    .content-field textarea:focus { border-color: var(--color-primary); }
    .actions { margin-top: 0.5rem; }

    .greeting-list { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.5rem; }
    .greeting-row { display: flex; align-items: center; gap: 0.4rem; }
    .greeting-idx { font-size: 0.82rem; color: var(--color-muted); min-width: 1.5rem; text-align: right; }
    .greeting-row input { flex: 1; max-width: 480px; font-size: 0.85rem; padding: 0.35rem 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius); }
    .icon-btn { background: none; border: none; font-size: 1.2rem; color: var(--color-muted); cursor: pointer; padding: 0.2rem; line-height: 1; }
    .icon-btn:hover { color: var(--color-danger); }
    .icon-btn:disabled { opacity: 0.3; cursor: default; }
    .btn-outline { background: transparent; border: 1px solid var(--color-primary); color: var(--color-primary); padding: 0.625rem 0.7rem; border-radius: var(--radius); cursor: pointer; font-size: 0.85rem; }
    .btn-outline:hover { background: var(--color-primary); color: #fff; }

    .sticky-header { position: sticky; top: 0; z-index: 5; background: var(--color-bg); padding-bottom: 0.6rem; margin-bottom: 0.8rem; border-bottom: 1px solid var(--color-border); }
    .search-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .search-row input[type="text"], .search-row input:not([type]) { flex: 1; min-width: 200px; font-size: 0.9rem; }
    .filter-row { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; align-items: center; padding-top: 0.55rem; }
    .filter-group { display: flex; align-items: center; gap: 0.4rem; }
    .filter-label { font-size: 0.75rem; color: var(--color-muted); font-weight: 500; white-space: nowrap; }
    .filter-group select { font-size: 0.8rem; padding: 0.2rem 0.4rem; }
    .chips { display: flex; gap: 0.2rem; flex-wrap: wrap; }
    .chip { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 999px; padding: 0.625rem 0.8rem; font-size: 0.74rem; font-weight: 500; color: var(--color-muted); cursor: pointer; font-family: inherit; transition: all 0.15s ease; }
    .chip:hover { color: var(--color-text); border-color: var(--color-muted); }
    .chip.active { background: var(--color-primary-light); border-color: var(--color-primary); color: var(--color-primary); }
    .count { margin-left: auto; font-size: 0.78rem; }

    th { text-align: left; padding: 0.5rem 0.5rem; border-bottom: 2px solid var(--color-border); font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--color-muted); }
    td { text-align: left; padding: 0.55rem 0.5rem; border-bottom: 1px solid var(--color-border); }
    tbody tr { transition: background 0.12s ease; }
    tbody tr:hover { background: var(--color-surface); }
    .sortable { cursor: pointer; user-select: none; white-space: nowrap; }
    .sortable:hover { color: var(--color-text); }
    .sortable.sorted { color: var(--color-primary); }
    .sort-ic { font-size: 0.68rem; margin-left: 0.15rem; opacity: 0.35; }
    .sortable.sorted .sort-ic { opacity: 1; }
    .form-v { display: flex; flex-direction: column; gap: 0.7rem; }
    .form-v label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.88rem; font-weight: 500; }
    .form-v input, .form-v textarea { font-size: 0.93rem; }
    .row-label { flex-direction: row !important; align-items: center; gap: 0.4rem; }
    .row-label input { width: auto; }
    .actions { display: flex; gap: 0.3rem; }
    .load-err { text-align: center; padding: 1.5rem; }
    .ok { color: var(--color-success); margin-top: 0.5rem; }
    .badge-tier { font-size: 0.78rem; color: var(--color-muted); }
  `]
})
export class AdminAiChatSettingsComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private pin = inject(PinService);

  tab = signal<Tab>('general');
  loading = signal(true);
  loadFailed = signal(false);

  // ── General settings ──
  assistantEnabled = signal(true);
  quoteEnabled = signal(true);
  profileEnabled = signal(true);
  guestEnabled = signal(true);
  historyLimit = signal(50);
  guestAutoOpen = signal(true);
  autoOpenDelay = signal(3000);
  customPrompt = signal('');
  savingPrompt = signal(false);
  promptMsg = signal<{ text: string; error: boolean } | null>(null);
  tone = signal('friendly');
  greetings = signal<string[]>([]);
  greetingSearch = signal('');
  filteredGreetings = computed(() => {
    const q = this.greetingSearch().toLowerCase().trim();
    const all = this.greetings();
    if (!q) return all;
    return all.filter((g) => g.toLowerCase().includes(q));
  });
  savingGreetings = signal(false);
  greetingsMsg = signal<{ text: string; error: boolean } | null>(null);
  bannedWords = signal<string[]>([]);
  bannedWordSearch = signal('');
  filteredBannedWords = computed(() => {
    const q = this.bannedWordSearch().toLowerCase().trim();
    const all = this.bannedWords();
    if (!q) return all;
    return all.filter((w) => w.toLowerCase().includes(q));
  });
  savingBannedWords = signal(false);
  bannedWordsMsg = signal<{ text: string; error: boolean } | null>(null);
  saveMsg = signal<{ text: string; error: boolean } | null>(null);

  // ── FAQ ──
  items = signal<FaqEntry[]>([]);
  search = signal('');
  tierFilter = signal<string>('');
  pubFilter = signal<string>('');
  catFilter = signal<string>('');
  faqSortCol = signal('');
  faqSortDir = signal<'asc' | 'desc'>('asc');

  categories = computed(() => {
    const set = new Set<string>();
    for (const e of this.items()) if (e.category) set.add(e.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  filtered = computed(() => {
    const t = this.isAdminTab;
    const q = this.search().trim().toLowerCase();
    const tier = this.tierFilter();
    const pub = this.pubFilter();
    const cat = this.catFilter();
    return this.items().filter((e) => {
      const isAdmin = e.tier === 'admin';
      if (t ? !isAdmin : isAdmin) return false;
      if (!t && tier && e.tier !== tier) return false;
      if (pub === 'published' && !e.isPublished) return false;
      if (pub === 'unpublished' && e.isPublished) return false;
      if (cat && (e.category ?? '') !== cat) return false;
      if (q && !`${e.question} ${e.answer} ${e.category ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  sortedItems = computed(() => {
    const col = this.faqSortCol();
    const dir = this.faqSortDir();
    const base = this.filtered();
    if (!col) return base;
    return [...base].sort((a, b) => {
      const av = a[col as keyof FaqEntry] as unknown;
      const bv = b[col as keyof FaqEntry] as unknown;
      if (typeof av === 'boolean' && typeof bv === 'boolean') {
        return dir === 'asc' ? (av ? 1 : 0) - (bv ? 1 : 0) : (bv ? 1 : 0) - (av ? 1 : 0);
      }
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' });
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  editingId = signal<string | null>(null);
  saving = signal(false);
  importMsg = signal('');
  importErr = signal(false);
  f: FaqForm = emptyForm('customer');
  showBans = signal(false);
  bannedUsers = signal<BannedUser[]>([]);
  bansLoading = signal(false);
  unbanning = signal<string | null>(null);

  private get isAdminTab(): boolean { return this.tab() === 'admin'; }

  ngOnInit(): void {
    this.loadSettings();
    this.load();
  }

  switchFaqTab(t: Tab): void {
    this.tab.set(t);
    this.tierFilter.set('');
    if (this.items().length === 0) this.load();
  }

  // ── General CRUD ──

  private loadSettings(): void {
    this.api.get<{ data: Record<string, unknown> }>('/admin/chat/settings').subscribe({
      next: (r) => {
        const d = r.data;
        if (d['chat_assistant_enabled'] != null) this.assistantEnabled.set(d['chat_assistant_enabled'] as boolean);
        if (d['chat_quote_enabled'] != null) this.quoteEnabled.set(d['chat_quote_enabled'] as boolean);
        if (d['chat_profile_enabled'] != null) this.profileEnabled.set(d['chat_profile_enabled'] as boolean);
        if (d['chat_guest_enabled'] != null) this.guestEnabled.set(d['chat_guest_enabled'] as boolean);
        if (d['chat_history_limit'] != null) this.historyLimit.set(d['chat_history_limit'] as number);
        if (d['chat_guest_auto_open'] != null) this.guestAutoOpen.set(d['chat_guest_auto_open'] as boolean);
        if (d['chat_guest_auto_open_delay'] != null) this.autoOpenDelay.set(d['chat_guest_auto_open_delay'] as number);
        if (d['chat_assistant_prompt'] != null) this.customPrompt.set(d['chat_assistant_prompt'] as string);
        if (d['chat_assistant_tone'] != null) this.tone.set(d['chat_assistant_tone'] as string);
        if (d['chat_greetings'] != null) this.greetings.set(d['chat_greetings'] as string[]);
        if (d['chat_banned_words'] != null) this.bannedWords.set(d['chat_banned_words'] as string[]);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.loadFailed.set(true); },
    });
  }

  private persist(key: string, value: unknown, saving?: ReturnType<typeof signal<boolean>>, msg?: ReturnType<typeof signal<{ text: string; error: boolean } | null>>): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      if (saving) saving.set(true);
      if (msg) msg.set(null);
      this.api.patch('/admin/settings', { key, value }, { 'x-action-pin': pin }).subscribe({
        next: () => { if (saving) saving.set(false); if (msg) msg.set({ text: 'Saved.', error: false }); },
        error: (e) => { if (saving) saving.set(false); if (msg) msg.set({ text: e.message ?? 'Save failed', error: true }); },
      });
    });
  }

  saveGeneral(): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      const updates = [
        { key: 'chat_assistant_enabled', value: this.assistantEnabled() },
        { key: 'chat_quote_enabled', value: this.quoteEnabled() },
        { key: 'chat_profile_enabled', value: this.profileEnabled() },
        { key: 'chat_guest_enabled', value: this.guestEnabled() },
        { key: 'chat_history_limit', value: this.historyLimit() },
        { key: 'chat_guest_auto_open', value: this.guestAutoOpen() },
        { key: 'chat_guest_auto_open_delay', value: this.autoOpenDelay() },
      ];
      for (const u of updates) { this.api.patch('/admin/settings', u, { 'x-action-pin': pin }).subscribe({ error: () => {} }); }
      this.saveMsg.set({ text: 'General settings saved.', error: false });
    });
  }

  savePrompt(): void {
    if (this.customPrompt().length > 2000) { this.promptMsg.set({ text: 'Prompt too long (max 2000 characters).', error: true }); return; }
    this.persist('chat_assistant_prompt', this.customPrompt().trim() || null, this.savingPrompt, this.promptMsg);
  }

  saveTone(): void { this.persist('chat_assistant_tone', this.tone(), undefined, undefined); }

  addGreeting(): void { this.greetings.update((g) => [...g, '']); }

  removeGreetingByValue(val: string): void {
    if (this.greetings().length <= 10) return;
    const idx = this.greetings().indexOf(val);
    if (idx === -1) return;
    this.greetings.update((g) => g.filter((_, i) => i !== idx));
  }

  updateGreetingByValue(oldVal: string, newVal: string): void {
    this.greetings.update((g) => g.map((item) => (item === oldVal ? newVal : item)));
  }

  saveGreetings(): void {
    const g = this.greetings().filter(x => x.trim().length > 0);
    if (g.length < 10) { this.greetingsMsg.set({ text: 'At least 10 greetings are required.', error: true }); return; }
    if (g.length > 50) { this.greetingsMsg.set({ text: 'Maximum 50 greetings allowed.', error: true }); return; }
    this.persist('chat_greetings', g, this.savingGreetings, this.greetingsMsg);
  }

  saveBannedWords(): void {
    const words = this.bannedWords().map(w => w.trim()).filter(w => w.length > 0);
    if (words.length > 200) { this.bannedWordsMsg.set({ text: 'Maximum 200 banned words allowed.', error: true }); return; }
    this.persist('chat_banned_words', words, this.savingBannedWords, this.bannedWordsMsg);
  }

  addBannedWord(): void {
    if (this.bannedWords().length >= 200) return;
    this.bannedWords.update((a) => [...a, '']);
  }

  removeBannedWord(val: string): void {
    const idx = this.bannedWords().indexOf(val);
    if (idx === -1) return;
    this.bannedWords.update((a) => a.filter((_, i) => i !== idx));
  }

  updateBannedWord(oldVal: string, newVal: string): void {
    this.bannedWords.update((a) => a.map((item) => (item === oldVal ? newVal : item)));
  }

  // ── FAQ CRUD ──

  load(): void {
    this.loadFailed.set(false);
    this.api.get<{ data: FaqEntry[] }>('/admin/faq').subscribe({
      next: (r) => { this.items.set(r.data); },
      error: () => { this.loadFailed.set(true); },
    });
  }

  emptyMessage(): string {
    return this.items().length === 0 ? 'No entries yet. Add one to give the chatbot knowledge.' : 'No entries match the current filters.';
  }

  sortFaq(col: string): void {
    if (this.faqSortCol() === col) { this.faqSortDir.set(this.faqSortDir() === 'asc' ? 'desc' : 'asc'); }
    else { this.faqSortCol.set(col); this.faqSortDir.set('asc'); }
  }

  faqSortIcon(col: string): string { return this.faqSortCol() === col ? (this.faqSortDir() === 'asc' ? '↑' : '↓') : '⇅'; }

  openCreate(): void {
    this.f = emptyForm(this.isAdminTab ? 'admin' : 'customer');
    this.editingId.set('__new__');
  }

  openEdit(e: FaqEntry): void {
    this.f = { question: e.question, answer: e.answer, category: e.category ?? '', isPublished: e.isPublished, tier: e.tier ?? 'customer' };
    this.editingId.set(e.id);
  }

  closeEdit(): void { this.editingId.set(null); }

  save(): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      const isNew = this.editingId() === '__new__';
      this.saving.set(true);
      const body = { question: this.f.question.trim(), answer: this.f.answer.trim(), category: this.f.category.trim() || null, tier: this.f.tier, isPublished: this.f.isPublished };
      const req = isNew ? this.api.post<FaqEntry>('/admin/faq', body, { 'x-action-pin': pin }) : this.api.patch<FaqEntry>(`/admin/faq/${this.editingId()}`, body, { 'x-action-pin': pin });
      req.subscribe({
        next: (r) => {
          if (isNew) { this.items.update((arr) => [...arr, r as FaqEntry]); }
          else { this.items.update((arr) => arr.map((e) => (e.id === this.editingId() ? { ...e, ...(r as FaqEntry) } : e))); }
          this.saving.set(false); this.closeEdit();
        },
        error: () => { this.saving.set(false); },
      });
    });
  }

  togglePublish(e: FaqEntry): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.api.patch<FaqEntry>(`/admin/faq/${e.id}`, { isPublished: !e.isPublished }, { 'x-action-pin': pin }).subscribe({
        next: (r) => { this.items.update((arr) => arr.map((x) => (x.id === e.id ? { ...x, isPublished: (r as FaqEntry).isPublished } : x))); },
      });
    });
  }

  remove(e: FaqEntry): void {
    if (!confirm(`Delete "${e.question}"?`)) return;
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.http.delete(`${environment.apiBase}/admin/faq/${e.id}`, { headers: { 'x-action-pin': pin } }).subscribe({
        next: () => { this.items.update((arr) => arr.filter((x) => x.id !== e.id)); },
      });
    });
  }

  exportCsv(): void {
    this.http.get(`${environment.apiBase}/admin/faq/csv`, { responseType: 'text' }).subscribe((csv) => {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'faq-export.csv'; a.click();
      URL.revokeObjectURL(url);
    });
  }

  importCsv(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const csv = reader.result as string;
      this.importMsg.set(''); this.importErr.set(false);
      this.api.post<{ updated: number; skipped: number }>('/admin/faq/csv', { csv }).subscribe({
        next: (r) => { this.importMsg.set(`Imported: ${r.updated} updated` + (r.skipped ? `, ${r.skipped} skipped (no match).` : '.')); this.load(); },
        error: (e) => { this.importMsg.set(e.message ?? 'Import failed'); this.importErr.set(true); },
      });
    };
    reader.readAsText(file);
    input.value = '';
  }

  loadBans(): void {
    this.bansLoading.set(true);
    this.api.get<{ data: BannedUser[] }>('/admin/chat-bans').subscribe({
      next: (r) => { this.bannedUsers.set(r.data); this.bansLoading.set(false); },
      error: () => { this.bansLoading.set(false); },
    });
  }

  unban(u: BannedUser): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.unbanning.set(u.id);
      this.http.post(`${environment.apiBase}/admin/chat-bans/${u.id}/unban`, {}, { headers: { 'x-action-pin': pin } }).subscribe({
        next: () => { this.bannedUsers.update((arr) => arr.filter((x) => x.id !== u.id)); this.unbanning.set(null); },
        error: () => { this.unbanning.set(null); },
      });
    });
  }
}
