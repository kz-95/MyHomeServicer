/**
 * SP-3 Module Seeding (2026-06-25) - ALL CATEGORIES
 * Run AFTER the main seed.ts.
 *
 * Usage: npx ts-node prisma/seed/seed-sp3-modules.ts  OR  npm run seed:modules
 *
 * For every servicer in every category, creates modules matching priced
 * questions from the category's questionSchema. Auto-accept listings attach
 * these modules. M1 Ahmad Plumber excluded from auto-accept.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ModuleDef {
  name: string;
  questionKey: string;
  optionValue: string;
  price: number;
  durationMin: number;
  sku?: string;
}

// ── Priced question definitions by category ─────────────────────────────

const CATEGORY_MODULES: Record<string, { label: string; proposal: string; auto: boolean; mods: ModuleDef[] }> = {

  // ── Plumber ──────────────────────────────────────────────────────
  plumber: {
    label: 'PLB-STANDARD',
    proposal: 'Thank you for your plumbing request! Our plumber will arrive with full equipment.',
    auto: true,
    mods: [
      { name: 'Pipe Repair', questionKey: 'action', optionValue: 'repair', price: 80, durationMin: 45 },
      { name: 'Pipe Replace', questionKey: 'action', optionValue: 'replace', price: 100, durationMin: 60 },
      { name: 'Install', questionKey: 'action', optionValue: 'install', price: 80, durationMin: 60 },
      { name: 'Dismantle', questionKey: 'action', optionValue: 'dismantle', price: 60, durationMin: 30 },
    ],
  },

  // ── Aircond Servicer ──────────────────────────────────────────────
  'aircond-servicer': {
    label: 'AC-STANDARD',
    proposal: 'Thank you for choosing us! Our technician will arrive with full equipment.',
    auto: true,
    mods: [
      { name: 'Wall Unit Chemical Wash', questionKey: 'aircon_service', optionValue: 'wall_chemical', price: 60, durationMin: 30 },
      { name: 'Wall Unit General Service', questionKey: 'aircon_service', optionValue: 'wall_general', price: 40, durationMin: 25 },
      { name: 'Wall Unit Overhaul', questionKey: 'aircon_service', optionValue: 'wall_overhaul', price: 120, durationMin: 60 },
      { name: 'Cassette General Service', questionKey: 'aircon_service', optionValue: 'cassette_general', price: 50, durationMin: 25 },
      { name: 'Cassette Chemical Wash', questionKey: 'aircon_service', optionValue: 'cassette_chemical', price: 70, durationMin: 30 },
      { name: 'Cassette Overhaul', questionKey: 'aircon_service', optionValue: 'cassette_overhaul', price: 150, durationMin: 60 },
      { name: 'Fault Check', questionKey: 'aircon_service', optionValue: 'faulty_check', price: 30, durationMin: 20 },
    ],
  },

  // ── Electrical & Wiring ───────────────────────────────────────────
  'electrical-wiring': {
    label: 'ELEC-STANDARD',
    proposal: 'Thank you for your electrical request! Our licensed electrician will attend.',
    auto: true,
    mods: [
      { name: 'Socket repair', questionKey: 'item', optionValue: 'socket', price: 40, durationMin: 20 },
      { name: 'Switch repair', questionKey: 'item', optionValue: 'switch', price: 40, durationMin: 15 },
      { name: 'Light repair', questionKey: 'item', optionValue: 'light', price: 50, durationMin: 25 },
      { name: 'Fan repair', questionKey: 'item', optionValue: 'fan', price: 60, durationMin: 30 },
      { name: 'DB box repair', questionKey: 'item', optionValue: 'db_box', price: 80, durationMin: 45 },
      { name: 'Wiring repair', questionKey: 'item', optionValue: 'wiring', price: 100, durationMin: 60 },
      { name: 'Water heater repair', questionKey: 'item', optionValue: 'water_heater', price: 80, durationMin: 40 },
      { name: 'Doorbell repair', questionKey: 'item', optionValue: 'doorbell', price: 30, durationMin: 15 },
    ],
  },

  // ── Home Cleaning ─────────────────────────────────────────────────
  'home-cleaning': {
    label: 'CLN-STANDARD',
    proposal: 'Thank you for booking! Our cleaning crew will arrive with all equipment.',
    auto: true,
    mods: [
      { name: '1hr × 2 cleaners', questionKey: 'cleaning_option', optionValue: '1h_2c', price: 60, durationMin: 60 },
      { name: '2hr × 2 cleaners', questionKey: 'cleaning_option', optionValue: '2h_2c', price: 100, durationMin: 120 },
      { name: '3hr × 2 cleaners', questionKey: 'cleaning_option', optionValue: '3h_2c', price: 140, durationMin: 180 },
      { name: '4hr × 2 cleaners', questionKey: 'cleaning_option', optionValue: '4h_2c', price: 180, durationMin: 240 },
    ],
  },

  // ── Sofa/Mattress ─────────────────────────────────────────────────
  'sofa-mattress-cleaning': {
    label: 'SOFA-STANDARD',
    proposal: 'Thank you for your sofa/mattress cleaning request!',
    auto: true,
    mods: [
      { name: 'Leather sofa', questionKey: 'clean_for', optionValue: 'leather_sofa', price: 80, durationMin: 45 },
      { name: 'Fabric sofa', questionKey: 'clean_for', optionValue: 'fabric_sofa', price: 70, durationMin: 45 },
      { name: 'Single mattress', questionKey: 'clean_for', optionValue: 'single_mattress', price: 100, durationMin: 30 },
      { name: 'Queen mattress', questionKey: 'clean_for', optionValue: 'queen_mattress', price: 120, durationMin: 40 },
      { name: 'King mattress', questionKey: 'clean_for', optionValue: 'king_mattress', price: 150, durationMin: 50 },
    ],
  },

  // ── Carpet ────────────────────────────────────────────────────────
  'carpet-cleaning': {
    label: 'CART-STANDARD',
    proposal: 'Thank you for your carpet cleaning request! Eco-friendly solutions used.',
    auto: true,
    mods: [
      { name: 'Rug - Small', questionKey: 'cleaning_type', optionValue: 'rug_1', price: 30, durationMin: 20 },
      { name: 'Rug - Medium', questionKey: 'cleaning_type', optionValue: 'rug_2', price: 50, durationMin: 30 },
      { name: 'Rug - Large', questionKey: 'cleaning_type', optionValue: 'rug_3', price: 70, durationMin: 40 },
      { name: 'Rug - XL', questionKey: 'cleaning_type', optionValue: 'rug_4', price: 90, durationMin: 50 },
      { name: 'Carpet Small', questionKey: 'cleaning_type', optionValue: 'carpet_small', price: 80, durationMin: 45 },
      { name: 'Carpet Medium', questionKey: 'cleaning_type', optionValue: 'carpet_medium', price: 100, durationMin: 60 },
      { name: 'Carpet Large', questionKey: 'cleaning_type', optionValue: 'carpet_large', price: 120, durationMin: 90 },
    ],
  },

  // ── Curtain ───────────────────────────────────────────────────────
  'curtain-cleaning': {
    label: 'CURT-STANDARD',
    proposal: 'Thank you for your curtain cleaning request!',
    auto: true,
    mods: [
      { name: 'Full 40" - Normal', questionKey: 'curtain_sizes', optionValue: 'full_height_40', price: 8, durationMin: 15 },
      { name: 'Full 60" - Normal', questionKey: 'curtain_sizes', optionValue: 'full_height_60', price: 12, durationMin: 15 },
      { name: 'Full 100" - Normal', questionKey: 'curtain_sizes', optionValue: 'full_height_100', price: 18, durationMin: 15 },
      { name: 'Half 40" - Normal', questionKey: 'curtain_sizes', optionValue: 'half_height_40', price: 8, durationMin: 15 },
      { name: 'Half 60" - Normal', questionKey: 'curtain_sizes', optionValue: 'half_height_60', price: 12, durationMin: 15 },
      { name: 'Half 100" - Normal', questionKey: 'curtain_sizes', optionValue: 'half_height_100', price: 18, durationMin: 15 },
    ],
  },

  // ── Event Planner ─────────────────────────────────────────────────
  'event-planner': {
    label: 'EVT-STANDARD',
    proposal: 'Thank you for your event planning inquiry! Let us make it memorable.',
    auto: true,
    mods: [
      { name: 'Full Planning', questionKey: 'planning_services', optionValue: 'full', price: 2000, durationMin: 300 },
      { name: 'Style & Décor', questionKey: 'planning_services', optionValue: 'style_theme', price: 800, durationMin: 120 },
      { name: 'Catering Coordination', questionKey: 'planning_services', optionValue: 'catering', price: 1200, durationMin: 60 },
      { name: 'Entertainment', questionKey: 'planning_services', optionValue: 'entertainment', price: 600, durationMin: 30 },
      { name: 'Day-of Coordination', questionKey: 'planning_services', optionValue: 'coordination', price: 1000, durationMin: 180 },
      { name: 'Partial Planning', questionKey: 'planning_services', optionValue: 'partial', price: 300, durationMin: 60 },
    ],
  },

  // ── Catering ──────────────────────────────────────────────────────
  catering: {
    label: 'CAT-STANDARD',
    proposal: 'Thank you for choosing our catering service!',
    auto: true,
    mods: [
      { name: 'Per person (1-50 pax)', questionKey: 'pax', optionValue: 'person', price: 25, durationMin: 5 },
    ],
  },

  // ── Professional Organizer ────────────────────────────────────────
  'professional-organizer': {
    label: 'ORG-STANDARD',
    proposal: 'Thank you for choosing our organizing service!',
    auto: true,
    mods: [
      { name: 'Studio', questionKey: 'home_size', optionValue: 'studio', price: 60, durationMin: 60 },
      { name: '1 Bedroom', questionKey: 'home_size', optionValue: '1br', price: 80, durationMin: 90 },
      { name: '2 Bedroom', questionKey: 'home_size', optionValue: '2br', price: 120, durationMin: 120 },
      { name: '3 Bedroom', questionKey: 'home_size', optionValue: '3br', price: 160, durationMin: 150 },
      { name: '4 Bedroom', questionKey: 'home_size', optionValue: '4br', price: 200, durationMin: 180 },
      { name: 'Landed', questionKey: 'home_size', optionValue: '5br+landed', price: 250, durationMin: 240 },
    ],
  },

  // ── Aircond Installer ─────────────────────────────────────────────
  'aircond-installer': {
    label: 'API-STANDARD',
    proposal: 'Thank you for choosing us! Certified installers will handle everything.',
    auto: true,
    mods: [
      { name: 'Wall 1.0HP', questionKey: 'units', optionValue: 'wall_1hp', price: 120, durationMin: 60 },
      { name: 'Wall 1.5HP', questionKey: 'units', optionValue: 'wall_1.5hp', price: 150, durationMin: 60 },
      { name: 'Wall 2.0HP', questionKey: 'units', optionValue: 'wall_2hp', price: 180, durationMin: 60 },
      { name: 'Wall 2.5HP', questionKey: 'units', optionValue: 'wall_2.5hp', price: 220, durationMin: 90 },
      { name: 'Cassette 1.5HP', questionKey: 'units', optionValue: 'cassette_1.5hp', price: 400, durationMin: 120 },
      { name: 'Cassette 2.0HP', questionKey: 'units', optionValue: 'cassette_2hp', price: 500, durationMin: 120 },
      { name: 'Cassette 2.5HP', questionKey: 'units', optionValue: 'cassette_2.5hp', price: 600, durationMin: 150 },
      { name: 'Cassette 3.0HP', questionKey: 'units', optionValue: 'cassette_3hp', price: 800, durationMin: 180 },
    ],
  },

  // ── Carpenter ─────────────────────────────────────────────────────
  carpenter: {
    label: 'CRP-STANDARD',
    proposal: 'Thank you for your carpentry request!',
    auto: true,
    mods: [
      { name: 'Cabinet', questionKey: 'item', optionValue: 'cabinet', price: 200, durationMin: 120 },
      { name: 'Wardrobe', questionKey: 'item', optionValue: 'wardrobe', price: 250, durationMin: 150 },
      { name: 'Shelves', questionKey: 'item', optionValue: 'shelves', price: 80, durationMin: 45 },
      { name: 'Door', questionKey: 'item', optionValue: 'door', price: 120, durationMin: 60 },
      { name: 'Table', questionKey: 'item', optionValue: 'table', price: 150, durationMin: 90 },
      { name: 'TV Console', questionKey: 'item', optionValue: 'tv_console', price: 180, durationMin: 90 },
      { name: 'Bed frame', questionKey: 'item', optionValue: 'bed', price: 250, durationMin: 150 },
      { name: 'Flooring', questionKey: 'item', optionValue: 'flooring', price: 300, durationMin: 180 },
      { name: 'Deck', questionKey: 'item', optionValue: 'decking', price: 400, durationMin: 240 },
    ],
  },

  // ── Interior Design ───────────────────────────────────────────────
  'interior-design': {
    label: 'INT-STANDARD',
    proposal: 'Thank you for your interior design inquiry! We look forward to transforming your space.',
    auto: true,
    mods: [
      { name: 'Consultation', questionKey: 'service_level', optionValue: 'consultation', price: 200, durationMin: 60 },
      { name: 'Concept Design', questionKey: 'service_level', optionValue: 'concept', price: 400, durationMin: 120 },
      { name: 'Design-Build', questionKey: 'service_level', optionValue: 'design_build', price: 600, durationMin: 180 },
      { name: 'Full Turnkey', questionKey: 'service_level', optionValue: 'full_turnkey', price: 800, durationMin: 300 },
    ],
  },

  // ── Door/Gate ─────────────────────────────────────────────────────
  'door-gate': {
    label: 'GATE-STANDARD',
    proposal: 'Thank you for your door/gate request!',
    auto: true,
    mods: [
      { name: 'Sliding Gate Install', questionKey: 'gate_type', optionValue: 'sliding', price: 200, durationMin: 120 },
      { name: 'Swing Single Install', questionKey: 'gate_type', optionValue: 'swing_single', price: 150, durationMin: 90 },
      { name: 'Swing Double Install', questionKey: 'gate_type', optionValue: 'swing_double', price: 250, durationMin: 120 },
      { name: 'Folding Gate Install', questionKey: 'gate_type', optionValue: 'folding', price: 300, durationMin: 150 },
    ],
  },

  // ── Painting ──────────────────────────────────────────────────────
  painting: {
    label: 'PNT-STANDARD',
    proposal: 'Thank you for your painting request!',
    auto: true,
    mods: [
      { name: 'Full interior', questionKey: 'paint_scope', optionValue: 'full_int', price: 800, durationMin: 480 },
      { name: 'Single room', questionKey: 'paint_scope', optionValue: 'room_only', price: 200, durationMin: 120 },
      { name: 'Walls only', questionKey: 'paint_scope', optionValue: 'walls_only', price: 400, durationMin: 240 },
      { name: 'Ceiling only', questionKey: 'paint_scope', optionValue: 'ceiling_only', price: 300, durationMin: 180 },
      { name: 'Touch-up', questionKey: 'paint_scope', optionValue: 'touch_up', price: 150, durationMin: 90 },
    ],
  },

  // ── Moving ────────────────────────────────────────────────────────
  moving: {
    label: 'MOV-STANDARD',
    proposal: 'Thank you for choosing our moving service!',
    auto: true,
    mods: [
      { name: 'Studio move', questionKey: 'home_size', optionValue: 'studio', price: 200, durationMin: 120 },
      { name: '1-2BR move', questionKey: 'home_size', optionValue: '1_2br', price: 400, durationMin: 240 },
      { name: '3-4BR move', questionKey: 'home_size', optionValue: '3_4br', price: 600, durationMin: 360 },
      { name: 'Landed move', questionKey: 'home_size', optionValue: 'landed', price: 800, durationMin: 480 },
    ],
  },

  // ── Gardening ─────────────────────────────────────────────────────
  gardening: {
    label: 'GARD-STANDARD',
    proposal: 'Thank you for your gardening request! We will bring all necessary tools.',
    auto: true,
    mods: [
      { name: 'Lawn mowing', questionKey: 'garden_work', optionValue: 'lawn', price: 60, durationMin: 60 },
      { name: 'Hedge trimming', questionKey: 'garden_work', optionValue: 'hedge', price: 80, durationMin: 90 },
      { name: 'Weeding', questionKey: 'garden_work', optionValue: 'weeding', price: 50, durationMin: 60 },
      { name: 'Tree pruning', questionKey: 'garden_work', optionValue: 'tree_pruning', price: 100, durationMin: 120 },
      { name: 'Landscaping', questionKey: 'garden_work', optionValue: 'landscaping', price: 200, durationMin: 240 },
    ],
  },

  // ── Alarm/CCTV ────────────────────────────────────────────────────
  'alarm-cctv': {
    label: 'CAM-STANDARD',
    proposal: 'Thank you for your security system request! Licensed installer will attend.',
    auto: true,
    mods: [
      { name: 'Alarm System', questionKey: 'system_type', optionValue: 'alarm', price: 200, durationMin: 120 },
      { name: 'CCTV 4CH', questionKey: 'system_type', optionValue: 'cctv_4ch', price: 400, durationMin: 180 },
      { name: 'CCTV 8CH', questionKey: 'system_type', optionValue: 'cctv_8ch', price: 600, durationMin: 240 },
      { name: 'Door Access', questionKey: 'system_type', optionValue: 'door_access', price: 300, durationMin: 120 },
      { name: 'Intercom', questionKey: 'system_type', optionValue: 'intercom', price: 150, durationMin: 90 },
    ],
  },

  // ── Roof ──────────────────────────────────────────────────────────
  roof: {
    label: 'ROOF-STANDARD',
    proposal: 'Thank you for your roofing request! We will inspect and provide a solution.',
    auto: true,
    mods: [
      { name: 'Leak Repair - Pitched', questionKey: 'action', optionValue: 'patch_leak', price: 150, durationMin: 60 },
      { name: 'Leak Repair - Flat', questionKey: 'action', optionValue: 'patch_leak', price: 120, durationMin: 45 },
      { name: 'Full Roof Repair', questionKey: 'action', optionValue: 'repair', price: 300, durationMin: 180 },
      { name: 'Roof Replacement', questionKey: 'action', optionValue: 'replace', price: 800, durationMin: 480 },
      { name: 'New Roof Installation', questionKey: 'action', optionValue: 'new_roof', price: 1200, durationMin: 600 },
      { name: 'Roof Inspection', questionKey: 'action', optionValue: 'inspect', price: 100, durationMin: 30 },
    ],
  },

  // ── Renovation (high-ticket, requires inspection) ─────────────────
  renovation: {
    label: 'RENO-STANDARD',
    proposal: 'Thank you for your renovation inquiry! We will arrange a site inspection.',
    auto: true,
    mods: [
      { name: 'Full Home Renovation', questionKey: 'project_type', optionValue: 'full_home', price: 5000, durationMin: 1440 },
      { name: 'Kitchen Only', questionKey: 'project_type', optionValue: 'kitchen_only', price: 3000, durationMin: 720 },
      { name: 'Bathroom Only', questionKey: 'project_type', optionValue: 'bathroom_only', price: 2000, durationMin: 480 },
    ],
  },
};

// ── Generic auto-accept for all other appliance repair + training categories ─
const GENERIC_AUTO: Record<string, { label: string; proposal: string; questionKey: string; opts: Record<string, { label: string; price: number; dur: number }> }> = {
  'washing-machine-repair': { label: 'WM-STANDARD', proposal: 'Thank you for your washing machine repair request! Our technician will diagnose the issue.', questionKey: 'appliance', opts: { top_load: { label: 'Top Load', price: 60, dur: 45 }, front_load: { label: 'Front Load', price: 70, dur: 50 }, washer_dryer: { label: 'Washer Dryer', price: 80, dur: 60 }, dryer: { label: 'Dryer', price: 50, dur: 40 }, portable: { label: 'Portable', price: 40, dur: 30 } } },
  'refrigerator-repair': { label: 'FRDG-STANDARD', proposal: 'Thank you for your refrigerator repair request!', questionKey: 'fridge_type', opts: { single_door: { label: 'Single Door', price: 50, dur: 40 }, double_door: { label: 'Double Door', price: 70, dur: 50 }, side_by_side: { label: 'Side-by-Side', price: 90, dur: 60 }, mini: { label: 'Mini Fridge', price: 40, dur: 30 }, freezer_chest: { label: 'Freezer Chest', price: 80, dur: 50 } } },
  'tv-repair': { label: 'TV-STANDARD', proposal: 'Thank you for your TV repair request!', questionKey: 'tv_type', opts: { led: { label: 'LED TV', price: 40, dur: 40 }, lcd: { label: 'LCD TV', price: 40, dur: 40 }, oled: { label: 'OLED TV', price: 60, dur: 45 }, smart: { label: 'Smart TV', price: 50, dur: 45 }, projector: { label: 'Projector', price: 80, dur: 50 }, plasma: { label: 'Plasma', price: 60, dur: 45 } } },
  'oven-repair': { label: 'OVEN-STANDARD', proposal: 'Thank you for your oven repair request!', questionKey: 'oven_type', opts: { built_in: { label: 'Built-in Oven', price: 80, dur: 60 }, countertop: { label: 'Countertop', price: 50, dur: 45 }, microwave: { label: 'Microwave', price: 40, dur: 30 }, gas_cooker: { label: 'Gas Cooker', price: 60, dur: 45 }, electric_cooker: { label: 'Electric Cooker', price: 60, dur: 45 } } },
  'water-heater-repair': { label: 'WH-STANDARD', proposal: 'Thank you for your water heater repair request!', questionKey: 'heater_type', opts: { instant: { label: 'Instant', price: 60, dur: 45 }, storage: { label: 'Storage Tank', price: 80, dur: 60 }, solar: { label: 'Solar', price: 120, dur: 90 }, heat_pump: { label: 'Heat Pump', price: 150, dur: 90 }, tankless: { label: 'Tankless', price: 70, dur: 45 } } },
  'ceiling-fan-repair': { label: 'FAN-STANDARD', proposal: 'Thank you for your ceiling fan repair request!', questionKey: 'fan_type', opts: { standard: { label: 'Standard', price: 50, dur: 30 }, remote: { label: 'Remote Control', price: 60, dur: 35 }, decorative: { label: 'Decorative', price: 70, dur: 40 }, industrial: { label: 'Industrial', price: 100, dur: 50 }, wall: { label: 'Wall Fan', price: 40, dur: 25 } } },
  'aircond-repair': { label: 'ACR-STANDARD', proposal: 'Thank you for your aircond repair request!', questionKey: 'aircon_type', opts: { wall: { label: 'Wall Unit', price: 60, dur: 45 }, cassette: { label: 'Cassette', price: 80, dur: 60 }, portable: { label: 'Portable', price: 50, dur: 40 }, inverter: { label: 'Inverter', price: 70, dur: 50 }, central: { label: 'Central', price: 120, dur: 90 } } },
  'art-class': { label: 'ART-STANDARD', proposal: 'Thank you for choosing our art class!', questionKey: 'format', opts: { online: { label: 'Online', price: 40, dur: 60 }, offline: { label: 'In-Person', price: 60, dur: 60 }, hybrid: { label: 'Hybrid', price: 50, dur: 60 } } },
  'language-class': { label: 'LANG-STANDARD', proposal: 'Thank you for choosing our language class!', questionKey: 'format', opts: { online: { label: 'Online', price: 40, dur: 60 }, offline: { label: 'In-Person', price: 60, dur: 60 }, hybrid: { label: 'Hybrid', price: 50, dur: 60 } } },
  'music-class': { label: 'MUSC-STANDARD', proposal: 'Thank you for choosing our music class!', questionKey: 'format', opts: { online: { label: 'Online', price: 50, dur: 60 }, offline: { label: 'In-Person', price: 70, dur: 60 }, hybrid: { label: 'Hybrid', price: 60, dur: 60 } } },
  'home-tutoring': { label: 'TUTR-STANDARD', proposal: 'Thank you for choosing our tutoring service!', questionKey: 'format', opts: { online: { label: 'Online', price: 40, dur: 60 }, offline: { label: 'In-Person', price: 60, dur: 60 }, hybrid: { label: 'Hybrid', price: 50, dur: 60 } } },
  'cooking-class': { label: 'COOK-STANDARD', proposal: 'Thank you for choosing our cooking class!', questionKey: 'format', opts: { online: { label: 'Online', price: 50, dur: 60 }, offline: { label: 'In-Person', price: 80, dur: 90 }, hybrid: { label: 'Hybrid', price: 65, dur: 75 } } },
  'gym-trainer': { label: 'GYM-STANDARD', proposal: 'Thank you for choosing our training service!', questionKey: 'format', opts: { online: { label: 'Online Coaching', price: 50, dur: 60 }, home: { label: 'At Home', price: 80, dur: 60 }, park: { label: 'Outdoor/Park', price: 60, dur: 60 }, gym_partner: { label: 'Gym Partner', price: 70, dur: 60 } } },
  '3d-modeling-class': { label: '3D-STANDARD', proposal: 'Thank you for choosing our 3D modeling class!', questionKey: 'format', opts: { online: { label: 'Online', price: 60, dur: 90 }, offline: { label: 'In-Person', price: 100, dur: 90 }, hybrid: { label: 'Hybrid', price: 80, dur: 90 } } },
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function seedModules() {
  console.log('SP-3 Module seeding (all categories) started…');

  // Seed explicit category modules - ALL servicers per category
  for (const [slug, cfg] of Object.entries(CATEGORY_MODULES)) {
    const servicers = await prisma.servicer.findMany({
      where: { category: { slug } },
      select: { id: true, businessName: true, categoryId: true },
    });
    for (const s of servicers) {
      await seedForServicer(s, cfg.label, cfg.proposal, cfg.auto, cfg.mods);
    }
  }

  // Seed generic appliance repair + training categories - ALL servicers
  for (const [slug, cfg] of Object.entries(GENERIC_AUTO)) {
    const servicers = await prisma.servicer.findMany({
      where: { category: { slug } },
      select: { id: true, businessName: true, categoryId: true },
    });
    for (const s of servicers) {
      const mods: ModuleDef[] = Object.entries(cfg.opts).map(([val, info]) => ({
        name: info.label, questionKey: cfg.questionKey, optionValue: val, price: info.price, durationMin: info.dur,
      }));
      await seedForServicer(s, cfg.label, cfg.proposal, true, mods);
    }
  }

  // ── M1 Ahmad - modules but NO auto-accept on ANY listing ──────────
  const m1 = await prisma.servicer.findFirst({
    where: { businessName: { contains: 'Ahmad', mode: 'insensitive' }, category: { slug: 'plumber' } },
    select: { id: true, businessName: true, categoryId: true },
  });
  if (m1) {
    // Disable auto-accept on all of Ahmad's existing listings
    await prisma.servicerService.updateMany({
      where: { servicerId: m1.id, deletedAt: null },
      data: { autoAccept: false, autoAcceptMessage: null },
    });
    console.log(`  M1 ${m1.businessName}: all listings set to manual (auto-accept disabled)`);
  }

  console.log('SP-3 Module seeding complete.');
}

async function seedForServicer(
  servicer: { id: string; businessName: string; categoryId: string },
  label: string, proposal: string, auto: boolean, mods: ModuleDef[],
) {
  if (mods.length === 0) { console.log(`  ${servicer.businessName}: manual (no modules)`); return; }

  // Create/update modules
  const moduleIds: string[] = [];
  for (const mod of mods) {
    const created = await prisma.servicerModule.upsert({
      where: { id: `${servicer.id}-${mod.questionKey}-${mod.optionValue}`.substring(0, 36).replace(/[^a-zA-Z0-9_-]/g, '') },
      update: { name: mod.name, questionKey: mod.questionKey, optionValue: mod.optionValue, price: mod.price, durationMin: mod.durationMin, sku: mod.sku || null, active: true },
      create: { servicerId: servicer.id, name: mod.name, questionKey: mod.questionKey, optionValue: mod.optionValue, price: mod.price, durationMin: mod.durationMin, sku: mod.sku || null, active: true },
    });
    moduleIds.push(created.id);
  }

  const basePrice = mods.reduce((s, m) => s + m.price, 0);
  const durationMin = mods.reduce((s, m) => s + m.durationMin, 0);
  const moduleRefs = moduleIds.map((moduleId) => ({ moduleId }));

  // Find existing or create listing
  const existing = await prisma.servicerService.findFirst({ where: { servicerId: servicer.id, title: { contains: label.substring(0, 8), mode: 'insensitive' } } });
  const data = {
    label, title: label, proposalPreset: proposal, basePrice, estimatedDurationMinutes: durationMin || 60,
    autoAccept: auto, autoAcceptMessage: auto ? proposal : null, moduleRefs: moduleRefs as any, listingMode: 'advanced',
  };

  if (existing) {
    await prisma.servicerService.update({ where: { id: existing.id }, data });
  } else {
    await prisma.servicerService.create({
      data: { servicerId: servicer.id, categoryId: servicer.categoryId, priceType: 'fixed', taxMode: 'none', ...data },
    });
  }
  console.log(`  ${servicer.businessName}: ${mods.length} modules, auto=${auto}`);
}

seedModules().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect().then(() => process.exit(1)); });
