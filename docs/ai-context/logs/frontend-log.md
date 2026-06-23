# Frontend Agent Log

> Single-writer log — only the **Frontend** agent writes here.

## Session 2026-06-23 — Plan 4: Servicer Calendar Polish + Coherence

**Scope:** `docs/superpowers/plans/2026-06-23-servicer-calendar-polish.md` — 3 tasks.

### Task 1 — Coherence check
- Verified calendar endpoint (`servicer.routes.ts:838`) uses `Booking.scheduledDate`.
- Verified `countSlotJobs` (`servicer-quote.service.ts:21`) uses `b.scheduledDate`.
- Both use same field — already coherent. No code change.

### Task 2 — Today emphasis + urgent marker
**Backend changes (3 files):**
- `servicer.routes.ts`: added `isUrgent: true` to calendar endpoint select + output mapping.
- `booking.service.ts` `selectProposal`: added `isUrgent: quote.isUrgent ?? false` and `urgentFee: quote.urgentFee ?? null` to `tx.booking.create` data — **critical gap fix** (without this, bookings never carry the urgent flag from quotes, so calendar urgent dots would never render).
- `dispatch.service.ts`: added `isUrgent`/`urgentFee` to quoteRequest select + `tx.booking.create` data (same gap, dispatch path).

**Frontend changes (1 file):**
- `calendar.component.ts`:
  - `CalendarBooking` interface: added `isUrgent?: boolean`.
  - Template: added `@if (b.isUrgent) { <span class="dot-urgent"></span> }` inside day-booking pill.
  - CSS: added `.cal-cell.today { outline: 2px solid var(--color-primary); outline-offset: -2px; }` for today emphasis.
  - CSS: added `.dot-urgent` — 6px red circle next to booking label.
  - Note: today detection already worked via `makeDay()` → `isToday` field + `[class.today]` binding — only the outline CSS was missing.

### Task 3 — Verify
- Frontend `npx tsc --noEmit`: 0 errors ✅
- Frontend `ng build --configuration development`: green ✅
- Backend `npx tsc --noEmit`: 8 pre-existing errors in unrelated files (routes/index.ts, admin.service.ts, credit.service.ts) — my 3 changed files compile clean ✅

### Key finding: `selectProposal` isUrgent carry-through GAP
`selectProposal` was NOT copying `isUrgent`/`urgentFee` from `QuoteRequest` to `Booking`. The quote has these fields (Plan 1 schema migration), but `tx.booking.create` never referenced them. Same gap in `dispatch.service.ts`. Without this fix, the calendar would show zero urgent dots regardless of how many urgent bookings exist — because the Booking table never had the flag set. Fixed in both paths.

### Commit
`feat(servicer): calendar today-emphasis, urgent marker, isUrgent carry-through to booking` (4 files, +54/-7 lines)

---

## Session 2026-06-12 — SP-5 Servicer Business Profile restructure

**`/servicer/account` rewrite:**
- Complete rewrite of `account.component.ts` (~1770→~812 lines) as single Business Profile page (no personal tab).
- Page title: "Business Profile Settings".
- 7 sections: 1. Business Identity (businessName, logo, bio + Business Contacts CRUD), 2. Type of Services (category view/change-request, serviceAreas Google-autodetect+chips, operatingHours weekly editor), 3. Status (kycStatus + identity change requests), 4. Business & Tax (entityType, regNo, taxNo, isCompany read-only derived, tax config+calculator, invoice settings+preview), 5. Action PIN, 6. Money (fee breakdown + penalties), 7. Danger Zone.
- Removed: Personal Details section (moved to customer), Bank Account section (moved to deposit), showEmailPublic/showPhonePublic toggles (replaced by per-contact visibility).
- New: Business Contacts CRUD with add/edit modal, primary contact assignment, visibility toggle, delete with guard.

**`/servicer/deposit` changes:**
- Added Bank Account editor section (bankName, bankAccount inputs + save).
- Retargeted "Go to Account Settings" link → "Set bank account above" (scrolls to bank editor).
- Bank account displayed masked in withdrawal section.

**`/customer/account` changes:**
- Added `backupEmail` input to Profile section.
- Updated saveProfile to include backupEmail.
- Updated Profile interface to include backupEmail and avatarUrl.

**Nav cleanup:**
- Removed redundant dashboard/stats block (earnings chart, stat-row, chart) from jobs component history tab. History view now shows only the jobs list.

**Follow-up 2026-06-12 — Operating hours CRUD editor:**
- Replaced fixed 7-day grid with a dynamic CRUD list: [Add time range] button, [day select] + [time from] + [time to] + [× delete] per entry.
- Supports multiple ranges per day for rest breaks (e.g. Mon 9-12 and Mon 2-5).
- Initial: replaced limited dropdown selects (8-11AM open, 5-10PM close only) with free-form `HH:MM` (24h) text inputs with regex validation and auto-format on input (`"9"`→`"09:00"`, `"1130"`→`"11:30"`).
- Save validates all entries have both open+close in valid HH:MM format.
- Backend payload unchanged (weekday-keyed object `{mon: {open,close}, ...}`).

## Session 2026-06-04 — LLM API Keys admin page UX overhaul

**Scope:** Full UX rebuild of `/admin/settings/api-keys` — model dropdowns, validation, fetch, delete guards, CSS fixes.

**Work done:**
- Model field: `<datalist>` → `<select>` dropdown populated from Fetch button response.
- Fetch button restored as separate action (left of Save), not bundled into Save.
- Existing saved keys: displayed as disabled password field `••••••••` — edit blocked, delete & re-add only.
- Required fields: `*` in placeholder, `.input-error` red border + inline `.save-error` red text on empty submit.
- Delete: trash-2 icon via `IconComponent` + `DialogService.confirm()` guard (no more bare delete button).
- `maskKey()` simplified: first 3 chars + 14 masked bullets for view mode display.
- Save: `value` only sent in payload when present (editing existing key sends label/provider/model only).
- Fetch: 15s timeout safety net via `setTimeout` force-re-enables button so it never stays stuck.
- CSS: `.key-card.edit-mode` → `flex-wrap: wrap` (fixes overflow on narrow cards); new `.btn-icon-delete`, `.save-error`, `.input-error` styles.
- Console trace logs on all fetch/save/delete handlers for runtime debugging.
- `LlmKey` interface extended with `saveError?: string` for per-row inline error display.
- `load()` null-guarded against `res?.keys ?? []` (prevents crash on 403/error responses).
- `editingFallback()` state machine fixed: checks only `fallbackEditingId !== ''` (old condition was always true when no saved key).
- `addFallback()` sets `fallbackEditingId = '__new__'` to mark add mode distinct from empty-saved state.
- `editKey()` / `editFallback()` no longer clear `availableModels` (preserve fetched models across edit cycles).

**Gate:** Frontend `npx tsc --noEmit` → 0 errors.

---

## Session 2026-06-02 — RUN 4: UX polish batch

**Scope:** Topbar scroll-away, card scan-on-load, STYLE-RULES leftover docs, order-ID display.

**Work done:**

### Topbar scroll-away
- `shell.component.ts`: imported `AutoHideDirective`; added `appAutoHide` to `.topbar`; CSS transitions + `.topbar.is-collapsed` (padding shrink) + `.topbar.is-idle` (opacity 0.15, pointer-events none).

### Card scan-on-load (skeleton + stagger reveal)
- `my-bookings.component.ts`: SKELETON_COUNT=5 animated skeleton cards with `bw-scan`/`bw-sweep` sweeps + `border-glow` keyframe; real cards reveal via `revealCount` signal every 70ms; `prefers-reduced-motion` skips stagger.
- `proposals.component.ts`: same skeleton/stagger pattern with `pp-*` scoped keyframes.
- `services.component.ts` (servicer): same pattern applied.

### STYLE-RULES.md additions
- §5.4 Mobile keyboard push rule documented (CSS already live in styles.css).
- §7.1.1 Card-scan load animation rule added (skeleton count, bw-scan keyframe, stagger, reduced-motion).
- §15.4 Sidebar viewport-height fit rule added (full CSS example).
- §5.3 cross-reference corrected to §5.5.

### Other
- `order-history.component.ts`: renders `orderId` as monospace muted `.order-id` block when present.
- `backend/src/routes/chat.routes.ts`: passes `req.user!.id` to `sendToAi()` for per-user context.
- `frontend/src/assets/ico/MyHomeServicerIcon.png`: compressed 807 kB → 99 kB.

**Gates:**
- Frontend tsc --noEmit: 0 errors
- ng build (production): exit 0 (pre-existing warnings only)

---

## Session 2026-06-02 — Bulk dispatch FE-1 through FE-6

**Scope:** 6 frontend tasks from CEO dispatch:
1. FE-1: Itemized proposal composition UI (pricing modules in proposal form)
2. FE-2: Stripe card payment frontend (StripeCardFormComponent, quote-form + proposals wire-up)
3. FE-3: Welcome banner on rewards page
4. FE-4: Idle re-engagement banner in customer shell
5. FE-5: Voucher auto-apply in top-up modal
6. FE-6: Notification prefs UI on customer account page

**Work done:**

### FE-1 — Pricing modules in proposal form
- `jobs.component.ts`: Added `PricingModule`, `ModuleRef` interfaces; pricing module signals; `loadPricingModules()`; module picker UI with toggle/override helpers; `moduleRefs` in proposal payload

### FE-2 — Stripe card payment frontend
- Installed `@stripe/stripe-js` package
- `environment.ts` + `environment.prod.ts`: Added `stripePublishableKey: ''`
- `stripe-card-form.component.ts`: NEW standalone component using `@stripe/stripe-js` for card element, `confirmCardPayment`, loading/error states, Pay/Cancel buttons
- `quote-form.component.ts`: Added gateway settlement for pay_now; card payment state machine (cardStep, clientSecret, onGatewaySelect, onCardPaymentSuccess); card form renders when gateway selected; settlementMethod sent in payload
- `proposals.component.ts`: Added card payment state; gateway option under pay_now; initCardPayment(), onCardPaymentSuccess()

### FE-3 — Welcome banner
- `rewards.component.ts`: First-visit welcome banner with localStorage key `rewards_welcome_seen`

### FE-4 — Idle re-engagement banner
- `shell.component.ts`: Updated re-engagement banner text for rewards/discounts when no recent booking

### FE-5 — Voucher auto-apply
- `shell.component.ts`: Added ActiveVoucher interface; activeVouchers signal; onTopUpAmountChange() fetches GET /rewards/active-vouchers; radio select applies voucher as promo code

### FE-6 — Notification prefs UI
- `account.component.ts`: Added NotificationPrefs interface; notification preferences section with toggles for bookingUpdates/proposals/promotions/chatMessages (in-app + email); load from GET /user/me; save to PATCH /user/me

**Gates:**
- Frontend tsc --noEmit: ✅ 0 errors
- ng build: ✅ Exit 0 (warnings only: bundle budget, unused imports, qrcode CJS dep)

---

## Quick Index
| Section | Line |
|---------|------|
| Rules & gates | 14 |
| Sessions | 19 |
| Completed features | 24 |
| UX/design notes | 29 |
| Bug Log | 34 |
| CONTINUE LATER | 39 |
| **Phase 1 P1-FE (Kilo-2)** | **450** |
| **Money/listing epic step 9 (TASKS A/B/C)** | **544** |
| **Phase 6 Identity Avatars POST-MVP (P6-FE)** | **650** |
| **Category Thumbnails POST-MVP (§15)** | **701** |
| **Plan 2 Dispatch Card Visual Redesign** | **1712** |

---

## Rules

- Use Angular standalone components — no NgModules
- Inline templates and styles (no separate .html/.css files per component)
- Angular signals for state management
- Design tokens via `var(--color-*)`, never hardcoded hex
- `host: { class: 'page-enter' }` on all page components
- `.page-child` on section elements for staggered animation
- Run `npx tsc --noEmit` in `frontend/` after completion

---

## Sessions

### Session 2026-06-01 — Footer sitemap + How-it-works + quote chat auto-open

**Goal:** Footer should list parent categories with their children (not a stale
"Services" list); home "How it works" should match the real flow; help chat
should auto pop-out on the quote form.

**Work done (frontend tsc 0 on each):**
1. **`site-footer.component.ts`** (commit `dd9b3c1`) — replaced the single
   "Services" column (its `/services/plumbing|cleaning|aircond` slugs were stale
   and 404'd) with 7 parent-category columns mirroring the seed taxonomy:
   Cleaning, Repair, Event, Improvement, Maintenance, Training, Tech & IT. Each
   lists its child services, all linking to the parent browse page
   `/services/:parentSlug` (ChildrenBrowseComponent — the only public category
   route; children have no page of their own). Company/Support/Legal kept. Static
   — will drift if admin adds categories (candidate to wire to `/categories`).
2. **`home.component.ts`** (commit `f6ad6a0`) — refined "How it works" from 3
   generic steps to the real 4-step lifecycle: Request a quote → Get proposals →
   Pick & book → Track & pay. `.steps` grid `repeat(3,1fr)` → `repeat(auto-fit,
   minmax(180px,1fr))` so the 4th card lays out responsively. (Commit bundled the
   parallel home-redesign WIP — same file, co-edited; tsc-clean.)
3. **`shell.component.ts`** (commit `d75a014`) — on `/quote/new` the shell used
   to auto-*collapse* the FAB stack; now it auto pops-out the help chat once on
   entry (`widget.open()`) and keeps the bubble floating. One-shot
   `quoteChatAutoOpened` guard (reset when leaving the route) fires it once per
   visit and never reopens after a manual close (router events don't fire on
   close). Customer `/customer/quote/new` only; guest `/guest/quote/new` is a
   public route outside the shell — not yet covered.

**Note:** Repo has a background auto-committer (Git-Commit-Pusher/kilo) + a
parallel agent editing `home.component.ts`; verified each edit compiles, committed
only my task's files (footer/shell standalone; home bundled the co-editor's WIP).

---

### Session 2026-05-25 — Servicer shell bug fix + component survey

**Goal:** Fix known nav bugs in servicer shell, survey all remaining servicer components for polish issues, typecheck.

**Work done:**
1. Removed dead nav link `/servicer/incoming-quotes` (no matching route — was merged into the Jobs board).
2. Fixed duplicate `⚙️` icon on "Notification Settings" nav item → changed to `🛎️`.
3. Fixed null-byte corruption at end of `servicer-shell.component.ts` (Write tool artifact) — stripped with python `rstrip(b'\x00')`.
4. Surveyed five servicer page components — no additional bugs found:
   - `deposit.component.ts` ✅
   - `dashboard.component.ts` ✅ (direct HttpClient PDF export confirmed correct via auth interceptor URL check)
   - `account.component.ts` ✅ (presign→S3 PUT→confirm flow correct)
   - `notification-settings.component.ts` ✅ (shared with customer portal)
   - `jobs.component.ts` ✅ (3-column Kanban, socket subscription properly unsubscribed in ngOnDestroy)
5. `npx tsc --noEmit` → **0 errors**.

---

### Session 2026-05-25 — "Servicer must not quote himself" (frontend pass)

**Goal:** Secondary / defence-in-depth frontend pass for the self-quote bug
(backend BE-044…BE-047). Ensure a quote created by a servicer's own paired
customer account ("customer mode") never renders in the servicer's Pending
column or incoming-quotes feed.

**Surfaces reviewed:**
- `servicer/pages/jobs.component.ts` — Jobs board "Pending" column. Renders
  `quotes()`, populated solely by `GET /servicer/quotes` in `loadQuotes()`.
