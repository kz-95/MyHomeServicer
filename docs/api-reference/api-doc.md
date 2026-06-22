# API documentation

> REST API for the My Home Servicer platform. All requests use JSON. All responses use JSON. Versioned under `/api/v1`. All timestamps ISO 8601 UTC.

---

## Conventions

### Base URL
- Development: `http://localhost:3000/api/v1`
- Production: `https://api.{your-domain}/api/v1`

### Authentication
JWT in `Authorization: Bearer <access_token>` header.

| Role required | Header |
|---|---|
| Public (no auth) | — |
| `auth` (any logged-in user) | Bearer access token |
| `servicer` (logged in as servicer) | Bearer access token + role=servicer |
| `admin` (logged in as admin) | Bearer access token + role=admin |
| `admin + PIN` (sensitive admin) | Bearer access token + `X-Action-Pin: <pin>` header |

### Idempotency
All money operations (payment, refund, escrow release, withdrawal, penalty) accept `Idempotency-Key: <uuid>` header. Same key within 24h returns cached response.

### Pagination
List endpoints accept:
- `?page=1` (default 1)
- `?limit=20` (default 20, max 100)
- `?sort=created_at` (default per endpoint)
- `?order=desc` (default desc)

Returns:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "totalPages": 8
  }
}
```

### Error format
All errors return:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [
      { "field": "email", "issue": "must be a valid email" }
    ]
  }
}
```

### Error codes

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 401 | `TOKEN_EXPIRED` | Access token expired, refresh needed |
| 403 | `FORBIDDEN` | Authenticated but not permitted |
| 403 | `PIN_REQUIRED` | Admin action needs PIN |
| 403 | `PIN_INVALID` | Wrong action PIN |
| 403 | `ACCOUNT_LOCKED` | Too many failed login attempts |
| 404 | `NOT_FOUND` | Resource doesn't exist or user doesn't own it |
| 409 | `CONFLICT` | Resource state doesn't allow this action |
| 422 | `BUSINESS_RULE_VIOLATION` | Action violates a domain rule (e.g. cancelling a completed booking) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## Public config (no auth)

### `GET /config/public`

Returns non-sensitive client-side configuration values. No authentication
required. Used by the frontend to bootstrap Google OAuth and Maps keys at
runtime instead of baking them into the static build.

**Response 200:**
```json
{
  "googleClientId": "xxxx.apps.googleusercontent.com",
  "googleMapsApiKey": "AIzaSy...",
  "condoEntryNote": "If you live in a condo, please inform your management..."
}
```

All values are empty strings when not configured. The frontend gracefully
degrades (hides Google sign-in buttons, falls back to plain-text address
input and static map placeholder). `condoEntryNote` is fetched from the
`platform_settings` table at request time.

---

## Auth endpoints

### `POST /auth/register`
Register a new customer account.

**Request:**
```json
{
  "name": "Sarah Lim",
  "email": "sarah@example.com",
  "phone": "+60 12-345 6789",
  "password": "MySecure123"
}
```

**Response 201:**
```json
{
  "user": { "id": "uuid", "name": "...", "email": "...", "role": "customer" },
  "accessToken": "...",
  "refreshToken": "..."
}
```

### `POST /auth/register-servicer`
Register a new servicer ("servicer") account. The platform category is fixed
at registration.

**Request:**
```json
{
  "name": "Ahmad bin Ali",
  "email": "ahmad@example.com",
  "phone": "+60 12-345 6789",
  "password": "MySecure123",
  "businessName": "Ahmad Plumbing",
  "categoryId": "uuid",
  "isCompany": false,
  "taxNumber": null,
  "businessRegistrationNumber": null,
  "serviceAreas": ["Petaling Jaya", "Subang"],
  "pin": "123456"
}
```
`pin` is optional (6 digits). When omitted, the default PIN `123456` is used until changed.

**Response 201:** Same envelope as `/auth/register`, with `role: "servicer"`.

**Errors:**
- 409 `CONFLICT` — an account with that email already exists
- 400 `BAD_REQUEST` — `categoryId` is not a valid top-level platform category

### `POST /auth/login`
**Request:**
```json
{ "email": "...", "password": "..." }
```

**Response 200:** Same shape as register.

**Errors:**
- 401 `UNAUTHORIZED` — wrong credentials
- 403 `ACCOUNT_LOCKED` — too many failed attempts (15 min lockout)

### `POST /auth/logout`
**Auth:** Bearer token
**Request:** `{ "refreshToken": "..." }`
**Response 204:** Empty

### `POST /auth/refresh`
**Request:** `{ "refreshToken": "..." }`
**Response 200:** `{ "accessToken": "...", "refreshToken": "..." }`

### `GET /session`
**Auth:** Bearer token. Mounted at the API root (NOT under `/auth`) so the
frontend auth interceptor attaches the token and performs its silent
token-refresh on expiry.

Validates the caller's access token and returns the current principal rebuilt
fresh from the database. The SPA calls this once at startup (blocking
`APP_INITIALIZER`) so logged-in UI is never shown on the strength of a cached
`localStorage` principal alone — a stale/forged token returns 401 and the
client logs out.

**Response 200:** `{ "user": { "id", "email", "role", "creditBalance", "isDemo", "depositBalance"?, "isOnline"?, "setupRequired"? } }`

**Errors:**
- 401 `UNAUTHORIZED` — no/invalid token, or the account no longer exists
- 401 `TOKEN_EXPIRED` — access token expired (interceptor refreshes + retries)

### `POST /auth/forgot-password`
**Rate limited:** 5/hour per IP
**Request:** `{ "email": "..." }`
**Response 200:** `{ "message": "If the email exists, a reset link has been sent." }`
Always returns 200 — does not reveal whether the email is registered. Sends a reset link (valid 1 hour) to the email if it belongs to a User or Servicer account.

### `POST /auth/reset-password`
**Request:** `{ "token": "...", "newPassword": "..." }`
**Response 200:** `{ "message": "Password updated. You can now log in with your new password." }`
Validates the reset token (must exist and not be expired), hashes the new password (bcrypt cost 12), and updates it on the matching User or Servicer account. Token is consumed on success.

### `POST /auth/otp/request`
**Request:** `{ "email": "...", "purpose": "password_reset" | "phone_verify" }`
**Response 200:** `{ "sentTo": "s***@example.com", "expiresIn": 600 }`

### `POST /auth/otp/verify`
**Request:** `{ "email": "...", "code": "123456", "purpose": "..." }`
**Response 200:** `{ "verificationToken": "..." }` (short-lived, used in next step)

### `POST /auth/password/reset`
**Request:** `{ "verificationToken": "...", "newPassword": "..." }`
**Response 204:** Empty

### `GET /auth/google`
Initiate Google OAuth sign-in. Redirects the browser to Google's consent screen.
Only available when `GOOGLE_CLIENT_ID` is configured.

**Note:** The user is redirected away from the SPA. After successful
authentication Google redirects back to `GET /auth/google/callback`.

**Response:** 302 redirect to Google

### `GET /auth/google/callback`
Google OAuth callback handler. Exchange the authorization code for user info,
create or link a user account, issue JWT tokens, then redirect the browser to
`{APP_URL}/auth/callback?access_token=...&refresh_token=...&user=...`.

**Role assignment:**
- If the Google email appears in `ADMIN_EMAILS` env var → `admin` role
- All other emails → `customer` role
- Existing accounts are linked by email (googleId added silently)

### `POST /config/demo-gate`
Verify the **demo login-gate PIN** — the fixed shared speedbump (`DEMO_GATE_PIN`, default `5201314`) shown by the route guards when a demo account enters a portal. Distinct from the per-account action PIN. Auth required; demo accounts only (`isDemo`).

**Auth:** Bearer (demo account)
**Request:** `{ "pin": "5201314" }`
**Response 200:** `{ "ok": true }`
**Errors:** 400 `Incorrect PIN` · 400 `The demo gate is only for demo accounts`

### `POST /chat/verify-pin`
Verify the **action PIN** (`1234`) for the current principal. Used by the shared `PinService` dialog for sensitive operations + the Admin Accounts/Review Queues view-guards. Handles all roles: admin + customer verify against `User.actionPinHash`, servicer against `Servicer.pinHash`. A null/absent hash returns failure (no bypass).

**Auth:** Bearer (admin, servicer, or customer)
**Request:** `{ "pin": "1234" }` (4–10 chars)
**Response 200:** `{ "ok": true }`
**Errors:** 400 `Incorrect PIN`

### `POST /admin/verify-pin`
Verify the admin action PIN before performing a sensitive operation. Frontend should call this before revealing PIN-gated UI flows. Rate limited to 5 attempts per 15 min per admin — too many failures locks the admin out of PIN-gated actions until the window resets.

> Note: PIN can also be passed inline via `X-Action-Pin` header on individual endpoints. This endpoint exists for pre-validation UX (e.g. "enter PIN to unlock settings panel").

**Auth:** Bearer (admin role)
**Request:**
```json
{ "pin": "1234" }
```
**Response 200:** `{ "valid": true }`

**Errors:**
- 403 `PIN_INVALID` — wrong PIN
- 429 `RATE_LIMITED` — too many failed attempts

---

## User endpoints

### `GET /user/me`
**Auth:** Bearer
**Response:**
```json
{
  "id": "uuid",
  "name": "Sarah",
  "email": "...",
  "phone": "+60 12-345 ****",
  "contactName": "...",
  "contactNumber": "...",
  "preferredTimeSlot": "morning",
  "avatarUrl": "...",
  "backupEmail": "sarah@backup.com"
}
```

### `PATCH /user/me`
Update any field above. All optional. Now accepts `backupEmail` (string | null) for recovery email.

