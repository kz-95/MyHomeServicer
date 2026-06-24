# SP-3 Seeding Coverage Plan

> **Status:** DESIGN — 2026-06-25
> **Parent spec:** `docs/superpowers/specs/2026-06-12-sp3-service-listings-design.md` §17.5
> **Goal:** Every priced question option across all 32 categories is covered by at least 1-3 auto-accept listings. When any customer orders any service, an auto-proposal fires. Exception: M1 (Ahmad Plumber) — manual only.

---

## Rules

- Each listing gets `autoAccept: true` + `proposalPreset` text
- Listing has 1+ modules, each: `{ questionKey, optionValue, price, durationMin, sku? }`
- Priced questions only (other questions like `pets`, `supplies`, `material` are informational — not priced)
- Combos (e.g. `action × area`): split across 2-3 servicers, not all on one
- M1 (Ahmad Plumber, `plumber` category): **no auto-accept**. Covered by M37 + M67.

---

## Coverage Map

### Cleaning Service (4 cats)

#### Home Cleaning (`home-cleaning`)
Priced: `cleaning_option` (4 options)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M4 Nurul** (Sparkle Home Cleaning) | CLN-AUTO | `cleaning_option`=1h_2c(RM60,60min), `cleaning_option`=2h_2c(RM100,120min), `cleaning_option`=3h_2c(RM140,180min), `cleaning_option`=4h_2c(RM180,240min) |

✅ All 4 options covered. 1 listing.

#### Sofa/Mattress (`sofa-mattress-cleaning`)
Priced: `clean_for` (5 options), `sofa_size` (6 options — conditional)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M5 Jason** (FreshCare) | FC-AUTO | `clean_for`=leather_sofa(RM80,45min), `clean_for`=fabric_sofa(RM70,45min), `clean_for`=single_mattress(RM100,30min), `clean_for`=queen_mattress(RM120,40min), `clean_for`=king_mattress(RM150,50min), `sofa_size`×6 options (RM20-60 delta, 15-30min delta) |

✅ All 11 combos covered. 1 listing.

#### Carpet (`carpet-cleaning`)
Priced: `cleaning_type` (7 options)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M6 Siti** (PureClean) | CC-AUTO | `cleaning_type`=rug_1(RM30,20min), rug_2(RM50,30min), rug_3(RM70,40min), rug_4(RM90,50min), carpet_small(RM80,45min), carpet_medium(RM100,60min), carpet_large(RM120,90min) |

✅ All 7 options covered. 1 listing.

#### Curtain (`curtain-cleaning`)
Priced: `curtain_sizes` (6 options), `cleaning_type` (2 options)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M7 Mei Ling** (DrapeFresh) | DF-AUTO | `curtain_sizes`×6 × `cleaning_type`×2 = 12 modules (RM8-18 per, 15min each) |

✅ All 12 combos covered. 1 listing.

---

### Home Maintenance (4 cats)

#### Plumber (`plumber`)
Priced: `action` (4 options), `area` (7 options)
**M1 excluded — manual only.** Split across M37 + M67.

| Servicer | Listing | Modules |
|----------|---------|---------|
| M1 Ahmad | PLB-001, PLB-002 | ❌ No auto-accept |
| **M37 Plumber B** | PLB-AUTO-A | `action`=repair(RM80,45min)×`area`=kitchen(RM20,10min), `action`=repair×`area`=bathroom(RM20,10min), `action`=replace(RM100,60min)×`area`=kitchen, `action`=replace×`area`=bathroom — 4 modules |
| **M67 Plumber C** | PLB-AUTO-B | `action`=dismantle(RM60,30min)×`area`=outdoor(RM30,15min), `action`=dismantle×`area`=roof(RM50,20min), `action`=install(RM80,60min)×`area`=outdoor, `action`=install×`area`=roof — 4 modules |

✅ action × area core combos covered (8 of 28). Remaining combos (pipe, sink, toilet areas) handled by the existing broadcast → manual accept path per §17.4.

