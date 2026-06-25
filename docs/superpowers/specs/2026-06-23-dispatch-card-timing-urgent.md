# Spec: Dispatch Card + Timing Rework + Urgent Same-Day Surcharge

Generated: 2026-06-23 · Branch: feat/sp3-dispatch-cards · Status: DRAFT
Demo beat: 2 (servicer accepts) - see `ignorethis/demo-presentation-flow.md`

> One spec, four linked streams: (A) dispatch-card visual redesign, (B) timing
> model rework, (C) urgent same-day surcharge, (D) customer quote images.
> Build top-down in the order at the end.

---

## Problem

The servicer's incoming-quote card (`frontend/src/app/servicer/pages/incoming-quotes.component.ts`)
is the accept/reject decision surface. Today it buries the three deciding facts -
Time, Place, Price - in small grey `.muted` text, shows no location, and the
response timer is a customer-chosen deadline decoupled from the actual job time.
Result: clunky, low-signal, and the urgency of a job is invisible.

---

## Current behaviour (verified in code)

- Timing is **customer-set, not admin-set**. `createQuote` takes `proposalDeadline`
  + `deadlineMode` ('fcfs' | 'fixed_time'); `servicerDeadline = proposalDeadline −
  15min` (`SERVICER_DEADLINE_OFFSET_MS`, the `quote_buffer_minutes` knob).
  `quote.service.ts:207-214`.
- `preferredDate` (job date) and the response timer are **decoupled** - the timer
  is unrelated to when the job actually happens.
- `timeSlot` is an enum bucket `morning | noon | afternoon | evening | night`
  (`schema.prisma:819`), NOT a clock range.
- `QuoteRequest` has `lat/lng`, `notes`, `serviceDetails`, address relation - but
  **no image/attachment field** (`schema.prisma:812-857`).
- `listIncomingQuotes` already returns `address, postcode, district, state, lat,
  lng, customerName, customerAvatarUrl, paymentMode, notes, descriptions[]`
  (`servicer-quote.service.ts:289-302`) - the frontend interface discards them.
- Servicer has `serviceAreas[]` + `serviceRadiusKm` but **no base coordinates**;
  `Postcode` table has no lat/lng. So exact distance has no data source.

---

## Stream A - Dispatch card visual redesign (frontend-only)

All data already arrives; this is interface + template + styles only.

**Card face (always visible):**
```
INCOMING JOB                          [ 02:14 left ]   <- now -> job time (Stream B)
+--------------------------------------------------+
|  Aircon Service · Standard cleaning      [ ▾ ]   |  category + details toggle
|  [Urgent]                                        |  only when same-day (Stream C)
|  💰 RM 95 - 150  · Pay now                       |  Price + paymentMode, bold accent
|  🕒 Tomorrow · Morning                           |  preferredDate + slot bucket
|  📍 SS2, Petaling Jaya                           |  district/state bold
|     12 Jln SS2/24                                |  address muted
|  [Residential]   [ View on map ↗ ]              |  propertyType chip + deep-link
|  [ Accept Job ]      [ Make offer ▾ ]            |
+--------------------------------------------------+
```
Order = **Price → Time → Place** (decided). Slot buckets kept; friendly label +
icon per bucket.

**Slot availability + duration + taken-status** - three decision aids on the card:
- **Slot load badge - informational, NOT a block** (next to time row): servicers can
  do 2-3 jobs in one session, so this is a capacity hint, not a lock. Show how many
  jobs the servicer already has in this `preferredDate` + `timeSlot` and their durations
  - "🟢 Free this slot" vs "🟡 1 job already this slot (~90 min)" - and let them decide.
  Backend adds `slotJobs: { count: number; totalDurationMin: number }` to
  `listIncomingQuotes` from the servicer's own bookings (confirmed/in_progress) on the
  same date+slot. Accept stays enabled regardless.
  - **Calendar coherence:** the same booking data drives both this badge AND the
    servicer calendar (`calendar.component.ts`, a demo headline - beats 2/5). Accepting
    a job must show on the calendar; the calendar is the servicer's full slot-load view.
    Wired in a separate plan (Plan 4), shared data source.
