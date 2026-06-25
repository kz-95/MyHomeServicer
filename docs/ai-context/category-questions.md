# Per-child questionSchema (draft + locked)

Companion to `category-taxonomy.md` + the pricing-model spec. Questions live on CHILD
categories. `[P]` = priced (servicer sets price + duration per option; selections sum,
additive across priced axes). `[i]` = info only. `property_type` is GLOBAL (not here).
Checkbox questions: note `min` (minSelect) / `max` (maxSelect). "Other (explain)" pairs
with a free-text `details` field.

**Every option has a stable `value` = slug of its label** (auto-generated on save, immutable,
reorder-safe - e.g. "3-seater" → `3_seater`, "Leather sofa" → `leather_sofa`). Labels are
shown here for brevity; the slug is the key that pricing + **budget detection** map against
(servicer price keyed by option value → sum priced selections → estimated budget).

Status legend: ✅ locked · ✏️ draft (awaiting user correction)

---

## ✅ Plumber (`plumber`) - locked
- Q1 `action` - radio, one - "What kind of plumbing service?" - Dismantle · Install · Repair · Replace **[P]**
- Q2 `area` - checkbox, min1 - "Which area?" - Bathtub · Pipe/Drain · Shower · Tap/Faucet/Sink · Toilet/WC · Water heater · Other (explain) **[P]**
- Q3 `problem` - checkbox, min1 - "What problem?" - No problem (install/replace only) · Busted/Cracked · Ceiling water stain · Clogged/Stuck · Leak/drip · Low pressure · Noisy/Vibration · Smell/Dirty · Wall seepage · Other (explain) **[i]**
- Pricing: action + area, additive. property_type global.

## ✅ Aircond Servicer (`aircond-servicer`) - locked (existing)
- Q1 `aircon_service` - checkbox, min1 - "Type of aircon + cleaning" - Wall: Chemical/General/Overhaul · Cassette: General/Chemical/Overhaul · Check faulty (details) **[P]**

---

## ✏️ Cleaning Service group (draft - please correct)

### ✅ Home Cleaning (`home-cleaning`) - locked
> MY reality: few "deep clean" pros - sell by time × cleaners, not cleaning type.
- Q1 `cleaning_option` - radio, one - "Choose cleaning option" - **[P]**
  - 1 hour × 2 cleaners (recommended for studio)
  - 2 hours × 2 cleaners (recommended for 2 bedroom apartment)
  - 3 hours × 2 cleaners (recommended for 2–3 bedroom home)
  - 4 hours × 2 cleaners (recommended for semi-d or bungalow)
  - description: "Please note we are not able to extend the hours once our team is already on-site."
