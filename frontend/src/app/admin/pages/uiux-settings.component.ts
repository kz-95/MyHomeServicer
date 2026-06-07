import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { PinService } from '../../core/services/pin.service';

interface CatThumb {
  id: string; name: string; slug: string; imageUrl?: string | null; bannerUrl?: string | null; cardColor?: string | null;
}

@Component({
    selector: 'app-admin-uiux-settings',
    host: { class: 'page-enter' },
    imports: [FormsModule],
    template: `
    <h1>UI/UX Settings</h1>

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (loadFailed()) {
      <p class="err">Could not load settings. Refresh and try again.</p>
    } @else {

      <!-- ════════ Notifications ════════ -->
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

      <!-- ════════ Sounds ════════ -->
      <section class="card page-child">
        <h2>Sounds</h2>
        <p class="muted small">Upload custom notification and chat sounds (.wav, max 500 KB).</p>

        <div class="content-field">
          <label>
            Notification sound
            <span class="muted">
              Played for new booking, quote, or system alerts.
              @if (notifSoundUrl()) { <a [href]="notifSoundUrl()" target="_blank" class="muted">(current)</a> }
            </span>
          </label>
          <div class="upload-row">
            <input type="file" accept=".wav" #notifFile (change)="uploadSound('notification', notifFile)" />
            @if (uploadingNotif()) { <span class="muted">Uploading…</span> }
          </div>
          @if (soundMsg(); as m) { @if (m.key === 'notification') { <p [class.err]="m.error" class="row-msg">{{ m.text }}</p> } }
        </div>

        <div class="content-field">
          <label>
            Chat message sound
            <span class="muted">
              Played for new chat messages.
              @if (chatSoundUrl()) { <a [href]="chatSoundUrl()" target="_blank" class="muted">(current)</a> }
            </span>
          </label>
          <div class="upload-row">
            <input type="file" accept=".wav" #chatFile (change)="uploadSound('chat', chatFile)" />
            @if (uploadingChat()) { <span class="muted">Uploading…</span> }
          </div>
          @if (soundMsg(); as m) { @if (m.key === 'chat') { <p [class.err]="m.error" class="row-msg">{{ m.text }}</p> } }
        </div>
      </section>

      <!-- ════════ Content ════════ -->
      <section class="card page-child">
        <h2>Content</h2>

        <div class="content-field">
          <label>
            Condo entry note
            <span class="muted">Shown when customer selects "Condo" as property type.</span>
            <textarea rows="3" [(ngModel)]="condoEntryNote" name="condoNote" placeholder="If you live in a condo, please inform your management and guide the servicer on how to enter your building."></textarea>
          </label>
          <div class="actions">
            <button class="btn-primary" (click)="saveCondoNote()" [disabled]="savingCondoNote()">
              {{ savingCondoNote() ? 'Saving…' : 'Save note' }}
            </button>
          </div>
          @if (condoMsg(); as m) { <p [class.err]="m.error" class="row-msg">{{ m.text }}</p> }
        </div>

        <div class="content-field">
          <label>
            Landing page text
            <span class="muted">Main headline text on the public home page.</span>
            <textarea rows="2" [(ngModel)]="landingPageText" name="landingText" placeholder="Find trusted home service professionals near you."></textarea>
          </label>
          <div class="actions">
            <button class="btn-primary" (click)="saveLandingText()" [disabled]="savingLandingText()">
              {{ savingLandingText() ? 'Saving…' : 'Save text' }}
            </button>
          </div>
          @if (landingMsg(); as m) { <p [class.err]="m.error" class="row-msg">{{ m.text }}</p> }
        </div>

        <div class="content-field">
          <label>
            Rewards page header
            <span class="muted">Heading text on the customer rewards page.</span>
            <input type="text" [(ngModel)]="rewardsHeader" name="rewardsHeader" placeholder="Earn points on every booking" />
          </label>
          <div class="actions">
            <button class="btn-primary" (click)="saveRewardsHeader()" [disabled]="savingRewardsHeader()">
              {{ savingRewardsHeader() ? 'Saving…' : 'Save header' }}
            </button>
          </div>
          @if (rewardsHeaderMsg(); as m) { <p [class.err]="m.error" class="row-msg">{{ m.text }}</p> }
        </div>
      </section>

      <!-- ════════ Hero banner ════════ -->
      <section class="card page-child">
        <h2>Hero banner</h2>
        <div class="content-field">
          <label>
            Upload image
            <span class="muted">Recommended: 1440×600px, .webp or .jpg.</span>
            <div class="upload-row">
              <input type="file" accept=".webp,.jpg,.jpeg,.png" #heroFile (change)="uploadHeroBanner(heroFile)" />
              @if (uploadingHero()) { <span class="muted">Uploading…</span> }
            </div>
          </label>
          <label>
            Or paste image URL
            <input type="text" [(ngModel)]="heroBannerUrl" name="heroBannerUrl" placeholder="https://…" />
          </label>
          <div class="tb-preview tb-preview--wide">
            @if (heroBannerUrl()) {
              <div class="hero-drag-preview" [style.background-image]="'url(' + heroBannerUrl() + ')'" [style.background-size]="heroBannerZoom() + '%'" [style.background-position]="heroBannerPosX() + '% ' + heroBannerPosY() + '%'">
                <div class="hero-drag-overlay">← Adjust below →</div>
              </div>
            } @else {
              <div class="tb-placeholder">No banner set - showing default placeholder</div>
            }
          </div>
          <div class="adj-group">
            <label class="adj-row">
              <span class="adj-label">Zoom <small>{{ heroBannerZoom() }}%</small></span>
              <input type="range" min="50" max="200" step="5" [(ngModel)]="heroBannerZoom" name="heroBannerZoom" />
            </label>
            <label class="adj-row">
              <span class="adj-label">X Position <small>{{ heroBannerPosX() }}%</small></span>
              <input type="range" min="0" max="100" step="1" [(ngModel)]="heroBannerPosX" name="heroBannerPosX" />
            </label>
            <label class="adj-row">
              <span class="adj-label">Y Position <small>{{ heroBannerPosY() }}%</small></span>
              <input type="range" min="0" max="100" step="1" [(ngModel)]="heroBannerPosY" name="heroBannerPosY" />
            </label>
          </div>
          <div class="actions">
            <button class="btn-primary" (click)="saveHeroBanner()" [disabled]="savingHero() || uploadingHero()">{{ savingHero() ? 'Saving…' : 'Save changes' }}</button>
          </div>
          @if (heroMsg(); as m) { <p [class.err]="m.error" class="row-msg">{{ m.text }}</p> }
        </div>
      </section>

      <!-- ════════ Category thumbnails ════════ -->
      <section class="card page-child">
        <h2>Category thumbnails</h2>
        <p class="muted small">Set thumbnail images and card colours for each category.</p>

        <input class="tb-search" type="search" placeholder="Search categories…" [(ngModel)]="catSearch" name="catSearch" />

        <div class="tb-list">
          @for (cat of filteredCategories(); track cat.id) {
            <div class="tb-row">
              <div class="tb-preview">
                @if (cat.bannerUrl || cat.imageUrl) {
                  <img [src]="cat.bannerUrl || cat.imageUrl || ''" alt="" />
                } @else {
                  <div class="tb-placeholder">No image</div>
                }
              </div>
              <div class="tb-info">
                <strong>{{ cat.name }}</strong>
                <span class="muted small">Banner image</span>
                <div class="upload-row">
                  <input type="file" accept=".webp,.jpg,.jpeg,.png" (change)="uploadCatBanner(cat.id, $event)" />
                  @if (uploadingCatId() === cat.id) { <span class="muted">Uploading…</span> }
                </div>
                <span class="muted small">Or URL</span>
                <input type="text" [ngModel]="cat.bannerUrl" (ngModelChange)="updateBannerUrl(cat.id, $event)" name="burl_{{cat.id}}" placeholder="https://…" />
                <span class="muted small">Card colour</span>
                <div class="tb-color-row">
                  <input type="color" [ngModel]="cat.cardColor" (ngModelChange)="updateCardColor(cat.id, $event)" name="ccolor_{{cat.id}}" />
                  <input type="text" [ngModel]="cat.cardColor" (ngModelChange)="updateCardColor(cat.id, $event)" name="ccolorhex_{{cat.id}}" placeholder="#c95a3c" />
                </div>
                <div class="tb-adj-row">
                  <label class="tb-adj">X <input type="range" min="0" max="100" step="1" [ngModel]="catZoom.get(cat.id) ?? 50" (ngModelChange)="setCatZoom(cat.id, $event)" name="czx_{{cat.id}}" /></label>
                  <label class="tb-adj">Y <input type="range" min="0" max="100" step="1" [ngModel]="catPosY.get(cat.id) ?? 50" (ngModelChange)="setCatPosY(cat.id, $event)" name="czy_{{cat.id}}" /></label>
                  <label class="tb-adj">Zoom <input type="range" min="50" max="200" step="5" [ngModel]="catZoomPct.get(cat.id) ?? 100" (ngModelChange)="setCatZoomPct(cat.id, $event)" name="czp_{{cat.id}}" /></label>
                </div>
              </div>
              <div class="tb-actions">
                <button class="btn-ghost btn-xs" (click)="setBannerUrl(cat.id)" [disabled]="savingId() === cat.id">{{ savingId() === cat.id ? 'Saving…' : 'Save' }}</button>
              </div>
            </div>
          }
        </div>
      </section>
    }
  `,
    styles: [
        `
      :host { display: block; }
      section { max-width: 620px; margin-bottom: 1.4rem; }
      h2 { margin-top: 0; font-size: 1.05rem; }
      .err { color: var(--color-danger); font-size: 0.85rem; }
      .row-msg { font-size: 0.8rem; color: var(--color-success); margin-top: 0.3rem; }
      .row-msg.err { color: var(--color-danger); }
      .small { font-size: 0.82rem; }
      .set-row {
        display: flex; align-items: center; justify-content: space-between; gap: 1rem;
        padding: 0.7rem 0; border-bottom: 1px solid var(--color-border); flex-wrap: wrap;
      }
      .set-row:last-of-type { border-bottom: none; }
      .set-info { display: flex; flex-direction: column; gap: 0.15rem; min-width: 220px; flex: 1; }
      .set-info strong { font-size: 0.92rem; }
      .set-info .muted { font-size: 0.78rem; }
      .set-edit { display: flex; align-items: center; gap: 0.4rem; }
      .toggle-label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; cursor: pointer; }
      .toggle-label input { width: auto; }
      .content-field { padding: 0.7rem 0; border-bottom: 1px solid var(--color-border); }
      .content-field:last-of-type { border-bottom: none; }
      .content-field label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; font-weight: 500; }
      .content-field textarea, .content-field input { width: 100%; max-width: 480px; padding: 0.5rem; font-size: 0.88rem; border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); color: var(--color-text); font-family: inherit; outline: none; }
      .content-field textarea { resize: vertical; }
      .content-field textarea:focus, .content-field input:focus { border-color: var(--color-primary); }
      .actions { margin-top: 0.5rem; }
      .upload-row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.3rem; }
      .adj-group { display: flex; flex-direction: column; gap: 0.5rem; margin: 0.3rem 0; }
      .adj-row { display: flex; align-items: center; gap: 0.5rem; }
      .adj-row span { min-width: 100px; font-size: 0.82rem; color: var(--color-muted); }
      .adj-row small { color: var(--color-muted); margin-left: 0.3rem; }
      .adj-row input[type="range"] { flex: 1; max-width: 240px; }
      .upload-row input[type="file"] { font-size: 0.85rem; }
      .tb-search { width: 100%; max-width: 480px; margin-bottom: 0.5rem; padding: 0.4rem 0.6rem; border: 1px solid var(--color-border); border-radius: var(--radius-input); font-size: 0.85rem; background: var(--color-surface); color: var(--color-text); outline: none; }
      .tb-search:focus { border-color: var(--color-primary); }
      .tb-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem; }
      .tb-row { display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.6rem 0; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; }
      .tb-row:last-of-type { border-bottom: none; }
      .tb-preview { width: 80px; height: 56px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: var(--color-bg); display: flex; align-items: center; justify-content: center; }
      .tb-preview img { width: 100%; height: 100%; object-fit: cover; }
      .tb-preview--wide { width: 100%; height: 120px; max-width: 480px; margin: 0.3rem 0; position: relative; }
      .hero-drag-preview { width: 100%; height: 100%; background-size: cover; cursor: grab; border-radius: 6px; }
      .hero-drag-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.6); font-size: 0.82rem; background: rgba(0,0,0,0.2); pointer-events: none; }
      .tb-placeholder { font-size: 0.7rem; color: var(--color-muted); }
      .tb-info { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 0.2rem; }
      .tb-info strong { font-size: 0.88rem; }
      .tb-info .muted { font-size: 0.72rem; }
      .tb-info input { padding: 0.3rem 0.5rem; font-size: 0.82rem; border: 1px solid var(--color-border); border-radius: var(--radius-input); background: var(--color-surface); color: var(--color-text); outline: none; }
      .tb-info input:focus { border-color: var(--color-primary); }
      .tb-color-row { display: flex; gap: 0.4rem; align-items: center; }
      .tb-color-row input[type="color"] { width: 36px; height: 30px; padding: 2px; border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; }
      .tb-color-row input[type="text"] { flex: 1; }
      .tb-adj-row { display: flex; gap: 0.5rem; margin-top: 0.2rem; }
      .tb-adj { display: flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; color: var(--color-muted); }
      .tb-adj input[type="range"] { width: 50px; height: 16px; }
      .tb-actions { flex-shrink: 0; display: flex; gap: 0.4rem; align-items: center; }
    `,
    ]
})
export class AdminUiuxSettingsComponent implements OnInit {
  private api = inject(ApiService);
  private pin = inject(PinService);
  private http = inject(HttpClient);

