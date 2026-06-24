import { Component, OnInit, inject, signal, computed } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';

interface Promotion {
  id: string;
  code: string;
  discountType: string;
  value: number;
  minOrderAmount?: number;
  maxUses?: number;
  usedCount: number;
  isActive: boolean;
  expiresAt?: string;
}

/** Servicer promotions management - create and manage own promo codes. */
@Component({
    selector: 'app-servicer-promotions',
    host: { class: 'page-enter page-narrow' },
    imports: [FormsModule, ListToolbarComponent],
    template: `
    <h1>My promotions</h1>

    <form class="card create page-child" (ngSubmit)="create()">
      <input placeholder="CODE" [(ngModel)]="code" name="code" />
      <select [(ngModel)]="discountType" name="dt">
        <option value="percent">% off</option>
        <option value="fixed">RM off</option>
      </select>
      <input type="number" placeholder="Value" [(ngModel)]="value" name="value" />
      <input type="number" placeholder="Min order" [(ngModel)]="minOrderAmount" name="min" />
      <input type="number" placeholder="Max uses" [(ngModel)]="maxUses" name="max" />
      <button class="btn-primary" type="submit">Create</button>
    </form>

    <app-list-toolbar>
      <input class="search" type="text" placeholder="Search code…" [(ngModel)]="search" name="psrch" toolbar-search />
      <div class="chips" toolbar-filters>
        <button class="chip" [class.on]="activeFilter() === 'all'" (click)="activeFilter.set('all')">All</button>
        <button class="chip" [class.on]="activeFilter() === 'active'" (click)="activeFilter.set('active')">Active</button>
        <button class="chip" [class.on]="activeFilter() === 'inactive'" (click)="activeFilter.set('inactive')">Inactive</button>
      </div>
      <select [(ngModel)]="sort" name="psort" toolbar-sort>
        <option value="code_asc">Code A-Z</option>
        <option value="code_desc">Code Z-A</option>
        <option value="value_desc">Value high-low</option>
        <option value="value_asc">Value low-high</option>
      </select>
    </app-list-toolbar>

    @for (p of displayPromotions(); track p.id) {
      <div class="card row">
        <div>
          <strong>{{ p.code }}</strong>
          <span class="muted">
            · {{ p.discountType === 'percent' ? p.value + '%' : 'RM ' + p.value }} off
            · used {{ p.usedCount }}{{ p.maxUses ? '/' + p.maxUses : '' }}
          </span>
        </div>
        <span [class.inactive]="!p.isActive">{{ p.isActive ? 'Active' : 'Inactive' }}</span>
        @if (p.isActive) {
          <button class="btn-ghost" (click)="deactivate(p)">Deactivate</button>
        }
      </div>
    } @empty {
      <p class="muted">No promotions yet.</p>
    }
    @if (message()) {
      <p [class.err]="isError()">{{ message() }}</p>
    }
  `,
    styles: [
        `
      :host { display: block; max-width: 720px; width: 100%; }
      .toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); margin-bottom: 1rem; }
      .search { min-width: 180px; max-width: 260px; border-radius: 999px; padding: 0.45rem 0.85rem; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); font-size: 0.88rem; outline: none; }
      .search:focus { border-color: var(--color-primary); }
      .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
      .chip { background: transparent; border: 1px solid var(--color-border); border-radius: 999px; padding: 0.625rem 0.75rem; font-size: 0.82rem; cursor: pointer; color: var(--color-muted); }
      .chip.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
      select { border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); padding: 0.4rem 0.6rem; font-size: 0.85rem; outline: none; cursor: pointer; }
      .create {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }
      .create input,
      .create select {
        flex: 1;
        min-width: 110px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        margin-bottom: 0.6rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .row:hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.09);
        transform: translateY(-1px);
      }
      .inactive {
        color: var(--color-muted);
      }
      .err {
        color: var(--color-danger);
      }
    `,
    ]
})
export class ServicerPromotionsComponent implements OnInit {
  private api = inject(ApiService);
  promotions = signal<Promotion[]>([]);
  message = signal('');
  isError = signal(false);

  search = signal('');
  activeFilter = signal<'all' | 'active' | 'inactive'>('all');
  sort = signal<'code_asc' | 'code_desc' | 'value_desc' | 'value_asc'>('code_asc');
  displayPromotions = computed(() => {
    let list = this.promotions();
    const q = this.search().toLowerCase();
    if (q) list = list.filter((p) => p.code.toLowerCase().includes(q));
    const af = this.activeFilter();
    if (af === 'active') list = list.filter((p) => p.isActive);
    else if (af === 'inactive') list = list.filter((p) => !p.isActive);
    const s = this.sort();
    if (s === 'code_asc') list.sort((a, b) => a.code.localeCompare(b.code));
    else if (s === 'code_desc') list.sort((a, b) => b.code.localeCompare(a.code));
    else if (s === 'value_desc') list.sort((a, b) => b.value - a.value);
    else if (s === 'value_asc') list.sort((a, b) => a.value - b.value);
    return list;
  });

  code = '';
  discountType = 'percent';
  value?: number;
  minOrderAmount?: number;
  maxUses?: number;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api
      .get<{ data: Promotion[] }>('/servicer/me/promotions')
      .subscribe({
        next: (r) => this.promotions.set(r.data),
        error: () => {
          this.isError.set(true);
          this.message.set('Could not load promotions. Please refresh the page.');
        },
      });
  }

  create(): void {
    if (!this.code.trim() || !this.value) {
      this.isError.set(true);
      this.message.set('Enter a code and value.');
      return;
    }
    this.api
      .post('/servicer/me/promotions', {
        code: this.code.trim(),
        discountType: this.discountType,
        value: this.value,
        minOrderAmount: this.minOrderAmount,
        maxUses: this.maxUses,
      })
      .subscribe({
        next: () => {
          this.isError.set(false);
          this.message.set('Promotion created.');
          this.code = '';
          this.value = undefined;
          this.minOrderAmount = undefined;
          this.maxUses = undefined;
          this.load();
        },
        error: (e) => {
          this.isError.set(true);
          this.message.set(e.message ?? 'Could not create promotion');
        },
      });
  }

  deactivate(p: Promotion): void {
    this.api.delete(`/servicer/me/promotions/${p.id}`).subscribe({
      next: () => this.load(),
      error: (e) => {
        this.isError.set(true);
        this.message.set(e.message);
      },
    });
  }
}