- Q2 `cleaning_supplies` - radio, one - "Do you need us to provide cleaning supplies?" - **[PASS-THROUGH FEE]**
  - Single session (admin baseline ~RM30 overall+per-category; servicer ≥ baseline; baseline 0% platform / extra %'d - SAME RULE as travel fee, coded separately)
  - No, I will provide (RM0)
- Q3 `pets` - checkbox, min1 - "Do you have any pet(s)?" - **[i]**
  - I don't have pets (exclusive - clears others) ✓ confirmed
  - Cat(s) · Dog(s) · Others (explain below)
- Pricing: cleaning_option (normal priced, platform %'d) + cleaning_supplies (pass-through fee). property_type global.

### ✅ Sofa / Mattress Cleaning (`sofa-mattress-cleaning`) - locked
> Always deep cleaning for these - no method question. No "Other".
- Q1 `clean_for` - checkbox, min1 - "Cleaning for:" - Leather sofa · Fabric sofa · Single mattress · Queen mattress · King mattress **[P]**
- Q2 `sofa_size` - radio, one - "Sofa size" - 1-seater · 2-seater · 3-seater · 4-seater · L-shape **[P]**
  - **showIf** `clean_for` includesAny [Leather sofa, Fabric sofa] (branch - only if a sofa picked)
- Pricing: clean_for + sofa_size, additive. property_type global.

### ✅ Carpet Cleaning (`carpet-cleaning`) - locked (structure; pricing TBD later)
- Q1 `cleaning_type` - radio, one - "Type of carpet cleaning?"
  - Rug Cleaning – 1 Rug
  - Rug Cleaning – 2 Rugs
  - Rug Cleaning – 3 Rugs
  - Rug Cleaning – 4 Rugs
  - Carpet Cleaning – Small room (~10×10 ft)
  - Carpet Cleaning – Medium room (~20×20 ft)
  - Carpet Cleaning – Large room (~30×30 ft)
- Single question only. property_type global. (Priced axis decided in later pricing pass.)

### ✅ Curtain Cleaning (`curtain-cleaning`) - locked (structure; pricing TBD later)
- Q1 `curtain_sizes` - **type `quantity`** (per-option count stepper 0/-/+), required (total ≥1) - "Choose your curtain sizes"
  - Full Height – Up to 40 inch
  - Full Height – Up to 60 inch
  - Full Height – Up to 100 inch
  - Half Height – Up to 40 inch
  - Half Height – Up to 60 inch
  - Half Height – Up to 100 inch
- Q2 `cleaning_type` - radio, one - "Type of cleaning" - Normal Cleaning · Dry Cleaning
- ⚠️ NEW question type `quantity` (see model note). Pricing later = unit price × qty per option.

---

## ✏️ Events group

### ✅ Event Planner (`event-planner`) - locked (structure; pricing TBD)
> Wedding + Event merged into one child (2026-05-31). Display name "Event & Wedding Planner" → "Event Planner", parent "Event & Weddings" → "Events" (2026-06-07).
- Q1 `event_for` - checkbox, min1 - "What event is this for?" - Marriage ceremony · Registration of Marriage (ROM) · Wedding reception / lunch / dinner · Pre-wedding portraits (outdoor, studio) · Studio or portrait session (family, baby, pets, graduation, etc) · Private event or party (birthday, office, school) · Corporate event (seminar, product launch, etc) · Others
- Q2 `venue` - radio, one - "Where will your event be held?" - Home · Office · Outdoor / Rooftop / Garden · Hotel Ballroom · Restaurant / Cafe · Studio
- Q3 `attendees` - **type `number`** - "How many attendees will be there?" (number only)
- Q4 `planning_services` - checkbox, multiple, min1 - "What event/wedding planning services do you need?" - Style/theme selection · Budget planning & management · Invite list & RSVP management · Selection of vendors · Coordination with vendors · Managing floor activity on the day

### ✅ Catering (`catering`) - locked (structure; pricing TBD)
- Q1 `halal` - radio, one - "Halal or Non-Halal?" - Halal · Non-Halal
- Q2 `event_for` - checkbox, multiple, min1 - "What event is this for?" - Marriage ceremony · Wedding reception / lunch / dinner · Private event or party (birthday, office, school) · Corporate event (seminar, product launch) · Daily meal sets · Others
- Q3 `cuisine` - checkbox, multiple, min1 - "Type of cuisine" - Malay · Chinese · Indian · Western · Thai · Japanese · Fusion/Mixed · Others (explain)
- Q4 `service_mode` - radio, one - "On-site or Delivery?" - On-site (cook/serve at venue) · Delivery (drop-off)
- Q5 `utensils_table` - checkbox, multiple - "Do you need utensils or table?" - Spoon/Fork/Plates · Tables · Chairs · Serving utensils · None
- property_type global. Photos: per-category toggle (OFF for catering). headcount dropped.

---

## ✏️ Home Improvement group

### ✅ Professional Organizer (`professional-organizer`) - locked (收纳师; structure; pricing TBD)
- Q1 `space` - checkbox, min1 - "Which space(s) to organize?" - Wardrobe/Closet · Kitchen/Pantry · Bedroom · Living room · Study/Office · Kids room · Storeroom · Whole home · Others (explain)
- Q2 `service_type` - checkbox, min1 - "What do you need?" - Decluttering · Space planning/layout · Storage system setup · Folding/categorizing · Labeling · Maintenance (recurring) · Others
- Q3 `home_size` - radio, one - "Home size" - Studio/1BR · 2BR · 3BR · 4BR · 5BR+ · Landed/Bungalow
- Q4 `supplies` - radio, one - "Need us to provide storage supplies (boxes, organizers)?" - Yes (PASS-THROUGH FEE, same rule as cleaning supplies) · No, I'll provide
- property_type global. Photos: per-category toggle ON.

### ✅ Aircond Installer (`aircond-installer`) - locked (structure; pricing TBD)
- Q1 `units` - **type `quantity`** (per-option count stepper 0/-/+), required (total ≥1) - "What type of aircon requires installation?"
  - description: "If your aircon unit is old, gas top up is mandatory."
  - Wall Unit – 1HP · Wall Unit – 1.5HP · Wall Unit – 2HP · Wall Unit – 2.5HP · Wall Unit – 3HP
  - Cassette Unit – 1HP · Cassette Unit – 1.5HP · Cassette Unit – 2HP · Cassette Unit – 2.5HP · Cassette Unit – 3HP
  - Dismantle Aircon ONLY
- Single question (uses `quantity` type). property_type global. Photos: per-category toggle ON.

### ✅ Carpenter (`carpenter`) - locked (structure; pricing TBD)
- Q1 `action` - radio, one - "What do you need?" - Repair · Install · Custom build · Dismantle/Remove
- Q2 `item` - checkbox, min1 - "What item?" - Cabinet (kitchen) · Wardrobe/Closet · Shelves/Storage · Door · Table/Desk · TV console · Bed frame · Flooring (parquet/laminate) · Decking/Outdoor · Others (explain)
- Q3 `material` - radio, one - "Material?" - Solid wood · Plywood · MDF · Laminate · Not sure / advise me
- Q4 `supply` - radio, one - "Supply the materials?" - Yes, supply + build (normal priced) · No, I have materials (labor only)
- property_type global. Photos: per-category toggle ON.

### ✅ Renovation (`renovation`) - locked (structure; pricing TBD)
- Q1 `project_type` - radio, one - "Renovation type?" - Full home · Single room · Kitchen · Bathroom/Toilet · Extension/Add-on · Commercial/Office
- Q2 `scope` - checkbox, min1 - "What work?" - Hacking/Demolition · Tiling/Flooring · Plastering/Painting · Plumbing · Electrical/Wiring · Ceiling · Built-in carpentry · Waterproofing · Grille/Window/Door · Others (explain)
- Q3 `property_status` - radio, one - "Property status?" - New/Empty unit · Currently occupied · Old/Renovating over existing
- Q4 `size` - type `number` - "Approx area (sqft)?"
- Q5 `details` - text - "Describe your renovation plan."
- property_type global. Photos ON. requiresInspection OFF for demo (inspection-first flow deferred).

### ✅ Interior Design (`interior-design`) - locked (structure; pricing TBD)
- Q1 `service_level` - radio, one - "Service level?" - Consultation only · Concept + 3D design · Design + project management · Full turnkey (design + build)
- Q2 `scope` - radio, one - "Scope?" - Single room · Whole home · Commercial/Office
- Q3 `rooms` - checkbox, min1 - "Which space(s)?" - Living · Dining · Kitchen · Master bedroom · Bedroom · Bathroom · Study/Office · Balcony · Others (explain)
- Q4 `style` - checkbox, min0 - "Preferred style(s)?" - Modern/Contemporary · Minimalist · Scandinavian · Industrial · Luxury/Classic · Muji/Japandi · Not sure / advise me
- Q5 `size` - type `number` - "Approx area (sqft)?"
- Q6 `details` - text - "Describe your vision / requirements."
- property_type global. Photos ON. requiresInspection OFF for demo (inspection-first flow deferred).

### ✅ Door Gate (`door-gate`) - locked (structure; pricing TBD)
- Q1 `action` - radio, one - "What do you need?" - New install · Repair · Replace · Service/Maintenance
- Q2 `gate_type` - checkbox, min1 - "Gate/door type?" - Autogate (swing) · Autogate (sliding) · Folding gate · Grille gate · Security/Metal door · Roller shutter · Others (explain)
- Q3 `component` - checkbox, min0 - "What part? (if repair)" - Motor/Engine · Remote/Controller · Track/Roller · Hinge · Sensor · Battery/Backup · Wiring · Not sure
- Q4 `problem` - checkbox, min0 - "Problem?" - Not moving · Slow/Weak · Noisy · Remote not working · Off-track/Stuck · Rust/Damaged · Others (explain)
- property_type global. Photos ON.

### ✅ Roof (`roof`) - locked (structure; pricing TBD)
- Q1 `action` - radio, one - "What do you need?" - Leak repair · Tile/Sheet replacement · Gutter clean/repair · Waterproofing · Full re-roofing · Inspection only
- Q2 `roof_type` - radio, one - "Roof type?" - Clay/Concrete tile · Metal/Zinc · Polycarbonate/Awning · Concrete flat roof · Not sure
- Q3 `problem` - checkbox, min0 - "Problem?" - Active leak · Water stain (ceiling) · Broken/Missing tiles · Sagging · Moss/Algae · Clogged gutter · Others (explain)
- Q4 `details` - text - "Describe + location of issue."
- property_type global. Photos ON. requiresInspection OFF for demo (inspection-first flow deferred).

---

## ✅ Home Maintenance group (aircond-servicer ✅, plumber ✅ above)

### ✅ Electrical & Wiring (`electrical-wiring`) - locked (structure; pricing TBD)
- Q1 `action` - radio, one - "What do you need?" - Install · Repair · Replace · Inspection/Testing
- Q2 `item` - checkbox, min1 - "What item?" - Wiring/Rewiring · Power socket/Switch · Lighting/Downlight · Ceiling fan · Distribution board (DB) · Water heater point · Doorbell/Intercom · Others (explain)
- Q3 `problem` - checkbox, min0 - "Problem?" - Power trip/Short · No power · Flickering · Sparking/Burning smell · Overheating · Adding new point · Not sure (explain)
- property_type global. Photos ON.

---

## ✅ Electrical Appliance Repair group - locked (structure; pricing TBD)
> Shared repair pattern: brand · problem · age · (item-specific). property_type global, Photos ON.

### Washing Machine & Dryer Repair (`washing-machine-repair`)
- Q1 `appliance` - radio, one - "Which appliance?" - Washing machine (top load) · Washing machine (front load) · Dryer · Washer-dryer combo
- Q2 `problem` - checkbox, min1 - "Problem?" - Not powering on · Not spinning · Not draining · Leaking water · Noisy/Vibrating · Door/Lid stuck · Not heating (dryer) · Error code · Others (explain)
- Q3 `brand` - text - "Brand & model (if known)"

### Refrigerator Repair (`refrigerator-repair`)
- Q1 `fridge_type` - radio, one - "Type?" - Single door · Double door · Side-by-side · Mini/Bar fridge · Chest freezer
- Q2 `problem` - checkbox, min1 - "Problem?" - Not cooling · Not powering on · Leaking water · Frost build-up · Noisy · Water dispenser fault · Door seal · Others (explain)
- Q3 `brand` - text - "Brand & model (if known)"

### TV Repair (`tv-repair`)
- Q1 `tv_type` - radio, one - "TV type?" - LED/LCD · OLED · Plasma · Projector · Smart TV
- Q2 `problem` - checkbox, min1 - "Problem?" - No power · No display/Black screen · Lines/Spots · No sound · Cracked screen · No signal/Smart app fault · Others (explain)
- Q3 `brand` - text - "Brand, model & screen size (if known)"

### Oven Repair (`oven-repair`)
- Q1 `oven_type` - radio, one - "Type?" - Built-in oven · Freestanding · Microwave · Microwave-oven combo · Gas oven
- Q2 `problem` - checkbox, min1 - "Problem?" - Not heating · Not powering on · Uneven heating · Door fault · Timer/Control fault · Sparking · Others (explain)
- Q3 `brand` - text - "Brand & model (if known)"

### Water Heater Repair (`water-heater-repair`)
- Q1 `heater_type` - radio, one - "Type?" - Instant (single point) · Storage tank · Multipoint · Solar · Heat pump
- Q2 `problem` - checkbox, min1 - "Problem?" - No hot water · Not powering on · Leaking · Tripping/Electrical · Low pressure · Noisy · Others (explain)
- Q3 `brand` - text - "Brand & model (if known)"

### Ceiling Fan Repair (`ceiling-fan-repair`)
- Q1 `fan_type` - radio, one - "Type?" - Standard ceiling fan · Decorative/DC fan · Industrial · With light kit · Remote-controlled
- Q2 `problem` - checkbox, min1 - "Problem?" - Not spinning · Slow/Weak · Wobbling · Noisy · Not powering on · Remote/Control fault · Light fault · Others (explain)
- Q3 `brand` - text - "Brand & model (if known)"

### Aircond Repair (`aircond-repair`)
- Q1 `aircon_type` - radio, one - "Type?" - Wall-mounted (split) · Cassette/Ceiling · Portable · Window · Inverter
- Q2 `problem` - checkbox, min1 - "Problem?" - Not cold · Not powering on · Water leaking · Bad smell · Noisy · Remote fault · Needs gas top-up · Error code · Others (explain)
- Q3 `units` - type `number` - "How many units?"
- Q4 `brand` - text - "Brand & model (if known)"

---

## ✅ Training and Classes group - locked (structure; pricing TBD)
> Shared pattern: level/focus · format (in-person/online) · location · frequency · learner.
> property_type usually N/A but kept global. Photos: per-category toggle OFF.

### Art Class (`art-class`)
- Q1 `art_type` - checkbox, min1 - "Art focus?" - Drawing/Sketching · Painting (acrylic/oil/watercolor) · Digital art · Pottery/Ceramics · Calligraphy · Craft/DIY · Others (explain)
- Q2 `level` - radio, one - "Level?" - Beginner · Intermediate · Advanced · Kids
- Q3 `format` - radio, one - "Format?" - In-person (at tutor) · In-person (at my home) · Online
- Q4 `frequency` - radio, one - "Frequency?" - One-off/Trial · Weekly · Intensive/Holiday program
- Q5 `learner` - radio, one - "Who's learning?" - Child · Teen · Adult · Group

### Language Class (`language-class`)
- Q1 `language` - checkbox, min1 - "Which language?" - English · Mandarin · Malay · Japanese · Korean · French · Arabic · Others (explain)
- Q2 `goal` - radio, one - "Goal?" - Conversational · Exam/Cert · Business · Academic · Beginner basics
- Q3 `level` - radio, one - "Level?" - Beginner · Intermediate · Advanced
- Q4 `format` - radio, one - "Format?" - In-person (at tutor) · In-person (at my home) · Online
- Q5 `frequency` - radio, one - "Frequency?" - One-off/Trial · Weekly · Intensive

### Music Class (`music-class`)
- Q1 `instrument` - checkbox, min1 - "Instrument/focus?" - Piano · Guitar · Violin · Drums · Vocal/Singing · Ukulele · Music theory · Others (explain)
- Q2 `level` - radio, one - "Level?" - Beginner · Intermediate · Advanced · Exam prep (ABRSM etc)
- Q3 `format` - radio, one - "Format?" - In-person (at tutor) · In-person (at my home) · Online
- Q4 `frequency` - radio, one - "Frequency?" - One-off/Trial · Weekly · Intensive
- Q5 `learner` - radio, one - "Who's learning?" - Child · Teen · Adult

### Home Tutoring (`home-tutoring`)
- Q1 `level` - radio, one - "Education level?" - Primary · Lower Sec (Form 1-3/PT3) · SPM · Pre-U (STPM/A-Level/Foundation) · University · Adult/Skills
- Q2 `subjects` - checkbox, min1 - "Subjects?" - Math · Add Math · Science · Physics · Chemistry · Biology · BM · English · Mandarin · History · Accounts · Others (explain)
- Q3 `format` - radio, one - "Format?" - At my home · At tutor · Online
- Q4 `frequency` - radio, one - "Frequency?" - One-off/Trial · Weekly · Intensive (exam prep)
- Q5 `students` - type `number` - "How many students?"

### Cooking Class (`cooking-class`)
- Q1 `cuisine` - checkbox, min1 - "Cuisine/focus?" - Malay · Chinese · Western · Baking/Pastry · Desserts · Healthy/Diet · Kids cooking · Others (explain)
- Q2 `level` - radio, one - "Level?" - Beginner · Intermediate · Advanced
- Q3 `format` - radio, one - "Format?" - In-person (at venue) · In-person (at my home) · Online
- Q4 `setup` - radio, one - "Class type?" - Private (1-on-1) · Small group · Workshop/Event
- Q5 `ingredients` - radio, one - "Provide ingredients?" - Yes (PASS-THROUGH FEE) · No, I'll provide

### Private Gym Trainer (`gym-trainer`)
- Q1 `goal` - checkbox, min1 - "Goal?" - Weight loss · Muscle gain · General fitness · Strength · Rehab/Recovery · Sport-specific · Others (explain)
- Q2 `format` - radio, one - "Where?" - At my home · At gym · Outdoor/Park · Online
- Q3 `frequency` - radio, one - "Frequency?" - One-off/Trial · 1×/week · 2-3×/week · Daily
- Q4 `trainee` - radio, one - "Who?" - Individual · Couple · Small group
- Q5 `gender_pref` - radio, one - "Trainer gender preference?" - Male · Female · No preference

### 3D Modeling Class (`3d-modeling-class`)
- Q1 `focus` - checkbox, min1 - "Focus?" - General 3D modeling · Game assets · Product/Industrial · Architecture/Interior viz · Animation/Rigging · 3D printing prep · Sculpting · Others (explain)
- Q2 `software` - checkbox, min0 - "Software?" - Blender · Maya · 3ds Max · ZBrush · SketchUp · Fusion 360 · Not sure / advise me
- Q3 `level` - radio, one - "Level?" - Beginner · Intermediate · Advanced
- Q4 `format` - radio, one - "Format?" - Online · In-person (at tutor) · In-person (at my home)
- Q5 `frequency` - radio, one - "Frequency?" - One-off/Trial · Weekly · Intensive

---

## ✅ Tech & IT group - locked (structure; pricing TBD)

### Alarm & CCTV Services (`alarm-cctv`)
- Q1 `service` - radio, one - "What do you need?" - New install · Add/Expand system · Repair · Maintenance/Servicing · Relocate
- Q2 `system` - checkbox, min1 - "System type?" - CCTV cameras · Alarm system · Door access/Intercom · Smart doorbell · Motion sensors · Others (explain)
- Q3 `cameras` - type `number` - "How many cameras/devices?"
- Q4 `location` - checkbox, min0 - "Where?" - Indoor · Outdoor · Entrance/Gate · Perimeter · Multiple floors
- Q5 `supply` - radio, one - "Supply the equipment?" - Yes, supply + install · No, I have equipment (install only)
- property_type global. Photos ON.
- Q5 `vendors` - checkbox, multiple - "What vendors need to be sourced?" - Photography · Videography · Cake Baker · Event/Wedding Planning · Catering · Makeup/Hair · Dresses/Gowns · Suit Tailor · Custom Shoes/Heels · Cards/Printer · Music/Entertainment · Emcee/Deejay · Flowers/Decoration · Space/Venue · Equipment/Set-up · Gifts/Favours
- Q6 `duration_hours` - **type `number`** - "Duration of event (hours)"
- Q7 `details` - text - "Share as much detail as you can for the vendor to give a good cost estimate."
- Q8 photos - per-category photo toggle (`photosEnabled`, admin) - ON for Wedding Planner. Not a per-category question; a Category Settings flag.
- ⚠️ NEW type: `number` (attendees, duration). Photos + property_type are global. Q4 radio-vs-checkbox: CONFIRM.