  loading = signal(true);
  loadFailed = signal(false);

  categories = signal<CatThumb[]>([]);
  savingId = signal<string | null>(null);
  catSearch = signal('');
  uploadingCatId = signal<string | null>(null);
  catZoom = new Map<string, number>();
  catPosY = new Map<string, number>();
  catZoomPct = new Map<string, number>();
  categoryDrafts = new Map<string, { bannerUrl: string; cardColor: string }>();

  filteredCategories = computed(() => {
    const q = this.catSearch().toLowerCase().trim();
    if (!q) return this.categories();
    return this.categories().filter((c) => c.name.toLowerCase().includes(q));
  });

  // Notification toggles
  notifSoundEnabled = signal(true);
  chatSoundEnabled = signal(true);
  typingSoundEnabled = signal(true);

  // Sound file URLs
  notifSoundUrl = signal<string | null>(null);
  chatSoundUrl = signal<string | null>(null);
  uploadingNotif = signal(false);
  uploadingChat = signal(false);
  soundMsg = signal<{ key: string; text: string; error: boolean } | null>(null);

  // Content fields
  condoEntryNote = signal('');
  savingCondoNote = signal(false);
  condoMsg = signal<{ text: string; error: boolean } | null>(null);

  landingPageText = signal('');
  savingLandingText = signal(false);
  landingMsg = signal<{ text: string; error: boolean } | null>(null);

