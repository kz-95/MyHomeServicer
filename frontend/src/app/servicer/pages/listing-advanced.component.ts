import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { routeFor } from '../../core/route-for';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { ToastService } from '../../core/services/toast.service';

interface CategoryQuestion {
  key: string;
  label: string;
  type: string;
  options?: { value: string; label: string; active?: boolean }[];
}
interface ServicerModule {
  id: string;
  name: string;
  price: number;
  sku?: string | null;
}
type ModSel = { selected: boolean; kind: 'included' | 'addon'; overridePrice: number | null; durationDeltaMin: number | null };
type OptEntry = { price: number | null; durationMin: number | null; notOffered: boolean; modKind: 'included' | 'addon' };
type WizStep = 1 | 2 | 3;
interface ModuleRefRow { moduleId: string; kind?: 'included' | 'addon'; overridePrice?: number | null; durationDeltaMin?: number | null }
interface ServiceRow {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  priceType?: string;
  basePrice?: number | string | null;
  estimatedDurationMinutes?: number;
  autoAccept?: boolean;
  autoAcceptMessage?: string | null;
  moduleRefs?: ModuleRefRow[] | null;
  modifiers?: Record<string, Record<string, { price: number | null; durationMin?: number; notOffered: boolean; modKind?: string }>> | null;
}

/**
 * SP-3 Advanced listing wizard (spec §10.2) — 3 steps:
 *  ① Basics (required, publish-now available)
 *  ② Pricing & options (modules incl/add-on + per-option price & duration)
 *  ③ Auto-accept (toggle + message)
 * Step dots are clickable + skip-ahead once Basics is valid; 👁 Preview is a
 * toggle overlay on any step. Saves listingMode='advanced'.
 */
