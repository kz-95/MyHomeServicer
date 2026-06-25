# SP-5 - Servicer Business Profile Restructure (Design Spec)

> **Status:** DESIGN - 2026-06-12
> **Parent initiative:** `2026-06-12-servicer-profile-initiative-findings.md`
> **Scope:** Restructure `/servicer/account` into a single Business Profile page,
> add a multi-contact model, surface dead/invisible fields, and lay data
> groundwork for SP-1 (popout gate) and SP-3 (service listings).

---

## 1. Problem

`/servicer/account` (`account.component.ts`, ~1770 lines) is one giant page with
11 stacked sections in scattered order. It mixes business and personal concerns,
hides several collected fields (no UI), carries dead fields, and offers only a
single point-of-contact when servicers need many. A servicer is also a customer
(same identity - linked `User` by shared email, `servicer.routes.ts:113`), so
personal account management belongs on the customer side, not duplicated here.

## 2. Goals

- One clean **Business Profile** page (business concerns only).
- Move personal management to the **customer account** (same `User` record).
- Replace the single contact with a **multi-contact CRUD** that listings must draw from.
- Surface invisible-but-collected fields; remove/replace dead ones.
- Group + order sections logically; rename for clarity.
- Produce data the dispatch gate (SP-1) and listings (SP-3) depend on.

## 3. Non-goals (deferred)

