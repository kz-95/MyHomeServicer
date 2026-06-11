/**
 * Static seed data - categories, platform settings, penalty rules and
 * feature flags. Mirrors seed-plan.md.
 */

/** Per-language label overrides (en is the canonical `label`). Matches the
 *  `Localized` shape in json-schemas.ts; attached at seed time from QUESTION_I18N. */
export type SeedI18n = { en?: string; ms?: string; zh?: string; ta?: string };

/** One custom question shown in the quote form's Details step. */
export interface QuoteQuestion {
  key: string;
  label: string;
  labelI18n?: SeedI18n;
  /**
   * Input types:
   *  - checkbox  - multi-select from a fixed option list (answer: string[])
   *  - radio     - single-select from a fixed option list (answer: string)
   *  - text      - free-text field (answer: string)
   *  - quantity  - per-option count stepper (answer: Record<optionValue, number>)
   *  - number    - single numeric input, informational (answer: number)
   */
  type: "checkbox" | "radio" | "text" | "quantity" | "number";
  required: boolean;
  /**
   * When true, the options on this question carry merchant-set prices - the
   * servicer listing form renders an option-price grid for them and the
   * proposal price box is pre-filled from the customer's selections.
   * When false (or absent), the question is informational only (property type,
   * free text) and is shown in the quote wizard but never linked to a price.
   */
  priced?: boolean;
  description?: string;
  minSelect?: number;
  maxSelect?: number;
  showIf?: { questionKey: string; includesAny: string[] };
  options?: { value: string; label: string; labelI18n?: SeedI18n }[];
}

/** Top-level grouping category (no price / questions - browse only). */
interface SeedParentCategory {
  slug: string;
  name: string;
  icon: string;
}

/** Leaf-level service category (what merchants list under + customers quote). */
interface SeedChildCategory {
  parentSlug: string;
  slug: string;
  name: string;
  icon: string;
  price: number;
  duration: number;
  /** When true, the quote form shows the optional photo upload for this category. */
  photosEnabled?: boolean;
  /**
   * When true, this category requires an on-site inspection before a final
   * quote can be given (e.g. renovation, roof). The first booking is an
   * inspection booking; the servicer submits a final work proposal afterward.
   */
  requiresInspection?: boolean;
  /** Short description shown in the browse card + injected into the chat catalog so the
   *  assistant can match a customer's wording (e.g. "repaint" -> Painting). */
  description?: string;
  /** Card/banner image served from frontend assets (e.g. assets/Images/Foo01.png). When
   *  absent the browse page falls back to a slug-keyed placeholder. */
  imageUrl?: string;
  /** Custom Details-step questions for this child (aircond-servicer is the sample). */
  questions?: QuoteQuestion[];
}

/**
 * Sample question set - aircond-servicer.
 * NOTE: property_type is now a GLOBAL quote field (not per-category) - removed from here.
 */
const airconQuestions: QuoteQuestion[] = [
  {
    key: "aircon_service",
    label: "Select type of aircon and type of cleaning",
    type: "checkbox",
    required: true,
    // priced: true - servicer sets a price per option in the listing form;
    // customer's selections pre-fill the proposal price box (Phase 6).
    priced: true,
    description: "You can select more than one type of cleaning.",
    options: [
      {
        value: "wall_chemical",
        label: "Wall Unit - Chemical Cleaning (Recommended)",
      },
      { value: "wall_general", label: "Wall Unit - General Cleaning" },
      { value: "wall_overhaul", label: "Wall Unit - Overhaul Cleaning" },
      {
        value: "cassette_general",
        label: "Cassette / Ceiling Unit - General Cleaning",
      },
      {
        value: "cassette_chemical",
        label: "Cassette / Ceiling Unit - Chemical Cleaning",
      },
      {
        value: "cassette_overhaul",
        label: "Cassette / Ceiling Unit - Overhaul Cleaning",
      },
      {
        value: "faulty_check",
        label: "Check faulty aircon (please give details below)",
      },
    ],
  },
];

/** The 7 top-level parent categories (browse groupings only - no price or questions). */
export const categories: SeedParentCategory[] = [
  { slug: "cleaning-service", name: "Cleaning Service", icon: "sparkles" },
  { slug: "events-weddings", name: "Events", icon: "party-popper" },
  { slug: "home-improvement", name: "Home Improvement", icon: "hammer" },
  { slug: "home-maintenance", name: "Home Maintenance", icon: "wrench" },
  {
    slug: "appliance-repair",
    name: "Electrical Appliance Repair",
    icon: "zap",
  },
  { slug: "training-classes", name: "Training and Classes", icon: "book" },
  { slug: "tech-it", name: "Tech & IT", icon: "monitor" },
];

