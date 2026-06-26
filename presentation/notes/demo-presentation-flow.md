# MyServicer - Demo Presentation Flow

> One single-thread story for the live demo + slides. Customer → Servicer → Admin,
> following one quote from request to revenue. Pptx source.
> Date: 2026-06-23 · Branch: feat/sp3-dispatch-cards

---

## The thesis (opening slide)

MyServicer is a home-services marketplace. A customer asks for a job, the right
servicer is matched and accepts, the job gets done and paid, and the platform
earns a fee on every transaction. The demo shows that full loop end to end, in
one continuous story, across all three roles.

**One sentence:** "Watch one plumbing/aircon job travel from a customer's request
to money in the servicer's wallet and a fee on the platform's books - without
ever leaving the app."

---

## Cast (seeded demo accounts)

| Role | Account | Why this one |
|------|---------|-------------|
| Customer | `customer.fresh@demo.local` (Sarah Lim) | Clean slate - live quote submission, no clutter |
| Servicer | M9 Auntie Mei / AC Doctor (auto-accept ON) | Shows manual accept AND auto-accept |
| Admin | `admin@demo.local` (PIN 1234) | Queues + 30-day revenue chart populated |

Password for all: `Demo@2026`. Demo login gate PIN: `5201314`. Accounts reachable
from the gold Demo bar on every page.

---

## Flow diagram (ASCII - one slide)

```
   Customer asks  -->  Servicer accepts  -->  Customer pays  -->  Job done
        ^                  (dispatch card)       (escrow held)      (photos)
        |                                                              |
        +------------------- Admin earns fee  <----- escrow released --+
                            (revenue dashboard)

   Money is recorded LIVE: escrow_hold written at payment (beat 3),
   escrow_release + platform fee at completion (beat 5). The admin
   dashboard (beat 6) just reads the running ledger.
```

```
  BEAT 1  CUSTOMER  chat-assisted quote (demo button) --> submit
              |  quote broadcast
              v
  BEAT 2  SERVICER  *** dispatch card ***
          +-----------------------------------+
          | TIME   Today 2-4 PM      <bold>   |   (a) tap Accept Job
          | PLACE  SS2, PJ  ~3.2 km  [map]    |   (b) AUTO-ACCEPT in gates
          | PRICE  RM 95-150         <bold>   |
          +-----------------------------------+
              |  match back to customer
              v
  BEAT 3  CUSTOMER  accept --> pay deposit --> ESCROW HELD --> booking
              |       (if price > held: block + require top-up)
              v
  BEAT 4  SERVICER  arrive [photo] --> done [photo]
              |  complete --> escrow RELEASES to servicer
              v
  BEAT 5  SERVICER  earnings dashboard (7/30-day chart, paid today)
              |
              v
  BEAT 6  ADMIN  *** money is real ***
          revenue chart | platform fee per job | escrow held/released
          queues: category reqs | withdrawals | appeals
              |
              v
  BEAT 7  ADMIN (optional)  AI settings -> LLM key rotation
                            provider1 -> provider2 -> provider3
```

---

## The flow - 7 beats

### Beat 1 - Customer asks (chat-assisted quote)
**Login:** customer.fresh
**Show:** Open app → start a quote via the **chat-assisted flow** (demo button).
The AI assistant helps shape the request (category, details), then submits.
**Say:** "The customer doesn't fill a cold form. An assistant walks them through
it in plain language and produces a structured quote."
**Audience takeaway:** low-friction intake, AI as the front door.

### Beat 2 - Servicer decides (the dispatch card) ★ centerpiece
**Login:** M9 (servicer portal)
**Show:** Incoming quote arrives as a **dispatch card**. The three things that
decide a yes/no are loud and first: **TIME · PLACE · PRICE**. A **map** lets the
servicer check the location before committing. Then either they accept, or for an
auto-accept-enabled service the system **auto-accepts** within the configured gates.
**Say:** "A servicer accepts or rejects in seconds. The card leads with the only
three things that matter - when, where, how much - and a map so they know the trip
before they say yes. For routine jobs inside their rules, the platform accepts for
them automatically."
**Audience takeaway:** this is the product's edge - fast, confident dispatch.

