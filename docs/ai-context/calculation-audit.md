# Calculation & Money-Flow Audit

> CEO-requested full trace of every money calculation, how they flow, a worked
> sample, and which button triggers which step. Read-only audit (2026-05-27).
> **Verdict: the calculations are inconsistent — see §6 Findings.** Source of truth
> for the planned fixes; pairs with `ceo-overview.md` §12 (payment redesign).

---

## 1. The settings & rates (admin-configurable)

| Setting key | Default | Used by | Function |
|---|---|---|---|
| `platform_charge` | `{mode:'percent', value:5}` | escrow release, pay-later fee, cash fee, servicer earnings | `computeCharge()` (credit.service.ts) |
| `platform_fee_rate` | `{current_rate:0.05}` | **invoice only** | `getPlatformFeeRate()` (settings.service.ts) |
| `sst_rate` | `{rate:0.06}` | invoice tax | `getSstRate()` |
| `budget_ranges` | 4 brackets 50–350+ | quote form (customer budget) | `resolveBudgetRanges()` |
| `no_response_discount` | fixed RM15 / 14 days | unmatched-quote promo | — |
| `servicer_deposit_minimum` | RM100 | servicer deposit floor | — |
| `servicer_credit_withdrawal_minimum` | RM50 | withdrawal floor | — |

**⚠️ Two platform-fee settings exist** (`platform_charge` AND `platform_fee_rate`) read by
two different functions. This is the root of the biggest inconsistency (§6.1).

---

## 2. Every calculation, by stage

### Stage A — Listing price (servicer sets, per listing)
- `basePrice` (Decimal).
- `modifiers`: `optionPriceMap[questionKey][optionValue] = { price, notOffered }`.
- `taxMode` (`none|exclusive|inclusive`), `taxName`, `taxRate` — **per-listing `taxRate`
  is DEAD: the invoice uses the global `sst_rate`, never the listing's `taxRate`** (§6.5).

### Stage B — Proposal price (`computePrefill` + servicer edit)
```
optionTotal  = Σ entry.price  for each selected priced option (notOffered/null skipped)
defaultTotal = breakdown.length > 0 ? max(optionTotal, basePrice) : basePrice
proposedPrice = servicer-editable, defaults to defaultTotal, must be > 0
→ booking.price (the spine of every downstream number)
```
Note: option prices are **per-item, NOT additive on base**; base is the floor. Multi-select
sums across units. Easy to misconfigure (§6.6).

### Stage C — Customer budget (matching only, NOT the price)
- Customer picks a `budget_ranges` bracket (`budgetMin`/`budgetMax`).
- Frontend "estimate" = top-of-bracket + tip. **This is a guess, not the real price.**
- `pay_now` + bounded `budgetMax`: holds `budgetMax + tip` from customer credit at quote
  creation (removed by the §12 redesign → charge at acceptance).

### Stage D — Pay-now escrow hold (`selectProposal`, on accept)
```
if budgetMax was held:  refund excess = budgetMax − proposedPrice  → customer credit
else (open-ended):      deduct (proposedPrice + tip)               from customer credit
escrow.amount = proposedPrice ; escrow.tipAmount = tip
```

### Stage E — Escrow release (`escrow.release` job, 60s after done, no open report)
```
platformFee   = computeCharge(escrow.amount, platform_charge)   // % of RAW price
servicerPayout = escrow.amount − platformFee + tip
servicer credit += servicerPayout
```

### Stage F — Pay-later fee (`doneJob`, today)
```
platformFee = computeCharge(price, platform_charge)  → deducted from SERVICER credit
```
(Customer pays servicer off-platform; §12 redesign moves this to a real settlement step.)

### Stage G — Cash fee (`cashConfirm`)
```
platformFee = computeCharge(price, platform_charge)  → deducted from SERVICER credit
```