/** The 29 leaf-level service children (what merchants list under + customers quote). */
export const children: SeedChildCategory[] = [
  // ── Cleaning Service ──
  {
    parentSlug: "cleaning-service",
    slug: "home-cleaning",
    name: "Home Cleaning",
    icon: "sparkles",
    price: 60,
    duration: 120,
    photosEnabled: false,
    questions: [
      {
        key: "cleaning_option",
        label: "Choose cleaning option",
        type: "radio",
        required: true,
        priced: true,
        description:
          "Please note we are not able to extend the hours once our team is already on-site.",
        options: [
          {
            value: "1h_2c",
            label: "1 hour × 2 cleaners (recommended for studio)",
          },
          {
            value: "2h_2c",
            label: "2 hours × 2 cleaners (recommended for 2 bedroom apartment)",
          },
          {
            value: "3h_2c",
            label: "3 hours × 2 cleaners (recommended for 2–3 bedroom home)",
          },
          {
            value: "4h_2c",
            label: "4 hours × 2 cleaners (recommended for semi-d or bungalow)",
          },
        ],
      },
      {
        key: "cleaning_supplies",
        label: "Do you need us to provide cleaning supplies?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          {
            value: "single_session",
            label: "Single session (supplies provided)",
          },
          { value: "no_i_provide", label: "No, I will provide (RM0)" },
        ],
      },
      {
        key: "pets",
        label: "Do you have any pet(s)?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "no_pets", label: "I don't have pets" },
          { value: "cat", label: "Cat(s)" },
          { value: "dog", label: "Dog(s)" },
          { value: "others", label: "Others (explain below)" },
        ],
      },
    ],
  },
  {
    parentSlug: "cleaning-service",
    slug: "sofa-mattress-cleaning",
    name: "Sofa / Mattress Cleaning",
    icon: "sofa",
    price: 80,
    duration: 90,
    photosEnabled: false,
    questions: [
      {
        key: "clean_for",
        label: "Cleaning for:",
        type: "checkbox",
        required: true,
        priced: true,
        minSelect: 1,
        options: [
          { value: "leather_sofa", label: "Leather sofa" },
          { value: "fabric_sofa", label: "Fabric sofa" },
          { value: "single_mattress", label: "Single mattress" },
          { value: "queen_mattress", label: "Queen mattress" },
          { value: "king_mattress", label: "King mattress" },
        ],
      },
      {
        key: "sofa_size",
        label: "Sofa size",
        type: "radio",
        required: false,
        priced: true,
        showIf: {
          questionKey: "clean_for",
          includesAny: ["leather_sofa", "fabric_sofa"],
        },
        options: [
          { value: "1_seater", label: "1-seater" },
          { value: "2_seater", label: "2-seater" },
          { value: "3_seater", label: "3-seater" },
          { value: "4_seater", label: "4-seater" },
          { value: "l_shape", label: "L-shape" },
        ],
      },
    ],
  },
  {
    parentSlug: "cleaning-service",
    slug: "carpet-cleaning",
    name: "Carpet Cleaning",
    icon: "bubbles",
    price: 70,
    duration: 90,
    photosEnabled: false,
    questions: [
      {
        key: "cleaning_type",
        label: "Type of carpet cleaning?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "rug_1", label: "Rug Cleaning – 1 Rug" },
          { value: "rug_2", label: "Rug Cleaning – 2 Rugs" },
          { value: "rug_3", label: "Rug Cleaning – 3 Rugs" },
          { value: "rug_4", label: "Rug Cleaning – 4 Rugs" },
          {
            value: "carpet_small",
            label: "Carpet Cleaning – Small room (~10×10 ft)",
          },
          {
            value: "carpet_medium",
            label: "Carpet Cleaning – Medium room (~20×20 ft)",
          },
          {
            value: "carpet_large",
            label: "Carpet Cleaning – Large room (~30×30 ft)",
          },
        ],
      },
    ],
  },
  {
    parentSlug: "cleaning-service",
    slug: "curtain-cleaning",
    name: "Curtain Cleaning",
    icon: "sun",
    price: 50,
    duration: 60,
    photosEnabled: false,
    questions: [
      {
        key: "curtain_sizes",
        label: "Choose your curtain sizes",
        type: "quantity",
        required: true,
        priced: true,
        options: [
          { value: "full_height_40", label: "Full Height – Up to 40 inch" },
          { value: "full_height_60", label: "Full Height – Up to 60 inch" },
          { value: "full_height_100", label: "Full Height – Up to 100 inch" },
          { value: "half_height_40", label: "Half Height – Up to 40 inch" },
          { value: "half_height_60", label: "Half Height – Up to 60 inch" },
          { value: "half_height_100", label: "Half Height – Up to 100 inch" },
        ],
      },
      {
        key: "cleaning_type",
        label: "Type of cleaning",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "normal_cleaning", label: "Normal Cleaning" },
          { value: "dry_cleaning", label: "Dry Cleaning" },
        ],
      },
    ],
  },
  // ── Events ──
  {
    parentSlug: "events-weddings",
    slug: "event-planner",
    name: "Event Planner",
    icon: "party-popper",
    price: 1000,
    duration: 300,
    photosEnabled: true,
    questions: [
      {
        key: "event_for",
        label: "What event is this for?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "marriage_ceremony", label: "Marriage ceremony" },
          { value: "rom", label: "Registration of Marriage (ROM)" },
          {
            value: "wedding_reception",
            label: "Wedding reception / lunch / dinner",
          },
          {
            value: "pre_wedding_portraits",
            label: "Pre-wedding portraits (outdoor, studio)",
          },
          {
            value: "studio_portrait",
            label:
              "Studio or portrait session (family, baby, pets, graduation, etc)",
          },
          {
            value: "private_event",
            label: "Private event or party (birthday, office, school)",
          },
          {
            value: "corporate_event",
            label: "Corporate event (seminar, product launch, etc)",
          },
          { value: "others", label: "Others" },
        ],
      },
      {
        key: "venue",
        label: "Where will your event be held?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "home", label: "Home" },
          { value: "office", label: "Office" },
          { value: "outdoor", label: "Outdoor / Rooftop / Garden" },
          { value: "hotel_ballroom", label: "Hotel Ballroom" },
          { value: "restaurant_cafe", label: "Restaurant / Cafe" },
          { value: "glasshouse", label: "Glasshouse" },
          { value: "studio", label: "Studio" },
        ],
      },
      {
        key: "attendees",
        label: "How many attendees will be there?",
        type: "number",
        required: false,
        priced: false,
      },
      {
        key: "planning_services",
        label: "What event/wedding planning services do you need?",
        type: "checkbox",
        required: true,
        priced: true,
        minSelect: 1,
        options: [
          { value: "style_theme", label: "Style/theme selection" },
          { value: "budget_planning", label: "Budget planning & management" },
          { value: "invite_rsvp", label: "Invite list & RSVP management" },
          { value: "vendor_selection", label: "Selection of vendors" },
          { value: "vendor_coordination", label: "Coordination with vendors" },
          {
            value: "floor_activity",
            label: "Managing floor activity on the day",
          },
        ],
      },
      {
        key: "vendors",
        label: "What vendors need to be sourced?",
        type: "checkbox",
        required: false,
        priced: false,
        options: [
          { value: "photography", label: "Photography" },
          { value: "videography", label: "Videography" },
          { value: "cake_baker", label: "Cake Baker" },
          { value: "event_planning", label: "Event/Wedding Planning" },
          { value: "catering", label: "Catering" },
          { value: "makeup_hair", label: "Makeup/Hair" },
          { value: "dresses_gowns", label: "Dresses/Gowns" },
          { value: "suit_tailor", label: "Suit Tailor" },
          { value: "custom_shoes", label: "Custom Shoes/Heels" },
          { value: "cards_printer", label: "Cards/Printer" },
          { value: "music_entertainment", label: "Music/Entertainment" },
          { value: "emcee_deejay", label: "Emcee/Deejay" },
          { value: "flowers_decoration", label: "Flowers/Decoration" },
          { value: "space_venue", label: "Space/Venue" },
          { value: "equipment_setup", label: "Equipment/Set-up" },
          { value: "gifts_favours", label: "Gifts/Favours" },
        ],
      },
      {
        key: "duration_hours",
        label: "Duration of event (hours)",
        type: "number",
        required: false,
        priced: false,
      },
      {
        key: "details",
        label:
          "Share as much detail as you can for the vendor to give a good cost estimate.",
        type: "text",
        required: false,
        priced: false,
      },
    ],
  },
  {
    parentSlug: "events-weddings",
    slug: "catering",
    name: "Catering Service",
    icon: "chef-hat",
    price: 50,
    duration: 180,
    photosEnabled: false,
    questions: [
      {
        key: "halal",
        label: "Halal or Non-Halal?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "halal", label: "Halal" },
          { value: "non_halal", label: "Non-Halal" },
        ],
      },
      {
        key: "event_for",
        label: "What event is this for?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "marriage_ceremony", label: "Marriage ceremony" },
          {
            value: "wedding_reception",
            label: "Wedding reception / lunch / dinner",
          },
          {
            value: "private_event",
            label: "Private event or party (birthday, office, school)",
          },
          {
            value: "corporate_event",
            label: "Corporate event (seminar, product launch)",
          },
          { value: "daily_meal_sets", label: "Daily meal sets" },
          { value: "others", label: "Others" },
        ],
      },
      {
        key: "cuisine",
        label: "Type of cuisine",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "malay", label: "Malay" },
          { value: "chinese", label: "Chinese" },
          { value: "indian", label: "Indian" },
          { value: "western", label: "Western" },
          { value: "thai", label: "Thai" },
          { value: "japanese", label: "Japanese" },
          { value: "fusion_mixed", label: "Fusion/Mixed" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "service_mode",
        label: "On-site or Delivery?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "on_site", label: "On-site (cook/serve at venue)" },
          { value: "delivery", label: "Delivery (drop-off)" },
        ],
      },
      {
        key: "utensils_table",
        label: "Do you need utensils or table?",
        type: "checkbox",
        required: false,
        priced: false,
        options: [
          { value: "spoon_fork_plates", label: "Spoon/Fork/Plates" },
          { value: "tables", label: "Tables" },
          { value: "chairs", label: "Chairs" },
          { value: "serving_utensils", label: "Serving utensils" },
          { value: "none", label: "None" },
        ],
      },
      {
        key: "pax",
        label: "Number of guests (pax)",
        type: "quantity",
        required: true,
        priced: true,
        description: "Servicer sets a per-person rate for catering.",
        options: [{ value: "person", label: "Per person" }],
      },
    ],
  },
  // ── Home Improvement ──
  {
    parentSlug: "home-improvement",
    slug: "professional-organizer",
    name: "Professional Organizer",
    icon: "layout",
    price: 80,
    duration: 120,
    photosEnabled: true,
    questions: [
      {
        key: "space",
        label: "Which space(s) to organize?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "wardrobe_closet", label: "Wardrobe/Closet" },
          { value: "kitchen_pantry", label: "Kitchen/Pantry" },
          { value: "bedroom", label: "Bedroom" },
          { value: "living_room", label: "Living room" },
          { value: "study_office", label: "Study/Office" },
          { value: "kids_room", label: "Kids room" },
          { value: "storeroom", label: "Storeroom" },
          { value: "whole_home", label: "Whole home" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "service_type",
        label: "What do you need?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "decluttering", label: "Decluttering" },
          { value: "space_planning", label: "Space planning/layout" },
          { value: "storage_setup", label: "Storage system setup" },
          { value: "folding_categorizing", label: "Folding/categorizing" },
          { value: "labeling", label: "Labeling" },
          { value: "maintenance", label: "Maintenance (recurring)" },
          { value: "others", label: "Others" },
        ],
      },
      {
        key: "home_size",
        label: "Home size",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "studio_1br", label: "Studio/1BR" },
          { value: "2br", label: "2BR" },
          { value: "3br", label: "3BR" },
          { value: "4br", label: "4BR" },
          { value: "5br_plus", label: "5BR+" },
          { value: "landed_bungalow", label: "Landed/Bungalow" },
        ],
      },
      {
        key: "supplies",
        label: "Need us to provide storage supplies (boxes, organizers)?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          {
            value: "yes_provide",
            label: "Yes (supplies provided - pass-through fee applies)",
          },
          { value: "no_i_provide", label: "No, I'll provide" },
        ],
      },
    ],
  },
  {
    parentSlug: "home-improvement",
    slug: "aircond-installer",
    name: "Aircond Installer",
    icon: "wind",
    price: 400,
    duration: 180,
    photosEnabled: true,
    questions: [
      {
        key: "units",
        label: "What type of aircon requires installation?",
        type: "quantity",
        required: true,
        priced: true,
        description: "If your aircon unit is old, gas top up is mandatory.",
        options: [
          { value: "wall_1hp", label: "Wall Unit – 1HP" },
          { value: "wall_1_5hp", label: "Wall Unit – 1.5HP" },
          { value: "wall_2hp", label: "Wall Unit – 2HP" },
          { value: "wall_2_5hp", label: "Wall Unit – 2.5HP" },
          { value: "wall_3hp", label: "Wall Unit – 3HP" },
          { value: "cassette_1hp", label: "Cassette Unit – 1HP" },
          { value: "cassette_1_5hp", label: "Cassette Unit – 1.5HP" },
          { value: "cassette_2hp", label: "Cassette Unit – 2HP" },
          { value: "cassette_2_5hp", label: "Cassette Unit – 2.5HP" },
          { value: "cassette_3hp", label: "Cassette Unit – 3HP" },
          { value: "dismantle_only", label: "Dismantle Aircon ONLY" },
        ],
      },
    ],
  },
  {
    parentSlug: "home-improvement",
    slug: "carpenter",
    name: "Carpenter",
    icon: "hammer",
    price: 150,
    duration: 120,
    photosEnabled: true,
    questions: [
      {
        key: "action",
        label: "What do you need?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "repair", label: "Repair" },
          { value: "install", label: "Install" },
          { value: "custom_build", label: "Custom build" },
          { value: "dismantle_remove", label: "Dismantle/Remove" },
        ],
      },
      {
        key: "item",
        label: "What item?",
        type: "checkbox",
        required: true,
        priced: true,
        minSelect: 1,
        options: [
          { value: "cabinet_kitchen", label: "Cabinet (kitchen)" },
          { value: "wardrobe_closet", label: "Wardrobe/Closet" },
          { value: "shelves_storage", label: "Shelves/Storage" },
          { value: "door", label: "Door" },
          { value: "table_desk", label: "Table/Desk" },
          { value: "tv_console", label: "TV console" },
          { value: "bed_frame", label: "Bed frame" },
          { value: "flooring", label: "Flooring (parquet/laminate)" },
          { value: "decking_outdoor", label: "Decking/Outdoor" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "material",
        label: "Material?",
        type: "radio",
        required: false,
        priced: false,
        options: [
          { value: "solid_wood", label: "Solid wood" },
          { value: "plywood", label: "Plywood" },
          { value: "mdf", label: "MDF" },
          { value: "laminate", label: "Laminate" },
          { value: "not_sure", label: "Not sure / advise me" },
        ],
      },
      {
        key: "supply",
        label: "Supply the materials?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          {
            value: "yes_supply_build",
            label: "Yes, supply + build (normal priced)",
          },
          {
            value: "no_i_have_materials",
            label: "No, I have materials (labor only)",
          },
        ],
      },
    ],
  },
  {
    parentSlug: "home-improvement",
    slug: "renovation",
    name: "Renovation",
    icon: "hard-hat",
    price: 500,
    duration: 240,
    photosEnabled: true,
    requiresInspection: true,
    questions: [
      {
        key: "project_type",
        label: "Renovation type?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "full_home", label: "Full home" },
          { value: "single_room", label: "Single room" },
          { value: "kitchen", label: "Kitchen" },
          { value: "bathroom_toilet", label: "Bathroom/Toilet" },
          { value: "extension_add_on", label: "Extension/Add-on" },
          { value: "commercial_office", label: "Commercial/Office" },
        ],
      },
      {
        key: "scope",
        label: "What work?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "hacking_demolition", label: "Hacking/Demolition" },
          { value: "tiling_flooring", label: "Tiling/Flooring" },
          { value: "plastering_painting", label: "Plastering/Painting" },
          { value: "plumbing", label: "Plumbing" },
          { value: "electrical_wiring", label: "Electrical/Wiring" },
          { value: "ceiling", label: "Ceiling" },
          { value: "built_in_carpentry", label: "Built-in carpentry" },
          { value: "waterproofing", label: "Waterproofing" },
          { value: "grille_window_door", label: "Grille/Window/Door" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "property_status",
        label: "Property status?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "new_empty", label: "New/Empty unit" },
          { value: "currently_occupied", label: "Currently occupied" },
          { value: "old_renovating", label: "Old/Renovating over existing" },
        ],
      },
      {
        key: "size",
        label: "Approx area (sqft)?",
        type: "number",
        required: false,
        priced: false,
      },
      {
        key: "details",
        label: "Describe your renovation plan.",
        type: "text",
        required: false,
        priced: false,
      },
    ],
  },
  {
    parentSlug: "home-improvement",
    slug: "interior-design",
    name: "Interior Design",
    icon: "paintbrush",
    price: 300,
    duration: 180,
    photosEnabled: true,
    questions: [
      {
        key: "service_level",
        label: "Service level?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "consultation_only", label: "Consultation only" },
          { value: "concept_3d", label: "Concept + 3D design" },
          { value: "design_pm", label: "Design + project management" },
          { value: "full_turnkey", label: "Full turnkey (design + build)" },
        ],
      },
      {
        key: "scope",
        label: "Scope?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "single_room", label: "Single room" },
          { value: "whole_home", label: "Whole home" },
          { value: "commercial_office", label: "Commercial/Office" },
        ],
      },
      {
        key: "rooms",
        label: "Which space(s)?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "living", label: "Living" },
          { value: "dining", label: "Dining" },
          { value: "kitchen", label: "Kitchen" },
          { value: "master_bedroom", label: "Master bedroom" },
          { value: "bedroom", label: "Bedroom" },
          { value: "bathroom", label: "Bathroom" },
          { value: "study_office", label: "Study/Office" },
          { value: "balcony", label: "Balcony" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "style",
        label: "Preferred style(s)?",
        type: "checkbox",
        required: false,
        priced: false,
        minSelect: 0,
        options: [
          { value: "modern_contemporary", label: "Modern/Contemporary" },
          { value: "minimalist", label: "Minimalist" },
          { value: "scandinavian", label: "Scandinavian" },
          { value: "industrial", label: "Industrial" },
          { value: "luxury_classic", label: "Luxury/Classic" },
          { value: "muji_japandi", label: "Muji/Japandi" },
          { value: "not_sure", label: "Not sure / advise me" },
        ],
      },
      {
        key: "size",
        label: "Approx area (sqft)?",
        type: "number",
        required: false,
        priced: false,
      },
      {
        key: "details",
        label: "Describe your vision / requirements.",
        type: "text",
        required: false,
        priced: false,
      },
    ],
  },
  {
    parentSlug: "home-improvement",
    slug: "door-gate",
    name: "Door Gate",
    icon: "door-open",
    price: 100,
    duration: 90,
    photosEnabled: true,
    questions: [
      {
        key: "action",
        label: "What do you need?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "new_install", label: "New install" },
          { value: "repair", label: "Repair" },
          { value: "replace", label: "Replace" },
          { value: "service_maintenance", label: "Service/Maintenance" },
        ],
      },
      {
        key: "gate_type",
        label: "Gate/door type?",
        type: "checkbox",
        required: true,
        priced: true,
        minSelect: 1,
        options: [
          { value: "autogate_swing", label: "Autogate (swing)" },
          { value: "autogate_sliding", label: "Autogate (sliding)" },
          { value: "folding_gate", label: "Folding gate" },
          { value: "grille_gate", label: "Grille gate" },
          { value: "security_metal_door", label: "Security/Metal door" },
          { value: "roller_shutter", label: "Roller shutter" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "component",
        label: "What part? (if repair)",
        type: "checkbox",
        required: false,
        priced: false,
        minSelect: 0,
        options: [
          { value: "motor_engine", label: "Motor/Engine" },
          { value: "remote_controller", label: "Remote/Controller" },
          { value: "track_roller", label: "Track/Roller" },
          { value: "hinge", label: "Hinge" },
          { value: "sensor", label: "Sensor" },
          { value: "battery_backup", label: "Battery/Backup" },
          { value: "wiring", label: "Wiring" },
          { value: "not_sure", label: "Not sure" },
        ],
      },
      {
        key: "problem",
        label: "Problem?",
        type: "checkbox",
        required: false,
        priced: false,
        minSelect: 0,
        options: [
          { value: "not_moving", label: "Not moving" },
          { value: "slow_weak", label: "Slow/Weak" },
          { value: "noisy", label: "Noisy" },
          { value: "remote_not_working", label: "Remote not working" },
          { value: "off_track_stuck", label: "Off-track/Stuck" },
          { value: "rust_damaged", label: "Rust/Damaged" },
          { value: "others", label: "Others (explain)" },
        ],
      },
    ],
  },
  {
    parentSlug: "home-improvement",
    slug: "roof",
    name: "Roof",
    icon: "home",
    price: 200,
    duration: 120,
    photosEnabled: true,
    requiresInspection: true,
    questions: [
      {
        key: "action",
        label: "What do you need?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "leak_repair", label: "Leak repair" },
          { value: "tile_sheet_replacement", label: "Tile/Sheet replacement" },
          { value: "gutter_clean_repair", label: "Gutter clean/repair" },
          { value: "waterproofing", label: "Waterproofing" },
          { value: "full_reroofing", label: "Full re-roofing" },
          { value: "inspection_only", label: "Inspection only" },
        ],
      },
      {
        key: "roof_type",
        label: "Roof type?",
        type: "radio",
        required: false,
        priced: false,
        options: [
          { value: "clay_concrete_tile", label: "Clay/Concrete tile" },
          { value: "metal_zinc", label: "Metal/Zinc" },
          { value: "polycarbonate_awning", label: "Polycarbonate/Awning" },
          { value: "concrete_flat", label: "Concrete flat roof" },
          { value: "not_sure", label: "Not sure" },
        ],
      },
      {
        key: "problem",
        label: "Problem?",
        type: "checkbox",
        required: false,
        priced: false,
        minSelect: 0,
        options: [
          { value: "active_leak", label: "Active leak" },
          { value: "water_stain", label: "Water stain (ceiling)" },
          { value: "broken_tiles", label: "Broken/Missing tiles" },
          { value: "sagging", label: "Sagging" },
          { value: "moss_algae", label: "Moss/Algae" },
          { value: "clogged_gutter", label: "Clogged gutter" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "details",
        label: "Describe + location of issue.",
        type: "text",
        required: false,
        priced: false,
      },
    ],
  },
  // ── Home Maintenance ──
  {
    parentSlug: "home-maintenance",
    slug: "aircond-servicer",
    name: "Aircond Servicer",
    icon: "snowflake",
    price: 100,
    duration: 60,
    photosEnabled: true,
    questions: airconQuestions,
  },
  {
    parentSlug: "home-maintenance",
    slug: "plumber",
    name: "Plumber",
    icon: "wrench",
    price: 80,
    duration: 90,
    photosEnabled: true,
    questions: [
      {
        key: "action",
        label: "What kind of plumbing service?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "dismantle", label: "Dismantle" },
          { value: "install", label: "Install" },
          { value: "repair", label: "Repair" },
          { value: "replace", label: "Replace" },
        ],
      },
      {
        key: "area",
        label: "Which area?",
        type: "checkbox",
        required: true,
        priced: true,
        minSelect: 1,
        options: [
          { value: "bathtub", label: "Bathtub" },
          { value: "pipe_drain", label: "Pipe/Drain" },
          { value: "shower", label: "Shower" },
          { value: "tap_faucet_sink", label: "Tap/Faucet/Sink" },
          { value: "toilet_wc", label: "Toilet/WC" },
          { value: "water_heater", label: "Water heater" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "problem",
        label: "What problem?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "no_problem", label: "No problem (install/replace only)" },
          { value: "busted_cracked", label: "Busted/Cracked" },
          { value: "ceiling_water_stain", label: "Ceiling water stain" },
          { value: "clogged_stuck", label: "Clogged/Stuck" },
          { value: "leak_drip", label: "Leak/drip" },
          { value: "low_pressure", label: "Low pressure" },
          { value: "noisy_vibration", label: "Noisy/Vibration" },
          { value: "smell_dirty", label: "Smell/Dirty" },
          { value: "wall_seepage", label: "Wall seepage" },
          { value: "others", label: "Others (explain)" },
        ],
      },
    ],
  },
  {
    parentSlug: "home-maintenance",
    slug: "electrical-wiring",
    name: "Electrical & Wiring",
    icon: "zap",
    price: 80,
    duration: 60,
    photosEnabled: true,
    questions: [
      {
        key: "action",
        label: "What do you need?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "install", label: "Install" },
          { value: "repair", label: "Repair" },
          { value: "replace", label: "Replace" },
          { value: "inspection_testing", label: "Inspection/Testing" },
        ],
      },
      {
        key: "item",
        label: "What item?",
        type: "checkbox",
        required: true,
        priced: true,
        minSelect: 1,
        options: [
          { value: "wiring_rewiring", label: "Wiring/Rewiring" },
          { value: "power_socket_switch", label: "Power socket/Switch" },
          { value: "lighting_downlight", label: "Lighting/Downlight" },
          { value: "ceiling_fan", label: "Ceiling fan" },
          { value: "distribution_board", label: "Distribution board (DB)" },
          { value: "water_heater_point", label: "Water heater point" },
          { value: "doorbell_intercom", label: "Doorbell/Intercom" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "problem",
        label: "Problem?",
        type: "checkbox",
        required: false,
        priced: false,
        minSelect: 0,
        options: [
          { value: "power_trip_short", label: "Power trip/Short" },
          { value: "no_power", label: "No power" },
          { value: "flickering", label: "Flickering" },
          { value: "sparking_burning", label: "Sparking/Burning smell" },
          { value: "overheating", label: "Overheating" },
          { value: "adding_new_point", label: "Adding new point" },
          { value: "not_sure", label: "Not sure (explain)" },
        ],
      },
    ],
  },
  // ── Electrical Appliance Repair ──
  {
    parentSlug: "appliance-repair",
    slug: "washing-machine-repair",
    name: "Washing Machine & Dryer Repair",
    icon: "washing-machine",
    price: 80,
    duration: 60,
    photosEnabled: true,
    questions: [
      {
        key: "appliance",
        label: "Which appliance?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "washing_machine_top", label: "Washing machine (top load)" },
          {
            value: "washing_machine_front",
            label: "Washing machine (front load)",
          },
          { value: "dryer", label: "Dryer" },
          { value: "washer_dryer_combo", label: "Washer-dryer combo" },
        ],
      },
      {
        key: "problem",
        label: "Problem?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "not_powering_on", label: "Not powering on" },
          { value: "not_spinning", label: "Not spinning" },
          { value: "not_draining", label: "Not draining" },
          { value: "leaking_water", label: "Leaking water" },
          { value: "noisy_vibrating", label: "Noisy/Vibrating" },
          { value: "door_lid_stuck", label: "Door/Lid stuck" },
          { value: "not_heating", label: "Not heating (dryer)" },
          { value: "error_code", label: "Error code" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "brand",
        label: "Brand & model (if known)",
        type: "text",
        required: false,
        priced: false,
      },
    ],
  },
  {
    parentSlug: "appliance-repair",
    slug: "refrigerator-repair",
    name: "Refrigerator Repair",
    icon: "thermometer",
    price: 80,
    duration: 60,
    photosEnabled: true,
    questions: [
      {
        key: "fridge_type",
        label: "Type?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "single_door", label: "Single door" },
          { value: "double_door", label: "Double door" },
          { value: "side_by_side", label: "Side-by-side" },
          { value: "mini_bar", label: "Mini/Bar fridge" },
          { value: "chest_freezer", label: "Chest freezer" },
        ],
      },
      {
        key: "problem",
        label: "Problem?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "not_cooling", label: "Not cooling" },
          { value: "not_powering_on", label: "Not powering on" },
          { value: "leaking_water", label: "Leaking water" },
          { value: "frost_build_up", label: "Frost build-up" },
          { value: "noisy", label: "Noisy" },
          { value: "water_dispenser_fault", label: "Water dispenser fault" },
          { value: "door_seal", label: "Door seal" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "brand",
        label: "Brand & model (if known)",
        type: "text",
        required: false,
        priced: false,
      },
    ],
  },
  {
    parentSlug: "appliance-repair",
    slug: "tv-repair",
    name: "TV Repair",
    icon: "tv",
    price: 60,
    duration: 45,
    photosEnabled: true,
    questions: [
      {
        key: "tv_type",
        label: "TV type?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "led_lcd", label: "LED/LCD" },
          { value: "oled", label: "OLED" },
          { value: "plasma", label: "Plasma" },
          { value: "projector", label: "Projector" },
          { value: "smart_tv", label: "Smart TV" },
          { value: "unknown", label: "I'm not sure" },
        ],
      },
      {
        key: "problem",
        label: "Problem?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "no_power", label: "No power" },
          { value: "no_display", label: "No display/Black screen" },
          { value: "lines_spots", label: "Lines/Spots" },
          { value: "no_sound", label: "No sound" },
          { value: "cracked_screen", label: "Cracked screen" },
          { value: "no_signal", label: "No signal/Smart app fault" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "brand",
        label: "Brand, model & screen size (if known)",
        type: "text",
        required: false,
        priced: false,
      },
    ],
  },
  {
    parentSlug: "appliance-repair",
    slug: "oven-repair",
    name: "Oven Repair",
    icon: "flame",
    price: 70,
    duration: 60,
    photosEnabled: true,
    questions: [
      {
        key: "oven_type",
        label: "Type?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "built_in_oven", label: "Built-in oven" },
          { value: "freestanding", label: "Freestanding" },
          { value: "microwave", label: "Microwave" },
          { value: "microwave_oven_combo", label: "Microwave-oven combo" },
          { value: "gas_oven", label: "Gas oven" },
        ],
      },
      {
        key: "problem",
        label: "Problem?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "not_heating", label: "Not heating" },
          { value: "not_powering_on", label: "Not powering on" },
          { value: "uneven_heating", label: "Uneven heating" },
          { value: "door_fault", label: "Door fault" },
          { value: "timer_control_fault", label: "Timer/Control fault" },
          { value: "sparking", label: "Sparking" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "brand",
        label: "Brand & model (if known)",
        type: "text",
        required: false,
        priced: false,
      },
    ],
  },
  {
    parentSlug: "appliance-repair",
    slug: "water-heater-repair",
    name: "Water Heater Repair",
    icon: "droplets",
    price: 80,
    duration: 60,
    photosEnabled: true,
    questions: [
      {
        key: "heater_type",
        label: "Type?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "instant_single", label: "Instant (single point)" },
          { value: "storage_tank", label: "Storage tank" },
          { value: "multipoint", label: "Multipoint" },
          { value: "solar", label: "Solar" },
          { value: "heat_pump", label: "Heat pump" },
        ],
      },
      {
        key: "problem",
        label: "Problem?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "no_hot_water", label: "No hot water" },
          { value: "not_powering_on", label: "Not powering on" },
          { value: "leaking", label: "Leaking" },
          { value: "tripping_electrical", label: "Tripping/Electrical" },
          { value: "low_pressure", label: "Low pressure" },
          { value: "noisy", label: "Noisy" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "brand",
        label: "Brand & model (if known)",
        type: "text",
        required: false,
        priced: false,
      },
    ],
  },
  {
    parentSlug: "appliance-repair",
    slug: "ceiling-fan-repair",
    name: "Ceiling Fan Repair",
    icon: "fan",
    price: 60,
    duration: 45,
    photosEnabled: true,
    questions: [
      {
        key: "fan_type",
        label: "Type?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "standard", label: "Standard ceiling fan" },
          { value: "decorative_dc", label: "Decorative/DC fan" },
          { value: "industrial", label: "Industrial" },
          { value: "with_light_kit", label: "With light kit" },
          { value: "remote_controlled", label: "Remote-controlled" },
        ],
      },
      {
        key: "problem",
        label: "Problem?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "not_spinning", label: "Not spinning" },
          { value: "slow_weak", label: "Slow/Weak" },
          { value: "wobbling", label: "Wobbling" },
          { value: "noisy", label: "Noisy" },
          { value: "not_powering_on", label: "Not powering on" },
          { value: "remote_control_fault", label: "Remote/Control fault" },
          { value: "light_fault", label: "Light fault" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "brand",
        label: "Brand & model (if known)",
        type: "text",
        required: false,
        priced: false,
      },
    ],
  },
  {
    parentSlug: "appliance-repair",
    slug: "aircond-repair",
    name: "Aircond Repair",
    icon: "wrench",
    price: 80,
    duration: 60,
    photosEnabled: true,
    questions: [
      {
        key: "aircon_type",
        label: "Type?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "wall_mounted_split", label: "Wall-mounted (split)" },
          { value: "cassette_ceiling", label: "Cassette/Ceiling" },
          { value: "portable", label: "Portable" },
          { value: "window", label: "Window" },
          { value: "inverter", label: "Inverter" },
        ],
      },
      {
        key: "problem",
        label: "Problem?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "not_cold", label: "Not cold" },
          { value: "not_powering_on", label: "Not powering on" },
          { value: "water_leaking", label: "Water leaking" },
          { value: "bad_smell", label: "Bad smell" },
          { value: "noisy", label: "Noisy" },
          { value: "remote_fault", label: "Remote fault" },
          { value: "needs_gas_top_up", label: "Needs gas top-up" },
          { value: "error_code", label: "Error code" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "units",
        label: "How many units?",
        type: "number",
        required: false,
        priced: false,
      },
      {
        key: "brand",
        label: "Brand & model (if known)",
        type: "text",
        required: false,
        priced: false,
      },
    ],
  },
  // ── Training and Classes ──
  {
    parentSlug: "training-classes",
    slug: "art-class",
    name: "Art Class",
    icon: "palette",
    price: 60,
    duration: 60,
    photosEnabled: false,
    questions: [
      {
        key: "art_type",
        label: "Art focus?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "drawing_sketching", label: "Drawing/Sketching" },
          { value: "painting", label: "Painting (acrylic/oil/watercolor)" },
          { value: "digital_art", label: "Digital art" },
          { value: "pottery_ceramics", label: "Pottery/Ceramics" },
          { value: "calligraphy", label: "Calligraphy" },
          { value: "craft_diy", label: "Craft/DIY" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "level",
        label: "Level?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "beginner", label: "Beginner" },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced", label: "Advanced" },
          { value: "kids", label: "Kids" },
        ],
      },
      {
        key: "format",
        label: "Format?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "in_person_tutor", label: "In-person (at tutor)" },
          { value: "in_person_home", label: "In-person (at my home)" },
          { value: "online", label: "Online" },
        ],
      },
      {
        key: "frequency",
        label: "Frequency?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "one_off_trial", label: "One-off/Trial" },
          { value: "weekly", label: "Weekly" },
          { value: "intensive", label: "Intensive/Holiday program" },
        ],
      },
      {
        key: "learner",
        label: "Who's learning?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "child", label: "Child" },
          { value: "teen", label: "Teen" },
          { value: "adult", label: "Adult" },
          { value: "group", label: "Group" },
        ],
      },
    ],
  },
  {
    parentSlug: "training-classes",
    slug: "language-class",
    name: "Language Class",
    icon: "languages",
    price: 60,
    duration: 60,
    photosEnabled: false,
    questions: [
      {
        key: "language",
        label: "Which language?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "english", label: "English" },
          { value: "mandarin", label: "Mandarin" },
          { value: "malay", label: "Malay" },
          { value: "japanese", label: "Japanese" },
          { value: "korean", label: "Korean" },
          { value: "french", label: "French" },
          { value: "arabic", label: "Arabic" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "goal",
        label: "Goal?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "conversational", label: "Conversational" },
          { value: "exam_cert", label: "Exam/Cert" },
          { value: "business", label: "Business" },
          { value: "academic", label: "Academic" },
          { value: "beginner_basics", label: "Beginner basics" },
        ],
      },
      {
        key: "level",
        label: "Level?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "beginner", label: "Beginner" },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced", label: "Advanced" },
        ],
      },
      {
        key: "format",
        label: "Format?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "in_person_tutor", label: "In-person (at tutor)" },
          { value: "in_person_home", label: "In-person (at my home)" },
          { value: "online", label: "Online" },
        ],
      },
      {
        key: "frequency",
        label: "Frequency?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "one_off_trial", label: "One-off/Trial" },
          { value: "weekly", label: "Weekly" },
          { value: "intensive", label: "Intensive" },
        ],
      },
    ],
  },
  {
    parentSlug: "training-classes",
    slug: "music-class",
    name: "Music Class",
    icon: "music",
    price: 70,
    duration: 60,
    photosEnabled: false,
    questions: [
      {
        key: "instrument",
        label: "Instrument/focus?",
        type: "checkbox",
        required: true,
        priced: true,
        minSelect: 1,
        options: [
          { value: "piano", label: "Piano" },
          { value: "guitar", label: "Guitar" },
          { value: "violin", label: "Violin" },
          { value: "drums", label: "Drums" },
          { value: "vocal_singing", label: "Vocal/Singing" },
          { value: "ukulele", label: "Ukulele" },
          { value: "music_theory", label: "Music theory" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "level",
        label: "Level?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "beginner", label: "Beginner" },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced", label: "Advanced" },
          { value: "exam_prep", label: "Exam prep (ABRSM etc)" },
        ],
      },
      {
        key: "format",
        label: "Format?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "in_person_tutor", label: "In-person (at tutor)" },
          { value: "in_person_home", label: "In-person (at my home)" },
          { value: "online", label: "Online" },
        ],
      },
      {
        key: "frequency",
        label: "Frequency?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "one_off_trial", label: "One-off/Trial" },
          { value: "weekly", label: "Weekly" },
          { value: "intensive", label: "Intensive" },
        ],
      },
      {
        key: "learner",
        label: "Who's learning?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "child", label: "Child" },
          { value: "teen", label: "Teen" },
          { value: "adult", label: "Adult" },
        ],
      },
    ],
  },
  {
    parentSlug: "training-classes",
    slug: "home-tutoring",
    name: "Home Tutoring",
    icon: "book",
    price: 60,
    duration: 60,
    photosEnabled: false,
    questions: [
      {
        key: "level",
        label: "Education level?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "primary", label: "Primary" },
          { value: "lower_sec", label: "Lower Sec (Form 1-3/PT3)" },
          { value: "spm", label: "SPM" },
          { value: "pre_u", label: "Pre-U (STPM/A-Level/Foundation)" },
          { value: "university", label: "University" },
          { value: "adult_skills", label: "Adult/Skills" },
        ],
      },
      {
        key: "subjects",
        label: "Subjects?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "math", label: "Math" },
          { value: "add_math", label: "Add Math" },
          { value: "science", label: "Science" },
          { value: "physics", label: "Physics" },
          { value: "chemistry", label: "Chemistry" },
          { value: "biology", label: "Biology" },
          { value: "bm", label: "BM" },
          { value: "english", label: "English" },
          { value: "mandarin", label: "Mandarin" },
          { value: "history", label: "History" },
          { value: "accounts", label: "Accounts" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "format",
        label: "Format?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "at_my_home", label: "At my home" },
          { value: "at_tutor", label: "At tutor" },
          { value: "online", label: "Online" },
        ],
      },
      {
        key: "frequency",
        label: "Frequency?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "one_off_trial", label: "One-off/Trial" },
          { value: "weekly", label: "Weekly" },
          { value: "intensive", label: "Intensive (exam prep)" },
        ],
      },
      {
        key: "students",
        label: "How many students?",
        type: "number",
        required: false,
        priced: false,
      },
    ],
  },
  {
    parentSlug: "training-classes",
    slug: "cooking-class",
    name: "Cooking Class",
    icon: "utensils-crossed",
    price: 80,
    duration: 90,
    photosEnabled: false,
    questions: [
      {
        key: "cuisine",
        label: "Cuisine/focus?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "malay", label: "Malay" },
          { value: "chinese", label: "Chinese" },
          { value: "western", label: "Western" },
          { value: "baking_pastry", label: "Baking/Pastry" },
          { value: "desserts", label: "Desserts" },
          { value: "healthy_diet", label: "Healthy/Diet" },
          { value: "kids_cooking", label: "Kids cooking" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "level",
        label: "Level?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "beginner", label: "Beginner" },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced", label: "Advanced" },
        ],
      },
      {
        key: "format",
        label: "Format?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "in_person_venue", label: "In-person (at venue)" },
          { value: "in_person_home", label: "In-person (at my home)" },
          { value: "online", label: "Online" },
        ],
      },
      {
        key: "setup",
        label: "Class type?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "private_1on1", label: "Private (1-on-1)" },
          { value: "small_group", label: "Small group" },
          { value: "workshop_event", label: "Workshop/Event" },
        ],
      },
      {
        key: "ingredients",
        label: "Provide ingredients?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "yes_provide", label: "Yes (pass-through fee applies)" },
          { value: "no_i_provide", label: "No, I'll provide" },
        ],
      },
    ],
  },
  {
    parentSlug: "training-classes",
    slug: "gym-trainer",
    name: "Private Gym Trainer",
    icon: "dumbbell",
    price: 80,
    duration: 60,
    photosEnabled: false,
    questions: [
      {
        key: "goal",
        label: "Goal?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "weight_loss", label: "Weight loss" },
          { value: "muscle_gain", label: "Muscle gain" },
          { value: "general_fitness", label: "General fitness" },
          { value: "strength", label: "Strength" },
          { value: "rehab_recovery", label: "Rehab/Recovery" },
          { value: "sport_specific", label: "Sport-specific" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "format",
        label: "Where?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "at_my_home", label: "At my home" },
          { value: "at_gym", label: "At gym" },
          { value: "outdoor_park", label: "Outdoor/Park" },
          { value: "online", label: "Online" },
        ],
      },
      {
        key: "frequency",
        label: "Frequency?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "one_off_trial", label: "One-off/Trial" },
          { value: "1x_week", label: "1×/week" },
          { value: "2_3x_week", label: "2-3×/week" },
          { value: "daily", label: "Daily" },
        ],
      },
      {
        key: "trainee",
        label: "Who?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "individual", label: "Individual" },
          { value: "couple", label: "Couple" },
          { value: "small_group", label: "Small group" },
        ],
      },
      {
        key: "gender_pref",
        label: "Trainer gender preference?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "male", label: "Male" },
          { value: "female", label: "Female" },
          { value: "no_preference", label: "No preference" },
        ],
      },
    ],
  },
  {
    parentSlug: "training-classes",
    slug: "3d-modeling-class",
    name: "3D Modeling Class",
    icon: "box",
    price: 100,
    duration: 90,
    photosEnabled: false,
    questions: [
      {
        key: "field",
        label: "What field / industry?",
        type: "checkbox",
        required: true,
        priced: true,
        minSelect: 1,
        options: [
          { value: "environment_prop", label: "Environment / Prop (game art)" },
          { value: "animation_cinematic", label: "Animation / Cinematic" },
          { value: "character", label: "Character" },
          { value: "product", label: "Product / Industrial" },
          { value: "interior_design", label: "Interior Design / Architecture" },
          { value: "3d_printing", label: "3D Printing" },
          { value: "sculpting", label: "Sculpting" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "software",
        label: "Software preference?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "blender", label: "Blender" },
          { value: "maya", label: "Maya" },
          { value: "3ds_max", label: "3ds Max" },
          { value: "zbrush", label: "ZBrush" },
          { value: "fusion_360", label: "Fusion 360" },
          { value: "sketchup", label: "SketchUp" },
          { value: "cad", label: "CAD" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "level",
        label: "Level?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "beginner", label: "Beginner" },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced", label: "Advanced" },
        ],
      },
      {
        key: "format",
        label: "Format?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "online", label: "Online" },
          { value: "in_person_tutor", label: "In-person (at tutor)" },
          { value: "in_person_home", label: "In-person (at my home)" },
        ],
      },
      {
        key: "frequency",
        label: "Frequency?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "one_off_trial", label: "One-off/Trial" },
          { value: "weekly", label: "Weekly" },
          { value: "intensive", label: "Intensive" },
        ],
      },
      {
        key: "goal",
        label: "Describe what you want to create / your project.",
        type: "text",
        required: false,
        priced: false,
      },
    ],
  },
  // ── Tech & IT ──
  {
    parentSlug: "tech-it",
    slug: "alarm-cctv",
    name: "Alarm & CCTV Services",
    icon: "camera",
    price: 150,
    duration: 120,
    photosEnabled: true,
    questions: [
      {
        key: "action",
        label: "What do you need?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "new_install", label: "New install" },
          { value: "add_expand", label: "Add/Expand system" },
          { value: "repair", label: "Repair" },
          { value: "maintenance", label: "Maintenance/Servicing" },
          { value: "relocate", label: "Relocate" },
        ],
      },
      {
        key: "system_type",
        label: "System type?",
        type: "checkbox",
        required: true,
        priced: true,
        minSelect: 1,
        options: [
          { value: "cctv_cameras", label: "CCTV cameras" },
          { value: "alarm_system", label: "Alarm system" },
          { value: "door_access_intercom", label: "Door access/Intercom" },
          { value: "smart_doorbell", label: "Smart doorbell" },
          { value: "motion_sensors", label: "Motion sensors" },
          { value: "others", label: "Others (explain)" },
        ],
      },
      {
        key: "cameras",
        label: "How many cameras/devices?",
        type: "number",
        required: false,
        priced: false,
      },
      {
        key: "location",
        label: "Where?",
        type: "checkbox",
        required: false,
        priced: false,
        minSelect: 0,
        options: [
          { value: "indoor", label: "Indoor" },
          { value: "outdoor", label: "Outdoor" },
          { value: "entrance_gate", label: "Entrance/Gate" },
          { value: "perimeter", label: "Perimeter" },
          { value: "multiple_floors", label: "Multiple floors" },
        ],
      },
      {
        key: "supply",
        label: "Supply the equipment?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "yes_supply_install", label: "Yes, supply + install" },
          {
            value: "no_i_have_equipment",
            label: "No, I have equipment (install only)",
          },
        ],
      },
    ],
  },

  // ── Home Improvement ── Painting (covers repaint / repainting walls; its own simple
  // questions so a plain repaint is never asked Renovation's hacking/demolition questions).
  {
    parentSlug: "home-improvement",
    slug: "painting",
    name: "Painting",
    icon: "paintbrush",
    price: 150,
    duration: 180,
    photosEnabled: true,
    description:
      "Interior and exterior painting - repaint a wall, a room, or the whole place. Covers walls, ceilings, doors and grilles.",
    imageUrl: "assets/Images/HomeImprovement_Painting01.png",
    questions: [
      {
        key: "paint_scope",
        label: "What needs painting?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "one_room", label: "One room" },
          { value: "multiple_rooms", label: "Multiple rooms" },
          { value: "whole_house", label: "Whole house" },
          { value: "exterior", label: "Exterior / facade" },
          { value: "feature_wall", label: "Just a feature wall" },
        ],
      },
      {
        key: "paint_surfaces",
        label: "Which surfaces?",
        type: "checkbox",
        required: true,
        priced: false,
        minSelect: 1,
        options: [
          { value: "walls", label: "Walls" },
          { value: "ceiling", label: "Ceiling" },
          { value: "doors_frames", label: "Doors & frames" },
          { value: "grilles_railings", label: "Grilles & railings" },
        ],
      },
      {
        key: "paint_supply",
        label: "Who supplies the paint?",
        type: "radio",
        required: true,
        priced: false,
        options: [
          { value: "painter_supplies", label: "Painter supplies the paint" },
          { value: "i_provide", label: "I provide the paint" },
          { value: "not_sure", label: "Not sure, please advise" },
        ],
      },
      {
        key: "wall_condition",
        label: "Wall condition (optional)",
        type: "radio",
        required: false,
        priced: false,
        options: [
          { value: "good", label: "Good, just recolour" },
          { value: "patching", label: "Some cracks, needs patching" },
          { value: "peeling_damp", label: "Peeling or damp" },
          { value: "not_sure", label: "Not sure" },
        ],
      },
      {
        key: "room_count",
        label: "How many rooms or areas? (optional)",
        type: "number",
        required: false,
        priced: false,
      },
    ],
  },

  // ── Home Maintenance ── Moving (movers; covers "movers", "shifting house", "transport
  // furniture"). Its own questions so it never borrows another service's form.
  {
    parentSlug: "home-maintenance",
    slug: "moving",
    name: "Moving",
    icon: "truck",
    price: 200,
    duration: 180,
    photosEnabled: true,
    description:
      "Movers to shift your home or office - carrying, loading and transporting furniture and boxes. Also single bulky items.",
    imageUrl: "assets/Images/HomeMaintenance_Moving01.png",
    questions: [
      {
        key: "move_type",
        label: "What are you moving?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "whole_home", label: "Whole home" },
          { value: "few_big_items", label: "A few big items" },
          { value: "single_item", label: "A single item" },
          { value: "office", label: "Office" },
        ],
      },
      {
        key: "home_size",
        label: "How big is the move?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "studio", label: "Studio / 1 room" },
          { value: "2_3_rooms", label: "2–3 rooms" },
          { value: "4_plus", label: "4+ rooms or landed" },
          { value: "items_only", label: "Just a few items" },
        ],
      },
      {
        key: "lift_access",
        label: "Lift access at pickup? (optional)",
        type: "radio",
        required: false,
        priced: false,
        options: [
          { value: "ground_floor", label: "Ground floor" },
          { value: "lift", label: "Lift available" },
          { value: "stairs_only", label: "Stairs only" },
          { value: "not_sure", label: "Not sure" },
        ],
      },
      {
        key: "heavy_items",
        label: "Any bulky items? (optional)",
        type: "checkbox",
        required: false,
        priced: false,
        options: [
          { value: "fridge", label: "Fridge" },
          { value: "washing_machine", label: "Washing machine" },
          { value: "piano", label: "Piano" },
          { value: "wardrobe", label: "Wardrobe / cabinet" },
          { value: "sofa", label: "Sofa" },
          { value: "none", label: "None" },
        ],
      },
      {
        key: "packing_help",
        label: "Need packing help? (optional)",
        type: "radio",
        required: false,
        priced: false,
        options: [
          { value: "pack_for_me", label: "Yes, pack for me" },
          { value: "i_pack", label: "No, I'll pack" },
          { value: "partial", label: "Partial" },
        ],
      },
    ],
  },

  // ── Home Maintenance ── Gardening (covers "lawn", "grass cutting", "trimming",
  // "landscaping"). Its own questions so a lawn job is never asked Renovation questions.
  {
    parentSlug: "home-maintenance",
    slug: "gardening",
    name: "Gardening",
    icon: "sprout",
    price: 120,
    duration: 120,
    photosEnabled: true,
    description:
      "Garden and lawn care - mowing, trimming, hedge and bush work, weeding, tree pruning and landscaping.",
    imageUrl: "assets/Images/HomeMaintenance_Gardening01.png",
    questions: [
      {
        key: "garden_work",
        label: "What do you need?",
        type: "checkbox",
        required: true,
        priced: true,
        minSelect: 1,
        options: [
          { value: "lawn_mowing", label: "Lawn mowing & trimming" },
          { value: "hedge", label: "Hedge & bush trimming" },
          { value: "weeding", label: "Weeding & clearing" },
          { value: "tree_pruning", label: "Tree pruning" },
          { value: "landscaping", label: "Landscaping & planting" },
        ],
      },
      {
        key: "garden_size",
        label: "How big is the area?",
        type: "radio",
        required: true,
        priced: true,
        options: [
          { value: "small", label: "Small (under 500 sqft)" },
          { value: "medium", label: "Medium (500–2000 sqft)" },
          { value: "large", label: "Large (over 2000 sqft)" },
          { value: "not_sure", label: "Not sure" },
        ],
      },
      {
        key: "green_waste",
        label: "Green-waste removal? (optional)",
        type: "radio",
        required: false,
        priced: false,
        options: [
          { value: "haul_away", label: "Yes, haul it away" },
          { value: "leave_it", label: "No, leave it" },
          { value: "not_sure", label: "Not sure" },
        ],
      },
      {
        key: "frequency",
        label: "How often? (optional)",
        type: "radio",
        required: false,
        priced: false,
        options: [
          { value: "one_time", label: "One-time" },
          { value: "weekly", label: "Weekly" },
          { value: "fortnightly", label: "Fortnightly" },
          { value: "monthly", label: "Monthly" },
        ],
      },
    ],
  },
];