@Component({
  selector: 'app-listing-advanced',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ModalComponent],
  template: `
    <div class="page-enter wrap">
      <button class="btn-ghost back" (click)="cancel()">← Back</button>
      <div class="hd">
        <h1>{{ isEdit() ? 'Edit advanced listing' : 'New advanced listing' }}</h1>
        <button class="btn-ghost" (click)="preview.set(!preview())">
          <app-icon name="eye" sizeToken="sm" /> {{ preview() ? 'Close preview' : 'Preview as customer' }}
        </button>
      </div>
      <p class="muted">Under <strong>{{ categoryName() || '…' }}</strong>.</p>

      <div class="dots">
        @for (s of steps; track s.n) {
          <button class="dot" [class.active]="step() === s.n" [class.done]="step() > s.n"
                  [disabled]="!basicsValid && s.n > 1" (click)="goStep(s.n)">
            <span class="circle">{{ step() > s.n ? '✓' : s.n }}</span>{{ s.label }}
          </button>
        }
      </div>

      @if (error()) { <p class="err-banner">{{ error() }}</p> }

      <div class="card body">
        <!-- Step 1 — Basics -->
        @if (step() === 1) {
          <p class="hint">Start with the essentials. You can publish now and refine pricing later.</p>
           <label><span>Title<span class="req"> *</span></span>
            <input type="text" [(ngModel)]="f.title" name="t" maxlength="120" placeholder="e.g. Leaking pipe repair" (input)="error.set('')" /></label>
          <label><span>Short description</span>
            <input type="text" [(ngModel)]="f.description" name="d" maxlength="200" placeholder="e.g. Quick and reliable pipe repair - done within 60 min" (input)="error.set('')" /></label>
          <div class="row-3">
            <label><span>Price type</span>
              <select [(ngModel)]="f.priceType" name="pt">
                <option value="fixed">Fixed</option><option value="hourly">Hourly</option><option value="quote">By quote</option>
              </select></label>
            <label><span>Base price (RM)<span class="req"> *</span></span>
              <input type="number" [(ngModel)]="f.basePrice" name="bp" min="0" step="0.01" placeholder="e.g. 80.00" (input)="error.set('')" /></label>
            <label><span>Est. duration (min)</span>
              <input type="number" [(ngModel)]="f.duration" name="du" min="1" step="5" placeholder="e.g. 60" (input)="error.set('')" /></label>
          </div>
        }

        <!-- Step 2 — Pricing & options -->
        @if (step() === 2) {
          <p class="hint">Set pricing for each service option. Leave empty to use your base price for everything.</p>

          <!-- Preset module rows from question schema -->
          @if (questions().length) {
            <div class="sec-head"><strong>Options &amp; pricing</strong></div>
            @for (q of questions(); track q.key) {
              <div class="q-label">{{ q.label }}</div>
              @for (o of q.options; track o.value) {
                <div class="mod-row" [class.na]="opt(q.key, o.value).notOffered">
                  <span class="mod-name">{{ o.label }}</span>
                  @if (!opt(q.key, o.value).notOffered) {
                    <input type="number" placeholder="RM 0" [ngModel]="opt(q.key, o.value).price" (ngModelChange)="setOptPrice(q.key, o.value, $event)" [name]="'p'+q.key+o.value" min="0" step="0.01" />
                    <select [ngModel]="optModKind(q.key, o.value)" (ngModelChange)="setOptModKind(q.key, o.value, $event)" [name]="'k'+q.key+o.value">
                      <option value="included">Included</option><option value="addon">Add-on</option>
                    </select>
                    <input type="number" placeholder="+min" [ngModel]="opt(q.key, o.value).durationMin" (ngModelChange)="setOptDur(q.key, o.value, $event)" [name]="'qd'+q.key+o.value" step="5" />
                  }
                  <button type="button" class="na-toggle" (click)="toggleNA(q.key, o.value)">
                    {{ opt(q.key, o.value).notOffered ? 'N/A' : 'Offered' }}
                  </button>
                </div>
              }
            }
          } @else {
            <p class="muted small">This category has no predefined options. Your listing will use flat pricing.</p>
          }

          <!-- Reusable modules (existing) -->
          @if (modules().length) {
            <div class="sec-head ruled"><strong>Attached modules</strong>
              <button class="link-btn" (click)="goModules()">+ New module</button>
            </div>
            @for (m of modules(); track m.id) {
              <div class="mod-row" [class.on]="sel(m.id).selected">
                <label class="mod-check">
                  <input type="checkbox" [checked]="sel(m.id).selected" (change)="toggleMod(m.id)" />
                  <span class="mod-name">{{ m.name }}</span>
                  <span class="muted small">RM {{ m.price }}</span>
                </label>
                @if (sel(m.id).selected) {
                  <div class="mod-cfg">
                    <select [ngModel]="sel(m.id).kind" (ngModelChange)="setKind(m.id, $event)" [name]="'k'+m.id">
                      <option value="included">Included</option><option value="addon">Add-on</option>
                    </select>
                    <input type="number" placeholder="Override RM" [ngModel]="sel(m.id).overridePrice" (ngModelChange)="setOverride(m.id, $event)" [name]="'o'+m.id" min="0" step="0.01" />
                    <input type="number" placeholder="+min" [ngModel]="sel(m.id).durationDeltaMin" (ngModelChange)="setDur(m.id, $event)" [name]="'dd'+m.id" step="5" />
                  </div>
                }
              </div>
            }
          } @else {
            <div class="sec-head ruled"><strong>Attached modules</strong>
              <button class="link-btn" (click)="goModules()">+ New module</button>
            </div>
            <p class="muted small">No modules yet. Create reusable modules to attach across listings.</p>
          }
        }

        <!-- Step 3 — Auto-accept -->
        @if (step() === 3) {
          <p class="hint">Optional. When on, jobs that fit your price, availability, coverage and offered options are auto-accepted.</p>
          <label class="toggle">
            <input type="checkbox" [(ngModel)]="f.autoAccept" name="aa" />
            <span>Enable auto-accept for this listing</span>
          </label>
          @if (f.autoAccept) {
            <label><span>Auto message to the customer</span>
              <input type="text" [(ngModel)]="f.autoAcceptMessage" name="aam" maxlength="200" placeholder="e.g. Thanks! We'll be there on time." /></label>
            <p class="muted small">All four gates always apply: budget fit, availability, coverage radius, and offered options.</p>
          }
        }

        <div class="nav">
          @if (step() > 1) { <button class="btn-ghost" (click)="goStep(step()-1)">Back</button> }
          <span class="spacer"></span>
          <button class="btn-ghost" (click)="save(true)" [disabled]="saving()">{{ isEdit() ? 'Save changes' : 'Publish now' }}</button>
          @if (step() < 3) {
            <button class="btn-primary" (click)="next()">Next</button>
          } @else {
            <button class="btn-primary" (click)="save(true)" [disabled]="saving()">{{ saving() ? 'Saving…' : isEdit() ? 'Save changes' : 'Publish listing' }}</button>
          }
        </div>
      </div>
    </div>

    <app-modal [open]="preview()" title="Customer preview" (closed)="preview.set(false)">
      <div class="pv-card">
        <div class="pv-avatar">{{ f.title ? f.title.charAt(0) : '?' }}</div>
        <div class="pv-info">
          <strong class="pv-title">{{ f.title || 'Untitled listing' }}</strong>
          @if (f.description) { <p class="pv-desc">{{ f.description }}</p> }
          <div class="pv-meta">
            <span>~{{ f.duration }} min</span>
            @if (f.autoAccept) { <span class="pv-aa">auto-accept</span> }
          </div>
          @if (includedList().length) {
            <div class="pv-mods">
              <span class="pv-mods-label">Includes:</span>
              @for (m of includedList(); track m.name) { <span class="chip-soft">{{ m.name }}</span> }
            </div>
          }
          @if (pricedOpts().length) {
            <div class="pv-mods">
              <span class="pv-mods-label">Options from</span>
              @for (o of pricedOpts(); track o.label) {
                <span class="chip-soft">+RM {{ o.price | number: '1.2-2' }} · {{ o.label }}</span>
              }
            </div>
          }
          @if (!includedList().length && !pricedOpts().length) {
            <p class="muted small">Flat pricing — no options configured.</p>
          }
        </div>
        <div class="pv-action">
          <span class="pv-price">From RM {{ previewFrom() | number: '1.2-2' }}</span>
        </div>
      </div>
    </app-modal>
  `,
  styles: [
    `
      :host { display: block; }
      .wrap { max-width: 760px; margin: 0 auto; }
      .back { margin-bottom: 0.6rem; }
      .hd { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
      .hd h1 { margin: 0; }
      .dots { display: flex; gap: 0.5rem; margin: 1rem 0; flex-wrap: wrap; }
      .dot { display: flex; align-items: center; gap: 0.4rem; background: transparent; border: none; cursor: pointer; color: var(--color-muted); font-family: inherit; font-size: 0.88rem; }
      .dot:disabled { opacity: 0.5; cursor: not-allowed; }
      .dot.active { color: var(--color-primary); font-weight: 600; }
      .circle { width: 1.5rem; height: 1.5rem; border-radius: 999px; border: 1px solid var(--color-border); display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; }
      .dot.active .circle, .dot.done .circle { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
      .err-banner { color: var(--color-danger); background: var(--color-danger-bg); border: 1px solid var(--color-danger); border-radius: var(--radius); padding: 0.5rem 0.8rem; font-size: 0.85rem; }
      .body { display: flex; flex-direction: column; gap: 0.9rem; }
      .hint { font-size: 0.82rem; color: var(--color-muted); background: var(--color-bg); border-radius: var(--radius); padding: 0.5rem 0.7rem; margin: 0; }
      label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.88rem; font-weight: 500; }
      .row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.7rem; }
      @media (max-width: 560px) { .row-3 { grid-template-columns: 1fr; } }
      .req { color: var(--color-danger); }
      .photo-row { display: flex; gap: 1rem; align-items: center; }
      .photo-frame { width: 72px; height: 72px; border-radius: var(--radius); background: var(--color-bg); border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; overflow: hidden; }
      .photo-frame img { width: 100%; height: 100%; object-fit: cover; }
      .ph { color: var(--color-muted); }
      .file-btn { cursor: pointer; }
      .sec-head { display: flex; justify-content: space-between; align-items: center; margin-top: 0.3rem; }
      .sec-head.ruled { border-top: 1px solid var(--color-border); padding-top: 0.8rem; }
      .link-btn { background: transparent; border: none; color: var(--color-primary); cursor: pointer; font-family: inherit; font-size: 0.85rem; }
      .small { font-size: 0.8rem; }
      .mod-row { border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0.5rem 0.7rem; }
      .mod-row.on { background: var(--color-primary-light); }
      .mod-check { flex-direction: row !important; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer; }
      .mod-check input { width: auto; }
      .mod-name { flex: 1; font-weight: 500; }
      .mod-cfg { display: flex; gap: 0.4rem; margin-top: 0.5rem; flex-wrap: wrap; }
      .mod-cfg input, .mod-cfg select { width: auto; flex: 1; min-width: 90px; }
      .q-block { display: flex; flex-direction: column; gap: 0.35rem; }
      .q-label { font-size: 0.8rem; font-weight: 600; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.03em; }
      .opt-row { display: flex; align-items: center; gap: 0.5rem; border: 1px solid var(--color-border); border-radius: 6px; padding: 0.35rem 0.5rem; }
      .opt-row.na { opacity: 0.6; }
      .opt-name { flex: 1; font-size: 0.88rem; }
      .opt-row input { width: 5.5rem; }
      .na-toggle { background: transparent; border: 1px solid var(--color-border); border-radius: 999px; padding: 0.2rem 0.6rem; font-size: 0.72rem; cursor: pointer; color: var(--color-muted); font-family: inherit; }
      .toggle { flex-direction: row !important; align-items: center; gap: 0.5rem; font-weight: 400; }
      .toggle input { width: auto; }
      .nav { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
      .spacer { flex: 1; }
      .pv-card { display: flex; gap: 1rem; align-items: flex-start; }
      .pv-avatar { width: 44px; height: 44px; border-radius: 999px; background: var(--color-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; flex-shrink: 0; }
      .pv-info { flex: 1; min-width: 0; }
      .pv-title { font-weight: 700; font-size: 1.05rem; }
      .pv-desc { margin: 0.2rem 0; font-size: 0.85rem; color: var(--color-muted); }
      .pv-meta { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--color-muted); margin-top: 0.2rem; }
      .pv-aa { font-size: 0.7rem; background: var(--color-primary-light); color: var(--color-primary); padding: 0.05rem 0.4rem; border-radius: 4px; }
      .pv-mods { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; margin-top: 0.35rem; }
      .pv-mods-label { font-size: 0.78rem; color: var(--color-muted); margin-right: 0.2rem; }
      .chip-soft { font-size: 0.74rem; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 999px; padding: 0.05rem 0.5rem; }
      .pv-action { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
      .pv-price { font-size: 1.3rem; font-weight: 700; }
    `,
  ],
})
export class ListingAdvancedComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  isEdit = signal(false);
  private editId: string | null = null;

  steps = [
    { n: 1 as WizStep, label: 'Basics' },
    { n: 2 as WizStep, label: 'Pricing & options' },
    { n: 3 as WizStep, label: 'Auto-accept' },
  ];

  step = signal<WizStep>(1);
  preview = signal(false);
  uploading = signal(false);
  saving = signal(false);
  error = signal('');

  categoryName = signal('');
  categoryId = signal('');
  questions = signal<CategoryQuestion[]>([]);
  modules = signal<ServicerModule[]>([]);

  private modSel: Record<string, ModSel> = {};
  private optMap: Record<string, Record<string, OptEntry>> = {};

  f = {
    imageUrl: null as string | null,
    title: '',
    description: '',
    priceType: 'fixed',
    basePrice: null as number | null,
    duration: 60,
    autoAccept: false,
    autoAcceptMessage: '',
  };

  get basicsValid(): boolean { return !!this.f.title.trim() && this.f.basePrice != null && this.f.basePrice >= 0; }

  includedList = computed(() =>
    this.modules().filter((m) => this.modSel[m.id]?.selected && this.modSel[m.id].kind === 'included'),
  );

  ngOnInit(): void {
    this.editId = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!this.editId);

    this.api.get<{ data: ServicerModule[] }>('/servicer/modules?active=true').subscribe({
      next: (r) => this.modules.set(r.data),
    });
    this.api
      .get<{ category: { id: string; name: string } }>('/servicer/me/subcategories')
      .pipe(
        switchMap((r) => {
          this.categoryName.set(r.category.name);
          this.categoryId.set(r.category.id);
          return this.api.get<{ data: { id: string; questionSchema?: CategoryQuestion[] | null }[] }>('/categories');
        }),
      )
      .subscribe({
        next: (r) => {
          const cat = r.data.find((c) => c.id === this.categoryId());
          const qs = (cat?.questionSchema ?? [])
            .filter((q) => Array.isArray(q.options) && (q.options as unknown[]).length > 0)
            .map((q) => ({ ...q, options: (q.options ?? []).filter((o) => o.active !== false) }));
          this.questions.set(qs);
          for (const q of qs) {
            this.optMap[q.key] = {};
            for (const o of q.options)             this.optMap[q.key][o.value] = { price: null, durationMin: null, notOffered: false, modKind: 'included' };
          }
          if (this.editId) this.loadExisting(this.editId);
        },
        error: () => this.error.set('Could not load your service questions.'),
      });
  }

  /** Edit mode: fetch the listing and prefill basics, modules and per-option pricing. */
  private loadExisting(id: string): void {
    this.api.get<{ data: ServiceRow[] }>('/servicer/me/services').subscribe({
      next: (r) => {
        const svc = r.data.find((s) => s.id === id);
        if (!svc) {
          this.error.set('Listing not found.');
          return;
        }
        this.f = {
          imageUrl: svc.imageUrl ?? null,
          title: svc.title ?? '',
          description: svc.description ?? '',
          priceType: svc.priceType ?? 'fixed',
          basePrice: svc.basePrice != null ? Number(svc.basePrice) : null,
          duration: svc.estimatedDurationMinutes ?? 60,
          autoAccept: svc.autoAccept ?? false,
          autoAcceptMessage: svc.autoAcceptMessage ?? '',
        };
        for (const ref of svc.moduleRefs ?? []) {
          this.modSel[ref.moduleId] = {
            selected: true,
            kind: ref.kind === 'addon' ? 'addon' : 'included',
            overridePrice: ref.overridePrice ?? null,
            durationDeltaMin: ref.durationDeltaMin ?? null,
          };
        }
        const mods = svc.modifiers ?? {};
        for (const qKey of Object.keys(mods)) {
          if (!this.optMap[qKey]) this.optMap[qKey] = {};
          for (const val of Object.keys(mods[qKey])) {
            const e = mods[qKey][val];
            this.optMap[qKey][val] = {
              price: e.price ?? null,
              durationMin: e.durationMin ?? null,
              notOffered: !!e.notOffered,
              modKind: (e.modKind as 'included' | 'addon') ?? 'included',
            };
          }
        }
      },
      error: () => this.error.set('Could not load the listing.'),
    });
  }

  // ── module helpers ──
  sel(id: string): ModSel {
    return this.modSel[id] ?? { selected: false, kind: 'included', overridePrice: null, durationDeltaMin: null };
  }
  toggleMod(id: string): void {
    const cur = this.sel(id);
    this.modSel[id] = { ...cur, selected: !cur.selected };
  }
  setKind(id: string, kind: 'included' | 'addon'): void {
    this.modSel[id] = { ...this.sel(id), kind };
  }
  setOverride(id: string, v: number | null): void {
    this.modSel[id] = { ...this.sel(id), overridePrice: v != null && v !== ('' as unknown) ? Number(v) : null };
  }
  setDur(id: string, v: number | null): void {
    this.modSel[id] = { ...this.sel(id), durationDeltaMin: v != null && v !== ('' as unknown) ? Number(v) : null };
  }

  // ── option helpers ──
   opt(qKey: string, val: string): OptEntry {
    return this.optMap[qKey]?.[val] ?? { price: null, durationMin: null, notOffered: false, modKind: 'included' };
  }
  private setOpt(qKey: string, val: string, patch: Partial<OptEntry>): void {
    if (!this.optMap[qKey]) this.optMap[qKey] = {};
    this.optMap[qKey][val] = { ...this.opt(qKey, val), ...patch };
  }
  setOptPrice(qKey: string, val: string, v: number | null): void {
    this.setOpt(qKey, val, { price: v != null && v !== ('' as unknown) ? Number(v) : null });
  }
  setOptDur(qKey: string, val: string, v: number | null): void {
    this.setOpt(qKey, val, { durationMin: v != null && v !== ('' as unknown) ? Number(v) : null });
  }
  toggleNA(qKey: string, val: string): void {
    this.setOpt(qKey, val, { notOffered: !this.opt(qKey, val).notOffered });
  }
  optModKind(qKey: string, val: string): 'included' | 'addon' {
    return this.opt(qKey, val).modKind;
  }
  setOptModKind(qKey: string, val: string, kind: 'included' | 'addon'): void {
    this.setOpt(qKey, val, { modKind: kind });
  }

  pricedOpts(): { label: string; price: number }[] {
    const out: { label: string; price: number }[] = [];
    for (const q of this.questions()) {
      for (const o of q.options ?? []) {
        const e = this.opt(q.key, o.value);
        if (!e.notOffered && e.price != null && e.price > 0) {
          out.push({ label: o.label, price: e.price });
        }
      }
    }
    return out;
  }

  previewFrom(): number {
    let total = this.f.basePrice ?? 0;
    for (const m of this.includedList()) {
      total += this.sel(m.id).overridePrice ?? m.price;
    }
    for (const q of this.questions()) {
      for (const o of q.options ?? []) {
        const e = this.opt(q.key, o.value);
        if (!e.notOffered && e.modKind === 'included' && e.price != null) total += e.price;
      }
    }
    return total;
  }

  goStep(n: number): void {
    if (n > 1 && !this.basicsValid) {
      this.error.set('Complete the basics first (title + base price).');
      return;
    }
    this.error.set('');
    this.step.set(n as WizStep);
  }
  next(): void {
    if (this.step() === 1 && !this.basicsValid) {
      this.error.set('Title and base price are required.');
      return;
    }
    this.error.set('');
    this.step.update((s) => Math.min(3, s + 1) as WizStep);
  }
  goModules(): void {
    this.router.navigate([routeFor('servicer.services.modules')]);
  }

  onPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.error.set('Photo must be under 5 MB.');
      input.value = '';
      return;
    }
    this.uploading.set(true);
    this.api
      .post<{ uploadUrl: string; fileId: string }>('/files/presign', {
        purpose: 'listing_photo',
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
      })
      .pipe(
        switchMap(({ uploadUrl, fileId }) =>
          this.http
            .put(uploadUrl, file, { headers: { 'Content-Type': file.type || 'image/jpeg' } })
            .pipe(switchMap(() => this.api.post<{ fileUrl: string }>(`/files/${fileId}/confirm`, {}))),
        ),
      )
      .subscribe({
        next: ({ fileUrl }) => {
          this.f.imageUrl = fileUrl;
          this.uploading.set(false);
          input.value = '';
        },
        error: (e) => {
          this.uploading.set(false);
          this.error.set(e.message ?? 'Photo upload failed.');
          input.value = '';
        },
      });
  }

  save(publish: boolean): void {
    if (!this.basicsValid) {
      this.error.set('Title and base price are required.');
      this.step.set(1);
      return;
    }
    this.error.set('');
    this.saving.set(true);

    const modifiers: Record<string, Record<string, { price: number | null; durationMin?: number; notOffered: boolean; modKind?: string }>> = {};
    for (const q of this.questions()) {
      modifiers[q.key] = {};
      for (const o of q.options ?? []) {
        const e = this.opt(q.key, o.value);
        const entry: { price: number | null; durationMin?: number; notOffered: boolean; modKind?: string } = {
          price: e.notOffered ? null : e.price,
          notOffered: e.notOffered,
          modKind: e.modKind,
        };
        if (!e.notOffered && e.durationMin != null) entry.durationMin = e.durationMin;
        modifiers[q.key][o.value] = entry;
      }
    }
    const moduleRefs = this.modules()
      .filter((m) => this.modSel[m.id]?.selected)
      .map((m) => {
        const s = this.modSel[m.id];
        return {
          moduleId: m.id,
          kind: s.kind,
          ...(s.overridePrice != null ? { overridePrice: s.overridePrice } : {}),
          ...(s.durationDeltaMin != null ? { durationDeltaMin: s.durationDeltaMin } : {}),
        };
      });

    const body: Record<string, unknown> = {
      title: this.f.title.trim(),
      description: this.f.description.trim() || undefined,
      imageUrl: this.f.imageUrl || undefined,
      priceType: this.f.priceType,
      basePrice: Number(this.f.basePrice),
      taxMode: 'none',
      estimatedDurationMinutes: Number(this.f.duration) || 60,
      listingMode: 'advanced',
      autoAccept: this.f.autoAccept,
      autoAcceptMessage: this.f.autoAccept ? this.f.autoAcceptMessage || undefined : undefined,
      published: publish,
      modifiers,
      moduleRefs,
    };

    const req$ = this.editId
      ? this.api.patch<{ id: string }>(`/servicer/me/services/${this.editId}`, body)
      : this.api.post<{ id: string }>('/servicer/me/services', body);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.editId ? 'Listing updated.' : publish ? 'Listing published.' : 'Listing saved.');
        this.router.navigate([routeFor('servicer.services.listings')]);
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(e.message ?? 'Could not save the listing');
      },
    });
  }

  cancel(): void {
    this.router.navigate([routeFor('servicer.services.listings')]);
  }
}