  rewardsHeader = signal('');
  savingRewardsHeader = signal(false);
  rewardsHeaderMsg = signal<{ text: string; error: boolean } | null>(null);

  // Hero banner
  heroBannerUrl = signal('');
  heroBannerPosX = signal('50');
  heroBannerPosY = signal('30');
  heroBannerZoom = signal('100');
  savingHero = signal(false);
  uploadingHero = signal(false);
  heroMsg = signal<{ text: string; error: boolean } | null>(null);

  ngOnInit(): void {
    this.api.get<{ data: { key: string; value: unknown }[] }>('/admin/settings').subscribe({
      next: (r) => {
        const byKey = new Map(r.data.map((s) => [s.key, s.value]));

        const ns = byKey.get('notification_sound_enabled');
        if (ns != null) this.notifSoundEnabled.set(ns === true);

        const cs = byKey.get('chat_sound_enabled');
        if (cs != null) this.chatSoundEnabled.set(cs === true);

        const ts = byKey.get('typing_sound_enabled');
        if (ts != null) this.typingSoundEnabled.set(ts === true);

        const cn = byKey.get('condo_entry_note');
        if (cn != null) this.condoEntryNote.set(cn as string);

        const lp = byKey.get('landing_page_text');
        if (lp != null) this.landingPageText.set(lp as string);

        const rh = byKey.get('rewards_header');
        if (rh != null) this.rewardsHeader.set(rh as string);

        const hb = byKey.get('hero_banner_url');
        if (hb != null) this.heroBannerUrl.set(hb as string);
        const hpx = byKey.get('hero_banner_pos_x');
        if (hpx != null) this.heroBannerPosX.set(hpx as string);
        const hpy = byKey.get('hero_banner_pos_y');
        if (hpy != null) this.heroBannerPosY.set(hpy as string);
        const hz = byKey.get('hero_banner_zoom');
        if (hz != null) this.heroBannerZoom.set(hz as string);

        const nurl = byKey.get('notification_sound_url');
        if (nurl != null) this.notifSoundUrl.set(nurl as string);

        const curl = byKey.get('chat_sound_url');
        if (curl != null) this.chatSoundUrl.set(curl as string);

        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.loadFailed.set(true); },
    });
    this.loadCategories();
  }