- **Estimated duration**: show "~90 min" on the card from the servicer's listing
  pre-fill (`computePrefill.estimatedDurationMin`) or the service `durationMin`, so the
  servicer sees the time commitment vs the slot length.
- **Already-taken status** (real-time): if the quote was matched/taken by another
  servicer, show "⚪ Taken by another servicer" and disable Accept, instead of letting
  them tap Accept and hit the "this job was taken" error. The feed already filters
  `status === 'open'`; add a live `quote.matched` socket refresh so a card flips to
  taken the moment someone else wins it.

**▾ details expander:** customer name + avatar · job answers (`descriptions[]`) ·
free-text notes · quote images (Stream D).

**Make offer ▾:** existing price/eta/message form, unchanged.

**View on map (deep-link, robust - no coords needed):**
- Google: `https://www.google.com/maps/search/?api=1&query=<encoded address>`
- Waze: `https://waze.com/ul?q=<encoded address>` (or `&ll=lat,lng` when present)
- `target="_blank" rel="noopener"`. On mobile the OS opens the native app.

**Tier 2 (optional, needs `lat/lng` seeded):** OpenStreetMap iframe mini-map in the
expander (no API key): `https://www.openstreetmap.org/export/embed.html?bbox=...&marker=lat,lng`.

**Deferred:** approximate distance (km) - no servicer base coordinates exist.

**Frontend tasks:** extend `IncomingQuote` interface with the discarded fields;
restructure template `incoming-quotes.component.ts:54-97`; add bucket-label map,
deep-link methods, urgent tag, expander; styles using existing `--color-*` tokens.

---

## Stream B - Timing model rework

Replace the customer-chosen deadline with one derived from the real job time.

**Job datetime** = `preferredDate` at the bucket's start hour:
| bucket | start hour (matches UI ranges in `frontend/.../constants/time-slots.ts`) |
|--------|------|
| morning | 09:00 |
| noon | 11:00 |
| afternoon | 13:00 |
| evening | 15:00 |
| night | 17:00 |

Use local MYT (UTC+8). **Fix the existing `getUTCDay` MYT bug** while here (TODO).

**Rules:**
1. **No past bookings** - reject create when computed job datetime ≤ now
   (minus a small grace, e.g. `quote_buffer_minutes`).
2. **Response timer** - `servicerDeadline = jobDatetime` (or `jobDatetime −
   quote_buffer_minutes`). The card countdown runs now → that. Near jobs get a
   short timer, far jobs a long one. Drop the separate customer `proposalDeadline`
   input; derive both deadlines from job time.
3. `deadlineMode` (fcfs/fixed_time) stays as a *matching* behaviour flag, but the
   deadline *value* is no longer customer-entered.

**Touch points:** `createQuote` (derive + validate), the quote expiry / no-response
BullMQ enqueues (`quote.service.ts:572-581` use the derived deadline), repost +
guest-quote paths, seed (`preferredDate`/timeslot already set), and the frontend
quote-form (remove deadline picker).

**Open:** existing open quotes in dev get reseeded, so no migration backfill needed
beyond `npm run db:reset`.

---

## Stream C - Urgent same-day surcharge

**Trigger:** job datetime is the **same calendar day** (MYT) as now → `isUrgent`.

**Fee:** **admin-configurable** platform setting (decided), e.g.
```json
"urgent_same_day_fee": { "amount": 150.00, "platform_share": 0.20 }
```
Default RM150, platform 20% (RM30) / servicer 80% (RM120). Read from settings, do
not hard-code.

**Customer warning:** before commit, the quote-form shows a hint -
"Same-day service adds a RM150 urgent fee" - when the chosen date+slot is today.
Customer must acknowledge.