### `GET /user/me/addresses`
**Response:** `{ "data": [{ "id", "label", "address", "propertyType", "postcode", "district", "state", "isDefault" }] }`

### `POST /user/me/addresses`
```json
{
  "label": "Home",
  "address": "123 Jalan Bukit Bintang, KL",
  "propertyType": "condo",
  "isDefault": true
}
```

### `PATCH /user/me/addresses/:id`
Update any field.

### `DELETE /user/me/addresses/:id`
**Response 204**

### `GET /user/me/history`
Order history for reorder feature.
**Response:**
```json
{
  "data": [
    {
      "type": "service",
      "bookingId": "uuid",
      "servicerId": "uuid",
      "servicerName": "...",
      "categoryName": "...",
      "completedAt": "...",
      "totalPrice": 80.00
    }
  ]
}
```

### `GET /user/me/notifications`
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "servicer_cancel",
      "message": "...",
      "linkQuoteList": "/quote/xxx/proposals",
      "linkReorder": "/quote/new?from=xxx",
      "isRead": false,
      "createdAt": "..."
    }
  ]
}
```

### `PATCH /user/me/notifications/:id/read`
**Response 204**

### `PATCH /user/me/notifications/read-all`
Mark all unread notifications as read in one call. Useful for clearing the notification badge.
**Auth:** Bearer
**Response 204:** Empty

### `POST /user/me/device`
Register a push notification device.
```json
{
  "deviceToken": "fcm-token-here",
  "platform": "ios" | "android" | "web"
}
```

### `GET /user/me/credit`
Customer prepaid credit-wallet balance (shown in the topbar Credit panel).
**Response 200:** `{ "balance": 120.00 }`

### `POST /user/me/topup`
Wallet top-up (minimum RM 10). When `STRIPE_SECRET_KEY` is configured, returns a Stripe Checkout
URL; in dev without Stripe, credits instantly (blocked in production).
**Request:** `{ "amount": 100 }` (min 10)
**Response (Stripe):** `{ "url": "https://checkout.stripe.com/...", "sessionId": "cs_...", "method": "stripe_checkout" }`
**Response (dev fallback):** `{ "balance": 220.00, "method": "demo_instant" }`
> Also available as `POST /stripe/create-topup-session`.

---

## Categories endpoints

### `GET /categories`
Public/customer endpoint (published, not soft-deleted). Scope depends on query:
- **default** (no query): top-level **parents** only (`parentCategoryId: null`) — the browse groupings.
- **`?parent=<slug>`**: the published **children** of that parent (the quotable leaf services, which carry `questionSchema` + budget).
- **`?scope=all`**: **every** published category — parents AND children — in one call. Used by the quote-form Category/Type-of-service dropdowns (parent → child) and the home/browse search over child services.

Each row includes `parentCategoryId` (null for parents) so the client can group children under their parent.
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Aircon servicing",
      "slug": "aircond",
      "parentCategoryId": null,
      "icon": "wind",
      "defaultPriceSuggestion": 100.00,
      "defaultEstimatedDurationMinutes": 60,
      "questionSchema": [
        {
          "key": "aircon_service",
          "label": "Select type of aircon and type of cleaning",
          "type": "checkbox",
          "required": true,
          "priced": true,
          "description": "You can select more than one type of cleaning.",
          "options": [
            { "value": "wall_chemical", "label": "Wall Unit — Chemical Cleaning", "active": true }
          ]
        }
      ],
      "published": true,
      "activeListingCount": 12
    }
  ]
}
```
`questionSchema` is `null` for categories with no custom questions. Each
question `type` is `checkbox`, `radio` or `text`; `options` is omitted for
`text`. A question or option with `active: false` is soft-deactivated — hidden
from new quote/listing forms but kept for existing data; consumers filter
`active !== false`. `activeListingCount` is the count of non-deleted servicer
listings in the category. SP2b adds `imageUrl`, `bannerUrl`, `cardColor`,
`description` to the response for the customer browse card (photo, banner,
colour wash, blurb). The quote wizard's Details step renders the questions.

### `GET /categories/:slug`
**Response:** Single **published** category with same shape + servicer count.
Returns 404 for unpublished or soft-deleted categories.

### `GET /categories/:slug/servicers`
List servicers offering this category.
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "businessName": "...",
      "bio": "...",
      "rating": 4.5,
      "logoUrl": "...",
      "serviceAreas": ["SS2", "PJ"],
      "services": [
        { "id": "uuid", "title": "...", "basePrice": 80.00, "priceType": "fixed", "sku": "AC-CLEAN" }
      ]
    }
  ]
}
```

---

## Quote endpoints

### `POST /quotes`
Submit a new quote request.
**Auth:** Bearer
```json
{
  "categoryId": "uuid",
  "addressId": "uuid",
  "contactName": "Sarah",
  "contactNumber": "+60 12-345 6789",
  "timeSlot": "morning" | "noon" | "afternoon" | "evening" | "night",
  "preferredDate": "2026-06-15",
  "budgetMin": 50,
  "budgetMax": 150,
  "paymentMode": "pay_now" | "pay_later" | "cash",
  "tipAmount": 10.00,
  "deadlineMode": "fcfs" | "fixed_time",
  "proposalDeadline": "2026-06-15T15:00:00Z",
  "notes": "...",
  "agreeTerms": true,
  "promoCode": "WELCOME20",
  "serviceDetails": {
    "aircon_service": ["wall_chemical", "wall_general"],
    "property_type": "condo"
  },
  "targetServicerId": "uuid"
}
```
`targetServicerId` (optional) is the **locked-rebook / direct-quote** target. When
present the quote is **not** broadcast to all matching servicers — it goes only to
this one servicer (sent via the "Rebook same servicer" action on order history,
which also locks the category). The target must exist, not be banned, and offer the
quote's category; online status and service-area matching are ignored so the chosen
servicer is always reached. Threaded in-memory through `broadcastQuote` (not
persisted), so it is unaffected by the deferred guest-gateway path.

`serviceDetails` (optional) carries the customer's answers to the category's
custom questions — keyed by question `key`, value is a string (radio/text) or
string array (checkbox). The 3-step quote wizard sends this; budget is picked
from an admin-defined range and the servicer proposal window defaults to 24h.
The reserved key `_extraNotes` (string) holds the optional Step-1 "Extra Notes"
free text; it is not a question key, so `computePrefill` ignores it for pricing.

**Response 201:**
```json
{
  "id": "uuid",
  "status": "open",
  "servicerDeadline": "2026-06-15T14:45:00Z",
  "discountApplied": 20.00,
  "servicersNotified": 5
}
```

**Payment gate before broadcast.** No quote reaches servicers until its payment
is settled. Ordering inside `createQuote`:
1. `pay_later` / `cash` — `requireNoUnpaidInvoice` is enforced first.
2. `pay_now` (credit) — the budget hold is deducted **before** any broadcast,
   socket emit, servicer notification, or dispatch rotation fires. If the
   deduction fails the quote is created but never broadcast.
3. `pay_now` (guest / gateway) — the quote is created with `status:
   "pending_payment"`, `servicersNotified: 0`, and is **not** broadcast. The
   public `POST /quotes/guest` endpoint then opens a Stripe Checkout session;
   the `checkout.session.completed` webhook funds the wallet, takes the hold,
   flips the quote to `open`, and broadcasts it. If the Stripe session cannot be
   created the quote is left `pending_payment` (response carries no `stripeUrl`)
   and never reaches servicers.

### `GET /quotes`
List my quotes.
**Auth:** Bearer

### `GET /quotes/:id`
Single quote with full details.

### `GET /quotes/:id/proposals`
Get bundled proposals received for a quote.
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "servicer": {
        "id": "uuid",
        "businessName": "...",
        "rating": 4.5,
        "logoUrl": "..."
      },
      "proposedPrice": 80.00,
      "message": "I can do this job at...",
      "etaMinutes": 30,
      "submittedAt": "..."
    }
  ]
}
```

### `POST /quotes/:id/select`
Pick a proposal.
**Idempotency:** Yes
```json
{
  "proposalId": "uuid",
  "settlementMethod": "gateway | credit | cash"
}
```
`settlementMethod` is required when the quote's `paymentMode` is `pay_later` (must be `credit` or `cash`). Omit or send `null` for `pay_now` quotes.
**Response 201:** `{ "bookingId": "uuid" }`

> **No servicer re-confirm (SP-3 dispatch wave).** Selecting a proposal now creates the
> booking directly in `confirmed` (was `pending_confirm`) and schedules no-show detection
> immediately — the customer's selection IS the confirmation, so there is no separate
> servicer "Confirm job" step. `POST /servicer/jobs/:id/confirm` is retained but no longer
> part of the normal flow (no booking reaches `pending_confirm`).

### `POST /quotes/:id/cancel`
Cancel an open quote before a proposal is selected. Only allowed when `status = open`. Once a proposal is selected and a booking is created, use `POST /bookings/:id/cancel` instead.

**Auth:** Bearer
**Response 204:** Empty

**Errors:**
- 409 `CONFLICT` — quote is already matched, expired, or reposted

### `POST /quotes/:id/repost`
Repost an expired quote with same data.
**Auth:** Bearer

---

## Servicer endpoints (public)

### `GET /servicers/:id`
Public servicer profile. Includes `contacts` array with only `visibleToCustomer` contacts (replaces deprecated `showEmailPublic`/`showPhonePublic`).

### `GET /servicers/:id/services`
Active services offered.

### `POST /servicers/register`
Servicer registration is implemented as **`POST /auth/register-servicer`** —
see the Auth endpoints section. (`/servicers/register` was the originally
planned path; the implemented route lives under `/auth`.)

---

## Servicer self endpoints

All require `servicer` role.

### `GET /servicer/me`
Servicer profile with all settings.

