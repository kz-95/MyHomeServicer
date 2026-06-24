# Database schema notes

> My Home Servicer connecting tenants and homeowners to service servicers. 50 models (49 domain + 1 infrastructure) across 13 domain blocks. UUID PKs throughout. Decimal(10,2) for all money. Soft deletes on USER, SERVICER, SERVICER_SERVICE, CATEGORY. Admin setting changes require action PIN + audit log.

---

## How the platform works

**Customer flow**
Customer browses a service category → fills a quote form (date, time slot, property type, budget, address, payment method) → sets a deadline for proposals → servicers who are online and in the area receive a broadcast → servicers submit their proposals within the window (manually or via auto-accept) → at the deadline, the customer gets a bundled list of all proposals → picks one → servicer confirms the job → servicer arrives (photo) → works → marks done (photo) → invoice generated → payment releases or cash confirmed.

**Servicer flow**
Servicer registers (V1 — no KYC, auto-approved) with a one-time deposit → goes online (always-on in V1) → manages services (CRUD with SKUs, prices, durations) → sets auto-accept rules per service → receives quote broadcasts → submits proposals (manually or auto with presets) → if selected, confirms the job via two-step → executes the job → marks arrive and done with photos → invoice issued with servicer's own numbering rule → receives payment + any platform-promo credit → requests withdrawal when balance allows.

**Admin flow**
Admin manages categories (approves category requests from servicers with typo fixes) → sets platform fee rate (5% V1, scales to 20% after 50 servicers) → manages platform-wide marketing budget and promo codes → reviews servicer withdrawal requests → reviews servicer deposit top-up requests (V1: manual bank transfer verification) → manages reports from customers → reviews penalty appeals → configures platform settings → all sensitive changes require a separate action PIN.

---

## Key design decisions

**One quote, many proposals, one selection**
A quote request goes out to multiple servicers at once. All proposals are held and sent to the customer together at the deadline — not one by one. Customer picks one.

**Auto-accept matching**
Servicers can set per-service auto-accept rules (JSON conditions like budget range, time slot, property type). When a quote matches, the platform auto-submits a proposal using the servicer's preset. Multiple matching servicers → all auto-submit, customer still picks. Tie-breaker priority: lowest active jobs → newcomers without any jobs yet → round-robin.

**Servicer controls the job lifecycle**
The servicer marks arrive (with photo) and done (with photo). The customer is passive during the job.

**Pay now uses escrow**
If the customer pays upfront, the money is held in escrow until the job is marked done. Only released after completion. Servicer cancellation refunds everything plus tip.

**Tip is separated from payment**
Pay now → tip entered upfront, held in escrow separately. Pay later → tip entered after job done. Cash → no platform tip mechanism. Platform takes no cut on tips.

**Servicers cannot decline after being selected**
Once selected, they're committed. Cancellation triggers a penalty. Clean exit is mutual cancel where customer initiates.

**No-show penalty system**
3 consecutive no-shows or 5 in a week triggers auto-ban. Penalties deducted from servicer deposit. Appeals reviewed by admin per incident.

**Soft deletes everywhere sensitive**
Users, servicers, services, categories never hard deleted. `deleted_at` set instead. Booking history, transactions, audit logs always have a valid reference.

**All money is Decimal, never Float**
`Decimal(10,2)` on every monetary field.

**Admin action PIN separate from login**
Login password gets you in. Action PIN required to save settings, penalty rules, feature flags, platform fee changes, etc.

**Tax + promo + tip calculation order (Malaysian convention)**
`Subtotal → minus promo discount → plus SST on the discounted amount → plus tip (outside tax base)`

**Platform fee is tiered and admin-controlled**
5% per booking until 50 servicers. Admin can schedule rate changes (e.g. 20% normal, 12% promo period). All changes logged with action PIN.

**Servicer has full control over their invoice numbering**
Default format `INV-2026-0001` works for most. Servicer can customise prefix, year format, separator, padding via dashboard.

**Per-service required/optional field configuration**
Servicer decides which quote form fields are required, optional, or hidden for their service. Address, time, date, contact are always required (locked). Everything else configurable.

**Categories support hierarchy — subcategories now used in the servicer flow**
`parent_category_id` self-relation drives a two-level hierarchy. A servicer service listing sits under a platform subcategory (or a servicer-created one) chosen in the listing form. The customer-facing browse / "Find a Service" page still lists only main categories.

**Per-category custom quote questions**
`Category.question_schema` (JSON) holds a list of custom questions rendered in the quote wizard's Details step. The customer's answers are saved to `QuoteRequest.service_details`. All 29 child categories now have seeded questionSchemas.

Question item `type` enum: `checkbox | radio | text | quantity | number`
- `checkbox` — multi-select from options (answer: `string[]`)
- `radio` — single-select from options (answer: `string`)
- `text` — free-text textarea (answer: `string`)
- `quantity` — per-option count stepper 0/-/+ (answer: `Record<optionValue, number>`); customer enters how many of each option. Required = total ≥ 1. Pricing: unit-price × qty per option (same modifier grid as checkbox). Used by `curtain-cleaning` and `aircond-installer`.
- `number` — single free numeric input (answer: `number`); informational only for now. Used by `event-planner` (attendees, duration), `aircond-repair` (units), `home-tutoring` (students), `renovation`/`interior-design` (sqft), `alarm-cctv` (cameras).

Additional question item fields:
- `maxSelect?: number` — checkbox only; maximum selections allowed (unset = unlimited)
- `minSelect?: number` — checkbox/quantity; minimum required selections
- `showIf?: { questionKey, includesAny }` — conditional visibility; hidden questions skipped in validation and pricing
- `property_type` is a **reserved global key** — may never appear in a category's `questionSchema`; rendered as a built-in field on every quote form writing to `QuoteRequest.property_type`
- `labelI18n?`, `descriptionI18n?` (question) and `labelI18n?` (option) — per-language label translations `{ en?, ms?, zh?, ta? }`. Filled automatically on admin save (`autoTranslateQuestionSchema` in `chat.service.ts`, via the LLM chain) so the in-chat quote flow renders each question/option card in the customer's language; admin-supplied values are preserved (manual override), only missing/stale languages (source `en` changed) are regenerated. `en` mirrors the canonical `label` as the staleness marker. Absent = fall back to `label`. The in-chat card resolves to the conversation `lang` (passed from the client) via `pickI18n`; `en`/`rojak` use the canonical label. Existing categories gain translations the next time they're saved (no backfill yet). The on-screen quote forms (quote-form/guest-quote/listing-wizard) do **not** yet localize these labels.