**Money handling:**
- Surcharge added as a distinct line on the quote/booking total (separate from
  price + platform fee).
- Escrow held must include the surcharge (ties to Stream - Escrow integrity below).
- At settlement: servicer share (80%) flows in the servicer's escrow_release;
  platform share (20%) added to platform fee. Surface as its own line so the admin
  dashboard (beat 6) shows urgent-fee revenue distinctly.

**Schema:** add to `QuoteRequest` (and carry to `Booking`):
- `isUrgent Boolean @default(false)`
- `urgentFee Decimal? @db.Decimal(10,2)` (snapshot of fee at request time, so later
  settings changes don't rewrite history)

**Card:** `[Urgent]` tag (Stream A) when `isUrgent`.

---

## Stream D - Customer quote images (optional attachments)

Lets the customer attach photos to a quote (e.g. the broken unit); servicer sees
them in the card expander.

**Gated on the upload-pipeline fix** - the missing `PUT /api/files/local-upload/:id`
route (same bug blocking arrive/done photos, TODO #5). Fix once, reuse for both.

- **Schema:** `QuoteRequest.images String[] @default([])`.
- **Customer quote-form:** optional multi-image upload (cap N, e.g. 5).
- **Backend:** accept + store URLs on create; return `images[]` in
  `listIncomingQuotes`.
- **Servicer card:** thumbnails in the ▾ expander; click → lightbox (top-layer
  `<dialog>` per modal rule, never a fixed backdrop).

---

## Related - Escrow integrity (cross-ref, TODO #4)

The surcharge makes correct escrow math non-optional. When accepted/final price
(+ urgent fee) > escrow held, **block + require top-up** (no silent bypass). Derive
amounts server-side; unique constraint on `Transaction.stripePaymentIntentId`.
Verify the current bypass in code before fixing.

---

## Schema migration (one migration)

```
QuoteRequest:
  + isUrgent   Boolean  @default(false) @map("is_urgent")
  + urgentFee  Decimal? @db.Decimal(10,2) @map("urgent_fee")
  + images     String[] @default([]) @map("images")
Booking (carry-through):
  + isUrgent   Boolean  @default(false)
  + urgentFee  Decimal? @db.Decimal(10,2)
PlatformSetting:
  + seed key "urgent_same_day_fee" = { amount: 150, platform_share: 0.20 }
```
Per CLAUDE.md: stop server, `npm run db:migrate --name dispatch_urgent_images`,
commit the migration folder, restart.

---

## Build order (top-down)

1. **Schema migration** (Stream C + D fields, urgent setting seed).
2. **Stream B - timing model**: derive job datetime + deadline, bucket map, no-past
   validation, fix MYT bug, update enqueues + quote-form (drop deadline picker).
3. **Stream C - urgent**: detect same-day, snapshot fee from settings, warning hint,
   line-item + escrow split, admin-dashboard urgent-fee line.
4. **Stream A - card visual**: interface + template + deep-link + urgent tag +
   expander (name/avatar/answers/notes). Frontend-only, no new data.
5. **Upload fix + Stream D - quote images**: fix `local-upload` route, schema field
   already in step 1, form upload, card thumbnails. (Also unblocks arrive/done.)
6. **Escrow integrity** hardening (cross-ref TODO #4).

Each backend edit: `npx tsc --noEmit` (use `rtk proxy npx tsc`). Frontend: `ng build`.

---

## Open questions

- Bucket start-hours assume the customer wants service *at* the slot start; OK for
  V1. Precise time ranges deferred.
- `deadlineMode` fcfs vs fixed_time - keep both matching behaviours, or collapse to
  one now that the deadline is derived? (Lean: keep, low cost.)
- Urgent threshold = same calendar day. Should a job 2 hours from now but tomorrow
  00:30 count as urgent? V1: calendar-day only; revisit if it feels wrong in demo.