### `POST /servicer/customer-session`
Issues a customer-scoped token pair for the customer account paired with this
servicer — powers the "customer mode" topbar toggle. Lazily provisions the
paired `USER` on first call.

**Response 200:**
```json
{
  "user": { "id": "uuid", "email": "...", "role": "customer" },
  "accessToken": "...",
  "refreshToken": "..."
}
```

### `PATCH /servicer/me`
Update profile fields. All optional. Non-legal fields (`bio`, `serviceAreas`, `serviceRadiusKm`, `invoicePrefix`, `invoiceYearFormat`, `invoiceSeparator`, `invoicePadding`, `businessName`, `serviceChargeRate`, `taxInclusive`, `sstRegistered`, `sstNumber`, `logoUrl`, `bankName`, `bankAccount`, `operatingHours`) save directly. `serviceRadiusKm` (int, 1–500, default 10) is the account-level coverage radius used by SP-3 auto-accept matching. Legal-identity fields (`entityType`, `businessRegistrationNumber`, `taxNumber`) create a `ServicerIdentityChangeRequest` for admin review before being applied. Entity type updates auto-derive `isCompany` (sole_proprietorship → false, others → true).

**Auth:** Bearer (servicer)
**Request:**
```json
{
  "bio": "...",
  "businessName": "Ahmad Plumbing Sdn Bhd",
  "serviceAreas": ["Petaling Jaya", "Subang"],
  "serviceRadiusKm": 15,
  "invoicePrefix": "INV",
  "invoiceYearFormat": "YYYY",
  "invoiceSeparator": "-",
  "invoicePadding": 4,
  "serviceChargeRate": 0.05,
  "taxInclusive": false,
  "sstRegistered": true,
  "sstNumber": "SST-12345678",
  "entityType": "sdn_bhd",
  "businessRegistrationNumber": "202401000123",
  "taxNumber": "C-1234567890",
  "showEmailPublic": true,
  "showPhonePublic": false,
  "invoiceContent": "Thank you for your business!",
  "invoiceSuffix": "A",
  "bankName": "Maybank",
  "bankAccount": "1234-567-890",
  "operatingHours": { "mon": { "open": "09:00", "close": "17:00" } }
}
```
**Response 200:** Updated servicer profile. `identityChangePending: true` when legal fields were submitted for review.

### Pricing modules

Servicer-owned reusable pricing library (§2.2). Each module has a label, default price, and tax/service-charge flags. Modules are referenced by services (`moduleRefs`) to compose line items.

### `GET /servicer/pricing-modules`
List the authenticated servicer's pricing modules.
**Query:** `?active=true` — filter to active only (optional, default shows all)
**Auth:** Bearer (servicer)
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "servicerId": "uuid",
      "label": "Running fee",
      "defaultPrice": 50.00,
      "taxable": true,
      "serviceChargeable": true,
      "categoryId": null,
      "active": true,
      "createdAt": "2026-05-27T00:00:00Z"
    }
  ]
}
```

### `POST /servicer/pricing-modules`
Create a new pricing module.
**Auth:** Bearer (servicer)
**Request:**
```json
{
  "label": "Copper pipe",
  "defaultPrice": 25.00,
  "taxable": true,
  "serviceChargeable": false,
  "categoryId": null
}
```
All fields except `label` and `defaultPrice` are optional. `taxable` defaults to `true`, `serviceChargeable` defaults to `true`, `active` defaults to `true`.
**Response 201:** The created module.

### `PATCH /servicer/pricing-modules/:id`
Update a pricing module. All fields optional.
**Auth:** Bearer (servicer)
**Response 200:** Updated module.

### `DELETE /servicer/pricing-modules/:id`
Soft-delete a pricing module (sets `active=false`). The module is preserved for historical invoice line-item references.
**Auth:** Bearer (servicer)
**Response 204:** Empty

### Servicer modules (SP-3)

First-class reusable priced-item library (`ServicerModule` / `business_modules`) — the SP-3 replacement for the ad-hoc `PricingModule`/`moduleRefs` UX. **No per-item tax flags** (tax is applied flat from the business profile). `PricingModule` is kept until the Phase-2 migration. Surfaced in the servicer Services → **Modules** tab.

#### `GET /servicer/modules`
List the authenticated servicer's modules. Each row includes `usedInListings` (count of the servicer's listings whose `moduleRefs` reference it).
**Query:** `?active=true` — active only (optional, default shows all)
**Auth:** Bearer (servicer)
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "servicerId": "uuid",
      "name": "Chemical Wash",
      "price": 30.00,
      "sku": "CHEM-WASH",
      "active": true,
      "createdAt": "2026-06-12T00:00:00Z",
      "updatedAt": "2026-06-12T00:00:00Z",
      "usedInListings": 0
    }
  ]
}
```

#### `POST /servicer/modules`
Create a module. `name` and `price` required; `sku` optional (3–30 alphanumeric/hyphen/underscore); `active` defaults to `true`.
**Auth:** Bearer (servicer)
**Request:**
```json
{ "name": "Gas Top-up", "price": 25.00, "sku": "GAS-TOPUP" }
```
**Response 201:** The created module.

#### `PATCH /servicer/modules/:id`
Update a module (`name`, `price`, `sku`, `active` — all optional).
**Auth:** Bearer (servicer)
**Response 200:** Updated module.

#### `DELETE /servicer/modules/:id`
Soft-disable a module (sets `active=false`) so existing listing references stay valid.
**Auth:** Bearer (servicer)
**Response 204:** Empty

### Servicer WhatsApp presets (SP-3 dispatch)

Reusable WhatsApp message templates (`ServicerWaPreset` / `servicer_wa_presets`). A servicer fires one at a customer from a won job card via the shared `<app-wa-button>`, which interpolates `{name}`/`{orderId}`/`{eta}` placeholders in the `body` and opens a `wa.me` link. All endpoints are scoped to the authenticated servicer; fields are picked explicitly. Surfaced in the servicer **Business Profile** → *WhatsApp message presets* section.

#### `GET /servicer/wa-presets`
List the authenticated servicer's presets, active first then newest.
**Query:** `?active=true` — active only (optional, default shows all)
**Auth:** Bearer (servicer)
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "servicerId": "uuid",
      "label": "On my way",
      "body": "Hi {name}, I'm on my way for order {orderId}. ETA {eta}.",
      "active": true,
      "createdAt": "2026-06-17T00:00:00Z",
      "updatedAt": "2026-06-17T00:00:00Z"
    }
  ]
}
```

#### `POST /servicer/wa-presets`
Create a preset. `label` (≤80 chars) and `body` (≤2000 chars) required; `active` defaults to `true`.
**Auth:** Bearer (servicer)
**Request:**
```json
{ "label": "On my way", "body": "Hi {name}, ETA {eta}." }
```
**Response 201:** The created preset.

#### `PATCH /servicer/wa-presets/:id`
Update a preset (`label`, `body`, `active` — all optional). 404 if not owned by the caller.
**Auth:** Bearer (servicer)
**Response 200:** Updated preset.

#### `DELETE /servicer/wa-presets/:id`
Soft-disable a preset (sets `active=false`). 404 if not owned by the caller.
**Auth:** Bearer (servicer)
**Response 204:** Empty

### `PATCH /servicer/me/online`
V1: always-on, but endpoint exists for post-V1.
```json
{ "isOnline": true }
```

### `GET /servicer/calendar?month=2026-05`
Returns all bookings for the servicer in the given month, grouped by date.
**Auth:** Bearer (servicer)
**Query:** `month` — YYYY-MM format (defaults to current month)
**Response 200:**
```json
{
  "month": "2026-05",
  "data": {
    "2026-05-15": [
      {
        "id": "uuid",
        "timeSlot": "morning",
        "status": "confirmed",
        "price": 150.00,
        "category": "Plumbing",
        "customerName": "Aisha"
      }
    ]
  }
}
```

### PIN management

### `GET /servicer/account/pin-status`
Check whether the servicer has set a PIN. When `hasPin` is false, the default PIN `123456` is accepted.

**Auth:** Bearer (servicer)
**Response 200:**
```json
{ "hasPin": false }
```

### `PUT /servicer/account/pin`
Change the servicer PIN. Requires the current PIN.

**Auth:** Bearer (servicer)
**Request:**
```json
{
  "currentPin": "123456",
  "newPin": "654321"
}
```
**Response 200:** `{ "message": "PIN updated" }`

**Errors:**
- 400 `VALIDATION_ERROR` — current PIN is incorrect

### `POST /servicer/account/verify-pin`
Verify a PIN without changing it. Returns `{ ok: boolean }`.

**Auth:** Bearer (servicer)
**Request:**
```json
{ "pin": "123456" }
```
**Response 200:** `{ "ok": true }`

---

### Business Contacts (SP-5)

### `GET /servicer/contacts`
List all business contacts for the authenticated servicer.

**Auth:** Bearer (servicer)
**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "servicerId": "uuid",
      "contactPerson": "Ahmad",
      "number": "60123456789",
      "email": "ahmad@example.com",
      "isPrimary": true,
      "visibleToCustomer": true,
      "createdAt": "2026-06-12T...",
      "updatedAt": "2026-06-12T..."
    }
  ]
}
```

### `POST /servicer/contacts`
Create a new business contact. Max 10 per servicer.

**Auth:** Bearer (servicer)
**Request:**
```json
{
  "contactPerson": "Ahmad",
  "number": "60123456789",
  "email": "ahmad@example.com",
  "isPrimary": true,
  "visibleToCustomer": true
}
```
**Response 201:** The created contact object.
**Errors:**
- 400 — `contactPerson` required, at least one of `number`/`email` required, ≥10 contacts limit hit

### `PATCH /servicer/contacts/:id`
Update an existing contact.

