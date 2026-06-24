# Seed data plan

> This document covers everything that gets seeded into the database for development and demo. Includes the magic seed commands at the bottom.

---

## Goals

1. Populate the database with realistic data for development and demo
2. Show the full servicer lifecycle (every state from registration to completed jobs with invoices and revenue)
3. One clean customer happy-path for the live demo
4. Hidden penalty scenarios available on-demand if audience asks
5. **Every demo account has seeded revenue history** so dashboard charts show data on first boot
6. All seeded data fully removable via a single command
7. Production safety — seed script refuses to run with NODE_ENV=production

---

## Demo accounts

All seeded accounts share one password: `Demo@2026`

These accounts have a special flag `is_demo: true` on the USER table. The auth middleware bypasses password complexity validation for demo accounts but **production deployments block demo logins entirely** via an `NODE_ENV=production` check.

### Auth middleware logic

```javascript
if (!user.isDemo) {
  validatePasswordStrength(password)
}
if (process.env.NODE_ENV === 'production' && user.isDemo) {
  throw new Error('Demo accounts disabled in production')
}
```

---

## Accounts overview

| Login | Role | Purpose |
|---|---|---|
| `customer.fresh@demo.local` | Customer | Brand new account, no history. Used to demo the live quote submission flow. |
| `customer.active@demo.local` | Customer | Has an open quote with 3 proposals waiting. Used to demo proposal selection. |
| `customer.loyal@demo.local` | Customer | Has 4 completed bookings with invoices, saved addresses, chat history, ready for reorder demo. |
| `admin@demo.local` | Admin | Sees the category requests queue, withdrawal queue, reports, settings panel, 30-day platform revenue chart. Action PIN: `1234` |
| `servicer.{1..105}@demo.local` | Servicer | 105 servicers — 3 per category across 32 child categories + 9 under Painting/Moving/Gardening. Demo-bar dropdown lists them sorted A→Z with scrollbar. |

All accounts use password `Demo@2026`. Two PINs (see security-notes.md): the **action PIN** `1234` (per-account; sensitive admin saves + the Admin Accounts/Review Queues view-guards), and the **demo login gate** `5201314` (fixed shared speedbump shown to demo accounts on portal entry; real `isDemo=false` accounts are not gated).

---

## Demo accounts in the UI

All demo accounts are accessible from two places:

1. **Top navbar (gold "Demo" bar)** on every portal page — dropdown menus for Customers, Servicers (grouped by category), and Admin
2. **Login page** — full account listing organized by category with quick-fill buttons (fills email + password `Demo@2026`)

These replace the original 4-chip row on the login page.

---

## Categories (34 child categories under 7 parent groups)

| Parent | Slugs (child) |
|--------|--------------|
| Cleaning Service | home-cleaning, sofa-mattress-cleaning, carpet-cleaning, curtain-cleaning |
| Events & Weddings | event-planner, catering |
| Home Improvement | professional-organizer, aircond-installer, carpenter, renovation, interior-design, door-gate, roof, **painting** |
| Home Maintenance | aircond-servicer, plumber, electrical-wiring, **moving**, **gardening** |
| Appliance Repair | washing-machine-repair, refrigerator-repair, tv-repair, oven-repair, water-heater-repair, ceiling-fan-repair, aircond-repair |
| Training & Classes | art-class, language-class, music-class, home-tutoring, cooking-class, gym-trainer, 3d-modeling-class |
| Tech & IT | alarm-cctv |

> **2026-06-09 — Painting, Moving, Gardening added** (own question schemas + budget ranges
> + card images at `assets/Images/HomeImprovement_Painting01.png`,
> `HomeMaintenance_Moving01.png`, `HomeMaintenance_Gardening01.png`). They fix the chat
> mis-match where repaint→Renovation / movers→Carpenter / lawn→Renovation forced irrelevant
> questions. **No servicers seeded under them yet** — browse shows the category but with 0
> providers until servicers are added. Non-essential questions are `required: false` (skippable).

### Additional seeded data