export const platformSettings: { key: string; value: unknown }[] = [
  { key: "minimum_merchant_charge", value: { amount: 30.0 } },
  // Travel fee: platform-wide overall baseline (RM). Effective = max(category, overall).
  { key: "travel_fee_baseline_overall", value: { amount: 20.0 } },
  // Supplies fee: platform-wide overall baseline for cleaning supplies (RM).
  { key: "supplies_fee_baseline_overall", value: { amount: 30.0 } },
  { key: "no_show_consecutive_threshold", value: { count: 3 } },
  { key: "no_show_weekly_threshold", value: { count: 5 } },
  { key: "merchant_deposit_minimum", value: { amount: 100.0 } },
  { key: "merchant_credit_withdrawal_minimum", value: { amount: 50.0 } },
  { key: "quote_buffer_minutes", value: { minutes: 15 } },
  { key: "sst_rate", value: { rate: 0.06 } },
  { key: "noshow_grace_minutes", value: { minutes: 30 } },
  {
    key: "no_response_discount",
    value: { discount_type: "fixed", value: 10.0, expires_in_days: 14 },
  },
  { key: "registered_customer_discount", value: { rate: 0.15 } },
  {
    key: "platform_fee_rate",
    value: {
      current_rate: 0.2,
      scheduled_changes: [
        {
          starts_at: "2026-12-01T00:00:00Z",
          ends_at: "2027-12-31T23:59:59Z",
          new_rate: 0.2,
          advertised_discount: "8% off normal rate",
        },
      ],
    },
  },
  { key: "merchant_proposal_preset_limit", value: { limit: 3 } },
  { key: "notification_sound_enabled", value: true },
  { key: "chat_sound_enabled", value: true },
  { key: "typing_sound_enabled", value: true },
  {
    key: "condo_entry_note",
    value:
      "If you live in a condo, please inform your management and guide the servicer on how to enter your building. Each condo has its own visitor policy.",
  },
  { key: "chat_assistant_enabled", value: true },
  { key: "chat_quote_enabled", value: true },
  { key: "chat_profile_enabled", value: true },
  { key: "chat_guest_enabled", value: true },
  { key: "chat_history_limit", value: 50 },
  { key: "chat_guest_auto_open", value: true },
  { key: "chat_guest_auto_open_delay", value: 3000 },
  { key: "chat_assistant_prompt", value: null },
  { key: "chat_assistant_tone", value: "friendly" },
  {
    key: "chat_greetings",
    value: [
      "Hi there! How can I help you today?",
      "Need help with something around the house?",
      "Looking for a service? I can help you find what you need.",
      "Welcome! What brings you here today?",
      "Got a question? Ask me anything about our services.",
      "Hi! I'm your AI assistant. What can I do for you?",
      "Need a hand finding the right service? Let's chat!",
      "Hello! How can I make your day easier?",
      "Looking to book a service? I'm here to help.",
      "Hi! Whether you need a quote or just have a question, I'm here.",
    ],
  },
  // Returning guest - {name} is filled by the client with the remembered name.
  {
    key: "chat_greetings_returning",
    value: [
      "Hello there, is this {name}? How can I help you today?",
      "Welcome back! Is this {name}? What can I do for you?",
      "Hi again! Am I speaking with {name}? How can I help?",
      "Good to see you back, {name}! Is that you? What do you need today?",
    ],
  },
  // Logged-in customer - {name} is the account holder.
  {
    key: "chat_greetings_customer",
    value: [
      "Welcome back, {name}! How can I help you today?",
      "Hi {name}! Need a quote, a booking, or have a question?",
      "Hello {name}! What can I do for you today?",
      "Good to see you, {name}! How can I make your day easier?",
    ],
  },
  // Servicer / merchant.
  {
    key: "chat_greetings_servicer",
    value: [
      "Hi {name}! Need help with your jobs, schedule, or account?",
      "Hello {name}! How can I help you with your services today?",
      "Welcome back, {name}! Any questions about orders or payouts?",
    ],
  },
  // Admin.
  {
    key: "chat_greetings_admin",
    value: [
      "Hi {name}! What would you like to look into today?",
      "Hello {name}! Need help with settings, users, or reports?",
      "Welcome back, {name}! How can I assist with the platform?",
    ],
  },
  { key: "chat_service_keywords", value: {} },
  // Seeded from DEMO_UNLOCK_PHRASE so the env var is the single source of truth;
  // admins can still override this row live in the DB without a redeploy.
  { key: "demo_unlock_phrase", value: process.env.DEMO_UNLOCK_PHRASE || "unlockdemobar" },
];

