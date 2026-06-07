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

type Tab = 'faq' | 'admin';

function emptyForm(tier: string): FaqForm {
  return { question: '', answer: '', category: '', isPublished: true, tier };
}

@Component({
  selector: 'app-admin-faq',
  standalone: true,
  host: { class: 'page-enter' },
  imports: [CommonModule, FormsModule, ModalComponent],
  template: `
    <h1>AI Chat Settings
      <button class="btn-ghost" style="float:right;font-size:0.82rem" (click)="showBans.set(true); loadBans()">Banned users</button>
    </h1>
    <p class="muted hint">Published entries feed the AI chatbot as reference data, filtered by the reader's audience tier.</p>

    <div class="sticky-header">
      <div class="tabs">
        <button class="tab" [class.active]="tab() === 'faq'" (click)="switchTab('faq')">FAQ</button>
        <button class="tab" [class.active]="tab() === 'admin'" (click)="switchTab('admin')">Admin FAQ</button>
      </div>

      <div class="search-row">
        <input
          placeholder="Search question, answer or category…"
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
          aria-label="Search entries"
        />
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
            @for (c of categories(); track c) {
              <option [value]="c">{{ c }}</option>
            }
          </select>
        </div>
        <span class="muted count">{{ sortedItems().length }} entries</span>
      </div>
    </div>

    @if (importMsg()) {
      <p [class.err]="importErr()" [class.ok]="!importErr()">{{ importMsg() }}</p>
    }

    @if (loadFailed()) {
      <div class="card load-err">
        <p>Could not load entries. <button class="btn-ghost" (click)="load()">Retry</button></p>
      </div>
    } @else {
      <table class="card page-child">
        <thead>
          <tr>
            <th class="sortable" [class.sorted]="faqSortCol() === 'category'" (click)="sortFaq('category')">
              Category <span class="sort-ic">{{ faqSortIcon('category') }}</span>
            </th>
            <th class="sortable" [class.sorted]="faqSortCol() === 'question'" (click)="sortFaq('question')">
              Question <span class="sort-ic">{{ faqSortIcon('question') }}</span>
            </th>
            <th>Answer</th>
            <th class="sortable" [class.sorted]="faqSortCol() === 'tier'" (click)="sortFaq('tier')">
              Tier <span class="sort-ic">{{ faqSortIcon('tier') }}</span>
            </th>
            <th class="sortable" [class.sorted]="faqSortCol() === 'isPublished'" (click)="sortFaq('isPublished')">
              Published <span class="sort-ic">{{ faqSortIcon('isPublished') }}</span>
            </th>
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
              <td>
                <span class="badge" [class.badge-completed]="e.isPublished" [class.badge-cancelled]="!e.isPublished">
                  {{ e.isPublished ? 'Yes' : 'No' }}
                </span>
              </td>
              <td class="actions">
                <button class="btn-ghost" (click)="togglePublish(e)">{{ e.isPublished ? 'Unpublish' : 'Publish' }}</button>
                <button class="btn-ghost" (click)="openEdit(e)">Edit</button>
                <button class="btn-ghost" (click)="remove(e)">Delete</button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6" class="muted">
                {{ loading() ? 'Loading entries…' : emptyMessage() }}
              </td>
            </tr>
          }
        </tbody>
      </table>
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
        <label>Question
          <input [(ngModel)]="f.question" name="fq" required />
        </label>
        <label>Answer
          <textarea [(ngModel)]="f.answer" name="fa" rows="3" required></textarea>
        </label>
        <label class="row-label">
          <input type="checkbox" [(ngModel)]="f.isPublished" name="fpub" />
          Published
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn-ghost" (click)="closeEdit()">Cancel</button>
        <button
          class="btn-primary"
          [disabled]="saving() || !f.question.trim() || !f.answer.trim()"
          (click)="save()"
        >{{ saving() ? 'Saving…' : 'Save' }}</button>
      </div>
    </app-modal>

    <app-modal [open]="showBans()" title="Banned chat users" (closed)="showBans.set(false)">
      @if (bansLoading()) {
        <p class="muted">Loading…</p>
      } @else if (bannedUsers().length === 0) {
        <p class="muted">No banned users.</p>
      } @else {
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
    .hint { margin-bottom: 0.8rem; }

    /* Sticky tab + search + filter header (matches Accounts page) */
    .sticky-header {
      position: sticky;
      top: 0;
      z-index: 5;
      background: var(--color-bg);
      padding-bottom: 0.6rem;
      margin-bottom: 0.8rem;
      border-bottom: 1px solid var(--color-border);
    }
    .tabs {
      display: flex;
      gap: 0;
      margin-bottom: 0.6rem;
      border-bottom: 2px solid var(--color-border);
    }
    .tab {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      padding: 0.5rem 1.1rem;
      font-size: 0.88rem;
      font-weight: 500;
      color: var(--color-muted);
      cursor: pointer;
      font-family: inherit;
      transition: color 0.15s ease, border-color 0.15s ease;
    }
    .tab:hover { color: var(--color-text); }
    .tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); font-weight: 600; }
    .search-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .search-row input[type="text"], .search-row input:not([type]) { flex: 1; min-width: 200px; font-size: 0.9rem; }

    .filter-row { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; align-items: center; padding-top: 0.55rem; }
    .filter-group { display: flex; align-items: center; gap: 0.4rem; }
    .filter-label { font-size: 0.75rem; color: var(--color-muted); font-weight: 500; white-space: nowrap; }
    .filter-group select { font-size: 0.8rem; padding: 0.2rem 0.4rem; }
    .chips { display: flex; gap: 0.2rem; flex-wrap: wrap; }
    .chip {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 999px;
      padding: 0.625rem 0.8rem;
      font-size: 0.74rem;
      font-weight: 500;
      color: var(--color-muted);
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s ease;
    }
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
    .err { color: var(--color-danger); margin-top: 0.5rem; }
    .badge-tier { font-size: 0.78rem; color: var(--color-muted); }
  `],
})
export class AdminFaqComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private pin = inject(PinService);

  items = signal<FaqEntry[]>([]);
  loading = signal(true);
  loadFailed = signal(false);

  // Tab + filters
  tab = signal<Tab>('faq');
  search = signal('');
  tierFilter = signal<string>('');
  pubFilter = signal<string>('');
  catFilter = signal<string>('');

  // Sort
  faqSortCol = signal('');
  faqSortDir = signal<'asc' | 'desc'>('asc');

  /** Distinct, sorted categories across all entries (for the category dropdown). */
  categories = computed(() => {
    const set = new Set<string>();
    for (const e of this.items()) if (e.category) set.add(e.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  /** Entries for the active tab, narrowed by search + tier + status + category. */
  filtered = computed(() => {
    const tab = this.tab();
    const q = this.search().trim().toLowerCase();
    const tier = this.tierFilter();
    const pub = this.pubFilter();
    const cat = this.catFilter();
    return this.items().filter((e) => {
      const isAdmin = e.tier === 'admin';
      if (tab === 'admin' ? !isAdmin : isAdmin) return false;
      if (tab === 'faq' && tier && e.tier !== tier) return false;
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

  emptyMessage(): string {
    return this.items().length === 0
      ? 'No entries yet. Add one to give the chatbot knowledge.'
      : 'No entries match the current filters.';
  }

  switchTab(t: Tab): void {
    this.tab.set(t);
    this.tierFilter.set('');
  }

  sortFaq(col: string): void {
    if (this.faqSortCol() === col) {
      this.faqSortDir.set(this.faqSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.faqSortCol.set(col);
      this.faqSortDir.set('asc');
    }
  }

  faqSortIcon(col: string): string {
    return this.faqSortCol() === col ? (this.faqSortDir() === 'asc' ? '↑' : '↓') : '⇅';
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.api.get<{ data: FaqEntry[] }>('/admin/faq').subscribe({
      next: (r) => {
        this.items.set(r.data);
        this.loading.set(false);
      },
      error: () => {
        this.loadFailed.set(true);
        this.loading.set(false);
      },
    });
  }

  openCreate(): void {
    // New entries default to the tier of the active tab.
    this.f = emptyForm(this.tab() === 'admin' ? 'admin' : 'customer');
    this.editingId.set('__new__');
  }

  openEdit(e: FaqEntry): void {
    this.f = {
      question: e.question,
      answer: e.answer,
      category: e.category ?? '',
      isPublished: e.isPublished,
      tier: e.tier ?? 'customer',
    };
    this.editingId.set(e.id);
  }

  closeEdit(): void {
    this.editingId.set(null);
  }

  save(): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      const isNew = this.editingId() === '__new__';
      this.saving.set(true);
      const body = {
        question: this.f.question.trim(),
        answer: this.f.answer.trim(),
        category: this.f.category.trim() || null,
        tier: this.f.tier,
        isPublished: this.f.isPublished,
      };

      const req = isNew
        ? this.api.post<FaqEntry>('/admin/faq', body, { 'x-action-pin': pin })
        : this.api.patch<FaqEntry>(`/admin/faq/${this.editingId()}`, body, { 'x-action-pin': pin });

      req.subscribe({
        next: (r) => {
          if (isNew) {
            this.items.update((arr) => [...arr, r as FaqEntry]);
          } else {
            this.items.update((arr) =>
              arr.map((e) => (e.id === this.editingId() ? { ...e, ...(r as FaqEntry) } : e)),
            );
          }
          this.saving.set(false);
          this.closeEdit();
        },
        error: () => { this.saving.set(false); },
      });
    });
  }

  togglePublish(e: FaqEntry): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.api
        .patch<FaqEntry>(`/admin/faq/${e.id}`, { isPublished: !e.isPublished }, { 'x-action-pin': pin })
        .subscribe({
          next: (r) => {
            this.items.update((arr) =>
              arr.map((x) => (x.id === e.id ? { ...x, isPublished: (r as FaqEntry).isPublished } : x)),
            );
          },
        });
    });
  }

  remove(e: FaqEntry): void {
    if (!confirm(`Delete "${e.question}"?`)) return;
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.http.delete(`${environment.apiBase}/admin/faq/${e.id}`, { headers: { 'x-action-pin': pin } }).subscribe({
        next: () => {
          this.items.update((arr) => arr.filter((x) => x.id !== e.id));
        },
      });
    });
  }

  exportCsv(): void {
    this.http
      .get(`${environment.apiBase}/admin/faq/csv`, { responseType: 'text' })
      .subscribe((csv) => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'faq-export.csv';
        a.click();
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
      this.importMsg.set('');
      this.importErr.set(false);
      this.api
        .post<{ updated: number; skipped: number }>('/admin/faq/csv', { csv })
        .subscribe({
          next: (r) => {
            this.importMsg.set(`Imported: ${r.updated} updated` + (r.skipped ? `, ${r.skipped} skipped (no match).` : '.'));
            this.load();
          },
          error: (e) => {
            this.importMsg.set(e.message ?? 'Import failed');
            this.importErr.set(true);
          },
        });
    };
    reader.readAsText(file);
    input.value = '';
  }

  /** Load banned users when the modal opens. */
  loadBans(): void {
    this.bansLoading.set(true);
    this.api.get<{ data: BannedUser[] }>('/admin/chat-bans').subscribe({
      next: (r) => {
        this.bannedUsers.set(r.data);
        this.bansLoading.set(false);
      },
      error: () => { this.bansLoading.set(false); },
    });
  }

  unban(u: BannedUser): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.unbanning.set(u.id);
      this.http
        .post(`${environment.apiBase}/admin/chat-bans/${u.id}/unban`, {}, { headers: { 'x-action-pin': pin } })
        .subscribe({
          next: () => {
            this.bannedUsers.update((arr) => arr.filter((x) => x.id !== u.id));
            this.unbanning.set(null);
          },
          error: () => { this.unbanning.set(null); },
        });
    });
  }
}