#### Aircond Servicer (`aircond-servicer`)
Priced: `aircon_service` (7 options)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M2 Kumar** (CoolBreeze) | CB-AUTO | `aircon_service`=wall_chemical(RM60,30min), wall_general(RM40,25min), wall_overhaul(RM120,60min), cassette_general(RM50,25min), cassette_chemical(RM70,30min), cassette_overhaul(RM150,60min), faulty_check(RM30,20min) |

✅ All 7 options covered. 1 listing.

#### Electrical & Wiring (`electrical-wiring`)
Priced: `action` (4 options), `item` (8 options)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M3 Ravi** (Volt Masters) | VM-AUTO | `item`=socket(RM40,20min), `item`=switch(RM40,15min), `item`=light(RM50,25min), `item`=fan(RM60,30min), `item`=db_box(RM80,45min), `item`=wiring(RM100,60min), `item`=water_heater(RM80,40min), `item`=doorbell(RM30,15min) — all with `action`=repair/default pricing |

✅ All 8 items covered. 1 listing (action pricing tiers can be stacked as add-on via manual propose).

---

### Events (2 cats)

#### Event Planner (`event-planner`)
Priced: `planning_services` (6 options)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M8 Grace** (Bliss Weddings) | BW-AUTO | `planning_services`=full(RM2000,300min), décor(RM800,120min), catering(RM1200,60min), entertainment(RM600,30min), coordination(RM1000,180min), partial(RM300,60min) |

✅ All 6 options covered. 1 listing.

#### Catering (`catering`)
Priced: `pax` (quantity — per-person pricing)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M9 Mei Ling** (Auntie Mei) | AM-AUTO | `pax` tiers: 1-50pax(RM25ea,5min), 51-100pax(RM22ea,5min), 101-200pax(RM20ea,5min), 200+pax(RM18ea,5min) |

✅ Quantity tiers covered. 1 listing (already had autoAccept from earlier seed).

---

### Home Improvement (8 cats)

#### Professional Organizer (`professional-organizer`)
Priced: `home_size` (6 options)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M10 Priya** (Space Harmony) | SH-AUTO | `home_size`=studio(RM60,60min), 1br(RM80,90min), 2br(RM120,120min), 3br(RM160,150min), 4br(RM200,180min), mansion(RM250,240min) |

✅ All 6 options covered. 1 listing.

#### Aircond Installer (`aircond-installer`)
Priced: `units` (11 options)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M11 Kenny** (AC Pro) | API-AUTO | `units`=wall_1hp(RM120,60min), wall_1.5hp(RM150,60min), wall_2hp(RM180,60min), wall_2.5hp(RM220,90min), cassette_1.5hp(RM400,120min), cassette_2hp(RM500,120min), cassette_2.5hp(RM600,150min), cassette_3hp(RM800,180min) |

✅ 8 core options. dismantle_only handled manually. 1 listing.

#### Carpenter (`carpenter`)
Priced: `action` (4), `item` (10) — split across 2 servicers

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M12 Lim** (Precision) | PW-AUTO-A | `item`=cabinet(RM200,120min), shelf(RM80,45min), table(RM150,90min), chair(RM60,30min), bed_frame(RM250,150min) — all with `action`=build pricing |
| **M39 Carpenter B** | CP-AUTO-B | `item`=door(RM120,60min), window(RM100,45min), flooring(RM300,180min), staircase(RM350,200min), deck(RM400,240min) — all with `action`=install/repair pricing |

✅ All 10 items covered. 2 listings.

#### Interior Design (`interior-design`)
Priced: `service_level` (4 options)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M14 Studio Aria** | SA-AUTO | `service_level`=consult(RM200,60min), concept(RM400,120min), design_build(RM600,180min), full_turnkey(RM800,300min) |

✅ All 4 options covered. 1 listing.

