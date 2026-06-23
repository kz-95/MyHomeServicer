# Upload Fix + Customer Quote Images — Implementation Plan (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax.

**Goal:** Fix the broken local-dev photo upload (a stale URL, not a missing route) so arrive/done photos work, then reuse the same pipeline to let customers attach optional images to a quote and have the servicer see them on the dispatch card.

**Architecture:** One emitter bug: `s3.ts` returns a local-upload URL with the wrong prefix + param while `file.service.ts` returns the correct one. Align them. Then quote images ride the existing 3-step pipeline (presign → PUT local-upload → confirm) already used by `jobs.component.ts`. Customer quote-form uploads images, stores returned URLs in `QuoteRequest.images[]` (column added by Plan 1 Task 1), backend returns them on the servicer feed, card expander renders thumbnails in a top-layer lightbox.

**Tech Stack:** Express, Prisma, Angular standalone + signals. Backend tests Jest. Frontend verified by `ng build` + manual (no unit runner).

**Spec:** `docs/superpowers/specs/2026-06-23-dispatch-card-timing-urgent.md` (Stream D + the upload fix). **Prereq:** Plan 1 Task 1 (the `images String[]` column).

---

## File Structure

- `backend/src/lib/s3.ts` — fix the local-upload URL emitter (`:31`).
- `backend/src/services/file.service.ts` — confirm the canonical emitter (`:75`); single source.
- `backend/src/services/quote.service.ts` — accept + persist `images[]` on create.
- `backend/src/routes/quotes.routes.ts` — validate `images[]` (array of strings/URLs).
- `backend/src/services/servicer-quote.service.ts` — return `images[]` on the feed.
- `frontend/src/app/customer/pages/quote-form.component.ts` — optional image upload UI.
- `frontend/src/app/servicer/pages/incoming-quotes.component.ts` — thumbnails + lightbox in expander.

---

## Task 1: Reproduce + fix the local-upload URL mismatch

**Files:**
- Read first: `backend/src/lib/s3.ts:31`, `backend/src/services/file.service.ts:60-80`, `backend/src/routes/index.ts:223` (mount base).
- Modify: whichever emitter is wrong.

- [x] **Step 1: Reproduce.** Start backend + frontend, log in as a servicer with an
  in-progress booking (M8), open Jobs → Mark arrived → pick a photo → Upload.
  Expected (current bug): a 404 like `Route not found: PUT /api/files/local-upload/<id>`.
  Capture the exact URL the frontend PUTs (browser network tab).

- [x] **Step 2: Confirm the mount base.** Read `backend/src/routes/index.ts` around the
  `apiRouter`/`filesRouter` mount. Determine the real prefix — `/api` or `/api/v1` —
  for `filesRouter` (`.use('/files', filesRouter)`).

- [x] **Step 3: Compare the two emitters.**
  - `file.service.ts:75` → ``/api/v1/files/local-upload/${file.id}``
  - `s3.ts:31` → ``/api/files/local-upload/${key}``
  Identify which one the dev presign flow actually returns (trace `createPresignedUpload`).

- [x] **Step 4: Fix the wrong emitter** so the returned URL matches the mounted route
  exactly (correct prefix from Step 2, and the `:fileId` param the route reads, not the
  S3 key). Example fix in `s3.ts:31` if it is the live one:

```typescript
// was: return `/api/files/local-upload/${key}`;
return `/api/v1/files/local-upload/${fileId}`; // match files.routes.ts:35 + mount base
```

  (Adjust to the actual base + param name confirmed in Steps 2-3. If `s3.ts` only has
  `key` in scope, thread `fileId` through, or delegate the URL to `file.service.ts` so
  there is ONE emitter.)

- [x] **Step 5: Verify the fix manually.** Repeat Step 1. Expected: upload succeeds,
  booking flips to in_progress (arrive) / completed (done), photo URL stored.

- [x] **Step 6: Type-gate + commit**

