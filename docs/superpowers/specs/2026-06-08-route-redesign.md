# App-Wide Route Redesign - RESTful URL Restructuring

> 2026-06-08 · Specification · Phase 1 complete, Phase 2–6 pending
>
> ⚠️ **Read alongside the completeness companion:**
> `2026-06-08-route-redesign-completeness-design.md`. This spec is the frontend route
> map; the companion audits the FULL reroute surface (backend `linkUrl`/Stripe/search/
> chat-AI emitters, seed FAQ, dynamic routes) and adds a **new Phase 6**. Two things in
> THIS doc's example route configs are deliberately incomplete and MUST NOT be copied
> verbatim - see the companion:
> 1. The `Routes` examples omit backward-compat **`redirectTo` entries** (companion §6).
> 2. The admin `Routes` example omits **`canActivate: [adminActionPinGuard]`** on
>    `users`, `queues` (→ parent), and `settings/api-keys` - copying it verbatim makes the
>    demo PIN gate (token + accidental-edit safeguard) stop firing on those pages
>    (companion §9f). Carry every guard onto its renamed/nested route.

## Brainstorm Decisions (Session 2026-06-08)

Key design decisions from the brainstorming session:

| Decision | Outcome |
|----------|---------|
| `/servicer/jobs/:id` page type | **Full page** (A) - replaces the jobs list, browser back returns to list |
| Calendar card: description state | **All collapsed by default**, only one open at a time (toggle behavior) |
| Calendar card: View Job behavior | `window.open()` new tab on desktop (>760px), `router.navigate` on mobile |
| Calendar card: address format | Single `address` field (DB stores one line - "No.18, Jalan Tempua 5"), displayed with postcode/district/state appended |
| Calendar card: payment label | `pay_now` → always "Paid", `pay_later` → always "Unpaid", `cash` → depends on `cashConfirmed` |
| Customer bookings tabs | Pending + Active share same `MyBookingsComponent`, History uses separate `OrderHistoryComponent` |
| Admin queues tabs | All 4 sub-routes use same `AdminQueuesComponent`, read which tab from URL segment |
| Notification settings | Nested under `/notifications/settings` for both customer and servicer |
| FAQ | No standalone route - stays embedded in admin AI Chat settings |
| Chat | No `/chat` route - stays a floating widget |

## Goal

Restructure all portal URLs to use RESTful, hierarchical paths instead of flat routes
with in-component tabs. Tab state, filter state, and sort state move from internal
Angular signals into the URL via segments and query parameters. This gives users
bookmarkable, shareable, browser-navigable URLs.

## Design Principles

1. **Segment for state, query param for filter.** Tabs become URL segments (`/jobs/pending`),
   filters become query params (`?filter=new`).
2. **Hierarchical nesting.** Related pages nest under a common parent (e.g.
   `/admin/settings/money`, `/customer/bookings/history`).
3. **Backward-compatible.** Existing external links and notification deep-links must
   continue to work. Old URLs should redirect to new ones where feasible.
4. **No `/chat` route.** Chat remains a floating widget, not a separate page.
5. **No `/contact` route.** Not in scope. Dead links pointing here are removed.
6. **No FAQ route.** FAQ management stays embedded inside admin settings.

---

## 1. Servicer Portal (`/servicer`)

### Route Map

| Method | Old URL | New URL | Component | Action |
|--------|---------|---------|-----------|--------|
| GET | `/servicer` | `/servicer` | `ServicerDashboardComponent` | Keep |
| GET | `/servicer/jobs` *(in-component tab signal)* | `/servicer/jobs/pending` | `ServicerJobsComponent` (pending tab) | **Refactor** |
| GET | - | `/servicer/jobs/active` | `ServicerJobsComponent` (active tab) | **Add** |
| GET | - | `/servicer/jobs/history` | `ServicerJobsComponent` (history tab) | **Add** |
| GET | - | `/servicer/jobs/history/:id` | Single history job detail | **NEW** |
| GET | - | `/servicer/jobs/:id` | Active job detail/actions overlay | **NEW** |
| GET | `/servicer/services` | `/servicer/services` | `ServicerServicesComponent` | Keep |
| GET | `/servicer/services/new` | `/servicer/services/new` | `ListingWizardComponent` | Keep |
| GET | `/servicer/services/:id/edit` | `/servicer/services/:id/edit` | `ListingWizardComponent` | Keep |
| GET | `/servicer/calendar` | `/servicer/calendar` | `ServicerCalendarComponent` | Keep |
| GET | `/servicer/promotions` | `/servicer/promotions` | `ServicerPromotionsComponent` | Keep |
| GET | `/servicer/deposit` | `/servicer/deposit` | `ServicerDepositComponent` | Keep |
| GET | `/servicer/invoices` | `/servicer/invoices` | `ServicerInvoicesComponent` | Keep |
| GET | `/servicer/account` | `/servicer/account` | `ServicerAccountComponent` | Keep |
| GET | `/servicer/notifications` | `/servicer/notifications` | `NotificationsComponent` | Keep |
| GET | `/servicer/notification-settings` | `/servicer/notifications/settings` | `NotificationSettingsComponent` | **Rename** |