**Auth:** Bearer (servicer)
**Request:** Any subset of fields above.
**Errors:**
- 400 — Cannot make the only remaining contact-name/number/email empty
- 404 — Contact not found

### `DELETE /servicer/contacts/:id`
Delete a contact.

**Auth:** Bearer (servicer)
**Response 204:** No content.
**Errors:**
- 400 — Cannot delete the only contact or the primary contact
- 404 — Contact not found

---

### Deposit

### `GET /servicer/me/deposit`
**Response:**
```json
{
  "totalDeposited": 500.00,
  "currentBalance": 450.00,
  "minimumRequired": 100.00,
  "creditBalance": 75.50
}
```

### `POST /servicer/me/deposit`
Top up servicer deposit balance. Used when balance drops below `minimumRequired` due to penalties, or when servicer voluntarily increases their buffer.

> V1: This is a manual flow — admin verifies the bank transfer and credits the deposit via admin panel. This endpoint records the top-up request. Post-V1, this will integrate with the payment gateway for automated top-ups.

**Idempotency:** Yes
```json
{
  "amount": 200.00,
  "paymentReference": "TXN-20260615-001"
}
```
**Response 201:**
```json
{
  "id": "uuid",
  "status": "pending",
  "amount": 200.00,
  "message": "Top-up request received. Admin will credit your deposit after verifying payment."
}
```

### Services

### `GET /servicer/me/services`
List all services with SKUs. Each row also carries SP-3 fields `imageUrl` (optional listing photo, falls back to the category image on cards) and `published` (`true` = Active / customer-visible, `false` = Draft).

### `POST /servicer/me/services`
**SP-3 fields (optional):** `imageUrl` (S3 file URL from the `listing_photo` presign flow) and `published` (defaults `true`). The Simple-listing flow sends `modifiers` with `price: null` per option to record offered/N-A job preferences (no per-option pricing), `taxMode: "none"`, `autoAccept: false`, and no modules.
**SP-3 Advanced-wizard fields (optional):** `listingMode` (`"simple"` | `"advanced"`, defaults `"simple"`), `moduleRefs` (array of `{ moduleId, kind: "included"|"addon", overridePrice?, durationDeltaMin? }` — validated by `moduleRefsSchema`), `autoAccept` (bool), and `autoAcceptMessage` (≤200 chars, shown to the customer on auto-accept). Advanced listings also send `modifiers` with per-option `price`/`durationMin`. All accepted on `PATCH` too.
```json
{
  "subcategoryId": "uuid",
  "newSubcategoryName": null,
  "title": "Standard aircon cleaning",
  "description": "...",
  "servicerSku": "AC-CLEAN",
  "basePrice": 80.00,
  "priceType": "fixed",
  "taxMode": "none",
  "taxName": "SST",
  "taxRate": 6,
  "estimatedDurationMinutes": 60,
  "autoAccept": false,
  "modifiers": {
    "aircon_service": {
      "wall_chemical":     { "price": 90,  "notOffered": false },
      "wall_general":      { "price": 70,  "notOffered": false },
      "wall_overhaul":     { "price": 130, "notOffered": false },
      "cassette_general":  { "price": 85,  "notOffered": false },
      "cassette_chemical": { "price": 110, "notOffered": false },
      "cassette_overhaul": { "price": 150, "notOffered": false },
      "faulty_check":      { "price": 50,  "notOffered": false }
    }
  },
  "fieldRequirements": {
    "property_type": "required",
    "notes": "optional",
    "budget_min": "optional"
  }
}
```
**Phase 6 — `modifiers` is now an `OptionPriceMap` object** (was an array of
modifier groups). Shape: `Record<questionKey, Record<optionValue, { price: number|null, notOffered: boolean }>>`.
- `questionKey` matches a priced question's `key` in the category's `questionSchema`
- `optionValue` matches one of that question's option `value` strings
- `price` — the servicer's per-option price; `null` means "defer to base price"
- `notOffered: true` — servicer doesn't offer this option (shown greyed out in the listing form)

Only questions with `priced: true` in the category's question schema have entries here.
Informational questions (`property_type`, free text) are never stored in `modifiers`.

Pass either `subcategoryId` (an existing subcategory) or `newSubcategoryName` (creates one).

### `PATCH /servicer/me/services/:id`
Update any field. Returns 422 if SKU conflicts with another of the servicer's services.

### `DELETE /servicer/me/services/:id`
Soft-delete (sets `deleted_at`).

### `PATCH /servicer/me/services/:id/auto-accept`
Toggle and configure auto-accept.
```json
{
  "autoAccept": true,
  "autoAcceptConditions": {
    "budget_min": 60,
    "budget_max": 150,
    "match_property_type": ["residential", "condo"],
    "match_time_slot": ["morning", "noon"],
    "match_weekday": ["mon", "tue", "wed", "thu", "fri"]
  },
  "autoAcceptPresetId": "uuid"
}
```

### Proposal presets

### `GET /servicer/me/proposal-presets`
List all (max 3 in V1).

### `POST /servicer/me/proposal-presets`
Returns 403 if already at limit.
```json
{
  "name": "Standard quote",
  "message": "Thanks for your interest...",
  "priceOffset": 0,
  "isDefault": false
}
```

### `PATCH /servicer/me/proposal-presets/:id`
Update.

### `DELETE /servicer/me/proposal-presets/:id`
Remove.

### KYC documents

> V1: KYC is bypassed (all servicers auto-approved). These endpoints exist for post-V1 activation. The `servicer_kyc` feature flag controls whether the upload UI is shown.

### `POST /servicer/me/documents`
Submit a KYC document after uploading via the files presign flow.
```json
{
  "docType": "ic_front" | "ic_back" | "selfie" | "supporting",
  "fileId": "uuid"
}
```
**Response 201:** `{ "id": "uuid", "docType": "...", "status": "pending" }`

### `GET /servicer/me/documents`
List submitted KYC documents and their approval status.
**Response:**
```json
{
  "data": [
    { "id": "uuid", "docType": "ic_front", "status": "approved", "verifiedAt": "..." }
  ]
}
```

### Incoming quotes

### `GET /servicer/quotes`
Quote requests where this servicer was broadcast to.
**Query:** `?status=open|responded|matched|expired`
Only quotes still `status: open` are returned (matched/expired/cancelled drop out of the pending feed).
**Response (each item):**
```json
{
  "quoteId": "uuid",
  "category": "Aircon servicing",
  "timeSlot": "morning",
  "preferredDate": "...",
  "propertyType": "condo",
  "budgetMin": 50,
  "budgetMax": 150,
  "paymentMode": "pay_now",
  "status": "open",
  "derivedStatus": "open",
  "openedAt": null,
  "servicerDeadline": "...",
  "myProposalId": null,
  "myProposalIsAuto": false,
  "customerAvatarUrl": "https://...",
  "customerName": "Sarah Lim",
  "address": "12 Jalan Tempua 5",
  "postcode": "47100",
  "district": "Puchong",
  "state": "Selangor",
  "lat": 3.04,
  "lng": 101.62,
  "notes": "Gate code 1234",
  "descriptions": ["AC type: Wall unit", "Units: 2"]
}
```
`customerAvatarUrl` (nullable) and `customerName` show the customer's identity to the servicer before accepting, enabling trust-building. When `customerAvatarUrl` is null, the frontend should display initials fallback.
`address`/`postcode`/`district`/`state` + `lat`/`lng` drive the pending-card address row and Map button. `descriptions` is the customer's `serviceDetails` resolved to readable `label: value` lines via the category `questionSchema`; `notes` is their free-text note. `paymentMode` is shown beside the budget.

### `POST /servicer/quotes/:id/propose`
Submit a proposal.
```json
{
  "proposedPrice": 80.00,
  "message": "...",
  "etaMinutes": 30,
  "presetId": "uuid"
}
```

### `POST /servicer/quotes/:id/accept-listing`
**One-tap accept (SP-3 dispatch wave).** Submits a proposal at the servicer's
listing-computed `{ proposedPrice, etaMinutes, message }` — no manual form. Price
+ duration are derived from the servicer's best-fit listing for the quote's
category (option-priced total via `computePrefill`), falling back to the listing's
`basePrice` + `estimatedDurationMinutes` when no priced options match. The customer
still selects among submitted proposals (this does not create a booking).

**Auth:** Bearer (servicer). **Response 201:** the created/updated `QuoteProposal`.
Returns `400` when the servicer has no priced listing for the category; surfaces
the onboarding gate (`{ missing, redirectUrl }`) if profile incomplete.

### `POST /servicer/dispatch/:broadcastId/accept`
Servicer accepts a live dispatch prompt → creates a `confirmed` booking directly.
Price/duration/message are listing-computed (same engine as `accept-listing`).
**Taken guard (SP-3 dispatch wave):** the quote is claimed with an atomic
conditional update (`updateMany WHERE status='open'`) inside the booking
transaction — if another servicer already matched it, the update affects 0 rows
and the call returns `409 Conflict` with `"Sorry, this job was taken by another
servicer."` (closes the prior findFirst-then-create race). On success, emits
`quote.matched` to every other broadcast servicer and `booking.confirmed` to the
customer. **Response 200:** `{ "bookingId": "uuid" }`.

### `POST /servicer/quotes/:id/open`
Mark a broadcast quote as opened and return a proposal price pre-fill.
Sets `openedAt` on the `QuoteBroadcast` record. Call this when the servicer taps into the quote detail view.
Used for no-show tracking — servicers who opened but never responded are flagged differently from those who never saw it.

**Auth:** Bearer (servicer)