Run: `rtk proxy npx tsc --noEmit`
```bash
git add backend/src/lib/s3.ts backend/src/services/file.service.ts
git commit -m "fix(files): align local-upload URL emitter with mounted route (arrive/done upload)"
```

---

## Task 2: Backend — accept + persist quote images

**Files:**
- Modify: `backend/src/services/quote.service.ts` (`CreateQuoteInput` `24-47`; create block `308-340`)
- Modify: `backend/src/routes/quotes.routes.ts` (create-quote validators ~`146`)

- [x] **Step 1: Add `images` to `CreateQuoteInput`** (after `serviceDetails?`):

```typescript
  /** Optional customer-attached image URLs (confirmed upload URLs). Max 5. */
  images?: string[];
```

- [x] **Step 2: Persist it** in the `prisma.quoteRequest.create({ data: { ... } })` block,
  after `notes: input.notes ?? null,`:

```typescript
      images: input.images ?? [],
```

- [x] **Step 3: Validate in the route.** In `quotes.routes.ts` create-quote validators,
  add:

```typescript
    body('images').optional().isArray({ max: 5 }),
    body('images.*').optional().isString().isLength({ max: 500 }),
```

  And whitelist `images` where the route picks fields into `createQuote` (never pass
  `req.body` directly — per CLAUDE.md). Add `images: req.body.images,` to the call.

- [x] **Step 4: Type-gate + commit**

Run: `rtk proxy npx tsc --noEmit`
```bash
git add backend/src/services/quote.service.ts backend/src/routes/quotes.routes.ts
git commit -m "feat(quote): accept + persist optional customer images"
```

---

## Task 3: Backend — return images on the servicer feed

**Files:**
- Modify: `backend/src/services/servicer-quote.service.ts` (`listIncomingQuotes` `.map`)

- [x] **Step 1: Add to the returned object** (after `descriptions: ...`):

```typescript
        images: q.images ?? [],
```

`images` is a scalar array column on `quoteRequest`, already loaded by the existing
`include` — no `select` change needed.

- [x] **Step 2: Type-gate + commit**

Run: `rtk proxy npx tsc --noEmit`
```bash
git add backend/src/services/servicer-quote.service.ts
git commit -m "feat(servicer): return customer quote images on incoming feed"
```

---

## Task 4: Frontend — quote-form optional image upload

**Files:**
- Read first: `frontend/src/app/customer/pages/quote-form.component.ts` (find the submit
  handler + the step where the payload is assembled) and
  `frontend/src/app/servicer/pages/jobs.component.ts:1268-1319` (`uploadAndAct` — the
  3-step upload to mirror).
- Modify: `quote-form.component.ts`

- [x] **Step 1: Add upload state signals** to the component:

```typescript
  quoteImages = signal<string[]>([]);   // confirmed URLs
  imgUploading = signal(false);
  imgError = signal('');
```

- [x] **Step 2: Add an upload method** mirroring `jobs.component.ts uploadAndAct` steps
  1-3 (presign → PUT → confirm), but for `purpose: 'arrive_photo'`-style — add a
  `quote_image` purpose to the backend presign enum if needed (check
  `file.service.ts` allowed purposes; extend the union + validation if `quote_image`
  is absent). On confirm, push the returned `fileUrl` into `quoteImages`:

```typescript
  async onQuoteImage(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (this.quoteImages().length >= 5) { this.imgError.set('Max 5 images'); return; }
    this.imgUploading.set(true); this.imgError.set('');
    try {
      const { uploadUrl, fileId } = await firstValueFrom(
        this.api.post<{ uploadUrl: string; fileId: string }>('/files/presign',
          { purpose: 'quote_image', mimeType: file.type, sizeBytes: file.size }));
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      const { fileUrl } = await firstValueFrom(
        this.api.post<{ fileUrl: string }>(`/files/${fileId}/confirm`, {}));
      this.quoteImages.update((a) => [...a, fileUrl]);
    } catch (e: any) {
      this.imgError.set('Upload failed');
    } finally { this.imgUploading.set(false); }
  }
```

  (Match the real `ApiService` method signatures + import `firstValueFrom` if not present.
  Confirm whether the PUT goes via `fetch` or `ApiService` by reading `uploadAndAct`.)