- **Category question schema** — every child category seeds its own `question_schema`; priced questions (plumber, home-cleaning, sofa-mattress, carpet, curtain, aircond-installer, aircond-servicer) have modifier pricing on servicer services
- **`budget_ranges` platform setting** — all 34 categories have 4 bracket budget ranges
- **`platform_fee_rate`** — seeded at 20% current, with 8% advertised discount
- **Quote presets** — demo customers get saved `QuotePreset` rows
- **`servicer_deposit`** — each servicer seeded with RM 500 deposited + RM 100 welcome bonus credit

> The seed is **idempotent** — `seed.ts` wipes all tables first (shared `clear.ts`), so it is safe to re-run.

---

## Servicer breakdown (105 servicers — 3 per category across 32 categories + 9 for Painting/Moving/Gardening)

### Set A (M1-M36) — first servicer per category

| Ref | Business Name | Category Slug | Completed | In-flight scenarios |
|-----|--------------|---------------|-----------|-------------------|
| M1 | Ahmad Plumbing Services | plumber | 15 bulk | Open quote + proposal, completed for invoice report |
| M2 | CoolBreeze AC Service | aircond-servicer | 15 bulk | In-progress booking, open quote |
| M3 | Volt Masters Electrical | electrical-wiring | 15 bulk | Active noshow penalty (RM50 deducted) |
| M4 | Sparkle Home Cleaning | home-cleaning | 15 bulk | Pending-confirm, completed cash |
| M5 | FreshCare Sofa & Mattress | sofa-mattress-cleaning | 12 bulk | — |
| M6 | PureClean Carpet Care | carpet-cleaning | 12 bulk | Extra broadcast pending |
| M7 | DrapeFresh Curtain Care | curtain-cleaning | 12 bulk | — |
| M8 | Bliss Wedding & Events | event-planner | 10 bulk | — |
| M9 | Auntie Mei Catering | catering | 15 bulk | Open quote, reversed appeal |
| M10 | Space Harmony Organizer | professional-organizer | 12 bulk | — |
| M11 | AC Pro Installers | aircond-installer | 12 bulk | — |
| M12 | Precision Woodworks | carpenter | 12 bulk | — |
| M13 | BuildRight Renovation Sdn Bhd | renovation | 10 bulk | Pending withdrawal |
| M14 | Studio Aria Interior Design Sdn Bhd | interior-design | 10 bulk | Pending withdrawal |
| M15 | AutoGate Solutions | door-gate | 12 bulk | Pending withdrawal |
| M16 | TopGuard Roofing | roof | 10 bulk | Extra broadcast pending |
| M17 | WasherDoc Repair | washing-machine-repair | 12 bulk | Appeal filed |
| M18 | ChillFix Refrigeration | refrigerator-repair | 12 bulk | — |
| M19 | ScreenFix TV Repair | tv-repair | 12 bulk | Extra broadcast pending |
| M20 | HeatWave Oven Repair | oven-repair | 12 bulk | — |
| M21 | HydroHeat Services | water-heater-repair | 12 bulk | — |
| M22 | FanFix Services | ceiling-fan-repair | 12 bulk | Appeal filed |
| M23 | AC Medic | aircond-repair | 12 bulk | Pending appeal |
| M24 | Creative Canvas Studio | art-class | 12 bulk | Extra broadcast pending |
| M25 | Polyglot Language Academy | language-class | 12 bulk | — |
| M26 | Melody Music Studio | music-class | 12 bulk | — |
| M27 | BrightMinds Tutoring | home-tutoring | 12 bulk | — |
| M28 | Chef's Table Cooking Studio | cooking-class | 12 bulk | — |
| M29 | FitForge Personal Training | gym-trainer | 12 bulk | — |
| M30 | FusionCraft Studio (Fusion 360) | 3d-modeling-class | 12 bulk | — |
| M31 | SketchBuild Studio (SketchUp) | 3d-modeling-class | 12 bulk | — |
| M32 | BlendForge Studio (Blender) | 3d-modeling-class | **50 bulk** | Category request, withdrawal |
| M33 | MayaMotion Studio (Maya) | 3d-modeling-class | 12 bulk | — |
| M34 | MaxDesign Studio (3ds Max) | 3d-modeling-class | 12 bulk | — |
| M35 | ZBrushArt Studio (ZBrush) | 3d-modeling-class | 12 bulk | — |
| M36 | SecureView CCTV & Alarm | alarm-cctv | 12 bulk | — |

