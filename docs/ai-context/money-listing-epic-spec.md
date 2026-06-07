# Money & Listing Epic — Consolidated Spec

> One data-model-first spec for the interlocking epic: §12 payment, §17 listing form,
> §18 tax/itemized, §19 pricing modules, and the `calculation-audit.md` fixes. These share
> tables and a single canonical-total definition — build together, money-critical, with
> tests. Source of truth: `ceo-overview.md` §12/§17/§18/§19 + `calculation-audit.md`.
> Status: SPEC COMPLETE (2026-05-27) — all 6 sub-decisions resolved (§7). Build-ready.

---

## 1. Goal

Make money correct and listings modular, in one coherent build:
- One **canonical customer total**; escrow charge == invoice total == fee recorded.
- **Pay-now / pay-later** timings, charge at acceptance, Stripe gateway (MVP).
- **Servicer tax config** (conditional SST, optional service charge, inclusive/exclusive).
- **Reusable pricing modules** → **itemized line items** on proposal/booking/invoice.
- **Sectioned listing form** that composes modules.

Out of scope (separate, parallel): notification overlay (done), avatars, UI/UX P1/P2,
admin thumbnails (post-MVP), customer photos (post-MVP), stale-link fix, time-slot source.

---

## 2. Data model

### 2.1 Servicer (add fields)
```
entityType         enum(sole_proprietorship|partnership|enterprise|sdn_bhd)
sstRegistered      bool   default false      // not every business has SST
sstNumber          string?                    // when registered
serviceChargeRate  Decimal default 0          // account default %, e.g. 5 or 10
taxInclusive       bool   default false       // quoted prices already include sc+sst
```
Changing the legal-identity block (`entityType`, `businessRegistrationNumber`, `taxNumber`,
`sstNumber`) → goes through `ServicerIdentityChangeRequest` review (§5). Other fields
(serviceChargeRate, taxInclusive, bio, logo, service areas) save directly.

### 2.2 PricingModule (new — servicer-owned reusable library, §19)
```
id, servicerId
label             string                      // "Running fee", "Service", "Copper pipe"
defaultPrice      Decimal
taxable           bool default true           // subject to SST
serviceChargeable bool default true           // subject to service charge
categoryId        string?                     // optional: scope to a category
active            bool default true
```

### 2.3 ServicerService (listing) changes
```
+ moduleRefs       Json   // [{ moduleId, priceOverride? }] — the listing's default modules
+ serviceChargeRate Decimal?  // null = inherit account default
+ taxInclusive      bool?     // null = inherit account
+ sstApplies        bool?     // null = inherit account (servicer.sstRegistered)
```
- `basePrice` stays as a floor/fallback when a listing has no modules.
- **`modifiers` (category-question option-price map) is superseded** by modules. Migration:
  convert each priced option into a PricingModule (label = option label, price = option price);
  `computePrefill` then maps customer answers → suggested modules. (OPEN: migrate vs keep both.)

### 2.4 Line items (snapshot — the spine of §18)
Carried as a **JSON snapshot** (frozen) on proposal → booking → invoice:
```
lineItems: [{ label, amount, taxable, serviceChargeable }]
```
- On **proposal**: servicer composes from the listing's modules (pre-filled) + can add custom
  lines; can adjust amounts. `proposedPrice` becomes a **derived** Σ lineItems.amount.
- On **booking** (at acceptance) and **invoice** (at done): copy the snapshot so later edits to
  the module library never change historical bookings/invoices.

### 2.5 Booking changes (§12)
```
paymentTiming    enum(pay_now|pay_later)      // replaces paymentMode
settlementMethod enum(gateway|credit|cash)?   // chosen at Bill step / settlement
lineItems        Json                          // snapshot
price            Decimal                       // = Σ lineItems (kept for compat/derived)
```

### 2.6 Invoice changes (§18, calc-audit)
```
lineItems          Json
subtotal           Decimal   // Σ lineItems
promoDiscount      Decimal
serviceChargeRate  Decimal
serviceChargeAmount Decimal
sstApplies         bool
taxInclusive       bool
taxRate            Decimal
taxAmount          Decimal
tipAmount          Decimal
total              Decimal   // canonical customer total (== escrow charge)
platformFee        Decimal   // unified fee (== fee actually taken)
```
Tax config resolved from the **booked service + servicer** (NOT an arbitrary listing).

### 2.7 ServicerIdentityChangeRequest (new — admin queue, §5/§17)
Pattern mirrors `CategoryRequest`:
```
id, servicerId, status(pending|approved|rejected)
proposed: { entityType?, businessRegistrationNumber?, taxNumber?, sstNumber? }
reviewedBy?, reviewedAt?, createdAt
```

---

## 3. Canonical total — ONE function (fixes calc-audit §6.1–6.3)

Both escrow charge and invoice derive the customer total from this single function.