**Response 200:**
```json
{
  "proposalPrefill": {
    "defaultTotal": 200,
    "basePrice": 110,
    "breakdown": [
      {
        "questionKey": "aircon_service",
        "optionValue": "wall_chemical",
        "label": "Wall Unit — Chemical Cleaning (Recommended)",
        "price": 110
      },
      {
        "questionKey": "aircon_service",
        "optionValue": "wall_general",
        "label": "Wall Unit — General Cleaning",
        "price": 80
      }
    ]
  },
  "customerAvatarUrl": "https://...",
  "customerName": "Sarah Lim"
}
```
`proposalPrefill` is `null` when the category has no priced questions, or when the servicer has no
option-price map on any of their services for this category.
`defaultTotal` is the sum of the customer's selected option prices (or `basePrice` when no options match).
The frontend should pre-fill the proposal price box with `defaultTotal` and show a `(default: RM X)` hint.
`customerAvatarUrl` (nullable) and `customerName` show the customer's identity to the servicer before
accepting, enabling trust-building. When `customerAvatarUrl` is null, the frontend should display
initials fallback.

**(Previously returned 204 No Content — changed in Phase 6 T6.)**

### Jobs (bookings)

### `GET /servicer/jobs`
**Query:** `?status=pending_confirm|confirmed|in_progress|completed|cancelled`

### `GET /servicer/jobs/:id`
Full booking + customer contact info (only after confirmed).

### `POST /servicer/jobs/:id/confirm`
Two-step confirm. Body must include confirmation token from prompt.
```json
{ "confirm": true }
```

### `POST /servicer/jobs/:id/arrive`
Mark arrived with photo.
```json
{ "photoUrl": "..." }
```

### `POST /servicer/jobs/:id/done`
Mark done with photo. The invoice is generated as part of this call
(idempotent — re-calling for the same booking returns the existing invoice).
```json
{ "photoUrl": "..." }
```

### `GET /servicer/bookings/:id/invoice-preview`
Returns a preview of what the invoice WILL look like for a booking, for
servicer review before marking the job as done. Calls `computeTotal()` with
the actual line items, promo discount, tax config, and tip. No database row
is created — this is read-only.

**Auth:** Bearer (servicer)
**Response:**
```json
{
  "bookingId": "uuid",
  "lineItems": [
    { "label": "Running fee", "amount": 50.00, "taxable": true, "serviceChargeable": true }
  ],
  "subtotal": 50.00,
  "afterPromo": 50.00,
  "promoDiscount": 0,
  "serviceChargeRate": 0.05,
  "serviceChargeAmount": 2.50,
  "sstApplies": true,
  "taxInclusive": false,
  "taxRate": 0.06,
  "taxAmount": 3.15,
  "tipAmount": 0,
  "platformFee": 2.50,
  "total": 55.65,
  "paymentMethod": "gateway",
  "dueDate": "2026-06-28T12:00:00Z",
  "escrowAmount": 55.65
}
```
> `escrowAmount` is `null` for pay_later/cash bookings; present (and should
> equal `total`) for pay_now bookings.

### `POST /servicer/jobs/:id/cash-confirm`
Confirm cash received (cash jobs only).
**Idempotency:** Yes

### `POST /servicer/jobs/:id/cancel`
Cancel after taking. Triggers penalty.
```json
{ "reason": "..." }
```

### `POST /servicer/jobs/:id/mutual-cancel`
Request customer to cancel instead (no penalty).
```json
{ "reason": "..." }
```

### Earnings

### `GET /servicer/me/earnings/today`
**Response:**
```json
{
  "date": "2026-06-15",
  "earningsToday": 240.00,
  "completedJobs": 3,
  "activeJobs": 1,
  "pendingProposalResponses": 2
}
```

### `GET /servicer/me/earnings/daily?days=30`
30-day earnings breakdown.
**Response:**
```json
{
  "data": [
    { "date": "2026-06-15", "earnings": 240.00, "jobs": 3 },
    ...
  ],
  "totalEarnings": 4200.00,
  "totalJobs": 52
}
```

### Profile update

### `PATCH /servicer/me`
Update editable profile fields. All fields optional. Updatable: `bio`, `logoUrl`, `serviceAreas`, `invoicePrefix`, `invoiceYearFormat`, `invoiceSeparator`, `invoicePadding`, `showEmailPublic`, `showPhonePublic`, `invoiceContent`, `invoiceSuffix`.
**Auth:** Bearer (servicer)
**Response 200:** Updated servicer profile object.

### `PATCH /servicer/me/online`
Toggle online status. V1: always-on, endpoint preserved for post-V1 scheduling.
**Auth:** Bearer (servicer)
**Request:** `{ "isOnline": true }`
**Response 204:** Empty

### Invoices

### `GET /servicer/me/invoices`
List all invoices issued under this servicer's account, newest first.
**Query:** `?status=paid|unpaid`
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "invoiceNumber": "INV-2026-0042",
      "bookingId": "uuid",
      "total": 105.40,
      "issuedAt": "...",
      "paidAt": "...",
      "pdfUrl": "https://..."
    }
  ]
}
```

### `GET /servicer/me/invoices/:id`
Single invoice with full breakdown (same shape as `GET /bookings/:id/invoice`).

### Earnings export

### `GET /servicer/me/earnings/export`
Download a PDF earnings summary for the specified week. Streams `application/pdf` bytes directly — no S3 involved.
**Auth:** Bearer (servicer)
**Query:** `?week=2026-05-18` — ISO date of the Monday to start from (defaults to the current week's Monday).
**Response:** PDF file download (`Content-Disposition: attachment; filename="earnings-<date>.pdf"`). Contains a table of completed jobs, invoice numbers, and amounts for the week, plus a total row.

### Deposit & credit

### `GET /servicer/me/credit-log`
History of credit balance changes.

### `POST /servicer/me/withdrawal`
Request withdrawal of credit.
**Idempotency:** Yes
```json
{
  "amount": 50.00,
  "bankName": "Maybank",
  "bankAccount": "1234567890"
}
```
**Response 201:** `{ "id": "uuid", "status": "pending" }`

### `GET /servicer/me/withdrawals`
List own withdrawal history.

### Penalties

### `GET /servicer/me/penalties`
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "noshow",
      "amountDeducted": 50.00,
      "status": "applied",
      "createdAt": "...",
      "bookingId": "uuid",
      "appealStatus": null
    }
  ]
}
```

### `POST /servicer/me/penalties/:id/appeal`
File an appeal.
```json
{ "reason": "..." }
```

### `GET /servicer/me/penalties/:id/appeal`
Get appeal status.

### Category requests

### `POST /servicer/me/category-requests`
Request a new category.
```json
{
  "name": "Pet grooming",
  "parentCategoryId": null,
  "description": "..."
}
```

### `GET /servicer/me/category-requests`
List own requests with status.

### Promotions (servicer)

### `GET /servicer/me/promotions`
List own promo codes.

### `POST /servicer/me/promotions`
Create a servicer promo.
```json
{
  "code": "AHMAD10",
  "discountType": "percent",
  "value": 10,
  "minOrderAmount": 50,
  "maxUses": 100,
  "appliesToScope": "all",
  "expiresAt": "2026-06-30T23:59:59Z"
}
```

### `PATCH /servicer/me/promotions/:id`
Update (active/inactive, expiry, max uses).

### `DELETE /servicer/me/promotions/:id`
Deactivate.

---

## Customer booking endpoints

### `GET /bookings`
Customer's bookings.
**Query:** `?status=...`

### `GET /bookings/:id`
Full booking with proposal, servicer, photos, invoice.

### `POST /bookings/:id/tip`
Add tip (pay_later only, after job done).
**Idempotency:** Yes
```json
{ "tipAmount": 10.00 }
```

### `POST /bookings/:id/cancel`
Customer cancels.
**Idempotency:** Yes
```json
{ "reason": "..." }
```

### `POST /bookings/:id/report`
Report a problem.
```json
{
  "subject": "Service not completed properly",
  "description": "..."
}
```

### `POST /bookings/:id/mutual-cancel/respond`
Respond to servicer's mutual-cancel request.
```json
{ "accept": true }
```

### `GET /bookings/:id/invoice`
Get the invoice for this booking. Returns the full itemised breakdown including
line items, tax config, service charge, and platform fee.

**Response:**
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-2026-0042",
  "sequenceNumber": 42,
  "lineItems": [
    { "label": "Running fee", "amount": 50.00, "taxable": true, "serviceChargeable": true },
    { "label": "Copper pipe", "amount": 50.00, "taxable": true, "serviceChargeable": false }
  ],
  "subtotal": 100.00,
  "promoDiscount": 10.00,
  "serviceChargeRate": 0.05,
  "serviceChargeAmount": 4.50,
  "sstApplies": true,
  "taxInclusive": false,
  "taxRate": 0.06,
  "taxAmount": 5.67,
  "tipAmount": 10.00,
  "total": 110.17,
  "platformFee": 4.50,
  "currency": "MYR",
  "paymentMethod": "gateway",
  "paymentReference": null,
  "dueDate": "2026-06-28T12:00:00Z",
  "issuedAt": "...",
  "paidAt": "...",
  "pdfUrl": "https://..."
}
```

> **`GET /customer/bookings/:id`** and **`GET /servicer/jobs/:id`** also include
> the full invoice object (same shape) when the booking has an invoice.
>
> **Field notes:**
> - `lineItems` — snapshot of `[{ label, amount, taxable, serviceChargeable }]`
> - `paymentMethod` — resolved from `Booking.settlementMethod` (`gateway` / `credit` / `cash`)
> - `dueDate` — 14 days from issue date (standard Malaysian invoice terms)
> - `paymentReference` — Stripe PaymentIntent ID or transaction ID (post-Gateway)
> - `paidAt` — null means unpaid; set means the receipt portion is valid
> - `platformFee` — the fee deducted by the platform (base: `afterPromo` only)

### `POST /bookings/:id/settle`
Settle a `pay_later` booking's invoice. Only available for completed
bookings with an unpaid invoice. Accepts `Idempotency-Key`.

**Body:**
```json
{ "settlementMethod": "gateway" | "credit" | "cash" }
```

| Method | Behaviour |
|---|---|
| `gateway` | Creates a pending Stripe PaymentIntent record; invoice not marked paid until webhook confirms |
| `credit` | Deducts from customer wallet (`User.creditBalance`); marks invoice paid immediately |
| `cash` | Confirms cash settlement (only when `Booking.settlementMethod = 'cash'`); deducts platform fee from servicer |

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "status": "completed",
    "invoice": {
      "paidAt": "2026-05-28T12:00:00Z",
      "...": "..."
    }
  }
}
```