### Set B (M37-M66) — second servicer per category

| Ref | Business Name | Category Slug | In-flight scenarios |
|-----|--------------|---------------|-------------------|
| M37 | PipePro Plumbing Solutions | plumber | — |
| M38 | ArcticAir Services Sdn Bhd | aircond-servicer | — |
| M39 | PowerLine Electrical Works | electrical-wiring | — |
| M40 | GlowClean Home Services | home-cleaning | — |
| M41 | DeepSteam Upholstery Care | sofa-mattress-cleaning | — |
| M42 | FibreFresh Carpet Studio | carpet-cleaning | — |
| M43 | CleanDrape Curtain Services | curtain-cleaning | — |
| M44 | Momentous Events Enterprise | event-planner | — |
| M45 | Warisan Kitchen Catering | catering | — |
| M46 | OrderMind Home Organizing | professional-organizer | — |
| M47 | CoolTech Installation Services | aircond-installer | — |
| M48 | TimberCraft Furniture Works | carpenter | — |
| M49 | HomeCraft Renovation Works | renovation | — |
| M50 | Lux Interiors Design Studio | interior-design | — |
| M51 | GateKing Auto & Security | door-gate | — |
| M52 | RoofShield Waterproofing Works | roof | — |
| M53 | SpinFix Appliance Repair | washing-machine-repair | — |
| M54 | IceBreak Fridge Services | refrigerator-repair | — |
| M55 | PixelPerfect TV Workshop | tv-repair | — |
| M56 | BakeRight Oven & Kitchen Repair | oven-repair | — |
| M57 | HotFlow Water Systems | water-heater-repair | — |
| M58 | BreezeWorks Fan & Electrical | ceiling-fan-repair | — |
| M59 | FrostFix AC Repair | aircond-repair | — |
| M60 | InkWell Art Academy | art-class | — |
| M61 | LinguaEdge Language Centre | language-class | — |
| M62 | RhythmBox Music School | music-class | — |
| M63 | ApexTutor Learning Centre | home-tutoring | — |
| M64 | SpiceRoute Cooking Academy | cooking-class | — |
| M65 | CoreStrong Personal Fitness | gym-trainer | — |
| M66 | SafeHaven Security Systems | alarm-cctv | — |

### Set C (M67-M96) — third servicer per category

| Ref | Business Name | Category Slug | In-flight scenarios |
|-----|--------------|---------------|-------------------|
| M67 | DrainMaster Plumbing & Sewerage | plumber | — |
| M68 | PolarCool Aircon Service Centre | aircond-servicer | — |
| M69 | Ampere Electrical Contractors | electrical-wiring | — |
| M70 | Bersih Cermat Home Clean | home-cleaning | — |
| M71 | SofaRenew Cleaning Specialists | sofa-mattress-cleaning | — |
| M72 | CarpetPro Steam Clean | carpet-cleaning | — |
| M73 | VelvetClean Curtain & Drape | curtain-cleaning | — |
| M74 | Premier Occasions Event Co | event-planner | — |
| M75 | Lotus Leaf Catering Services | catering | — |
| M76 | NeatNest Organising Studio | professional-organizer | — |
| M77 | IceKing AC Installation Works | aircond-installer | — |
| M78 | GrainLine Custom Carpentry | carpenter | — |
| M79 | AceReno Building & Renovation | renovation | — |
| M80 | Aether Design Atelier | interior-design | — |
| M81 | IronShield Gate & Grille Works | door-gate | — |
| M82 | ApexRoof Construction Works | roof | — |
| M83 | WashTech Appliance Care | washing-machine-repair | — |
| M84 | FridgePro Cooling Services | refrigerator-repair | — |
| M85 | SmartScreen TV & AV Repair | tv-repair | — |
| M86 | KitchenFix Oven & Appliance | oven-repair | — |
| M87 | AquaHeat Plumbing & Heater | water-heater-repair | — |
| M88 | AirSpin Fan & Lighting Works | ceiling-fan-repair | — |
| M89 | ChillDoc Aircon Diagnostic | aircond-repair | — |
| M90 | UrbanBrush Art & Craft Studio | art-class | — |
| M91 | SpeakEasy Language Hub | language-class | — |
| M92 | Nada Music Academy | music-class | — |
| M93 | SmartKids Home Tuition | home-tutoring | — |
| M94 | Chopstick Kitchen Studio | cooking-class | — |
| M95 | IronWill Fitness Coaching | gym-trainer | — |
| M96 | VisionGuard CCTV & Access Control | alarm-cctv | — |

