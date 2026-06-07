# Category Taxonomy (2026-05-31 redesign)

Two levels: **Parent** (grouping for browse) → **Child** (the actual service; carries
`questionSchema`, travel/inspection settings, and is what servicers list under + customers
quote). Parents hold no questions. Slugs are the stable keys.

> Status: taxonomy locked, replacing the old flat 11-category set. Seed being rewritten to
> this. Per-child `questionSchema` brainstormed one-by-one after taxonomy lands.
> `property_type` is a GLOBAL quote field (not per-child) — see the pricing-model spec.

## 1. Cleaning Service — `cleaning-service`
- Home Cleaning — `home-cleaning`
- Sofa / Mattress Cleaning — `sofa-mattress-cleaning`
- Carpet Cleaning — `carpet-cleaning`
- Curtain Cleaning — `curtain-cleaning`

## 2. Events — `events-weddings`
- Event Planner — `event-planner` (covers parties, general events + weddings; merged 2026-05-31)
- Catering Service — `catering`

> Slugs unchanged (`events-weddings` / `event-planner`). Display names renamed 2026-06-07: parent "Event & Weddings" → "Events", child "Event & Wedding Planner" → "Event Planner" (the old name read wedding-only and confused the chat assistant for general parties). M18 maps to `event-planner`.

## 3. Home Improvement — `home-improvement`
- Professional Organizer — `professional-organizer`
- Aircond Installer — `aircond-installer`
- Carpenter — `carpenter`
  - service-type options (for questionSchema, TBD): Furniture Repair · Door Repair ·
    Wood Polishing/Varnishing · Custom Build (cabinet, shelves, etc) · Decking & Outdoor ·
    Flooring (parquet, laminate)
- Renovation — `renovation`
- Interior Design — `interior-design`
- Door Gate — `door-gate`
- Roof — `roof`

## 4. Home Maintenance — `home-maintenance`
- Aircond Servicer — `aircond-servicer`
- Plumber — `plumber`
- Electrical & Wiring — `electrical-wiring`

## 5. Electrical Appliance Repair — `appliance-repair`
- Washing Machine & Dryer Repair — `washing-machine-repair`
- Refrigerator Repair — `refrigerator-repair`
- TV Repair — `tv-repair`
- Oven Repair — `oven-repair`
- Water Heater Repair — `water-heater-repair`
- Ceiling Fan Repair — `ceiling-fan-repair`
- Aircond Repair — `aircond-repair`  ← ADDED 2026-05-31

> ⚠️ Seed: add `aircond-repair` child to `static.ts children[]` under `appliance-repair`.

## 6. Training and Classes — `training-classes`
- Art Class — `art-class`
- Language Class — `language-class`
- Music Class — `music-class`
- Home Tutoring — `home-tutoring`
- Cooking Class — `cooking-class`
- Private Gym Trainer — `gym-trainer`
- 3D Modeling Class — `3d-modeling-class`

## 7. Tech & IT — `tech-it`
- Alarm & CCTV Services — `alarm-cctv`

---

## Demo merchant remap (old flat slug → new child slug)

| Old | Merchants | New child |
|-----|-----------|-----------|
| plumbing | M1, M2, M3 | `plumber` |
| cleaning | M4, M5, M6 | `home-cleaning` |
| aircond | M7, M8, M9 | `aircond-servicer` |
| catering | M10, M11, M12 | `catering` |
| electrical | M13 | `electrical-wiring` |
| door-gate | M14 | `door-gate` |
| roof | M15 | `roof` |
| renovation | M16 | `renovation` |
| interior-design | M17 | `interior-design` |
| wedding | M18 | `event-planner` |
| tutoring | M19 | `home-tutoring` |

Children with no demo merchant yet (empty listings, fine for demo): sofa/carpet/curtain
cleaning, event-planner, professional-organizer, aircond-installer, carpentry, all
appliance-repair, all training-classes except home-tutoring, alarm-cctv.

## Per-child questionSchema status
- `aircond-servicer` — keeps existing aircond questions (chemical/general/overhaul wash).
- `plumber` — designed: action (radio, priced) × area (checkbox min1, priced) × problem
  (checkbox min1, info). Additive pricing. (Apply during seed or next pass.)
- All other children — questions TBD, brainstorm one-by-one.

## Notes
- Budget ranges: re-key to new child slugs (old per-slug presets remap where sensible).
- Dev stage: safe to clear all data + reseed.
- Frontend browse/quote needs parent→child navigation (deferred with home redesign).