### Query Parameters

| Route | Param | Values | Purpose |
|-------|-------|--------|---------|
| `/servicer/jobs/pending` | `filter` | `all`, `new`, `responded` | Sub-filter quote requests |
| `/servicer/jobs/pending` | `search` | string | Text search category names |
| `/servicer/jobs/pending` | `sort` | `date`, `price_high`, `price_low` | Sort direction |
| `/servicer/jobs/active` | `filter` | `all`, `pending_confirm`, `confirmed`, `in_progress` | Sub-filter active jobs |
| `/servicer/jobs/active` | `search` | string | Text search |
| `/servicer/jobs/active` | `sort` | `date`, `price_high`, `price_low` | Sort direction |
| `/servicer/jobs/history` | `filter` | `all`, `completed`, `cancelled` | Sub-filter history |
| `/servicer/jobs/history` | `days` | `7`, `30` | Earnings chart window |
| `/servicer/jobs/history` | `sort` | `date`, `price_high`, `price_low` | Sort direction |

### Sidebar Changes

| Old Label | Old Route | New Label | New Route | exact? |
|-----------|-----------|-----------|-----------|--------|
| Dashboard | `/servicer` | Dashboard | `/servicer` | yes |
| My Jobs | `/servicer/jobs` | My Jobs | `/servicer/jobs/pending` | no - match prefix `/jobs` |
| Calendar | `/servicer/calendar` | Calendar | `/servicer/calendar` | no |
| Service Listings | `/servicer/services` | Service Listings | `/servicer/services` | no |
| Promotions | `/servicer/promotions` | Promotions | `/servicer/promotions` | no |
| Deposit | `/servicer/deposit` | Deposit | `/servicer/deposit` | no |
| Account | `/servicer/account` | Account | `/servicer/account` | no |
| Notifications | `/servicer/notifications` | Notifications | `/servicer/notifications` | no |

### Component Changes

| File | Change |
|------|--------|
| `servicer.routes.ts` | Add child routes: `jobs/pending`, `jobs/active`, `jobs/history`, `jobs/history/:id`, `jobs/:id`. Add `/notifications` parent with `settings` child. |
| `jobs.component.ts` | Replace `tab = signal('pending')` with `ActivatedRoute` URL segment reader. Push filter/sort/search to `queryParams` instead of local signals. |
| `servicer-shell.component.ts` | Update `routerLink` for My Jobs to `/servicer/jobs/pending`. |
| `calendar.component.ts:569` | Change `openJob()` navigate from `/servicer/jobs?focus=:id` to `/servicer/jobs/:id`. |

### Backward Compatibility

| Old URL | Redirect |
|---------|----------|
| `/servicer/jobs` | → `/servicer/jobs/pending` |
| `/servicer/jobs?focus=:id` | → `/servicer/jobs/:id` |
| `/servicer/notification-settings` | → `/servicer/notifications/settings` |

---

## 2. Customer Portal (`/customer`)

### Route Map