### New categories (M97-M105) — Painting, Moving, Gardening (3 each)

| Ref | Business Name | Category Slug | In-flight scenarios |
|-----|--------------|---------------|-------------------|
| M97 | BrightWall Painting Services | painting | — |
| M98 | EasyMove Relocation Services | moving | — |
| M99 | GreenThumb Garden Care | gardening | — |
| M100 | ColourCraft Interior Painting | painting | — |
| M101 | SwiftShift Moving & Storage | moving | — |
| M102 | LushGarden Landscaping Works | gardening | — |
| M103 | ProPaint Specialist | painting | — |
| M104 | SafeMove Professional Movers | moving | — |
| M105 | EcoGarden Services | gardening | — |

---

## Servicer revenue chart seeding

This is the most important seeding for the servicer experience. The dashboard 7-day / 30-day bar chart and history 30-day mini bar chart both query `escrow_release` transactions grouped by day.

### Data source

The chart endpoints (`/servicer/me/earnings/daily`) query:
- `Transaction` records with `type = 'escrow_release'` AND `booking_id IS NOT NULL` — sum per day = earnings
- `Booking` records with `status = 'completed'` — count per day = jobs
- Days with transactions but no completed booking infer 1 job per day

### What gets seeded

1. **Bulk completed bookings for Set A servicers** — 194 completed jobs spread across the last 30 days (Sets B/C and new categories have no historical data yet):