> Cash settlement requires `settlementMethod = 'cash'` on the booking
> (set at acceptance). Gateway settlement is a placeholder — the invoice
> stays unpaid until Stripe confirms.

### `GET /bookings/unpaid-invoices`
List all unpaid invoices for the authenticated customer. Overdue invoices
(>14 days past due date) block the customer from creating new non-`pay_now`
quotes.

**Response:**
```json
{
  "data": [
    {
      "bookingId": "uuid",
      "invoiceId": "uuid",
      "servicerName": "Ali Plumbing",
      "amount": 110.17,
      "daysOverdue": 5,
      "isOverdue": false
    }
  ]
}
```

> An overdue invoice has `isOverdue: true` and `daysOverdue > 14`. The
> frontend should surface a call-to-action to settle before placing new orders.

---

## File upload endpoints

### `POST /files/presign`
Get a pre-signed URL for direct upload.
**Auth:** Bearer
```json
{
  "purpose": "arrive_photo" | "done_photo" | "servicer_logo" | "kyc_document",
  "mimeType": "image/jpeg",
  "sizeBytes": 1234567
}
```
**Response:**
```json
{
  "uploadUrl": "https://s3...",
  "fileId": "uuid",
  "expiresIn": 300
}
```

### `POST /files/:id/confirm`
Confirm upload completed.
**Response 200:** `{ "fileUrl": "..." }`

---

## Chat endpoints

### `POST /chat/session`
Start a chat session.
```json
{
  "contextType": "general" | "booking_support" | "quote_help",
  "contextId": "uuid"
}
```
**Response:** `{ "sessionId": "uuid" }`

### `POST /chat/session/:id/message`
Send a message. Goes through AI provider chain (Gemini → DeepSeek → DB keys).
**Rate limited:** 20/10min per user, 100/day
```json
{
  "message": "How do I cancel my booking?",
  "lang": "en | ms | zh | ta | rojak",          // optional: client-detected conversation language; pins reply language
  "collected": ["preferredDate", "budgetMax"],   // optional: keys already collected (suppresses re-asking)
  "collectedData": { "preferredDate": "2026-06-14", "budgetMax": "500" }, // optional: exact confirmed values so recaps use real data, never invented
  "categoryLocked": true, "categoryId": "uuid", "answeredQuestions": ["roofType"]
}
```
The in-chat quote flow also accepts the same `lang`/`collected`/`collectedData`/`categoryId`/`answeredQuestions` fields on **`POST /chat/guest`**. `lang` pins the reply language (overrides per-turn guessing); `collectedData` lets the assistant recap exact values and stops already-filled fields being re-shown as cards.
**Response:** `{ "reply": "...", "messageId": "uuid", "actionBlocks": [...] }`

### `GET /chat/session/:id/messages`
Get conversation history.

### `GET /chat/faq`
Public FAQ list.

---

## Admin endpoints

All require `admin` role. Settings-modifying routes also require `X-Action-Pin` header.

### Servicer management

### `GET /admin/servicers`
**Query:** `?kycStatus=pending|approved|rejected`

### `GET /admin/servicers/:id`
Full servicer profile for admin view. Includes KYC status, deposit balance, penalty score, credit balance, ban status, and all documents.
**Response:**
```json
{
  "id": "uuid",
  "businessName": "...",
  "kycStatus": "approved",
  "isBanned": false,
  "penaltyScore": 0,
  "depositBalance": 450.00,
  "creditBalance": 75.50,
  "documents": [...],
  "createdAt": "..."
}
```

### `PATCH /admin/servicers/:id/kyc`
**PIN required**
```json
{ "kycStatus": "approved", "adminNote": "..." }
```

### `POST /admin/servicers/:id/ban`
Manually ban a servicer. Sets `isBanned = true` and logs to AUDIT_LOG. Banned servicers cannot receive quote broadcasts or log in to the servicer panel.
**PIN required**
```json
{ "reason": "Repeated no-shows after warnings" }
```
**Response 204:** Empty

### `POST /admin/servicers/:id/unban`
Lift a ban. Sets `isBanned = false` and logs to AUDIT_LOG.
**PIN required**
```json
{ "adminNote": "Reviewed appeal. Ban lifted." }
```
**Response 204:** Empty

### Servicer identity change requests

When a servicer updates legal-identity fields (`entityType`, `businessRegistrationNumber`, `taxNumber`, `sstNumber`) via `PATCH /servicer/me`, a `ServicerIdentityChangeRequest` is created and queued for admin review. The fields are not applied to the Servicer row until approved.

### `GET /admin/servicer-identity`
List identity change requests with optional status filter.
**Query:** `?status=pending|approved|rejected`
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "servicerId": "uuid",
      "status": "pending",
      "proposed": {
        "entityType": "sdn_bhd",
        "businessRegistrationNumber": "202401000123"
      },
      "servicer": { "businessName": "Ahmad Plumbing", "email": "ahmad@example.com" },
      "createdAt": "2026-05-27T00:00:00Z"
    }
  ]
}
```

### `PATCH /admin/servicer-identity/:id`
Approve or reject an identity change request. On approve, the proposed fields are applied to the Servicer row. On reject, the request is discarded and the servicer may resubmit.
**PIN required**
```json
{
  "status": "approved",
  "adminNote": "Verified SSM registration"
}
```
**Response 200:** Updated request with `status`, `reviewedBy`, `reviewedAt`.

### User management

### `GET /admin/users`
List all customer accounts. Supports search and filter.
**Query:** `?search=email|name&role=customer|admin&page=1&limit=20`
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Sarah Lim",
      "email": "sarah@example.com",
      "phone": "+60 12-345 ****",
      "role": "customer",
      "createdAt": "...",
      "deletedAt": null
    }
  ],
  "pagination": { ... }
}
```

### `GET /admin/users/:id`
Single user details including booking count, report history, and linked servicer account (if any).

### Reports

### `GET /admin/reports`
**Query:** `?status=open|resolved&search=keyword`

### `PATCH /admin/reports/:id`
```json
{ "status": "resolved", "adminNote": "..." }
```

### Penalty appeals

### `GET /admin/appeals`
**Query:** `?status=pending|approved|rejected`

### `PATCH /admin/appeals/:id`
**PIN required**
```json
{ "status": "approved", "adminNote": "..." }
```

### `GET /admin/categories`
Admin list — returns **all** non-deleted categories (published **and**
unpublished, top-level **and** sub) for the Category Settings master-detail page.
Each row includes `published` and `activeListingCount` (non-deleted listings in
the category), plus `parentCategoryId`, `imageUrl`, `allowedTimeSlots`,
`questionSchema`, `defaultPriceSuggestion`, `defaultEstimatedDurationMinutes`.

**Added 2026-06-01:** read-only average-price analytics fields:
- `averagePrice` (number | null) — mean `basePrice` of active (`deletedAt` null)
  `ServicerService` rows, rounded 2dp. For parent (top-level) categories, the
  average is the weighted aggregate of all children's listings.
- `priceStatListingCount` (number) — count of listings in the same scope (own
  services for sub-categories; aggregated children for parents).

### `PATCH /admin/categories/:id`
**PIN required.** Extended in SP2a. Accepts any subset of:
```json
{
  "name": "Plumbing",
  "icon": "wrench",
  "imageUrl": "https://cdn.example.com/plumbing-thumb.jpg",
  "allowedTimeSlots": ["morning", "afternoon"],
  "defaultPriceSuggestion": 120.00,
  "defaultEstimatedDurationMinutes": 90,
  "published": true,
  "bannerUrl": "https://cdn.example.com/plumbing-banner.jpg",
  "cardColor": "#1e88e5",
  "description": "Trusted plumbers for leaks, installs and repairs.",
  "questionSchema": [ /* see GET /categories shape */ ]
}
```
`bannerUrl`/`cardColor`/`description` (SP2b) are customer browse-card imagery +
blurb. Nullable fields (`icon`, `imageUrl`, `defaultPriceSuggestion`,
`defaultEstimatedDurationMinutes`, `bannerUrl`, `cardColor`, `description`)
accept `null` to clear. `questionSchema` is
Zod-validated against `questionSchemaSchema` and **immutability-checked** against
the stored value: an existing question `key` or option `value` may not be renamed
or removed — set `active: false` to deactivate instead (returns 400 on
violation). Audited. The `imageUrl` field is also returned on all category
sub-objects in listing responses (servicer services, quotes, servicer profile).
On save, question/option labels are **auto-translated**: missing/stale `labelI18n`
`{ en?, ms?, zh?, ta? }` (and `descriptionI18n`) are filled via the LLM so the in-chat
quote flow renders each question card in the customer's language. Admin-supplied
translations are preserved (manual override); only missing/stale languages regenerate.
If no LLM is reachable the schema saves untranslated (no failure).