- [x] **Step 3: Add the UI** near the notes field in the form template:

```html
  <label class="upload">
    Add photos (optional)
    <input type="file" accept="image/*" (change)="onQuoteImage($event)" [disabled]="imgUploading()" />
  </label>
  @if (quoteImages().length) {
    <div class="thumbs">
      @for (url of quoteImages(); track url) { <img class="thumb" [src]="url" alt="" /> }
    </div>
  }
  @if (imgError()) { <p class="err">{{ imgError() }}</p> }
```

- [x] **Step 4: Include images in the submit payload.** Where the form builds the
  create-quote body, add `images: this.quoteImages(),`.

- [x] **Step 5: Type-gate + build + commit**

Run (from `frontend/`): `npx tsc --noEmit` && `ng build`
```bash
git add frontend/src/app/customer/pages/quote-form.component.ts
git commit -m "feat(quote-form): optional customer image upload"
```

---

## Task 5: Frontend — show quote images in the dispatch-card expander

**Files:**
- Modify: `frontend/src/app/servicer/pages/incoming-quotes.component.ts` (interface + expander, from Plan 2)

- [x] **Step 1: Add `images?: string[];`** to the `IncomingQuote` interface.

- [x] **Step 2: Render thumbnails** in the `.details` expander (after notes):

```html
            @if (q.images?.length) {
              <div class="qimgs">
                @for (url of q.images; track url) {
                  <img class="qimg" [src]="url" alt="job photo" (click)="lightbox.set(url); $event.stopPropagation()" />
                }
              </div>
            }
```

- [x] **Step 3: Lightbox via top-layer `<app-modal>`** (never a fixed backdrop — project
  modal rule, STYLE-RULES §7.0). Add a `lightbox = signal<string | null>(null);` and an
  `<app-modal [open]="!!lightbox()" (close)="lightbox.set(null)">` containing
  `<img [src]="lightbox()" />`. Import the shared `app-modal` component as the codebase
  does elsewhere (grep `app-modal` for the import + selector usage).

- [x] **Step 4: Type-gate + build + commit**

Run: `npx tsc --noEmit` && `ng build`
```bash
git add frontend/src/app/servicer/pages/incoming-quotes.component.ts
git commit -m "feat(servicer): show customer quote images in dispatch card (top-layer lightbox)"
```

---

## Task 6: Verify end-to-end

- [x] **Step 1: Arrive/done upload** works (Task 1 manual repro now passes).
- [x] **Step 2: Quote with images.** As customer.fresh, submit a quote with 1-2 photos.
  Confirm they persist on `QuoteRequest.images`.
- [x] **Step 3: Servicer sees them.** As M9, open that quote's card ▾ expander → thumbnails
  render; clicking one opens the top-layer lightbox (centered, not cropped — verify on a
  page with stagger animation).
- [x] **Step 4: Commit** any fixups.

---

## Self-Review notes

- Spec Stream D → Tasks 2-5. Upload fix → Task 1. The `images` column itself is added in
  Plan 1 Task 1 (single migration), consumed here.
- `quote_image` upload purpose: Task 4 Step 2 flags adding it to the backend presign
  purpose enum if absent — must be done or presign 400s. Check `file.service.ts` allowed
  purposes before Task 4.
- Lightbox MUST be top-layer `<app-modal>` / `<dialog>` — a `position:fixed` backdrop in
  this page would re-anchor to the stagger-transformed page wrapper and crop/off-center
  (project modal law). Reuse the shared component, do not hand-roll.
- Reuses the existing presign→PUT→confirm pipeline; no new upload infra.