| Servicer | Jobs seeded | Price range |
|---|---|---|
| M1 (Ahmad Plumbing) | 8 | RM 80–250 |
| M2 (CoolBreeze AC Service) | 8 | RM 60–140 |
| M3 (Volt Masters Electrical) | 8 | RM 150–300 |
| M4 (Sparkle Home Cleaning) | 8 | RM 60–200 |
| M5 (FreshCare Sofa & Mattress) | 8 | RM 80–200 |
| M6 (PureClean Carpet Care) | 8 | RM 55–130 |
| M7 (DrapeFresh Curtain Care) | 8 | RM 80–180 |
| M8 (Bliss Wedding & Events) | 8 | RM 100–250 |
| M9 (Auntie Mei Catering) | 50 | RM 65–200 |
| M10 (Space Harmony Organizer) | 8 | RM 80–250 |
| M11 (AC Pro Installers) | 8 | RM 150–250 |
| M12 (Precision Woodworks) | 8 | RM 90–220 |
| M13 (BuildRight Renovation) | 8 | RM 60–200 |
| M14 (Studio Aria Interior Design) | 8 | RM 80–180 |
| M15 (AutoGate Solutions) | 8 | RM 100–350 |
| M16 (TopGuard Roofing) | 8 | RM 200–600 |
| M17 (WasherDoc Repair) | 8 | RM 300–800 |
| M18 (ChillFix Refrigeration) | 8 | RM 200–1000 |
| M19 (ScreenFix TV Repair) | 8 | RM 50–120 |
| M20 (HeatWave Oven Repair) | — | — |
| M21 (HydroHeat Services) | — | — |
| M22 (FanFix Services) | — | — |
| M23 (AC Medic) | — | — |
| M24 (Creative Canvas Studio) | — | — |
| M25 (Polyglot Language Academy) | — | — |
| M26 (Melody Music Studio) | — | — |
| M27 (BrightMinds Tutoring) | — | — |
| M28 (Chef's Table Cooking Studio) | — | — |
| M29 (FitForge Personal Training) | — | — |
| M30 (FusionCraft Studio) | — | — |
| M31 (SketchBuild Studio) | — | — |
| M32 (BlendForge Studio) | **50 bulk** | — |
| M33 (MayaMotion Studio) | — | — |
| M34 (MaxDesign Studio) | — | — |
| M35 (ZBrushArt Studio) | — | — |
| M36 (SecureView CCTV & Alarm) | — | — |

2. **Invoice + escrow_release for every completed booking** — each booking gets an `Invoice` row with:
   - `subtotal` = booking price
   - `promoDiscount` = 10% off every 5th booking (to show promotion usage in earnings)
   - `platformFee` = 8% of total (not subtotal)
   - `total` = subtotal - promoDiscount (what the servicer actually earns)
   - `escrow_release` `Transaction` amount = `total` (not subtotal)

### Chart behavior

- **Dashboard** (7/30-day bar chart): Shows bars for the selected range. Days with no data show zero-height bars. "Earnings today" stat card sums `escrow_release` transactions created today.
- **History** (30-day mini bar chart): Same query. Summarizes total earned, completed jobs, average per job.

On first boot, Set A servicers see populated charts so the demo never shows empty states.

### Platform revenue chart (admin)

Platform revenue is calculated from the `platformFee` field on actual `Invoice` records (8% of each completed booking total, including promotion-discounted amounts). Every completed booking contributes to the admin revenue chart. The chart shows daily totals for the selected 7 or 30 day range.

---

## Invoices

Every completed booking gets an `Invoice` row. Currently **194 invoices** are created in a single batch, covering all bulk bookings across Set A servicers (M1-M19 bulk + M32 bulk):

Invoice fields: `lineItems` (snapshot `[{ label, amount, taxable, serviceChargeable }]`), `subtotal` (Σ lineItems), `promoDiscount` (10% off every 5th booking), `serviceChargeRate` / `serviceChargeAmount`, `sstApplies` (bool), `taxInclusive` (bool), `taxRate` (Decimal(5,4)), `taxAmount`, `tipAmount`, `total` (canonical total), `platformFee` (8% of afterPromo, unified fee), `dueDate` (now+14d), `paidAt`, `issuedAt`.

### Promo discount distribution
- Every 5th completed booking (by `sequenceNumber`) gets a 10% promo discount
- This means roughly 20% of completed jobs show a discount in their invoice total
- The servicer's `escrow_release` transaction amount reflects the discounted total
- The `platformFee` is calculated against the discounted total

This ensures promotion usage appears naturally in the earnings data rather than as separate `platform_fee` transactions.

---

## Test seed (lean dev data)

A lightweight alternative to the full 19-servicer demo seed for fast dev iteration:

- **1 test customer** (backend-only, no frontend login)
- **4 test servicers** — 2×2 SST × tax-inclusive matrix (sstRegistered + taxInclusive, all four combinations)
- **32 bookings** covering 8 payment paths (pay_now/pay_later × cash/credit/gateway × with/without promo)
- **Full lifecycle states** — pending_confirm, confirmed, in_progress, completed, cancelled, paid/unpaid invoices

Commands:

```bash
npm run seed:test         # Lightweight seed (4 servicers, 32 bookings)
npm run db:reset-test     # Force-push schema + regenerate client + test seed
npm run reseed:test       # Wipe + recreate test seed
```

Use `Run-Test.bat` from the repo root for a one-click Windows launcher (starts Docker, applies schema, runs test seed, opens backend + frontend terminals).

---

## Geographic spread

| Area | Used for |
|---|---|
| Bukit Bintang, KL | Customer.fresh primary address |
| KLCC, KL | Customer.active address |
| Damansara Heights, KL | Customer.loyal saved address |
| SS2, Petaling Jaya | M1, M6 base + customer secondary |
| Damansara Utama, PJ | M3, M11 base |
| Cheras, KL | M2, M7, M12 base + customer secondary |
| Cyberjaya (near MMU) | M5, M9, M10 base |
| Bukit Bintang/KLCC | M4, M8 base |

---

## Servicer services to seed

Each servicer gets 1-3 services with SKUs, pricing, durations, and field requirements.

**M1 Ahmad Plumbing Services:**
| SKU | Title | Base price | Type | Duration |
|---|---|---|---|---|
| PLB-001 | Leaking pipe repair | 80.00 | fixed | 60 min |
| PLB-002 | Bathroom plumbing service | 150.00 | hourly | 120 min |
| (blank) | Toilet bowl installation | 200.00 | quote | 90 min |

**M9 AC Doctor (auto-accept enabled):**
| SKU | Title | Base price | Type | Duration | Auto-accept conditions |
|---|---|---|---|---|---|
| AC-CLEAN | Standard aircon cleaning | 80.00 | fixed | 60 min | budget 60-150, residential only, morning/lunch |
| AC-PRO | Pro aircon service | 150.00 | fixed | 90 min | budget 120-300, all property types |

Aircond servicers (M7, M8, M9) additionally seed `modifiers` — an option-price map for the `aircon_service` priced question (Phase 6).

**M9 AC Doctor** gets 2 service listings (Standard aircon cleaning, Pro aircon service) with auto-accept enabled and option-price modifiers.

---

## Hidden penalty scenarios (don't demo unless asked)

| Servicer | Scenario |
|---|---|
| M2 | 1 active penalty — no-show, RM 50 deducted from deposit (now 450) |
| M7 | Filed an appeal pending admin review |
| M12 | Successful appeal — RM 30 reversed to deposit |

If asked "what happens when a servicer doesn't show up?", navigate to admin → appeals queue.

---

## Promotions seeded

### Servicer promotions
- M1 Ahmad Plumbing: code `AHMAD10` — 10% off, min RM 50, max 100 uses, expires end of month
- M6 Maid Day: code `MAIDFIRST` — RM 15 off, min RM 80, max 50 uses

### Platform promotions
- Code `WELCOME20` — RM 20 off booking over RM 100, max 500 uses, expires Dec 2026
- Code `MMU10` — 10% off for Cyberjaya area, max 200 uses

Platform marketing budget: RM 5,000 total, RM 320 spent.

---

## Customer accounts detail

### Customer.fresh (Sarah Lim)
- Email: `customer.fresh@demo.local`
- No order history — clean slate for live quote submission
- Has open plumbing quote (broadcast to M1, M2, M3; proposals from M2, M3)
- Also has several cancelled bookings used for penalty appeal scenarios

### Customer.active (David Tan)
- Email: `customer.active@demo.local`
- 1 active quote request for aircon with 3 proposals (M7: RM 110, M8: RM 130, M9: RM 95 auto-accepted)
- **Time-sensitive deadline**: Quote deadline set to `now() + 30 minutes`. Use `--deadline-offset` flag to extend.

### Customer.loyal (Priya Subramaniam)
- Email: `customer.loyal@demo.local`
- 2 saved addresses: Damansara Heights (default) + SS2
- Multiple completed bookings across most categories (from the bulk seed across Set A servicers)
- 1 in_progress booking (M8, RM 130)
- 1 active open catering quote (M10, M11, M12 broadcast; proposals from M10, M11)
- Chat session with history
- **Use case**: Order history, reorder, chat

---

## Admin account detail

- Email: `admin@demo.local`
- Action PIN: `1234` (demo login gate is the separate `5201314`)
- **Pre-seeded**:
  - 6 category requests pending (pet grooming, gardening, pest control, etc.)
  - 5 withdrawal requests pending (M3: RM 200, M1: RM 120, M8: RM 350, M9: RM 90, M12: RM 175)
  - 1 open report
  - 4 pending penalty appeals (M7 original + M1, M4, M9 extras)
  - 30-day platform revenue chart populated (RM 14-167.50/day pattern)
  - Platform fee rate: 5% (scheduled 20% at 50 servicers)

---

## Chat session seed data

One `ChatSession` + 4 `ChatMessage` rows for Customer.loyal (staggered `createdAt`
so they render in order):

```
User: "How do I reorder the same cleaning service I used last time?"
Assistant: "You can find your past bookings under Order History. Tap 'Rebook same servicer' to submit a new quote..."

User: "Can I change the date when I rebook?"
Assistant: "Yes — the form is pre-filled but fully editable..."
```

## FAQ knowledge base seed (`data/static.ts` → `chatKnowledge`)

The chatbot's knowledge base is seeded from `chatKnowledge` and fed to the AI
filtered by the reader's audience tier. Current distribution: **guest 20,
customer 30, servicer 12, admin 17** (≈79 entries). The **admin-tier** set
covers every admin page (dashboard, accounts, review queues, AI Chat Settings,
the Platform Settings tabs, action PIN, audit trail, platform fee, demo logins)
so the chatbot can guide admins.

> ⚠️ **Do not delete the FAQ entries from `chatKnowledge`.** All tiers are
> permanent seed content (code, not transient data) and are re-created on every
> reseed; the `faqs` table is wiped + re-inserted, so nothing is lost as long as
> the entries stay in `static.ts`.

---

## In-flight scenarios seeded

| Scenario | Login as | What you can show |
|---|---|---|
| Open quote with countdown | Customer.active | Live timer ticking, proposals arriving |
| Multiple proposals ready | Customer.active | Bundled proposal list with ratings, prices |
| Pending servicer confirm | M5 (EcoClean) | Two-step confirm UI |
| In-progress booking | M8 (Daikin Pro) | Mark-done with photo flow |
| Cash payment to confirm | M6 (Maid Day) | Cash-confirm button |
| Completed booking + invoice + reorder | Any servicer | Order history, invoices, reorder |
| 7/30-day earnings chart toggle | Any servicer | Dashboard + history bar chart with range toggle |
| Weekly PDF export | Any servicer | Download earnings PDF |
| Category request pending | Admin | Approve with default price |
| Withdrawal request pending | Admin | Approve M3's withdrawal |
| Customer report open | Admin | One report waiting |
| Penalty appeal pending | Admin | M7's appeal in queue |
| 30-day platform revenue chart | Admin | SVG bar chart populated |
| Auto-accept demo | M9 or M11 | Auto-accept settings + matched quote |
| AI chatbot with history | Customer.loyal | Open chat, show conversation context |
| Servicer penalty active | M2 | View penalty log on account page |
| Invoice list | M1, M4, M6, M12 | View their generated invoices |

---

## Photos & files

All seeded photos use placeholder URLs from `picsum.photos`:

| Purpose | URL pattern |
|---|---|
| Servicer logo | `https://picsum.photos/seed/servicer{id}/200/200` |
| Arrive photo | `https://picsum.photos/seed/arrive{id}/800/600` |
| Done photo | `https://picsum.photos/seed/done{id}/800/600` |

---

## Platform settings seeded

| Key | Value |
|---|---|
| `minimum_servicer_charge` | 30.00 |
| `no_show_consecutive_threshold` | 3 |
| `no_show_weekly_threshold` | 5 |
| `servicer_deposit_minimum` | 100.00 |
| `servicer_credit_withdrawal_minimum` | 50.00 |
| `quote_buffer_minutes` | 15 |
| `discount_no_response_value` | 10.00 |
| `discount_no_response_type` | "fixed" |
| `platform_fee_rate` | `{ current_rate: 0.05, scheduled_changes: [{ trigger_servicer_count: 50, new_rate: 0.20 }] }` |
| `servicer_proposal_preset_limit` | 3 |

## Penalty rules seeded

| Type | Amount | Is percent |
|---|---|---|
| `noshow` | 50.00 | false |
| `cancel` | 25.00 | false |

## Feature flags seeded

| Key | Enabled |
|---|---|
| `bid_mode` | false (post-V1) |
| `ai_chatbot` | true |
| `payment_gateway` | false (post-V1) |
| `reviews` | false (post-V1) |
| `servicer_kyc` | false (V1: bypassed) |
| `servicer_schedule` | false (V1: always online) |

---

## In-depth: seed flow

### What the seed script creates (in order)

1. **Categories** — 11 main + sub-categories
2. **Platform settings** — budget ranges, fee rate, penalty rules, feature flags, FAQ knowledge base, marketing budget
3. **Admin user** — fixed UUID, is_demo flag, action PIN hashed
4. **Customers** — 3 customer accounts with addresses, quote presets
5. **Servicers** — All 105 servicers each with:
   - Servicer record (profile, business info, category, service areas, rating)
   - ServicerDeposit (RM 500 deposited, RM 500 current, RM 100 minimum)
   - ServicerProposalPreset (standard quote template)
   - ServicerService records (1-3 services per servicer; M9 gets 62 total incl. 60 bulk)
6. **In-flight quotes** — 3 open quotes (aircon, plumbing, catering) with broadcasts and proposals
7. **Bulk completed bookings** — 194 completed jobs across all 19 servicers spread over 30 days (8 each, M9 gets 50)
8. **In-flight bookings** — 6 bookings across all states:
    - 1 in_progress (M8)
    - 1 completed cash (M6)
    - 4 cancelled (penalty scenarios)
9. **Invoices + escrow_release transactions** — for all 194 bulk completed bookings + 3 in-flight completed
10. **Penalty scenarios** — M2 active penalty, M7 appeal pending, M12 reversed
11. **Promotions** — 2 servicer + 2 platform
12. **Admin queue items** — 6 category requests, 5 withdrawals, 4 appeals, 1 report
13. **Chat session** — Customer.loyal with 4 messages
14. **Platform revenue** — 30-day historical platform_fee transactions (legacy, replaced by invoice-based revenue)
15. **Manifest** — writes `seeded-ids.json`

### Timeline constraints

- Customer.active's quote deadline = `now() + 1440 minutes (24h)` (`--deadline-offset` flag available)
- Historical data spans the last 30 days

---

## Magic seed commands

```json
{
  "scripts": {
    "seed": "ts-node prisma/seed/seed.ts",
    "reseed": "ts-node prisma/seed/seed.ts"
  }
}
```

### Production safety (three layers)

1. Seed script refuses to run when `NODE_ENV=production`
2. Auth middleware blocks `is_demo` logins when `NODE_ENV=production`
3. Demo account password is intentionally documented as demo-only

### Quick reference

```bash
npm run seed                          # Full seed (wipes + recreates everything)
npm run seed -- --deadline-offset=1440  # Custom quote deadline offset (24h default)
```

### Demo day checklist

- [ ] `npm run seed` within 30 minutes of demo start
- [ ] Verify all demo logins work from login page or navbar dropdowns
- [ ] Verify Customer.active's quote countdown is still ticking
- [ ] Verify Customer.loyal's chat session shows seed messages
- [ ] Verify at least one servicer dashboard chart shows populated bars (toggle 7/30 days)
- [ ] Verify admin 30-day revenue chart shows data
- [ ] Verify M32 (Blender) shows 50 bulk completed bookings
- [ ] Verify modifier pricing on M1 (plumber: action + area), M4 (home-cleaning: cleaning_option)
- [ ] Replace placeholder photos with real ones (optional)
- [ ] Verify AI chatbot connects (test one message)
- [ ] Run through the demo script once end-to-end

---

## Out of scope for V1

- REVIEW system — flag for post-V1 priority
- Payment gateway transactions
- Real push notifications (FCM)
- Real KYC document verification
- Real bank-integrated withdrawals (V1 is fake / admin manual)
- Subcategories in quote wizard (schema ready, not displayed)
