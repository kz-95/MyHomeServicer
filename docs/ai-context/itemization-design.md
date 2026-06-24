# Itemization Design — Service Listing vs Line Items

> **Status:** Design doc, deferred execution  
> **Written:** 2026-06-24  
> **Depends on:** SP3 listing wizard + SP4 dispatch landing first  

---

## 1. Problem Statement

The current system has two separate concepts that overlap:

| Concept | Where it lives | What it represents |
|---|---|---|
| **Service Listing** (`ServicerService`) | Servicer catalog | What the servicer *offers* — title, base price, modules, pricing rules |
| **Line Items** (`Booking.lineItems`, JSON) | Each booking | What the customer *actually pays for* — itemised breakdown at booking creation |

Today, `Booking.lineItems` is a free-form JSON array populated from the quote details + urgent fee. It is not structurally linked to the `ServicerService` or its `PricingModule` references. This works for the demo but needs alignment for production:

- **If a servicer changes a listing after a booking is created**, the booking line items should NOT retroactively change.
- **Admin/CS needs to answer "what did the customer pay for?"** looking only at the booking, without re-computing from the current listing state.
- **Refunds and disputes** need a stable snapshot of the order at the time of payment.

---

## 2. Current State (2026-06-24)

### 2.1 ServicerService (listing catalog)

```prisma
model ServicerService {
  id              String    // PK
  servicerId      String
  categoryId      String
  title           String
  description     String?
  basePrice       Decimal   // RM, fixed or starting price
  priceType       PriceType // fixed | per_hour | per_item | free
  moduleRefs      Json      // array of PricingModule IDs this listing uses
  serviceChargeRate Decimal? // e.g. 0.10 = 10% platform service charge
  taxMode         TaxMode   // none | sst | gst
  taxRate         Decimal?
  modifiers       Json?     // per-module pricing overrides
  estimatedDurationMinutes Int
  // ... listingMode, autoAccept, etc.
}
```

### 2.2 PricingModule (reusable module library)

```prisma
model PricingModule {
  id           String
  servicerId   String
  label        String          // e.g. "Wall Unit — Chemical Cleaning"
  defaultPrice Decimal
  taxable      Boolean
  // ...
}
```

### 2.3 Booking.lineItems (JSON)

```jsonc
[
  { "label": "Wall Unit — Chemical Cleaning", "amount": 110, "qty": 2 },
  { "label": "Ceiling Cassette — General", "amount": 150, "qty": 1 },
  { "label": "Urgent (same-day)", "amount": 150, "qty": 1 },
  { "label": "Platform Service Charge", "amount": 12, "qty": 1 }
]
```

Built in `booking.service.ts` at `createBooking()` from:
- `servicerService.basePrice`
- `quoteRequest.serviceDetails` (question-answer → module selection)
- `servicerService.modifiers` (per-module overrides)
- `isUrgent` + `urgentFee`

### 2.4 Gap: no snapshot reference

The flat JSON stores labels and amounts but does **not** reference:
- Which `ServicerService.id` it was built from
- Which `PricingModule.id` each line came from
- Whether the line item was from the quote, an add-on, urgent, or fee

This means:
- **Admin can't reconstruct** what happened from the booking alone
- **A servicer editing a listing** has no impact on existing bookings (correct behavior), but there's no audit trail linking the booking back to the listing version that was active at creation time.

---

## 3. Proposed Design

### 3.1 LineItem normalized model (future migration)

When itemization is built (post-SP3+SP4), add a proper `LineItem` model:

```prisma
model LineItem {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  bookingId         String   @map("booking_id") @db.Uuid
  label             String                       // human-readable
  amount            Decimal  @db.Decimal(10, 2)  // total for this line
  quantity          Int      @default(1)
  unitPrice         Decimal? @db.Decimal(10, 2)  // per-unit price (nullable for fees)
  type              LineItemType                 // listing | module | urgent | fee | addon
  sourceServiceId   String?  @map("source_service_id") @db.Uuid   // → ServicerService.id
  sourceModuleId    String?  @map("source_module_id") @db.Uuid    // → PricingModule.id
  taxAmount         Decimal? @db.Decimal(10, 2)
  taxRate           Decimal? @db.Decimal(5, 2)

  booking Booking @relation(fields: [bookingId], references: [id])

  @@index([bookingId])
  @@map("line_items")
}

enum LineItemType {
  listing   // base price from the source service listing
  module    // per-module pricing breakdown
  urgent    // urgent same-day surcharge
  fee       // platform fee, service charge, SST, travel fee
  addon     // customer-selected optional add-ons
}
```

### 3.2 Booking snapshot reference

Add to `Booking`:

```
servicerServiceSnapshot  Json?   // frozen copy of ServicerService fields at booking time
servicerServiceId        String?
```

The JSON snapshot gives a human-readable audit trail without requiring JOINs. The FK gives programmatic traceability.

### 3.3 When a listing changes after booking

- **Rule:** Existing `Booking.lineItems` / `LineItem` records are NEVER updated.
- **Only impact:** New quotes created after the listing change get the new pricing.
- **Servicer wants to change price mid-booking:** Must cancel and re-create (or add an add-on line item).

---

## 4. Build Order

| Phase | What | Prerequisites |
|---|---|---|
| **P0 (today)** | Keep `Booking.lineItems` as JSON, add `sourceServiceId` and `sourceListingSnapshot` JSON to `Booking` for audit trail | Schema migration only |
| **P1 (post-SP3+SP4)** | Normalized `LineItem` model, migration, backfill from existing JSON | P0 |
| **P2 (later)** | Line-item-level UI: expandable breakdown on booking detail, admin reconciliation view, dispute flag per line item | P1 |
| **P3 (stretch)** | Customer-side cost calculator that previews line items before quote submission (uses current listing + modules) | P1 |

---

## 5. Open Questions

1. **Should `lineItems` be queryable by `moduleId`?** (e.g. "how many wall-unit-chemical bookings this month?") — adds a JOIN but useful for analytics. Answer: yes, add the FK in P1.

2. **Tax per line item or per booking?** Malaysian SST is per transaction, but line-item-level granularity supports GST-style jurisdictions. Answer: store `taxAmount` at line-item level, sum for booking total.

3. **Discount / promo codes at line-item level?** Vouchers currently apply at payment level. If discounts ever apply per-line, add `discountAmount` and `promoCode` to `LineItem`.