- `isOnline` manual availability toggle → **SP-2**.
- `maxAutoAccepts`, contact-prefill enforcement → **SP-3** (service listings, a large redesign of its own). (Service radius is now account-level and lives in this spec, §5.2.)
- KYC document upload UI → **SP-6**.
- Popout firing gate → **SP-1**.
- Calendar reroute (`/calendar/schedule` + `/calendar/workhours`) → **CAL** (separate, but its WorkHours target is fed by this spec's operating-hours sync).

## 4. Information architecture

`/servicer/account` → **single Business Profile page** (no tabs). Title swaps by
mode: "Business Profile Settings" (servicer) / "Profile Settings" (customer side
uses its existing "My account").

### Section order
1. Business Identity
2. Type of Services
3. Status
4. Business & Tax
5. Action PIN
6. Money (read-only)
7. Danger Zone

> **Withdrawal / bank details are NOT on this page** - they move to the deposit
> page (`/servicer/deposit`), alongside deposit/withdrawal money management.

---

## 5. Sections

### 5.1 Business Identity
- **Identity:** `businessName`, `logo` (presign upload), `bio`.
- **Business Contacts (new - CRUD, ≤10):** see §6.

### 5.2 Type of Services
- **Primary category** (`categoryId`): view + **change-request** (admin-reviewed,
  consistent with the existing `ServicerIdentityChangeRequest` pattern - a category
  change affects matching/dispatch, so it is not a silent direct edit).
- **Service areas** (`serviceAreas`): Google-Maps-autodetect input on top + Add
  button, chips below.
  ```
  [ Type a place… (Google Maps autodetect) ] [ Add ]
  [ Kuala Lumpur ✕ ] [ Petaling Jaya ✕ ]
  ```
- **Operating hours** (`operatingHours`): weekly editor (per-day open/close or
  "off"). See §7 for the calendar sync semantics.
- **Service radius** (`serviceRadiusKm`, NEW): one **account-level** radius (km)
  applied to all listings; used by the SP-3 auto-accept coverage check
  (`haversine(serviceArea coords, job) ≤ radius`). Requires serviceAreas to store
  Google-Places **coords** (fixes the `quote.service.ts:108` `|| true` bypass).

### 5.3 Status
- `kycStatus` rendered as **Reviewing / Approved / Rejected [reason]**.
- Pending identity change requests shown contextually (existing
  `identityChangeRequests` banner).

### 5.4 Business & Tax
- `entityType`, `businessRegistrationNumber`, `taxNumber`.
- `isCompany` - **auto-derived** from `entityType` on save (sole_proprietorship =
  false; partnership/enterprise/sdn_bhd = true). No separate input; shown read-only.
- **Tax config + calculator (merged panel):** `sstRegistered`, `sstNumber`,
  `serviceChargeRate`, `taxInclusive`. A live "try amount" field shows the
  breakdown (subtotal · service charge · SST · total) using current values.
  **Save persists the config defaults.**
- **Invoice settings:** `invoicePrefix`, `invoiceYearFormat`, `invoiceSeparator`,
  `invoicePadding`, `invoiceContent`, `invoiceSuffix` (+ live sample number).
- **Invoice preview (read-only):** renders a sample invoice using the current
  settings + tax config.

> **Bank / Withdrawal** (`bankName`, `bankAccount`) - **relocated to the deposit
> page** (`/servicer/deposit`), with deposit/withdrawal money management. Still
> critical: payout + quoting gate (`servicer-quote.service.ts:23` blocks quoting
> when missing) - the gate is unchanged, only the edit surface moves.

### 5.5 Action PIN
- Change / verify the servicer action PIN (`pinHash`). Business-side security.

### 5.6 Money (read-only)
- Platform fee breakdown, penalties summary.

### 5.7 Danger Zone
- Deactivate servicer account.

---

## 6. New model - `ServicerContact`

Table `business_contacts`:

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| servicerId | uuid FK → merchants | indexed |
| contactPerson | string | **required** |
| number | string? | phone |
| email | string? | |
| isPrimary | boolean | exactly one true per servicer |
| visibleToCustomer | boolean | per-contact visibility |
| createdAt / updatedAt | datetime | |

### Validation rules
- `contactPerson` required.
- **`number` OR `email` required** (at least one).
- **≥1 contact** per servicer (cannot delete the last one).
- **≤10 contacts** per servicer.
- **Exactly one `isPrimary`** - setting a new primary clears the old; the primary
  is the customer-facing fallback default and cannot be deleted while primary
  (reassign first).

### Replaces
- The global `showEmailPublic` / `showPhonePublic` toggles → **deprecated**.
  Public contact visibility is now per-contact via `visibleToCustomer`.

### Forward dependency (SP-3)
- Service listings may only **prefill a contact chosen from this list** - never
  free-type. Prevents an unauthorized/random contact slipping into a buried
  listing unnoticed. (Enforcement implemented in SP-3.)

### Migration
- For each existing servicer, seed **one** `ServicerContact` from current
  `name`/`phone`/`email`: `contactPerson = name`, `number = phone`,
  `email = (business contact email if any, else null)`, `isPrimary = true`,
  `visibleToCustomer = (showPhonePublic || showEmailPublic)`.
- Keep `Servicer.email` (login, unique, auth) untouched and read-only in UI.
- After backfill, `showEmailPublic` / `showPhonePublic` are no longer read; drop
  in a later cleanup migration once nothing references them.

---

## 7. Operating hours ↔ Calendar (one-way sync)

- Business Profile `operatingHours` = **base template**.
- Saving operating hours **seeds/updates** Calendar/WorkHours.
- Calendar/WorkHours **does NOT write back** to the business profile - it is the
  servicer's **per-week override** ("resting this week").
- **Service listings take no job during non-ticked hours in Calendar/WorkHours.**
- Backend cron `servicer.online_sync` (`servicer.jobs.ts:57`, every 5 min) already
  flips `isOnline` from `operatingHours` (empty = always-on; manual offline resets
  at the next window). This spec only adds the editor + the sync into WorkHours;
  the WorkHours route itself is **CAL**.

---

## 8. Customer account change

- Add **`backupEmail`** input to the customer account Profile section
  (`customer/pages/account.component.ts`). User-record field; recovery email.
- The servicer **Personal Details section is removed** - personal management lives
  here (emergency contact, name/phone, notifications, danger zone already exist).

## 9. Navigation cleanup

- Remove the redundant dashboard/stats block from the `/servicer/jobs/history` tab
  (`jobs.component.ts` history view).
- **Relocate bank/withdrawal edit** (`bankName`, `bankAccount`) from the account
  page to the deposit page (`/servicer/deposit`). UI move only - the update
  endpoint and the quoting gate are unchanged.

---

## 10. Backend changes summary

- **New:** `ServicerContact` model + migration + CRUD endpoints
  (`GET/POST/PATCH/DELETE /servicer/contacts`) with the §6 validation.
- **New:** category change-request endpoint (reuse identity-change review pipeline).
- **Change:** public servicer profile route renders `visibleToCustomer` contacts;
  stop reading `showEmailPublic`/`showPhonePublic`.
- **Change:** `isCompany` auto-derived on business-details save.
- **Change:** customer update endpoint accepts `backupEmail`.
- **Change:** operating-hours save also writes the WorkHours seed (coordinate with CAL).
- **Reuse:** tax calculator uses existing tax-config fields; invoice preview reuses
  `invoice.service` formatting (read-only render).

## 11. Out of scope / open

- `categoryId` change flow assumed **admin-reviewed**; confirm vs direct edit.
- Cleanup migration dropping `showEmailPublic`/`showPhonePublic` columns - separate,
  after the new contacts are live.

## 12. Testing

- Unit: `ServicerContact` validation (name required, number|email, ≥1, ≤10, single
  primary), `isCompany` derivation, tax calculator math, invoice number/preview.
- E2E: add/edit/delete contacts incl. boundary (delete last → blocked; 11th →
  blocked; reassign primary), operating-hours save → WorkHours reflects it,
  customer `backupEmail` round-trip.
- Migration: existing servicer backfills exactly one primary contact; login email
  preserved.
- Gates: `tsc --noEmit` (backend + frontend), `ng build` AOT.