```
computeTotal(lineItems, promoDiscount, servicerTaxConfig, tip):
  subtotal       = Σ lineItems.amount
  afterPromo     = subtotal − promoDiscount
  scBase         = Σ (li.amount for serviceChargeable lines), promo applied proportionally
  serviceCharge  = serviceChargeRate > 0 ? round2(scBase × serviceChargeRate) : 0
  sstBase        = Σ (li.amount for taxable lines) adjusted for promo + serviceCharge
  sst            = sstRegistered ? round2(sstBase × sstRate) : 0     // SST LAST, conditional
  total          = afterPromo + serviceCharge + sst + tip
  // taxInclusive: line amounts already contain sc+sst → EXTRACT for display,
  //               total = afterPromo + tip (sc/sst are portions within). Spec both paths.
```

### Unified platform fee (replaces the two systems)
```
platformFee = round2(afterPromo × platformFeeRate)   // ONE setting; base = afterPromo
```
- Base = `afterPromo` only (the discounted service value). **Service charge is excluded** —
  it is entirely the servicer's (decision #1). SST and tip also excluded.
- Servicer payout = `total − platformFee`. Platform keeps `platformFee`. **SST + service
  charge + tip flow to the servicer**; the servicer remits SST to LHDN (decision #5). Same
  fee for pay_now (escrow release), pay_later, and cash.
- **Kill `platform_charge` vs `platform_fee_rate` duality** — one setting, one function.

---

## 4. Money flow (canonical)

```
[Listing] basePrice + module refs + tax overrides
   │
[Open quote] pre-fill line items from listing modules + customer answers
   │
[Send proposal] servicer adjusts/add line items → proposedPrice = Σ lineItems
   │
[Accept proposal] Booking: snapshot lineItems; total = computeTotal(...)
   │   pay_now  → charge `total` (credit or Stripe) → escrow.amount = total
   │   pay_later→ no charge
[Confirm]→[Arrived]→[Mark done] completed; Invoice: same snapshot, total = computeTotal(...)
   │
   ├ pay_now : escrow release → payout = total − platformFee → servicer; platform keeps fee
   ├ pay_later: settle (credit/cash/Stripe) → payout − fee; soft-enforce if unpaid
   └ cash    : servicer confirms; fee from servicer deposit
INVARIANT (tested): escrow.amount == invoice.total == charged amount;
                    platformFee recorded == platformFee computed.
```

---

## 5. Admin review queue (§17)

`ServicerIdentityChangeRequest` + a new **"Account changes"** tab in
`admin/pages/queues.component.ts` (alongside withdrawals/appeals/category). Approve → apply
to Servicer; reject → discard. Servicer may resubmit.

---

## 6. Build order (ordered; tests at each step)

1. **Schema** — all additions above; `db push` (follow CLAUDE.md DLL-lock protocol); update
   `schema-notes.md`.
2. **Canonical total + unified fee** functions (one module) + unit tests (every combo:
   promo×{none}, service charge {0/5/10}, SST {reg/not}, inclusive/exclusive, tip).
3. **Pricing modules** CRUD (servicer library) + listing module composition.
4. **Proposal line items** — compose/adjust; proposedPrice derived; snapshot.
5. **Accept** — booking snapshot; pay_now charges `total` → escrow; pay_later no charge.
6. **Done / settle / release** — payout = total − fee; one fee path; pay-later settlement
   endpoint + UI; cash fee from deposit; soft-enforcement.
7. **Invoice** — itemized, canonical total, tax from booked service. Assert == escrow.
8. **Stripe** — top-up, pay_now source, pay_later settlement, webhooks + idempotency.
9. **Servicer business-details form** (§17) incl tax config; identity-change review queue.
10. **Listing form** (§17 sectioned) composing modules.
11. **Quote form** (§13 4-step Bill) — choose timing/method, show canonical estimate.
12. Fix stale `/servicer` links.

**Gate:** integration tests asserting `escrow-charged == invoice-total == fee-recorded` for
pay_now / pay_later / cash × {promo on/off} × {SST reg/not} × {inclusive/exclusive}.

---

## 7. Sub-decisions — RESOLVED 2026-05-27
1. **Platform fee base = `afterPromo` only.** Service charge is entirely the servicer's — no
   platform cut on it; SST + tip also excluded.
2. **Migrate `modifiers` → modules.** One pricing mechanism; one-time migration of priced
   category-question options into PricingModules.
3. **Line items = JSON snapshot** on proposal/booking/invoice (frozen, immutable).
4. **`taxInclusive` includes service charge + SST** — both extracted and shown on the receipt,
   nothing added on top (listed price = what the customer pays).
5. **Servicer remits SST.** Only SST-registered servicers charge it; the SST flows to that
   servicer to remit to LHDN. Platform records it only.
6. **Promo first, then service charge.** Service charge (and SST) compute on the post-promo
   amount.

**Status: SPEC COMPLETE — all decisions resolved; build in the §6 order with the §6 test gate.**