| Method | Old URL | New URL | Component | Action |
|--------|---------|---------|-----------|--------|
| GET | `/customer` | `/customer` | `BrowseComponent` | Keep |
| GET | `/customer/quote/new` | `/customer/quote/new` | `QuoteFormComponent` | Keep |
| GET | `/customer/quotes` | `/customer/quotes` | `MyQuotesComponent` | Keep |
| GET | `/customer/quotes/:id/proposals` | `/customer/quotes/:id/proposals` | `ProposalsComponent` | Keep |
| GET | `/customer/bookings` | `/customer/bookings/active` | `MyBookingsComponent` (active tab) | **Refactor** |
| GET | - | `/customer/bookings/pending` | `MyBookingsComponent` (pending tab) | **Add** |
| GET | `/customer/history` | `/customer/bookings/history` | `OrderHistoryComponent` | **Rename** |
| GET | - | `/customer/bookings/history/:id` | Single history booking detail | **NEW** |
| GET | - | `/customer/bookings/:id` | Single active booking detail | **NEW** |
| GET | `/customer/rewards` | `/customer/rewards` | `RewardsComponent` | Keep |
| GET | `/customer/transactions` | `/customer/transactions` | `TransactionsComponent` | Keep |
| GET | `/customer/account` | `/customer/account` | `AccountComponent` | Keep |
| GET | `/customer/notifications` | `/customer/notifications` | `NotificationsComponent` | Keep |
| GET | `/customer/notification-settings` | `/customer/notifications/settings` | `NotificationSettingsComponent` | **Rename** |

### Query Parameters

| Route | Param | Values | Purpose |
|-------|-------|--------|---------|
| `/customer/bookings/active` | `filter` | `all`, `confirmed`, `in_progress` | Status filter |
| `/customer/bookings/pending` | `filter` | `all`, `pending_confirm` | Status filter |
| `/customer/bookings/history` | `filter` | `all`, `completed`, `cancelled` | Status filter |

### Sidebar Changes

| Old Label | Old Route | New Label | New Route | exact? |
|-----------|-----------|-----------|-----------|--------|
| Find a Service | `/customer` | Find a Service | `/customer` | yes |
| Current Quotes | `/customer/quotes` | Current Quotes | `/customer/quotes` | no |
| Upcoming | `/customer/bookings` | Bookings | `/customer/bookings/active` | no - match prefix `/bookings` |
| Order History | `/customer/history` | *(removed)* | *(merged into `/customer/bookings/history`)* | - |
| Payments | `/customer/transactions` | Payments | `/customer/transactions` | no |
| Rewards | `/customer/rewards` | Rewards | `/customer/rewards` | no |
| Notifications | `/customer/notifications` | Notifications | `/customer/notifications` | no |
| Account | `/customer/account` | Account | `/customer/account` | no |

### Component Changes

| File | Change |
|------|--------|
| `customer.routes.ts` | Restructure: group under `bookings/` parent with `active`, `pending`, `history`, `history/:id`, `:id` children. Add `/notifications` parent with `settings` child. |
| `my-bookings.component.ts` | Either split into per-tab components or read tab from URL segment via `ActivatedRoute`. Move `tab` signal logic to route resolution. |
| `order-history.component.ts` | Register under `/customer/bookings/history` instead of `/customer/history`. |
| `customer-shell.component.ts` | Merge "Upcoming" + "Order History" sidebars into single "Bookings" link pointing to `/customer/bookings/active`. |
| `proposals.component.ts:466` | Change navigate to `/customer/bookings/active?id=:bookingId` or `/customer/bookings/:id`. |
| `chat-widget.component.ts:1479` | Change `/customer/bookings` → `/customer/bookings/active` for `report_booking` action. |

### Backward Compatibility

| Old URL | Redirect |
|---------|----------|
| `/customer/bookings` | → `/customer/bookings/active` |
| `/customer/history` | → `/customer/bookings/history` |
| `/customer/notification-settings` | → `/customer/notifications/settings` |

---

## 3. Guest

No structural changes. Guest routes remain flat (only one page: `/guest/quote/new`).

| Route | Component | Action |
|-------|-----------|--------|
| `/guest/quote/new` | `GuestQuoteComponent` | Keep |

---

## 4. Admin Portal (`/admin`)

### Route Map

| Method | Old URL | New URL | Component | Action |
|--------|---------|---------|-----------|--------|
| GET | `/admin` | `/admin` | `AdminDashboardComponent` | Keep |
| GET | `/admin/users` | `/admin/users` | `AdminUsersComponent` (tabs via query params inside) | Keep |
| GET | - | `/admin/users/:id` | Single user detail | **NEW** |
| GET | `/admin/merchants` | `/admin/merchants` | `AdminMerchantsComponent` | Keep |
| GET | - | `/admin/merchants/:id` | Single merchant detail | **NEW** |
| GET | `/admin/queues` | `/admin/queues` | `AdminQueuesComponent` (or redirect) | Keep |
| GET | - | `/admin/queues/withdrawals` | Withdrawals review queue | **NEW sub-route** |
| GET | - | `/admin/queues/appeals` | Appeals review queue | **NEW sub-route** |
| GET | - | `/admin/queues/category` | Category requests queue | **NEW sub-route** |
| GET | - | `/admin/queues/reports` | Reports queue | **NEW sub-route** |
| GET | `/admin/settings` | `/admin/settings` | `AdminSettingsComponent` | Keep |
| GET | `/admin/money-settings` | `/admin/settings/money` | Financial settings | **Rename** |
| GET | `/admin/uiux-settings` | `/admin/settings/uiux` | UI/UX settings | **Rename** |
| GET | `/admin/ai-chat-settings` | `/admin/settings/ai-chat` | AI Chat + FAQ | **Rename** |
| GET | `/admin/category-settings` | `/admin/settings/categories` | Category settings | **Rename** |
| GET | `/admin/settings/api-keys` | `/admin/settings/api-keys` | API Keys | Keep |
| GET | `/admin/setup` | `/admin/setup` | `SetupWizardComponent` | Keep |