  private loadCategories(): void {
    this.api.get<{ data: CatThumb[] }>('/admin/categories').subscribe({
      next: (res) => { this.categories.set(res.data ?? []); },
    });
  }

  updateBannerUrl(id: string, val: string): void {
    const d = this.categoryDrafts.get(id) ?? { bannerUrl: '', cardColor: '' };
    d.bannerUrl = val;
    this.categoryDrafts.set(id, d);
  }

  updateCardColor(id: string, val: string): void {
    const d = this.categoryDrafts.get(id) ?? { bannerUrl: '', cardColor: '' };
    d.cardColor = val;
    this.categoryDrafts.set(id, d);
  }

  setCatZoom(id: string, val: number): void { this.catZoom.set(id, val); }
  setCatPosY(id: string, val: number): void { this.catPosY.set(id, val); }
  setCatZoomPct(id: string, val: number): void { this.catZoomPct.set(id, val); }

  setBannerUrl(id: string): void {
    const d = this.categoryDrafts.get(id);
    if (!d) return;
    this.savingId.set(id);
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) { this.savingId.set(null); return; }
      const body: { bannerUrl?: string | null; cardColor?: string | null; bgPosX?: number; bgPosY?: number; bgZoom?: number } = {};
      if (d.bannerUrl !== undefined) body.bannerUrl = d.bannerUrl || null;
      if (d.cardColor !== undefined) body.cardColor = d.cardColor || null;
      if (this.catZoom.has(id)) body.bgPosX = this.catZoom.get(id)!;
      if (this.catPosY.has(id)) body.bgPosY = this.catPosY.get(id)!;
      if (this.catZoomPct.has(id)) body.bgZoom = this.catZoomPct.get(id)!;
      this.api.patch(`/admin/categories/${id}`, body, { 'x-action-pin': pin }).subscribe({
        next: () => {
          this.savingId.set(null);
          this.categoryDrafts.delete(id);
          this.loadCategories();
        },
        error: () => { this.savingId.set(null); },
      });
    });
  }

  private persist(key: string, value: unknown, saving: ReturnType<typeof signal<boolean>>, msg: ReturnType<typeof signal<{ text: string; error: boolean } | null>>): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      saving.set(true);
      msg.set(null);
      this.api.patch('/admin/settings', { key, value }, { 'x-action-pin': pin }).subscribe({
        next: () => { saving.set(false); msg.set({ text: 'Saved.', error: false }); },
        error: (e) => { saving.set(false); msg.set({ text: e.message ?? 'Save failed', error: true }); },
      });
    });
  }

  saveNotifSound(): void {
    this.persist('notification_sound_enabled', this.notifSoundEnabled(), signal(false), signal(null));
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.api.patch('/admin/settings', { key: 'notification_sound_enabled', value: this.notifSoundEnabled() }, { 'x-action-pin': pin }).subscribe({ error: () => {} });
    });
  }

  saveChatSound(): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.api.patch('/admin/settings', { key: 'chat_sound_enabled', value: this.chatSoundEnabled() }, { 'x-action-pin': pin }).subscribe({ error: () => {} });
    });
  }

  saveTypingSound(): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.api.patch('/admin/settings', { key: 'typing_sound_enabled', value: this.typingSoundEnabled() }, { 'x-action-pin': pin }).subscribe({ error: () => {} });
    });
  }

  saveCondoNote(): void {
    this.persist('condo_entry_note', this.condoEntryNote().trim() || null, this.savingCondoNote, this.condoMsg);
  }

  saveLandingText(): void {
    this.persist('landing_page_text', this.landingPageText().trim() || null, this.savingLandingText, this.landingMsg);
  }

  saveRewardsHeader(): void {
    this.persist('rewards_header', this.rewardsHeader().trim() || null, this.savingRewardsHeader, this.rewardsHeaderMsg);
  }

  saveHeroBanner(): void {
    this.savingHero.set(true);
    this.heroMsg.set(null);
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) { this.savingHero.set(false); return; }
      const patches = [
        { key: 'hero_banner_url', value: this.heroBannerUrl().trim() || null },
        { key: 'hero_banner_pos_x', value: this.heroBannerPosX() },
        { key: 'hero_banner_pos_y', value: this.heroBannerPosY() },
        { key: 'hero_banner_zoom', value: this.heroBannerZoom() },
      ];
      let idx = 0;
      const next = () => {
        if (idx >= patches.length) { this.savingHero.set(false); this.heroMsg.set({ text: 'Saved.', error: false }); return; }
        this.api.patch('/admin/settings', patches[idx], { 'x-action-pin': pin }).subscribe({
          next: () => { idx++; next(); },
          error: (e) => { this.savingHero.set(false); this.heroMsg.set({ text: e.message ?? 'Save failed', error: true }); },
        });
      };
      next();
    });
  }

  // ── Category banner upload ──
  uploadCatBanner(catId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.uploadingCatId.set(catId);
      this.api.post<{ id: string; uploadUrl: string; fileUrl: string }>('/files/presign', {
        purpose: 'banner_image', mimeType: file.type, sizeBytes: file.size,
      }).pipe(
        switchMap((presign) => this.http.put(presign.uploadUrl, file, { headers: { 'Content-Type': file.type } }).pipe(
          switchMap(() => this.http.post(`/api/v1/files/${presign.id}/confirm`, {})),
          switchMap(() => this.api.patch(`/admin/categories/${catId}`, { bannerUrl: presign.fileUrl }, { 'x-action-pin': pin })),
        )),
      ).subscribe({
        next: () => { this.uploadingCatId.set(null); input.value = ''; this.loadCategories(); },
        error: () => { this.uploadingCatId.set(null); },
      });
    });
    input.value = '';
  }

  // ── Hero banner upload ──
  uploadHeroBanner(input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.heroMsg.set({ text: 'Only image files (.webp, .jpg, .png) are supported.', error: true });
      return;
    }
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.uploadingHero.set(true);
      this.heroMsg.set(null);

      this.api.post<{ id: string; uploadUrl: string; fileUrl: string }>('/files/presign', {
        purpose: 'banner_image', mimeType: file.type, sizeBytes: file.size,
      }).pipe(
        switchMap((presign) => {
          return this.http.put(presign.uploadUrl, file, {
            headers: { 'Content-Type': file.type },
          }).pipe(
            switchMap(() => this.http.post(`/api/v1/files/${presign.id}/confirm`, {})),
            switchMap(() => this.api.patch('/admin/settings', {
              key: 'hero_banner_url', value: presign.fileUrl,
            }, { 'x-action-pin': pin })),
          );
        }),
      ).subscribe({
        next: () => {
          this.uploadingHero.set(false);
          this.heroMsg.set({ text: 'Uploaded and saved.', error: false });
          input.value = '';
        },
        error: (e) => {
          this.uploadingHero.set(false);
          this.heroMsg.set({ text: e.message ?? 'Upload failed', error: true });
        },
      });
    });
    input.value = '';
  }

  // ── Sound file upload ──
  uploadSound(kind: 'notification' | 'chat', input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.includes('wav') && !file.name.endsWith('.wav')) {
      this.soundMsg.set({ key: kind, text: 'Only .wav files are supported.', error: true });
      return;
    }
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      const uploading = kind === 'notification' ? this.uploadingNotif : this.uploadingChat;
      const urlSignal = kind === 'notification' ? this.notifSoundUrl : this.chatSoundUrl;
      const settingKey = kind === 'notification' ? 'notification_sound_url' : 'chat_sound_url';
      uploading.set(true);
      this.soundMsg.set(null);

      // Presigned upload flow: get upload URL → upload to S3 → confirm → save setting
      this.api.post<{ id: string; uploadUrl: string; fileUrl: string }>('/files/presign', {
        filename: file.name,
        contentType: file.type || 'audio/wav',
        size: file.size,
      }).pipe(
        switchMap((presign) => {
          return this.http.put(presign.uploadUrl, file, {
            headers: { 'Content-Type': file.type || 'audio/wav' },
          }).pipe(
            switchMap(() => {
              return this.http.post(`/api/v1/files/${presign.id}/confirm`, {});
            }),
            switchMap(() => {
              return this.api.patch('/admin/settings', {
                key: settingKey,
                value: presign.fileUrl,
              }, { 'x-action-pin': pin });
            }),
          );
        }),
      ).subscribe({
        next: () => {
          uploading.set(false);
          urlSignal.set(null); // will be refreshed on next load
          this.soundMsg.set({ key: kind, text: 'Sound uploaded and saved.', error: false });
        },
        error: (e) => {
          uploading.set(false);
          this.soundMsg.set({ key: kind, text: e.message ?? 'Upload failed', error: true });
        },
      });
    });
    input.value = '';
  }
}
