# SP-3 Module Seeding Coverage

> **Date:** 2026-06-25
> **Status:** Complete - all 34 child categories have modules with matched optionValues

## Overview

Every child category in the platform has a `questionSchema` on `Category` that defines the questions shown in the quote wizard. Questions marked `priced: true` have options that carry servicer-set prices. The SP-3 module seeding creates `ServicerModule` records for every priced option, so auto-accept listings can compute their price from customer selections.

## The `questionKey` + `optionValue` linkage

Each `ServicerModule` row carries:

- `questionKey` - matches a `Category.questionSchema` question's `key` field
- `optionValue` - matches one of that question's option `value` strings

For auto-accept to fire correctly, `questionKey` + `optionValue` on the module **must exactly match** the static.ts `QuoteQuestion` definition. A mismatch means the auto-accept engine cannot find a price for the customer's selection and the listing silently fails to auto-propose.

## Coverage by category

| # | Category slug | Priced questions | optionValues (static.ts) | Module count | Status |
|---|--------------|-----------------|--------------------------|-------------|--------|
| 1 | plumber | action, area | action: dismantle,install,repair,replace; area: bathtub,pipe_drain,shower,tap_faucet_sink,toilet_wc,water_heater,others | 11 | ✅ Full |
| 2 | aircond-servicer | aircon_service | wall_chemical,wall_general,wall_overhaul,cassette_general,cassette_chemical,cassette_overhaul,faulty_check | 7 | ✅ Full |
| 3 | electrical-wiring | action, item | action: install,repair,replace,inspection_testing; item: wiring_rewiring,power_socket_switch,lighting_downlight,ceiling_fan,distribution_board,water_heater_point,doorbell_intercom | 11 | ✅ Full |
| 4 | home-cleaning | cleaning_option | 1h_2c,2h_2c,3h_2c,4h_2c | 4 | ✅ Full |
| 5 | sofa-mattress-cleaning | clean_for, sofa_size | clean_for: leather_sofa,fabric_sofa,single_mattress,queen_mattress,king_mattress; sofa_size: 1_seater,2_seater,3_seater,4_seater,l_shape | 10 | ✅ Full |
| 6 | carpet-cleaning | cleaning_type | rug_1,rug_2,rug_3,rug_4,carpet_small,carpet_medium,carpet_large | 7 | ✅ Full |
| 7 | curtain-cleaning | curtain_sizes, cleaning_type | curtain_sizes: full_height_40,full_height_60,full_height_100,half_height_40,half_height_60,half_height_100; cleaning_type: normal_cleaning,dry_cleaning | 8 | ✅ Full |
| 8 | event-planner | planning_services | style_theme,budget_planning,invite_rsvp,vendor_selection,vendor_coordination,floor_activity | 6 | ✅ Full |
| 9 | catering | pax | person | 1 | ✅ Full |
| 10 | professional-organizer | home_size | studio_1br,2br,3br,4br,5br_plus,landed_bungalow | 6 | ✅ Full |
| 11 | aircond-installer | units | wall_1hp,wall_1_5hp,wall_2hp,wall_2_5hp,wall_3hp,cassette_1hp,cassette_1_5hp,cassette_2hp,cassette_2_5hp,cassette_3hp,dismantle_only | 11 | ✅ Full |
| 12 | carpenter | action, item | action: repair,install,custom_build,dismantle_remove; item: cabinet_kitchen,wardrobe_closet,shelves_storage,door,table_desk,tv_console,bed_frame,flooring,decking_outdoor | 13 | ✅ Full |
| 13 | interior-design | service_level | consultation_only,concept_3d,design_pm,full_turnkey | 4 | ✅ Full |
| 14 | door-gate | action, gate_type | action: new_install,repair,replace,service_maintenance; gate_type: autogate_swing,autogate_sliding,folding_gate,grille_gate,security_metal_door,roller_shutter | 10 | ✅ Full |
| 15 | painting | paint_scope | one_room,multiple_rooms,whole_house,exterior,feature_wall | 5 | ✅ Full |
| 16 | moving | move_type, home_size | move_type: whole_home,few_big_items,single_item,office; home_size: studio,2_3_rooms,4_plus,items_only | 8 | ✅ Full |
| 17 | gardening | garden_work, garden_size | garden_work: lawn_mowing,hedge,weeding,tree_pruning,landscaping; garden_size: small,medium,large,not_sure | 9 | ✅ Full |
| 18 | alarm-cctv | action, system_type | action: new_install,add_expand,repair,maintenance,relocate; system_type: cctv_cameras,alarm_system,door_access_intercom,smart_doorbell,motion_sensors | 10 | ✅ Full |
| 19 | roof | action | leak_repair,tile_sheet_replacement,gutter_clean_repair,waterproofing,full_reroofing,inspection_only | 6 | ✅ Full |
| 20 | renovation | project_type | full_home,single_room,kitchen,bathroom_toilet,extension_add_on,commercial_office | 6 | ✅ Full |
| 21 | washing-machine-repair | appliance | washing_machine_top,washing_machine_front,dryer,washer_dryer_combo | 4 | ✅ Full |
| 22 | refrigerator-repair | fridge_type | single_door,double_door,side_by_side,mini_bar,chest_freezer | 5 | ✅ Full |
| 23 | tv-repair | tv_type | led_lcd,oled,plasma,projector,smart_tv,unknown | 6 | ✅ Full |
| 24 | oven-repair | oven_type | built_in_oven,freestanding,microwave,microwave_oven_combo,gas_oven | 5 | ✅ Full |
| 25 | water-heater-repair | heater_type | instant_single,storage_tank,multipoint,solar,heat_pump | 5 | ✅ Full |
| 26 | ceiling-fan-repair | fan_type | standard,decorative_dc,industrial,with_light_kit,remote_controlled | 5 | ✅ Full |
| 27 | aircond-repair | aircon_type | wall_mounted_split,cassette_ceiling,portable,window,inverter | 5 | ✅ Full |
| 28 | art-class | format | in_person_tutor,in_person_home,online | 3 | ✅ Full |
| 29 | language-class | format | in_person_tutor,in_person_home,online | 3 | ✅ Full |
| 30 | music-class | format, instrument | format: in_person_tutor,in_person_home,online; instrument: piano,guitar,violin,drums,vocal_singing,ukulele,music_theory,others | 11 | ✅ Full |
| 31 | home-tutoring | format, level | format: at_my_home,at_tutor,online; level: primary,lower_sec,spm,pre_u,university,adult_skills | 9 | ✅ Full |
| 32 | cooking-class | format, setup | format: in_person_venue,in_person_home,online; setup: private_1on1,small_group,workshop_event | 6 | ✅ Full |
| 33 | gym-trainer | format, trainee | format: at_my_home,at_gym,outdoor_park,online; trainee: individual,couple,small_group | 7 | ✅ Full |
| 34 | 3d-modeling-class | format, field | format: online,in_person_tutor,in_person_home; field: environment_prop,animation_cinematic,character,product,interior_design,3d_printing,sculpting,others | 11 | ✅ Full |

## Single entry point

All seeding is consolidated in `seed.ts`. One command does everything:

```bash
npm run seed          # Full demo seed (modules + settings + admin + bookings + quotes)
npm run db:reset      # Nuclear reset (drops, re-applies schema, runs seed)
npm run reseed        # Wipe + full seed
npm run seed:test     # Lean test seed (4 servicers, 32 bookings)
```

`clearAll()` wipes everything first, then `seed.ts` recreates all data in one pass - categories, settings, admin, customers, servicers, modules, quotes, bookings, invoices, penalty data, and platform revenue.

## What changed (2026-06-25)

- All 34 categories have `ServicerModule` records with `questionKey` + `optionValue` matching `static.ts` exactly
- `roof.action` and `renovation.project_type` changed from `priced: false` to `priced: true`
- Former standalone scripts (`seed-sp3-modules.ts`, `seed-settings.ts`, `seed-admin.ts`) consolidated into `seed.ts`
- `Run.bat` no longer calls `seed:settings` separately
- `package.json` scripts `seed:admin`, `seed:settings`, `seed:modules` removed