### Sidebar Changes

| Old Label | Old Route | New Label | New Route | exact? |
|-----------|-----------|-----------|-----------|--------|
| Dashboard | `/admin` | Dashboard | `/admin` | yes |
| Accounts | `/admin/users` | Users | `/admin/users` | no |
| Review Queues | `/admin/queues` | Review Queues | `/admin/queues/withdrawals` | no - match prefix `/queues` |
| AI Chat Settings | `/admin/ai-chat-settings` | AI Chat & FAQ | `/admin/settings/ai-chat` | no |
| Financial Settings | `/admin/money-settings` | Financial | `/admin/settings/money` | no |
| Category Settings | `/admin/category-settings` | Categories | `/admin/settings/categories` | no |
| UI/UX Settings | `/admin/uiux-settings` | UI/UX | `/admin/settings/uiux` | no |
| API Keys | `/admin/settings/api-keys` | API Keys | `/admin/settings/api-keys` | no |

### Dashboard Stat Card Links

| Old Link (in `dashboard.component.ts`) | New Link |
|-----------------------------------------|----------|
| `['/admin/users', { queryParams: { tab: 'servicer' } }]` | `['/admin/users']` + keep query param |
| `['/admin/queues', { queryParams: { tab: 'withdrawals' } }]` | `['/admin/queues/withdrawals']` |
| `['/admin/queues', { queryParams: { tab: 'appeals' } }]` | `['/admin/queues/appeals']` |
| `['/admin/queues', { queryParams: { tab: 'category' } }]` | `['/admin/queues/category']` |
| `['/admin/queues', { queryParams: { tab: 'reports' } }]` | `['/admin/queues/reports']` |

### Component Changes

| File | Change |
|------|--------|
| `admin.routes.ts` | Add `settings/` parent with `money`, `uiux`, `ai-chat`, `categories` children. Add `queues/` parent with `withdrawals`, `appeals`, `category`, `reports`. Add `users/:id`, `merchants/:id`. |
| `admin-shell.component.ts` | Update all sidebar `routerLink` paths. |
| `dashboard.component.ts` | Update 5 stat-card `routerLink` paths for new queue sub-routes. |
| `setup-wizard.component.ts:99` | Fix dead link: `/admin/dashboard` → `/admin`. |

### Backward Compatibility

| Old URL | Redirect |
|---------|----------|
| `/admin/ai-chat-settings` | → `/admin/settings/ai-chat` |
| `/admin/money-settings` | → `/admin/settings/money` |
| `/admin/uiux-settings` | → `/admin/settings/uiux` |
| `/admin/category-settings` | → `/admin/settings/categories` |
| `/admin/dashboard` (dead link) | → `/admin` |

---

## 5. Public & Root Routes

No structural changes.

| Route | Component | Notes |
|-------|-----------|-------|
| `/` | `HomeComponent` | Landing page |
| `/login` | `LoginComponent` | Auth |
| `/register` | `RegisterComponent` | Customer registration |
| `/register/servicer` | `MerchantRegisterComponent` | Servicer registration |
| `/auth/callback` | `AuthCallbackComponent` | Auth0 callback |
| `/auth/forgot` | `ForgotPasswordComponent` | Forgot password |
| `/auth/reset` | `ResetPasswordComponent` | Reset password |
| `/terms` | `TermsComponent` | T&C |
| `/services/:parentSlug` | `ChildrenBrowseComponent` | Public sub-category browser |
| `**` | `NotFoundComponent` | 404 |

---

## 6. Dead Links - Remediation

