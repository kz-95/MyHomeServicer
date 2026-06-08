# Route Redesign — Completeness Audit & Link Reroute

> 2026-06-08 · Companion spec to `2026-06-08-route-redesign.md` · Design

## Purpose

The original route-redesign spec is a **frontend route map**: it inventories 18
component/route files. But application routes are emitted from a much wider surface —
**backend notification links, Stripe return URLs, global-search results, the chat AI
system prompt, and dynamic link arrays.** If the frontend renames routes while these
emitters keep minting the old paths, every newly-created notification, AI reply, and
checkout return lands on a stale (or dead) URL.

This spec is the **completeness layer**: it enumerates *every* navigation reference in
the app (changed and unchanged, so coverage is auditable), picks a reroute strategy,
and adds the pieces the original spec omitted.

## Strategy (decided)

**Redirects + fix sources** (belt-and-suspenders):

1. **Redirect layer** — Angular redirect route entries for every renamed path. Catches
   stored DB `linkUrl`s, bookmarks, and external links permanently. (These entries are
   missing from the original spec's route-config examples.)
2. **Fix frontend sources** — components/services that still point at old paths.
3. **Fix backend sources** — notification `linkUrl` emitters, Stripe return URLs,
   global-search `route` fields, and the chat AI prompt (which also has dead links today).

Rationale: stored notification `linkUrl` rows and external links can't be migrated, so
redirects are mandatory; but leaving the backend emitting old paths makes the redirect
layer a permanent crutch and leaves the AI's dead links broken. Do both.

---

## 1. Route rename reference (from original spec)

| Old | New |
|-----|-----|
| `/servicer/jobs` | `/servicer/jobs/pending` (tabs: `/pending`, `/active`, `/history`) |
| `/servicer/notification-settings` | `/servicer/notifications/settings` |
| `/customer/bookings` | `/customer/bookings/active` (tabs: `/active`, `/pending`, `/history`) |
| `/customer/history` | `/customer/bookings/history` |
| `/customer/notification-settings` | `/customer/notifications/settings` |
| `/admin/money-settings` | `/admin/settings/money` |
| `/admin/uiux-settings` | `/admin/settings/uiux` |
| `/admin/ai-chat-settings` | `/admin/settings/ai-chat` |
| `/admin/category-settings` | `/admin/settings/categories` |
| `/admin/queues` | `/admin/queues/{withdrawals,appeals,category,reports}` |
| `/admin/dashboard` *(dead link — never existed)* | `/admin` |
| `/customer/chat`, `/contact` *(dead links)* | removed (chat is a widget) |
| `/customer/proposals`, `/customer/deposit`, `/servicer/quotes` *(dead — AI prompt only)* | corrected (see §5) |

---

## 2. Frontend — declarative `routerLink`

### 2a. NEEDS CHANGE
| File:line | Current | New | Owning phase |
|-----------|---------|-----|------|
| `servicer/pages/dashboard.component.ts:93` | `['/servicer/jobs']` (link labelled "View history →" — lands on pending, not history) | `['/servicer/jobs','history']` | **6 (was unlisted)** |
| `servicer/pages/dashboard.component.ts:294` | `/servicer/jobs` (quickLink "Pending Requests") | `/servicer/jobs/pending` | **6 (was unlisted)** |
| `servicer/pages/dashboard.component.ts:295` | `/servicer/jobs` (quickLink "Active Jobs") | `/servicer/jobs/active` | **6 (was unlisted)** |
| `servicer/pages/dashboard.component.ts:296` | `/servicer/history` (quickLink "History") *(DEAD — no such route)* | `/servicer/jobs/history` | **6 (was unlisted)** |
| `admin/pages/dashboard.component.ts:53,57,61,65` | `/admin/queues` + `?tab=` | `/admin/queues/{withdrawals,appeals,category,reports}` | 3 (spec covered) |

> `servicer/pages/dashboard.component.ts:296` emits `/servicer/history`, which is not a
> registered route — already a dead quickLink today. Fold into the dead-link hotfix.

### 2a-note. Verified NOT a change (agent false-positives rejected)
- `core/services/notification.service.ts:185` `linkQuoteList` → `/customer/quotes` is **correct/unchanged** (quote list, not bookings).
- `shared/notification-panel.component.ts:688,689` → `/{servicer,customer}/notifications` — unchanged base routes (per-role dynamic).

### 2b. ALREADY DONE (Phase 1)
| File:line | Note |
|-----------|------|
| `servicer/pages/jobs.component.ts:117,120,123` | tab routerLinks → `/servicer/jobs/{pending,active,history}` |
| `servicer/pages/calendar.component.ts:888,892` | `viewJob()` → `/servicer/jobs/:id` |

### 2c. NO CHANGE (verified — routes unchanged)
`admin/dashboard:33` (`/admin/users`), `customer/browse:76`, `customer/my-quotes:53,86,93,97`,
`dispatch-overlay:97`, `quote-form:136,590`, `deposit:204`, `jobs:515`, `shell:171,203,267`,
`my-bookings:73`, `chat-widget:145`, all auth/public pages (`login`, `register`,
`merchant-register`, `forgot/reset-password`, `children-browse`, `home`, `guest-quote`,
`not-found`), `site-footer` (all `/services/:slug`, `/`, `/terms`, `/register/servicer`),
`home.portalPath()` (dynamic `/${role}`).

---

## 3. Frontend — imperative navigation (`router.navigate` / `navigateByUrl` / `window`)

### 3a. NEEDS CHANGE
| File:line | Current | New | Owning phase |
|-----------|---------|-----|------|
| `customer/pages/proposals.component.ts:466` | `['/customer/bookings']` `?id=` | `['/customer/bookings/active']` (or `/:id`) | 2 (spec covered) |
| `customer/pages/my-bookings.component.ts:724` | `['/customer/chat']` (dead) | remove — open widget via `ChatWidgetService` | 4 (spec covered) |
| `admin/pages/setup-wizard.component.ts:99` | `['/admin/dashboard']` (dead) | `['/admin']` | 3 (spec covered) |
| `shared/chat-widget.component.ts:2477` | `['/customer/bookings']` (`report_booking`) | `['/customer/bookings/active']` | 4 (spec covered) |
| `shared/chat-widget.component.ts:2480` | `['/contact']` (dead) | remove / replace action | 4 (spec covered) |
| `shared/chat-widget.component.ts:1971,3074` | `navigateByUrl(href)` — AI-emitted href | fixed at source via chat.service prompt (§5) | 6 |

### 3b. NO CHANGE (verified)
`setup-wizard:102` (`/login`), `chat-widget:3012,3024` (`${base}/quote/new`), `demo-bar`
(dynamic `/${role}`, `window.location`), `dispatch-prompt-guard:361` (Google Maps external),
`children-browse:449,454`, `auth-callback` (dynamic target/`/login`), `merchant-register:317`
(`/servicer`), `register:185` (`/customer`), `login:281,285,304,308,310` (root/quote/dynamic),
guards (dynamic `/${role}`, `/login`, `/admin`), `home:1646,1695,1698,1704`, `account` (cust
`745` relative, `1163` `/`; servicer `1686` `/`), `calendar:888-894` (done), `order-history:250`
(`/customer/quote/new`), `quote-form:2068` (`/customer/quotes`), `jobs:1180` (print window),
`jobs:1216`/`deposit:534` (relative `navigate([])`), `services:612,616`, `rewards:496`,
`stripe-payment.service` (external Stripe URLs), `listing-wizard:865,868,951`,
`pull-to-refresh` (reload), `shell:1945,2010,2019,2079,2089,2095` (portal roots —
spec non-goal: shell hard-nav unchanged), `notification-panel:681,687` / `notifications:211`
/ `snackbar:244` (all delegate to `notification.service.routeFor()` — fixed in §4).

---

## 4. Frontend — services

| File:line | Current | New | Owning phase |
|-----------|---------|-----|------|
| `core/services/notification.service.ts:186` | `linkReorder` → `/customer/history` | `/customer/bookings/history` | 6 (spec listed) |

`routeFor()` (`:184-186`) returns `linkUrl` verbatim when present → relies on backend
emitting correct paths (§5) **and** on the redirect layer (§7) for already-stored rows.

---

## 5. Backend — link emitters (the original spec's blind spot)

### 5a. Notification `linkUrl` — NEEDS CHANGE
| File:line | Current | New |
|-----------|---------|-----|
| `services/booking.service.ts:271,696,729` | `/servicer/jobs` | `/servicer/jobs/pending` |
| `services/booking.service.ts:344,432` | `/customer/bookings` | `/customer/bookings/active` |
| `services/quote.service.ts:347,664,717` | `/servicer/jobs` | `/servicer/jobs/pending` |
| `services/dispatch.service.ts:150` | `/servicer/jobs` | `/servicer/jobs/pending` |
| `services/dispatch.service.ts:234` | `/bookings` *(DEAD — missing `/customer` prefix; no such route)* | `/customer/bookings/active` |
| `routes/stripe.routes.ts:643` | `/customer/bookings` | `/customer/bookings/active` |

> `dispatch.service.ts:234` emits `/bookings` (no portal prefix) — already a broken
> notification link in production. Fold into the §5d dead-link hotfix.

### 5b. Stripe checkout return URLs — NEEDS CHANGE
| File:line | Current | New |
|-----------|---------|-----|
| `services/booking.service.ts:839,840` | `/customer/bookings?stripe_settled=` / `?stripe_cancel=` | `/customer/bookings/active?...` |
| `routes/stripe.routes.ts:93,94` | `/customer/bookings?pay=success` / `?pay=cancelled` | `/customer/bookings/active?...` |

### 5c. Global search `route` field (`routes/index.ts`) — NEEDS CHANGE
| File:line | Current | New |
|-----------|---------|-----|
| `routes/index.ts:390` | `/servicer/jobs` (Job result) | `/servicer/jobs/pending` |
| `routes/index.ts:421` | `/customer/bookings` (Booking result) | `/customer/bookings/active` |

### 5d. Chat AI system prompt (`services/chat.service.ts`) — NEEDS CHANGE + BUG FIX
The prompt instructs the model to emit markdown links; frontend `navigateByUrl`s them.
Two problems: redesign-stale routes **and** routes that are already dead today.

| File:line | Current | New |
|-----------|---------|-----|
| `:96` | `/customer/bookings` | `/customer/bookings/active` |
| `:97` | `/customer/history` | `/customer/bookings/history` |
| `:99` | `/customer/proposals` *(DEAD — no such route)* | `/customer/quotes` (proposals live under `/customer/quotes/:id/proposals`) |
| `:102` | `/customer/deposit` *(DEAD — customer wallet is `/customer/transactions`)* | `/customer/transactions` |
| `:85` | `/servicer/quotes` *(DEAD)* | `/servicer/jobs/pending` |
| `:85` | `/servicer/jobs` | `/servicer/jobs/pending` |
| `:86` | `/admin/dashboard` *(DEAD)* | `/admin` |
| `:518` | `/customer/history` | `/customer/bookings/history` |

> The dead links (`/customer/proposals`, `/customer/deposit`, `/servicer/quotes`,
> `/admin/dashboard`) are broken in production **now**, independent of the redesign.
> Candidate for a hotfix ahead of the rest of Phase 6.

### 5f. Seed AI-chat FAQ knowledge base — NEEDS CHANGE + BUG FIX
`backend/prisma/seed/data/static.ts` holds FAQ/knowledge-base entries the chatbot
serves to users as navigation instructions ("go to …"). These are seeded into the DB
and surfaced by the AI — same user-facing risk as the chat prompt (§5d). The route
strings live inside prose answer text.

| File:line | Current | New |
|-----------|---------|-----|
| `static.ts:2891` | `/admin/queues` | `/admin/queues/withdrawals` |
| `static.ts:2931` | `/admin/ai-chat-settings` | `/admin/settings/ai-chat` |
| `static.ts:2956,2967` | `/admin/category-settings` | `/admin/settings/categories` |
| `static.ts:3008` | `/admin/money` *(DEAD — neither old `/admin/money-settings` nor new path)* | `/admin/settings/money` |

OK (unchanged): `static.ts:2681` (`/servicer/services/new`), `:2864` (`/admin/users`),
`:3016` (`/admin/settings`).

> Seed strings require a **reseed** (or a data migration on existing FAQ rows) to take
> effect in environments already seeded. `/admin/money` (`:3008`) is dead today.

### 5e. Backend NO CHANGE (verified — routes unchanged)
`stripe.routes:304,596` (`/customer/transactions`), `stripe.routes:539` (`/servicer/deposit`),
`stripe.routes:162,163` / `user.routes:128,129` (`/customer/account?topup`), `servicer.routes:366,367`
(`/servicer/deposit?topup`), `servicer-quote.service:426` & `quote.jobs:43` (`/customer/quotes/:id/proposals`),
`booking.jobs:111` & `quote.jobs:134` (`/customer/quote/new?from`), `chat.service:1526`
(`/customer/quote/new` | `/guest/quote/new`), search results for services/invoices/quotes/merchants
(`index.ts:394,397,415,432`).

---

## 6. Redirect routes — MISSING from the original spec's config examples

The original spec lists these in backward-compat *tables* but omits them from the example
`Routes` arrays. They must be added as real entries (otherwise stored/external old links 404):

```typescript
// customer.routes.ts
{ path: 'history', redirectTo: 'bookings/history', pathMatch: 'full' },
{ path: 'bookings', redirectTo: 'bookings/active', pathMatch: 'full' }, // '' child already covers
{ path: 'notification-settings', redirectTo: 'notifications/settings', pathMatch: 'full' },

// servicer.routes.ts
{ path: 'notification-settings', redirectTo: 'notifications/settings', pathMatch: 'full' },
// jobs '' → 'pending' already added in Phase 1

// admin.routes.ts
{ path: 'dashboard', redirectTo: '', pathMatch: 'full' },
{ path: 'money-settings', redirectTo: 'settings/money', pathMatch: 'full' },
{ path: 'uiux-settings', redirectTo: 'settings/uiux', pathMatch: 'full' },
{ path: 'ai-chat-settings', redirectTo: 'settings/ai-chat', pathMatch: 'full' },
{ path: 'category-settings', redirectTo: 'settings/categories', pathMatch: 'full' },
// queues '' → 'withdrawals' per original spec
```

> Note: query-param deep links (e.g. `/admin/queues?tab=appeals`, `/customer/bookings?id=`)
> are NOT preserved by a plain `redirectTo`. Where the original spec converts a `?tab=`
> into a path segment, the **source** must be updated (§2a, §5) rather than relying on a
> redirect. A plain redirect drops the query string's routing intent.

---

## 7. Revised phasing

The original Phases 1-5 stay frontend-structural. Redirect entries (§6) fold into the phase
that renames each route. Everything backend/dynamic becomes a new **Phase 6**.

| Phase | Scope | Adds (this audit) |
|-------|-------|-------------------|
| 1 | Servicer jobs | ✅ done. `jobs '' → pending` redirect already in. |
| 2 | Customer bookings | + `customer.routes` redirects: `history`, `notification-settings` |
| 3 | Admin settings + queues | + `admin.routes` redirects: `dashboard`, `*-settings` |
| 4 | Shared + dead links | (unchanged — chat-widget `/contact`, `/customer/chat`) |
| 5 | Detail pages (stretch) | (unchanged) |
| **6 (NEW)** | **Backend & dynamic links** | All §5 backend emitters, §5d chat AI prompt (+dead-link fix), §2a servicer dashboard, §4 frontend `notification.service`, §3 `navigateByUrl(href)` source-fix. Independent of 1-5; ship after frontend lands. |

### Optional hotfix (ahead of Phase 6)
These are broken **now**, independent of the redesign — split into a standalone fix if desired:
- Chat AI prompt dead links: `/customer/proposals`, `/customer/deposit`, `/servicer/quotes`, `/admin/dashboard` (§5d)
- `dispatch.service.ts:234` `/bookings` (missing `/customer` prefix → no route match)
- `servicer/pages/dashboard.component.ts:296` `/servicer/history` (no such route) (§2a)
- `customer/pages/my-bookings.component.ts:724` `/customer/chat` & `chat-widget.component.ts` `/contact` (§3a, Phase 4)
- `seed/data/static.ts:3008` `/admin/money` (FAQ text — dead route served to users) (§5f)

---

## 8. Coverage summary

| Surface | Files | Status |
|---------|-------|--------|
| Frontend `routerLink` | 40 files swept + 4-portal page-by-page walk | 4 lines change (servicer dashboard `93,294,295,296`, incl. 1 dead `/servicer/history`), rest covered/unchanged |
| Frontend imperative nav | swept | all covered by Phases 2/3/4/6 or unchanged |
| Frontend services | `notification.service` | 1 line (Phase 6) |
| Backend notification `linkUrl` | `booking.service`, `quote.service`, `dispatch.service`, `stripe.routes` | 10 sites (Phase 6), incl. 1 dead-link bug |
| Backend Stripe returns | `booking.service`, `stripe.routes` | 4 sites (Phase 6) |
| Backend search `route` | `index.ts` | 2 sites (Phase 6) |
| Backend chat AI prompt | `chat.service` | 8 lines, incl. 4 dead-link bugs (Phase 6) |
| Seed AI FAQ knowledge base | `prisma/seed/data/static.ts` | 5 lines, incl. 1 dead `/admin/money`; needs reseed (Phase 6) |
| Backend tests | `backend/tests/**` | all `/api/v1/*` endpoints (unchanged); `MANUAL-TEST-PLAN.md` stale prose only (non-runtime) |
| Redirect scaffolding | `customer/servicer/admin.routes` | added §6 |
| Route guards (`canActivate`) | `admin.routes` users/queues/api-keys | 🔴 must carry onto restructured routes — §9f |
| Security review | navigateByUrl / routeFor / `:id` IDOR / guards | §9 |
| Docs sync | TODO.md, original spec, security-notes, ceo-run-roadmap | updated same session |

## 9. Security & data-leak review

The reroute touches navigation primitives, so it was reviewed for open-redirect, unsafe
navigation, IDOR, and cross-portal/data leaks.

### 9a. Dynamic route construction — clean
All concatenated/template routes resolve to server-derived, redesign-unchanged targets:
`/${role}` / `portalPath()` / `createUrlTree(['/'+role])` (`role` from server `Principal`),
`${base}/quote/new` (`base` ∈ {customer, guest}). `api.service`/`auth.service`
`${base}${path}` are API calls (`/api/v1`), not routes. **No renamed route hides in a
concatenation; no user input flows into a route path.**

### 9b. `navigateByUrl(href)` — harden the relative-path guard (low severity)
`chat-widget.component.ts:1997,3220` guard `href.startsWith("/")`, which also admits the
protocol-relative `//evil.com`. Not exploitable (Angular router is same-origin and cannot
perform a cross-origin redirect), but as defense-in-depth the guard should reject `//`
and `/\`. Mitigating: AI markdown links all render `target="_blank"` (`:1981`) and
`handleThreadClick` returns early on `_blank`, so AI-controlled hrefs never reach
`navigateByUrl` in-app — only app-authored relative links do.

### 9c. `routeFor()` returns `linkUrl` unguarded — keep `linkUrl` backend-controlled
`core/services/notification.service.ts:184` returns `n.linkUrl` verbatim, then
panel/snackbar/notifications `navigateByUrl()` it. Safe today because every emitter sets
`linkUrl` to a static literal (§5) — **never** built from user input. Rule for Phase 6:
keep `linkUrl` server-controlled, and add a `startsWith('/') && !startsWith('//')` guard
in `routeFor()` so a future bad emitter can't become an open-redirect.

### 9d. New `:id` detail routes are IDOR surfaces — enforce server-side authz
`/servicer/jobs/:id`, `/customer/bookings/:id`, `/admin/users/:id`, `/admin/merchants/:id`
(Phase 5) must rely on **server-side ownership/role checks on the backing endpoint**, not
on the route. The existing `GET /servicer/jobs/:id` overlay already authorizes — replicate
that for every new detail page. The route param is not an access-control boundary.

### 9f. 🔴 Route guards must be carried onto restructured routes (HIGH — regression risk)
`adminActionPinGuard` (`canActivate`) currently protects three flat admin routes
(`admin.routes.ts`): `users` (L27), `queues` (L32), `settings/api-keys` (L68). The
**original spec's example `adminRoutes` config omits every `canActivate`** — implementing
it verbatim would silently remove the admin action-PIN gate from Accounts, Review Queues,
and API Keys (a real auth bypass introduced by the refactor). Required:
- `queues` becomes a parent with children → put `canActivate: [adminActionPinGuard]` on the
  **parent** `queues` node so all four sub-routes inherit it (a guard on `''`-redirect alone
  does not cover siblings).
- `users` keeps its guard; the **new `users/:id` detail route also needs it** (it shows
  sensitive account data).
- `settings/api-keys` keeps its guard after nesting under `settings`.
- Re-verify after each phase: `adminActionPinGuard` still fires on every renamed admin page.

This generalizes: **any guard attached to a renamed/nested route must move with it.** Audit
`canActivate`/`canMatch` on every route a phase touches.

### 9e. No routing data-leak found
Notification `linkUrl`s embed only the recipient's own resource IDs (server-scoped to the
authed user); role guards (`auth.guards.ts`) block cross-portal navigation; the redesign
weakens neither. Redirect routes (`redirectTo`) carry no params and add no surface.

---

## 10. Non-goals (unchanged)

Guest routes, public/auth roots, `/services/:slug`, demo-bar dynamic redirects,
`shell.component` hard navigations, external URLs (Stripe, Google Maps), the
`/customer/account?topup` and `/servicer/deposit?topup` returns (routes unchanged),
backend OAuth `res.redirect`s (`auth.routes.ts:222,229` → `/login`, `/auth/callback` —
unchanged), and `admin/users` internal `?tab=` (component keeps its own tabs per the
original spec).