### Stage H — Invoice (`generateInvoice`, a SEPARATE calculation)
```
subtotal      = booking.price
promoDiscount = fixed → min(value, subtotal) ; percent → subtotal × value/100
discounted    = subtotal − promoDiscount
taxMode       = servicer's FIRST active listing's taxMode   // ⚠ not the booked service
  exclusive:  taxAmount = discounted × sst_rate
  inclusive:  taxAmount = discounted − discounted/(1+sst_rate)
platformFee   = discounted × platform_fee_rate              // ⚠ different fn + base than E/F/G
total (customer) = inclusive ? discounted + tip : discounted + taxAmount + tip
                                                            // total EXCLUDES platform fee
```

### Stage I — No-show refund (`noshow.detect`)
```
refund = escrow.amount + escrow.tipAmount → customer credit ; escrow → refunded
```

### Stage J — Penalty (`penalty.deduct`)
```
amount = rule.percentage ? round(booking.price × rule.amount)/100 : rule.amount
servicerDeposit.currentBalance −= amount
```

---

## 3. Flow chart

```
SERVICER sets listing            CUSTOMER requests quote
  basePrice + option prices         picks category + BUDGET bracket (+ tip if pay_now)
  + taxMode                                   │
        │                          [Request a quote] ──▶ QuoteRequest
        │                                     │   (pay_now+budgetMax: HOLD budgetMax+tip)
        ▼                                     ▼
  [Open quote] ─▶ computePrefill        broadcast to matching servicers
      defaultTotal=max(Σopt,base)             │
        │                                     │
  [Send proposal] ─▶ proposedPrice ───────────┤
        │                                     ▼
        │                         CUSTOMER [Accept proposal] ─▶ Booking.price = proposedPrice
        │                                     │
        │                         pay_now: escrow.amount=price, tip ; refund excess OR deduct price+tip
        │                                     ▼
                            SERVICER [Confirm] ▶ [Arrived] ▶ [Mark done] ─▶ completed
                                                  │
                          ┌───────────────────────┼───────────────────────────┐
                          ▼                        ▼                           ▼
                   pay_now: enqueue          pay_later: fee from         generateInvoice()
                   escrow.release(60s)       servicer NOW               subtotal−promo+SST+tip
                          │                        │                    fee = discounted×fee_rate
                   fee=computeCharge(amount)  cash: [Confirm cash]       (SEPARATE numbers)
                   payout=amount−fee+tip      fee from servicer
                          ▼
                   servicer credit += payout
                          │
                   (open report? hold + retry hourly)
                   (no-show? refund customer + penalty from servicer deposit)
```

**The fork at "Mark done" is the problem:** the **escrow/payout** branch (left) and the
**invoice** branch (right) compute the platform fee — and the customer-facing totals —
with different functions, different rates, and different bases. They are never reconciled.

---

## 4. Worked sample (exposes the breakage)

**Setup:** AC chemical wash, `basePrice` RM110; customer selects 2× "wall chemical" @ RM110
→ `optionTotal` 220, `defaultTotal` = max(220,110)=**220**. Servicer edits proposal down to
**RM200** → `booking.price = 200`. Customer applied promo **fixed RM20**. `taxMode=exclusive`,
`sst_rate=6%`, tip **RM10**, pay_now. `platform_charge=5%`, `platform_fee_rate=5%`.

| What | Calculation | Amount |
|---|---|---|
| **Escrow hold (customer charged)** | price + tip = 200 + 10 | **RM 210.00** |
| Escrow platform fee | computeCharge(200, 5%) | RM 10.00 |
| Servicer payout | 200 − 10 + 10 | RM 200.00 |
| **Invoice subtotal** | booking.price | RM 200.00 |
| Invoice promo discount | min(20, 200) | −RM 20.00 |
| Invoice discounted | 200 − 20 | RM 180.00 |
| Invoice SST (6% excl.) | 180 × 0.06 | RM 10.80 |
| Invoice platform fee | 180 × 5% | **RM 9.00** |
| **Invoice total (customer)** | 180 + 10.80 + 10 | **RM 200.80** |