| Dead Link | File | Line | Fix |
|-----------|------|------|-----|
| `/customer/chat` | `customer/pages/my-bookings.component.ts` | 724 | Remove - chat is a widget, not a route. Open widget via `ChatWidgetService` instead. |
| `/contact` | `shared/chat-widget.component.ts` | 1482 | Remove - no contact page exists. Replace with another action or suppress. |
| `/admin/dashboard` | `admin/pages/setup-wizard.component.ts` | 99 | Change to `/admin`. |

---

## 7. Cross-Cutting Changes

### Notification Routing

`NotificationService.routeFor()` returns dynamic routes for notification clicks. After
the redesign:

- If a notification has `linkUrl`, use it directly (backward-compatible).
- If `linkQuoteList`, return `/customer/quotes` (unchanged).
- If `linkReorder`, return `/customer/bookings/history` (was `/customer/history`).

**File:** `shared/services/notification.service.ts` - update `linkReorder` return value.

### Snackbar Navigation

`SnackbarComponent` calls `notifications.routeFor()`. No direct changes needed - it picks
up the new routes from the notification service.

### Chat Widget Navigation

| Current Navigate | New Navigate | Reason |
|-----------------|-------------|--------|
| `/customer/bookings` | `/customer/bookings/active` | `report_booking` action |
| `/contact` | **removed** | Dead link |

### Calendar → Jobs Deep Link

| Current | New |
|---------|-----|
| `router.navigate(['/servicer/jobs'], { queryParams: { focus: b.id } })` | `router.navigate(['/servicer/jobs', b.id])` |

---

## 8. Files Changed - Complete Inventory

| # | File | Type | Change Summary |
|---|------|------|----------------|
| 1 | `servicer.routes.ts` | Route config | Add sub-routes for jobs tabs + job detail; nest notification-settings |
| 2 | `jobs.component.ts` | Component | Replace signal-based tabs with URL segment; push filters to queryParams |
| 3 | `servicer-shell.component.ts` | Shell | Update sidebar routerLink for jobs |
| 4 | `calendar.component.ts` | Component | Change openJob() navigate path |
| 5 | `customer.routes.ts` | Route config | Group bookings + history under single parent; nest notification-settings |
| 6 | `my-bookings.component.ts` | Component | Split or read tab from URL segment |
| 7 | `order-history.component.ts` | Component | Move route registration to `/bookings/history` |
| 8 | `customer-shell.component.ts` | Shell | Merge sidebar items; update links |
| 9 | `proposals.component.ts` | Component | Update post-accept navigate path |
| 10 | `admin.routes.ts` | Route config | Nest settings + queues; add user/merchant detail routes |
| 11 | `admin-shell.component.ts` | Shell | Update all sidebar links |
| 12 | `dashboard.component.ts` | Admin page | Update 5 stat-card queue links |
| 13 | `setup-wizard.component.ts` | Admin page | Fix `/admin/dashboard` → `/admin` |
| 14 | `chat-widget.component.ts` | Shared | Fix `/customer/bookings` → `/customer/bookings/active`; remove `/contact` |
| 15 | `notification.service.ts` | Service | Update `linkReorder` → `/customer/bookings/history` |
| 16 | `my-bookings.component.ts` | Customer | Remove dead `/customer/chat` router.navigate |
| 17 | `customer-shell.component.ts` | Shell | Merge "Order History" sidebar item |
| 18 | `servicer-shell.component.ts` | Shell | Verify all sidebar links |

**Total: ~18 files** across 4 roles + shared.

---

## 9. Implementation Order

| Phase | Scope | Files | Risk |
|-------|-------|-------|------|
| **1** | Servicer jobs sub-routes | `servicer.routes.ts`, `jobs.component.ts`, `servicer-shell.component.ts`, `calendar.component.ts` | Medium - single component refactor |
| **2** | Customer bookings restructure | `customer.routes.ts`, `my-bookings.component.ts`, `order-history.component.ts`, `customer-shell.component.ts`, `proposals.component.ts` | Medium - merges two pages |
| **3** | Admin settings + queues nesting | `admin.routes.ts`, `admin-shell.component.ts`, `dashboard.component.ts`, `setup-wizard.component.ts` | Low - mostly renaming |
| **4** | Shared + notification routing | `chat-widget.component.ts`, `notification.service.ts`, dead link fixes | Low - small targeted edits |
| **5** | New detail pages (optional stretch) | `jobs/history/:id`, `jobs/:id`, `bookings/:id`, `users/:id`, `merchants/:id` | Medium - new components |

