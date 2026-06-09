import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, CdkDrag, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { IconComponent } from '../../shared/icon.component';
import { DialogService } from '../../core/services/dialog.service';
import { PinService } from '../../core/services/pin.service';

const PROVIDERS = [
  { value: 'gemini', label: 'Google (Gemini)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'glm', label: 'GLM (ZhipuAI)' },
  { value: 'kimi', label: 'Kimi (Moonshot)' },
  { value: 'claude', label: 'Anthropic (Claude)' },
  { value: 'qwen', label: 'Qwen (Alibaba)' },
  { value: 'mistral', label: 'Mistral AI' },
  { value: 'llama', label: 'Meta (LLaMA)' },
  { value: 'grok', label: 'Grok (xAI)' },
  { value: 'cohere', label: 'Cohere' },
  { value: 'baichuan', label: 'Baichuan' },
  { value: 'yi', label: 'Yi (01.AI)' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'stepfun', label: 'StepFun' },
  { value: 'doubao', label: 'Doubao (ByteDance)' },
  { value: 'generic', label: 'Generic (OpenAI-compatible)' },
] as const;

interface LlmKey {
  id: string;
  label: string;
  provider: string;
  model: string;
  value: string;
  priority: number;
  isActive: boolean;
  isFallback: boolean;
  editing?: boolean;
  editValue?: string;
  editLabel?: string;
  editProvider?: string;
  editModel?: string;
  fetchingModels?: boolean;
  availableModels?: string[];
  saveError?: string;
  customProvider?: string;
}

@Component({
  selector: 'app-api-keys',
  standalone: true,
  imports: [FormsModule, CommonModule, CdkDrag, CdkDragHandle, CdkDropList, IconComponent],
  template: `
    <div class="llm-keys-page">
      <h1>LLM API Keys</h1>
      <p class="subtitle">Manage API keys for the platform AI assistant and chat features. Keys stored here are used when .env keys are not set.</p>

      @if (loaded()) {
        @if (fallbackKey() || editingFallback()) {
          <section class="section fallback-section">
            <h2>Fallback LLM API Key</h2>
            <p class="section-desc">Used when no other LLM API keys are configured or available.</p>
            @if (editingFallback()) {
              <div class="key-card fallback-card edit-mode">
                <span class="drag-handle static"> - </span>
                <input class="field-input label-input" placeholder="Label *" [(ngModel)]="fallbackLabel" [class.input-error]="fallbackSaveError() && !fallbackLabel.trim()" />
                @if (fallbackEditingExisting) {
                  <input class="field-input key-input" type="password" value="••••••••" disabled title="Saved key (hidden). Delete and re-add to change it." />
                } @else {
                  <input class="field-input key-input" placeholder="API key *" [(ngModel)]="fallbackValue" type="password" [class.input-error]="fallbackSaveError() && !fallbackValue.trim()" />
                }
                <select class="field-input provider-select" [(ngModel)]="fallbackProvider">
                  <option value=""> - Select provider - </option>
                  @for (p of providers; track p.value) {
                    <option [value]="p.value">{{ p.label }}</option>
                  }
                  <option value="__custom__">Other (custom)...</option>
                </select>
                @if (fallbackProvider === '__custom__') {
                  <input class="field-input custom-provider-input" placeholder="Type provider name" [(ngModel)]="fallbackCustomProvider" />
                }
                <select class="field-input model-input" [(ngModel)]="fallbackModel">
                  <option value="">(auto - use provider default)</option>
                  @if (fallbackModel && !fallbackAvailableModels.includes(fallbackModel)) {
                    <option [value]="fallbackModel">{{ fallbackModel }}</option>
                  }
                  @for (m of fallbackAvailableModels; track m) {
                    <option [value]="m">{{ m }}</option>
                  }
                </select>
                <button class="btn-fetch btn-sm" (click)="fetchModelsForFallback()" [disabled]="fallbackFetchingModels">Fetch</button>
                <button class="btn-save" (click)="saveFallback()">Save</button>
                <button class="btn-icon-delete" title="Delete" (click)="removeFallback()">
                  <app-icon name="trash-2" sizeToken="sm" />
                </button>
                @if (fallbackSaveError()) {
                  <div class="save-error">{{ fallbackSaveError() }}</div>
                }
              </div>
            } @else {
              <div class="key-card fallback-card">
                <span class="drag-handle static"> - </span>
                <div class="field-label">{{ fallbackKey()!.label }}</div>
                <div class="field-badge">{{ providerLabel(fallbackKey()!.provider) }}</div>
                <div class="field-model" title="Model">{{ fallbackKey()!.model || '(auto)' }}</div>
                <div class="field-value">{{ maskKey(fallbackKey()!.value) }}</div>
                <button class="btn-outline btn-sm" (click)="editFallback()">Edit</button>
                <button class="btn-icon-delete" title="Delete" (click)="deleteKey(fallbackKey()!.id)">
                  <app-icon name="trash-2" sizeToken="sm" />
                </button>
              </div>
            }
          </section>
        } @else {
          <section class="section fallback-section empty">
            <h2>Fallback LLM API Key</h2>
            <p class="section-desc">Used when no other LLM API keys are configured or available.</p>
            <button class="btn-primary" (click)="addFallback()">+ Add Fallback Key</button>
          </section>
        }

        <section class="section keys-section">
          <div class="section-header">
            <h2>LLM API Keys</h2>
            <span class="priority-hint">Priority: top &rarr; bottom</span>
            <span class="demo-keys-area">
              @if (demoPinOpen()) {
                <input class="demo-pin-input" type="password" inputmode="numeric" maxlength="8" placeholder="Demo PIN" [(ngModel)]="demoPin" (keydown.enter)="seedDemoKeys()" [disabled]="demoSeeding()" />
                <button class="btn-demo-confirm" (click)="seedDemoKeys()" [disabled]="demoSeeding() || !demoPin">Go</button>
                <button class="btn-demo-cancel" (click)="closeDemoPin()">✕</button>
              }
              <button class="btn-demo" (click)="openDemoPin()" [disabled]="demoSeeding()">
                {{ demoSeeding() ? 'Seeding…' : '+Demo Keys' }}
              </button>
            </span>
          </div>
          @if (demoError()) {
            <p class="demo-error">{{ demoError() }}</p>
          }

          @if (keys().length > 0) {
            <div cdkDropList class="keys-list" (cdkDropListDropped)="drop($event)">
              @for (entry of keys(); track entry.id; let i = $index) {
                <div class="key-card" cdkDrag>
                  <span class="drag-handle" cdkDragHandle>⠿</span>
                  @if (entry.editing) {
                    <input class="field-input label-input" placeholder="Label *" [(ngModel)]="entry.editLabel" [class.input-error]="entry.saveError && !entry.editLabel?.trim()" />
                    @if (entry.id) {
                      <input class="field-input key-input" type="password" value="••••••••" disabled title="Saved key (hidden). Delete and re-add to change it." />
                    } @else {
                      <input class="field-input key-input" placeholder="API key *" [(ngModel)]="entry.editValue" type="password" [class.input-error]="entry.saveError && !entry.editValue?.trim()" />
                    }
                    <select class="field-input provider-select" [(ngModel)]="entry.editProvider">
                      <option value=""> - Select provider - </option>
                      @for (p of providers; track p.value) {
                        <option [value]="p.value">{{ p.label }}</option>
                      }
                      <option value="__custom__">Other (custom)...</option>
                    </select>
                    @if (entry.editProvider === '__custom__') {
                      <input class="field-input custom-provider-input" placeholder="Type provider name" [(ngModel)]="entry.customProvider" />
                    }
                    <datalist [id]="'provider-list-' + i">
                      @for (p of providers; track p.value) {
                        <option [value]="p.value">{{ p.label }}</option>
                      }
                    </datalist>
                    <select class="field-input model-input" [(ngModel)]="entry.editModel">
                      <option value="">(auto - use provider default)</option>
                      @if (entry.editModel && !(entry.availableModels || []).includes(entry.editModel)) {
                        <option [value]="entry.editModel">{{ entry.editModel }}</option>
                      }
                      @for (m of (entry.availableModels || []); track m) {
                        <option [value]="m">{{ m }}</option>
                      }
                    </select>
                    <button class="btn-fetch btn-sm" (click)="fetchModels(entry)" [disabled]="entry.fetchingModels">Fetch</button>
                    <button class="btn-save" (click)="saveKey(entry)">Save</button>
                    <button class="btn-icon-delete" title="Delete" (click)="removeKey(entry)">
                      <app-icon name="trash-2" sizeToken="sm" />
                    </button>
                    @if (entry.saveError) {
                      <div class="save-error">{{ entry.saveError }}</div>
                    }
                  } @else {
                    <div class="field-label">{{ entry.label }}</div>
                    <div class="field-badge">{{ providerLabel(entry.provider) }}</div>
                    <div class="field-model" title="Model">{{ entry.model || '(auto)' }}</div>
                    <div class="field-value">{{ maskKey(entry.value) }}</div>
                    <button class="btn-outline btn-sm" (click)="editKey(entry)">Edit</button>
                    <button class="btn-icon-delete" title="Delete" (click)="deleteKey(entry.id)">
                      <app-icon name="trash-2" sizeToken="sm" />
                    </button>
                  }
                </div>
              }
            </div>
          } @else {
            <p class="empty-hint">No LLM API keys configured yet.</p>
          }

          <button class="btn-primary add-btn" (click)="addNew()">+ Add LLM API Key</button>
        </section>

        <section class="section notes-section">
          <button class="notes-toggle" (click)="toggleNotes()">
            {{ notesOpen() ? '&#9660;' : '&#9654;' }} How to get API keys
          </button>
          @if (notesOpen()) {
            <div class="notes-content">
              <p class="notes-intro">These keys power the platform's AI features. Keys are tried in priority order. Leave the Model field blank to use the default for that provider. After saving, available models are automatically fetched from the provider's API.</p>

              <h3>Google AI (Gemini)</h3>
              <ol>
                <li>Go to <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a></li>
                <li>Sign in and click <strong>"Create API Key"</strong></li>
                <li>Copy the key (starts with <code>AIza</code>)</li>
                <li>Add with label "Gemini" and provider "Gemini (Google)"</li>
              </ol>

              <h3>OpenAI</h3>
              <ol>
                <li>Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI Platform</a></li>
                <li>Click <strong>"Create new secret key"</strong></li>
                <li>Copy the key (starts with <code>sk-</code>)</li>
                <li>Add with label "OpenAI" and provider "OpenAI"</li>
              </ol>

              <h3>DeepSeek</h3>
              <ol>
                <li>Go to <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener">DeepSeek Platform</a></li>
                <li>Create a new API key</li>
                <li>Copy the key (starts with <code>sk-</code>)</li>
                <li>Add with label "DeepSeek" and provider "DeepSeek"</li>
              </ol>
            </div>
          }
        </section>
      } @else {
        <p class="loading">Loading...</p>
      }
    </div>
  `,
  styles: [`
    .llm-keys-page { padding: 2rem; max-width: 820px; margin: 0 auto; }
    .subtitle { color: var(--color-muted, #666); margin-bottom: 2rem; }

    .section { margin-bottom: 2rem; }
    .section h2 { margin: 0 0 0.25rem; font-size: 1.1rem; }
    .section-desc { color: var(--color-muted, #888); font-size: 0.85rem; margin: 0 0 1rem; }
    .section-header { display: flex; align-items: baseline; gap: 1rem; margin-bottom: 0.25rem; }
    .priority-hint { color: var(--color-muted, #888); font-size: 0.8rem; }

    .demo-keys-area { margin-left: auto; display: flex; align-items: center; gap: 0.35rem; }
    .demo-pin-input { width: 90px; padding: 0.3rem 0.5rem; border: 1px solid var(--color-border, #ccc); border-radius: 6px; font-size: 0.78rem; font-family: monospace; }
    .btn-demo { padding: 0.35rem 0.75rem; border: 1px solid var(--color-primary, #2563eb); border-radius: 6px; background: transparent; color: var(--color-primary, #2563eb); cursor: pointer; font-size: 0.78rem; font-weight: 600; white-space: nowrap; }
    .btn-demo:hover { background: #eff6ff; }
    .btn-demo:disabled { opacity: 0.5; cursor: default; }
    .btn-demo-confirm { padding: 0.3rem 0.55rem; border: none; border-radius: 6px; background: #16a34a; color: #fff; cursor: pointer; font-size: 0.75rem; }
    .btn-demo-confirm:disabled { opacity: 0.5; }
    .btn-demo-cancel { background: none; border: none; cursor: pointer; color: var(--color-muted, #888); font-size: 0.85rem; padding: 0.2rem; }
    .demo-error { color: #dc2626; font-size: 0.78rem; margin: 0.25rem 0 0; }

    .fallback-section { background: var(--color-surface-alt, #f8fafb); border: 1px solid var(--color-border, #e2e8f0); border-radius: 10px; padding: 1.25rem; }
    .fallback-section.empty { background: none; border: 1px dashed var(--color-border, #ccc); }

    .keys-list { display: flex; flex-direction: column; }

    .key-card {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.55rem 0.7rem; border-radius: 8px;
      border: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-surface, #fff);
      margin-bottom: 0.4rem;
      flex-wrap: wrap;
    }
    .key-card.edit-mode { flex-wrap: wrap; }
    .key-card.cdk-drag-preview {
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }
    .cdk-drag-placeholder { opacity: 0.3; }
    .cdk-drag-animating { transition: transform 200ms ease; }
    .keys-list.cdk-drop-list-dragging .key-card:not(.cdk-drag-placeholder) {
      transition: transform 200ms ease;
    }

    .drag-handle { cursor: grab; color: var(--color-muted, #aaa); font-size: 1.1rem; user-select: none; padding: 0 0.2rem; line-height: 1; }
    .drag-handle.static { color: var(--color-muted, #ccc); cursor: default; }

    .field-label { min-width: 70px; max-width: 100px; font-weight: 600; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .field-badge { font-size: 0.7rem; padding: 0.15rem 0.45rem; border-radius: 4px; background: var(--color-surface-alt, #f1f5f9); color: var(--color-muted, #555); white-space: nowrap; }
    .field-model { font-size: 0.75rem; color: var(--color-muted, #888); font-family: monospace; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .field-value { font-family: monospace; color: var(--color-muted, #666); font-size: 0.8rem; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 80px; }

    .field-input { padding: 0.4rem 0.55rem; border: 1px solid var(--color-border, #ccc); border-radius: 6px; font-size: 0.82rem; }
    .label-input { width: 90px; }
    .provider-input { width: 180px; background: var(--color-surface, #fff); }
    .provider-select { width: 180px; background: var(--color-surface, #fff); }
    .custom-provider-input { width: 160px; }
    .model-group { display: flex; align-items: center; gap: 0.3rem; }
    .model-input { width: 150px; font-family: monospace; font-size: 0.78rem; }
    .key-input { flex: 1; font-family: monospace; min-width: 100px; }

    .btn-primary { padding: 0.5rem 1rem; border: none; border-radius: 8px; background: var(--color-primary, #2563eb); color: #fff; font-weight: 600; cursor: pointer; font-size: 0.85rem; }
    .btn-primary:hover { opacity: 0.9; }
    .btn-outline { padding: 0.3rem 0.7rem; border: 1px solid var(--color-border, #ccc); border-radius: 6px; background: transparent; cursor: pointer; font-size: 0.8rem; }
    .btn-save { padding: 0.3rem 0.7rem; border: none; border-radius: 6px; background: #16a34a; color: #fff; cursor: pointer; font-size: 0.8rem; }
    .btn-cancel { padding: 0.3rem 0.7rem; border: none; border-radius: 6px; background: transparent; cursor: pointer; font-size: 0.8rem; color: var(--color-muted, #666); }
    .btn-delete { padding: 0.3rem 0.7rem; border: 1px solid #fca5a5; border-radius: 6px; background: transparent; color: #dc2626; cursor: pointer; font-size: 0.8rem; }
    .btn-delete:hover { background: #fef2f2; }
    .btn-icon-delete {
      display: inline-flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; padding: 0; flex-shrink: 0;
      border: 1px solid #fca5a5; border-radius: 6px;
      background: transparent; color: #dc2626; cursor: pointer;
    }
    .btn-icon-delete:hover { background: #fef2f2; }
    .save-error {
      flex-basis: 100%; color: #dc2626; font-size: 0.78rem; margin-top: 2px;
    }
    .input-error { border-color: #dc2626 !important; }
    .btn-fetch { padding: 0.3rem 0.55rem; border: 1px solid var(--color-primary, #2563eb); border-radius: 6px; background: transparent; color: var(--color-primary, #2563eb); cursor: pointer; font-size: 0.75rem; font-weight: 600; }
    .btn-fetch:disabled { opacity: 0.5; cursor: default; }
    .btn-fetch:hover:not(:disabled) { background: #eff6ff; }
    .btn-sm { white-space: nowrap; }

    .add-btn { margin-top: 0.75rem; }

    .notes-section { margin-top: 2.5rem; border-top: 1px solid var(--color-border, #e2e8f0); padding-top: 1rem; }
    .notes-toggle { background: none; border: none; color: var(--color-muted, #666); cursor: pointer; font-size: 0.85rem; padding: 0; }
    .notes-content { margin-top: 0.75rem; font-size: 0.83rem; color: var(--color-muted, #555); line-height: 1.6; }
    .notes-intro { margin-bottom: 1rem; }
    .notes-content h3 { font-size: 0.88rem; margin: 1rem 0 0.3rem; color: var(--color-text, #333); }
    .notes-content h3:first-of-type { margin-top: 0; }
    .notes-content ol { margin: 0.3rem 0 0.8rem; padding-left: 1.4rem; }
    .notes-content li { margin-bottom: 0.2rem; }
    .notes-content a { color: var(--color-primary, #2563eb); }
    .notes-content code { background: var(--color-surface-alt, #f1f5f9); padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.8rem; }

    .empty-hint { color: var(--color-muted, #999); font-size: 0.85rem; font-style: italic; }

    .loading { text-align: center; color: var(--color-muted, #666); padding: 3rem; }
  `],
})
export class ApiKeysComponent {
  protected loaded = signal(false);
  protected keys = signal<LlmKey[]>([]);
  protected fallbackKey = signal<LlmKey | null>(null);
  protected notesOpen = signal(false);
  protected demoSeeding = signal(false);
  protected demoPinOpen = signal(false);
  protected demoPin = '';
  protected demoError = signal('');

  protected providers = PROVIDERS;

  protected fallbackLabel = '';
  protected fallbackValue = '';
  protected fallbackProvider = '';
  protected fallbackCustomProvider = '';
  protected fallbackModel = '';
  protected fallbackFetchingModels = false;
  protected fallbackAvailableModels: string[] = [];
  protected fallbackEditingExisting = false;
  private fallbackEditingId = '';
  protected fallbackSaveError = signal('');

  private dialog = inject(DialogService);
  private pin = inject(PinService);

  private pinHeaders(): Record<string, string> {
    return { 'x-action-pin': this.pin.getCachedPin() ?? '' };
  }

  private modelMatchesProvider(provider: string, model: string): boolean {
    if (!model) return true;
    const m = model.toLowerCase();
    if (provider === 'gemini' && (m.startsWith('gpt-') || m.startsWith('o1-') || m.startsWith('o3-') || m.startsWith('deepseek-'))) return false;
    if ((provider === 'openai' || provider === 'generic') && (m.startsWith('gemini-') || m.startsWith('deepseek-'))) return false;
    if (provider === 'deepseek' && (m.startsWith('gpt-') || m.startsWith('o1-') || m.startsWith('o3-') || m.startsWith('gemini-'))) return false;
    return true;
  }

  private validateProviderModel(provider: string, model: string, availableModels: string[], label: string): string | null {
    if (!model.trim()) return null;

    if (!this.modelMatchesProvider(provider, model.trim())) {
      const providerName = this.providerLabel(provider);
      return `The model "${model.trim()}" does not belong to ${providerName}. Change the provider or select a model that matches ${providerName} (click Fetch to list available models).`;
    }

    if (availableModels.length > 0 && !availableModels.includes(model.trim())) {
      return `Model "${model.trim()}" was not returned by ${this.providerLabel(provider)}. Click Fetch to refresh the model list, then choose a usable model from the dropdown.`;
    }

    return null;
  }

  constructor(private http: HttpClient) {
    this.load();
  }

  private load(): void {
    this.http.get<{ keys: LlmKey[] }>('/api/v1/admin/llm-keys').subscribe({
      next: (res) => {
        const all = res?.keys ?? [];
        const nonFallback = all
          .filter((k) => !k.isFallback)
          .sort((a, b) => a.priority - b.priority);
        const fallback = all.find((k) => k.isFallback) ?? null;
        this.keys.set(nonFallback);
        this.fallbackKey.set(fallback);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }

  providerLabel(p: string): string {
    return PROVIDERS.find((x) => x.value === p)?.label ?? p;
  }

  maskKey(value: string): string {
    if (!value) return '(not set)';
    return value.substring(0, 3) + '••••••••••••••';
  }

  toggleNotes(): void {
    this.notesOpen.update((v) => !v);
  }

  openDemoPin(): void {
    this.demoPin = '';
    this.demoError.set('');
    this.demoPinOpen.set(true);
  }

  closeDemoPin(): void {
    this.demoPinOpen.set(false);
    this.demoPin = '';
    this.demoError.set('');
  }

  seedDemoKeys(): void {
    if (this.demoSeeding() || !this.demoPin) return;
    this.demoSeeding.set(true);
    this.demoError.set('');
    this.http.post<{ ok: boolean; count: number; message?: string }>('/api/v1/admin/llm-keys/demo-seed', { pin: this.demoPin }).subscribe({
      next: (r) => {
        this.demoSeeding.set(false);
        if (r.count > 0) {
          this.closeDemoPin();
          this.load();
        } else {
          this.demoError.set(r.message || 'No keys found in .env');
        }
      },
      error: (err) => {
        this.demoSeeding.set(false);
        this.demoError.set(err?.error?.message || err?.message || 'Demo seed failed');
      },
    });
  }

  addFallback(): void {
    this.fallbackEditingExisting = false;
    this.fallbackEditingId = '__new__';
    this.fallbackLabel = '';
    this.fallbackValue = '';
    this.fallbackProvider = '';
    this.fallbackCustomProvider = '';
    this.fallbackModel = '';
    this.fallbackAvailableModels = [];
    this.fallbackSaveError.set('');
  }

  editFallback(): void {
    const fb = this.fallbackKey()!;
    this.fallbackEditingExisting = true;
    this.fallbackEditingId = fb.id;
    this.fallbackLabel = fb.label;
    this.fallbackValue = '';
    this.fallbackProvider = PROVIDERS.some((p) => p.value === fb.provider) ? fb.provider : '__custom__';
    this.fallbackCustomProvider = PROVIDERS.some((p) => p.value === fb.provider) ? '' : (fb.provider || '');
    this.fallbackModel = fb.model || '';
    this.fallbackSaveError.set('');
  }

  editingFallback(): boolean {
    return this.fallbackEditingId !== '';
  }

  cancelFallback(): void {
    this.fallbackEditingId = '';
    this.fallbackLabel = '';
    this.fallbackValue = '';
    this.fallbackModel = '';
    this.fallbackAvailableModels = [];
  }

  /** Trash button on the fallback: discard an unsaved one, or delete the saved key. */
  removeFallback(): void {
    const id = this.fallbackEditingExisting ? this.fallbackEditingId : '';
    this.cancelFallback();
    if (id) this.deleteKey(id);
  }

  fetchModelsForFallback(): void {
    const provider = this.fallbackProvider === '__custom__' ? this.fallbackCustomProvider.trim() : this.fallbackProvider;
    const body: Record<string, unknown> = this.fallbackEditingExisting
      ? { id: this.fallbackEditingId }
      : { provider, apiKey: this.fallbackValue.trim() };
    this.fallbackFetchingModels = true;

    let done = false;
    const finalize = () => { if (!done) { done = true; this.fallbackFetchingModels = false; } };
    setTimeout(() => { if (!done) { finalize(); } }, 15000);

    this.http.post<{ models: string[] }>('/api/v1/admin/llm-keys/models', body, { headers: this.pinHeaders(), observe: 'response' }).subscribe({
      next: (res) => {
        try { this.fallbackAvailableModels = res.body?.models || []; } catch (_) {}
        finalize();
      },
      error: () => { finalize(); },
    });
  }

  saveFallback(): void {
    if (!this.fallbackLabel.trim()) { this.fallbackSaveError.set('Label is required.'); return; }
    if (!this.fallbackEditingExisting && !this.fallbackValue.trim()) { this.fallbackSaveError.set('API key is required.'); return; }

    const provider = this.fallbackProvider === '__custom__' ? this.fallbackCustomProvider.trim() : this.fallbackProvider;
    if (!provider) { this.fallbackSaveError.set('Provider is required.'); return; }

    const mismatch = this.validateProviderModel(provider, this.fallbackModel, this.fallbackAvailableModels, this.fallbackLabel);
    if (mismatch) { this.fallbackSaveError.set(mismatch); return; }

    this.fallbackSaveError.set('');

    const payload: Record<string, unknown> = {
      label: this.fallbackLabel.trim(),
      provider,
      model: this.fallbackModel.trim(),
      isFallback: true,
    };
    if (this.fallbackValue.trim()) payload['value'] = this.fallbackValue.trim();

    const req$ = this.fallbackEditingExisting
      ? this.http.put(`/api/v1/admin/llm-keys/${this.fallbackEditingId}`, payload, { headers: this.pinHeaders() })
      : this.http.post('/api/v1/admin/llm-keys', payload, { headers: this.pinHeaders() });

    req$.subscribe({
      next: () => {
        this.fallbackEditingId = '';
        this.load();
      },
      error: (err) => {
        const msg = err?.error?.message || err?.message || 'Save failed. Check the server.';
        this.fallbackSaveError.set(msg);
      },
    });
  }

  addNew(): void {
    const newKey: LlmKey = {
      id: '',
      label: '',
      provider: '',
      model: '',
      value: '',
      priority: this.keys().length,
      isActive: true,
      isFallback: false,
      editing: true,
      editLabel: '',
      editValue: '',
      editProvider: '',
      editModel: '',
    };
    this.keys.update((arr) => [...arr, newKey]);
  }

  editKey(entry: LlmKey): void {
    entry.editing = true;
    entry.editLabel = entry.label;
    entry.editValue = '';
    entry.editProvider = PROVIDERS.some((p) => p.value === entry.provider) ? entry.provider : '__custom__';
    entry.customProvider = PROVIDERS.some((p) => p.value === entry.provider) ? '' : (entry.provider || '');
    entry.editModel = entry.model || '';
  }

  cancelEdit(entry: LlmKey): void {
    if (!entry.id) {
      this.keys.update((arr) => arr.filter((k) => k !== entry));
    } else {
      entry.editing = false;
    }
  }

  /** Trash button in edit mode: discard an unsaved row, or delete a saved key. */
  removeKey(entry: LlmKey): void {
    if (!entry.id) { this.cancelEdit(entry); return; }
    this.deleteKey(entry.id);
  }

  fetchModels(entry: LlmKey): void {
    const provider = entry.editProvider === '__custom__' ? (entry.customProvider?.trim() || '') : (entry.editProvider || entry.provider);
    const body: Record<string, unknown> = entry.id
      ? { id: entry.id }
      : { provider, apiKey: entry.editValue?.trim() || '' };
    entry.fetchingModels = true;

    let done = false;
    const finalize = () => { if (!done) { done = true; entry.fetchingModels = false; } };
    setTimeout(() => { if (!done) { finalize(); } }, 15000);

    this.http.post<{ models: string[] }>('/api/v1/admin/llm-keys/models', body, { headers: this.pinHeaders(), observe: 'response' }).subscribe({
      next: (res) => {
        try { entry.availableModels = res.body?.models || []; } catch (_) {}
        finalize();
      },
      error: () => { finalize(); },
    });
  }

  saveKey(entry: LlmKey): void {
    if (!entry.editLabel?.trim()) { entry.saveError = 'Label is required.'; return; }
    if (!entry.id && !entry.editValue?.trim()) { entry.saveError = 'API key is required.'; return; }

    const provider = entry.editProvider === '__custom__' ? (entry.customProvider?.trim() || '') : (entry.editProvider || entry.provider);
    if (!provider) { entry.saveError = 'Provider is required.'; return; }

    const mismatch = this.validateProviderModel(provider, entry.editModel?.trim() || '', entry.availableModels || [], entry.editLabel || '[key]');
    if (mismatch) { entry.saveError = mismatch; return; }

    entry.saveError = undefined;

    const payload: Record<string, unknown> = {
      label: entry.editLabel.trim(),
      provider,
      model: entry.editModel?.trim() || '',
    };
    if (entry.editValue?.trim()) payload['value'] = entry.editValue.trim();

    if (entry.id) {
      this.http.put(`/api/v1/admin/llm-keys/${entry.id}`, payload, { headers: this.pinHeaders() }).subscribe({
        next: () => {
          entry.label = entry.editLabel?.trim() || entry.label;
          entry.provider = provider;
          entry.model = entry.editModel?.trim() || '';
          entry.editing = false;
          entry.saveError = undefined;
        },
        error: (err) => {
          entry.saveError = err?.error?.message || err?.message || 'Save failed.';
        },
      });
    } else {
      this.http.post<{ id: string }>('/api/v1/admin/llm-keys', {
        ...payload,
        value: entry.editValue?.trim() || '',
      }, { headers: this.pinHeaders() }).subscribe({
        next: () => this.load(),
        error: (err) => {
          entry.saveError = err?.error?.message || err?.message || 'Save failed.';
        },
      });
    }
  }

  deleteKey(id: string): void {
    setTimeout(() => {
      this.dialog
        .confirm('Delete this API key?', {
          detail: 'This action cannot be undone.',
          confirmLabel: 'Delete',
          cancelLabel: 'Cancel',
        })
        .subscribe((ok) => {
          if (ok) this.http.delete(`/api/v1/admin/llm-keys/${id}`, { headers: this.pinHeaders() }).subscribe(() => this.load());
        });
    });
  }

  drop(event: CdkDragDrop<LlmKey[]>): void {
    const list = [...this.keys()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.keys.set(list);
    const reorderPayload = list.map((k, i) => ({ id: k.id, priority: i }));
    this.http.put('/api/v1/admin/llm-keys/reorder', { keys: reorderPayload }, { headers: this.pinHeaders() }).subscribe();
  }
}
