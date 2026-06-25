# Modal / Overlay / Popup Audit

> Reference for every dialog/popup/overlay in the frontend and whether it uses
> the safe **top-layer `<dialog>`** pattern. Created 2026-06-23 after recurring
> "modal cropped / off-center / scroll-trapped" bugs.
>
> **The rule lives in [`frontend/STYLE-RULES.md` → "Overlays & modals"](../../frontend/STYLE-RULES.md).**
> This file is the running inventory; update it whenever a popup is added or migrated.

## Root cause of the recurring bug

A `position: fixed` element is **not** anchored to the viewport when any ancestor
has a `transform`, `filter`, `perspective`, `will-change`, or `contain` - it
anchors to that ancestor instead, and is clipped by its box. This app animates
page sections with `transform: translateY(...)` (stagger/fade reveals)
everywhere, so a fixed overlay **declared inside a page component** gets cropped,
mis-centered, and scroll-trapped (the symptoms in the screenshots).

**Fix:** native `<dialog>` + `dialog.showModal()` renders in the browser **top
layer**, which escapes all ancestor `transform` / `overflow` / `z-index` /
`contain`. Centering and stacking become bulletproof regardless of where the
component sits in the tree. `::backdrop` provides the dim.

## Status legend
- ✅ **safe** - uses native top-layer `<dialog>` (via `<app-modal>` or its own `<dialog>`).
- ⚠️ **root-mounted fixed** - hand-rolled `position:fixed`, but mounted at the app
  root (`shell.component`), not inside an animated page wrapper → not currently
  clipping. Migrate opportunistically; do **not** copy this pattern into pages.
- 🟢 **anchored** - `position:absolute` dropdown scoped to its trigger (correct, not a modal).

## Inventory

| Component | Trigger(s) | Pattern | Status |
|---|---|---|---|
| `shared/modal.component.ts` (`<app-modal>`) | shared base for most modals | native `<dialog showModal>` | ✅ safe (migrated 2026-06-23) |
| `shared/dispatch-prompt-guard.component.ts` | servicer "New dispatch" interrupt (10s countdown) | native `<dialog>` | ✅ safe (migrated 2026-06-23) |
| `shared/dialog-outlet.component.ts` | global `DialogService.confirm()/prompt()` (app-wide) | native `<dialog>` | ✅ safe (migrated 2026-06-23) |
| `shared/dispatch-overlay.component.ts` | jobs board "Booking #…" details + QR + Cancel sub-modals | native `<dialog>` ×3 | ✅ safe (migrated 2026-06-23) |
| `shared/servicer-detail-popup.component.ts` | servicer name click → profile | `<app-modal>` | ✅ safe (via base) |
| `shared/pin-prompt.component.ts` | PIN-gated action verification | `<app-modal>` (+ `.gate-cover` z-999 demo cover) | ✅ safe (via base) |
| `shared/demo-bar.component.ts` | reseed / unplug dialogs | `<app-modal>`; `.demo-dd-menu` is `position:absolute` | ✅ safe / 🟢 anchored |
| customer `proposals.component.ts` | "Select" → "Choose this servicer?" | `<app-modal>` | ✅ safe (via base) |
| customer `quote-form.component.ts`, `my-quotes`, `my-bookings`, `transactions`, `account` | various confirm/detail modals | `<app-modal>` | ✅ safe (via base) |
| servicer `account.component.ts` | "+ Add preset", contacts, etc. | `<app-modal>` | ✅ safe (via base) |
| servicer `jobs`, `calendar` | detail/confirm modals | `<app-modal>` / `dispatch-overlay` | ✅ safe |
| admin `users/settings/queues/money-settings/faq/category-settings/ai-chat-settings` | CRUD + confirm modals | `<app-modal>` | ✅ safe (via base) |
| `shared/search-select.component.ts` | searchable select dropdown | `position:absolute` (`.ss-panel`) anchored to trigger | 🟢 anchored (correct) |
| `shared/places-autocomplete.component.ts` | Google Places suggestions | Google-injected `.pac-container` | 🟢 anchored (3rd-party) |
| `shell.component.ts` → `.stripe-guard` | Stripe payment processing guard | `position:fixed` centered, z-2001 | ⚠️ root-mounted fixed |
| `shell.component.ts` → `.quote-prompt` | servicer proposal mini-card (bottom-center) | `position:fixed`, z-1000 | ⚠️ root-mounted fixed (toast-like) |
| `shell.component.ts` → `.rewards-banner` / `.idle-banner` | re-engagement banners | `position:fixed` / static | ⚠️ root-mounted (toast) |
| `shell.component.ts` → `.fab-stack` | chat / request FABs (bottom-right) | `position:fixed`, z-999 | ⚠️ root-mounted (FAB, persistent) |
| `chat-widget.component.ts` | help chat FAB → panel (bottom-right) | `position:fixed`, z-998/999 | ⚠️ root-mounted (corner panel) |
| `notification-panel.component.ts` | topbar bell → dropdown | `position:fixed`, z-1400/1401 | ⚠️ root-mounted (corner dropdown) |