**Per-category photo toggle**
`Category.photos_enabled` (boolean, default false) — when true, the quote form shows the optional photo upload for this category. Admin Category Settings → Dispatch tab has a "Request photos" toggle. Set true for repair/install/site categories; false for cleaning, classes, catering.

**Pass-through fee baselines (travel + supplies)**
`Category.travel_fee_baseline` (Decimal, nullable) — per-category travel fee floor (RM). `Category.supplies_fee_baseline` (Decimal, nullable) — per-category cleaning supplies fee floor. Effective baseline = max(category, overall platform setting). Baseline portion → 0% platform commission (100% servicer); extra above baseline → normal platform-fee % applied. Platform settings: `travel_fee_baseline_overall` and `supplies_fee_baseline_overall` (default RM 20 / RM 30). Coded separately (not generalised).

**Refundability (2026-06-02):** Travel fee is non-refundable after servicer arrives at site. Inspection fee is non-refundable after inspection completed. Both displayed as "non-refundable" line items on the bill step.

**Inspection / procedure flags**
`Category.requires_inspection` (boolean, default false) — when true, listings under this category require an on-site inspection before a real quote is issued. `Category.procedure` (text, nullable) — free-text steps shown to the customer. Same flags on `ServicerService` (listing-level override). Full inspection-first booking sub-flow is a future phase (TODO comment in code).

**Per-option duration (modifiers)**
`ServicerService.modifiers` JSON entry shape extended: `{ price, durationMin?, notOffered }`. `durationMin` is optional and backward-compatible. `computePrefill()` sums `durationMin` across selected priced options → `estimatedDurationMin` in the prefill response.

**New ServicerService fields**
- `travel_fee` (Decimal, nullable) — servicer's stated travel fee; must be ≥ effective category baseline
- `supplies_fee` (Decimal, nullable) — servicer's cleaning supplies fee; must be ≥ effective supplies baseline
- `requires_inspection` (boolean, default false) — listing-level inspection requirement
- `procedure` (text, nullable) — listing-level procedure text

**Servicer "customer mode"**
A servicer can operate the platform as a customer. There is no schema column for this — `POST /servicer/customer-session` lazily provisions a paired `USER` (role `customer`) with a synthetic, non-login email derived from the servicer id, so a normal login with the servicer's real email still resolves to the servicer account.

**Customer credit wallet & platform charge**
`User.credit_balance` is a prepaid wallet shown in the topbar Credit panel. In the demo it is topped up instantly via `POST /dev/topup` (dev-only, blocked in production). Servicers reuse their existing `Servicer.credit_balance` field for the same panel. The `platform_charge` platform setting (`{ mode: 'percent' | 'per_unit', value }`, admin-editable) is applied on a top-up — `credit.service.ts` holds the add/deduct + charge maths.

**Notifications target customers, admins and servicers**
The `NOTIFICATION` table carries either a `user_id` or a `servicer_id`. `User.notification_prefs` and `Servicer.notification_prefs` (JSON) hold each recipient's settings — per-type on/off toggles and a `followedCategoryIds` list. `notification.service.ts` (`notify` / `notifyAdmins`) checks these before creating a row. The frontend polls `/notifications` every 45s and surfaces new ones as bottom-left snackbar toasts; there is no real-time socket push for notifications in V1.

**Servicer rating is computed, not user-submitted (V1)**
`Servicer.rating` is a float field that the platform updates internally. In V1 there is no customer review or star-rating submission flow — the `reviews` feature flag is `false`. The field is seeded with realistic values for demo purposes. Post-V1, a `Review` model will be added and `rating` will be recalculated as an average after each new review. Until then, treat `Servicer.rating` as a read-only display field updated by admin or migration only.

**QuoteBroadcast gained `declinedAt` + `metadata` for SP4 dispatch rotation**
The `declinedAt DateTime?` field marks when a servicer declined or timed out on a
dispatch prompt. The `metadata Json?` field stores rotation state as
`{ rotationOrder: Record<servicerId, index>, currentIndex: number, startedAt: ISO,
  acceptedAt?: ISO }`.

**QuoteBroadcast.openedAt is set via API, not inferred**
When a servicer taps into a quote detail view, the frontend calls `POST /servicer/quotes/:id/open` which sets `opened_at` on the `QUOTE_BROADCAST` row for that servicer. This is used to distinguish servicers who saw a quote but chose not to respond (soft no-show) from those who never received or opened it. Do not infer opened status from proposal submission — a servicer can open and still not respond.

**Servicer deposit top-up is a manual flow in V1**
There is no `DepositTopup` model — top-up requests are tracked as a `PLATFORM_SETTINGS`-governed admin task. When a servicer submits a top-up request, the API creates a `TRANSACTION` row with `type: deposit` and `status: pending`. Admin verifies the bank transfer and updates it to `status: completed`, crediting `SERVICER_DEPOSIT.currentBalance` and `totalDeposited`. Post-V1, this will be replaced by a payment gateway webhook that auto-credits on successful transfer.

---

## Global rules

| Rule | Detail |
|---|---|
| Primary keys | UUID on all tables |
| Money fields | Decimal(10,2) — never Float |
| Soft deletes | `deleted_at` on USER, SERVICER, SERVICER_SERVICE, CATEGORY |
| Admin changes | All setting saves require action PIN + written to AUDIT_LOG |
| Append-only | TRANSACTION, AUDIT_LOG, SERVICER_CREDIT_LOG, PROMOTION_REDEMPTION are never updated or deleted |
| Timestamps | All tables have `created_at`. Mutable tables also have `updated_at`. |
| Currency | Defaults to MYR. Currency stored per transaction for future multi-country support. |
| Demo accounts | `is_demo: true` flag bypasses password complexity, blocked entirely when NODE_ENV=production |

---

## Table index