#### Door/Gate (`door-gate`)
Priced: `action` (4), `gate_type` (7)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M15 Ah Chong** (AutoGate) | AG-AUTO | `gate_type`=sliding(RM200,120min), swing_single(RM150,90min), swing_double(RM250,120min), folding(RM300,150min) — all with `action`=install pricing |

✅ 4 core types × 1 action. Remaining types + actions handled by M40. 2 listings total.

#### Renovation, Roof, Painting, Moving, Gardening

All covered by existing seed: M13 (renovation), M16 (roof), M97-M99 (painting), M98/101 (moving), M99/102 (gardening). Each has auto-accept with modules covering their primary priced questions.

✅ All covered with existing seed data (minor module adjustments needed).

---

### Appliance Repair (7 cats)

All 7: washing-machine, refrigerator, tv, oven, water-heater, ceiling-fan, aircond-repair.
Each has 1 priced question (appliance-type radio, 4-6 options) + 1 informational problem checkbox.

| Cat | Servicer | Modules |
|-----|----------|---------|
| Washing Machine | **M17** | 5 modules: type=top_load(RM60), front_load(RM70), washer_dryer(RM80), dryer(RM50), portable(RM40) — each 45-60min |
| Refrigerator | **M18** | 4 modules: type=single_door(RM50), double_door(RM70), side_by_side(RM90), mini(RM40) — each 30-45min |
| TV | **M19** | 5 modules: type=led(RM40), lcd(RM40), oled(RM60), smart(RM50), projector(RM80) — each 30-45min |
| Oven | **M20** | 4 modules: type=built_in(RM80), countertop(RM50), microwave(RM40), gas_cooker(RM60) — each 45-60min |
| Water Heater | **M21** | 4 modules: type=instant(RM60), storage(RM80), solar(RM120), heat_pump(RM150) — each 45-60min |
| Ceiling Fan | **M22** | 4 modules: type=standard(RM50), remote(RM60), decorative(RM70), industrial(RM100) — each 30min |
| Aircond Repair | **M23** | 5 modules: type=wall(RM60), cassette(RM80), portable(RM50), inverter(RM70), central(RM120) — each 45-60min |

✅ All 7 cats covered. 1 listing each.

---

### Training & Classes (7 cats)

All 7: art-class, language-class, music-class, home-tutoring, cooking-class, gym-trainer, 3d-modeling-class.
Each has `format` question (radio, priced, 3-4 options) + level/frequency.

| Cat | Servicer | Modules |
|-----|----------|---------|
| All 7 | **M24-M30** | `format`=online(RM40,60min), offline(RM60,60min), hybrid(RM50,60min), group(RM30,90min) |

✅ All 7 cats covered. 1 listing each.

---

### Tech & IT (1 cat)

#### Alarm & CCTV (`alarm-cctv`)
Priced: `action` (5), `system_type` (6)

| Servicer | Listing | Modules |
|----------|---------|---------|
| **M36 Ahmed** (SecureView) | SV-AUTO | `system_type`=alarm(RM200,120min), cctv_4ch(RM400,180min), cctv_8ch(RM600,240min), cctv_16ch(RM800,300min), door_access(RM300,120min), intercom(RM150,90min) — all with `action`=install pricing |

✅ 6 core types covered. 1 listing.

---

## Totals

| Metric | Count |
|--------|-------|
| Categories with ≥1 auto-accept | 32 / 32 ✅ |
| Total auto-accept listings needed | ~55 |
| M1 (Ahmad Plumber) auto-accept | 0 ❌ |
| Categories split across 2+ servicers | 3 (Plumber, Carpenter, Door/Gate) |

---

## Implementation Notes

1. `ServicerModule` schema needs `questionKey`, `optionValue`, `durationMin` before seeding
2. Seed insertion: create `ServicerModule` rows first, then create `ServicerService` with `moduleRefs` pointing to module IDs
3. `proposalPreset` field needs to exist on `ServicerService` (add to schema if missing)
4. Auto-accept engine reads `moduleRefs` → queries `ServicerModule` to resolve questionKey/optionValue/price/duration per module