## Page-level inline modals (the gap the first audit missed - fixed 2026-06-23)

The first pass only checked shared components, but **feature/page components were
hand-rolling their own `.modal-backdrop` / `.pg-guard` / `.tp-guard` / `.pv`
`position: fixed` overlays** - these were the worst offenders because they live
inside `transform`-animated page wrappers and so cropped/off-center (the
deactivate-account + "Add preset" screenshots). All migrated to `<app-modal>`:

| Component | Modal(s) | Was | Now |
|---|---|---|---|
| `customer/pages/account.component.ts` | Deactivate wizard (3 steps) | `.modal-backdrop` fixed | ✅ `<app-modal>` |
| `servicer/pages/account.component.ts` | Deactivate wizard (3 steps) | `.modal-backdrop` fixed | ✅ `<app-modal>` |
| `servicer/pages/jobs.component.ts` | Onboarding-required gate | `.modal-backdrop` fixed | ✅ `<app-modal>` |
| `customer/pages/quote-form.component.ts` | Top-up (insufficient credit) guard | `.tp-guard` fixed | ✅ `<app-modal>` |
| `servicer/pages/services-modules.component.ts` | Pricing-module guard | `.pg-guard` fixed | ✅ `<app-modal>` |
| `servicer/pages/wa-preset-manager.component.ts` | Add/Edit preset | already `<app-modal>` (removed dead `unlockBody()` orphan) | ✅ `<app-modal>` |
| `servicer/pages/listing-advanced.component.ts` | Customer preview | `.pv` fixed | ✅ `<app-modal>` |

> **Lesson for future audits:** grep the WHOLE `frontend/src/app` for
> `position: fixed`, `inset: 0`, and `*-backdrop` class names - NOT just shared
> components. Any centered overlay in a page/feature component is the bug.

## Remaining (lower priority) migrations

These are mounted at the app root (`shell.component` / persistent widgets), so
they are **not** clipped by page transforms today. Convert when touched, or if a
transformed ancestor is ever introduced above the shell:

1. `.stripe-guard` (shell) - centered payment guard. Best candidate to migrate to
   `<app-modal>`/native dialog next (it's a true centered modal).
2. `chat-widget` panel + `notification-panel` dropdown - corner-anchored; if
   migrated, keep them corner-anchored (use `position:absolute` from the trigger
   or a non-modal `<dialog>`), not centered.
3. `.quote-prompt`, `.rewards-banner`, `.fab-stack` - toast/FAB chrome, not
   dialogs; lowest priority.

## When you add a new popup

Use `<app-modal>`. Do not hand-roll a `position:fixed` backdrop inside a page
component. See the checklist in `frontend/STYLE-RULES.md → "Overlays & modals"`.