| Block | Tables | Domain |
|---|---|---|---|
| 1 | USER, USER_ADDRESS, QUOTE_PRESET, USER_DEVICE, REFRESH_TOKEN, OTP_CODE, NOTIFICATION | Users & auth |
| 2 | SERVICER, SERVICER_DEPOSIT, SERVICER_DOCUMENT, SERVICER_SCHEDULE, SERVICER_SERVICE, CATEGORY, PRICING_MODULE | Servicer (PricingModule blocks) |
| 3 | PENALTY_RULE, PENALTY_LOG, PENALTY_APPEAL | Penalty |
| 4 | QUOTE_REQUEST, QUOTE_PROPOSAL, QUOTE_BROADCAST | Quote |
| 5 | BOOKING, ORDER_HISTORY, FILE | Booking |
| 6 | ESCROW, TRANSACTION, DISCOUNT_CODE | Payments |
| 7 | REPORT, PLATFORM_SETTINGS, AUDIT_LOG, FEATURE_FLAG, IDEMPOTENCY_FALLBACK, JOB_QUEUE | Admin & ops |
| 8 | CHAT_SESSION, CHAT_MESSAGE, FAQ | AI chatbot |
| 9 | SERVICER_PROPOSAL_PRESET, SERVICER_CREDIT_LOG, SERVICER_WITHDRAWAL | Servicer dashboard extras |
| 10 | CATEGORY_REQUEST | Category management |
| 10.5 | SERVICER_IDENTITY_CHANGE_REQUEST | Servicer identity change admin review |
| 10.6 | BANNED_EMAIL | Deactivation / banned accounts |
| 11 | PROMOTION, PROMOTION_REDEMPTION, PLATFORM_MARKETING_BUDGET | Promotions |
| 11.5 | LOYALTY_TIER, CUSTOMER_POINTS, POINTS_TRANSACTION, REWARD, REDEMPTION | Loyalty & Rewards |
| 12 | INVOICE | Invoicing |
| 13 | POSTCODE | Location / postcode directory |

---

## Block 1 — Users & auth

| Table | What it stores | Key notes |
|---|---|---|
| USER | All platform users | Single table for customers and admins — `role` field tells them apart. `contact_name` / `contact_number` separate from `name` / `phone`. `preferred_time_slot` pre-fill the quote form. `action_pin_hash` only set for admin accounts. `credit_balance` is the customer's prepaid wallet (topbar Top-Up panel). `avatar_url` (String?) stores the customer's profile photo URL; most users won't have one — fall back to initials on the frontend. `is_demo` flag bypasses password complexity (V1 seed data) but blocked in production. `chat_banned` and `chat_strike_count` track prompt-injection violations — 3 strikes = auto-ban from the AI chatbot. `google_id` set for accounts created via Google OAuth. `password_hash` is nullable — null for Google-only accounts. `reset_token` / `reset_token_expiry` store password reset state (UUID, 1h TTL). `active` (bool, default true) and `deactivatedAt` (DateTime?) gate login — deactivated users are blocked with "Account deactivated". `deactivationCount` tracks how many times the account was deactivated; 10 or more auto-bans the email. `deleted_at` soft-deletes without orphaning booking history. A servicer's "customer mode" lazily creates a paired USER row here with a synthetic email. |
| USER_ADDRESS | Saved addresses per user | Multiple addresses per user, one flagged as default. `lat` / `lng` for future radius matching. Pre-filled into the quote form when a saved address is selected. |
| USER_DEVICE | Push notification targets | One row per device per user. Stores FCM/APNS device token and platform (ios/android/web). `is_active` flips false on logout or token revocation. |
| REFRESH_TOKEN | JWT session management | Access tokens expire in 15 min. Refresh tokens stored as a hash — `revoked_at` set on logout. Supports multiple active sessions, one per device. |
| OTP_CODE | One-time passwords | Used for password reset and phone/email verification. Stored as a hash, never plaintext. `purpose` distinguishes the flow. New OTP invalidates previous ones. |
| NOTIFICATION | In-app notifications | Every notification stored here. Targets a customer/admin (`user_id`) **or** a servicer (`servicer_id`) — both columns are nullable, exactly one is set. `link_url` is a generic in-app redirect target for a click; `category` tags the notification for the "followed categories" filter. Legacy `link_quote_list` / `link_reorder` retained. `is_read` updated when opened. Served by the role-agnostic `/notifications` API. |

---

## Block 2 — Servicer