export const penaltyRules: { type: "noshow" | "cancel"; amount: number }[] = [
  { type: "noshow", amount: 50.0 },
  { type: "cancel", amount: 25.0 },
];

export const featureFlags = [
  { key: "bid_mode", name: "Bid mode", enabled: false },
  { key: "ai_chatbot", name: "AI chatbot", enabled: true },
  { key: "payment_gateway", name: "Payment gateway", enabled: false },
  { key: "reviews", name: "Customer reviews", enabled: false },
  { key: "merchant_kyc", name: "Servicer KYC", enabled: false },
  { key: "merchant_schedule", name: "Servicer schedule", enabled: false },
];

export const chatKnowledge: {
  category: string;
  question: string;
  answer: string;
  sortOrder: number;
  tier?: string;
}[] = [
  // ── How the platform works (tier: guest) ───────────────────────────────────
  {
    category: "general",
    question: "How does My Home Servicer work?",
    answer:
      "My Home Servicer connects you with verified home-service professionals. " +
      "(1) Browse services - pick a category and service type, describe your job, pick a date/time slot, set a budget, and answer any custom questions. " +
      "(2) Receive proposals - nearby servicers review your request and send their price and message. " +
      "(3) Choose a proposal - compare servicers by price, rating, and message, then tap to book. " +
      "(4) Job done - the servicer arrives, completes the work, and you confirm. " +
      "For pay-now bookings your credit is held in escrow and released only after completion.",
    sortOrder: 1,
  },
  {
    category: "general",
    question: "Is My Home Servicer free to use?",
    answer:
      "Creating an account and submitting quote requests is free for customers. " +
      "A small platform service fee (currently 5%) is deducted from the servicer payout on pay-now bookings - this is not an extra charge to you. " +
      "Pay-later bookings involve direct cash payment and no platform fee is visible to you. " +
      "A processing charge applies when you top up your credit wallet.",
    sortOrder: 2,
  },
  {
    category: "general",
    question: "What areas does My Home Servicer cover?",
    answer:
      "My Home Servicer currently covers Malaysia. Servicers specify the areas they serve when registering. " +
      "When you submit a quote request, only servicers who cover your address receive it. " +
      "If no servicers respond in your area you will receive a discount code to try again.",
    sortOrder: 3,
  },

  // ── Service categories (tier: guest) - consolidated taxonomy ──────────────
  {
    category: "categories",
    question: "What services are available on My Home Servicer?",
    answer:
      "We offer 28 services across 7 main categories: " +
      "Cleaning Service (Home Cleaning, Sofa/Mattress Cleaning, Carpet Cleaning, Curtain Cleaning), " +
      "Events (Event Planner, Catering), " +
      "Home Improvement (Professional Organizer, Aircond Installer, Carpenter, Renovation, Interior Design, Door Gate, Roof), " +
      "Home Maintenance (Aircond Servicer, Plumber, Electrical & Wiring), " +
      "Electrical Appliance Repair (Washing Machine, Refrigerator, TV, Oven, Water Heater, Ceiling Fan, Aircond Repair), " +
      "Training & Classes (Art, Language, Music, Home Tutoring, Cooking, Gym Trainer, 3D Modeling), " +
      "and Tech & IT (Alarm & CCTV). " +
      "Browse by parent category on the home page or search for your specific service.",
    sortOrder: 10,
  },
  {
    category: "categories",
    question:
      "What's the difference between Aircond Servicer and Aircond Repair?",
    answer:
      '"Not cold" is usually an Aircond Servicer issue - dirty filter or low gas causes this most of the time. ' +
      "Aircond Servicer is routine maintenance: cleaning the filters, gas top-up and leak check, pipe inspection, " +
      "and a full general check-up. A service visit can resolve 90% of common problems. " +
      "Aircond Servicer cannot replace the motor, PCB, compressor, or do electrical component repair. " +
      "Aircond Repair is for hardcore issues: PCB repair/replacement, motor repair, compressor work, " +
      "and electrical component fixes. " +
      "If the servicer diagnoses a motor, PCB, or compressor issue, they will recommend escalating to Aircond Repair.",
    sortOrder: 11,
  },
  {
    category: "categories",
    question: "My aircond is not cold - which service should I pick?",
    answer:
      'Start with Aircond Servicer. Low gas or a dirty filter causes "not cold" 90% of the time. ' +
      "A routine service includes checking gas levels, cleaning filters, inspecting drip tray and drainage, " +
      "and checking pipes for leaks. Most aircond problems are fixed at the service level - no need to jump to Repair. " +
      "If the servicer finds a deeper problem (dead motor, burnt PCB, compressor failure), " +
      "they will tell you and recommend Aircond Repair for the specialised fix.",
    sortOrder: 12,
  },

  // ── Quote requests (tier: customer) ────────────────────────────────────
  {
    category: "quotes",
    question: "How do I submit a quote request?",
    answer:
      'From the home page, browse to the service you need. Tap "Request a Quote". The form has steps: ' +
      "(1) Category & Service - pick the parent category, then the specific service type. " +
      "(2) Job details - answer any category-specific questions, set your budget range, pick a date and time slot. " +
      "(3) Contact info - confirm your name, phone number, and service address. " +
      "(4) Review - choose pay-now or pay-later, add a tip if you wish, then submit. " +
      "You must be logged in; guests can fill the form but need to register or log in before the final submit.",
    tier: "customer",
    sortOrder: 20,
  },
  {
    category: "quotes",
    question: "What is a budget range and why does it matter?",
    answer:
      "The budget range tells servicers what you expect to pay for the job. " +
      "Each service has preset ranges (e.g. RM50–150, RM150–300). Pick the range that fits your expectation. " +
      "Servicers use this to decide whether to respond - if your budget is too low they may skip your request. " +
      "For pay-now quotes, the upper end of your budget is held in your credit wallet as a reserve; any unspent amount is refunded automatically when you select a proposal.",
    tier: "customer",
    sortOrder: 21,
  },
  {
    category: "quotes",
    question: "What happens after I submit a quote request?",
    answer:
      "Your request is broadcast in real time to all servicers registered in your service category and area. " +
      "Servicers review your details and have until the proposal deadline to submit their price and message. " +
      "When the deadline passes you receive a notification and can go to My Quotes to review all proposals. " +
      "If no one responds you receive a discount code for your next request.",
    tier: "customer",
    sortOrder: 22,
  },
  {
    category: "quotes",
    question: "What do the quote statuses mean?",
    answer:
      "Open: your quote is waiting for servicer proposals. " +
      "Choose proposal: at least one proposal has arrived - you can now select one to book. " +
      "Booked: you selected a proposal and a booking was created - go to Upcoming Bookings to track it. " +
      "Expired: the deadline passed with no proposals - check your notifications for a discount code. " +
      "Cancelled: you cancelled the request before selecting a proposal.",
    tier: "customer",
    sortOrder: 23,
  },
  {
    category: "quotes",
    question: "How do I review and select a proposal?",
    answer:
      "Go to My Quotes and tap on the quote that shows proposals. " +
      "Each proposal shows the servicer name, rating, price, estimated duration, and their message to you. " +
      'Compare the proposals and tap "Select" on the one you prefer. ' +
      "Selecting creates a booking instantly. For pay-now quotes, the exact proposal price is deducted from the budget reserve; any excess is refunded to your credit wallet.",
    tier: "customer",
    sortOrder: 24,
  },
  {
    category: "quotes",
    question: "Can I cancel a quote request?",
    answer:
      "Yes - open your quote from My Quotes and tap Cancel Request. You can cancel any time before you select a proposal. " +
      "If you chose pay-now, your full budget reserve is refunded to your credit wallet immediately. " +
      "Once you have selected a proposal and a booking exists, you must cancel from Upcoming Bookings instead.",
    tier: "customer",
    sortOrder: 25,
  },
  {
    category: "quotes",
    question: "What if no servicers respond to my request?",
    answer:
      "If no proposals arrive by the deadline, your quote is marked Expired. " +
      "You will receive a notification and a discount code (e.g. SORRY-XXXXXX) worth RM10 off your next quote request. The code is valid for 14 days. " +
      "If you used pay-now, your full budget reserve is automatically refunded to your credit wallet. " +
      "Consider widening your budget range or adding more detail in the notes to attract more proposals next time.",
    tier: "customer",
    sortOrder: 26,
  },

  // ── Bookings (tier: customer) ──────────────────────────────────────────
  {
    category: "bookings",
    question: "What do the booking statuses mean?",
    answer:
      "pending_confirmation: the booking was created but the servicer has not yet confirmed it. " +
      "confirmed: the servicer accepted - the job is scheduled. " +
      "in_progress: the servicer has marked their arrival and work has started. " +
      "completed: the servicer marked the job done and issued an invoice. " +
      "cancelled: the booking was cancelled by you, by the servicer, or by the system.",
    tier: "customer",
    sortOrder: 30,
  },
  {
    category: "bookings",
    question: "Where do I find my bookings?",
    answer:
      "Upcoming Bookings shows active bookings (pending confirmation, confirmed, in-progress). " +
      "Order History shows completed and cancelled bookings. " +
      "Each entry shows the service, servicer name, scheduled date/time, status, and price. " +
      "Tap any booking to see full details including the invoice once the job is done.",
    tier: "customer",
    sortOrder: 31,
  },
  {
    category: "bookings",
    question: "How do I cancel a booking?",
    answer:
      "Open the booking from Upcoming Bookings and tap Cancel Booking. " +
      "You can cancel for free before the servicer confirms. After confirmation, a cancellation fee may apply. " +
      "Once the servicer has marked arrival (in_progress) you can no longer cancel - use Report issue instead. " +
      "For pay-now bookings, any refund due is returned to your credit wallet automatically.",
    tier: "customer",
    sortOrder: 32,
  },
  {
    category: "bookings",
    question: "What happens if the servicer does not show up?",
    answer:
      "If the servicer has not marked arrival within 30 minutes of the service window ending, the system auto-detects a no-show. " +
      "The booking is cancelled, your pay-now funds are refunded in full to your credit wallet, and the servicer is penalised. " +
      "Repeated no-shows (3 consecutive or 5 in a week) trigger an automatic account suspension. " +
      "You can resubmit a new quote request immediately.",
    tier: "customer",
    sortOrder: 33,
  },
  {
    category: "bookings",
    question: "What happens if the servicer cancels?",
    answer:
      "If a servicer cancels a confirmed booking, a penalty fee (RM25) is deducted from their security deposit. " +
      "For pay-now bookings your full payment is refunded to your credit wallet immediately. " +
      "You will be notified and can submit a new quote request. The cancelled booking appears in Order History.",
    tier: "customer",
    sortOrder: 34,
  },
  {
    category: "bookings",
    question: "How do I rebook the same servicer?",
    answer:
      'From Order History, find the completed booking and tap "Rebook same servicer". ' +
      "A new quote form opens pre-filled with your previous job details and contact info. " +
      "Edit anything that has changed (date, time, address) then submit. The quote goes directly to that servicer.",
    tier: "customer",
    sortOrder: 35,
  },
  {
    category: "bookings",
    question: "How do I report a problem with a booking?",
    answer:
      'Open the booking from Upcoming Bookings or Order History and tap "Report issue". ' +
      "A support chat session opens linked to that specific booking. " +
      "Describe what went wrong - wrong price, poor workmanship, damage, or any dispute. " +
      "For pay-now bookings, escrow funds are held while a report is open and are not released to the servicer until resolved.",
    tier: "customer",
    sortOrder: 36,
  },

  // ── Payments and credit wallet (tier: customer) ────────────────────────
  {
    category: "payments",
    question: "What payment methods are supported?",
    answer:
      "Two payment modes: Pay Later (default) and Pay Now. " +
      "Pay Later: you pay the servicer directly in cash after the job is done. No online transaction. " +
      "Pay Now: you use your prepaid credit wallet. Funds are held in escrow until the job is confirmed complete, then released to the servicer minus the 5% platform fee. " +
      "Online card payments are not yet available but are on the roadmap.",
    tier: "customer",
    sortOrder: 40,
  },
  {
    category: "payments",
    question: "What is Pay Now and how does escrow work?",
    answer:
      'When you pick "Pay now" on a quote, your budget maximum is deducted from your credit wallet immediately and held securely in escrow. ' +
      "When you select a servicer proposal, the exact proposal price is reserved and any excess is refunded to your wallet instantly. " +
      "After the job is completed and marked done, the reserved amount is released to the servicer (minus the platform fee). " +
      "If the servicer cancels, no-shows, or there is an unresolved dispute - your money is refunded automatically.",
    tier: "customer",
    sortOrder: 41,
  },
  {
    category: "payments",
    question: "What is Pay Later?",
    answer:
      "Pay Later means you pay the servicer in cash directly after the job is done. " +
      "No credit is deducted from your wallet at any stage. " +
      "After the servicer marks the job done you confirm the payment in the app so the platform can record it and generate the invoice. " +
      "Pay Later gives you no escrow protection - if there is a dispute the platform can only mediate, not reverse a cash payment.",
    tier: "customer",
    sortOrder: 42,
  },
  {
    category: "payments",
    question: "What is the credit wallet?",
    answer:
      "Your credit wallet is a prepaid balance stored on your account. The current balance is shown in the top bar after logging in. " +
      "Top up from the Credit panel (accessible via the top bar). " +
      "Credit can only be used for Pay Now quotes. It cannot be transferred to another user or withdrawn. " +
      "A platform processing charge applies to each top-up.",
    tier: "customer",
    sortOrder: 43,
  },
  {
    category: "payments",
    question: "How do I top up my credit wallet?",
    answer:
      "Tap the credit balance displayed in the top bar, or go to Account > Credit. " +
      "Enter the amount you want to add (minimum RM10). A processing charge applies. " +
      "In the demo environment a Top Up button is available for instant testing. " +
      "Your new balance appears in the top bar immediately after a successful top-up.",
    tier: "customer",
    sortOrder: 44,
  },
  {
    category: "payments",
    question: "How do I add a tip?",
    answer:
      "For Pay Now quotes: add a tip on the final review step of the quote form before submitting. The tip is held in escrow along with the service price and passed in full to the servicer on completion (the platform takes no cut on tips). " +
      "For Pay Later bookings: add a tip when confirming cash payment after the job is done. " +
      "Tips are entirely optional and go 100% to the servicer.",
    tier: "customer",
    sortOrder: 45,
  },
  {
    category: "payments",
    question: "When am I charged and refunded?",
    answer:
      "Pay Now - charged: immediately on quote submit (budget maximum held). " +
      "Pay Now - partially refunded: when you select a proposal, any amount above the proposal price is returned to your wallet. " +
      "Pay Now - fully refunded: if you cancel the quote, the servicer no-shows, or the servicer cancels. " +
      "Pay Now - released to servicer: after job completion with no open dispute. " +
      "Pay Later - no credit deducted at any point; you pay cash directly.",
    tier: "customer",
    sortOrder: 46,
  },
  {
    category: "payments",
    question: "What platform fee is charged?",
    answer:
      "A platform service fee of 5% is deducted from the servicer payout on completed Pay Now bookings. " +
      "This fee is not an extra charge to you - your payment is the agreed proposal price. " +
      "The servicer receives the proposal price minus the 5% fee, plus any tip in full. " +
      "Pay Later bookings have no platform fee deducted.",
    tier: "customer",
    sortOrder: 47,
  },
  {
    category: "payments",
    question: "What is a discount code and how do I use it?",
    answer:
      "Discount codes are issued automatically when no servicers respond to your quote request. " +
      "You receive the code by notification (e.g. SORRY-AB12CD). " +
      "Enter it on the Review step of the quote form before submitting. " +
      "A fixed discount (currently RM10) is applied to the credit amount required for a Pay Now quote. " +
      "Codes are single-use and expire after 14 days.",
    tier: "customer",
    sortOrder: 48,
  },

  // ── Rewards (tier: customer) ────────────────────────────────────────────
  {
    category: "rewards",
    question: "How does the loyalty programme work?",
    answer:
      "You earn loyalty points automatically with every completed booking. " +
      "Points accumulate and unlock higher tiers: Bronze, Silver, Gold, and Platinum. " +
      "Higher tiers offer better perks: bonus points per RM spent, discount vouchers, and priority matching. " +
      "View your points, tier, and available perks from the Rewards page.",
    tier: "customer",
    sortOrder: 50,
  },
  {
    category: "rewards",
    question: "How do I redeem perks?",
    answer:
      "Go to the Rewards page and browse available perks for your points. " +
      "Perks include top-up discounts, bonus credit, booking discounts, and call-out fee waivers. " +
      'Tap "Redeem" on a perk to claim it. Vouchers are issued instantly and can be used on your next top-up or booking.',
    tier: "customer",
    sortOrder: 51,
  },

  // ── Notifications (tier: customer) ──────────────────────────────────────
  {
    category: "notifications",
    question: "What notifications will I receive?",
    answer:
      "You receive notifications for all key events: quote proposals ready, proposal deadline approaching, booking confirmed, servicer arrived, job completed, payment confirmed, refund issued, and discount code issued. " +
      "In-app notifications appear as pop-up banners at the bottom-left of the screen.",
    tier: "customer",
    sortOrder: 60,
  },
  {
    category: "notifications",
    question: "How do I manage my notification preferences?",
    answer:
      "Go to Account > Notification settings. Toggle each notification type on or off. " +
      "You can also follow specific service categories - when you follow a category you receive alerts when promotions or new servicers are added. " +
      "Turning off a notification type stops both in-app and email notifications for that event.",
    tier: "customer",
    sortOrder: 61,
  },
  {
    category: "notifications",
    question: "Where do in-app notifications appear?",
    answer:
      "Notifications appear as small pop-up banners at the bottom-left of the screen. Each banner auto-dismisses after a few seconds. " +
      "Tap the notification bell icon in the top bar to see your full notification history. " +
      'Tap any notification to navigate to the relevant page. Use "Mark all as read" to clear the unread count.',
    tier: "customer",
    sortOrder: 62,
  },

  // ── Servicer (tier: servicer) ───────────────────────────────────────────
  {
    category: "servicer",
    question: "How do I register as a service provider (Servicer)?",
    answer:
      'From the home page tap "Join as Servicer". Fill in your details: full name, email, phone, and the service category you specialise in. ' +
      "You can register as an individual or a company (provide your business registration and tax number if applicable). " +
      "A security deposit (minimum RM100) is required to activate your account - this deposit is held on the platform and used to cover any penalties. " +
      "Your account is created and active immediately after registration.",
    tier: "servicer",
    sortOrder: 70,
  },
  {
    category: "servicer",
    question: "How do I add or edit my service listings?",
    answer:
      "From your servicer dashboard go to Account > Services. " +
      "Add a new service by choosing a category, setting a base price, pricing type (fixed/hourly/quote-based), and estimated duration. " +
      "You can set auto-accept rules per service: budget range, property types, time slots, and weekdays. " +
      "For priced-option services, set per-option prices in the modifier pricing grid. Use the new listing wizard at /servicer/services/new for a guided setup.",
    tier: "servicer",
    sortOrder: 71,
  },
  {
    category: "servicer",
    question: "How do proposals work for servicers?",
    answer:
      "When a customer submits a quote matching your service category and service area, it appears in the Incoming Quotes page. " +
      "Tap the request to see customer details: job description, address area, budget range, preferred date and time slot. " +
      'Tap "Submit proposal" to enter your price, estimated duration, and a message to the customer. ' +
      "Your proposal is sent immediately and the customer sees it bundled with others after the deadline.",
    tier: "servicer",
    sortOrder: 72,
  },
  {
    category: "servicer",
    question: "What are proposal presets?",
    answer:
      "Presets are reusable proposal templates. Each preset has a name, a standard message, and an optional price offset (e.g. +RM20 above base price). " +
      "When responding to a quote, tap a preset to auto-fill the message and price fields - edit as needed before submitting. " +
      "Your default preset is used for auto-accept. You can create up to 3 presets.",
    tier: "servicer",
    sortOrder: 73,
  },
  {
    category: "servicer",
    question: "What is auto-accept and how do I enable it?",
    answer:
      "Auto-accept automatically submits a proposal on your behalf whenever a matching quote request arrives. " +
      "Enable it on a specific service listing and set your conditions: acceptable budget range, property types, time slots, and weekdays. " +
      "When all conditions match, your default proposal preset is submitted without any action needed from you. " +
      "You can disable auto-accept at any time from the service listing settings.",
    tier: "servicer",
    sortOrder: 74,
  },
  {
    category: "servicer",
    question: "How do I manage a booking from the servicer side?",
    answer:
      "Active bookings appear in your Jobs page. Click any job card to open the dispatch overlay - a full-screen view with Customer info, Job Details, Instructions, and a Map. " +
      "(1) Confirm the booking to accept it. " +
      '(2) On arrival, tap "Mark arrived" and attach a photo. ' +
      '(3) When finished, tap "Mark done" and attach a completion photo. ' +
      "(4) For pay-later, confirm cash payment received. " +
      "An invoice is generated automatically after marking done. For pay-now bookings, funds are released to your credit after the review window.",
    tier: "servicer",
    sortOrder: 75,
  },
  {
    category: "servicer",
    question: "How does servicer invoicing work?",
    answer:
      "An invoice PDF is automatically generated when you mark a job done. " +
      "You can customise your invoice number format from Account > Invoice Formatting: set a prefix, content, suffix, year format, separator, and padding. " +
      "Default format: INV-2026-0001. The customer receives the invoice and it appears in their Order History.",
    tier: "servicer",
    sortOrder: 76,
  },
  {
    category: "servicer",
    question: "What is customer mode for servicers?",
    answer:
      "Servicer accounts can switch to customer mode to use the platform as a regular customer - browse services, submit quote requests, and make bookings. " +
      "Tap the mode toggle in the top bar to switch. While in customer mode, your servicer session is securely paused. " +
      "Switch back at any time. You cannot respond to or bid on quote requests that you submitted as a customer.",
    tier: "servicer",
    sortOrder: 77,
  },
  {
    category: "servicer",
    question: "What is the security deposit and how are funds managed?",
    answer:
      "When you register as a servicer you pay a security deposit (minimum RM100). This is held on the platform. " +
      "Penalty fees (for no-shows or cancellations) are deducted from this deposit. " +
      "Earnings from completed jobs are credited to your servicer credit balance, separate from the deposit. " +
      "You can request a withdrawal of your credit balance once it reaches the minimum threshold (RM50).",
    tier: "servicer",
    sortOrder: 78,
  },
  {
    category: "servicer",
    question: "What penalties apply to servicers?",
    answer:
      "Cancellation after accepting a booking: RM25 deducted from your security deposit. " +
      "No-show (not marking arrival within 30 minutes of the service window): RM50 deducted and the booking is cancelled. " +
      "3 consecutive no-shows or 5 in a week: automatic account suspension. " +
      "You can appeal any penalty through the help chat or the Review Queues page.",
    tier: "servicer",
    sortOrder: 79,
  },
  {
    category: "servicer",
    question: "What are servicer promotions?",
    answer:
      "You can create promotional discount codes for your customers from Account > Promotions. " +
      "Set a code, discount type (percentage or fixed amount), minimum order value, and expiry date. " +
      "Customers enter your promo code on the quote form review step. " +
      "Promotions are a good way to attract first-time customers or run seasonal offers.",
    tier: "servicer",
    sortOrder: 80,
  },
  {
    category: "servicer",
    question: "How does modifier pricing work?",
    answer:
      "Some services have priced options - the customer selects from a list during the quote form. " +
      "As a servicer, you set a price per option in your service listing (e.g. wall unit chemical wash RM150, cassette overhaul RM300). " +
      "When a customer submits a quote with those selections, the proposal form pre-calculates the total from their choices. " +
      "You can still adjust the final price before submitting your proposal.",
    tier: "servicer",
    sortOrder: 81,
  },

  // ── Help and support (tier: guest) ───────────────────────────────────────
  {
    category: "chatbot",
    question: "How do I get help?",
    answer:
      "Tap the help (?) icon to open the AI assistant chat. " +
      "The assistant can answer questions about how the platform works, explain your quote and booking status, and guide you through any process. " +
      'For booking-specific problems (dispute, damage, wrong price), use "Report issue" on the booking page to open a linked support session.',
    sortOrder: 90,
  },
  {
    category: "chatbot",
    question: "How do I report a problem via the help chat?",
    answer:
      'From the specific booking in Upcoming Bookings or Order History, tap "Report issue". ' +
      "This opens a chat session linked to that booking - the support team can see all booking details. " +
      "Describe what went wrong, include any evidence (photos, screenshots), and state your preferred resolution. " +
      "For pay-now bookings the escrow funds remain held while a report is open.",
    sortOrder: 91,
  },

  // ── Legal and privacy (tier: guest) ──────────────────────────────────────
  {
    category: "legal",
    question: "What is the refund policy?",
    answer:
      "Automatic refunds apply in these cases: " +
      "(1) You cancel a Pay Now quote before a booking is created - full budget reserve refunded. " +
      "(2) Servicer cancels a confirmed booking - full payment refunded. " +
      "(3) Servicer no-show - full payment refunded automatically. " +
      "(4) No proposals received - full budget reserve refunded and a discount code issued. " +
      "For disputes (poor workmanship, damage), report via the help chat. The support team reviews each case. " +
      "Pay Later bookings involve direct cash payment so no automated refund is possible - the platform mediates the dispute.",
    sortOrder: 100,
  },
  {
    category: "legal",
    question: "How is my personal information handled?",
    answer:
      "Your full name, phone number, and address are shared with a servicer only after a booking is confirmed - not before. " +
      "In all list views your contact details are masked. " +
      "We do not sell your data to third parties. Your payment data is processed securely. " +
      "For the full privacy policy, visit the Privacy Policy page from the footer of the home page.",
    sortOrder: 101,
  },
  {
    category: "legal",
    question: "What are the terms of service?",
    answer:
      "By using My Home Servicer you agree to use the platform only for legitimate service bookings. " +
      "Prohibited activities include fake reviews, submitting fraudulent quote requests, and attempting to transact outside the platform to avoid fees. " +
      "Violations may result in account suspension. The full Terms of Service are available from the footer of the home page.",
    sortOrder: 102,
  },

  // ── Admin-only operational knowledge (tier: admin) ──────────────────────
  {
    category: "admin",
    question: "What does the admin dashboard show?",
    answer:
      "The dashboard (/admin) shows headline stat cards - Servicers, Bookings, Completed, Revenue - then pending-queue counters (Withdrawals, Appeals, Category requests, Open reports) and a 30-day revenue chart. " +
      "Every stat and queue card is clickable and jumps to the relevant page or queue tab.",
    sortOrder: 110,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How do I find and edit a user or servicer account?",
    answer:
      "Open Accounts (/admin/users). The All Accounts tab has search by name/business/email plus type filters (Customer/Servicer/Admin). " +
      "The Servicer tab adds Status and KYC filters with sortable columns. " +
      "Click Edit on a row to change name, phone, or role. Every edit requires a reason and is written to the audit log.",
    sortOrder: 111,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How do I ban a servicer or check KYC status?",
    answer:
      "On Accounts → Servicer, filter by Status (Active/Banned) or KYC (Approved/Pending/Rejected). Each row shows rating, deposit balance, and credit balance. " +
      "Use row actions to ban or unban a servicer; a banned servicer stops receiving quote broadcasts. KYC is bypassed in V1.",
    sortOrder: 112,
    tier: "admin",
  },
  {
    category: "admin",
    question: "Where can I see an account's full history?",
    answer:
      "On any row in Accounts, open the activity log to see the info-update history (who edited what, when, and the reason) plus that account's bookings, quotes, reports, and - for servicers - withdrawals. This is the per-account audit trail.",
    sortOrder: 113,
    tier: "admin",
  },
  {
    category: "admin",
    question: "What are the review queues?",
    answer:
      "Review Queues (/admin/queues) is where you action pending items in tabs: Withdrawals, Appeals, and Category requests (Open reports are surfaced from the dashboard). Each tab has a search box and per-item Approve/Reject buttons. Every review action is PIN-gated and logged.",
    sortOrder: 114,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How do I approve a new category request?",
    answer:
      "Review Queues → Categories. Each request shows the proposed name, the requesting servicer, and a description. Approve opens a form to set the category's default price and duration; it then appears on the quote form immediately. Reject dismisses the request.",
    sortOrder: 115,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How do I process a servicer withdrawal?",
    answer:
      "Review Queues → Withdrawals. Each card shows the servicer, amount, and bank details. Confirm their credit balance covers it, then Approve (deducts the amount and records a payout) or Reject. Action PIN required.",
    sortOrder: 116,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How do I decide a penalty appeal?",
    answer:
      "Review Queues → Appeals. A servicer can appeal a no-show or cancellation penalty; each card shows the penalty type, amount, and their reason. Approve reverses the penalty and refunds the deducted amount; Reject upholds it. Recorded in the audit trail.",
    sortOrder: 117,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How do I handle customer reports?",
    answer:
      "Booking problems and bug reports filed from the chat appear as Open reports, reachable from the dashboard. Review the report details and resolve them; the open count is shown on the dashboard.",
    sortOrder: 118,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How does the AI Chat Settings page work?",
    answer:
      "AI Chat Settings (/admin/ai-chat-settings) manages the chatbot knowledge base. The FAQ tab holds guest/customer/servicer entries; the Admin FAQ tab holds admin-only entries. Published entries are fed to the chatbot as reference data, filtered by the reader's audience tier. " +
      "Use search, Tier/Status/Category filters, and Add/Edit/Publish/Unpublish/Delete entries. Edits are PIN-gated.",
    sortOrder: 119,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How do I bulk-edit FAQ entries with CSV?",
    answer:
      "On AI Chat Settings, Export CSV downloads all entries. Import CSV updates existing entries by matching the question text; rows with no match are skipped and reported. Export, edit in a spreadsheet, then import to bulk-update.",
    sortOrder: 120,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How do I unban a chat user?",
    answer:
      "AI Chat Settings → Banned users button. Users are auto-banned after 3 prompt-injection strikes. Click Unban to restore access and reset their strike count. Action PIN required.",
    sortOrder: 121,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How do I manage service categories?",
    answer:
      "Category Settings (/admin/category-settings) is where you manage all 28 service categories. " +
      "The list shows every parent and child category with search, sort (name/slug/listing count/avg price), and filter chips (published/unpublished/has-questions). " +
      "Edit a category to manage its Question Schema (drag-drop reorder, add/edit/soft-deactivate questions), Budget Ranges per category, Time Slots, Sub-categories, Thumbnails, Customer Copy, and Dispatch settings. " +
      "Use the checkboxes + bulk action bar to publish/unpublish multiple categories at once. Action PIN required for saves.",
    sortOrder: 122,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How do I configure budget ranges and time slots per category?",
    answer:
      "In Category Settings (/admin/category-settings), edit a category and open the Budget Ranges tab (set the price brackets customers choose from) or the Time Slots tab (enable or disable morning/noon/afternoon/evening/night slots for this service). Changes apply immediately.",
    sortOrder: 123,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How do I edit the question schema for a category?",
    answer:
      "In Category Settings, edit a category and open the Question Schema tab. Add new questions (checkbox, radio, text, quantity, or number type), edit labels and options, mark as required or priced, soft-deactivate old questions, and drag to reorder. " +
      "Question keys and option values are immutable once created - they keep existing quote data intact. Priced questions drive the servicer per-option pricing grid.",
    sortOrder: 124,
    tier: "admin",
  },
  {
    category: "admin",
    question: "What is the admin action PIN?",
    answer:
      "The action PIN is a second factor for sensitive admin actions - editing accounts, approving withdrawals and appeals, approving categories, changing settings, editing FAQ entries, and unbanning users. It is verified per action. The demo admin PIN is 1234.",
    sortOrder: 125,
    tier: "admin",
  },
  {
    category: "admin",
    question: "What is the platform service fee (commission)?",
    answer:
      "The platform takes a service fee (currently 5%) from the servicer payout on completed pay-now bookings - it is not an extra charge to the customer. Edit the rate in Financial Settings → Pricing tab; scheduled future changes are preserved on save.",
    sortOrder: 126,
    tier: "admin",
  },
  {
    category: "admin",
    question: "What are the demo login accounts?",
    answer:
      "All demo accounts share the password Demo@2026. Customers and servicers use their name-based emails (@demo.local). Admin: admin@demo.local (Amirah Syakirah) with action PIN 1234. Demo logins are blocked when NODE_ENV=production.",
    sortOrder: 127,
    tier: "admin",
  },
  {
    category: "admin",
    question: "What is the Financial Settings page?",
    answer:
      "Financial Settings (/admin/money-settings) has three tabs: Pricing (platform fee rate, fee mode), Rewards (loyalty tiers CRUD - Bronze/Silver/Gold/Platinum with point thresholds and bonus rates, reward catalog CRUD, redemption log), and Servicer (deposit minimum, withdrawal threshold, penalty amounts, fee baselines for travel and supplies). All changes require action PIN.",
    sortOrder: 128,
    tier: "admin",
  },
  {
    category: "admin",
    question: "How do I manage promotions?",
    answer:
      "Platform Settings (/admin/settings) → Promotions tab. Create and manage platform-wide promotions: set trigger type (top-up minimum, order percentage, Nth booking), value (percentage or fixed amount), conditions, target role, usage cap, and validity window. The admin credit panel in Financial Settings → Rewards tracks the promo budget.",
    sortOrder: 129,
    tier: "admin",
  },

  // ── PIN (servicer tier) ────────────────────────────────────────────────────
  {
    category: "account",
    question: "What is the servicer action PIN?",
    answer:
      "Servicers have a 6-digit action PIN used to confirm sensitive actions like cancellations and withdrawals. You can set your PIN during registration (optional) or later in Account → Action PIN. If no PIN has been set, PIN verification is denied. You can change your PIN at any time.",
    sortOrder: 130,
    tier: "servicer",
  },
  {
    category: "account",
    question: "How do I change my action PIN?",
    answer:
      'Go to Account → Action PIN and click "Change PIN". Enter your current PIN, then enter and confirm a new 6-digit PIN. The PIN is hashed and stored securely - it cannot be recovered if lost. If you forget your PIN, contact support.',
    sortOrder: 131,
    tier: "servicer",
  },
  {
    category: "account",
    question: "What happens if I forget my action PIN?",
    answer:
      "Action PINs cannot be recovered because they are stored as one-way hashes. If you set a PIN and forget it, please contact support to have your PIN reset.",
    sortOrder: 132,
    tier: "servicer",
  },

  // ── Account settings (mixed tiers) ───────────────────────────────────────
  {
    category: "account",
    question: "How do I set a default contact preset?",
    answer:
      'In your Account → Contact & Address Settings, click "Select as default" on any saved preset. The default preset is automatically selected when you request a new quote. You can have only one default at a time.',
    sortOrder: 133,
    tier: "customer",
  },
  {
    category: "account",
    question: "How do I control what customers see on my profile?",
    answer:
      'In your Account → Profile section, check or uncheck "Show email to customers" and "Show phone to customers" to control whether your email and phone are visible on dispatch pages and your public profile. These are off by default for privacy.',
    sortOrder: 134,
    tier: "servicer",
  },
  {
    category: "account",
    question: "How do I customise my invoice format?",
    answer:
      "Go to Account → Invoice Formatting. You can set a Prefix (e.g. INV), Content (optional custom text), and Suffix. Combined with the year format, separator, and number padding, you can create patterns like INV-2026-0042 or HS/26/42/SVC.",
    sortOrder: 135,
    tier: "servicer",
  },

  // ── Dispatch / jobs (servicer tier) ──────────────────────────────────────
  {
    category: "jobs",
    question: "How do I view and manage an active job?",
    answer:
      "Click any job card in your Active jobs tab to open the dispatch overlay - a full-screen view with Customer info, Job Details, Instructions, and a Map. From there you can Mark Arrived (with photo), Mark Done (with completion photo), or Cancel (requires your PIN and a reason). Press Esc, click ×, or tap the backdrop to return.",
    sortOrder: 140,
    tier: "servicer",
  },
  {
    category: "jobs",
    question: "How do I cancel a booking as a servicer?",
    answer:
      "Open the dispatch overlay for the job, click Cancel, enter a reason and your 6-digit action PIN, then confirm. The PIN is verified before the cancellation is processed. After cancellation, the penalty rules apply.",
    sortOrder: 141,
    tier: "servicer",
  },
];