### Beat 3 - Customer confirms + pays
**Login:** back to customer.fresh
**Show:** Customer sees the match / proposal → accepts → pays the deposit.
**Say:** "Money is committed up front into escrow. Both sides are protected."
**Audience takeaway:** real transaction, real commitment.

### Beat 4 - Servicer does the job
**Login:** M9 (or M8 in-progress booking)
**Show:** Job lifecycle - **arrive** (photo) → **done** (photo).
**Say:** "Proof of work at each step. Arrival and completion are photo-stamped."
**Audience takeaway:** trust and accountability built into the job, not bolted on.

### Beat 5 - Servicer gets paid (earnings)
**Login:** M9
**Show:** Earnings **dashboard** - 7/30-day bar chart, earnings today, completed
jobs. Escrow releases to the servicer on completion.
**Say:** "Completion releases escrow. The servicer sees exactly what they earned,
day by day."
**Audience takeaway:** the provider side is a real business dashboard.

### Beat 6 - Admin oversees (the money is real) ★ second centerpiece
**Login:** admin (PIN 1234)
**Show:** **Financial dashboard** - 30-day platform revenue chart, platform-fee
take per booking, escrow position. Then the operational queues: category requests,
withdrawal approvals, penalty appeals.
**Say:** "Every job we just watched contributed a platform fee. The admin sees real
revenue, real fees, real escrow - and runs the marketplace from one place."
**Audience takeaway:** this is a platform with a business model, not a toy. The
numbers are derived from actual transactions, not hard-coded.

### Beat 7 - Backstage (AI resilience) - optional closer
**Login:** admin → AI / API settings
**Show:** **LLM API-key rotation** - multiple providers, priority failover, masked
keys. This is what powers the Beat 1 assistant.
**Say:** "The assistant never goes down - if one AI provider rate-limits, it fails
over to the next automatically."
**Audience takeaway:** production-grade resilience under the hood.

---

## Slide outline (pptx skeleton)

1. Title + thesis sentence
2. The problem (booking home services today is slow / opaque)
3. The loop diagram (Customer → Servicer → Admin, one arrow per beat)
4. Beat 1 screenshot - chat quote
5. Beat 2 screenshot - dispatch card (TIME/PLACE/PRICE + map) ★
6. Beat 3 screenshot - accept + pay
7. Beat 4 screenshot - arrive/done photos
8. Beat 5 screenshot - servicer earnings
9. Beat 6 screenshot - admin financial dashboard ★
10. Beat 7 screenshot - LLM key rotation (optional)
11. Tech stack one-liner (Angular + Express + Prisma + Postgres + Stripe-style escrow)
12. Close: the full loop, one app, real money

---

## What must work for this flow to hold (build-readiness - not for slides)

Ranked by demo risk. These are the only things that block the story above.

1. **Dispatch card UI** (Beat 2) - TIME/PLACE/PRICE big + bold (currently all `.muted`
   small grey). Add job location (address/area, missing today). Component:
   `frontend/src/app/servicer/pages/incoming-quotes.component.ts`.
2. **Map + distance on card** (Beat 2) - approximate distance (km) badge so the
   servicer sees how far; click → rough embedded map pin; "Navigate" button opens
   Waze / Google Maps in a NEW TAB (phone opens native app directly).
3. **Auto-accept wiring** (Beat 2) - gates evaluated in the live flow; MYT day bug.
4. **Escrow integrity** (Beat 3/6) - write `escrow_hold` at payment time; derive
   amount server-side; when accepted/final price > escrow held, BLOCK + require
   top-up (no silent bypass); unique constraint on `Transaction.stripePaymentIntentId`.
5. **Arrive/done photo upload** (Beat 4) - missing local-upload route blocks job
   completion.
6. **Chat-assisted quote** (Beat 1) - smooth submission.
7. **Admin financial dashboard** (Beat 6) - revenue/fee/escrow numbers derived from
   the real transaction ledger (not stubbed).
8. **LLM key rotation** (Beat 7, optional) - provider failover.

**Stretch (after demo holds):** full fintech P1-P5 (Wallet model, Fee engine,
payment methods, escrow automation, reporting).

**Deferred (off the demo thread):** customer rewards, route nesting/redesign,
banned-accounts, customer search/filter, deposit/credit promotions, forgot-password,
settings refinements.