### `POST /admin/categories/backfill-translations`
**PIN required.** One-pass migration that fills `labelI18n`/`descriptionI18n` across
EVERY category's `questionSchema` (for categories saved before auto-translate-on-save
landed). Idempotent — only missing/stale languages regenerate, safe to re-run. Makes LLM
calls per category (a one-off admin op, not a hot path).
**Response:** `{ "ok": true, "scanned": <n>, "updated": <n> }`

### `POST /admin/categories`
**PIN required.** Creates a category.
```json
{
  "name": "Pet Grooming",
  "slug": "pet-grooming",
  "icon": "scissors",
  "imageUrl": null,
  "parentCategoryId": null,
  "defaultPriceSuggestion": 80.00,
  "defaultEstimatedDurationMinutes": 60,
  "published": false
}
```
`name` is required; `slug` is optional (auto-generated from `name`, uniqueness
enforced — 400 if taken). Also accepts `bannerUrl`, `cardColor`, `description`
(SP2b). Pass `parentCategoryId` to create a sub-category (the admin Sub-categories
tab uses this). Created with empty `questionSchema`, all 5 default time slots, and
`published` defaulting to `false`. Returns 201 with the new category. Audited.

### `DELETE /admin/categories/:id`
**PIN required.** Soft-deletes (sets `deletedAt`). **Blocked (400)** when an
active `ServicerService` (`deletedAt IS NULL`) or an open `QuoteRequest`
(status in `open`/`matched`/`reposted`) exists for the category. Returns
`{ "ok": true }` on success. Audited.

### `GET /admin/categories/:id/question-impact?key=<questionKey>`
Returns `{ "key": "...", "count": <n> }` — number of non-deleted
`ServicerService` rows whose `modifiers` JSONB references the given question key
(via the Postgres `?` hasKey operator). Powers the editor's warning before
deactivating a question or flipping its `priced` flag.

### Category requests

### `GET /admin/category-requests`

### `PATCH /admin/category-requests/:id`
**PIN required**
```json
{
  "status": "approved",
  "name": "Pet Grooming",
  "parentCategoryId": null,
  "defaultPriceSuggestion": 80.00,
  "defaultEstimatedDurationMinutes": 90,
  "adminNote": "Fixed typo: 'Pet Grooming' (was 'pet grooming')"
}
```

### Withdrawals

### `GET /admin/withdrawals`
**Query:** `?status=pending|approved|paid|rejected`

### `PATCH /admin/withdrawals/:id`
**PIN required**
```json
{ "status": "approved", "adminNote": "..." }
```

### `POST /admin/withdrawals/:id/mark-paid`
**PIN required + Idempotency**
After admin manually transfers funds, mark the request as paid.

### Servicer deposit top-ups

### `GET /admin/deposit-topups`
List pending deposit top-up requests from servicers.
**Query:** `?status=pending|credited|rejected`

### `POST /admin/deposit-topups/:id/credit`
**PIN required**
Confirm the servicer's bank transfer was received and credit their deposit balance.
```json
{ "adminNote": "Verified via Maybank statement ref TXN-20260615-001" }
```
**Response 204:** Empty

### Settings

### `GET /admin/settings`
All platform settings as key-value pairs.

### `PATCH /admin/settings`
**PIN required**
```json
{
  "key": "platform_fee_rate",
  "value": {
    "current_rate": 0.20,
    "scheduled_changes": [
      {
        "starts_at": "2026-12-01T00:00:00Z",
        "ends_at": "2026-12-31T23:59:59Z",
        "new_rate": 0.12,
        "advertised_discount": "8% off normal rate"
      }
    ]
  }
}
```

### Penalty rules

### `GET /admin/penalty-rules`

### `PATCH /admin/penalty-rules/:id`
**PIN required**

### Feature flags

### `GET /admin/feature-flags`

### `PATCH /admin/feature-flags/:id`
**PIN required**

### Promotions (platform)

### `GET /admin/promotions`
Both platform and servicer promos with filter.

### `POST /admin/promotions`
**PIN required** — create platform promo.
```json
{
  "code": "WELCOME20",
  "discountType": "fixed",
  "value": 20,
  "minOrderAmount": 100,
  "maxUses": 500,
  "expiresAt": "2026-12-31T23:59:59Z",
  "appliesToScope": "all"
}
```

### `PATCH /admin/promotions/:id`
**PIN required**

### Marketing budget

### `GET /admin/marketing-budget`

### `POST /admin/marketing-budget`
**PIN required**
```json
{
  "totalBudget": 5000,
  "periodStart": "2026-06-01T00:00:00Z",
  "periodEnd": "2026-12-31T23:59:59Z"
}
```

### Audit log

### `GET /admin/audit-log`
Read-only. **Query:** `?action=...&actorId=...&from=...&to=...`

### FAQ

#### `GET /admin/faq`
Returns all FAQ entries. Response: `{ data: FaqEntry[] }`.

#### `POST /admin/faq`
Create a new FAQ entry. Requires action PIN header `x-action-pin`.
Body: `{ question, answer, category?, isPublished?, tier? }`
`tier` is a single-value hierarchical string — `String @default("guest")`. Allowed values: `guest | customer | servicer | admin`. The system uses `TIER_ORDER` to include all tiers at or below the user's role (e.g. a `servicer` sees entries with tier `guest`, `customer`, and `servicer`).

#### `PATCH /admin/faq/:id`
Update an FAQ entry. Requires `x-action-pin`. Same body fields as POST (all optional).
Supports `{ tier }` to update which audience tiers see this entry in the AI system prompt.

#### `DELETE /admin/faq/:id`
Delete an FAQ entry. Requires `x-action-pin`.

#### `GET /admin/faq/csv` / `POST /admin/faq/csv`
Export / import CSV. Import matches by question text.

---

## Payment (Stripe) — MVP

All Stripe endpoints require auth (Bearer token). Webhook endpoint is
unauthenticated — signature verification via `STRIPE_WEBHOOK_SECRET` HMAC-SHA256.

### Wallet top-up

There are two ways to top up a wallet:

1. **`POST /user/me/topup`** (customer-only convenience alias)
2. **`POST /stripe/create-topup-session`** (explicit Stripe route)

Both accept the same body and return the same response.

#### `POST /user/me/topup`
**Request:** `{ "amount": 100, "voucherCode?": "RWD-SEED01" }` (minimum RM 10, voucherCode optional)
**Response (Stripe configured):**
```json
{ "url": "https://checkout.stripe.com/c/pay/...", "sessionId": "cs_...", "method": "stripe_checkout" }
```
**Response (Stripe NOT configured, dev only):**
```json
{ "balance": 120.00, "method": "demo_instant" }
```
> When `STRIPE_SECRET_KEY` is set, returns a Stripe Checkout URL. The customer
> is redirected there to complete payment; on success the `checkout.session.completed`
> webhook credits the wallet. In dev/demo without Stripe, credits instantly
> (hard-blocked in production).
>
> If `voucherCode` is provided, the backend validates ownership, expiry, and
> usage status. Two voucher types are supported:
> - `topup_fixed`: Stripe charge reduced by discount, wallet credited full amount
> - `topup_bonus`: Stripe charge is full amount, wallet credited amount + bonus
> The voucher is marked used on submission.

#### `POST /stripe/create-topup-session`
Identical to above — explicit Stripe path for clarity.

### Voucher validation

#### `POST /rewards/voucher/validate`
Validates a voucher code for top-up. Called by the frontend when the user
types a promo code to show discounted pricing before submitting.

**Auth:** Bearer
**Request:** `{ "code": "RWD-SEED01", "topupAmount": 100 }`
**Response (valid, topup_fixed):**
```json
{
  "valid": true,
  "discountType": "topup_fixed",
  "discountValue": 10,
  "originalAmount": 100,
  "finalCharge": 90,
  "finalCredit": 100,
  "label": "−RM 10 off"
}
```
**Response (valid, topup_bonus):**
```json
{
  "valid": true,
  "discountType": "topup_bonus",
  "discountValue": 20,
  "originalAmount": 100,
  "finalCharge": 100,
  "finalCredit": 120,
  "label": "+RM 20 bonus credits"
}
```
**Response (invalid):** `{ "valid": false, "error": "Voucher is already used or expired" }`

#### `POST /rewards/vouchers/search`
Search the user's own vouchers by partial voucher code match.