**The three mismatches in one booking:**
1. Customer was **charged RM210.00** in escrow but the **invoice says RM200.80** — off by RM9.20.
2. **Promo RM20** shows on the invoice but was **never applied** to what the customer paid.
3. **SST RM10.80** shows on the invoice but was **never collected**.
4. Platform fee was **RM10.00** actually taken, but the invoice records **RM9.00**.

None of these reconcile. This is "the calculation is not right."

---

## 5. Button → effect map

| Button (who) | Triggers | Money effect |
|---|---|---|
| Request a quote (customer) | create QuoteRequest | pay_now+budgetMax: HOLD budgetMax+tip from credit |
| Open quote (servicer) | `computePrefill` | none (just shows default price) |
| Send proposal (servicer) | QuoteProposal.proposedPrice | none |
| Accept proposal (customer) | create Booking | pay_now: escrow hold (refund excess / deduct price+tip) |
| Confirm / Arrived (servicer) | status change | none |
| **Mark done** (servicer) | completed + `generateInvoice` | pay_now: enqueue escrow release; pay_later: fee from servicer deposit |
| Escrow release (auto 60s) | payout | fee (computeCharge) + payout to servicer; held if open report |
| Confirm cash (servicer) | settle cash | fee (computeCharge) from servicer; invoice paidAt |
| Add tip (customer, pay_later) | tip | tip added post-completion |
| No-show (auto) | cancel | refund escrow to customer + penalty from servicer deposit |
| Top up (customer) | credit += amount | wallet funding (demo today; Stripe per §12) |
| Withdraw (servicer) | deposit payout | min RM50 |

---

## 6. Findings (the "not right") — prioritized

1. **CRITICAL — two platform-fee systems disagree.** Escrow/pay-later/cash use
   `computeCharge` + `platform_charge` on the **raw price**; the invoice uses
   `getPlatformFeeRate` + `platform_fee_rate` on the **discounted price**. Different
   setting, different function, different base. The fee actually taken ≠ the fee on the
   invoice. **Fix: one fee function, one setting, one base.**
2. **CRITICAL — promo discount is invoice-only.** The escrow charges/pays the full price;
   the promo never moves money. Customer "sees" a discount they didn't get. (Check whether
   `promo.credit_payback` is meant to reconcile this — if so it's undocumented and untested
   here.) **Fix: apply promo to the charged amount, or remove it from the invoice.**
3. **CRITICAL — SST is invoice-only, never collected.** Exclusive SST is added to the
   invoice total but the customer is only charged `price + tip` in escrow. The platform/
   servicer never receives the SST. **Fix: include SST in the charged amount (and decide
   who remits it), or stop showing it.**
4. **HIGH — invoice tax mode is from an arbitrary listing.** `taxMode` = the servicer's
   oldest active listing, not the booked service. Mixed-tax servicers get wrong SST. **Fix:
   carry the booked service's tax mode onto the booking/invoice.**
5. **MEDIUM — per-listing `taxRate` is dead.** Servicers can set a tax % per listing but the
   invoice ignores it and uses the global `sst_rate`. **Fix: use it, or remove the field.**
6. **MEDIUM — option-pricing semantics are non-obvious.** `defaultTotal = max(Σoptions, base)`,
   options non-additive on base. Correct by design but easy to misconfigure; surface it
   clearly in the (redesigned §17) listing form.

**Canonical money definition — RESOLVED in `ceo-overview.md` §18:**
```
subtotal (Σ line items) − promo + service_charge + SST(last, if SST-registered) + tip
```
SST is conditional (servicer-declared registration), service charge is optional + servicer-set,
inclusive/exclusive is servicer-chosen and shown to the customer, and the invoice is itemized.
Make escrow AND invoice both derive the customer total from this single definition, with tests
asserting escrow-charged == invoice-total == fee-recorded for every path.

**Status: AUDIT COMPLETE — canonical model decided (§18); fixes land with the §12 payment MVP.**
