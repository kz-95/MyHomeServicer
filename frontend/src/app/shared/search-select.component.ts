import {
  Component,
  ElementRef,
  HostListener,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Case-insensitive subsequence fuzzy match. Returns a relevance score
 * (higher = better) or `null` when not every query char is found in order.
 * Consecutive runs, word-starts, and earlier/shorter matches rank higher,
 * so "ac dr" → "AC Doctor Malaysia" beats a scattered match.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let prev = -2;
  let first = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (first < 0) first = ti;
      if (ti === prev + 1) score += 3; // consecutive
      else score += 1;
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-') score += 2; // word start
      prev = ti;
      qi++;
    }
  }
  if (qi < q.length) return null;
  score += Math.max(0, 10 - first); // earlier first hit
  score += Math.max(0, 20 - t.length) * 0.1; // shorter text
  return score;
}

/**
 * Shared fuzzy searchable-select (STYLE-RULES §7.12). A `<select>`-style
 * picker with a filter input, fuzzy ranking, scrollable menu, and keyboard
 * nav. Implements ControlValueAccessor so it drops into template-driven and
 * reactive forms exactly like a native control.
 */
@Component({
  selector: 'app-search-select',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchSelectComponent),
      multi: true,
    },
  ],
  template: `
    <button
      type="button"
      class="ss-trigger"
      [class.open]="open()"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      <span class="ss-value" [class.placeholder]="!selectedLabel()">
        {{ selectedLabel() || placeholder() }}
      </span>
      <span class="ss-arrow" [class.up]="open()">▾</span>
    </button>

    @if (open()) {
      <div class="ss-panel">
        <input
          #search
          class="ss-search"
          type="text"
          [value]="query()"
          (input)="onQuery($event)"
          (keydown)="onKey($event)"
          [placeholder]="searchPlaceholder()"
          autocomplete="off"
        />
        <ul class="ss-list" role="listbox">
          @for (o of filtered(); track o.value; let i = $index) {
            <li
              role="option"
              class="ss-opt"
              [class.active]="i === highlight()"
              [class.selected]="o.value === value()"
              (mousedown)="pick(o)"
              (mouseenter)="highlight.set(i)"
            >
              {{ o.label }}
            </li>
          } @empty {
            <li class="ss-empty">No matches</li>
          }
        </ul>
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: relative;
        display: block;
      }
      .ss-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        width: 100%;
        padding: 0.5rem 0.75rem;
        font: inherit;
        text-align: left;
        color: var(--color-text);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius, 8px);
        cursor: pointer;
        transition: border-color 0.15s ease;
      }
      .ss-trigger:hover:not(:disabled) {
        border-color: var(--color-primary);
      }
      .ss-trigger.open {
        border-color: var(--color-primary);
      }
      .ss-trigger:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .ss-value {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ss-value.placeholder {
        color: var(--color-muted);
      }
      .ss-arrow {
        flex-shrink: 0;
        color: var(--color-muted);
        transition: transform 0.15s ease;
      }
      .ss-arrow.up {
        transform: rotate(180deg);
      }
      .ss-panel {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 200;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius, 8px);
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
        overflow: hidden;
      }
      .ss-search {
        display: block;
        width: 100%;
        box-sizing: border-box;
        padding: 0.5rem 0.75rem;
        font: inherit;
        color: var(--color-text);
        background: var(--color-surface);
        border: none;
        border-bottom: 1px solid var(--color-border);
        outline: none;
      }
      .ss-list {
        list-style: none;
        margin: 0;
        padding: 0.25rem 0;
        max-height: min(60vh, 18rem);
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: var(--color-primary) transparent;
      }
      .ss-list::-webkit-scrollbar {
        width: 8px;
      }
      .ss-list::-webkit-scrollbar-thumb {
        background: var(--color-border);
        border-radius: 4px;
      }
      .ss-opt {
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        font-size: 0.9rem;
        color: var(--color-text);
      }
      .ss-opt.active {
        background: var(--color-primary-light);
      }
      .ss-opt.selected {
        font-weight: 600;
        color: var(--color-primary-dark);
      }
      .ss-empty {
        padding: 0.6rem 0.75rem;
        font-size: 0.85rem;
        color: var(--color-muted);
      }
    `,
  ],
})
export class SearchSelectComponent implements ControlValueAccessor {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  options = input<SelectOption[]>([]);
  placeholder = input(' - Select - ');
  searchPlaceholder = input('Search…');

  open = signal(false);
  query = signal('');
  value = signal('');
  disabled = signal(false);
  highlight = signal(0);

  /** Options filtered + ranked by the current fuzzy query. */
  filtered = computed<SelectOption[]>(() => {
    const q = this.query();
    const opts = this.options();
    if (!q.trim()) return opts;
    return opts
      .map((o) => ({ o, s: fuzzyScore(q, o.label) }))
      .filter((x): x is { o: SelectOption; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.o);
  });

  selectedLabel = computed(() => {
    const v = this.value();
    return this.options().find((o) => o.value === v)?.label ?? '';
  });

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  toggle(): void {
    if (this.disabled()) return;
    this.open.update((o) => !o);
    if (this.open()) {
      this.query.set('');
      this.highlight.set(0);
      // Focus the filter input once the panel has rendered.
      setTimeout(() => {
        this.host.nativeElement.querySelector<HTMLInputElement>('.ss-search')?.focus();
      });
    } else {
      this.onTouched();
    }
  }

  onQuery(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
    this.highlight.set(0);
  }

  onKey(e: KeyboardEvent): void {
    const list = this.filtered();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.highlight.update((h) => Math.min(h + 1, list.length - 1));
        this.scrollToHighlight();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.highlight.update((h) => Math.max(h - 1, 0));
        this.scrollToHighlight();
        break;
      case 'Enter': {
        e.preventDefault();
        const sel = list[this.highlight()];
        if (sel) this.pick(sel);
        break;
      }
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  }

  pick(o: SelectOption): void {
    this.value.set(o.value);
    this.onChange(o.value);
    this.close();
  }

  private close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.onTouched();
  }

  private scrollToHighlight(): void {
    setTimeout(() => {
      const items = this.host.nativeElement.querySelectorAll<HTMLElement>('.ss-opt');
      items[this.highlight()]?.scrollIntoView({ block: 'nearest' });
    });
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(e.target as Node)) this.close();
  }

  // ── ControlValueAccessor ──
  writeValue(v: string | null): void {
    this.value.set(v ?? '');
  }
  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