**Auth:** Bearer (customer)
**Request:** `{ "query": "SEED" }`
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "rewardId": "uuid",
      "voucherCode": "RWD-SEED01",
      "status": "active",
      "expiresAt": "2026-07-01T00:00:00.000Z",
      "createdAt": "...",
      "reward": { "name": "RM 10 Top-up Bonus", "discountType": "topup_fixed", "discountValue": 10 }
    }
  ]
}
```

#### `POST /rewards/voucher/:code/applicability`
Check if a voucher is applicable given optional quote context (budget, categoryId). Greyout logic for the My Vouchers page.

**Auth:** Bearer (customer)
**Request:** `{ "budget": 200, "categoryId": "uuid-optional" }`
**Response (applicable):** `{ "applicable": true }`
**Response (not applicable):** `{ "applicable": false, "reason": "Minimum RM 50 top-up required" }`
**Response (expired/used):** `{ "applicable": false, "reason": "Voucher is used" }`

### Promo code on quote estimate

The `GET /quotes/estimate` endpoint now accepts an optional `promoCode` query parameter.
When provided, it looks up the user's Redemption by voucherCode (must be active + not expired).
Only `booking_percent` and `waiver` discount types are resolved at quote time (`topup_fixed`
vouchers are handled at top-up time, not quote time).

**Request:** `GET /quotes/estimate?categoryId=uuid&budgetMin=100&budgetMax=200&promoCode=RWD-BOOK10`
**Response (with promo):**
```json
{
  "subtotal": 150.00,
  "promoDiscount": 15.00,
  "promoError": null,
  "serviceCharge": 0,
  "sst": 0,
  "total": 135.00,
  "holdAmount": 200.00,
  "estimatedReturn": 65.00
}
```

### Pay-now escrow charge

#### `POST /stripe/create-payment-intent`
Creates a Stripe PaymentIntent for a pay-now booking. Customer must own the booking.
**Request:** `{ "amount": 150.00, "bookingId": "uuid" }`
**Response:** `{ "clientSecret": "pi_..._secret_...", "paymentIntentId": "pi_..." }`
> The frontend uses the `clientSecret` to call `stripe.confirmCardPayment()` or
> similar. On success, the `payment_intent.succeeded` webhook records the
> transaction, marks the invoice paid.
> NOTE: no frontend currently calls `confirmCardPayment` — the live pay-by-card
> flow uses the Checkout-session endpoints below (Stripe-hosted page, no
> publishable key needed). This PaymentIntent endpoint is retained for a future
> inline-Elements option.

#### `POST /stripe/create-booking-payment-session`
Pay an outstanding booking invoice by card via Stripe **Checkout** (hosted page).
Customer-only. The client sends **only** `bookingId`; the charge amount is derived
server-side from the invoice `total` (never trusted from the client). Ownership-checked
(no IDOR) and state-guarded (the booking must have an unpaid invoice with a positive total).
Only valid for a **completed `pay_later`** booking (mirrors `settleBooking`'s contract).
**Request:** `{ "bookingId": "uuid" }`
**Response:** `{ "url": "https://checkout.stripe.com/...", "sessionId": "cs_..." }`
> The frontend opens `url` (new tab / redirect). On completion the
> `checkout.session.completed` webhook (booking branch) runs the **full pay_later
> gateway settlement** via `completeGatewaySettlement`: records the `gateway_payment`
> inflow, deducts the platform fee from the servicer, pays out the remainder to the
> servicer, marks the invoice paid, and sets `settlementMethod='gateway'` — identical
> money outcome to a `credit` settlement, just funded by card instead of wallet.
> Errors: `404` booking not yours / no invoice; `400` not pay_later / not completed /
> invoice already paid / no positive total.

#### `POST /stripe/verify-booking-payment`
Redirect fallback for the above (used if the webhook lags or is not configured).
Customer-only. Verifies the Checkout session is paid, that its `bookingId` belongs to
the caller, then completes the payment idempotently (shared Redis lock + `stripeSessionId`
unique check with the webhook).
**Request:** `{ "sessionId": "cs_..." }`
**Response:** `{ "paid": true, "alreadyProcessed": false }`
> Errors: `400` session not retrievable / not paid / missing bookingId; `403` session not yours.

### Webhook

#### `POST /stripe/webhook`
Receives Stripe events. Verified via `STRIPE_WEBHOOK_SECRET` HMAC-SHA256
signature. Requires the raw body (not JSON-parsed) — the server mounts
`express.raw({type:'application/json'})` specifically on this path.

**Processed events:**
| Event | Action |
|---|---|
| `payment_intent.succeeded` | Records `gateway_payment` transaction, marks invoice paid, idempotency via Redis lock + `stripePaymentIntentId` unique check |
| `checkout.session.completed` | **Branches on metadata:** `bookingId` present → runs the full `pay_later` gateway settlement (`gateway_payment` inflow + servicer `platform_fee` + `escrow_release` payout + invoice paid + `settlementMethod='gateway'`); otherwise (`userId`) → credits user/servicer wallet + `deposit_topup`. Triple idempotency: Redis lock + `stripeSessionId` pre-check + unique `stripeSessionId` column as the hard rollback backstop |

**Idempotency:** Both handlers use a 30-second Redis lock (`NX`) plus a DB
unique-constraint check on `stripePaymentIntentId` / `stripeSessionId` to
prevent double-crediting on Stripe retries.

---

## WebSocket events (Socket.io)

**Connection:** Pass JWT in `auth.token`.

```javascript
const socket = io('wss://api.domain', { auth: { token: accessToken } })
```

### Server → client events

| Event | Payload | When |
|---|---|---|
| `quote.new` | `{ quoteId, category, timeSlot, budgetRange, propertyType, generalArea }` | New quote broadcast (servicer rooms only) |
| `proposal.submitted` | `{ quoteId, proposalId? }` | A servicer submitted a proposal (manual or auto) — sent to the customer room so the open proposals list refreshes live |
| `quote.matched` | `{ quoteId }` | Customer accepted a proposal — sent to every *other* broadcast servicer so their pending list drops the now-unwinnable quote |
| `job.new` | `{ bookingId, quoteId }` | Customer accepted this servicer's proposal — sent to the winning servicer room (new active job) |
| `quote.proposals_ready` | `{ quoteId, proposalCount }` | Customer's quote deadline reached |
| `quote.expired_no_response` | `{ quoteId, discountCode, discountValue }` | Quote expired with zero proposals — discount code auto-generated for customer |
| `booking.confirmed` | `{ bookingId, servicerName }` | Servicer confirmed customer's booking |
| `booking.arrived` | `{ bookingId, photoUrl }` | Servicer marked arrived |
| `booking.done` | `{ bookingId, photoUrl, invoiceUrl }` | Servicer marked done |
| `booking.cancelled` | `{ bookingId, cancelledBy, reason }` | Either party cancelled |
| `booking.mutual_cancel_requested` | `{ bookingId, servicerName, reason }` | Servicer requested mutual cancel — sent to customer room so they can respond via `POST /bookings/:id/mutual-cancel/respond` |

### Rooms

Each user/servicer auto-joins on connect:
- Customer: `user:{userId}`
- Servicer: `servicer:{servicerId}`
- Admin: not auto-joined (admin uses HTTP only)

---

## Notification endpoints

Role-agnostic — the recipient is resolved from the Bearer token, so the same
routes serve customers, admins (USER rows) and servicers. All require auth.

### `GET /notifications`
The caller's notifications, newest first.
**Response:** `{ "data": [ { id, type, message, linkUrl, category, isRead, createdAt } ], "unread": 3 }`

### `PATCH /notifications/read-all`
Marks every notification read. **Response 204.**

### `PATCH /notifications/:id/read`
Marks one notification read. **Response 204.**

### `GET /notifications/prefs`
The caller's notification settings.
**Response:** `{ "prefs": { "types": { orders, jobs, listings, promos, queues }, "followedCategoryIds": [] }, "types": [ ... ] }`

### `PUT /notifications/prefs`
Updates notification settings.
**Request:** `{ "types": { "promos": false }, "followedCategoryIds": ["uuid"] }`

> Notifications carry `type` (`orders` | `jobs` | `listings` | `promos` |
> `queues`) and an optional `category`. A type the recipient switched off, or
> a category they don't follow when they follow some, is silently skipped.
> The frontend polls `GET /notifications` (~45s) and pops new ones as
> bottom-left snackbar toasts.

---

## Dev / demo endpoints

Convenience endpoints for the live demo. All require a Bearer token and are
**hard-blocked when `NODE_ENV=production`**.

### `POST /dev/reseed`
Wipes and reloads the demo data set. Any signed-in user may trigger it (the
topbar "Reseed" button). Demo accounts keep fixed logins, so the session
stays valid across a reseed.

### `POST /dev/seed-quote`
Generates one demo open quote request from a random demo customer, so the
servicer incoming-quotes feed can be shown filling up live.

### `POST /dev/seed-proposal`
Generates one demo servicer proposal for an open quote that is awaiting
proposals. When a customer triggers it, it targets one of their own open
quotes. Powers the topbar "+ Demo proposal" button.

### `POST /dev/topup`
Instantly credits the signed-in account's balance — `User.creditBalance` for
a customer, `Servicer.creditBalance` for a servicer. Not available to admins.
**Request:** `{ "amount": 100 }` · **Response:** `{ "balance": 220.00 }`

> For production wallet top-up, use `POST /user/me/topup` which routes through
> Stripe Checkout when `STRIPE_SECRET_KEY` is configured.

### Seed scripts

| Command | Description |
|---|---|
| `npm run seed:test` | Run test seed standalone — lean data set with 4 demo servicers |
| `npm run db:reset-test` | Force-reset database + test seed (`db push --force-reset` then seed) |
| `npm run reseed:test` | Unseed then test seed (clears test data first) |

---

## Rate limits summary

| Route pattern | Limit |
|---|---|
| `POST /auth/login` | 10/15min per IP |
| `POST /auth/register` | 5/hour per IP |
| `POST /auth/forgot-password` | 5/hour per IP |
| `POST /auth/otp/request` | 3/10min per user |
| `POST /admin/verify-pin` | 5/15min per admin |
| `POST /quotes` | 20/hour per user |
| `POST /chat/session/:id/message` | 20/10min + 100/day per user |
| All others | 100/min per IP |

---

## Versioning

Current version: `v1`. Future breaking changes will introduce `v2` while `v1` remains supported during a transition period.

## Update 2026-05-31 — Category endpoints
- `GET /categories` — published top-level parents (with `activeListingCount`, `published`, `bannerUrl`, `cardColor`, `description`).
- `GET /categories?parent=<slug>` — that parent's published children (quotable services). NEW (drill-down).
- `GET /categories/:slug`, `GET /categories/:slug/servicers` — unchanged.
- Admin (PIN-gated, audited): `POST /admin/categories` (create), `PATCH /admin/categories/:id` (name/icon/defaults/published/questionSchema, immutability-checked), `DELETE /admin/categories/:id` (soft-delete, guarded), `GET /admin/categories/:id/question-impact?key=`.
- Frontend: new public route `GET /services/:parentSlug` → `ChildrenBrowseComponent`. Home parent cards drill down here; child cards route to `/customer/quote/new` or `/guest/quote/new` with `categoryId`.