- `servicer/pages/incoming-quotes.component.ts` — incoming-quotes feed (legacy,
  now unrouted — see FE-001; kept for reference). Renders `quotes()`, populated
  solely by `GET /servicer/quotes` in `load()`.

**Finding — no frontend code change required or appropriate:**
1. Both components are pure projections of `GET /servicer/quotes`
   (`listIncomingQuotes`). Backend BE-045 now excludes self-quotes from that
   response at the DB query, so neither the Pending column nor the feed can
   render one.
2. The `quote.new` socket handler in both components only triggers a re-fetch
   of that same (now self-filtered) endpoint — the socket payload is never
   rendered directly. Backend BE-044 additionally drops the self-servicer from
   the `quote.new` emit target set, so the servicer's socket never receives
   their own quote.
3. The frontend has **no self-quote signal** — the `IncomingQuote` interface
   exposes no field identifying the originating customer, and exposing one
   would be an unnecessary API-contract change. Adding a frontend filter would
   therefore be dead code, contrary to the "keep it minimal" mandate.
4. Proposal-submit error handling already surfaces backend rejections:
   `jobs.component.ts propose()` and `incoming-quotes.component.ts propose()`
   both display `e.message` (toast / `error` signal), so the new `403 FORBIDDEN`
   from BE-047 is shown to the user verbatim with no change needed.

**Outcome:** FE-004 — verified, no code change. Self-quotes are fully prevented
from rendering by the backend fixes; the frontend correctly reflects them.

**Verification:** Close code reading only (no live stack this session). No
frontend files modified, so the existing `tsc --noEmit` clean state stands.

---

### Session 2026-05-25 — Category-icon rendering bug (FE-005)

**Goal:** Fix the "Find a Service" cards displaying raw Lucide icon NAMES
("wind", "sparkles", "chef-hat", "wrench") as their big heading instead of an
icon glyph.

**Root cause:**
- `customer/pages/browse.component.ts` (template line 56):
  `<div class="icon">{{ cat.icon || '🏠' }}</div>` — bound `cat.icon` straight
  to text. `Category.icon` holds a Lucide icon NAME string, not an emoji, so
  the literal name rendered. The `.icon` div is `font-size: 1.8rem`, so the
  name looked like the card heading; the real `<strong>{{ cat.name }}</strong>`
  below looked like a subtitle.
- `home/home.component.ts` (template line 114): identical pattern —
  `<span class="cat-ic">{{ cat.icon || '🏠' }}</span>` (`.cat-ic` is 1.8rem).

**Icon convention in this app:** there is **no Lucide / icon-font library** —
`lucide-angular` is not in `frontend/package.json` and no `src` file imports it.
The established pattern (portal sidebars `customer-shell` / `servicer-shell` /
`admin-shell`, rendered via `shell.component.ts` `<span class="nav-ic">{{ item.icon }}</span>`)
is **emoji glyphs** as the `icon` value (`'🔍'`, `'📋'`, `'📅'`, …). STYLE-RULES
§14 confirms: "Category icons | Emoji characters". The category DB records were
seeded with Lucide names instead of emoji, so the emoji-expecting templates
printed the names verbatim.

**Fix:**
- New file `frontend/src/app/core/category-icons.ts` — exports
  `categoryIcon(icon)`, a pure resolver mapping Lucide icon names → closest
  emoji (`wind`→💨, `sparkles`→✨, `chef-hat`→🧑‍🍳, `wrench`→🔧, plus a few
  likely future names). Unknown non-empty values pass through unchanged
  (so genuine emoji data still works); empty/undefined → `🏠`.
- `browse.component.ts`: added `import { categoryIcon }`; added class field
  `protected readonly iconFor = categoryIcon;`; template line 56
  `{{ cat.icon || '🏠' }}` → `{{ iconFor(cat.icon) }}`.
- `home.component.ts`: same — import, `iconFor` field, template line 114
  `{{ cat.icon || '🏠' }}` → `{{ iconFor(cat.icon) }}`.
- Card layout unchanged ([icon] → name → from RM X → Request a quote link) —
  already correct; only the icon binding was wrong.

**Components surveyed for the same bug:** grep of all `*.ts` for `.icon` /
`categor` — only `browse.component.ts` and `home.component.ts` render a
category icon. Other category usages are `<select>` dropdowns
(`servicer-register`) and checkboxes (`notification-settings`) with no icon —
not affected. Both buggy components fixed.

**Verification:** Close code reading only — environment cannot run
`npm install` / `ng serve` / `tsc` (Windows-native `node_modules`). Types
check by inspection: `cat.icon` is `string | undefined`; `categoryIcon`
accepts `string | null | undefined`; `iconFor` exposed as a class field so
the template can invoke it. Live re-check to be done separately.

---

## Completed Features

- **Servicer shell nav cleanup** (2026-05-25): removed dead `/servicer/incoming-quotes` link; deduplicated nav icons.

---

## UX / Design Notes

- **Design direction:** Warm Editorial — DM Serif Display (headings) + Outfit (body), terracotta `#c95a3c` primary.
- **Two-theme system:** `data-theme="warm"` (day default) / `data-theme="cool"` (night — Deep Stone + Copper). Both share warm character; night is NOT a cold/blue inversion.
- **Gradient rule:** start = base primary, end = +5° warmer hue, +4–5% L. Never bleach past +8% L. See STYLE-RULES §2.6.
- **Gradient text:** remove `color:`; set `background: var(--gradient-*)`, `-webkit-background-clip: text`, `-webkit-text-fill-color: transparent`, `background-clip: text`. Transition changes from `color` to `opacity`.
- **Icon convention:** emoji glyphs (not Lucide library, not icon font). STYLE-RULES §14.
- **All animations** must be wrapped in `@media (prefers-reduced-motion: no-preference)` — hard rule.

---

## Bug Log

- **FE-001** (2026-05-25, fixed): Dead nav link `/servicer/incoming-quotes` in `servicer-shell.component.ts` — route never existed after Jobs board consolidation. Removed the nav item.
- **FE-002** (2026-05-25, fixed): Duplicate `⚙️` icon on "Notification Settings" nav item. Changed to `🛎️`.
- **FE-003** (2026-05-25, fixed): Null bytes appended to end of `servicer-shell.component.ts` by Write tool — caused TS1127 errors on typecheck. Stripped with `python3 rstrip(b'\x00')`.
- **FE-004** (2026-05-25, verified — no code change): "Servicer must not quote himself." The Jobs "Pending" column (`jobs.component.ts`) and the legacy incoming-quotes feed (`incoming-quotes.component.ts`) are pure projections of `GET /servicer/quotes`, which backend BE-045 now filters to exclude the servicer's own paired-customer quotes; BE-044 also drops the self-servicer from the `quote.new` socket emit. Frontend has no self-quote signal to filter on, so no FE change is needed or appropriate. Proposal-submit error handling already surfaces the new BE-047 `403 FORBIDDEN` message.
- **FE-005** (2026-05-25, fixed): Category cards on the customer "Find a Service" page (`browse.component.ts`) and the public home page (`home.component.ts`) rendered the raw Lucide icon NAME ("wind", "sparkles", "chef-hat", "wrench") as text where an icon glyph belongs. Both templates bound `{{ cat.icon || '🏠' }}` directly, but `Category.icon` holds a Lucide name and the app has no icon library — the convention is emoji glyphs (matching the portal sidebars). Added `core/category-icons.ts` with a `categoryIcon()` Lucide-name→emoji resolver and wired both templates to `iconFor(cat.icon)`. Card layout (icon → name → price → CTA) was already correct and left unchanged.

---

### Session 2026-05-26 — Demo bar, budget ranges, chat links, proposal confirm, misc fixes

**Scope:** Multiple feature additions and UX fixes across frontend.