| Table | What it stores | Key notes |
|---|---|---|
| SERVICER | Servicer profile | V1 ships with `is_online` defaulting to true. `operating_hours` (Json, default `[]`) stores the servicer's weekly schedule as weekday-keyed object: `{ mon: { open: "HH:MM", close: "HH:MM" }, tue: {...}, ... }`. Per SP-5, the business-profile editor auto-formats time inputs (`"9"`→`"09:00"`, `"1130"`→`"11:30"`) and validates `HH:MM` 24h format before save. When operating hours are set, a BullMQ cron job (`servicer.online_sync`, every 5 min) auto-sets `is_online`: within hours → true, outside → false. When operating hours are empty (`{}`), the servicer is always-on (current behavior — no auto changes). `service_radius_km` (Int, default 10) is the account-level coverage radius (km), edited in the business-profile Type of Services section and used by SP-3 auto-accept matching (haversine of `serviceAreas` coords vs the job address). Servicer can also manually toggle `is_online` via `PATCH /servicer/me/toggle-online` — manual override persists until the next cron cycle overwrites it based on operating hours. `kyc_status` defaulting to approved (no KYC flow yet). `is_company` distinguishes freelancers from registered companies. `tax_number` and `business_registration_number` are company-only. `credit_balance` holds withdrawable earnings (topped up via Stripe, transferred from deposit, withdrawn to bank). `bankName` (String?) and `bankAccount` (String?) store the servicer's bank details. `onboarded` (Boolean, default false) gates job-taking until profile is complete. `max_auto_accepts` caps concurrent auto-accepted jobs. Invoice formatting fields (`invoice_prefix`, `invoice_year_format`, `invoice_separator`, `invoice_padding`, `invoice_next_number`) let servicer control their own numbering — defaults produce `INV-2026-0001`. `rating` is a read-only display field in V1 — see key design decisions for update mechanism. `is_banned` set by admin manually or auto-set by the no-show background job. `google_id` set for accounts created via Google OAuth. `password_hash` is nullable — null for Google-only accounts. `pin_hash` (String?) stores the servicer's bcrypt-hashed PIN. When null, the default PIN `123456` is accepted as a fallback. Set via registration (optional `pin` field) or `PUT /servicer/account/pin`. `reset_token` / `reset_token_expiry` store password reset state (UUID, 1h TTL). **Settings refinements additions:** `show_email_public` (bool, default false — show email on public profile), `show_phone_public` (bool, default false — show phone on public profile), `invoice_content` (String? — free-text extra line on invoices, max 20 chars), `invoice_suffix` (String? — suffix appended to invoice number, max 20 chars). **Money/listing epic additions:** `entityType` (EntityType enum — sole_proprietorship/partnership/enterprise/sdn_bhd, nullable), `sstRegistered` (bool, default false — not every business has SST), `sstNumber` (string?), `serviceChargeRate` (Decimal(5,4), default 0 — account default %), `taxInclusive` (bool, default false — quoted prices already include SC+SST). Legal-identity fields (entityType, sstNumber, businessRegistrationNumber, taxNumber) require admin review through `ServicerIdentityChangeRequest`. Other fields (serviceChargeRate, taxInclusive) save directly. |
| SERVICER_DEPOSIT | Registration deposit & balance | One row per servicer. `current_balance` starts equal to `total_deposited`. `minimum_required` set by admin (default RM 100). Balance decremented on each penalty. Servicer can transfer excess above minimum to credit balance via `POST /servicer/me/transfer`. Top-up flow in V1 is manual — see key design decisions for top-up tracking via TRANSACTION. |
| SERVICER_DOCUMENT | KYC file uploads | V1: not used (KYC postponed, `servicer_kyc` feature flag is false). Schema kept for post-V1 reactivation. Upload flow: `POST /files/presign` → upload to S3 → `POST /servicer/me/documents` with fileId. |
| SERVICER_SCHEDULE | Availability by day and slot | V1: not used (always-online for all servicers, `servicer_schedule` feature flag is false). Schema kept for post-V1 reactivation. |
| SERVICER_SERVICE | Services offered | Each service belongs to a category with a base price and price type (fixed/hourly/quote). `servicer_sku` is optional — servicers can give their services internal codes (3-30 chars, alphanumeric + hyphens + underscores). `tax_mode` per service (inclusive/exclusive/none) handles freelancer vs company tax. `estimated_duration_minutes` helps the platform pair quotes with servicers who can finish in the customer's time slot. `auto_accept` enables auto-proposal-submit with `auto_accept_conditions` JSON defining the match rules (budget range, time slot, weekday, property type). `field_requirements` JSON defines which quote form fields are required/optional/hidden for this service. **`modifiers` JSON (Phase 6 shape) — option-price map**: `Record<questionKey, Record<optionValue, { price: number\|null, notOffered: boolean }>>`. `questionKey` matches a priced question's `key` in `Category.question_schema`; `optionValue` matches one of that question's option `value` strings. `price` is the servicer's per-option price (null = defer to base price). `notOffered: true` means the servicer does not offer this option. Only priced questions (those with `priced: true` in the question schema) are stored. `deleted_at` soft-deletes services with historical bookings. **Money/listing epic additions:** `moduleRefs` (Json, default `[]` — `[{ moduleId, kind, overridePrice?, durationDeltaMin? }]` referencing ServicerModules; `kind` is `included` (always in the total) or `addon` (tickable extra, excluded unless selected), `overridePrice` overrides the module's own price, `durationDeltaMin` is the module's contribution to estimated job time — SP-3 §8/§9; both `kind` and `durationDeltaMin` default so pre-SP-3 refs parse unchanged), `serviceChargeRate` (Decimal(5,4)? — null = inherit account default), `taxInclusive` (bool? — null = inherit account), `sstApplies` (bool? — null = inherit account's `sstRegistered`). |

### Pricing modules (Block 2.5 — new, §19)

| Table | What it stores | Key notes |
|---|---|---|
| PRICING_MODULE | Servicer-owned reusable priced components | Each module has `label`, `defaultPrice` (Decimal), `taxable` (bool, default true — subject to SST), `serviceChargeable` (bool, default true — subject to service charge), `categoryId` (string? — optional scope). `active` (bool, default true). Modules are composed into listings via `ServicerService.moduleRefs`. Line items are snapshotted from modules at proposal time — see money/listing epic spec §2.2 and §2.4. |

### Business contacts (SP-5 — new, §6)

| Table | What it stores | Key notes |
|---|---|---|
| SERVICER_CONTACT | Multi-contact per servicer | `contactPerson` (required), `number?` (phone), `email?`. At least one of number or email required. ≥1 and ≤10 contacts per servicer. Exactly one `isPrimary` — setting a new primary clears the old. The primary is the customer-facing fallback and cannot be deleted while primary (reassign first). `visibleToCustomer` replaces the deprecated `showEmailPublic`/`showPhonePublic` toggles. Seeded from existing servicer name/phone on migration. |

### Servicer modules (Block 2.6 — SP-3, §7)

| Table | What it stores | Key notes |
|---|---|---|
| SERVICER_MODULE (`business_modules`) | First-class reusable priced-item library | `{ id, servicerId FK, name, price (Decimal 10,2), sku? (3–30 alnum/-/_), active (bool, default true), timestamps }`. **No per-item tax flags** — tax is applied flat from the business profile (SP-3 §8). Replaces the ad-hoc `PricingModule`/`moduleRefs` UX; `PricingModule` is kept until the Phase-2 migration. CRUD at `/servicer/modules`; list rows carry a computed `usedInListings`. `DELETE` soft-disables (`active=false`). Migration `20260612120000_sp3_servicer_modules` (drops the over-built tax columns in `20260612123000_sp3_module_drop_tax_flags`). |
| SERVICER_WA_PRESET (`servicer_wa_presets`) | Reusable WhatsApp message templates (Block 2.7 — SP-3 dispatch) | `{ id, servicerId FK, label, body (Text — carries `{name}`/`{orderId}`/`{eta}` placeholders), active (bool, default true), timestamps }`. A servicer fires one at a customer from a won job card via `<app-wa-button>`, which interpolates the placeholders and opens a `wa.me` link. CRUD at `/servicer/wa-presets` (servicerId-scoped); `GET` lists active-first; `DELETE` soft-disables (`active=false`). Indexed on `servicerId`. Migration `20260617201521_sp3_servicer_wa_preset`. |

**SP-3 ServicerService fields (§14)**
- `image_url` (text, nullable) — optional listing photo (S3 URL, `listing_photo` presign purpose); cards fall back to the category image.
- `published` (boolean, default true) — listing visibility: `true` = Active (customer-visible), `false` = Draft. Drives the listings-tab status toggle; toggled via `PATCH /servicer/me/services/:id`.
- Simple listings store the "what jobs do you want?" offered/N-A choices in the existing `modifiers` map as `{ price: null, notOffered }` (no per-option pricing — Advanced only).
- `listing_mode` (text, default `'simple'`) — SP-3 §10 creation path: `'simple'` (one-screen flat) or `'advanced'` (3-step wizard: modules + per-option pricing + auto-accept). Set by the create/edit wizard via `POST`/`PATCH /servicer/me/services`; existing rows backfill to `'simple'`.
- `auto_accept_message` (text, nullable) — SP-3 §10.2 step 3: optional message shown to the customer when an Advanced listing auto-accepts.
- Advanced listings store module composition in `module_refs` (JSON `ModuleRef[]`: `{ moduleId, kind: included|addon, overridePrice?, durationDeltaMin? }`, Zod `moduleRefsSchema`) and per-option price+duration in `modifiers`.
- **Pricing engine (SP-3 §8/§9 — `listing-pricing.service.ts`):** `computeListingPrice` builds the itemised total (base · included modules · matched option upcharges · ticked add-ons) and applies the servicer's flat tax (`serviceChargeRate`/`sstRegistered`/`taxInclusive` + global SST rate); `computeListingDurationMin` sums base + per-option (×count) + module duration deltas. Shared by the one-tap accept (`listing-accept.service.ts` → dispatch/quote accept), the customer proposal view (`proposal-view.service.ts`), and the 4-gate auto-accept engine (`sp3-auto-accept.service.ts`). Falls back to `basePrice` + `estimatedDurationMinutes` when a listing carries no priced options/modules.

---

## Block 3 — Penalty

| Table | What it stores | Key notes |
|---|---|---|
| PENALTY_RULE | Admin-configured penalty amounts | Admin sets deduction per type (noshow or cancel) — fixed or percentage. Requires action PIN. |
| PENALTY_LOG | Per-incident penalty record | One row per event. `amount_deducted` from deposit. `customer_refund` to affected customer. Links to TRANSACTION. |
| PENALTY_APPEAL | Servicer appeal for reversal | Servicer fills reason form. Admin approves or rejects. Approved → reversal transaction created, deposit restored. |

---

## Block 4 — Quote

| Table | What it stores | Key notes |
|---|---|---|
| QUOTE_REQUEST | Customer quote submission | `time_slot` is one of 4 presets. `deadline_mode` fcfs or fixed_time. `servicer_deadline` auto-calculated as `proposal_deadline` minus 15 min. `tip_amount` only captured here for pay_now bookings. `settlement_method` (SettlementMethod? — credit/cash) stores the **pay_later** settlement choice captured at quote-request time; carried through to the booking at proposal-select so the select-servicer modal does **not** re-ask (added 2026-06-22). Null for pay_now (settled at the pay step) and legacy rows (select falls back to `cash`). `service_details` JSON stores the customer's answers to the category's custom questions (the quote wizard's Details step). `parent_quote_id` links reposted quote to original. `lat`/`lng` stored for future radius matching. Quote can be cancelled by customer while `status = open` via `POST /quotes/:id/cancel`. **`status` enum** (`QuoteStatus`): `open` (broadcast, accepting proposals) · `pending_payment` (created but NOT broadcast — guest pay_now/gateway awaiting Stripe settlement; the `checkout.session.completed` webhook takes the budget hold and flips it to `open`, see §payment-gate) · `matched` · `expired` · `cancelled` · `reposted`. |
| QUOTE_PROPOSAL | Servicer response to a quote | Servicers submit price, message, ETA. All proposals bundled and sent at `proposal_deadline` — customer sees them together. Only one moves to selected; others to rejected. Can be auto-submitted by the platform when servicer's auto-accept rules match. **Added 2026-05-27:** `lineItems` (Json, default `[]` — snapshot `[{ label, amount, taxable, serviceChargeable }]`) so the proposal carries its itemised breakdown; copied to booking as a frozen snapshot at acceptance. |
| QUOTE_BROADCAST | Tracks who was notified | One row per servicer per broadcast. `sent_at` when push sent. `opened_at` set when servicer calls `POST /servicer/quotes/:id/open` (not inferred from proposals). Used to identify eligible servicers for no-show tracking and to distinguish "saw but ignored" from "never received". |

---

## Block 5 — Booking

| Table | What it stores | Key notes |
|---|---|---|
| BOOKING | Confirmed job record | Created when customer selects a proposal. **SP-3 dispatch wave (2026-06-17): no servicer re-confirm** — selecting a proposal (and accepting a dispatch prompt) now creates the booking directly in `confirmed` (`confirmedAt` set, no-show detection scheduled at creation). The legacy `pending_confirm` state is no longer produced by the normal flow; lifecycle is `confirmed` → `in_progress` → `completed`. `confirmJob`/`POST /servicer/jobs/:id/confirm` are retained but dead-path. Servicer controls the remaining transitions. `arrive_photo_url` and `done_photo_url` stored as evidence. `cash_confirmed` servicer-only action on cash jobs. `mutual_cancel_requested` and `mutual_cancel_status` handle customer-initiated cancel to avoid servicer penalty. `cancel_requested_at` and `cancel_confirmed_at` timestamp the two-step cancel. `tip_status` and `tip_paid_at` track pay_later tip. **Money/listing epic additions:** `paymentTiming` (PaymentTiming? — pay_now/pay_later, replaces paymentMode semantics), `settlementMethod` (SettlementMethod? — gateway/credit/cash, chosen at Bill step/settlement), `lineItems` (Json, default `[]` — snapshot of proposal line items, frozen). |
| ORDER_HISTORY | Quick reorder shortcuts | Two types: service (rebook same servicer) and category (new quote with same form pre-filled). `snapshot` is JSON blob of original form values. |
| FILE | Central media/upload tracking | All uploaded files — arrive/done photos, KYC docs, servicer logos. `owner_type` is a string since Prisma doesn't support polymorphic relations. |

---

## Block 6 — Payments

| Table | What it stores | Key notes |
|---|---|---|
| ESCROW | Holds pay_now funds | Created when pay_now booking confirmed. `amount` = canonical total (computeTotal().total), `platform_fee_base` stores the afterPromo for fee calculation, `tip_amount` separately. Stays `held` until servicer marks done and no report is open. `released` on completion or `refunded` on servicer cancel. |
| TRANSACTION | Immutable money movement log | Every money movement creates a row — escrow holds, releases, refunds, tips, penalty deductions, deposits, discount generations, platform fees, promo paybacks, deposit top-ups (pending and completed). Append-only. |
| DISCOUNT_CODE | Sorry codes for no-response quotes | Auto-generated when a quote expires with zero proposals. One code per expired quote, tied to user. Single-use. Type and value set by admin in PLATFORM_SETTINGS. Customer notified via `quote.expired_no_response` WebSocket event. |

---

## Block 7 — Admin & ops

| Table | What it stores | Key notes |
|---|---|---|
| REPORT | Customer problem reports | Created from report-a-problem button on a booking. Admin reads, toggles open/resolved. Searchable. |
| PLATFORM_SETTINGS | Admin-configurable key-value store | Global settings changeable without deploy. Includes `platform_fee_rate` as JSON with current rate + scheduled changes. Every write requires action PIN + AUDIT_LOG entry. JSONB values validated against a per-key schema using `ajv` or `zod` before saving. |
| AUDIT_LOG | Sensitive action trail | Append-only log of every admin action. `old_value`/`new_value` JSON. `ip_address` for security. Never deleted. |
| FEATURE_FLAG | Feature on/off switches | Toggle features without code deploy — bid mode, payment gateway, AI chatbot, reviews, servicer KYC, servicer schedule. Both frontend and backend check at runtime. |
| JOB_QUEUE | Background job tracking | Tracks scheduled and async jobs — quote expiry, no-show detection, discount generation, deposit deduction, notification dispatch, promo credit payback, invoice PDF generation (`pdf-lib` → S3). Mirrors Redis/BullMQ state. |

---

## Block 8 — AI chatbot

| Table | What it stores | Key notes |
|---|---|---|
| CHAT_SESSION | One conversation per context | Polymorphic owner: `user_id` for customers/admins, `servicer_id` for servicer accounts. Exactly one is set. `context_type` distinguishes general/booking_support/quote_help. `total_tokens_used` nullable. |
| CHAT_MESSAGE | Individual messages | One row per message. Last 10 fetched as history on each AI call. `tokens_used` nullable. |
| FAQ | Static FAQ entries | Admin-managed knowledge base fed into the AI chatbot system prompt. `tier` — single-value String, default `"guest"`. Hierarchical access: guest < customer < servicer < admin. `TIER_ORDER` in `chat.service.ts` maps each role to allowed tiers: admin sees all 4, servicer sees 3 (servicer/customer/guest), customer sees 2 (customer/guest), guest sees 1 (guest). `buildSystemPrompt(role)` filters via `prisma.faq.findMany({ where: { tier: { in: allowedTiers } } })`. `localFallback()` uses the same tier filtering. `isPublished` gates inclusion. |

---

## Block 9 — Servicer dashboard extras

| Table | What it stores | Key notes |
|---|---|---|
| SERVICER_PROPOSAL_PRESET | Reusable proposal templates | V1 cap: 3 presets per servicer (unlimited via subscription post-V1). `name` short label, `message` full text, `price_offset` optional ± from base price. `is_default` marks the one used for auto-accept. `sort_order` controls hot button order in UI. |
| SERVICER_CREDIT_LOG | Audit trail for credit balance | Append-only log of every credit balance change. `type` enum (promo_payback / withdrawal / manual_adjustment). `balance_after` records balance post-transaction. `reference_id` links to source (booking, withdrawal request, etc). |
| SERVICER_WITHDRAWAL | Servicer withdrawal requests | V1: fake (no real bank integration). Admin manually approves each request after verifying balance and account standing. Status flows: pending → approved → paid, or pending → rejected. `admin_note` records decision reason. Post-V1: AI auto-approver for routine cases. |

---

## Block 10 — Category management

| Table | What it stores | Key notes |
|---|---|---|
| CATEGORY | Service categories | `icon` stores an icon identifier string (e.g. iconify class name). `imageUrl` (nullable) holds an admin-uploaded thumbnail image for the category card — used on servicer listing cards as the "photo-ready slot"; `icon` serves as fallback. `question_schema` (JSON) holds per-category custom questions for the quote form (shape below). `allowedTimeSlots` (String[]) — which time slots are available for this category (default: all 5: the `TimeSlot` enum = `morning`/`noon`/`afternoon`/`evening`/`night`; `noon`+`afternoon` replaced the old single `lunch` slot. Single source of truth is `backend/src/lib/time-slots.ts` (`TIME_SLOTS`/`TimeSlotValue`), imported by every validator, service, and Zod schema. Slot start hours (MYT): morning 12, noon 13, afternoon 15, evening 19, night 22 — see `booking.service.ts`). `published` (Boolean, default **false**) — added SP2a; unpublished = admin-only draft, hidden from customers (`GET /categories`, `GET /categories/:slug`) and servicer listing creation; admin Category Settings (`GET /admin/categories`) sees all. `bannerUrl`, `cardColor`, `description` (all String?, added SP2b) — customer browse-card imagery (banner image + colour wash) + customer-facing blurb; returned on public `GET /categories`/`:slug`. `parentCategoryId` self-relation supports subcategory hierarchies — admin Category Settings manages children via the Sub-categories tab (reuses the same POST/PATCH/DELETE endpoints). `deleted_at` enables soft deletes — `DELETE /admin/categories/:id` sets it, blocked when active listings or open quotes exist. Full admin CRUD via `GET/POST/PATCH/DELETE /admin/categories` (+ `GET /admin/categories/:id/question-impact?key=`), all PIN-gated + audited. |
| ↳ `question_schema` shape | Per-category quote questions (SP2a) | `Array<{ key, label, type: 'checkbox'\|'radio'\|'text', required?, priced?, description?, sortOrder?, active?, options?: Array<{ value, label, sortOrder?, active? }> }>`. `key` and option `value` are slugs generated from the label on first save and are **immutable** thereafter — backend `checkQuestionSchemaImmutability` (in `lib/json-schemas.ts`) rejects any PATCH that renames/removes an existing `key` or `value`. To "remove" a question/option set `active: false` (soft-deactivate): defaults `true` when absent; `false` hides it from new quote/listing forms while preserving existing `QuoteRequest.service_details` + `ServicerService.modifiers` data. Validated by `questionSchemaSchema` (Zod) on every write. `priced: true` questions drive the servicer per-option price grid (`modifiers`). Consumers (`quote-form`, `services.component`, `servicer-quote.service`) filter `active !== false`. |
| CATEGORY_REQUEST | Servicer requests for new categories | When a servicer's category doesn't exist, they submit a form. Admin reviews and approves (with typo fixes), rejects, or modifies. Required action PIN to approve since admin sets default price suggestion and duration at approval time. `parent_category_id` allows requesting as subcategory under existing main category (post-V1 use). |

---

## Block 10.5 — Servicer identity change requests (new, §5/§17)

| Table | What it stores | Key notes |
|---|---|---|
| SERVICER_IDENTITY_CHANGE_REQUEST | Admin review queue for legal-identity changes | Mirrors `CategoryRequest` pattern. Stores `servicerId`, `status` (IdentityRequestStatus: pending/approved/rejected), `proposed` (Json — `{ entityType?, businessRegistrationNumber?, taxNumber?, sstNumber?, categoryId? }`), `reviewedBy` (string? — admin who acted), `reviewedAt` (DateTime?), `createdAt`. Approve → applies proposed values to `Servicer`; reject → discards. Servicer may resubmit. |

## Block 11 — Promotions

| Table | What it stores | Key notes |
|---|---|---|
| PROMOTION | Platform-level promotion engine | No `code` field — promotions are auto-trigger-based, not manually entered by customers. `triggerType` (String — e.g. `topup_min_amount`, `order_percent`, `nth_booking`) defines what event activates the promotion. `valueType` (`percent` or `fixed`) + `value` (Decimal 10,2) define the discount amount. `conditions` (Json, default `{}`) holds trigger-specific conditions: `{ minAmount, categoryId, nthNumber, minBookingAmount }`. `targetRole` (String, default `all`) restricts to `customer`/`servicer`/`all`. `active` (bool, default true) toggles the promotion on/off. `startDate`/`endDate` (DateTime?) define the validity window. `maxUses` (Int?) is a global cap; `usedCount` (Int, default 0) tracks total uses. `maxPerUser` (Int?, default 1) caps per-user usage — enforced via PROMOTION_REDEMPTION count. `description` (String?) is optional admin notes. Admin CRUD via `GET/POST/PATCH /admin/promotions`. Evaluation engine: `evaluatePromotions(triggerType, { userId, amount, categoryId, bookingCount })` in `services/promotion.service.ts` — finds all active matching promotions, checks conditions + global/per-user caps, and returns applicable discounts. Redemptions recorded via `recordPromotionRedemption()`. |
| PROMOTION_REDEMPTION | Tracks every promo use | One row per redemption. `amount_discounted` records actual amount knocked off. `paid_to_servicer_via_credit` flips true when platform pays the servicer back after job + payment confirmed. `paid_at` timestamp of credit transfer. |
| PLATFORM_MARKETING_BUDGET | Caps platform promo cost | Total budget allocated, current `spent_amount` tracked. When spent reaches total, platform stops issuing/honouring new platform promos until next budget period. |

---

## Block 12 — Invoicing

| Table | What it stores | Key notes |
|---|---|---|
| INVOICE | Combined invoice + receipt | One per booking. `invoice_number` generated using servicer's own rule (prefix, year, separator, padding). Default rule produces `INV-2026-0001`. `sequence_number` raw counter — gaps detected for Malaysian tax compliance (sequential required). `paid_at` nullable — null means unpaid invoice, set means it's now a paid receipt with PAID stamp on PDF. `pdf_url` to the generated PDF in cloud storage. PDF is generated inline during `generateInvoice()` (called from `doneJob()`) using `pdf-lib`, then uploaded to S3. **Money/listing epic additions (new canonical total shape):** `lineItems` (Json, default `[]` — snapshot `[{ label, amount, taxable, serviceChargeable }]`), `subtotal` (Decimal? — Σ lineItems), `promoDiscount` (Decimal?), `serviceChargeRate` (Decimal(5,4)?), `serviceChargeAmount` (Decimal(10,2)?), `sstApplies` (bool?), `taxInclusive` (bool?), `taxRate` (Decimal(5,4)? — new precision; old TaxMode replaced by sstApplies+taxInclusive), `taxAmount` (Decimal(10,2)?), `tipAmount` (Decimal(10,2)?), `total` (Decimal(10,2)? — canonical customer total == escrow charge), `platformFee` (Decimal(10,2)? — unified fee), `dueDate` (DateTime? — defaults to `now() + interval '14 days'`; used by soft enforcement for pay_later invoices). Old fields removed (taxMode).

---

## Block 10.6 — Banned email (deactivation system)

| Table | What it stores | Key notes |
|---|---|---|
| BANNED_EMAIL | Email addresses banned from registration | One row per banned email. `reason` is optional admin note. `bannedBy` tracks which admin banned it. `deactivations` counts how many times a deactivated account triggered this ban (auto-increment). Checked during registration — matching emails are rejected. |

---

## Block 11.5 — Loyalty & Rewards

| Table | What it stores | Key notes |
|---|---|---|
| LOYALTY_TIER | Named tiers with point thresholds | `name` unique, `min_points` threshold for achieving tier. `bonus_percent` is the earning bonus (e.g. 10% more points per RM). `badge_color` for UI display. `active` boolean, `sort_order` for rendering order. |
| CUSTOMER_POINTS | Per-user points ledger | One row per user. `balance` current points, `lifetime_earned` and `lifetime_spent` for tier calculation. `last_rewards_visit` tracks when the user last viewed the rewards page. |
| POINTS_TRANSACTION | Immutable points movement log | Positive amounts = earned, negative = spent. `type` string: `earn_booking`, `earn_review`, `earn_referral`, `earn_welcome`, `redeem`, `expire`. `balance` is running balance after this transaction. `reference` links to booking/reward ID. Append-only. |
| REWARD | Redeemable reward catalog | Admin-managed reward offerings. `name`, `description`, `point_cost` (int), `discount_type` (`topup_fixed`, `booking_percent`, `waiver`, `topup_bonus`), `discount_value` (Decimal). `max_discount` caps booking_percent. `min_topup` minimum for topup_fixed/topup_bonus. `active` boolean, `sort_order`. |
| REDEMPTION | Per-user reward redemptions | One row per user+reward claim. `voucher_code` unique (auto-generated). `status`: active/used/expired. `used_at`/`expires_at` timestamps. |

---

## Block 13 — Postcode directory

| Table | What it stores | Key notes |
|---|---|---|
| POSTCODE | Malaysian postcode -> district/state mapping | `postcode` unique string. `district` and `state` resolved from reference data. `active` boolean for soft disable. Used for geocoding fallback when lat/lng unavailable. |

---

## Infrastructure model

| Table | What it stores | Key notes |
|---|---|---|
| IDEMPOTENCY_FALLBACK | Idempotency key records when Redis is down | Written only when Redis is unavailable for idempotency enforcement. `ownerId` + `idempotencyKey` unique pair. `route` string, `responseStatus`/`responseBody` for reconciliation. Not a domain table — pure infrastructure. |

---

### UserAddress additions

| Field | Type | Description |
|-------|------|-------------|
| `postcode` | String? | Postal code, resolved from Google Maps Places Autocomplete on address creation |
| `district` | String? | District/suburb, resolved from Google Maps Places Autocomplete (maps from `locality`) |
| `state` | String? | State/administrative area level 1, resolved from Google Maps Places Autocomplete |

### QuotePreset additions

| Field | Type | Description |
|-------|------|-------------|
| — | — | QuotePreset model: per-user saved quote bundles (up to 10). Stores contactName, contactNumber, addressId, instruction, preferredTimeSlot. Used for quick quote re-submission. |

### Platform settings additions

| Key | Type | Description |
|-----|------|-------------|
| `condo_entry_note` | String | Note shown to customers when selecting "Condo" as property type in the quote form. Default: "If you live in a condo, please inform your management and guide the servicer on how to enter your building." |
| `dispatch_prompt_timeout_seconds` | `{ seconds: number }` | Seconds each servicer has to accept a dispatch prompt before rotation. Default 10. Admin-configurable in Financial Settings → Servicer Rules. |

---

## Post-V1 schema additions (planned)

| Addition | Depends on | Notes |
|---|---|---|
| `Review` model | `reviews` feature flag | Customer submits star rating + comment after job completion. `Servicer.rating` recalculated as rolling average. |
| `ServicerSchedule` activation | `servicer_schedule` feature flag | Schema exists, routes and logic needed. |
| `ServicerDocument` / KYC flow | `servicer_kyc` feature flag | Schema exists, upload + admin review routes exist. Needs manual review UI. |
| Payment gateway webhook handler | `payment_gateway` feature flag | `TRANSACTION` and `ESCROW` models are ready. Webhook routes under `/webhooks/...`. |
| Subcategory display | Admin decision | `Category.parentCategoryId` self-relation already in schema. Frontend category browse needs update. |

---

## Fintech models (P1-P4 — 2026-06-24)

### Wallet

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| ownerId | UUID | Polymorphic owner (user/servicer/platform). Unique with ownerType. |
| ownerType | String | `user`, `servicer`, or `platform` |
| currency | String | Always `MYR` |
| balance | Decimal(12,2) | Total balance |
| available | Decimal(12,2) | Available (not pending) |
| pending | Decimal(12,2) | Pending hold amount |

### BalanceCheckpoint

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| walletId | UUID | FK → Wallet |
| delta | Decimal(12,2) | Change amount (+ credit, − debit) |
| balanceBefore | Decimal(12,2) | Balance before this delta |
| balanceAfter | Decimal(12,2) | Balance after this delta |
| transactionId | UUID? | FK → Transaction (optional) |
| reason | String? | Human-readable reason |

### FeeRule

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Display name |
| description | String? | Optional description |
| type | String | `flat`, `percentage`, or `tiered` |
| rate | Decimal(6,4) | Rate value (flat amount or percentage as decimal) |
| minAmount | Decimal(10,2)? | Minimum fee floor |
| maxAmount | Decimal(10,2)? | Maximum fee ceiling |
| capAmount | Decimal(10,2)? | Absolute cap per transaction |
| appliesTo | String | `booking`, `withdrawal`, or `topup` |
| categoryId | UUID? | FK → Category (optional scope) |
| active | Boolean | Whether rule is active |
| priority | Int | Execution order (lowest first) |
| activeFrom | DateTime? | Optional start date |
| activeTo | DateTime? | Optional end date |

**Service:** `backend/src/services/fee-engine.service.ts` — CRUD + `computeFees(baseAmount, appliesTo, categoryId?)` engine. Falls back to legacy `platform_fee_rate` setting when no FeeRules configured. Wired into `credit.service.ts` (`computeFee`) and `booking.jobs.ts` (`handleEscrowRelease`).

### SavedPaymentMethod

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | UUID | FK → User |
| stripePaymentMethodId | String | Stripe PM id (unique per user) |
| brand | String | `visa`, `mastercard`, `amex` |
| last4 | String | Last 4 digits |
| expMonth | Int | Expiry month (1-12) |
| expYear | Int | Expiry year |
| isDefault | Boolean | Whether this is the default card |

**Routes:** `GET/POST/PUT/DELETE /user/me/payment-methods` in `user.routes.ts`. Service: `backend/src/services/saved-payment.service.ts`.

### Dispute

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| bookingId | UUID | FK → Booking |
| escrowId | UUID? | FK → Escrow (optional) |
| openedById | UUID | Who opened the dispute |
| openedBy | String | `customer`, `servicer`, or `admin` |
| reason | String | Reason text |
| status | String | `open`, `under_review`, `resolved`, `dismissed` |
| resolution | String? | `refund_customer`, `release_servicer`, `partial` (on resolve) |
| resolvedAt | DateTime? | When resolved/dismissed |

**Routes:** `POST /bookings/:id/dispute` (customer opens), `GET /admin/disputes`, `GET /admin/disputes/:id`, `PUT /admin/disputes/:id/review|resolve|dismiss`. Service: `backend/src/services/dispute.service.ts`. Escrow auto-release gated by open disputes in `booking.jobs.ts` (`handleEscrowRelease`).

### Escrow auto-release (P4)

The `escrow.release` BullMQ job now checks for open `Dispute` rows (status `open` or `under_review`) alongside existing open `Report` checks before releasing funds. Uses the FeeRule engine for platform fee calculation instead of the hardcoded `platform_fee_rate` setting.

---

## Update 2026-06-24 — Fintech P1-P5

- **P1:** Wallet + BalanceCheckpoint models, `wallet.service.ts` (getOrCreateWallet, adjustWalletBalance with atomic checkpoint recording + negative balance guard).
- **P2:** FeeRule model, `fee-engine.service.ts` (CRUD + computeFees engine with flat/percentage/tiered rules, appliesTo+categoryId scoping, fallback to legacy rate). Admin routes: `GET/POST/PUT/DELETE /admin/fee-rules`. Wired into `credit.service.ts` and `booking.jobs.ts` escrow release.
- **P3:** SavedPaymentMethod model, `saved-payment.service.ts` CRUD, routes: `GET/POST/PUT/DELETE /user/me/payment-methods`.
- **P4:** Dispute model, `dispute.service.ts` (open/review/resolve/dismiss), routes: `POST /bookings/:id/dispute`, admin dispute CRUD. Escrow auto-release dispute gating.
- **P5:** CSV export endpoint `GET /admin/financial/export?days=30` already existed.

---

## Update 2026-05-31 — Category taxonomy + fields
- **Category is now 2-level** via `parentCategoryId` self-relation: 7 parents (grouping) + 34 children (quotable services). Children carry `questionSchema`, `defaultPriceSuggestion`, `defaultEstimatedDurationMinutes`. Slugs/list in `category-taxonomy.md`.
- New `Category` fields in use: `published Boolean @default(false)`, `bannerUrl`, `cardColor`, `description`. Public `GET /categories` returns published only.
- Planned (pricing-model spec): `modifiers` per-option `durationMin`; per-category + overall travel-fee baselines; questionSchema `maxSelect`/`minSelect`; global `property_type` quote field; inspection flag + procedure.