---

## 10. Route Config Structure Example

### Servicer Routes (final `servicer.routes.ts` shape)

```typescript
export const servicerRoutes: Routes = [
  {
    path: '',
    component: ServicerShellComponent,
    children: [
      { path: '', component: ServicerDashboardComponent },
      {
        path: 'jobs',
        children: [
          { path: '', redirectTo: 'pending', pathMatch: 'full' },
          { path: 'pending', component: ServicerJobsComponent },
          { path: 'active', component: ServicerJobsComponent },
          { path: 'history', component: ServicerJobsComponent },
          { path: 'history/:id', component: JobHistoryDetailComponent },
          { path: ':id', component: JobDetailComponent },
        ],
      },
      { path: 'calendar', component: ServicerCalendarComponent },
      {
        path: 'services',
        children: [
          { path: '', component: ServicerServicesComponent },
          { path: 'new', component: ListingWizardComponent },
          { path: ':id/edit', component: ListingWizardComponent },
        ],
      },
      { path: 'promotions', component: ServicerPromotionsComponent },
      { path: 'deposit', component: ServicerDepositComponent },
      { path: 'invoices', component: ServicerInvoicesComponent },
      { path: 'account', component: ServicerAccountComponent },
      {
        path: 'notifications',
        children: [
          { path: '', component: NotificationsComponent },
          { path: 'settings', component: NotificationSettingsComponent },
        ],
      },
    ],
  },
];
```

### Customer Routes (final `customer.routes.ts` shape)

```typescript
export const customerRoutes: Routes = [
  {
    path: '',
    component: CustomerShellComponent,
    children: [
      { path: '', component: BrowseComponent },
      { path: 'quote/new', component: QuoteFormComponent },
      { path: 'quotes', component: MyQuotesComponent },
      { path: 'quotes/:id/proposals', component: ProposalsComponent },
      {
        path: 'bookings',
        children: [
          { path: '', redirectTo: 'active', pathMatch: 'full' },
          { path: 'active', component: MyBookingsComponent },
          { path: 'pending', component: MyBookingsComponent },
          { path: 'history', component: OrderHistoryComponent },
          { path: 'history/:id', component: HistoryBookingDetailComponent },
          { path: ':id', component: BookingDetailComponent },
        ],
      },
      { path: 'rewards', component: RewardsComponent },
      { path: 'transactions', component: TransactionsComponent },
      { path: 'account', component: AccountComponent },
      {
        path: 'notifications',
        children: [
          { path: '', component: NotificationsComponent },
          { path: 'settings', component: NotificationSettingsComponent },
        ],
      },
    ],
  },
];
```

### Admin Routes (final `admin.routes.ts` shape)

```typescript
export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    children: [
      { path: '', component: AdminDashboardComponent },
      { path: 'users', component: AdminUsersComponent },
      { path: 'users/:id', component: UserDetailComponent },
      { path: 'merchants', component: AdminMerchantsComponent },
      { path: 'merchants/:id', component: MerchantDetailComponent },
      {
        path: 'queues',
        children: [
          { path: '', redirectTo: 'withdrawals', pathMatch: 'full' },
          { path: 'withdrawals', component: AdminQueuesComponent },
          { path: 'appeals', component: AdminQueuesComponent },
          { path: 'category', component: AdminQueuesComponent },
          { path: 'reports', component: AdminQueuesComponent },
        ],
      },
      {
        path: 'settings',
        children: [
          { path: '', component: AdminSettingsComponent },
          { path: 'money', component: MoneySettingsComponent },
          { path: 'uiux', component: UiuxSettingsComponent },
          { path: 'ai-chat', component: AiChatSettingsComponent },
          { path: 'categories', component: CategorySettingsComponent },
          { path: 'api-keys', component: ApiKeysComponent },
        ],
      },
      { path: 'setup', component: SetupWizardComponent },
    ],
  },
];
```

---

## 11. Non-Goals (things NOT changing)

- Guest routes - single page, no children to restructure
- Public routes (`/`, `/login`, `/register`, `/terms`, `/auth/*`, `/services/:slug`)
- Chat widget - stays a floating overlay, not a route
- FAQ - stays embedded in admin settings, no standalone route
- API routes - backend endpoint paths unchanged
- `window.location.href` hard navigations in `shell.component.ts` - unchanged
- Demo bar login redirects - unchanged (they use dynamic `role` variable)