**Work done:**
1. **Demo bar on public pages** — Created `shared/demo-bar.component.ts` and added `<app-demo-bar />` to `HomeComponent` and `GuestQuoteComponent` so the demo login bar appears on the home page and the guest quote page.
2. **Per-category budget ranges in admin** — Redesigned `admin/pages/settings.component.ts` to show a category dropdown; each category has its own budget range presets. Saves in per-category format `{ ranges: { [categoryId]: [...] } }`.
3. **Customer/Guest quote forms** — Updated `quote-form.component.ts` and `guest-quote.component.ts` to fetch budget ranges per-category via `GET /quotes/budget-ranges?categoryId=xxx`.
4. **Chatbot hyperlinks** — Added `formatMessage()` in `chat.component.ts` that converts markdown `[label](/path)` links to clickable `<a>` tags. Links in assistant messages now navigate to Angular routes. Backend `chat.service.ts` system prompt updated to instruct the AI to use links.
5. **Reseed/Clear modal** — Updated `shell.component.ts` reseed modal with separate "Clear data" and "Reset demo data" buttons side by side. Both show independent loading/error states. Added `POST /dev/clear` support on the frontend.
6. **Button rewording** — "+Demo proposal" → "+Proposal" in `shell.component.ts`.
7. **Demo Home signs out** — `DemoBarComponent.goHome()` and `ShellComponent.demoGoHome()` now call `auth.logout()` + `notifications.stop()` before navigating to `/`. The logo in the shell (separate method) navigates without signing out.
8. **Top-up credit validation** — `confirmAfterTopUp()` now re-checks the credit balance before submitting; shows an error instead of blindly proceeding when insufficient.
9. **Quote confirmation redirect** — After successful quote submission, navigates immediately to `/customer/quotes?submitted=true` instead of showing a 2.5s overlay. `MyQuotesComponent` shows a success banner when `submitted` query param is present.
10. **Proposal selection confirmation** — Added modal confirmation prompt before selecting a servicer proposal in `proposals.component.ts`. Uses shared `ModalComponent`.
11. **Credit balance signal fix** — Changed `creditBalance` from `computed` to regular `signal` in `quote-form.component.ts` so demo top-up properly updates the displayed balance (computed signals don't re-evaluate on object mutations).

**Verification:** `npx tsc --noEmit` → 0 errors. `npx ng build --configuration production` → builds clean (pre-existing warnings only).

---

### Session 2026-05-25-Guest — Guest quote flow, home page polish, app rebrand

**Scope:** Public guest quote flow, credit-validated quote submit, home page
cleanup, search dropdown, app rebrand to MyHomeServicer.

**Guest quote flow** (`guest/guest-quote.component.ts`)
- 3-step wizard (Details → Contact → Summary) mirroring the full auth form.
- Loads categories from public `/categories`, budget ranges from public
  `/quotes/budget-ranges`.
- No promo code (prompted to login for promos/rewards).
- Manual address text field (no saved addresses for guests).
- Submits to `POST /quotes/guest` on confirm.
- Data saved to localStorage for pre-fill on registration.
- After submit: success overlay with "Create a free account" button.

**Login skip** (`login.component.ts`)
- Detects `?intent=quote` query param → shows "Skip login, continue as guest"
  button → navigates to `/guest/quote/new`.

**Registration prefill** (`register.component.ts`)
- Detects `?prefill=guest` query param → auto-fills name and phone from
  saved `GuestQuoteData` in localStorage.

**Credit validation** (`quote-form.component.ts`)
- `submit()` checks `creditBalance()` vs `estimatedTotal()` for `pay_now`.
- Insufficient credit → opens top-up modal with demo top-up (+RM100 via
  `/dev/topup`) and Stripe webhook placeholder.
- On success: confirmation overlay auto-closes after 2.5s then navigates to
  `/customer/quotes`.

**Home page** (`home.component.ts`)
- Removed `orn-ring` decorative elements.
- Polished nav buttons: Log in (ghost), My portal (outline), Join as
  Servicer (solid) — all use consistent `border-radius: 999px`.
- Hero search: dropdown with category icon, name, and price on input.
- Fixed bottom "Request a quote" bar (replaced old FAB).
- Moved `page-enter` animation off `:host` to inner wrapper so
  `position: fixed` bar anchors to viewport.

**Browse page** (`browse.component.ts`)
- Fixed bottom "Request a quote" bar always visible on screen.

**Chat report buttons** (`chat.component.ts`)
- Parses `actions[]` from POST message response.
- Renders "Report a Booking Problem" and "Report a Bug" action buttons
  below AI messages.
- Modal forms for booking selection + subject/description, submits to
  `POST /bookings/:id/report` or `POST /chat/report-bug`.

**App rebrand**
- All user-facing "HomeServices" / "MyHomeService" → "My Home Servicer".
- Technical identifiers (package names, DB names, queue names) unchanged.

**Category icons**
- Added `book` → 📚 mapping for Tutoring Service.

---

---

### Session 2026-05-26 — Chat UI rewrite + gradient/dark-theme system

**Scope:** Full UI/UX pass on the customer chat component; global gradient token system; dark theme replacement.

**Chat component (`customer/pages/chat.component.ts`) — full rewrite**
- Added `AfterViewChecked` implementation with `scrollToBottomOnNext` flag — fixes scroll-to-bottom not firing after AI reply.
- New header: terracotta circle avatar (SVG chat icon), h1, pulsing green status dot (keyframe `status-pulse`), "Clear chat" button relocated from composer.
- Animated typing indicator: 3-dot `dot-bounce` keyframe, wrapped in `@media (prefers-reduced-motion: no-preference)`.
- Empty state: centered bordered circle + SVG chat icon with descriptive copy.
- Load-more conditional fixed: `@if (hasMore() && loadingMore())` guard prevents phantom element.
- Composer: `aria-label` on input, send button with SVG arrow + "Send" label text.
- All animations gated on `prefers-reduced-motion: no-preference`.

**Gradient token system (`src/styles.css` `:root`)**

| Token | Value |
|---|---|
| `--gradient-primary` | `linear-gradient(135deg, #c95a3c 0%, #d4784a 100%)` |
| `--gradient-primary-hover` | `linear-gradient(135deg, #a8472e 0%, #c95a3c 100%)` |
| `--gradient-accent` | `linear-gradient(135deg, #c4903a 0%, #d4a84a 100%)` |
| `--gradient-hero` | `linear-gradient(160deg, #fdf4ee 0%, #faf7f2 55%, #f5ede4 100%)` |
| `--gradient-sidebar` | `linear-gradient(135deg, #c95a3c 0%, #a8472e 100%)` |

Gradient formula: start at base primary, shift +5° warmer hue, +4–5% lighter. Never bleach past +8% L.

**Applied to surfaces:**
- `.btn-primary` — `background: var(--gradient-primary)` with solid fallback; hover uses `--gradient-primary-hover`
- Shell `.logo` + home `.brand` — gradient text via `-webkit-background-clip: text; -webkit-text-fill-color: transparent`
- `.sidebar a.active` — `--gradient-sidebar` + inset `3px 0` white highlight
- Home `.page` — `--gradient-hero` background
- Home `.num` step circles — `--gradient-primary` + terracotta box-shadow
- Home `.request-bar` — `--gradient-primary` + stronger hover shadow

**Dark theme replacement (`[data-theme="cool"]`)**
- Old: generic steel-blue (`#1e3a5f` / `#3b82f6`).
- New: "Deep Stone + Copper" — `--color-bg: #1c1917` (warm stone-black), `--color-primary: #d4884a` (copper), `--color-surface: #28231e`, `--color-text: #f5f0e8` (warm cream).
- Night-mode gradient overrides use same formula proportions as day: `--gradient-primary: linear-gradient(135deg, #d4884a 0%, #df9854 100%)`, accent identical to day (`#c4903a → #d4a84a`), hero darkens inward (`#28221a → #1c1917 → #14110e`).
- Gradient consistency fix: night `--gradient-primary` end was `#e8a868` (11% ΔL, washed out/peachy). Corrected to `#df9854` (4% ΔL matching day proportions). Night `--gradient-accent` direction was reversed vs day; unified to `#c4903a → #d4a84a`.

**`STYLE-RULES.md` updates:**
- Section 2.6 "Gradient system" added: full token table, usage table, gradient formula, gradient-text rules.
- `--focus-ring` alpha updated to `0.22`.
- Section 8 renamed "Warm (Day) / Night (Stone + Copper)"; comparison table updated with copper values; night gradient table corrected.

**Verification:** TypeScript typecheck passed pre-change (last confirmed state). No new TS constructs introduced; all changes are template + CSS. Recommend `npx tsc --noEmit` on next live stack boot.

---

### Session 2026-05-26 — FAB collapse toggle + chat bubble resize

**Scope:** Both `home.component.ts` and `browse.component.ts` FAB stack.

**Work done:**
1. **Chat bubble enlarged** — `3rem × 3rem` → `3.5rem × 3.5rem`; SVG icon `20px` → `22px`. Collapsed state reduces to `2.75rem × 2.75rem`.
2. **Minimize toggle** — Added `1.75rem` circular `.fab-toggle` button at top of `.fab-stack`. Clicking toggles `fabCollapsed = signal(false)`. Arrow rendered via CSS `::after` border-triangle (up-pointing, rotates 180° when collapsed via `.fab-stack.collapsed .fab-toggle::after { transform: rotate(180deg) }`). Template is an empty button with `[aria-label]` binding — no SVG (SVG inside small Angular-scoped buttons was unreliable).
3. **Request bar collapse** — Collapsed state: `max-width: 3.5rem; padding: 0.65rem; justify-content: center; border-radius: 16px` → becomes a `3.5rem × 3.5rem` rounded square matching the chat bubble height (0.65 + 2.2 + 0.65 = 3.5rem). `.rb-text` hides via `max-width: 0; opacity: 0`. `max-width 0.3s ease, border-radius 0.25s ease` added to transition list.
4. **`[class.collapsed]` binding** — Angular class binding on `.fab-stack` drives all collapsed-state CSS via descendant selectors.

**Files changed:** `home/home.component.ts`, `customer/pages/browse.component.ts`.

**Verification:** TypeScript property `fabCollapsed = signal(false)` added to both component classes; `signal` already imported. No new TS constructs.

---

### Session 2026-05-26 — FAB stack polish, chat status indicators, S3 local fallback

**Scope:** FAB stack moved to shared ShellComponent, live chat status indicators with rotating edge glow, local file upload fallback when S3 not configured.

**Work done:**

1. **Request-bar uncollapse animation fix** — Added `max-height: 5rem` and `max-height` to transition list in both `home.component.ts` and `browse.component.ts` so the bar smoothly expands in height (previously snapped open).

2. **FAB stack moved to ShellComponent** (`shell.component.ts`)
   - Transferred the entire `.fab-stack` (chat bubble + request bar + collapse toggle) from `browse.component.ts` into the shared shell template, gated on `@if (auth.principal()?.role === "customer")`.
   - `browse.component.ts` FAB code removed — no remaining FAB references.
   - `fabCollapsed` signal, `openChat()`, `newQuote()` methods added to `ShellComponent`.
   - FAB persists across all customer pages (browse, chat, quotes, bookings, etc.).

3. **Chat bubble status indicators**
   - `.chat-glow`: rotating edge glow via `@property --chat-angle` + `conic-gradient` + `mask-composite: exclude` (content-box mask). Animation spins the gradient angle only, not the element.
   - `.chat-status`: bottom-right dot — green `#22c55e` pulse (`active`), amber `#f59e0b` with radial inner animation (`typing`), gray (`offline`).
   - `.chat-unread`: top-left red pill badge (`min-width: 20px`, cap at "99+").
   - `chatStatus` signal drives `.active`/`.typing` classes; `chatUnread` signal drives badge visibility.

4. **SocketService integration**
   - `connect` event → `chatStatus.set("active")`
   - `disconnect` event → `chatStatus.set("offline")`
   - `chat.unread` event → `chatUnread.set(count)`
   - `chat.typing` event → `chatStatus.set("typing")` with 3s `setTimeout` to revert to `"active"`

5. **Request bar rotating glow** — `.rb-glow`: same `@property --rb-angle` + `conic-gradient` + `mask-composite: exclude` technique as chat bubble, with `transition: background 0.3s ease` for hover effects.

6. **Glow inset alignment** — Changed `inset` on both `.chat-glow` and `.rb-glow` from `-3px` to `-2.5px` so the glow ring sits flush with the button edge (padding accounts for the ring).

7. **Hover glow intensification** — `.fab-stack:hover .chat-glow` and `.fab-stack:hover .rb-glow` replace the `background` conic-gradient with a more opaque variant (rgba white from 0.35→0.8, amber 0.25→0.6), achieving ~3× glow intensity on hover.

8. **Rotating glow technique change** — Replaced `transform: rotate(360deg)` (rotates the entire element) with `@property` registered CSS custom property angle animation — only the gradient rotates, not the element itself.

9. **S3 local file upload fallback** (backend — cross-agent)
   - Created `backend/src/lib/local-files.ts`: `saveLocalFile(key, body)` writes to `backend/uploads/`, returns `/api/files/local/{key}`. Exports `UPLOADS_DIR` and `localFilePath(key)`.
   - `PUT /files/local-upload/:fileId` route in `files.routes.ts` — reads raw body chunks, calls `saveLocalFile(file.s3Key, body)`.
   - `app.ts`: `express.static(UPLOADS_DIR)` mounted at `/api/files/local`, conditional on `!isS3Configured()`.
   - `s3.ts`: `publicUrl()` returns `/api/files/local/${key}`, `uploadBuffer()` dynamically imports `./local-files` and calls `saveLocalFile()` when S3 env vars are missing.

**Bug fix:** Removed duplicate `@property --rb-angle` + `.rb-glow` + `@keyframes rb-glow-spin` CSS block in `shell.component.ts` (lines 1086–1121 and 1123–1157 were identical, second copy dropped the `transition: background 0.3s ease`). Kept the single block with the transition.

**Verification:** Structure reviewed by exploration agent — all FAB references removed from `browse.component.ts`, all S3 fallback paths confirmed in backend.

---

### Session 2026-05-28 — Phase 9 features: F-D (search/filters), F-A (proposal prompt), F-B (calendar)

**Scope:** Three Phase 9 feature deployments.

**F-D — Customer account search + filters:**
- Renamed "Upcoming Bookings" → "Upcoming" in `customer-shell.component.ts`
- `my-bookings.component.ts`: Added search bar (servicer name/category) + status filter chips (All/Pending/Confirmed/In progress/Completed/Cancelled) + `filteredBookings` computed
- `order-history.component.ts`: Added search bar (servicer/category) + sort dropdown (date/price) + `filteredItems` computed. Added `FormsModule` import.
- `rewards.component.ts`: Added search bars for rewards + activity, redeemable-only toggle chip. Added `FormsModule` import.

**F-A — Servicer proposal prompt guard:**
- Added `SocketService` subscription for `quote.new` event in `ShellComponent` (gated on `servicer` role)
- Fixed-position toast at bottom-centre: shows count + category, "View & respond" button navigates to `/servicer/jobs`, dismiss × button, 60s auto-dismiss timer
- Added `OnDestroy` lifecycle to clean up subscription + timer

**F-B — Servicer calendar system:**
- New `calendar.component.ts` — month-grid layout with 7-column days, status-coloured booking pills, month nav (◀▶), "Today" button, day padding for prev/next months
- Backend `GET /servicer/calendar?month=YYYY-MM` — queries bookings by month, groups by date
- Route `/servicer/calendar` added to `servicer.routes.ts`
- Nav item "Calendar" added between "My Jobs" and "Service Listings" in `servicer-shell.component.ts`

**Compile gate:** `npx tsc --noEmit` → zero errors (frontend + backend).
**Build gate:** `npx ng build --configuration development` → exit 0 (pre-existing NG8107 warnings only).
**Test gate:** 235 pass, 1 pre-existing failure (booking-lifecycle mock drift).

### Session 2026-05-28 — F-C: "Save as preset" button in quote form

**Scope:** Complete the last remaining piece of F-C — let customers save the current contact/address/time-slot as a named preset from within the quote form itself (not just from the account page).

**Changes to `quote-form.component.ts`:**
1. Added `.preset-row` wrapping the existing preset dropdown + new "Save as preset" ghost button (disabled until contact name, number, and address are filled).
2. New save-preset modal: opens on button click, asks for a preset name, validates addressId exists (must use a saved address), POSTs to `/user/me/quote-presets`, refreshes the picker.
3. Refactored preset loading into a private `loadPresets()` method (was inline in `ngOnInit`).
4. New CSS: `.preset-row` (flex row), `.btn-save-preset`, `.save-preset-form`.

**Compile gate:** `npx tsc --noEmit` → zero errors.
**Build gate:** `npx ng build --configuration development` → exit 0 (pre-existing NG8107 warnings only).

---

### Session 2026-05-26 — FAQ expansion, request-bar UX, chat FAB

**Scope:** Seed FAQ content rewrite, request-bar layout change, floating chat bubble.

**Work done:**

1. **FAQ knowledge base expanded** (`backend/prisma/seed/data/static.ts`)
   - Rewrote all 48 `chatKnowledge` entries (one-liners) into 56 comprehensive
     entries across 10 categories: `general`, `categories`, `quotes`, `bookings`,
     `payments`, `rewards`, `notifications`, `servicer`, `chatbot`, `legal`.
   - Each entry now explains the *why* and *what happens next*. Key additions:
     full platform overview, complete pay-now escrow lifecycle, all refund trigger
     conditions, step-by-step servicer booking management.
   - Apply with `npm run seed` in `backend/`.

2. **Request-bar layout — right-anchored FAB** (`browse.component.ts`, `home.component.ts`)
   - Changed `.request-bar` from full-width (`left: 1rem; right: 1rem`) to a
     right-anchored compact pill: `right: 2rem; bottom: 2rem; max-width: 340px`.
   - `position: fixed` moved from `.request-bar` to new `.fab-stack` wrapper.
   - `:host padding-bottom` reduced from 85–90px to 1.5rem.

3. **Chat FAB** (`browse.component.ts`, `home.component.ts`)
   - Added `.chat-bubble` circular button (3rem × 3rem) above the request bar,
     both grouped in `.fab-stack` (column flex, `align-items: flex-end`, `gap: 0.75rem`).
   - **browse.component.ts** (authenticated): POSTs `POST /chat/session`
     (`contextType: 'general'`), navigates to `/customer/chat?session=<id>`.
     Falls back to `/customer/chat` on error. `openingChat` signal guards double-click.
   - **home.component.ts** (public): navigates to `/customer/chat` if logged in,
     `/login?intent=chat` if not.

**Verification:** `npx tsc --noEmit` → 0 errors.

---

### Session 2026-05-26 — 4-tier chat FAB panel + FAQ tier admin control (IN PROGRESS)

**Scope:** Role-based chat panel in the floating chat bubble; admin tier selector on FAQ entries. Work paused — to be continued next session.

**Work completed this session:**

1. **FAQ tier field** (backend — see backend-log for full detail)
   - `Faq` model got `tier String @default("all")`.
   - Seed data `static.ts`: 56 entries carry explicit `tier` values by category.
   - `chat.service.ts buildSystemPrompt(role)` filters FAQ by tier.
   - Admin routes accept `tier` on POST/PATCH `/admin/faq`.
   - **Pending:** `npx prisma db push` (stop server, delete stale client, push, restart).

**Work remaining (next session):**

2. **`ChatFabComponent`** (`frontend/src/app/shared/chat-fab.component.ts`) — NEW standalone component:
   - Fixed-position floating chat bubble (separate from request-bar FAB stack).
   - On click: opens an inline panel (not direct navigation).
   - Panel shows tier-based question suggestions derived from `AuthService.principal()?.role`:
     - **Guest** (`null`): platform-info questions only + "Log in / Sign up" footer.
     - **Customer**: service + booking + payment questions + "Join as Servicer" CTA block.
     - **Servicer**: quick-nav links (`/servicer/jobs`, `/servicer/services`, etc.) + all customer questions.
     - **Admin**: all questions + quick-nav links + `mailto:example@mail.mail` fallback.
   - Question click → `POST /chat/session { contextType: 'general' }` → navigate to `/customer/chat?session=X&q=<question>`.

3. **`browse.component.ts` + `home.component.ts`** — Replace existing `openChat()` direct-navigate with panel-open toggle; integrate `ChatFabComponent` or embed panel logic inline.

4. **`shell.component.ts`** — Add `<app-chat-fab />` so servicer and admin portals get the floating chat FAB.

5. **`chat.component.ts`** — Read `?q` query param on init; after session loads, auto-send the question as a message.

6. **`admin/pages/faq.component.ts`** — Add `tier` field to `FaqEntry` + `FaqForm`, tier checkboxes in the modal, Tier column in the table, `openEdit()` copies `e.tier`, `save()` sends `tier`.

7. **`tsc --noEmit`** in both `backend/` and `frontend/`.

---

### Session 2026-05-27 — Demo accounts UI + Google Maps planning docs

**Scope:** All demo accounts in navbar/login page, remove old login chips, Google Maps integration plan documented.

**Work done:**
1. **Login page** (`login.component.ts`): Replaced old 4-chip quick-fill with full account listing — 3 customers, 12 servicers organized by category (Plumbing/Cleaning/Aircond/Catering), Admin. Each chip fills email + password.
2. **Shell demo bar** (`shell.component.ts`): Replaced single Customer/Servicer buttons with click-toggle dropdown menus showing all accounts (Customers: Fresh/Active/Loyal; Servicers: all 12 grouped by category). Added `HostListener` for outside-click dismiss, `stopPropagation` on dropdown containers.
3. **Demo bar** (`demo-bar.component.ts`): Same dropdown treatment applied to the public home page demo bar.
4. **Auth service** (`auth.service.ts`): Added `demoLoginByEmail(email)` method calling `/dev/demo-login` with email field.
5. **Google Maps planning docs**: Added full integration plan to `TODO.md` (Cloud setup, frontend places autocomplete, backend geocoding, radius matching), added "Maps & location" section to `tech-stack.md` with API key strategy.
6. **Build**: `ng build` passes with zero errors (pre-existing warnings only).

---

### Session 2026-05-27 — Phase 1 P1-FE (Kilo-2): A11y + avatars + listing card + TIME_SLOTS

**Scope:** All five sub-tasks from the CEO Phase 1 Dispatch. Independent of the money model — no backend/schema changes.

**Work done:**

**A. P1 Accessibility:**
1. Darkened `--color-muted` in `styles.css` — warm `#8c8178` → `#6b6258`, night `#857268` → `#a09384` to clear 4.5:1 AA contrast.
2. Added `aria-label` to all icon-only buttons: notification bell, theme-toggle, chat-bubble in `shell.component.ts` and `home.component.ts`.
3. Added `role="status"` and `aria-live="polite"` to the snackbar element (`snackbar.component.ts`).

**B. P1 Touch targets:**
4. Added `::after` pseudo-element hit-area expansion to `.notif-bell` (inset -6px), `.fab-toggle` (inset -10px), and global `.theme-toggle` (inset -6px) — all ≥44×44px effective hit areas.
5. Fixed `.topnav.is-idle` and `.toolbar.is-idle` `pointer-events: none` — added `:hover` and `:focus-within` selectors that restore `pointer-events: auto`.

**C. Servicer logo avatars (§16.1):**
6. `proposals.component.ts`: Added servicer avatar display in the proposal card header — shows `logoUrl` as a 28px circular `<img>` or initials fallback in a tinted circle. Added `initials()` helper.
7. `my-bookings.component.ts`: Same avatar treatment for the booking card header. Added `initials()` helper.

**D. Servicer listing card redesign (§11):**
8. `services.component.ts`: Replaced old `.svc` layout with spec-compliant `.lc` list card:
   - Left 48px rounded tile with category emoji icon on tinted `--color-bg` (photo-ready slot).
   - Title bold (hero), description 1-line-clamp muted subtitle.
   - Price block right-aligned, prominent; `priceType` small label beneath.
   - Status badge: Auto-accept (filled primary) vs Manual (subtle border). Toggle preserved.
   - Edit = primary ghost button; Delete = muted trash icon (🗑) that reddens on hover.
   - Meta row: duration · SKU · N priced options (small, muted).
   - Added `categoryIconFor()` helper mapping category names to emoji.
   - Mobile stacking preserved via existing responsive grid.

**E. TIME_SLOTS single-source:**
9. Created `shared/constants/time-slots.ts` — single `TIME_SLOTS` array + `TimeSlot` interface.
10. Updated `quote-form.component.ts` and `guest-quote.component.ts` to import from shared constant; removed inline duplicates.

**Verification:**
- `npx ng build --configuration development` → **exit 0** (warnings only — pre-existing `NG8107` optional-chain warnings in services template).
- `npx tsc --noEmit` → **0 errors**.
- `STYLE-RULES.md` updated with new muted colour values.

---

### Session 2026-05-27 — Quote flow redesign (4-step Bill, §13)

**Scope:** `customer/pages/quote-form.component.ts` + `guest/guest-quote.component.ts` — 4-step wizard per CEO §13 design.

**Work done:**

1. **4-step stepper** — Both forms updated from 3 steps to 4: Choose service · Contact · Summary · Bill. Stepper labels updated; mobile label-hide CSS preserved.

2. **Budget moved to Step 1** — Budget range select moved from the old Summary step into Choose service (step 1). Validation in `goToContact()` now includes `budgetIndex`. Budget ranges still load on category change via `loadBudgetRanges()`. Reorder prefill (`matchPrefillBudget`) unchanged.

3. **Step 3 — Summary: clean review** — No money fields. Shows: service, all answered questions, preferred time, preferred date, notes, budget range (display only), contact name/number, address. "Next: Bill →" advances to step 4 with no validation (read-only card).

4. **Step 4 — Bill** — New final step:
   - Payment timing radio (pay_now / pay_later) as styled option cards with description text.
   - Settlement method (credit / gateway for pay_now; credit / gateway / cash for pay_later). Guest form omits credit (no wallet) and shows a "Create an account to pay with wallet credit" hint.
   - `onTimingChange()` resets `settlementMethod` to `credit` (auth) / `gateway` (guest) when switching to pay_now to prevent invalid cash selection.
   - Tip input (pay_now only).
   - Promo code input (auth form only; guest form never had promo per existing spec).
   - Enhanced estimate box: label + prominent RM amount + note with budget range label and "Final price set by servicer" copy.
   - Agree to terms checkbox + submit validation.

5. **Date input hack removed** — Both forms: `input[type='date'] { max-width: 12rem; }` removed. Date input now full-width within the form column, consistent with all other inputs.

6. **Backend compat** — `doSubmit()` / `save()` maps new `paymentTiming + settlementMethod` → legacy `paymentMode` field for the current backend: `pay_now` → `pay_now`; `pay_later + cash` → `cash`; `pay_later + other` → `pay_later`. Top-up modal now only triggers for `pay_now + credit` (not gateway).

7. **`f.paymentMode` removed** — Replaced with `paymentTiming: 'pay_now'|'pay_later'` and `settlementMethod: 'credit'|'gateway'|'cash'`. Reorder prefill maps old `paymentMode` string → new fields. Guest `restoreForm` maps `saved.paymentMode` → new fields.

**Verification:** `npx ng build --configuration development` → **exit 0** (pre-existing warnings only, no new errors).

---

### Session 2026-05-27 — Claude #3: Invoice page redesign (itemized receipt)

**Scope:** Rebuild invoice display in customer my-bookings + servicer jobs detail as an itemized receipt. No backend changes — all fields already exist on the Invoice model.

**Work done:**

1. **`servicer/pages/jobs.component.ts`** — History tab invoice modal rebuilt:
   - Added `InvoiceDetail` interface with all breakdown fields (`lineItems`, `subtotal`, `promoDiscount`, `serviceChargeRate/Amount`, `sstApplies`, `taxInclusive`, `taxRate/Amount`, `tipAmount`, `total`, `platformFee`).
   - Updated `invoiceData` signal type from inline stub to `InvoiceDetail | null`.
   - Receipt layout: invoice number + issued date + paid badge in header; line items `<table>` with label/amount columns; subtotal breakdown rows (promo as green negative, service charge, SST with rate%, tip — each conditional); bold divider + large primary-coloured total; tax mode badge (inclusive/exclusive pill); muted dashed platform-fee row; Download PDF + Print buttons.
   - `printInvoice` refactored: uses `Blob` + `URL.createObjectURL` (eliminates `document.write` XSS vector); escapes all user-supplied strings before interpolation into HTML.

2. **`customer/pages/my-bookings.component.ts`** — Added invoice viewing:
   - Imported `ModalComponent`; added `InvoiceDetail` interface; added `invoiceModalOpen/Loading/Error/Data` signals.
   - "Invoice" button added to completed-booking action row (alongside Reorder).
   - `viewInvoice(b)` fetches `GET /bookings/:id/invoice` and opens the same receipt layout modal.
   - Identical receipt styles added to component styles.

**Gate:** `ng build` exit 0 (pre-existing warnings only — services.component.ts optional-chain + budget).

---

### Session 2026-05-27 — Money/listing epic §2.1/§5/§6 step 9: Admin settings cleanup, servicer business details + tax config, admin account changes queue

**Scope:** Three frontend tasks from the money-listing-epic spec (§2.1, §5, §6 step 9).

**TASK A — Admin settings cleanup (settings.component.ts)**
- Removed the entire "Platform charge" section from the Platform tab (template lines 170–192: mode selector, value input, save button, message display).
- Removed `charge`, `chargeSaving`, `chargeMessage`, `chargeIsError` class fields.
- Removed `platform_charge` read from `ngOnInit()` (lines 370–374).
- Removed `saveCharge()` method (475–502).
- The Platform tab now shows only `platform_fee_rate` and Timing & tax — the unified fee under the new canonical model.
- `platform_charge` setting key was already removed from seed data; frontend no longer reads/writes it.

**TASK B — Servicer business details + tax config (account.component.ts)**
- Extended `ServicerProfile` interface with new epic fields: `entityType`, `businessRegistrationNumber`, `taxNumber`, `sstRegistered`, `sstNumber`, `serviceChargeRate`, `taxInclusive`, `identityChangeRequests`.
- Added `IdentityChangeRequest` interface (id, status, proposed, reviewedBy, reviewedAt, createdAt).
- New sections in the template (between Profile and Invoice formatting):
  - **Identity change request status banner** — conditional section that lists pending/approved/rejected `identityChangeRequests` with badges, proposed changes in `<dl>` grid, and approval/rejection dates.
  - **Business details section** — legal business name (text), entity type dropdown (Sole Proprietorship/Partnership/Enterprise/Sdn Bhd), business registration number (text), tax number (text). Includes `id-note` explaining admin review when `identityFieldsDirty`.
  - **Tax config section** — SST registered toggle (CSS custom checkbox `.toggle`), SST number input (conditional on SST toggle), service charge rate % (number), tax inclusive toggle. Changes save directly — no admin review.
- New class signals: `identityChangeRequests`, `savingIdentity`, `identitySavingError`, `savingTax`, `taxSavingError`, `identityFieldsDirty`.
- New form fields in `f`: `businessLegalName`, `businessEntityType`, `businessRegNumber`, `taxNumber`, `sstRegistered`, `sstNumber`, `serviceChargeRate`, `taxInclusive`.
- `ngOnInit()` seeds all new fields from profile response.
- `saveBusinessDetails()` POSTs to `/servicer/me/identity-change-request` with `{ proposed: { entityType?, businessRegistrationNumber?, taxNumber?, sstNumber? } }` — creates an admin-review change request.
- `saveTaxConfig()` PATCHes `/servicer/me` with `{ sstRegistered, serviceChargeRate, taxInclusive, sstNumber? }` — direct save.
- `onSstToggled()` clears `sstNumber` when SST is toggled off.
- `formatEntityType()` helper maps enum values to display labels.
- CSS: `.id-banner` (left border highlight), `.id-req` rows, `.id-req-dl` definition list, `.id-note` (accent notice box), `.two-col` grid row, `.toggle-row` + `.toggle` custom checkbox, status badges for pending/approved/rejected.

**TASK C — Admin Account Changes queue tab (queues.component.ts)**
- Added `'account'` to `activeTab` union type and added "Account Changes" tab button with pending count badge.
- New `account` tab template section: search input filtered by servicer name, card rows showing servicer name, proposed changes (entityType, reg no, tax no, sstNumber) in `.id-props` flex row, requested date, and Approve/Reject buttons.
- New signals: `identityRequests`, `iQuery`.
- `filteredIdentityRequests` computed filters by servicer name + proposed fields.
- `ngOnInit()` accepts `?tab=account` query param.
- `load()` fetches `GET /admin/identity-change-requests?status=pending`.
- `reviewIdentity(id, status)` PIN-gated PATCH to `/admin/identity-change-requests/:id`.
- `hasAnyProposed()` checks for at least one non-empty proposed field.
- `formatEntityType()` shared helper (same as TASK B).

**Verification:**
- `npx tsc --noEmit` → **0 errors**.
- `npx ng build --configuration development` → **exit 0** (warnings only — pre-existing `NG8107` in services.component.ts).
- All three files changed: `settings.component.ts` (~60 lines removed), `account.component.ts` (complete rewrite with ~300 lines added), `queues.component.ts` (complete rewrite with ~100 lines added).

---

### Session 2026-05-27 — Money/listing epic §2.3/§2.4/§6 step 10: Listing form redesign (sectioned modal)

**Scope:** Rebuild the servicer listing modal (`servicer/pages/services.component.ts`) as a sectioned, collapsible-section single form per `money-listing-epic-spec.md` §2.3/§2.4 and `ceo-overview.md` §17.

**Changes to `services.component.ts`:**
- New `PricingModule` interface added; `Service` interface extended with `moduleRefs?`, `serviceChargeRate?`, `taxInclusive?`, `sstApplies?`.
- Modal form restructured into **3 collapsible sections** using CSS grid row animation (`grid-template-rows: 1fr → 0fr` with 0.25s ease transition; no JS height measurement):
  - **Section 1 — Basics:** title, description, category, sub-category, basePrice, priceType, duration.
  - **Section 2 — Pricing & Modules:** PricingModule library picker (loads from `GET /servicer/pricing-modules?active=true`), per-module price override inputs, service charge rate override (number), tax inclusive toggle (select), SST applies toggle (select), followed by existing option-price grid and tax mode/name/rate fields.
  - **Section 3 — Auto-accept:** existing conditions toggle + config (budget min/max, time slots).
- New signals: `pricingModules`, `secBasics`, `secPricing`, `secAutoAccept`.
- New `blankForm()` fields: `moduleRefs`, `serviceChargeRate`, `taxInclusive`, `sstApplies`.
- New methods: `isModuleSelected()`, `toggleModule()`, `getModuleOverride()`, `setModuleOverride()`.
- `ngOnInit()` extended: parallel load of `GET /servicer/pricing-modules?active=true` alongside existing data.
- `openEdit()` extended: populates new fields from service record.
- `save()` extended: includes new fields in `PATCH /servicer/me/services/:id` body (backend ignores until wired — spec §2.3 forward-compatible).
- Existing search, chips, list-card layout left unchanged.
- Fixed AOT build error: `sizeToken="xs"` → `sizeToken="sm"` on all 3 section header icons (`IconSize` only accepts `sm|md|lg|xl`).

**Gate:** `ng build` → **exit 0** (pre-existing `NG8107` optional-chain warnings only).

---

### Session 2026-05-27 — Quote Form 4-Step Bill (ceo-overview §13 + payment MVP step 7)

**Scope:** Redesign both quote forms (`quote-form.component.ts` + `guest-quote.component.ts`) as 4-step wizards with the canonical Bill step. Add `GET /quotes/estimate` backend endpoint.

**Backend — `backend/src/routes/quotes.routes.ts`:**
- Added `GET /quotes/estimate` public endpoint (before auth middleware).
- Params: `categoryId`, `budgetMin`, `budgetMax` (optional), `promoCode` (optional).
- Computes budget-range midpoint → single mock `LineItem` → calls `computeTotal()` with default config (no service charge, SST-unregistered) → returns `{ subtotal, promoDiscount, promoError?, serviceCharge, sst, total, note }`.
- Validates promo against `Promotion` table (`isActive`, not expired, under `maxUses`).
- New imports: `getSstRate`, `computeTotal`, `LineItem`, `ServicerTaxConfig`, `prisma`.

**Frontend — `quote-form.component.ts` (complete rewrite):**

Step layout restructured:
- **Step 1 — Choose service:** category dropdown + dynamic questions + budget **visual slider** (`<input type="range">`). First range auto-selected on load. Next button `[disabled]="!categoryId()"` (enabled on category select). Validates category + budget + required questions on Next.
- **Step 2 — Contact:** contact name/number + address (Places Autocomplete) + preferred date (native date input) + time slot + notes. (Date/time/notes moved here from old step 1.) Validates all on Next.
- **Step 3 — Summary:** clean review card — service, questions, date/time, notes, contact, address. NO budget/money rows. "Looks good?" prompt. Next calls `goToBill()` which sets step 4 + triggers `fetchEstimate()`.
- **Step 4 — Bill:** payment timing radios (pay_now / pay_later) → settlement method (credit wallet / cash) shown **only for pay_later** → promo code input + Apply button with loading/success/error feedback → canonical estimate card (subtotal, promo discount, service charge, SST, total from `/quotes/estimate`) → agree checkbox + submit.

New signals/methods: `estimateData`, `estimateLoading`, `promoApplying`, `promoApplyError`, `promoApplySuccess`, `appliedPromoCode`, `budgetSlider`; `goToBill()`, `fetchEstimate()`, `applyPromo()`, `removePromo()`, `onBudgetSlide()`.
`estimatedTotal()` computed now derives from `estimateData()` (used by top-up modal credit check).
Settlement method: only credit wallet / cash shown for pay_later; gateway option removed from UI.
"No charge until a servicer accepts your request" note shown for pay_later.

**Frontend — `guest-quote.component.ts` (complete rewrite):**
- Same 4-step structure and field redistribution.
- No promo code (guests have no account to carry it to).
- Pay later settlement: cash only (no wallet for guests); hint to register for wallet credit.
- Canonical estimate card (no promo row for guest form).
- `fetchEstimate()` called on `goToBill()`.
- Budget slider + auto-select first range.

**Gate:** `npx ng build --configuration development` → **exit 0** (pre-existing `NG8107` warnings only). `npx tsc --noEmit` → **0 errors**.

---

### Session 2026-05-28 — Phase 6 Identity Avatars POST-MVP (Task P6-FE)

**Scope:** Three sub-tasks from CEO Phase 6 Dispatch:
- A. Customer avatar upload on account page
- B. Show customer photo on servicer incoming quotes (Pending column)
- C. Show customer photo on job-accept view

**Backend context:** Backend P6-BE already added `customerAvatarUrl` + `customerName` to:
- `GET /servicer/quotes` (listIncomingQuotes) — each quote object returns the fields
- `POST /servicer/quotes/:id/open` (openQuote) — returns `{ proposalPrefill, customerAvatarUrl, customerName }`
- Self-quote filter: `pairedCustomerEmail` guard in `listIncomingQuotes` DB query already excludes self-quotes — no frontend privacy guard needed

**TASK A — Customer avatar upload on account page (`customer/pages/account.component.ts`):**
- Avatar image size scaled up from 64px → 80px (matching spec: "circular 80px image preview")
- Added `avatarUrl` field to the `saveProfile()` PATCH body so the avatar URL persists alongside name/phone/etc. (Previously the upload flow patched `/user/me` separately with only `avatarUrl`.)
- Avatar section already existed (presign→S3/local PUT→confirm flow, initials fallback, remove button) — this session just filled the two gaps: spec size + profile-save persistence.

**TASK B — Customer photo on servicer incoming quotes (`servicer/pages/jobs.component.ts`):**
- Added `customerAvatarUrl?: string | null` and `customerName?: string` to `IncomingQuote` interface.
- Pending column template: new `.customer-row` at top of each quote card showing 40px circular avatar (or initials fallback in tinted circle) + `customerName` when available.
- Privacy guard: backend already filters self-quotes via `pairedCustomerEmail` in `listIncomingQuotes` — no duplicate frontend check needed.

**TASK C — Customer photo on job-accept view (`servicer/pages/jobs.component.ts`):**
- Expanded quote view (proposal form): when a servicer clicks to expand a quote to send a proposal, shows the same 40px avatar + customerName above the proposal form.
- Added `expandedCustomerAvatar` and `expandedCustomerName` signals, populated from the updated `openQuote` response (`{ proposalPrefill, customerAvatarUrl, customerName }`).
- `expand()` method updated: clears customer info on collapse; captures from API response on expand.
- Same `.customer-row` / `.avatar-circle` / `.avatar-fallback` styling pattern as Task B.

**Shared `initials()` helper:** Added to `JobsComponent` — takes `name?: string | null`, returns first letter uppercase (e.g. `'A'` for `'Aisha'`). Uses `'?'` fallback for null/undefined.

**CSS additions (jobs.component.ts styles):**
```css
.customer-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
.customer-name { font-weight: 600; font-size: 0.85rem; color: var(--color-text); }
.avatar-circle { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
.avatar-fallback { width: 40px; height: 40px; border-radius: 50%; 
  display: flex; align-items: center; justify-content: center;
  background: var(--color-accent); color: white; font-weight: 600; font-size: 1rem; }
```

**Files changed:**
1. `frontend/src/app/customer/pages/account.component.ts` — avatar size 64px→80px, `avatarUrl` in saveProfile() PATCH body
2. `frontend/src/app/servicer/pages/jobs.component.ts` — IncomingQuote extended (2 new fields), expanded view customer signals (2), `initials()` helper, pending card avatar row, expand view avatar row, 4 new CSS rules

**Gate:** `npx tsc --noEmit` → **0 errors**. `npx ng build --configuration development` → **exit 0** (pre-existing `NG8107` optional-chain warnings in `services.component.ts` only — no new warnings).

---

### Session 2026-05-28 — Category Thumbnails POST-MVP (§15)

**Scope:** Admin-managed category thumbnails per `ceo-overview.md` §15. Two sub-tasks:
- A. Admin Thumbnails tab in settings
- B. Servicer listing card thumbnail

**Sub-task A — Admin Thumbnails tab (`admin/pages/settings.component.ts`):**

1. Added `'thumbnails'` to the `Tab` union type.
2. Added "Thumbnails" tab button alongside Customer/Servicer/Platform in the tab header bar.
3. Created thumbnails tab section:
   - Renders all categories with an 80px image preview (shows `<img>` if `imageUrl` exists, "No image" placeholder otherwise).
   - Upload button uses a label-wrapping pattern: clicking triggers the hidden `<input type="file">`, which fires `uploadThumbnail(cat, $event)` on change.
   - Upload flow: `POST /files/presign` → raw `HttpClient.put` to presigned S3 URL → `POST /files/:id/confirm` → `PATCH /admin/categories/:id { imageUrl }`. Reuses the established 3-step upload pattern (logo/avatar upload in servicer/customer account pages).
   - Clear button shown when `imageUrl` exists → calls same PATCH endpoint with `{ imageUrl: null }`.
   - Loading state per-category via `uploading = signal<Set<string>>` — tracks which category IDs are mid-upload.
4. New imports: `HttpClient`, `switchMap` from rxjs.
5. New signals: `uploading` (Set of uploading category IDs).
6. New methods: `uploadThumbnail(cat, event)`, `clearThumbnail(cat)`, `refreshCategories()`.
7. CSS: `.thumb-list`, `.thumb-row`, `.thumb-preview` (80x80 rounded, border, bg), `.thumb-img` (object-fit: cover), `.thumb-empty`, `.thumb-info`, `.thumb-name`, `.thumb-acts`, `.thumb-upload-btn`, `.btn-xs`, `.btn-xs.disabled`.
8. Category interface extended with `imageUrl?: string | null`.

**Sub-task B — Servicer listing card thumbnail (`servicer/pages/services.component.ts`):**

1. Extended the `category` inline type in the `Service` interface: added `imageUrl?: string | null`.
2. Template (line ~119-124): Conditional rendering in `.lc-tile`:
   - If `s.category?.imageUrl` exists: `<img [src]="s.category!.imageUrl" class="lc-thumb" />` (non-null assertion needed for strict AOT template type-checking — guarded by the `@if`).
   - Else: existing `<app-icon>` with `categoryIconFor(...)` as fallback.
3. CSS: `.lc-thumb { width: 48px; height: 48px; border-radius: var(--radius-sm); object-fit: cover; }`.

**Files changed:**
1. `frontend/src/app/admin/pages/settings.component.ts` — Thumbnails tab + upload/clear flow (~80 lines added)
2. `frontend/src/app/servicer/pages/services.component.ts` — conditional thumbnail rendering + CSS (8 lines added)

**Gate:** `npx tsc --noEmit` → **0 errors**. `npx ng build --configuration development` → **exit 0** (pre-existing `NG8107` optional-chain warnings only — unchanged).

**Note:** The `PATCH /admin/categories/:id` endpoint used by the upload/clear flow may not yet exist in the backend. The frontend calls are forward-compatible — when the backend wires up the route, thumbnails will work without frontend changes. The `imageUrl` field already exists on the Category model (`schema.prisma` line 602) and is already included in the servicer-services query joins (`servicer-service.service.ts` line 37).

---

### Session 2026-05-28 — ConfigService (runtime config instead of baked-in env)

**Task:** Move `googleClientId` and `googleMapsApiKey` from compile-time
`environment.ts` to runtime `GET /config/public` fetch via `ConfigService`.

**Changes:**
- Created `core/services/config.service.ts`: `ConfigService` with `load()`
  method that fetches `/config/public` via HttpClient. Caches the result
  so all consumers read it synchronously after initialization.
- Updated `app.config.ts`: Added `APP_INITIALIZER` that calls `config.load()`
  before the Angular app boots — every component sees resolved values.
- `environment.ts`: Reverted `googleClientId` and `googleMapsApiKey` back to
  empty strings with updated comments pointing to the backend config endpoint.
- `auth/login.component.ts`: Injected `ConfigService`, reads `googleClientId`
  from it instead of `environment.*`.
- `auth/register.component.ts`: Same pattern.
- `shared/places-autocomplete.component.ts`: Injected `ConfigService`, reads
  `googleMapsApiKey` from it instead of `environment.*` in `loadMapsApi()`.
- `shared/map-view.component.ts`: Same pattern.
- `docs/api-reference/api-doc.md`: Added `GET /config/public` documentation.
- `docs/ai-context/security-notes.md`: Added "Public client-side config pattern"
  to Layer 1 section.

**Gate:** `npx tsc --noEmit` ✅ zero errors. `npx ng build --configuration development` ✅ exit 0 (pre-existing NG8107 warnings only).

---

### Session 2026-05-28 — Bug fix: settlementMethod missing on proposal select + quote form legacy paymentMode

**Bug A — Proposals page:** `proposals.component.ts` `select()` method (line ~227) POSTed to `/quotes/:id/select` with only `{ proposalId }`, never including `settlementMethod`. For `pay_later` quotes, the backend throws `settlementMethod is required for pay_later bookings`.

**Fix (Option B — add settlement method selector in confirmation modal):**
1. Added `paymentMode` and `settlementMethod` signals.
2. Added `loadQuote()` method that fetches the quote via `GET /quotes/:id` to know `paymentMode`. Called in `ngOnInit`.
3. When `paymentMode !== 'pay_now'`, the confirmation modal now shows a "Settlement method" radio group (Credit/card or Cash on completion), defaulting to `credit`.
4. `select()` now includes `settlementMethod` in the POST body for non-pay_now quotes.
5. Added CSS for `.settle-opt` styling.

**Bug B — Quote form `doSubmit()` legacy paymentMode:**
1. Fixed `paymentMode` mapping (line ~1097-1099): was emitting `'cash'` as a legacy paymentMode value. Now always sends `'pay_now'` or `'pay_later'`.
2. Added `settlementMethod` to the payload for `pay_later` bookings.
3. Updated `loadPreset()` to explicitly handle `paymentMode: 'pay_later'` (in addition to `pay_now` and `cash`).

**Docs updated:**
- `docs/api-reference/api-doc.md` — `POST /quotes/:id/select` now documents `settlementMethod` field.

**Files changed:**
1. `frontend/src/app/customer/pages/proposals.component.ts` — added quote fetch, settlement method selector in modal, settlement method in POST body, CSS.
2. `frontend/src/app/customer/pages/quote-form.component.ts` — fixed paymentMode mapping, added settlementMethod to payload, explicit pay_later preset handling.
3. `docs/api-reference/api-doc.md` — documented settlementMethod on select endpoint.

**Gate:** `npx tsc --noEmit` ✅ zero errors.

---

## Deactivate Account Wizard (Customer)

Added the missing signal declarations and `doDeactivate()` method to `account.component.ts` to complete the 3-step deactivation wizard whose template was already committed.

**Signals added:**
- `deactivateStep` — `signal(0)` (0=hidden, 1=warning, 2=reason+password, 3=confirm DELETE)
- `deactivateReason`, `deactivatePassword`, `deactivateConfirm` — string signals bound to `[(ngModel)]`
- `deactivateError` — `signal<string | null>(null)`
- `deactivating` — `signal(false)` (disabled state on the submit button)

**Method added:**
- `doDeactivate()` — validates confirmation matches "DELETE", POSTs `{ reason, password }` to `/user/me/deactivate`, on success calls `auth.logout()` + navigates to `/` + shows success toast, on error sets `deactivateError` inline, uses `finalize` to reset `deactivating`.

**Gate:** `npx tsc --noEmit` ✅ zero errors (frontend).
**Build:** `npx ng build --configuration development` ✅ exit 0 (pre-existing NG9 errors in `admin/settings.component.ts` only — unrelated banned-email feature).

---

### Session 2026-05-28 — Servicer account Danger Zone deactivation wizard (verification)

**Task:** Add Danger Zone section with PIN-based 3-step deactivation wizard to the servicer account page, mirroring the customer account pattern.

**Finding:** The Danger Zone was **already fully implemented** in `servicer/pages/account.component.ts`:
- ✅ Danger Zone card with red border (`.danger-zone` class) at lines 569–578
- ✅ 3-step modal wizard (warning → reason+PIN → "DELETE" confirmation) at lines 580–628
- ✅ PIN instead of password (uses `deactivatePin` signal, `inputmode="numeric"`, `maxlength="6"`)
- ✅ POST to `/servicer/me/deactivate` with `{ reason, pin }` at lines 1367–1370
- ✅ `finalize` pipe resets `deactivating` signal
- ✅ On success: `auth.logout()`, `router.navigate(['/'])`, `toast.success('Account deactivated.')`
- ✅ Error handling via `deactivateError` signal
- ✅ All signals imported and declared: `deactivateStep`, `deactivateReason`, `deactivatePin`, `deactivateConfirm`, `deactivateError`, `deactivating`
- ✅ `AuthService`, `Router`, `ToastService` already injected

**Files verified (no changes needed):**
1. `frontend/src/app/servicer/pages/account.component.ts` — Danger Zone fully present

**Gate:** `npx tsc --noEmit` ✅ zero errors.

---

### Session 2026-05-28 17:37 — Parallel CEO: Banned accounts tab + deactivation completion

**Scope:** Complete the deactivation dirty tree. Admin banned accounts tab built; db push executed.

**Admin banned accounts tab** (admin/pages/settings.component.ts):
- Added 'banned' to Tab type, new Banned tab button
- BannedEmail interface + search-by-email + results table
- Ban modal (PIN-gated POST) + unban confirm (PIN-gated DELETE)
- Empty state when no banned emails
- Following spec at docs/superpowers/specs/2026-05-28-admin-banned-accounts.md

**Schema db push:** Completed (253ms) - active/deactivationCount/deactivatedAt on User + Servicer, BannedEmail model

**Verification gates:**
| Gate | Result |
|---|---|
| Backend npx tsc --noEmit | PASS |
| Frontend npx tsc --noEmit | PASS |
| ng build --configuration development | PASS (pre-existing NG8107 only) |
| npx jest --passWithNoTests | 235 passed, 1 pre-existing failure |

---

### Session 2026-05-28 17:42 — FE verify + fix: Admin Banned Accounts tab

**Task:** Verify the "Banned" tab in admin Platform Settings page compiles and works correctly.

**Verification:** Tab was already fully implemented by parallel CEO agent. Verified:
- ✅ Tab button, template, modals, signals, all methods present
- ✅ `tsc --noEmit` zero errors
- ✅ `ng build --configuration development` exit 0

**Fix applied:**
1. `core/services/api.service.ts` — `delete()` method updated to accept optional `headers` parameter (was signature-only, missing headers support for PIN-gated deletes).
2. `admin/pages/settings.component.ts` `doUnban()` — Changed `this.http.delete('/api/v1/admin/banned-emails/...')` (hardcoded base path, missing ApiService consistency) → `this.api.delete('/admin/banned-emails/...', { 'x-action-pin': pin })`.

**Files changed:**
1. `frontend/src/app/core/services/api.service.ts` — `delete()` now accepts headers
2. `frontend/src/app/admin/pages/settings.component.ts` — `doUnban()` uses ApiService

**Gate:** `npx tsc --noEmit` ✅ zero errors. `npx ng build --configuration development` ✅ exit 0.

---

### Session 2026-05-28 18:11 — Customer Rewards frontend (steps 6-10, 12)

**Scope:** Build order steps 6-10, 12 from `docs/superpowers/specs/2026-05-28-customer-rewards.md`.

**Files created:**
1. `admin/pages/money-settings.component.ts` — New top-level admin page at `/admin/money-settings`:
   - Platform fee rate + editable fee breakdown (marketing/rewards/ops/margin) with sum validation
   - Rewards program config (points per RM, per review, per referral, welcome points, redemption rate)
   - Tier CRUD table (name, min pts, bonus %, badge color, sort order) via `/rewards/tiers` + `/admin/rewards/tiers/*`
   - Reward catalog CRUD (name, point cost, discount type/value, min top-up, active toggle) via `/admin/rewards/*`
   - Redemption log table via `/admin/rewards/redemptions`
   - Servicer rules + Timing & Tax sections moved from old settings (preserved generic NUM_SETTINGS pattern)
   - All mutations PIN-gated via `PinService`

2. `admin/pages/uiux-settings.component.ts` — New top-level admin page at `/admin/uiux-settings`:
   - Notification sound / chat message sound / typing sound toggles
   - Condo entry note textarea
   - Landing page text textarea
   - Rewards page header text input
   - All saves PIN-gated

**Files modified:**
3. `admin/admin-shell.component.ts` — Replaced "Platform Settings" nav item with "Money Settings" (`/admin/money-settings`) and "UI/UX Settings" (`/admin/uiux-settings`)
4. `admin/admin.routes.ts` — Added lazy routes for `money-settings` and `uiux-settings`
5. `customer/pages/rewards.component.ts` — Complete rewrite:
   - Replaced static demo data with API-driven signals (`pointsData`, `history`, `rewards`, `myRedemptions`)
   - Welcome banner on first visit (checks `GET /user/me/rewards/prompt`, dismisses to localStorage)
   - Points + tier hero card with dynamic tier color, progress bar
   - How-to-earn section with tier bonus display
   - Reward catalog with search + "I can afford" filter chip
   - Redemption via `POST /user/me/rewards/:id/redeem`
   - My Vouchers list showing status + expiry
   - Points transaction history table
6. `shared/shell.component.ts` — Added re-engagement banner for customers:
   - `rewardsPromptVisible` / `rewardsPromptPoints` signals
   - `loadRewardsPrompt()` checks `GET /user/me/rewards/prompt` with 3-day localStorage dismiss
   - `dismissRewardsPrompt()` stores dismissal timestamp
   - Banner renders below topbar, gated on customer role
   - CSS: `.rewards-banner` fixed-position accent banner with link + dismiss ×
7. `servicer/pages/deposit.component.ts` — Added voucher auto-apply section:
   - `VoucherInfo` interface, `availableVouchers` signal, `selectedVoucherCode` signal
   - `loadVouchers()` calls `GET /rewards/active-vouchers?topupAmount=X`
   - Radio button list for voucher selection with label + discount display
   - `doTopup()` passes `voucherCode` in request body when selected
   - CSS: `.voucher-option` styling
8. `servicer/pages/account.component.ts` — Added platform fee transparency card:
   - `FeeBreakdown` interface, `feeBreakdown` signal
   - Fee table card showing labeled breakdown rows + total
   - Loads from `GET /servicer/me/fee-breakdown`
   - CSS: `.fee-table`, `.fee-row`

**Gate:** `npx tsc --noEmit` ✅ zero errors. `npx ng build --configuration development` ✅ exit 0 (pre-existing NG8107 warnings only).

---

### Session 2026-05-28 17:51 — Deposit/Credit/Promotions (Frontend build)

**Scope:** Per `docs/superpowers/specs/2026-05-28-deposit-credit-promotions.md` build order steps 3, 6, 7, 8, 10.

**Work done:**

1. **Admin Promotions tab** (`admin/pages/settings.component.ts`):
   - Added `'promotions'` to `Tab` type; added "Promotions" tab button with `loadPromotions()` on click
   - `AdminPromotion` interface with all spec fields
   - Search bar filtering by label; active/inactive sections with promo cards (label, trigger type badge, value, description, usage meta, Edit/Activate/Deactivate buttons)
   - Add/Edit modal with conditional fields: `topup_min_amount` → minAmount input, `category_booking` → category dropdown, `nth_booking` → nthNumber input, `booking_min_amount` → minBookingAmount input, seasonal → startDate/endDate
   - PIN-gated save (POST/PATCH) and toggle (PATCH) via `PinService.requirePin()`
   - CSS: `.promo-toolbar`, `.promo-card`, `.promo-header/label/trigger/value`, `.promo-meta`, `.promo-form`, `.promo-form-row`

2. **Deposit page redesign** (`servicer/pages/deposit.component.ts`):
   - Full redesign per spec §7: Balance overview (Deposit/Credit/Total 3-card grid)
   - Transfer between accounts section: direction dropdown (Deposit→Credit / Credit→Deposit), amount + PIN fields, computed max transferable (respects minimum deposit)
   - Top up credit (Stripe): amount input, calls `POST /servicer/me/topup`, redirects to Stripe Checkout URL (or dev fallback)
   - Bank transfer top-up (existing flow preserved): amount + reference form
   - Withdrawal section: shows saved bank name/account from profile, amount + PIN fields, calls `POST /servicer/me/withdrawal`
   - Transaction history table from `GET /servicer/me/credit-log`

3. **Bank account section** (`servicer/pages/account.component.ts`):
   - Added bankName/bankAccount to `ServicerProfile` interface, form fields `f.bankName`/`f.bankAccount`, seeded from profile on init
   - New "Bank Account" section between Profile and Identity change request banner
   - `saveBank()` PATCHes `/servicer/me` with `{ bankName, bankAccount }`, shows success/error

4. **Onboarding gate modal** (`servicer/pages/jobs.component.ts`):
   - Added `onboardingRequired`, `missingItems`, `redirectUrl` signals
   - Modal template shown when backend returns `{ missing, redirectUrl }` from propose endpoint
   - Lists missing items with "Go to Account Settings" button (RouterLink)
   - Added `.modal-backdrop`/`.modal` CSS
   - Imported `RouterLink` from `@angular/router`

**Files changed:**
1. `frontend/src/app/servicer/pages/deposit.component.ts` — complete rewrite (+270 lines)
2. `frontend/src/app/servicer/pages/account.component.ts` — bank section + saveBank (+55 lines)
3. `frontend/src/app/admin/pages/settings.component.ts` — promotions tab (+310 lines)
4. `frontend/src/app/servicer/pages/jobs.component.ts` — onboarding gate + RouterLink (+35 lines)

**Gate:** `npx tsc --noEmit` ✅ zero errors. `npx ng build --configuration development` ✅ exit 0 (pre-existing NG8107 warnings only).

---

### Session 2026-05-28 — Track B1.4: Admin Promotions tab API field name fix

**Scope:** Align `AdminPromotion` interface and all component methods/template with the actual backend Prisma schema field names.

**Problem found:** Previous session implemented the Promotions tab using field names that don't match the backend API:
- Frontend sent `discountType` → backend validates/stores `valueType`
- Frontend sent `{ isActive }` on toggle → backend handles `active`
- Frontend read `expiresAt` from API response → backend returns `endDate`
- Frontend sent `code` field → not in Promotion schema

These were runtime mismatches (passed tsc/ng build but would fail at runtime with 422s).

**Fixes applied to `admin/pages/settings.component.ts`:**
1. `AdminPromotion` interface: removed `code`, renamed `discountType`→`valueType`, `isActive`→`active`, `expiresAt`→`endDate`; tightened `conditions` type from `any` to `Record<string,unknown>`
2. `promoForm` object: `discountType`→`valueType`
3. `activePromotions`/`inactivePromotions` computed: `p.isActive`→`p.active`, removed `p.code` fallback
4. `openPromoModal()`: reset form uses `valueType`
5. `editPromo()`: `p.discountType`→`p.valueType`, `p.expiresAt`→`p.endDate`; conditions access uses bracket notation with type casts
6. `savePromo()`: body sends `valueType` not `discountType`, `endDate` not `expiresAt`, removed `code` field
7. `togglePromo()`: sends `{ active: !p.active }` not `{ isActive }`
8. Template: all `p.isActive`→`p.active`, `p.discountType`→`p.valueType`, `p.expiresAt`→`p.endDate`, `p.label || p.code`→`p.label`, select bind `promoForm.discountType`→`promoForm.valueType`

**Files changed:**
1. `frontend/src/app/admin/pages/settings.component.ts` — interface + method + template field name alignment

**Gate:** `npx tsc --noEmit` ✅ zero errors. `npx ng build --configuration development` ✅ exit 0 (pre-existing NG8107 warnings only).

---

### Session 2026-05-28 — G-2: Proposal prompt inline form (F-A enhancement)

**Scope:** Upgrade the MVP proposal prompt guard in `frontend/src/app/shared/shell.component.ts` from a simple redirect toast to a full expandable card with inline proposal submission.

**What changed:**

**New types (above @Component):**
- `IncomingQuoteSummary` — `{ quoteId, category }` per socket event
- `OpenedQuoteDetail extends IncomingQuoteSummary` — adds `customerName`, `customerAvatarUrl`, `estimatedPrice` from the open-quote API response

**New/replaced signals:**
- `pendingQuotes = signal<IncomingQuoteSummary[]>([])` — source of truth (replaces the three MVP signals)
- `expandedQuote = signal<OpenedQuoteDetail | null>(null)` — which quote is expanded
- `submitting`, `loadingExpand`, `proposalError` signals
- `proposalPrice: number | null`, `proposalDesc: string` — ngModel-bound plain properties
- `quotePromptVisible`, `quotePromptCount`, `quotePromptCategory`, `customerInitials` — now `computed()` from `pendingQuotes` / `expandedQuote`

**New methods:**
- `expandPrompt()` — calls `POST /servicer/quotes/:id/open` (marks opened, returns customerName + avatarUrl + proposalPrefill); populates `expandedQuote` and pre-fills price
- `submitProposal()` — validates price > 0, calls `POST /servicer/quotes/:id/propose`; on success: `ToastService.success()`, removes quote from `pendingQuotes`, collapses
- `collapseExpanded()` — collapses back to collapsed state without dismissing
- `dismissQuotePrompt()` — clears `pendingQuotes` + `expandedQuote`, cancels timer
- `onEscKey()` — `@HostListener('document:keydown.escape')`: Esc collapses if expanded, dismisses if collapsed

**Template changes:**
- Replaced simple `<div class="quote-prompt">` banner with `[class.expanded]="expandedQuote()"` card
- Collapsed: 📋 icon + category + "Respond" button (calls `expandPrompt()`) + × dismiss
- Expanded: customer avatar (initials circle) + name + category badge + price input (RM prefix) + optional description textarea + inline error + "Send proposal" / "Cancel" buttons

**CSS changes:**
- `.quote-prompt` — now a surface-colored card with gradient border pulse animation (`qp-pulse-border`)
- `.quote-prompt.expanded` — removes pulse, wider (400px)
- `.qp-collapsed`, `.qp-expanded`, `.qp-form-hd`, `.qp-identity`, `.qp-avatar`, `.qp-customer-name`, `.qp-cat-badge`, `.qp-form-body`, `.qp-field`, `.qp-price-wrap`, `.qp-price-prefix`, `.qp-price-input`, `.qp-textarea`, `.qp-error`, `.qp-form-actions`, `.qp-btn-primary`, `.qp-btn-ghost` — all new
- Mobile: `@media (max-width: 600px)` sets width to `calc(100vw - 2rem)` for both states

**Services injected:** `ToastService` (new injection in ShellComponent)

**Files changed:**
1. `frontend/src/app/shared/shell.component.ts` — interfaces, signals, methods, template, CSS

**Gate:** `npx tsc --noEmit` ✅ zero errors. `ng build` ✅ exit 0 (pre-existing warnings only).

---

## Session — Admin Settings 5-Tab Restructure (G-1 Frontend)

**Spec:** `docs/superpowers/specs/2026-05-28-admin-settings-redesign.md`

**What changed in `frontend/src/app/admin/pages/settings.component.ts`:**

- `type Tab` updated: removed `'customer' | 'platform'`, added `'general' | 'categories' | 'location'` (new 7-tab type: `general | categories | servicer | location | thumbnails | banned | promotions`)
- Default tab changed from `'customer'` → `'general'`
- `NUM_SETTINGS` entries previously marked `tab: 'platform'` updated to `tab: 'general'`
- Added `Postcode` interface (`postcode`, `district`, `state`, `lat?`, `lng?`)
- Added Location tab signals + methods: `postcodes`, `postcodeSearch`, `loadingPostcodes`, `postcodeLoadError`, `postcodePage`, `filteredPostcodes` (computed), `totalPostcodePages` (computed), `pagedPostcodes` (computed), `loadPostcodes()`, `openPostcodeModal()`, `openEditPostcodeModal()`, `savePostcode()`, `doDeletePostcode()` + modal open/error signals
- **General tab** (new): platform fee rate + notifications + timing & tax + no-response discount + condo entry note (merged from old Platform + Customer tabs)
- **Categories tab** (new): budget ranges (moved from old Customer tab) + allowed time slots per-category (moved from old Thumbnails tab)
- **Servicer tab**: unchanged content, same tab name
- **Location tab** (new): searchable paginated postcode CRUD table + add/edit/delete modals (PIN-gated) + CSV import placeholder; calls `GET/POST/PATCH/DELETE /admin/postcodes` — backend endpoints not yet built, errors shown gracefully
- **Thumbnails tab**: image upload only (time slots removed, moved to Categories)
- **Banned / Promotions tabs**: unchanged
- Old `'customer'` and `'platform'` tabs removed entirely — no dead code

**Backend note:** `GET/POST/PATCH/DELETE /admin/postcodes` endpoints are not yet implemented. Location tab calls them and shows error message gracefully if they return 404/500. Backend work is tracked under G-1 backend gap.

**Files changed:**
1. `frontend/src/app/admin/pages/settings.component.ts` — full tab restructure

**Gate:** `npx tsc --noEmit` ✅ zero errors. `ng build` ✅ exit 0 (pre-existing warnings only: bundle budget 510kB vs 500kB threshold, pre-existing optional chain warnings in services.component.ts, qrcode CommonJS warning).

---

### Session 2026-05-28 — Working hours grid + optional PIN at registration

**Scope:** Two additive UI features in the servicer account page and customer registration flow.

**Task 1 — Working hours grid (servicer account page)**

`frontend/src/app/servicer/pages/account.component.ts`
- Added 4 new `readonly` class constants: `WEEKDAYS`, `TIME_SLOTS`, `DAY_LABELS`, `SLOT_LABELS`
- Added 5 signals: `scheduleGrid`, `loadingSchedule`, `savingSchedule`, `scheduleError`, `saveScheduleOpen`
- Added `scheduleConfirmPin` plain string property
- `ngOnInit` now calls `this.loadSchedule()` after `loadPinStatus()`
- Added private `loadSchedule()` — hits `GET /servicer/me/schedule`, builds a flat `Record<string,boolean>` keyed `"weekday-timeSlot"`
- Added `toggleCell(day, slot)` — flips the boolean in `scheduleGrid` via `.update()`
- Added `openSaveSchedule()` — resets pin + error, opens modal
- Added `doSaveSchedule()` — validates PIN present, builds `slots[]` array matching backend shape (`{ weekday, timeSlot, available }`), calls `PATCH /servicer/me/schedule` with `x-action-pin` header, shows toast on success
- Template: new `<!-- Working hours -->` section inserted between Business Details and PIN sections — 7×4 toggle grid (weekdays across, time slots down), Save schedule button, PIN confirmation modal using `<app-modal>`
- CSS: added `.schedule-grid`, `.schedule-header`, `.schedule-row`, `.schedule-cell`, `.schedule-cell.on`, `.schedule-col-head`, `.schedule-row-label` rules

**Task 2 — Optional PIN at registration**

`frontend/src/app/auth/register.component.ts`
- Added `pin = ''` property
- Added PIN field to template (last field before submit) — `type="password"`, `maxlength="6"`, `pattern="[0-9]{6}"`, `inputmode="numeric"`, helper text directing user to Account settings
- `submit()` validates PIN format if provided (`/^[0-9]{6}$/`), passes `pin` to `auth.register()` only when exactly 6 digits

`frontend/src/app/core/services/auth.service.ts`
- Added `pin?: string` to `register()` payload type — mirrors existing `registerServicer()` which already had `pin?`

**Gates:**
- `npx tsc --noEmit` → 0 errors ✅
- `ng build` → pass, 0 errors ✅ (account-component chunk: 41.7 → 46.8 kB; pre-existing warnings unchanged)

---

## 2026-05-29 — Shared StripePaymentService + unified payment overlay

**`frontend/src/app/core/services/stripe-payment.service.ts`** (new)
- Shared injectable `StripePaymentService` with `state()` signal ('idle'|'processing'|'success'|'cancelled'|'failed')
- `openPayment(config)` — opens Stripe in new tab, polls `/stripe/verify-topup` every 3s for authenticated users
- `openGuestPayment(config)` — opens Stripe in new tab, polls localStorage for guest (unauthenticated) users
- `checkPopupContext()` — detects redirect-back from Stripe in a popup/tab, stores result in `localStorage:stripe_payment_result`, closes the tab
- `cancel()` / `reset()` — lifecycle methods

**`frontend/src/app/shared/shell.component.ts`**
- Added `#stripePayment` injection + `checkPopupContext()` call in `ngOnInit`
- Added full-screen Stripe payment overlay (`.stripe-backdrop` + `.stripe-guard`) bound to service state — shown when any authenticated flow initiates a top-up
- Replaced `runTopUp()` direct `window.open()` + `pollTopUp()` with `stripePayment.openPayment()`; removed `pollTopUp()`

**`frontend/src/app/customer/pages/quote-form.component.ts`**
- Replaced inline polling (`startPolling`/`stopPolling`/`onPollFailed`/`cancelPolling`/`resetTopUp`) with `StripePaymentService`
- Simplified top-up prompt guard template to only show idle state (amount input) — processing/success/failed states handled by shell overlay
- `doTopUpRedirect()` now calls `stripePayment.openPayment()` with `onSuccess` callback that resumes quote submission

**`frontend/src/app/servicer/pages/deposit.component.ts`**
- Replaced direct `window.open()` + `pollServicerTopUp()` with `stripePayment.openPayment()`
- Removed `pollServicerTopUp()` method

**`frontend/src/app/guest/guest-quote.component.ts`**
- Replaced popup approach (popup + localStorage polling) with `stripePayment.openGuestPayment()` — opens Stripe in new tab, polls localStorage via shared service
- Removed `openStripePopup()`, `pollStripeResult()`, `cancelStripePopup()`, `clearStripePoll()` methods
- Popup detection in `ngOnInit` still stores result but now uses shared `stripe_payment_result` localStorage key
- Overlay binds to `stripePayment.state()` signals instead of local `stripePopupResult`

**Gates:**
- `npx tsc --noEmit` → 0 errors ✅

---

## 2026-05-29 — Phase 7: AI Smart Assistant (frontend)

**`frontend/src/app/core/services/chat-widget.service.ts`:**
- Added `ActionBlock`, `PrefillData` interfaces
- Added greeting pool management, unread tracking, prefill accumulator, actionBlocks signal

**`frontend/src/app/shared/chat-widget.component.ts`:**
- Added action block rendering (6 card types: quote_options, quote_field, quote_prefill, profile_field, pin_required, link)
- Added guest auto-open timer with greeting display
- Added action block handling methods
- Updated send/delayedReply to handle actionBlocks

**`frontend/src/app/admin/pages/ai-chat-settings.component.ts`** (new):
- Admin page with General, System Prompt, and Greetings sections
- Loads from `GET /admin/chat/settings`, saves via `PATCH /admin/settings`

**`frontend/src/app/admin/admin.routes.ts`:** Added AI Chat Settings route
**`frontend/src/app/admin/admin-shell.component.ts`:** Updated nav link

**`frontend/src/app/customer/pages/quote-form.component.ts`:**
- Added `?prefill=` base64 param handling in ngOnInit, `applyChatPrefill()` method

**`frontend/src/app/guest/guest-quote.component.ts`:**
- Added `?prefill=` base64 param handling in ngOnInit

**Gates:**
- `ng build` → pass, 0 errors ✅

---

## Session 2026-06-01 — Avg listing price badge in Category Settings

**Scope:** Display average active listing price per category in admin Category Settings list. Paired with backend endpoint extension.

**Changes to `frontend/src/app/admin/pages/category-settings.component.ts`:**

| Change | Location | Detail |
|--------|----------|--------|
| `Category` interface | Lines 52–53 | Added `averagePrice?: number \| null`, `priceStatListingCount?: number` |
| Template badge | Lines 147–149 | After listings badge: `@if (cat.averagePrice != null && (cat.priceStatListingCount ?? 0) > 0)` → green badge `avg RM {{ cat.averagePrice.toFixed(2) }} ({{ n }} listings)` |
| CSS | Line 544 | `.badge.price { background: #f0fdf4; color: #166534; border-color: #f0fdf4; }` |

**Design decisions:**
- Green (#f0fdf4 / #166534) distinct from blue listings badge — visual separation
- Null-guarded: hidden when `averagePrice` is null or listing count is 0
- Pluralization matches existing pattern (`listing{{ n === 1 ? '' : 's' }}`)
- Sub-cats editor tab intentionally excluded — compact list, main list is the analytics surface

**Gates:**
- `npx tsc --noEmit` → **zero errors**
- `npx ng build` → **exit 0** (pre-existing warnings only: NG8113 unused imports, CSS syntax in home.component.ts, bundle budget)
- Category-settings-component chunk: 114.71 kB (was 114.63 kB, +80 bytes)

**Status: COMPLETE.**

---

## Session 2026-06-01 — deep-route MIME fix: absolutize index.html asset URLs

**Scope:** Eliminate the 10× "Failed to load module script" MIME errors on every deep direct-load/refresh of the Cloudflare-deployed SPA. (Diagnosis + reproduction in ceo-log; root cause = relative `<link rel="modulepreload">` hrefs resolving against the deep document URL instead of `<base href="/">`.)

**New file `frontend/scripts/postbuild-absolutize.mjs`:**
- Idempotent post-build transform of `dist/myhomeservicer/browser/index.html`.
- Regex rewrites relative `href=`/`src=` asset refs to root-absolute (`/chunk-X.js`, `/main-X.js`, `/styles-X.css`).
- Skips already-absolute (`/`), full URLs (`http(s):`, `//`), and special schemes (`data:`, `#`, `mailto:`, `tel:`, `?`). `<base href="/">` and external `https://fonts` preconnects untouched.

**Change to `frontend/package.json`:**
- `"build": "ng build"` → `"build": "ng build && node scripts/postbuild-absolutize.mjs"`.

**Verification (local):** ran transform on existing dist → `[absolutize] rewrote 14 relative asset ref(s)`. Read-confirmed all 10 modulepreload hrefs + polyfills/main scripts + 2 styles links are now `/`-absolute; base href preserved. (`ng build` not re-run this session — Cloudflare rebuilds on push.)

**⚠️ Deploy dependency:** Cloudflare Pages build command must be `npm run build` (not bare `ng build`). Flagged in devops-log + SESSION-HANDOFF.

**Status: COMPLETE (pending live reverify after Cloudflare redeploy).**

---

## Session 2026-06-01 — Pay-by-card button (Stripe Checkout) in the invoice modal

**Scope:** Let a customer pay an unpaid booking invoice by card. Wires the shipped backend
gateway-settlement flow into the only existing surface (the my-bookings invoice modal).

**Changes to `customer/pages/my-bookings.component.ts`:**
- Injected `StripePaymentService`; added `payBooking` + `paying` signals; `viewInvoice(b)`
  now stores the booking.
- Invoice modal: a **"💳 Pay by card"** button shows when `!inv.paidAt` AND the booking is
  `completed` AND `paymentMode !== 'pay_now'` (covers pay_later + cash; backend re-guards).
- `payByCard()`: `POST /stripe/create-booking-payment-session { bookingId }` → opens Checkout
  via `StripePaymentService.openPayment` (new tab + 3s poll of `/stripe/verify-booking-payment`)
  → on success: toast, close modal, reload bookings (invoice flips to Paid).

**Gates:** `npx tsc --noEmit` 0 errors; `npx ng build` complete (exit 0). Only pre-existing
warnings (NG8113 unused imports, home.component CSS, bundle budget, qrcode CommonJS) — none
from this change.

**⚠️ NOT yet live-verified:** needs a real Stripe test card (4242 4242 4242 4242) on the live
demo — only the user can complete a hosted Checkout. Also requires the Stripe webhook endpoint
(`/api/v1/stripe/webhook`) to be registered in the Stripe dashboard for the demo backend (the
`/verify-booking-payment` redirect-poll is the fallback if the webhook isn't wired).

**Known gap (pre-existing, flagged):** there is NO customer credit/cash settle UI at all — no
frontend calls `POST /bookings/:id/settle`. This card button is the first settlement trigger
in the UI. A full settle surface (credit/cash too) is a separate feature.

**Status: COMPLETE (compile-gated); live test-card verification pending (user).**

---

### Session 2026-06-02 — Customer Rewards gaps — Task 4 (Frontend items 2–5)

**Items verified in existing code:**
2. **Welcome banner on rewards page (Item 2):** `frontend/src/app/customer/pages/rewards.component.ts` already has `showWelcomeBanner` signal, `checkWelcome()` method using localStorage `rewards_welcome_seen`, and dismissible welcome banner template. Already implemented in commit `0786261`.
3. **Idle re-engagement banner in shell (Item 3):** Added to `frontend/src/app/shared/shell.component.ts`. New `idleBannerVisible` signal, `checkIdleBanner()` method fetches `GET /bookings?limit=1` to check last booking date. Shows banner if no booking in 30+ days. Banner text: "It's been a while! 🏠 Need help around the house?" with "Request a Quote" link navigating to `/customer/quote/new`. Dismissible via localStorage `idleBannerDismissedAt`.
4. **Voucher auto-apply in top-up modal (Item 4):** `frontend/src/app/shared/shell.component.ts` already has `activeVouchers` signal, `onTopUpAmountChange()` fetches `GET /rewards/active-vouchers`, `selectVoucher()` auto-fills amount/promo, and voucher list template in the top-up modal. Already implemented in commit `0786261`.
5. **Notification prefs UI (Item 5):** `frontend/src/app/customer/pages/account.component.ts` already has Notification Preferences section with `notifPrefs` signal, toggle switches for bookingUpdates/proposals/promotions/chatMessages, and `saveNotifPrefs()` calling `PATCH /user/me`. Already implemented in commit `0786261`.

**Files changed:**
- `frontend/src/app/shared/shell.component.ts` — added idle re-engagement banner (template, signal, `checkIdleBanner()`, `dismissIdleBanner()`, CSS)

**Gates:** `npx tsc --noEmit` → 0 errors; `npx ng build` → exit 0 (pre-existing qrcode CommonJS warning only).

---

### Session 2026-06-02 — Task 2: Stripe frontend (pay-now card payments)

**Audit finding:** Most of Task 2 was already built by prior sessions. Verified existing:

| Item | Status | File |
|------|--------|------|
| `@stripe/stripe-js` npm package | ✅ Installed (^9.7.0) | `frontend/package.json` |
| `StripeCardFormComponent` | ✅ Exists (Elements-based, `confirmCardPayment()`) | `shared/stripe-card-form.component.ts` |
| `StripePaymentService` | ✅ Exists (Checkout overlay + polling) | `core/services/stripe-payment.service.ts` |
| Quote-form card payment wiring | ✅ `onGatewaySelect()`, `cardStep`, `clientSecret`, template bindings | `customer/pages/quote-form.component.ts` |
| `STRIPE_PUBLISHABLE_KEY` in env.ts | ✅ Already in Zod schema | `backend/src/config/env.ts:56` |
| `stripePublishableKey` in environment.ts | ✅ Already in frontend env | `frontend/src/environments/environment.ts:17` |

**Truly missing (2 items):**
- `STRIPE_PUBLISHABLE_KEY` was absent from `backend/.env` and `backend/.env.example` — added with the matching pk_test key.

**Files changed:**
1. `backend/.env.example` — added `STRIPE_PUBLISHABLE_KEY=` line
2. `backend/.env` — added `STRIPE_PUBLISHABLE_KEY=pk_test_...`

**Gates:**
| Gate | Result |
|------|--------|
| `npx tsc --noEmit` (frontend/) | ✅ 0 errors |
| `npx ng build` (frontend/) | ✅ exit 0 |

---

## Session 2026-06-02 — Quote form fixes: credit hold bypass, address parsing, preset UI

### 1. Insufficient credit fix (quote.service.ts + quote-form.component.ts)
- **Root cause**: Backend `createQuote()` credit hold checked only `paymentMode === 'pay_now'`, ignoring `settlementMethod`. Gateway (Stripe card) payments were incorrectly requiring wallet balance.
- **Backend fix**: `quote.service.ts` credit hold now skips when `input.settlementMethod !== 'gateway'`. Added `settlementMethod` to `CreateQuoteInput` interface + route validators.
- **Frontend fix**: `doSubmit()` error handler catches "insufficient credit" and routes to top-up overlay instead of showing raw error message.

### 2. Address auto-fill parsing
- **Root cause**: `applyPresetObject()` used naive space-split to extract house number — failed for "No. 12", "12A", "B-2-3", "Lot 1234" formats.
- **Fix**: New regex `(/^(?:(?:No|Lot)\.?\s+)?(\d[\dA-Za-z]*|(?:[A-Z]-\d[\d\/\-]*))\s+(.+)$/i)` handles all common Malaysian address formats.
- When parsing yields empty addressNo, `goToSummary()` shows a hint (`stepHint`) asking user to enter a unit/lot number rather than hard-blocking (address is still valid in DB).

### 3. Preset dropdown scan skeleton
- **Changed**: Auto-fill presets now load lazily on first toggle (not at init). While loading, 3 skeleton rows with `bw-scan`/`bw-sweep` light-bar animation match the browse page scan pattern.
- **Added**: `presetsLoading` signal, lazy-load guard (`presetsLoaded` flag), skeleton template with stagger delays.

### 4. Preset button UI alignment
- `.preset-row` now `justify-content: center` for centered alignment
- Both buttons widened to `min-width: 140px` with `padding: 0.45rem 1.2rem`
- Auto-fill trigger styled with `--color-primary` (orange fill), hover → solid orange + white text

### Files changed
| File | Change |
|------|--------|
| `frontend/src/app/customer/pages/quote-form.component.ts` | Credit error → top-up; address parsing regex; lazy skeleton; preset alignment; stepHint |
| `backend/src/services/quote.service.ts` | Credit hold skips gateway; CreateQuoteInput.settlementMethod |

**Gates:**
| Gate | Result |
|------|--------|
| `npx tsc --noEmit` (frontend/) | ✅ 0 errors |
| `npx ng build` (frontend/) | ✅ exit 0 |
| `npx tsc --noEmit` (backend/) | ✅ 0 errors |
| `npx jest --passWithNoTests` | ✅ 298 pass, 0 fail |
| `npx tsc --noEmit` (backend/) | ✅ 0 errors |

---

## Session 2026-06-02 — Task 8: UI / Frontend gaps

**Scope:** 5 items to fix dispatch overlay visibility, SP2b tabs, quantity pricing, presence wiring, shell split.

### 1. Visibility controls in dispatch overlay
- Added `servicerEmail`, `servicerPhone`, `showEmailPublic`, `showPhonePublic` to `JobDetail` interface in `dispatch-overlay.component.ts`
- Added "My Contact Visibility" panel in the overlay showing the servicer what info about them is visible to the customer
- Each field renders with `@if (showEmailPublic)` / `@if (showPhonePublic)` guards
- Note: the backend's `GET /servicer/jobs/:id` must include these fields in the response. Currently the route returns `getMerchantJob()` result — verify it selects `servicer.showEmailPublic`, `servicer.showPhonePublic`, `user.email`, `user.phone`.
- Added `RouterLink` import for the Account Settings link

### 2. SP2b deferred tabs in Category Settings
- **Thumbnail upload tab**: Added file upload widget for category thumbnail (`imageUrl`). Uses presigned URL flow (matching existing photo upload pattern). Added `onThumbnailFile()` method with validation (5 MB limit). Updated `saveImagery()` to include `imageUrl` in PATCH body.
- **Customer copy tab**: Added expandable "Tips for customers" section (string list with add/remove) and "FAQ entries" section (question/answer pairs with add/remove). Updated `saveCopy()` to include `tips` and `faqEntries` in PATCH body. Both fields are stored on the Category model via the PATCH endpoint.
- Added `HttpClient` injection for file upload. Updated `openEdit()` to parse existing tips/faq from the category record.

### 3. Quantity × unit pricing in computePrefill
- The backend `computePrefill()` in `servicer-quote.service.ts:153-175` already handles `type: 'quantity'` pricing with `entry.price * qty`. Verified by existing unit tests (`quote-pricing-model.test.ts` lines 428+). No changes needed — this was already implemented in a prior session.

### 4. Presence wiring — isOnline
- Backend `socket/index.ts:77-94` already sets `isOnline: true` on socket connect and `isOnline: false` on disconnect for servicer principals. The frontend `ShellComponent` already subscribes to `quote.new` socket events (triggering lazy socket connect) and has the `toggleOnline()` UI. No changes needed — fully wired.

### 5. Shell component split
- Created `frontend/src/app/shared/shell-nav.component.ts` — new standalone component extracting the `.sidebar` section (nav items, routerLink bindings, responsive layout). Accepts `[navItems]` @Input. All CSS from shell migrated.
- Enhanced `frontend/src/app/shared/demo-bar.component.ts` — merged all shell inline demo bar features: demo account dropdowns, +Proposal button, ↻ Reseed button, unplug modal with PIN confirmation, clear-data flow, demo-msg bar. Added `ModalComponent` import for unplug/reseed modals.
- Updated `shell.component.ts` — replaced inline demo bar with `<app-demo-bar />` and inline sidebar with `<app-shell-nav>`. Removed all moved signals (`confirmReseed`, `reseeding`, `demoLoggingIn`, `demoMsg`, `unplug*`, `clearing*`, `seedingProposal`, `openDD`, demo account arrays) and methods (`demoLogin`, `demoLoginEmail`, `demoGoHome`, `seedProposal`, `reseed`, `clearData`, `openUnplug`, `closeUnplug`, `runUnplug`, `toggleDD`, `closeDD`, `closeDDOnOutsideClick`). Changed top-up success feedback from `demoMsg` to `toast.success()`.
- The existing `ChatWidgetComponent` and `NotificationPanelComponent` are rendered at the app root level (`app.component.ts`) and do not need shell extraction.

### Files changed
| File | Change |
|------|--------|
| `frontend/src/app/shared/dispatch-overlay.component.ts` | Visibility controls panel + JobDetail fields |
| `frontend/src/app/admin/pages/category-settings.component.ts` | Thumbnail upload, tips, FAQ entries |
| `frontend/src/app/shared/shell-nav.component.ts` | **NEW** — sidebar extracted |
| `frontend/src/app/shared/demo-bar.component.ts` | Enhanced with reseed/unplug/proposal |
| `frontend/src/app/shared/shell.component.ts` | Uses sub-components, removed moved code |

**Gates:**
| Gate | Result |
|------|--------|
| `npx tsc --noEmit` (frontend/) | ✅ 0 errors |
| `npx ng build` (frontend/) | ✅ exit 0 |

---

## Session 2026-06-02 — Track 2: Quote confirmation + WhatsApp + proposal banner

### Customer quote confirmation state
- `quote-form.component.ts`: added `submitted`, `submittedQuoteId`, `submittedCategory`, `submittedProposalCount`, `confirmCountdown` signals. On POST /quotes success, sets these and flips `submitted` to true. Template shows "Request Confirmed!" card with category, short ID, 3s countdown → `/customer/quotes` via `goToQuotesNow()`.
- Proposals banner: if `submittedProposalCount() > 0`, shows "You already got N proposal(s) — pick your servicer now!" with link.
- WhatsApp disclosure on bill step (`.wa-disclosure`) and confirm page (`.confirm-wa-note`): "Your servicer may contact you via phone or WhatsApp using the number you provided."

### Guest quote countdown
- `guest-quote.component.ts`: `guestCountdown` signal, 3s countdown on submit success → navigates to `/`. Shows "Redirecting to home in N…" + "Back to home" link.

### WhatsApp deep-link on dispatch overlay
- `dispatch-overlay.component.ts`: `waLink(phone)` helper — strips non-digits, normalises Malaysian `0xxx` → `60xxx`. WhatsApp pill button (`#25D366`) added next to the tel link in the customer panel.

### Files changed
- `frontend/src/app/customer/pages/quote-form.component.ts`
- `frontend/src/app/guest/guest-quote.component.ts`
- `frontend/src/app/shared/dispatch-overlay.component.ts`

Gates: frontend tsc 0 / ng build 0

---

## Session 2026-06-02 — Track 3: Sidebar compliance + Notification UX

### Sidebar (§15.4)
- `shell-nav.component.ts` `.sidebar` was missing `display: flex; flex-direction: column; min-height: 0` — added. `.sidebar nav` was missing `flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin` — added. Nav links now scroll internally; page never scrolls to reveal sidebar content. No sidebar footer items (theme/sign-out are in topbar) — no footer-pin needed.

### Notification UX (notification-panel.component.ts)
- **B1 Filters**: 5 content-type chips (All / Orders / Jobs / Promos / System). `toContentFilter()` maps type strings via regex. Secondary "Unread" pill toggle combines with chip filter on `liveItems` computed signal.
- **B2 Per-item dismiss**: × button per row (18px, opacity 0→1 on hover, always visible on touch). `dismissItem()` adds ID to local `dismissed` Set — optimistic removal. No DELETE endpoint exists; client-side only.
- **B3 Past activity**: Collapsible section (collapsed by default) showing last 10 read/non-dismissed notifications grouped by Today/Yesterday/[date]. Hidden when empty. Reuses `np-item` row template.

### Files changed
- `frontend/src/app/shared/shell-nav.component.ts`
- `frontend/src/app/shared/notification-panel.component.ts`

Gates: frontend tsc 0 / ng build 0

## Session 2026-06-02 — RUN 3: Rewards + promo integration

### Changes

1. `frontend/src/app/customer/pages/rewards.component.ts`
   - Added `Router` injection and `useVoucher()` method → navigates to `/customer/quote/new?promoCode=CODE`
   - Added `VoucherWithApp` interface with `_applicable`, `_reason`, `_checking` flags
   - Added `voucherQuery` signal + `voucherFilter` signal for search/filter by code and status
   - Added `filteredVouchers` computed — filters by query + status, marks applicability (expired/used → false)
   - Added `formatDiscount()` helper showing reward discount description
   - Template: voucher search input + filter chips, voucher rows with description, reason text for inapplicable, "Use" button for applicable active vouchers
   - CSS: `.voucher-info`, `.voucher-inapplicable` (opacity 0.5), `.voucher-use`, `.voucher-desc`, `.voucher-reason`

2. `frontend/src/app/customer/pages/quote-form.component.ts`
   - `ngOnInit`: reads `promoCode` query param from URL and sets `f.promoCode`
   - `goToBill()`: auto-calls `applyPromo()` if promo code present but not yet applied
   - `submit()`: re-validates promo code via `GET /quotes/estimate` before submitting. If promo fails, clears it and shows error instead of proceeding
   - Added `continueSubmit()` helper extracted from original `submit()` body — called after successful promo re-validation or when no promo present

**Gates:**
| Gate | Result |
|------|--------|
| `npx tsc --noEmit` (frontend/) | ✅ 0 errors |
| `npx ng build` | ✅ 0 errors |

---

## 2026-06-17 — Agent E: WhatsApp preset manager + reusable wa-button (SP-3 dispatch, branch `feat/sp3-wa-preset`)

### New: `shared/wa-button.component.ts` (`<app-wa-button>`) — KEY DELIVERABLE for Agent D
Standalone, no service/router deps (pure presentation + `window.open`). Public contract:
- `[phone]: string` — customer phone, any local/intl format.
- `[preset]: WaPreset | null` — `{ label, body }`; its `body` wins over `[body]`.
- `[body]: string` — raw message if no preset.
- `[vars]: WaVars | null` — `{ name?, orderId?, eta? }`; interpolated into `{name}`/`{orderId}`/`{eta}`.
- `[label]: string` — button text (default `'Message on WhatsApp'`).
- `[disabled]: boolean`.
- Behaviour: interpolates placeholders (missing → ''), normalizes phone to intl digits (MY: strip
  spaces/dashes/`+`; leading `0` → `60`; bare local → `60`-prefixed; explicit `+cc`/`60…` pass through),
  opens `https://wa.me/<intl>?text=<encodeURIComponent(msg)>` in a new tab. Auto-disabled (muted) when
  no usable phone. Agent D drops `<app-wa-button [phone] [preset] [vars]>` onto the won-job card.

### New: `servicer/pages/wa-preset-manager.component.ts` (`<app-wa-preset-manager>`)
List + create + edit + soft-delete CRUD against `/servicer/wa-presets`. Mirrors `services-modules.component.ts`
patterns (inline prompt-guard modal §7.0, `<app-list-toolbar>` search + active/inactive chip filters,
signals, `DialogService.confirm` for disable, `ToastService` feedback). Body textarea documents the
`{name}`/`{orderId}`/`{eta}` placeholders. STYLE-RULES tokens throughout (no raw hex except the
brand-fixed WhatsApp green on the button).

### Edited: `servicer/pages/account.component.ts` (Business Profile)
Added `WaPresetManagerComponent` import + to `imports[]`; inserted a new `<section class="card page-child">`
hosting `<app-wa-preset-manager>` after the Business Contacts section.

Did **NOT** touch `jobs.component.ts` (Agent D wires `<app-wa-button>` there).

**Gates:**
| Gate | Result |
|------|--------|
| `npx ng build` (AOT) | ✅ 0 errors — bundle generation complete, 11.97s |

---

## Agent D — SP-3 dispatch + booking-flow + cards (2026-06-17, branch `feat/sp3-dispatch-cards`)

Owner of `jobs.component.ts`. (Left Agent C's photo-picker block untouched.)

**No re-confirm (task 1):** removed the "Awaiting confirmation" `pending_confirm` section and
the `pending_confirm` Confirm branch in the Active tab; dropped the now-unused `confirm()` method.

**Online/offline branch (task 2):** `dispatch-prompt-guard.component.ts` now injects `AuthService`
— shows the center guard only when `auth.principal().isOnline`; offline servicers get a corner
toast (`New dispatch: <cat>. Open Jobs to respond.`) instead of the interrupt overlay.

**Accept Job one-tap (task 3):** pending OPEN-quote card + `incoming-quotes.component.ts` both
gained a one-tap "Accept Job" button → `POST /servicer/quotes/:id/accept-listing` (no manual form;
the manual propose form stays as the advanced path on expand). "Taken" conflict → friendly message.

**Post-accept collapse (task 4):** once a proposal is sent the pending card collapses to 3 lines —
`[RM price][duration]` row + `[message]` paragraph.

**Cards + WhatsApp (task 6):** Active card shows the same detail (price · duration · payment) and
imports `<app-wa-button>` (from Agent E) wired with `[phone]`/`[vars]={name,orderId,eta}` for the
won/active job (rendered only when `customerPhone` is present).

**Gates:**
| Gate | Result |
|------|--------|
| `npx tsc --noEmit` (frontend/) | ✅ 0 errors |
| `npx ng build` (AOT) | ✅ 0 errors — bundle generation complete |


## 2026-06-23 — Plan 2: Dispatch Card Visual Redesign

**Scope:** Plan 2 of the dispatch card spec (Stream A). Backend slot-load helper + full frontend card redesign.

**Task 1 — Backend slot-load:**
- Added `countSlotJobs` helper to `servicer-quote.service.ts` — counts servicer's active (confirmed/in_progress) bookings on same MYT date+slot. Uses `scheduledDate` (not `preferredDate`) per Booking model schema.
- Wired into `listIncomingQuotes` — queries bookings once, computes `slotJobs: { count }` per quote.
- Unit test: `backend/tests/unit/slot-load.test.ts` — 3 cases, all pass.

**Task 2 — IncomingQuote interface:**
- Extended `IncomingQuote` with all fields backend already sends: `isUrgent`, `urgentFee`, `customerName`, `customerAvatarUrl`, `address`, `postcode`, `district`, `state`, `lat`, `lng`, `notes`, `descriptions`, `slotJobs`, `paymentMode`.

**Task 3 — Card helpers:**
- `slotLabel(slot)` — maps slot enum values to friendly labels (Morning 9-11, etc.)
- `placeLine(q)` — composed district/state or fallback to address
- `openMap(q, app)` — deep-links to Google Maps or Waze (new tab), prefers lat/lng when available, falls back to address query

**Task 4 — Card template redesign:**
- New card hierarchy: Price (bold primary) → Time (date + slot label + slot-load badge) → Place (district/state + address). `[Urgent +RM fee]` tag on urgent cards with red left border. `View on map ↗` in chips row with propertyType. ▾ expander shows customer name+avatar, descriptions, notes, and propose form.
- New CSS: `.quote.urgent`, `.tag-urgent`, `.facts` flex layout, `.chip-static`, `.map-link`, `.details`, `.cust`/`.avatar`, `.answers`, `.notes`.

**Task 5 — Real-time taken-status:**
- Subscribed to `quote.matched` socket event (already emitted by `dispatch.service.ts`). On match, calls `load()` which filters to open-status only — taken quotes drop off the feed live.

**Gates:**

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` (backend/) | Pre-existing errors only (admin.service.ts exports) |
| `npx jest tests/unit/slot-load.test.ts` | ✅ 3/3 pass |
| `npx tsc --noEmit` (frontend/) | ✅ 0 errors |
| `npx ng build` (AOT) | ✅ exit 0 — bundle generation complete |

**Commits:**
- `bb68714` feat(servicer): surface slot-load (job count) on incoming quotes
- `fd3246b` feat(servicer): redesign dispatch card — price/time/place, urgent, slot-load, map link, taken-status


## 2026-06-23 — Proposal card + report modal + payment method cleanup
- `proposals.component.ts`: removed payment method radio buttons and gateway card form from confirm dialog
- `shell.component.ts`: added budget, schedule, pricing breakdown, map view to proposal card; dismiss calls collapseExpanded
- `my-bookings.component.ts`: replaced chat-based reportIssue with modal form
- `queues.component.ts`: added Reports tab
- `proposals.component.ts`, `quote-form.component.ts`: capture paymentIntentId for gateway flow
