/**
 * Demo seed script. Populates a development database with 36 servicers (1 per
 * service category, 6 for 3D Modeling), 3 customers, 1 admin, in-flight
 * quotes/bookings, penalty scenarios, promotions and AI chat history.
 *
 *   npm run seed
 *   npm run seed -- --deadline-offset=1440  (custom quote deadline, minutes)
 *
 * Production-safe: refuses to run when NODE_ENV=production, and aborts if
 * data has already been seeded (seeded-ids.json present).
 */
import { writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { clearAll } from './clear';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient, Prisma, Weekday, TimeSlot } from '@prisma/client';
import { categories, children, platformSettings, penaltyRules, featureFlags, chatKnowledge } from './data/static';
import { localizeQuestions } from './data/question-i18n';
import { servicers, customers, DEMO_PASSWORD, ADMIN_PIN } from './data/accounts';
import { BUDGET_RANGE_PRESETS } from './data/budget-ranges';

// ── SP-3 Module Seeding ─────────────────────────────────────────────────────

interface ModuleDef {
  name: string;
  questionKey: string;
  optionValue: string;
  price: number;
  durationMin: number;
  sku?: string;
}

/** Priced-question module definitions per category (questionKey + optionValue match static.ts exactly). */
const CATEGORY_MODULES: Record<string, { label: string; proposal: string; auto: boolean; mods: ModuleDef[] }> = {

  // ── Plumber ──────────────────────────────────────────────────────
  plumber: {
    label: 'PLB-STANDARD',
    proposal: 'Thank you for your plumbing request! Our plumber will arrive with full equipment.',
    auto: true,
    mods: [
      // action (priced: true)
      { name: 'Repair', questionKey: 'action', optionValue: 'repair', price: 80, durationMin: 45 },
      { name: 'Replace', questionKey: 'action', optionValue: 'replace', price: 100, durationMin: 60 },
      { name: 'Install', questionKey: 'action', optionValue: 'install', price: 80, durationMin: 60 },
      { name: 'Dismantle', questionKey: 'action', optionValue: 'dismantle', price: 60, durationMin: 30 },
      // area (priced: true)
      { name: 'Bathtub', questionKey: 'area', optionValue: 'bathtub', price: 30, durationMin: 45 },
      { name: 'Pipe/Drain', questionKey: 'area', optionValue: 'pipe_drain', price: 20, durationMin: 30 },
      { name: 'Shower', questionKey: 'area', optionValue: 'shower', price: 25, durationMin: 30 },
      { name: 'Tap/Faucet/Sink', questionKey: 'area', optionValue: 'tap_faucet_sink', price: 15, durationMin: 20 },
      { name: 'Toilet/WC', questionKey: 'area', optionValue: 'toilet_wc', price: 40, durationMin: 45 },
      { name: 'Water heater', questionKey: 'area', optionValue: 'water_heater', price: 50, durationMin: 45 },
      { name: 'Others', questionKey: 'area', optionValue: 'others', price: 20, durationMin: 30 },
    ],
  },

  // ── Aircond Servicer ─────────────────────────────────────────────
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
      // action (priced: true)
      { name: 'Install', questionKey: 'action', optionValue: 'install', price: 80, durationMin: 45 },
      { name: 'Repair', questionKey: 'action', optionValue: 'repair', price: 60, durationMin: 30 },
      { name: 'Replace', questionKey: 'action', optionValue: 'replace', price: 100, durationMin: 60 },
      { name: 'Inspection/Testing', questionKey: 'action', optionValue: 'inspection_testing', price: 50, durationMin: 30 },
      // item (priced: true) - exact static.ts values
      { name: 'Wiring/Rewiring', questionKey: 'item', optionValue: 'wiring_rewiring', price: 100, durationMin: 60 },
      { name: 'Power Socket/Switch', questionKey: 'item', optionValue: 'power_socket_switch', price: 40, durationMin: 20 },
      { name: 'Lighting/Downlight', questionKey: 'item', optionValue: 'lighting_downlight', price: 50, durationMin: 25 },
      { name: 'Ceiling Fan', questionKey: 'item', optionValue: 'ceiling_fan', price: 60, durationMin: 30 },
      { name: 'Distribution Board', questionKey: 'item', optionValue: 'distribution_board', price: 80, durationMin: 45 },
      { name: 'Water Heater Point', questionKey: 'item', optionValue: 'water_heater_point', price: 80, durationMin: 40 },
      { name: 'Doorbell/Intercom', questionKey: 'item', optionValue: 'doorbell_intercom', price: 30, durationMin: 15 },
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
      // clean_for (priced: true)
      { name: 'Leather sofa', questionKey: 'clean_for', optionValue: 'leather_sofa', price: 80, durationMin: 45 },
      { name: 'Fabric sofa', questionKey: 'clean_for', optionValue: 'fabric_sofa', price: 70, durationMin: 45 },
      { name: 'Single mattress', questionKey: 'clean_for', optionValue: 'single_mattress', price: 100, durationMin: 30 },
      { name: 'Queen mattress', questionKey: 'clean_for', optionValue: 'queen_mattress', price: 120, durationMin: 40 },
      { name: 'King mattress', questionKey: 'clean_for', optionValue: 'king_mattress', price: 150, durationMin: 50 },
      // sofa_size (priced: true)
      { name: '1-Seater', questionKey: 'sofa_size', optionValue: '1_seater', price: 40, durationMin: 20 },
      { name: '2-Seater', questionKey: 'sofa_size', optionValue: '2_seater', price: 60, durationMin: 25 },
      { name: '3-Seater', questionKey: 'sofa_size', optionValue: '3_seater', price: 80, durationMin: 30 },
      { name: '4-Seater', questionKey: 'sofa_size', optionValue: '4_seater', price: 100, durationMin: 35 },
      { name: 'L-Shape', questionKey: 'sofa_size', optionValue: 'l_shape', price: 120, durationMin: 40 },
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
      // curtain_sizes (priced: true)
      { name: 'Full 40"', questionKey: 'curtain_sizes', optionValue: 'full_height_40', price: 8, durationMin: 15 },
      { name: 'Full 60"', questionKey: 'curtain_sizes', optionValue: 'full_height_60', price: 12, durationMin: 15 },
      { name: 'Full 100"', questionKey: 'curtain_sizes', optionValue: 'full_height_100', price: 18, durationMin: 15 },
      { name: 'Half 40"', questionKey: 'curtain_sizes', optionValue: 'half_height_40', price: 8, durationMin: 15 },
      { name: 'Half 60"', questionKey: 'curtain_sizes', optionValue: 'half_height_60', price: 12, durationMin: 15 },
      { name: 'Half 100"', questionKey: 'curtain_sizes', optionValue: 'half_height_100', price: 18, durationMin: 15 },
      // cleaning_type (priced: true)
      { name: 'Normal Cleaning', questionKey: 'cleaning_type', optionValue: 'normal_cleaning', price: 0, durationMin: 10 },
      { name: 'Dry Cleaning', questionKey: 'cleaning_type', optionValue: 'dry_cleaning', price: 15, durationMin: 15 },
    ],
  },

  // ── Event Planner ─────────────────────────────────────────────────
  'event-planner': {
    label: 'EVT-STANDARD',
    proposal: 'Thank you for your event planning inquiry! Let us make it memorable.',
    auto: true,
    mods: [
      // planning_services (priced: true) - exact static.ts optionValues + spec prices
      { name: 'Style/Theme Selection', questionKey: 'planning_services', optionValue: 'style_theme', price: 800, durationMin: 120 },
      { name: 'Budget Planning', questionKey: 'planning_services', optionValue: 'budget_planning', price: 500, durationMin: 60 },
      { name: 'Invite & RSVP', questionKey: 'planning_services', optionValue: 'invite_rsvp', price: 300, durationMin: 45 },
      { name: 'Vendor Selection', questionKey: 'planning_services', optionValue: 'vendor_selection', price: 400, durationMin: 60 },
      { name: 'Vendor Coordination', questionKey: 'planning_services', optionValue: 'vendor_coordination', price: 600, durationMin: 90 },
      { name: 'Floor Activity', questionKey: 'planning_services', optionValue: 'floor_activity', price: 300, durationMin: 30 },
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
      // home_size (priced: true) - exact static.ts values
      { name: 'Studio/1BR', questionKey: 'home_size', optionValue: 'studio_1br', price: 60, durationMin: 60 },
      { name: '2BR', questionKey: 'home_size', optionValue: '2br', price: 80, durationMin: 90 },
      { name: '3BR', questionKey: 'home_size', optionValue: '3br', price: 120, durationMin: 120 },
      { name: '4BR', questionKey: 'home_size', optionValue: '4br', price: 160, durationMin: 150 },
      { name: '5BR+', questionKey: 'home_size', optionValue: '5br_plus', price: 200, durationMin: 180 },
      { name: 'Landed/Bungalow', questionKey: 'home_size', optionValue: 'landed_bungalow', price: 250, durationMin: 240 },
    ],
  },

  // ── Aircond Installer ─────────────────────────────────────────────
  'aircond-installer': {
    label: 'API-STANDARD',
    proposal: 'Thank you for choosing us! Certified installers will handle everything.',
    auto: true,
    mods: [
      // units (priced: true) - exact static.ts values (underscores, not dots)
      { name: 'Wall 1.0HP', questionKey: 'units', optionValue: 'wall_1hp', price: 120, durationMin: 60 },
      { name: 'Wall 1.5HP', questionKey: 'units', optionValue: 'wall_1_5hp', price: 150, durationMin: 60 },
      { name: 'Wall 2.0HP', questionKey: 'units', optionValue: 'wall_2hp', price: 180, durationMin: 60 },
      { name: 'Wall 2.5HP', questionKey: 'units', optionValue: 'wall_2_5hp', price: 220, durationMin: 90 },
      { name: 'Wall 3.0HP', questionKey: 'units', optionValue: 'wall_3hp', price: 260, durationMin: 90 },
      { name: 'Cassette 1.0HP', questionKey: 'units', optionValue: 'cassette_1hp', price: 350, durationMin: 120 },
      { name: 'Cassette 1.5HP', questionKey: 'units', optionValue: 'cassette_1_5hp', price: 400, durationMin: 120 },
      { name: 'Cassette 2.0HP', questionKey: 'units', optionValue: 'cassette_2hp', price: 500, durationMin: 120 },
      { name: 'Cassette 2.5HP', questionKey: 'units', optionValue: 'cassette_2_5hp', price: 600, durationMin: 150 },
      { name: 'Cassette 3.0HP', questionKey: 'units', optionValue: 'cassette_3hp', price: 800, durationMin: 180 },
      { name: 'Dismantle Only', questionKey: 'units', optionValue: 'dismantle_only', price: 100, durationMin: 60 },
    ],
  },

  // ── Carpenter ─────────────────────────────────────────────────────
  carpenter: {
    label: 'CRP-STANDARD',
    proposal: 'Thank you for your carpentry request!',
    auto: true,
    mods: [
      // action (priced: true)
      { name: 'Repair', questionKey: 'action', optionValue: 'repair', price: 100, durationMin: 60 },
      { name: 'Install', questionKey: 'action', optionValue: 'install', price: 150, durationMin: 90 },
      { name: 'Custom Build', questionKey: 'action', optionValue: 'custom_build', price: 200, durationMin: 120 },
      { name: 'Dismantle/Remove', questionKey: 'action', optionValue: 'dismantle_remove', price: 80, durationMin: 45 },
      // item (priced: true) - exact static.ts values
      { name: 'Cabinet (kitchen)', questionKey: 'item', optionValue: 'cabinet_kitchen', price: 200, durationMin: 120 },
      { name: 'Wardrobe/Closet', questionKey: 'item', optionValue: 'wardrobe_closet', price: 250, durationMin: 150 },
      { name: 'Shelves/Storage', questionKey: 'item', optionValue: 'shelves_storage', price: 80, durationMin: 45 },
      { name: 'Door', questionKey: 'item', optionValue: 'door', price: 120, durationMin: 60 },
      { name: 'Table/Desk', questionKey: 'item', optionValue: 'table_desk', price: 150, durationMin: 90 },
      { name: 'TV Console', questionKey: 'item', optionValue: 'tv_console', price: 180, durationMin: 90 },
      { name: 'Bed Frame', questionKey: 'item', optionValue: 'bed_frame', price: 250, durationMin: 150 },
      { name: 'Flooring', questionKey: 'item', optionValue: 'flooring', price: 300, durationMin: 180 },
      { name: 'Decking/Outdoor', questionKey: 'item', optionValue: 'decking_outdoor', price: 400, durationMin: 240 },
    ],
  },

  // ── Interior Design ───────────────────────────────────────────────
  'interior-design': {
    label: 'INT-STANDARD',
    proposal: 'Thank you for your interior design inquiry! We look forward to transforming your space.',
    auto: true,
    mods: [
      // service_level (priced: true) - exact static.ts values
      { name: 'Consultation Only', questionKey: 'service_level', optionValue: 'consultation_only', price: 200, durationMin: 60 },
      { name: 'Concept + 3D Design', questionKey: 'service_level', optionValue: 'concept_3d', price: 400, durationMin: 120 },
      { name: 'Design + Project Management', questionKey: 'service_level', optionValue: 'design_pm', price: 600, durationMin: 180 },
      { name: 'Full Turnkey', questionKey: 'service_level', optionValue: 'full_turnkey', price: 800, durationMin: 300 },
    ],
  },

  // ── Door/Gate ─────────────────────────────────────────────────────
  'door-gate': {
    label: 'GATE-STANDARD',
    proposal: 'Thank you for your door/gate request!',
    auto: true,
    mods: [
      // action (priced: true)
      { name: 'New Install', questionKey: 'action', optionValue: 'new_install', price: 250, durationMin: 120 },
      { name: 'Repair', questionKey: 'action', optionValue: 'repair', price: 120, durationMin: 60 },
      { name: 'Replace', questionKey: 'action', optionValue: 'replace', price: 300, durationMin: 150 },
      { name: 'Service/Maintenance', questionKey: 'action', optionValue: 'service_maintenance', price: 80, durationMin: 45 },
      // gate_type (priced: true) - exact static.ts optionValues + spec prices
      { name: 'Autogate (Swing)', questionKey: 'gate_type', optionValue: 'autogate_swing', price: 250, durationMin: 120 },
      { name: 'Autogate (Sliding)', questionKey: 'gate_type', optionValue: 'autogate_sliding', price: 300, durationMin: 150 },
      { name: 'Folding Gate', questionKey: 'gate_type', optionValue: 'folding_gate', price: 400, durationMin: 180 },
      { name: 'Grille Gate', questionKey: 'gate_type', optionValue: 'grille_gate', price: 200, durationMin: 90 },
      { name: 'Security/Metal Door', questionKey: 'gate_type', optionValue: 'security_metal_door', price: 350, durationMin: 120 },
      { name: 'Roller Shutter', questionKey: 'gate_type', optionValue: 'roller_shutter', price: 300, durationMin: 120 },
    ],
  },

  // ── Painting ──────────────────────────────────────────────────────
  painting: {
    label: 'PNT-STANDARD',
    proposal: 'Thank you for your painting request!',
    auto: true,
    mods: [
      // paint_scope (priced: true) - exact static.ts optionValues + spec prices
      { name: 'One Room', questionKey: 'paint_scope', optionValue: 'one_room', price: 200, durationMin: 120 },
      { name: 'Multiple Rooms', questionKey: 'paint_scope', optionValue: 'multiple_rooms', price: 500, durationMin: 300 },
      { name: 'Whole House', questionKey: 'paint_scope', optionValue: 'whole_house', price: 1500, durationMin: 720 },
      { name: 'Exterior/Facade', questionKey: 'paint_scope', optionValue: 'exterior', price: 1200, durationMin: 600 },
      { name: 'Feature Wall', questionKey: 'paint_scope', optionValue: 'feature_wall', price: 300, durationMin: 180 },
    ],
  },

  // ── Moving ────────────────────────────────────────────────────────
  moving: {
    label: 'MOV-STANDARD',
    proposal: 'Thank you for choosing our moving service!',
    auto: true,
    mods: [
      // move_type (priced: true)
      { name: 'Whole Home', questionKey: 'move_type', optionValue: 'whole_home', price: 500, durationMin: 300 },
      { name: 'Few Big Items', questionKey: 'move_type', optionValue: 'few_big_items', price: 200, durationMin: 120 },
      { name: 'Single Item', questionKey: 'move_type', optionValue: 'single_item', price: 80, durationMin: 60 },
      { name: 'Office', questionKey: 'move_type', optionValue: 'office', price: 600, durationMin: 360 },
      // home_size (priced: true) - exact static.ts optionValues + spec prices
      { name: 'Studio / 1 Room', questionKey: 'home_size', optionValue: 'studio', price: 200, durationMin: 120 },
      { name: '2-3 Rooms', questionKey: 'home_size', optionValue: '2_3_rooms', price: 500, durationMin: 300 },
      { name: '4+ Rooms or Landed', questionKey: 'home_size', optionValue: '4_plus', price: 800, durationMin: 480 },
      { name: 'Just a Few Items', questionKey: 'home_size', optionValue: 'items_only', price: 150, durationMin: 90 },
    ],
  },

  // ── Gardening ─────────────────────────────────────────────────────
  gardening: {
    label: 'GARD-STANDARD',
    proposal: 'Thank you for your gardening request! We will bring all necessary tools.',
    auto: true,
    mods: [
      // garden_work (priced: true) - exact static.ts values
      { name: 'Lawn Mowing & Trimming', questionKey: 'garden_work', optionValue: 'lawn_mowing', price: 60, durationMin: 60 },
      { name: 'Hedge & Bush Trimming', questionKey: 'garden_work', optionValue: 'hedge', price: 80, durationMin: 90 },
      { name: 'Weeding & Clearing', questionKey: 'garden_work', optionValue: 'weeding', price: 50, durationMin: 60 },
      { name: 'Tree Pruning', questionKey: 'garden_work', optionValue: 'tree_pruning', price: 100, durationMin: 120 },
      { name: 'Landscaping & Planting', questionKey: 'garden_work', optionValue: 'landscaping', price: 200, durationMin: 240 },
      // garden_size (priced: true)
      { name: 'Small (<500sqft)', questionKey: 'garden_size', optionValue: 'small', price: 30, durationMin: 30 },
      { name: 'Medium (500-2000sqft)', questionKey: 'garden_size', optionValue: 'medium', price: 50, durationMin: 45 },
      { name: 'Large (>2000sqft)', questionKey: 'garden_size', optionValue: 'large', price: 80, durationMin: 60 },
      { name: 'Not Sure', questionKey: 'garden_size', optionValue: 'not_sure', price: 60, durationMin: 45 },
    ],
  },

  // ── Alarm/CCTV ────────────────────────────────────────────────────
  'alarm-cctv': {
    label: 'CAM-STANDARD',
    proposal: 'Thank you for your security system request! Licensed installer will attend.',
    auto: true,
    mods: [
      // action (priced: true)
      { name: 'New Install', questionKey: 'action', optionValue: 'new_install', price: 400, durationMin: 180 },
      { name: 'Add/Expand', questionKey: 'action', optionValue: 'add_expand', price: 200, durationMin: 90 },
      { name: 'Repair', questionKey: 'action', optionValue: 'repair', price: 120, durationMin: 60 },
      { name: 'Maintenance', questionKey: 'action', optionValue: 'maintenance', price: 100, durationMin: 60 },
      { name: 'Relocate', questionKey: 'action', optionValue: 'relocate', price: 250, durationMin: 120 },
      // system_type (priced: true) - exact static.ts values
      { name: 'CCTV Cameras', questionKey: 'system_type', optionValue: 'cctv_cameras', price: 400, durationMin: 180 },
      { name: 'Alarm System', questionKey: 'system_type', optionValue: 'alarm_system', price: 200, durationMin: 120 },
      { name: 'Door Access/Intercom', questionKey: 'system_type', optionValue: 'door_access_intercom', price: 300, durationMin: 120 },
      { name: 'Smart Doorbell', questionKey: 'system_type', optionValue: 'smart_doorbell', price: 150, durationMin: 60 },
      { name: 'Motion Sensors', questionKey: 'system_type', optionValue: 'motion_sensors', price: 100, durationMin: 60 },
    ],
  },

  // ── Roof ──────────────────────────────────────────────────────────
  roof: {
    label: 'ROOF-STANDARD',
    proposal: 'Thank you for your roofing request! We will inspect and provide a solution.',
    auto: true,
    mods: [
      // action (priced: true after this SP-3 fix)
      { name: 'Leak Repair', questionKey: 'action', optionValue: 'leak_repair', price: 150, durationMin: 60 },
      { name: 'Tile/Sheet Replacement', questionKey: 'action', optionValue: 'tile_sheet_replacement', price: 300, durationMin: 180 },
      { name: 'Gutter Clean/Repair', questionKey: 'action', optionValue: 'gutter_clean_repair', price: 120, durationMin: 45 },
      { name: 'Waterproofing', questionKey: 'action', optionValue: 'waterproofing', price: 500, durationMin: 240 },
      { name: 'Full Re-roofing', questionKey: 'action', optionValue: 'full_reroofing', price: 1200, durationMin: 600 },
      { name: 'Inspection Only', questionKey: 'action', optionValue: 'inspection_only', price: 100, durationMin: 30 },
    ],
  },

  // ── Renovation ────────────────────────────────────────────────────
  renovation: {
    label: 'RENO-STANDARD',
    proposal: 'Thank you for your renovation inquiry! We will arrange a site inspection.',
    auto: true,
    mods: [
      // project_type (priced: true after this SP-3 fix)
      { name: 'Full Home', questionKey: 'project_type', optionValue: 'full_home', price: 5000, durationMin: 1440 },
      { name: 'Single Room', questionKey: 'project_type', optionValue: 'single_room', price: 2000, durationMin: 480 },
      { name: 'Kitchen', questionKey: 'project_type', optionValue: 'kitchen', price: 3000, durationMin: 720 },
      { name: 'Bathroom/Toilet', questionKey: 'project_type', optionValue: 'bathroom_toilet', price: 2000, durationMin: 480 },
      { name: 'Extension/Add-on', questionKey: 'project_type', optionValue: 'extension_add_on', price: 4000, durationMin: 960 },
      { name: 'Commercial/Office', questionKey: 'project_type', optionValue: 'commercial_office', price: 6000, durationMin: 1440 },
    ],
  },

  // ── Gym Trainer (moved from GENERIC_AUTO to CATEGORY_MODULES since we add trainee) ─
  'gym-trainer': {
    label: 'GYM-STANDARD',
    proposal: 'Thank you for choosing our training service!',
    auto: true,
    mods: [
      // format (priced: true) - exact static.ts values
      { name: 'At My Home', questionKey: 'format', optionValue: 'at_my_home', price: 80, durationMin: 60 },
      { name: 'At Gym', questionKey: 'format', optionValue: 'at_gym', price: 60, durationMin: 60 },
      { name: 'Outdoor/Park', questionKey: 'format', optionValue: 'outdoor_park', price: 70, durationMin: 60 },
      { name: 'Online', questionKey: 'format', optionValue: 'online', price: 50, durationMin: 60 },
      // trainee (priced: true)
      { name: 'Individual', questionKey: 'trainee', optionValue: 'individual', price: 60, durationMin: 60 },
      { name: 'Couple', questionKey: 'trainee', optionValue: 'couple', price: 90, durationMin: 60 },
      { name: 'Small Group', questionKey: 'trainee', optionValue: 'small_group', price: 120, durationMin: 60 },
    ],
  },

  // ── Music Class (moved from GENERIC_AUTO to CATEGORY_MODULES since we add instrument) ─
  'music-class': {
    label: 'MUSC-STANDARD',
    proposal: 'Thank you for choosing our music class!',
    auto: true,
    mods: [
      // format (priced: true) - exact static.ts values
      { name: 'In-Person (at Tutor)', questionKey: 'format', optionValue: 'in_person_tutor', price: 70, durationMin: 60 },
      { name: 'In-Person (at My Home)', questionKey: 'format', optionValue: 'in_person_home', price: 90, durationMin: 60 },
      { name: 'Online', questionKey: 'format', optionValue: 'online', price: 50, durationMin: 60 },
      // instrument (priced: true)
      { name: 'Piano', questionKey: 'instrument', optionValue: 'piano', price: 80, durationMin: 60 },
      { name: 'Guitar', questionKey: 'instrument', optionValue: 'guitar', price: 60, durationMin: 60 },
      { name: 'Violin', questionKey: 'instrument', optionValue: 'violin', price: 70, durationMin: 60 },
      { name: 'Drums', questionKey: 'instrument', optionValue: 'drums', price: 90, durationMin: 60 },
      { name: 'Vocal/Singing', questionKey: 'instrument', optionValue: 'vocal_singing', price: 60, durationMin: 60 },
      { name: 'Ukulele', questionKey: 'instrument', optionValue: 'ukulele', price: 50, durationMin: 60 },
      { name: 'Music Theory', questionKey: 'instrument', optionValue: 'music_theory', price: 60, durationMin: 60 },
      { name: 'Others', questionKey: 'instrument', optionValue: 'others', price: 50, durationMin: 60 },
    ],
  },

  // ── Home Tutoring (moved from GENERIC_AUTO to CATEGORY_MODULES since we add level) ─
  'home-tutoring': {
    label: 'TUTR-STANDARD',
    proposal: 'Thank you for choosing our tutoring service!',
    auto: true,
    mods: [
      // format (priced: true) - exact static.ts values
      { name: 'At My Home', questionKey: 'format', optionValue: 'at_my_home', price: 60, durationMin: 60 },
      { name: 'At Tutor', questionKey: 'format', optionValue: 'at_tutor', price: 50, durationMin: 60 },
      { name: 'Online', questionKey: 'format', optionValue: 'online', price: 40, durationMin: 60 },
      // level (priced: true)
      { name: 'Primary', questionKey: 'level', optionValue: 'primary', price: 40, durationMin: 60 },
      { name: 'Lower Sec', questionKey: 'level', optionValue: 'lower_sec', price: 45, durationMin: 60 },
      { name: 'SPM', questionKey: 'level', optionValue: 'spm', price: 55, durationMin: 60 },
      { name: 'Pre-U', questionKey: 'level', optionValue: 'pre_u', price: 60, durationMin: 60 },
      { name: 'University', questionKey: 'level', optionValue: 'university', price: 70, durationMin: 60 },
      { name: 'Adult/Skills', questionKey: 'level', optionValue: 'adult_skills', price: 50, durationMin: 60 },
    ],
  },

  // ── Cooking Class (moved from GENERIC_AUTO to CATEGORY_MODULES since we add setup) ─
  'cooking-class': {
    label: 'COOK-STANDARD',
    proposal: 'Thank you for choosing our cooking class!',
    auto: true,
    mods: [
      // format (priced: true) - exact static.ts values
      { name: 'In-Person (at Venue)', questionKey: 'format', optionValue: 'in_person_venue', price: 80, durationMin: 90 },
      { name: 'In-Person (at My Home)', questionKey: 'format', optionValue: 'in_person_home', price: 100, durationMin: 90 },
      { name: 'Online', questionKey: 'format', optionValue: 'online', price: 60, durationMin: 60 },
      // setup (priced: true)
      { name: 'Private (1-on-1)', questionKey: 'setup', optionValue: 'private_1on1', price: 80, durationMin: 90 },
      { name: 'Small Group', questionKey: 'setup', optionValue: 'small_group', price: 120, durationMin: 90 },
      { name: 'Workshop/Event', questionKey: 'setup', optionValue: 'workshop_event', price: 200, durationMin: 120 },
    ],
  },

  // ── 3D Modeling Class (moved from GENERIC_AUTO to CATEGORY_MODULES since we add field) ─
  '3d-modeling-class': {
    label: '3D-STANDARD',
    proposal: 'Thank you for choosing our 3D modeling class!',
    auto: true,
    mods: [
      // format (priced: true) - exact static.ts values
      { name: 'Online', questionKey: 'format', optionValue: 'online', price: 60, durationMin: 90 },
      { name: 'In-Person (at Tutor)', questionKey: 'format', optionValue: 'in_person_tutor', price: 100, durationMin: 90 },
      { name: 'In-Person (at My Home)', questionKey: 'format', optionValue: 'in_person_home', price: 120, durationMin: 90 },
      // field (priced: true)
      { name: 'Environment/Prop', questionKey: 'field', optionValue: 'environment_prop', price: 80, durationMin: 90 },
      { name: 'Animation/Cinematic', questionKey: 'field', optionValue: 'animation_cinematic', price: 100, durationMin: 90 },
      { name: 'Character', questionKey: 'field', optionValue: 'character', price: 90, durationMin: 90 },
      { name: 'Product/Industrial', questionKey: 'field', optionValue: 'product', price: 70, durationMin: 90 },
      { name: 'Interior Design/Architecture', questionKey: 'field', optionValue: 'interior_design', price: 80, durationMin: 90 },
      { name: '3D Printing', questionKey: 'field', optionValue: '3d_printing', price: 60, durationMin: 90 },
      { name: 'Sculpting', questionKey: 'field', optionValue: 'sculpting', price: 90, durationMin: 90 },
      { name: 'Others', questionKey: 'field', optionValue: 'others', price: 60, durationMin: 90 },
    ],
  },
};

/** Generic auto-accept for appliance repair + basic training categories (questionKey + optionValue match static.ts exactly). */
const GENERIC_AUTO: Record<string, { label: string; proposal: string; questionKey: string; opts: Record<string, { label: string; price: number; dur: number }> }> = {
  'washing-machine-repair': {
    label: 'WM-STANDARD',
    proposal: 'Thank you for your washing machine repair request! Our technician will diagnose the issue.',
    questionKey: 'appliance',
    opts: {
      washing_machine_top: { label: 'Top Load', price: 60, dur: 45 },
      washing_machine_front: { label: 'Front Load', price: 70, dur: 50 },
      dryer: { label: 'Dryer', price: 50, dur: 40 },
      washer_dryer_combo: { label: 'Washer-Dryer Combo', price: 80, dur: 60 },
    },
  },
  'refrigerator-repair': {
    label: 'FRDG-STANDARD',
    proposal: 'Thank you for your refrigerator repair request!',
    questionKey: 'fridge_type',
    opts: {
      single_door: { label: 'Single Door', price: 50, dur: 40 },
      double_door: { label: 'Double Door', price: 70, dur: 50 },
      side_by_side: { label: 'Side-by-Side', price: 90, dur: 60 },
      mini_bar: { label: 'Mini/Bar Fridge', price: 40, dur: 30 },
      chest_freezer: { label: 'Chest Freezer', price: 80, dur: 50 },
    },
  },
  'tv-repair': {
    label: 'TV-STANDARD',
    proposal: 'Thank you for your TV repair request!',
    questionKey: 'tv_type',
    opts: {
      led_lcd: { label: 'LED/LCD', price: 40, dur: 40 },
      oled: { label: 'OLED', price: 60, dur: 45 },
      plasma: { label: 'Plasma', price: 60, dur: 45 },
      projector: { label: 'Projector', price: 80, dur: 50 },
      smart_tv: { label: 'Smart TV', price: 50, dur: 45 },
      unknown: { label: 'Not Sure', price: 50, dur: 40 },
    },
  },
  'oven-repair': {
    label: 'OVEN-STANDARD',
    proposal: 'Thank you for your oven repair request!',
    questionKey: 'oven_type',
    opts: {
      built_in_oven: { label: 'Built-in Oven', price: 80, dur: 60 },
      freestanding: { label: 'Freestanding', price: 50, dur: 45 },
      microwave: { label: 'Microwave', price: 40, dur: 30 },
      microwave_oven_combo: { label: 'Microwave-Oven Combo', price: 60, dur: 45 },
      gas_oven: { label: 'Gas Oven', price: 60, dur: 45 },
    },
  },
  'water-heater-repair': {
    label: 'WH-STANDARD',
    proposal: 'Thank you for your water heater repair request!',
    questionKey: 'heater_type',
    opts: {
      instant_single: { label: 'Instant (Single Point)', price: 60, dur: 45 },
      storage_tank: { label: 'Storage Tank', price: 80, dur: 60 },
      multipoint: { label: 'Multipoint', price: 70, dur: 45 },
      solar: { label: 'Solar', price: 120, dur: 90 },
      heat_pump: { label: 'Heat Pump', price: 150, dur: 90 },
    },
  },
  'ceiling-fan-repair': {
    label: 'FAN-STANDARD',
    proposal: 'Thank you for your ceiling fan repair request!',
    questionKey: 'fan_type',
    opts: {
      standard: { label: 'Standard', price: 50, dur: 30 },
      decorative_dc: { label: 'Decorative/DC Fan', price: 70, dur: 40 },
      industrial: { label: 'Industrial', price: 100, dur: 50 },
      with_light_kit: { label: 'With Light Kit', price: 60, dur: 35 },
      remote_controlled: { label: 'Remote-Controlled', price: 60, dur: 35 },
    },
  },
  'aircond-repair': {
    label: 'ACR-STANDARD',
    proposal: 'Thank you for your aircond repair request!',
    questionKey: 'aircon_type',
    opts: {
      wall_mounted_split: { label: 'Wall-Mounted (Split)', price: 60, dur: 45 },
      cassette_ceiling: { label: 'Cassette/Ceiling', price: 80, dur: 60 },
      portable: { label: 'Portable', price: 50, dur: 40 },
      window: { label: 'Window', price: 60, dur: 40 },
      inverter: { label: 'Inverter', price: 70, dur: 50 },
    },
  },
  'art-class': {
    label: 'ART-STANDARD',
    proposal: 'Thank you for choosing our art class!',
    questionKey: 'format',
    opts: {
      in_person_tutor: { label: 'In-Person (at Tutor)', price: 60, dur: 60 },
      in_person_home: { label: 'In-Person (at My Home)', price: 80, dur: 60 },
      online: { label: 'Online', price: 40, dur: 60 },
    },
  },
  'language-class': {
    label: 'LANG-STANDARD',
    proposal: 'Thank you for choosing our language class!',
    questionKey: 'format',
    opts: {
      in_person_tutor: { label: 'In-Person (at Tutor)', price: 60, dur: 60 },
      in_person_home: { label: 'In-Person (at My Home)', price: 80, dur: 60 },
      online: { label: 'Online', price: 40, dur: 60 },
    },
  },
};

// ── Module seeding helpers ───────────────────────────────────────────────────

async function seedForServicer(
  prisma: PrismaClient,
  servicer: { id: string; businessName: string; categoryId: string },
  label: string,
  proposal: string,
  auto: boolean,
  mods: ModuleDef[],
) {
  if (mods.length === 0) { console.log(`  ${servicer.businessName}: manual (no modules)`); return; }

  // Create/update modules
  const moduleIds: string[] = [];
  for (const mod of mods) {
    const compositeKey = `${servicer.id}-${mod.questionKey}-${mod.optionValue}`.substring(0, 36).replace(/[^a-zA-Z0-9_-]/g, '');
    const created = await prisma.servicerModule.upsert({
      where: { id: compositeKey },
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
    description: `Professional service - includes ${mods.map(m => m.name).join(', ')}`,
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

const prisma = new PrismaClient();
const MANIFEST = join(__dirname, 'seeded-ids.json');

/**
 * Deterministic UUID derived from a seed string. Demo accounts use these so
 * `reseed` recreates them with identical IDs - an in-flight admin/customer
 * session (whose JWT carries the account ID) keeps working after a reseed.
 */
function fixedUuid(seed: string): string {
  const h = createHash('md5').update(`homeservices:${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function deadlineOffsetMinutes(): number {
  const arg = process.argv.find((a) => a.startsWith('--deadline-offset='));
  return arg ? parseInt(arg.split('=')[1], 10) || 1440 : 1440;
}

/**
 * Derive approximate lat/lng from a servicer's area description.
 * Returns null for both when no area pattern matches.
 */
function areaCoords(area: string): { lat: number | null; lng: number | null } {
  const a = area.toLowerCase();
  // PJ / Damansara Utama / SS2
  if (/damansara\s*utama|ss2|petaling\s*jaya/.test(a)) return { lat: 3.08, lng: 101.65 };
  // Cyberjaya / Putrajaya (Tamarind Suites ~2.924, 101.657)
  if (/cyberjaya|putrajaya/.test(a)) return { lat: 2.924, lng: 101.657 };
  // KLCC / Bukit Bintang
  if (/klcc|bukit\s*bintang/.test(a)) return { lat: 3.15, lng: 101.71 };
  // Cheras
  if (/cheras/.test(a)) return { lat: 3.10, lng: 101.72 };
  // Damansara Heights / Bangsar
  if (/damansara\s*heights|bangsar/.test(a)) return { lat: 3.13, lng: 101.63 };
  // Subang Jaya
  if (/subang\s*jaya/.test(a)) return { lat: 3.05, lng: 101.59 };
  // Shah Alam
  if (/shah\s*alam/.test(a)) return { lat: 3.07, lng: 101.55 };
  // Ampang
  if (/ampang/.test(a)) return { lat: 3.16, lng: 101.75 };
  // Kepong / Selayang
  if (/kepong|selayang/.test(a)) return { lat: 3.20, lng: 101.63 };
  // Wangsa Maju / Setapak
  if (/wangsa\s*maju|setapak/.test(a)) return { lat: 3.20, lng: 101.73 };
  // Gombak
  if (/gombak/.test(a)) return { lat: 3.22, lng: 101.72 };
  // Mont Kiara
  if (/mont\s*kiara/.test(a)) return { lat: 3.17, lng: 101.65 };
  // KL fallback
  if (/kl|kuala\s*lumpur/.test(a)) return { lat: 3.14, lng: 101.69 };
  return { lat: null, lng: null };
}

/** Slight random offset so nearby entities don't show 0.0 km. */
function jitter(n: number | null): number | null {
  if (n == null) return null;
  return n + (Math.random() - 0.5) * 0.006;
}

const minutes = (n: number) => new Date(Date.now() + n * 60_000);
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed refuses to run with NODE_ENV=production');
  }

  // Always start from a clean slate - this makes the seed fully idempotent,
  // so a reseed works even if a previous run failed part-way through.
  console.log('Clearing existing data…');
  await clearAll(prisma);

  console.log('Seeding demo data…');
  const offset = deadlineOffsetMinutes();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const pinHash = await bcrypt.hash(ADMIN_PIN, 12);

  // ── Categories ──
  // categoryBySlug covers both parents and children - servicers/quotes key off child slugs.
  const categoryBySlug: Record<string, string> = {};

  // Step 1: create the 7 parent categories (grouping only - no price/questions).
  for (const p of categories) {
    const cat = await prisma.category.create({
      data: {
        name: p.name,
        slug: p.slug,
        icon: p.icon,
        published: true,
      },
    });
    categoryBySlug[p.slug] = cat.id;
  }

  // Step 2: create the 28 child categories (actual services - carry price/questions).
  for (const c of children) {
    const cat = await prisma.category.create({
      data: {
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        parentCategoryId: categoryBySlug[c.parentSlug],
        defaultPriceSuggestion: c.price,
        defaultEstimatedDurationMinutes: c.duration,
        published: true,
        photosEnabled: c.photosEnabled ?? false,
        requiresInspection: c.requiresInspection ?? false,
        ...(c.description ? { description: c.description } : {}),
        ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
        ...(c.questions
          ? {
              // Attach ms/zh/ta label translations so quote-flow cards render in the
              // customer's language instead of falling back to English.
              questionSchema: localizeQuestions(
                c.questions as unknown as Parameters<typeof localizeQuestions>[0],
              ) as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
    categoryBySlug[c.slug] = cat.id;
  }
  console.log(`  ✓ ${categories.length} parent categories + ${children.length} child categories`);

  // ── Per-category budget range presets (shared with seed-settings.ts) ──
  const budgetRangeByCategoryId: Record<string, { min: number; max: number | null }[]> = {};
  for (const slug of Object.keys(BUDGET_RANGE_PRESETS)) {
    const catId = categoryBySlug[slug];
    if (catId) budgetRangeByCategoryId[catId] = BUDGET_RANGE_PRESETS[slug];
  }
  await prisma.platformSettings.create({
    data: {
      key: 'budget_ranges',
      value: { ranges: budgetRangeByCategoryId },
    },
  });

  // ── Rest of platform settings, penalty rules, feature flags ──
  for (const s of platformSettings) {
    await prisma.platformSettings.create({ data: { key: s.key, value: s.value as object } });
  }
  const penaltyRuleByType: Record<string, string> = {};
  for (const r of penaltyRules) {
    const rule = await prisma.penaltyRule.create({
      data: { type: r.type, calcMode: 'fixed', amount: r.amount },
    });
    penaltyRuleByType[r.type] = rule.id;
  }
  for (const f of featureFlags) {
    await prisma.featureFlag.create({
      data: { key: f.key, name: f.name, isEnabled: f.enabled },
    });
  }
  for (const k of chatKnowledge) {
    await prisma.faq.create({
      data: {
        question: k.question,
        answer: k.answer,
        category: k.category,
        tier: k.tier ?? 'guest',
        sortOrder: k.sortOrder,
      },
    });
  }
  await prisma.platformMarketingBudget.create({
    data: {
      totalBudget: 5000,
      spentAmount: 320,
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-12-31T23:59:59Z'),
    },
  });
  // ── Loyalty Tiers ──
  const tierData = [
    { name: 'Bronze', minPoints: 0, bonusPercent: 0, badgeColor: '#cd7f32', sortOrder: 1 },
    { name: 'Silver', minPoints: 500, bonusPercent: 10, badgeColor: '#c0c0c0', sortOrder: 2 },
    { name: 'Gold', minPoints: 2000, bonusPercent: 25, badgeColor: '#ffd700', sortOrder: 3 },
    { name: 'Platinum', minPoints: 5000, bonusPercent: 50, badgeColor: '#e5e4e2', sortOrder: 4 },
  ];
  for (const t of tierData) {
    await prisma.loyaltyTier.create({ data: t });
  }
  console.log('  ✓ 4 loyalty tiers (Bronze → Platinum)');

  // ── Reward Catalog ──
  const rewardSeedData = [
    { name: 'RM 5 top-up discount', description: 'Get RM 5 off your top-up', pointCost: 100, discountType: 'topup_fixed', discountValue: 5, minTopup: 20, sortOrder: 1 },
    { name: 'RM 10 top-up discount', description: 'Get RM 10 off your top-up', pointCost: 200, discountType: 'topup_fixed', discountValue: 10, minTopup: 25, sortOrder: 2 },
    { name: 'RM 20 bonus credit', description: 'Get RM 20 extra credits when you top up RM 100 or more', pointCost: 500, discountType: 'topup_bonus', discountValue: 20, minTopup: 100, sortOrder: 3 },
    { name: '10% off next booking', description: 'Get 10% off your next booking (max RM 30)', pointCost: 600, discountType: 'booking_percent', discountValue: 10, maxDiscount: 30, sortOrder: 4 },
    { name: 'Free call-out waiver', description: 'Waive call-out fee (up to RM 30)', pointCost: 800, discountType: 'waiver', discountValue: 30, sortOrder: 5 },
    { name: 'RM 50 top-up discount', description: 'Get RM 50 off your top-up', pointCost: 1000, discountType: 'topup_fixed', discountValue: 50, minTopup: 150, sortOrder: 6 },
  ];
  for (const r of rewardSeedData) {
    await prisma.reward.create({ data: r });
  }
  console.log('  ✓ 6 reward catalog items');

  // ── Postcodes (KL area seed) ──
  const postcodeData = [
    { postcode: '50000', district: 'Kuala Lumpur City Centre', state: 'Wilayah Persekutuan Kuala Lumpur' },
    { postcode: '50450', district: 'Chow Kit', state: 'Wilayah Persekutuan Kuala Lumpur' },
    { postcode: '47500', district: 'Subang Jaya', state: 'Selangor' },
    { postcode: '47810', district: 'Petaling Jaya', state: 'Selangor' },
    { postcode: '68000', district: 'Ampang', state: 'Selangor' },
  ];
  for (const p of postcodeData) {
    await prisma.postcode.create({ data: p });
  }
  console.log(`  ✓ ${postcodeData.length} postcodes seeded (KL area)`);

  console.log('  ✓ settings, penalty rules, feature flags, marketing budget');

  // ── Admin ── (fixed ID so a reseed keeps the admin session valid)
  const admin = await prisma.user.create({
    data: {
      id: fixedUuid('admin@demo.local'),
      role: 'admin',
      name: 'Amirah Syakirah',
      email: 'admin@demo.local',
      phone: '+60 3-0000 0000',
      passwordHash,
      actionPinHash: pinHash,
      isDemo: true,
    },
  });

  // ── Customers ──
  const customerByRef: Record<string, string> = {};
  const addressByRef: Record<string, string> = {};
  const addrCoordsByRef: Record<string, { lat: number; lng: number }> = {};
  for (const c of customers) {
    const user = await prisma.user.create({
      data: {
        id: fixedUuid(c.email),
        role: 'customer',
        name: c.name,
        email: c.email,
        phone: c.phone,
        passwordHash,
        actionPinHash: pinHash,
        avatarUrl: `https://picsum.photos/seed/${encodeURIComponent(c.name)}/100/100`,
        contactName: c.name,
        contactNumber: c.phone,
        preferredTimeSlot: c.preferredTimeSlot ?? null,
        isDemo: true,
      },
    });
    customerByRef[c.ref] = user.id;
    let idx = 0;
    for (const a of c.addresses) {
      const district = a.district ?? a.address;
      const coords = areaCoords(district);
      const addrLat = coords.lat ?? 3.1390;
      const addrLng = coords.lng ?? 101.6869;
      const addr = await prisma.userAddress.create({
        data: {
          userId: user.id,
          label: a.label,
          address: a.address,
          propertyType: a.propertyType,
          isDefault: a.isDefault,
          postcode: a.postcode ?? null,
          district: a.district ?? null,
          state: a.state ?? null,
          lat: addrLat,
          lng: addrLng,
        },
      });
      const key = `${c.ref}:${idx++}`;
      addressByRef[key] = addr.id;
      addrCoordsByRef[key] = { lat: addrLat, lng: addrLng };
    }
  }
  // Quote presets for the demo customers (the quote form picks from these).
  // isDefault is NOT set - the form starts empty and the user picks a preset manually.
  await prisma.quotePreset.createMany({
    data: [
      {
        userId: customerByRef['C_LOYAL'],
        label: 'Home - myself',
        contactName: 'Priya Subramaniam',
        contactNumber: '+60 19-876 5432',
        addressId: addressByRef['C_LOYAL:0'],
        instruction: 'Gate code 1234. Please call on arrival.',
        preferredTimeSlot: 'noon',
      },
      {
        userId: customerByRef['C_LOYAL'],
        label: "Parents' place",
        contactName: 'Arun Subramaniam',
        contactNumber: '+60 12-555 0199',
        addressId: addressByRef['C_LOYAL:1'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_ACTIVE'],
        label: 'Home - myself',
        contactName: 'David Tan',
        contactNumber: '+60 11-234 5678',
        addressId: addressByRef['C_ACTIVE:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_FRESH'],
        label: 'Home - myself',
        contactName: 'Sarah Lim',
        contactNumber: '+60 12-345 6789',
        addressId: addressByRef['C_FRESH:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_FRESH2'],
        label: 'Home - myself',
        contactName: 'Nurul Hafizah',
        contactNumber: '+60 17-111 2233',
        addressId: addressByRef['C_FRESH2:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_FRESH3'],
        label: 'Home - myself',
        contactName: 'Michael Lim',
        contactNumber: '+60 16-222 3344',
        addressId: addressByRef['C_FRESH3:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_ACTIVE2'],
        label: 'Home - myself',
        contactName: 'Rashida Kamila',
        contactNumber: '+60 18-333 4455',
        addressId: addressByRef['C_ACTIVE2:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_ACTIVE3'],
        label: 'Home - myself',
        contactName: 'Jason Yeoh',
        contactNumber: '+60 14-444 5566',
        addressId: addressByRef['C_ACTIVE3:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_LOYAL2'],
        label: 'Home - myself',
        contactName: 'Tan Mei Ling',
        contactNumber: '+60 13-555 6677',
        addressId: addressByRef['C_LOYAL2:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_LOYAL3'],
        label: 'Home - myself',
        contactName: 'Rajan Krishnan',
        contactNumber: '+60 11-666 7788',
        addressId: addressByRef['C_LOYAL3:0'],
        preferredTimeSlot: 'afternoon',
      },
    ],
  });
  console.log(`  ✓ admin + ${customers.length} customers + quote presets`);

  // ── Customer wallet history ──
  // Give each demo customer a RM 200 top-up plus a couple of booking-payment
  // deductions so the wallet / transaction history page is populated. The
  // remaining creditBalance reflects the transaction trail.
  const customerBookingDeductions = [
    { amount: 60, reference: 'Home Cleaning booking payment' },
    { amount: 80, reference: 'Aircond Servicer booking payment' },
  ];
  for (const c of customers) {
    const uid = customerByRef[c.ref];
    const topup = 200;
    const totalDeducted = customerBookingDeductions.reduce((s, d) => s + d.amount, 0);
    await prisma.transaction.create({
      data: { type: 'deposit_topup', amount: topup, userId: uid, reference: 'Demo top-up' },
    });
    for (const d of customerBookingDeductions) {
      const customerBooking = await prisma.booking.findFirst({
        where: { userId: uid, status: 'completed' },
        select: { id: true },
      });
      await prisma.transaction.create({
        data: { type: 'escrow_hold', amount: d.amount, userId: uid, bookingId: customerBooking?.id ?? null, reference: d.reference },
      });
    }
    await prisma.user.update({
      where: { id: uid },
      data: { creditBalance: topup - totalDeducted },
    });
  }
  console.log(`  ✓ customer wallet history (RM 200 top-up + ${customerBookingDeductions.length} payments each)`);

  // ── Customer Points & Rewards Profiles ──
  // Customer.fresh (new) - 500 balance, 500 lifetime (Bronze)
  await prisma.customerPoints.create({
    data: { userId: customerByRef['C_FRESH'], balance: 500, lifetimeEarned: 500 },
  });
  await prisma.pointsTransaction.create({
    data: { userId: customerByRef['C_FRESH'], type: 'earn_welcome', amount: 500, balance: 500, note: '🎉 Welcome! Here are 500 free points to get started.' },
  });

  // Customer.active (returning) - 950 balance, 950 lifetime (Silver)
  await prisma.customerPoints.create({
    data: { userId: customerByRef['C_ACTIVE'], balance: 950, lifetimeEarned: 950 },
  });
  await prisma.pointsTransaction.create({
    data: { userId: customerByRef['C_ACTIVE'], type: 'earn_welcome', amount: 500, balance: 950, note: '🎉 Welcome! Here are 500 free points to get started.' },
  });
  for (const [amount, note] of [[150, 'Bathroom cleaning'], [50, 'Review for bathroom cleaning'], [200, 'Aircon servicing'], [50, 'Review for aircon servicing']] as [number, string][]) {
    await prisma.pointsTransaction.create({
      data: { userId: customerByRef['C_ACTIVE'], type: amount <= 100 ? 'earn_review' : 'earn_booking', amount, balance: 0, note, createdAt: new Date(Date.now() - (30 - note.length) * 86_400_000) },
    });
  }

  // Customer.loyal (regular) - 2100 balance, 2600 lifetime (Gold)
  await prisma.customerPoints.create({
    data: { userId: customerByRef['C_LOYAL'], balance: 2100, lifetimeEarned: 2600, lifetimeSpent: 500 },
  });
  const loyalTx = [
    { type: 'earn_welcome', amount: 500, note: '🎉 Welcome! Here are 500 free points to get started.' },
    { type: 'earn_booking', amount: 150, note: 'Earned from booking #BATH001 - Bathroom cleaning' },
    { type: 'earn_review', amount: 50, note: 'Review for bathroom cleaning' },
    { type: 'earn_booking', amount: 200, note: 'Earned from booking #AC001 - Aircon servicing' },
    { type: 'earn_review', amount: 50, note: 'Review for aircon servicing' },
    { type: 'earn_booking', amount: 180, note: 'Earned from booking #KPLUMB - Kitchen plumbing' },
    { type: 'earn_review', amount: 50, note: 'Review for kitchen plumbing' },
    { type: 'earn_booking', amount: 300, note: 'Earned from booking #FULLCLN - Full house cleaning' },
    { type: 'earn_review', amount: 50, note: 'Review for full house cleaning' },
    { type: 'earn_booking', amount: 120, note: 'Earned from booking #ELEC1 - Electrical repair' },
    { type: 'earn_review', amount: 50, note: 'Review for electrical repair' },
    { type: 'earn_referral', amount: 200, note: 'Referred a friend who booked' },
    { type: 'earn_booking', amount: 250, note: 'Earned from booking #DOOR01 - Door gate installation' },
    { type: 'earn_review', amount: 50, note: 'Review for door gate installation' },
    { type: 'earn_booking', amount: 220, note: 'Earned from booking #ROOF01 - Roof repair' },
    { type: 'earn_review', amount: 50, note: 'Review for roof repair' },
    { type: 'earn_booking', amount: 180, note: 'Earned from booking #RENO01 - Renovation consultation' },
    { type: 'earn_review', amount: 50, note: 'Review for renovation consultation' },
    { type: 'earn_booking', amount: 160, note: 'Earned from booking #INTER01 - Interior design consult' },
    { type: 'earn_review', amount: 50, note: 'Review for interior design consult' },
    { type: 'earn_booking', amount: 140, note: 'Earned from booking #WEDD01 - Wedding planning session' },
    { type: 'earn_review', amount: 50, note: 'Review for wedding planning session' },
  ];
  let runningBalance = 0;
  for (let i = 0; i < loyalTx.length; i++) {
    const tx = loyalTx[i];
    runningBalance += tx.amount;
    await prisma.pointsTransaction.create({
      data: {
        userId: customerByRef['C_LOYAL'],
        type: tx.type,
        amount: tx.amount,
        balance: runningBalance,
        note: tx.note,
        createdAt: new Date(Date.now() - (loyalTx.length - i) * 86_400_000),
      },
    });
  }
  // Loyal's redemption (500 pts spent)
  const loyalReward = await prisma.reward.findFirst({ where: { pointCost: 500 } });
  if (loyalReward) {
    await prisma.pointsTransaction.create({
      data: {
        userId: customerByRef['C_LOYAL'],
        type: 'redeem',
        amount: -500,
        balance: runningBalance - 500,
        reference: loyalReward.id,
        note: 'Redeemed "RM 25 top-up discount"',
        createdAt: new Date(Date.now() - 2 * 86_400_000),
      },
    });
    await prisma.redemption.create({
      data: {
        userId: customerByRef['C_LOYAL'],
        rewardId: loyalReward.id,
        voucherCode: 'RWD-SEED01',
        status: 'used',
        usedAt: new Date(Date.now() - 1 * 86_400_000),
        expiresAt: new Date(Date.now() + 28 * 86_400_000),
      },
    });
  }
  console.log('  ✓ customer points profiles (Fresh: 500, Active: 950, Loyal: 2100)');

  // Active customers (C_ACTIVE2, C_ACTIVE3) — earned points from bookings
  for (const ref of ['C_ACTIVE2', 'C_ACTIVE3']) {
    const uid = customerByRef[ref];
    if (!uid) continue;
    await prisma.customerPoints.create({ data: { userId: uid, balance: 1250, lifetimeEarned: 1250 } });
    await prisma.pointsTransaction.create({ data: { userId: uid, type: 'earn_welcome', amount: 500, balance: 500, note: '🎉 Welcome! Here are 500 free points to get started.' } });
    for (const [amount, note] of [[200, 'Aircond servicing'], [50, 'Review'], [300, 'Full house cleaning'], [50, 'Review'], [150, 'Plumbing repair']] as [number, string][]) {
      await prisma.pointsTransaction.create({ data: { userId: uid, type: amount <= 100 ? 'earn_review' : 'earn_booking', amount, balance: 0, note, createdAt: new Date(Date.now() - Math.random() * 60 * 86_400_000) } });
    }
  }

  // Loyal customers (C_LOYAL2, C_LOYAL3) — high points + multiple redemptions
  for (const ref of ['C_LOYAL2', 'C_LOYAL3']) {
    const uid = customerByRef[ref];
    if (!uid) continue;
    await prisma.customerPoints.create({ data: { userId: uid, balance: 1800, lifetimeEarned: 2800, lifetimeSpent: 1000 } });
    const bal: { type: string; amount: number; note: string }[] = [
      { type: 'earn_welcome', amount: 500, note: '🎉 Welcome! Here are 500 free points to get started.' },
      { type: 'earn_booking', amount: 250, note: 'Earned from booking #AC001' },
      { type: 'earn_review', amount: 50, note: 'Review for aircon servicing' },
      { type: 'earn_booking', amount: 300, note: 'Earned from booking #FULLCLN' },
      { type: 'earn_review', amount: 50, note: 'Review for cleaning' },
      { type: 'earn_booking', amount: 200, note: 'Earned from booking #PLUMB02' },
      { type: 'earn_review', amount: 50, note: 'Review for plumbing' },
      { type: 'earn_referral', amount: 200, note: 'Referred a friend' },
      { type: 'earn_booking', amount: 180, note: 'Earned from booking #ELEC02' },
      { type: 'earn_review', amount: 50, note: 'Review for electrical' },
      { type: 'earn_booking', amount: 220, note: 'Earned from booking #PAINT01' },
    ];
    let rb = 0;
    for (let i = 0; i < bal.length; i++) {
      const t = bal[i]; rb += t.amount;
      await prisma.pointsTransaction.create({ data: { userId: uid, type: t.type as any, amount: t.amount, balance: rb, note: t.note, createdAt: new Date(Date.now() - (bal.length - i) * 86_400_000) } });
    }
    // 2 redemptions per loyal customer
    for (let r = 0; r < 2; r++) {
      const pts = r === 0 ? 500 : 500;
      await prisma.pointsTransaction.create({ data: { userId: uid, type: 'redeem', amount: -pts, balance: rb - pts, reference: `seed-redeem-${ref}-${r}`, note: r === 0 ? 'Redeemed "RM 25 top-up discount"' : 'Redeemed "RM 10 bonus credit"', createdAt: new Date(Date.now() - (2 - r) * 86_400_000) } });
      rb -= pts;
      await prisma.redemption.create({ data: { userId: uid, rewardId: (await prisma.reward.findFirst({ where: { pointCost: pts } }))?.id ?? '', voucherCode: `RWD-${ref}-${r}`, status: r === 0 ? 'used' : 'active', usedAt: r === 0 ? new Date(Date.now() - 1 * 86_400_000) : null, expiresAt: new Date(Date.now() + 28 * 86_400_000) } });
    }
  }

  // Fresh new customers (C_FRESH2, C_FRESH3) - minimal welcome points only
  for (const ref of ['C_FRESH2', 'C_FRESH3']) {
    const uid = customerByRef[ref];
    if (!uid) continue;
    await prisma.customerPoints.create({ data: { userId: uid, balance: 500, lifetimeEarned: 500 } });
    await prisma.pointsTransaction.create({ data: { userId: uid, type: 'earn_welcome', amount: 500, balance: 500, note: '🎉 Welcome! Here are 500 free points to get started.' } });
  }

  // ── Servicers, deposits, services, presets ──
  // Map each servicer ref → its local demo profile picture (M#_ShortName.png).
  // Files live in backend/uploads/profiles/demo and are served at /api/files/local.
  const demoLogoDir = join(__dirname, '../../uploads/profiles/demo');
  const demoLogoByRef: Record<string, string> = {};
  if (existsSync(demoLogoDir)) {
    for (const f of readdirSync(demoLogoDir)) {
      const match = f.match(/^(M\d+)_.*\.png$/);
      if (match) demoLogoByRef[match[1]] = `/api/files/local/profiles/demo/${f}`;
    }
  }

  const servicerByRef: Record<string, string> = {};
  const serviceBySku: Record<string, string> = {};
  for (const m of servicers) {
    const servicer = await prisma.servicer.create({
      data: {
        id: fixedUuid(m.email),
        name: m.name,
        email: m.email,
        phone: m.phone,
        passwordHash,
        pinHash,
        businessName: m.businessName,
        bio: `${m.businessName} - based in ${m.area}.`,
        logoUrl: demoLogoByRef[m.ref] ?? `https://picsum.photos/seed/servicer${m.ref}/200/200`,
        categoryId: categoryBySlug[m.categorySlug],
        isCompany: m.isCompany,
        entityType: m.entityType,
        taxNumber: m.taxNumber,
        businessRegistrationNumber: m.brn,
        sstRegistered: m.sstRegistered,
        sstNumber: m.sstNumber,
        serviceChargeRate: m.serviceChargeRate,
        taxInclusive: m.taxInclusive,
        bankName: m.bankName,
        bankAccount: m.bankAccount,
        showEmailPublic: m.showEmailPublic,
        showPhonePublic: m.showPhonePublic,
        invoicePrefix: m.invoicePrefix,
        invoiceYearFormat: m.invoiceYearFormat,
        invoiceSeparator: m.invoiceSeparator,
        invoicePadding: m.invoicePadding,
        invoiceContent: m.invoiceContent,
        invoiceSuffix: m.invoiceSuffix,
        serviceAreas: m.serviceAreas,
        lat: m.lat ?? jitter(areaCoords(m.area).lat),
        lng: m.lng ?? jitter(areaCoords(m.area).lng),
        rating: m.rating,
        operatingHours: {
          mon: { open: '09:00', close: '18:00' },
          tue: { open: '09:00', close: '18:00' },
          wed: { open: '09:00', close: '18:00' },
          thu: { open: '09:00', close: '18:00' },
          fri: { open: '09:00', close: '18:00' },
          sat: { open: '09:00', close: '14:00' },
          sun: { open: '09:00', close: '14:00' },
        },
        onboarded: true,
        serviceRadiusKm: (
          ['home-cleaning', 'sofa-mattress-cleaning', 'carpet-cleaning', 'curtain-cleaning', 'professional-organizer', 'event-planner', 'catering'].includes(m.categorySlug) ? 10
          : ['washing-machine-repair', 'refrigerator-repair', 'tv-repair', 'oven-repair', 'water-heater-repair', 'ceiling-fan-repair', 'aircond-repair'].includes(m.categorySlug) ? 15
          : ['art-class', 'language-class', 'music-class', 'home-tutoring', 'cooking-class', 'gym-trainer', '3d-modeling-class'].includes(m.categorySlug) ? 20
          : ['renovation', 'interior-design', 'roof', 'painting', 'aircond-installer', 'carpenter'].includes(m.categorySlug) ? 25
          : Math.floor(Math.random() * 11) + 10
        ),
        isDemo: true,
      },
    });
    servicerByRef[m.ref] = servicer.id;

    await prisma.servicerDeposit.create({
      data: {
        servicerId: servicer.id,
        totalDeposited: 500,
        currentBalance: 500,
        minimumRequired: 100,
      },
    });
    // Credit log showing initial deposit + bonus.
    await prisma.servicerCreditLog.create({
      data: {
        servicerId: servicer.id,
        type: 'manual_adjustment',
        amount: 500,
        balanceAfter: 500,
        note: 'Initial security deposit',
      },
    });
    await prisma.servicerCreditLog.create({
      data: {
        servicerId: servicer.id,
        type: 'manual_adjustment',
        amount: 100,
        balanceAfter: 600,
        note: 'Welcome bonus credit',
        createdAt: new Date(Date.now() - 25 * 86_400_000),
      },
    });
    await prisma.servicerProposalPreset.create({
      data: {
        servicerId: servicer.id,
        name: 'Standard quote',
        message: `Thanks for considering ${m.businessName}. Happy to help with your job.`,
        priceOffset: 0,
        isDefault: true,
      },
    });
    for (const s of m.services) {
      const svc = await prisma.servicerService.create({
        data: {
          servicerId: servicer.id,
          categoryId: categoryBySlug[m.categorySlug],
          title: s.title,
          label: s.title,
          description: s.title,
          servicerSku: s.sku,
          basePrice: s.basePrice,
          priceType: s.priceType,
          taxMode: m.taxMode,
          estimatedDurationMinutes: s.duration,
          autoAccept: s.autoAccept ?? false,
          autoAcceptConditions: (s.autoAcceptConditions as object) ?? undefined,
          travelFee: s.travelFee,
          suppliesFee: s.suppliesFee,
          procedure: s.procedure,
          // Phase 6: option-price map modifiers for priced-question categories.
          ...(s.modifiers ? { modifiers: s.modifiers as object } : {}),
        },
      });
      if (s.sku) serviceBySku[s.sku] = svc.id;
    }
  }
  console.log(`  ✓ ${servicers.length} servicers + services + deposits + presets`);

  // ── SP-3 Module Seeding (merged from seed-sp3-modules.ts) ───────────────────
  console.log('SP-3 Module seeding (all categories) started…');

  // Seed explicit category modules - ALL servicers per category
  for (const [slug, cfg] of Object.entries(CATEGORY_MODULES)) {
    const srvcs = await prisma.servicer.findMany({
      where: { category: { slug } },
      select: { id: true, businessName: true, categoryId: true },
    });
    for (const s of srvcs) {
      await seedForServicer(prisma, s, cfg.label, cfg.proposal, cfg.auto, cfg.mods);
    }
  }

  // Seed generic appliance repair + basic training categories - ALL servicers
  for (const [slug, cfg] of Object.entries(GENERIC_AUTO)) {
    const srvcs = await prisma.servicer.findMany({
      where: { category: { slug } },
      select: { id: true, businessName: true, categoryId: true },
    });
    for (const s of srvcs) {
      const mods: ModuleDef[] = Object.entries(cfg.opts).map(([val, info]) => ({
        name: info.label, questionKey: cfg.questionKey, optionValue: val, price: info.price, durationMin: info.dur,
      }));
      await seedForServicer(prisma, s, cfg.label, cfg.proposal, true, mods);
    }
  }

  // ── M1 Ahmad - modules but NO auto-accept on ANY listing ──────────
  const m1 = await prisma.servicer.findFirst({
    where: { businessName: { contains: 'Ahmad', mode: 'insensitive' }, category: { slug: 'plumber' } },
    select: { id: true, businessName: true },
  });
  if (m1) {
    await prisma.servicerService.updateMany({
      where: { servicerId: m1.id, deletedAt: null },
      data: { autoAccept: false, autoAcceptMessage: null },
    });
    console.log(`  M1 ${m1.businessName}: all listings set to manual (auto-accept disabled)`);
  }
  console.log('SP-3 Module seeding complete.');

  // ── Refresh platform settings (merged from seed-settings.ts) ──
  console.log('Refreshing platform settings…');
  const allCats = await prisma.category.findMany({ select: { id: true, slug: true } });
  const idBySlug2: Record<string, string> = {};
  for (const c of allCats) idBySlug2[c.slug] = c.id;
  const byCategoryId2: Record<string, { min: number; max: number | null }[]> = {};
  for (const slug of Object.keys(BUDGET_RANGE_PRESETS)) {
    const id = idBySlug2[slug];
    if (id) byCategoryId2[id] = BUDGET_RANGE_PRESETS[slug];
  }
  await prisma.platformSettings.upsert({
    where: { key: 'budget_ranges' },
    create: { key: 'budget_ranges', value: { ranges: byCategoryId2 } as Prisma.InputJsonValue },
    update: { value: { ranges: byCategoryId2 } as Prisma.InputJsonValue },
  });
  for (const s of platformSettings) {
    const value = (s.value ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    await prisma.platformSettings.upsert({
      where: { key: s.key },
      create: { key: s.key, value },
      update: { value },
    });
  }
  console.log('  ✓ platform settings upserted (budget ranges + greeting tiers etc.)');

  // ── Paired customer accounts for all servicers ──────────────────────────
  // Every servicer gets a paired customer account (customer mode) + 1 address
  // so the customer leaderboard shows them as active platform users.
  const svcCustRefs: string[] = [];
  const svcCustAddrKeys: string[] = [];
  const svcCustUserIds: Record<string, string> = {};
  for (const m of servicers) {
    const svcId = servicerByRef[m.ref];
    const pairedEmail = `servicer-${svcId}@customer.servicer.local`;
    const uid = fixedUuid(pairedEmail);
    // Create paired customer user
    await prisma.user.upsert({
      where: { id: uid },
      create: {
        id: uid,
        role: 'customer',
        name: m.name,
        email: pairedEmail,
        phone: m.phone,
        passwordHash,
        contactName: m.name,
        contactNumber: m.phone,
        isDemo: true,
      },
      update: {},
    });
    svcCustUserIds[m.ref] = uid;
    // Create address for this paired customer
    const addr = await prisma.userAddress.upsert({
      where: { id: fixedUuid(`${pairedEmail}-addr`) },
      create: {
        id: fixedUuid(`${pairedEmail}-addr`),
        userId: uid,
        label: 'Home',
        address: `${m.businessName}, ${m.area}`,
        propertyType: 'condo',
        isDefault: true,
        district: m.area.split(',')[0]?.trim() ?? null,
        lat: m.lat ?? jitter(areaCoords(m.area).lat),
        lng: m.lng ?? jitter(areaCoords(m.area).lng),
      },
      update: {},
    });
    const ref = `SVC_${m.ref}`;
    const addrKey = `${ref}:0`;
    customerByRef[ref] = uid;
    addressByRef[addrKey] = addr.id;
    addrCoordsByRef[addrKey] = { lat: addr.lat ?? 3.14, lng: addr.lng ?? 101.69 };
    svcCustRefs.push(ref);
    svcCustAddrKeys.push(addrKey);
  }
  console.log(`  ✓ paired customer accounts for ${svcCustRefs.length} servicers`);

  // ── Guest users (unregistered quote submitters) ─────────────────────────
  // Create 10 guest-style accounts that placed orders without full registration.
  const guestRefs: string[] = [];
  const guestAddrKeys: string[] = [];
  const guestNames = ['Amir Hakim', 'Siti Nora', 'Rajesh Kumar', 'Mei Ling Wong', 'Hafizuddin',
    'Jennifer Tan', 'Kumaravel Subra', 'Lisa Chen', 'Azman Ibrahim', 'Diana Surya'];
  for (let g = 0; g < guestNames.length; g++) {
    const guestId = fixedUuid(`guest-${g}@guest.local`);
    await prisma.user.upsert({
      where: { id: guestId },
      create: {
        id: guestId, role: 'customer', name: guestNames[g],
        email: `guest-${g}@guest.local`, phone: `+60 1${g}-000 ${1000 + g}`,
        passwordHash, contactName: guestNames[g],
        contactNumber: `+60 1${g}-000 ${1000 + g}`, isDemo: true,
      },
      update: {},
    });
    const area = ['Cyberjaya', 'KLCC', 'PJ', 'Cheras', 'Ampang'][g % 5];
    const coords = areaCoords(area);
    const addr = await prisma.userAddress.upsert({
      where: { id: fixedUuid(`guest-${g}@guest.local-addr`) },
      create: {
        id: fixedUuid(`guest-${g}@guest.local-addr`),
        userId: guestId, label: 'Home',
        address: `Unit ${g + 1}-${(g % 3) + 1}, Block ${String.fromCharCode(65 + g % 4)}, ${area}`,
        propertyType: g % 2 === 0 ? 'condo' : 'landed', isDefault: true,
        district: area, lat: coords.lat, lng: coords.lng,
      },
      update: {},
    });
    const ref = `GUEST_${g}`;
    const addrKey = `${ref}:0`;
    customerByRef[ref] = guestId;
    addressByRef[addrKey] = addr.id;
    addrCoordsByRef[addrKey] = { lat: coords.lat ?? 3.14, lng: coords.lng ?? 101.69 };
    guestRefs.push(ref);
    guestAddrKeys.push(addrKey);
  }
  console.log(`  ✓ guest customer accounts: ${guestRefs.length}`);

  // ── Demo quote helpers ──────────────────────────────────────────────────
  /**
   * Generate sample serviceDetails for each category using the EXACT
   * option values from static.ts question schemas.  2-3 variants per
   * category so not every seeded booking looks identical.
   */
  function sampleAnswers(categorySlug: string): Record<string, unknown> {
    const variants: Record<string, unknown>[] = (() => {
      switch (categorySlug) {
        case 'plumber': return [
          { action: 'repair', area: ['pipe_drain', 'tap_faucet_sink'], problem: ['leak_drip'] },
          { action: 'install', area: ['bathtub'], problem: ['no_problem'] },
          { action: 'replace', area: ['toilet_wc'], problem: ['clogged_stuck'] },
        ];
        case 'aircond-servicer': return [
          { aircon_service: ['wall_chemical', 'wall_general'] },
          { aircon_service: ['cassette_chemical', 'faulty_check'] },
          { aircon_service: ['wall_overhaul'] },
        ];
        case 'electrical-wiring': return [
          { action: 'repair', item: ['power_socket_switch'], problem: ['no_power'] },
          { action: 'install', item: ['lighting_downlight', 'ceiling_fan'] },
          { action: 'inspection_testing', item: ['distribution_board'], problem: ['not_sure'] },
        ];
        case 'home-cleaning': return [
          { cleaning_option: '2h_2c', cleaning_supplies: 'single_session', pets: ['no_pets'] },
          { cleaning_option: '3h_2c', cleaning_supplies: 'no_i_provide', pets: ['cat'] },
          { cleaning_option: '4h_2c', cleaning_supplies: 'single_session', pets: ['dog', 'others'] },
        ];
        case 'sofa-mattress-cleaning': return [
          { clean_for: ['leather_sofa'], sofa_size: '2_seater' },
          { clean_for: ['fabric_sofa', 'single_mattress'], sofa_size: '3_seater' },
          { clean_for: ['queen_mattress', 'king_mattress'] },
        ];
        case 'carpet-cleaning': return [
          { cleaning_type: 'carpet_medium' },
          { cleaning_type: 'rug_2' },
          { cleaning_type: 'carpet_large' },
        ];
        case 'curtain-cleaning': return [
          { curtain_sizes: { full_height_60: 2, half_height_40: 1 }, cleaning_type: 'normal_cleaning' },
          { curtain_sizes: { full_height_100: 1 }, cleaning_type: 'dry_cleaning' },
          { curtain_sizes: { full_height_40: 3, half_height_60: 2 }, cleaning_type: 'normal_cleaning' },
        ];
        case 'event-planner': return [
          { event_for: ['marriage_ceremony', 'wedding_reception'], venue: 'hotel_ballroom', planning_services: ['style_theme', 'budget_planning', 'vendor_selection'], attendees: 150 },
          { event_for: ['private_event'], venue: 'home', planning_services: ['floor_activity', 'invite_rsvp'], attendees: 40 },
          { event_for: ['corporate_event'], venue: 'office', planning_services: ['vendor_coordination', 'vendor_selection'], attendees: 200 },
        ];
        case 'catering': return [
          { halal: 'halal', event_for: ['wedding_reception'], cuisine: ['malay', 'western'], service_mode: 'on_site', pax: { person: 50 } },
          { halal: 'halal', event_for: ['private_event'], cuisine: ['chinese', 'thai'], service_mode: 'delivery', pax: { person: 20 } },
          { halal: 'non_halal', event_for: ['corporate_event'], cuisine: ['western'], service_mode: 'on_site', pax: { person: 80 } },
        ];
        case 'professional-organizer': return [
          { home_size: '2br', space: ['bedroom', 'wardrobe_closet'], service_type: ['decluttering', 'folding_categorizing'], supplies: 'no_i_provide' },
          { home_size: '3br', space: ['kitchen_pantry', 'living_room'], service_type: ['space_planning', 'storage_setup'], supplies: 'yes_provide' },
          { home_size: 'studio_1br', space: ['study_office'], service_type: ['labeling', 'maintenance'], supplies: 'no_i_provide' },
        ];
        case 'aircond-installer': return [
          { units: { wall_1hp: 1 } },
          { units: { wall_1_5hp: 2 } },
          { units: { cassette_2hp: 1, dismantle_only: 1 } },
        ];
        case 'carpenter': return [
          { action: 'custom_build', item: ['cabinet_kitchen', 'wardrobe_closet'], material: 'solid_wood', supply: 'yes_supply_build' },
          { action: 'repair', item: ['door'], material: 'not_sure', supply: 'no_i_have_materials' },
          { action: 'install', item: ['shelves_storage', 'table_desk'], material: 'plywood', supply: 'yes_supply_build' },
        ];
        case 'interior-design': return [
          { service_level: 'concept_3d', scope: 'single_room', rooms: ['living', 'dining'], style: ['modern_contemporary'] },
          { service_level: 'design_pm', scope: 'whole_home', rooms: ['master_bedroom', 'bedroom', 'kitchen'], style: ['minimalist', 'scandinavian'] },
          { service_level: 'consultation_only', scope: 'commercial_office', rooms: ['study_office'], style: ['not_sure'] },
        ];
        case 'door-gate': return [
          { action: 'new_install', gate_type: ['autogate_swing'], component: [], problem: [] },
          { action: 'repair', gate_type: ['autogate_sliding'], component: ['motor_engine'], problem: ['not_moving'] },
          { action: 'replace', gate_type: ['grille_gate', 'roller_shutter'], component: [], problem: ['rust_damaged'] },
        ];
        case 'roof': return [
          { action: 'leak_repair', roof_type: 'clay_concrete_tile', problem: ['active_leak', 'water_stain'] },
          { action: 'gutter_clean_repair', roof_type: 'metal_zinc', problem: ['clogged_gutter'] },
          { action: 'waterproofing', roof_type: 'concrete_flat', problem: ['moss_algae'] },
        ];
        case 'renovation': return [
          { project_type: 'kitchen', scope: ['tiling_flooring', 'plumbing', 'built_in_carpentry'], property_status: 'currently_occupied' },
          { project_type: 'full_home', scope: ['hacking_demolition', 'plastering_painting', 'electrical_wiring', 'ceiling'], property_status: 'old_renovating' },
          { project_type: 'bathroom_toilet', scope: ['tiling_flooring', 'waterproofing'], property_status: 'new_empty' },
        ];
        case 'painting': return [
          { paint_scope: 'one_room', paint_surfaces: ['walls'], paint_supply: 'painter_supplies' },
          { paint_scope: 'whole_house', paint_surfaces: ['walls', 'ceiling', 'doors_frames'], paint_supply: 'painter_supplies', wall_condition: 'good' },
          { paint_scope: 'feature_wall', paint_surfaces: ['walls'], paint_supply: 'i_provide' },
        ];
        case 'moving': return [
          { move_type: 'whole_home', home_size: '2_3_rooms', lift_access: 'lift', heavy_items: ['sofa', 'wardrobe'], packing_help: 'i_pack' },
          { move_type: 'few_big_items', home_size: 'items_only', lift_access: 'ground_floor', heavy_items: ['fridge', 'washing_machine'], packing_help: 'pack_for_me' },
          { move_type: 'office', home_size: '4_plus', lift_access: 'lift', heavy_items: ['none'], packing_help: 'partial' },
        ];
        case 'gardening': return [
          { garden_work: ['lawn_mowing', 'hedge'], garden_size: 'medium' },
          { garden_work: ['tree_pruning', 'landscaping'], garden_size: 'large' },
          { garden_work: ['weeding'], garden_size: 'small' },
        ];
        case 'alarm-cctv': return [
          { action: 'new_install', system_type: ['cctv_cameras', 'alarm_system'], cameras: 4, location: ['indoor', 'outdoor'], supply: 'yes_supply_install' },
          { action: 'repair', system_type: ['smart_doorbell'], supply: 'no_i_have_equipment' },
          { action: 'add_expand', system_type: ['motion_sensors'], cameras: 2, location: ['entrance_gate'], supply: 'yes_supply_install' },
        ];
        case 'washing-machine-repair': return [
          { appliance: 'washing_machine_front', problem: ['leaking_water', 'noisy_vibrating'] },
          { appliance: 'washing_machine_top', problem: ['not_spinning'] },
          { appliance: 'dryer', problem: ['not_heating'] },
        ];
        case 'refrigerator-repair': return [
          { fridge_type: 'double_door', problem: ['not_cooling'] },
          { fridge_type: 'side_by_side', problem: ['leaking_water', 'noisy'] },
          { fridge_type: 'chest_freezer', problem: ['frost_build_up'] },
        ];
        case 'tv-repair': return [
          { tv_type: 'led_lcd', problem: ['no_power'] },
          { tv_type: 'smart_tv', problem: ['no_signal'] },
          { tv_type: 'oled', problem: ['lines_spots'] },
        ];
        case 'oven-repair': return [
          { oven_type: 'built_in_oven', problem: ['not_heating'] },
          { oven_type: 'freestanding', problem: ['door_fault'] },
          { oven_type: 'gas_oven', problem: ['sparking'] },
        ];
        case 'water-heater-repair': return [
          { heater_type: 'instant_single', problem: ['no_hot_water', 'low_pressure'] },
          { heater_type: 'storage_tank', problem: ['leaking'] },
          { heater_type: 'solar', problem: ['not_powering_on'] },
        ];
        case 'ceiling-fan-repair': return [
          { fan_type: 'remote_controlled', problem: ['wobbling', 'noisy'] },
          { fan_type: 'standard', problem: ['not_spinning'] },
          { fan_type: 'decorative_dc', problem: ['remote_control_fault'] },
        ];
        case 'aircond-repair': return [
          { aircon_type: 'wall_mounted_split', problem: ['not_cold'] },
          { aircon_type: 'cassette_ceiling', problem: ['water_leaking', 'bad_smell'] },
          { aircon_type: 'inverter', problem: ['needs_gas_top_up'] },
        ];
        case 'art-class': return [
          { format: 'in_person_tutor', level: 'beginner', art_type: ['painting'], frequency: 'one_off_trial', learner: 'adult' },
          { format: 'online', level: 'intermediate', art_type: ['digital_art'], frequency: 'weekly', learner: 'teen' },
          { format: 'in_person_home', level: 'kids', art_type: ['drawing_sketching', 'craft_diy'], frequency: 'one_off_trial', learner: 'child' },
        ];
        case 'language-class': return [
          { format: 'online', level: 'beginner', language: ['mandarin'], goal: 'conversational', frequency: 'weekly' },
          { format: 'in_person_tutor', level: 'intermediate', language: ['japanese'], goal: 'exam_cert', frequency: 'intensive' },
          { format: 'online', level: 'advanced', language: ['english'], goal: 'business', frequency: 'one_off_trial' },
        ];
        case 'music-class': return [
          { instrument: ['piano'], level: 'beginner', format: 'in_person_tutor', frequency: 'weekly', learner: 'child' },
          { instrument: ['guitar', 'vocal_singing'], level: 'intermediate', format: 'online', frequency: 'one_off_trial', learner: 'teen' },
          { instrument: ['drums'], level: 'advanced', format: 'in_person_home', frequency: 'intensive', learner: 'adult' },
        ];
        case 'home-tutoring': return [
          { level: 'spm', subjects: ['math', 'science'], format: 'online', frequency: 'weekly', students: 1 },
          { level: 'primary', subjects: ['bm', 'english', 'mandarin'], format: 'at_my_home', frequency: 'intensive', students: 2 },
          { level: 'university', subjects: ['physics', 'chemistry'], format: 'at_tutor', frequency: 'one_off_trial', students: 1 },
        ];
        case 'cooking-class': return [
          { format: 'in_person_venue', setup: 'small_group', cuisine: ['malay', 'baking_pastry'], ingredients: 'yes_provide', level: 'beginner' },
          { format: 'online', setup: 'private_1on1', cuisine: ['western', 'healthy_diet'], ingredients: 'no_i_provide', level: 'intermediate' },
          { format: 'in_person_home', setup: 'workshop_event', cuisine: ['desserts'], ingredients: 'yes_provide', level: 'advanced' },
        ];
        case 'gym-trainer': return [
          { format: 'at_gym', trainee: 'individual', goal: ['weight_loss', 'general_fitness'], frequency: '2_3x_week', gender_pref: 'no_preference' },
          { format: 'outdoor_park', trainee: 'couple', goal: ['muscle_gain', 'strength'], frequency: '1x_week', gender_pref: 'female' },
          { format: 'at_my_home', trainee: 'small_group', goal: ['rehab_recovery'], frequency: 'daily', gender_pref: 'male' },
        ];
        case '3d-modeling-class': return [
          { format: 'online', field: ['product'], level: 'beginner', software: ['blender'], frequency: 'weekly' },
          { format: 'in_person_tutor', field: ['animation_cinematic', 'character'], level: 'intermediate', software: ['maya', 'zbrush'], frequency: 'intensive' },
          { format: 'online', field: ['environment_prop', 'sculpting'], level: 'advanced', software: ['blender', '3ds_max'], frequency: 'one_off_trial' },
        ];
        default: return [{}];
      }
    })();
    const idx = Math.floor(Math.random() * variants.length);
    return (variants[idx] ?? {}) as Record<string, unknown>;
  }

  function sampleNotes(payment: string): string {
    const notes: Record<string, string> = {
      pay_now: 'Park at visitor lot B. Use the side entrance on Jalan Setiabakti. Ring bell #3.',
      pay_later: 'Please call 15 minutes before arrival. Pets on premises - kindly notify if allergic.',
      cash: 'Gate access code: #7721. Leave the receipt in the mailbox after service.',
    };
    return notes[payment] ?? '';
  }

  // ── In-flight scenario helper ──────────────────────────────────────────────
  async function makeQuote(
    customerRef: string,
    addressKey: string,
    categorySlug: string,
    opts: { timeSlot?: 'morning' | 'noon' | 'afternoon' | 'evening' | 'night'; status?: 'open' | 'matched'; budget?: [number, number]; payment?: 'pay_now' | 'pay_later' | 'cash'; deadline?: Date; serviceDetails?: Record<string, unknown>; notes?: string } = {},
  ) {
    const cust = customers.find((c) => c.ref === customerRef);
    const userId = customerByRef[customerRef];
    // Fallback: look up user from DB for paired/guest accounts not in customers[]
    const fallbackName = cust?.name ?? (userId ? (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? 'Demo Customer' : 'Demo Customer');
    const fallbackPhone = cust?.phone ?? '+60 12-000 0000';
    return prisma.quoteRequest.create({
      data: {
        userId,
        categoryId: categoryBySlug[categorySlug],
        addressId: addressByRef[addressKey],
        contactName: fallbackName,
        contactNumber: fallbackPhone,
        timeSlot: opts.timeSlot ?? 'morning',
        preferredDate: days(1),
        propertyType: 'condo',
        budgetMin: opts.budget?.[0] ?? 60,
        budgetMax: opts.budget?.[1] ?? 200,
        paymentMode: opts.payment ?? 'pay_later',
        deadlineMode: 'fixed_time',
        proposalDeadline: opts.deadline ?? minutes(offset),
        servicerDeadline: opts.deadline
          ? new Date(opts.deadline.getTime() - 15 * 60_000)
          : minutes(offset - 15),
        status: opts.status ?? 'open',
        serviceDetails: opts.serviceDetails
          ? (opts.serviceDetails as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        notes: opts.notes ?? null,
        lat: addrCoordsByRef[addressKey]?.lat ?? 3.1390,
        lng: addrCoordsByRef[addressKey]?.lng ?? 101.6869,
      },
    });
  }

  // ── Open quotes (give M1, M2, M9 each a live quote + proposal) ──

  // Customer.active - open aircond servicing quote → M2 broadcasts + auto proposal.
  const activeQuote = await prisma.quoteRequest.create({
    data: {
      userId: customerByRef['C_ACTIVE'],
      categoryId: categoryBySlug['aircond-servicer'],
      addressId: addressByRef['C_ACTIVE:0'],
      contactName: 'Demo Customer',
      contactNumber: '+60 12-000 0000',
      timeSlot: 'morning',
      preferredDate: days(1),
      propertyType: 'condo',
      budgetMin: 80,
      budgetMax: 200,
      paymentMode: 'pay_later',
      deadlineMode: 'fixed_time',
      proposalDeadline: minutes(offset),
      servicerDeadline: minutes(offset - 15),
      status: 'open',
      serviceDetails: { aircon_service: ['wall_chemical', 'wall_general'], property_type: 'condo' },
      lat: addrCoordsByRef['C_ACTIVE:0']?.lat ?? 3.15, lng: addrCoordsByRef['C_ACTIVE:0']?.lng ?? 101.71,
    },
  });
  await prisma.quoteBroadcast.create({ data: { quoteRequestId: activeQuote.id, servicerId: servicerByRef['M2'] } });
  await prisma.quoteProposal.create({
    data: { quoteRequestId: activeQuote.id, servicerId: servicerByRef['M2'], proposedPrice: 110, lineItems: [{ label: 'Service', amount: 110, taxable: true, serviceChargeable: true }], message: 'CoolBreeze AC can handle this job.', etaMinutes: 60, isAuto: true },
  });

  // Open plumbing quote (C_FRESH) → M1 broadcast + proposal.
  const plumbingOpenQuote = await prisma.quoteRequest.create({
    data: {
      userId: customerByRef['C_FRESH'],
      categoryId: categoryBySlug['plumber'],
      addressId: addressByRef['C_FRESH:0'],
      contactName: 'Sarah Lim', contactNumber: '+60 12-345 6789',
      timeSlot: 'morning', preferredDate: days(2),
      propertyType: 'condo', budgetMin: 80, budgetMax: 250,
      paymentMode: 'pay_later', deadlineMode: 'fixed_time',
      proposalDeadline: minutes(offset), servicerDeadline: minutes(offset - 15),
      status: 'open',
      serviceDetails: sampleAnswers('plumber') as Prisma.InputJsonValue,
      lat: addrCoordsByRef['C_FRESH:0']?.lat ?? 2.924, lng: addrCoordsByRef['C_FRESH:0']?.lng ?? 101.657,
    },
  });
  await prisma.quoteBroadcast.create({ data: { quoteRequestId: plumbingOpenQuote.id, servicerId: servicerByRef['M1'] } });

  // Open catering quote (C_LOYAL) → M9 broadcast + proposal.
  const cateringOpenQuote = await prisma.quoteRequest.create({
    data: {
      userId: customerByRef['C_LOYAL'],
      categoryId: categoryBySlug['catering'],
      addressId: addressByRef['C_LOYAL:0'],
      contactName: 'Priya Subramaniam', contactNumber: '+60 19-876 5432',
      timeSlot: 'noon', preferredDate: days(3),
      propertyType: 'landed', budgetMin: 150, budgetMax: 500,
      paymentMode: 'pay_later', deadlineMode: 'fixed_time',
      proposalDeadline: minutes(offset + 60), servicerDeadline: minutes(offset + 45),
      status: 'open',
      lat: addrCoordsByRef['C_LOYAL:0']?.lat ?? 3.13, lng: addrCoordsByRef['C_LOYAL:0']?.lng ?? 101.63,
    },
  });
  await prisma.quoteBroadcast.create({ data: { quoteRequestId: cateringOpenQuote.id, servicerId: servicerByRef['M9'] } });
  await prisma.quoteProposal.create({
    data: { quoteRequestId: cateringOpenQuote.id, servicerId: servicerByRef['M9'], proposedPrice: 200, lineItems: [{ label: 'Service', amount: 200, taxable: true, serviceChargeable: true }], message: 'Auntie Mei Catering - homestyle Malaysian menu.', etaMinutes: 180, isAuto: true },
  });

  // Extra broadcasts (no proposal yet) - servicers see pending incoming quotes.
  const extraBroadcasts: { customerRef: string; addressKey: string; categorySlug: string; servicerRef: string }[] = [
    { customerRef: 'C_FRESH', addressKey: 'C_FRESH:0', categorySlug: 'tv-repair',          servicerRef: 'M19' },
    { customerRef: 'C_FRESH', addressKey: 'C_FRESH:0', categorySlug: 'ceiling-fan-repair',  servicerRef: 'M22' },
    { customerRef: 'C_ACTIVE', addressKey: 'C_ACTIVE:0', categorySlug: 'art-class',         servicerRef: 'M24' },
    { customerRef: 'C_LOYAL', addressKey: 'C_LOYAL:0', categorySlug: 'roof',               servicerRef: 'M16' },
    { customerRef: 'C_LOYAL', addressKey: 'C_LOYAL:1', categorySlug: 'carpet-cleaning',     servicerRef: 'M6' },
  ];
  for (const eb of extraBroadcasts) {
    const q = await makeQuote(eb.customerRef, eb.addressKey, eb.categorySlug, { status: 'open', deadline: minutes(offset) });
    await prisma.quoteBroadcast.create({ data: { quoteRequestId: q.id, servicerId: servicerByRef[eb.servicerRef] } });
  }
  console.log('  ✓ 3 open quotes with proposals + 5 extra broadcasts (pending)');

  // Booking-chain helper.
  async function makeBooking(
    customerRef: string,
    addressKey: string,
    servicerRef: string,
    categorySlug: string,
    status: 'pending_confirm' | 'in_progress' | 'completed' | 'cancelled',
    payment: 'pay_now' | 'pay_later' | 'cash',
    price: number,
    opts?: { scheduledDate?: Date; notes?: string },
  ) {
    const answers = sampleAnswers(categorySlug);
    const q = await makeQuote(customerRef, addressKey, categorySlug, {
      status: 'matched',
      payment,
      deadline: new Date(Date.now() - 60 * 60_000),
      serviceDetails: answers,
      notes: opts?.notes ?? sampleNotes(payment),
    });
    const proposal = await prisma.quoteProposal.create({
      data: {
        quoteRequestId: q.id,
        servicerId: servicerByRef[servicerRef],
        proposedPrice: price,
        lineItems: [{ label: 'Service', amount: price, taxable: true, serviceChargeable: true }],
        message: 'Proposal accepted by customer.',
        etaMinutes: 60,
        status: 'selected',
      },
    });
    const sched = opts?.scheduledDate ?? days(status === 'completed' || status === 'cancelled' ? -2 : 1);
    const booking = await prisma.booking.create({
      data: {
        quoteRequestId: q.id,
        proposalId: proposal.id,
        userId: customerByRef[customerRef],
        servicerId: servicerByRef[servicerRef],
        status,
        price,
        paymentMode: payment,
        lineItems: [
          { label: 'Service', amount: price, taxable: true, serviceChargeable: true },
        ],
        settlementMethod: 'cash',
        paymentTiming: status === 'completed' ? 'pay_later' : 'pay_later',
        scheduledDate: sched,
        timeSlot: 'morning',
        notes: opts?.notes ?? sampleNotes(payment),
        confirmedAt: opts?.scheduledDate ?? (status !== 'pending_confirm' ? days(-2) : null),
        arrivedAt: ['in_progress', 'completed'].includes(status) ? (opts?.scheduledDate ?? days(-2)) : null,
        arrivePhotoUrl: ['in_progress', 'completed'].includes(status)
          ? `https://picsum.photos/seed/arrive${servicerRef}/800/600`
          : null,
        doneAt: status === 'completed' ? (opts?.scheduledDate ?? days(-2)) : null,
        donePhotoUrl: status === 'completed'
          ? `https://picsum.photos/seed/done${servicerRef}/800/600`
          : null,
        cashConfirmed: false,
        cancelledBy: status === 'cancelled' ? 'servicer' : null,
        cancelReason: status === 'cancelled' ? 'No-show - servicer did not arrive' : null,
      },
    });
    return booking;
  }

  // M2 - in_progress aircond servicing booking.
  await makeBooking('C_LOYAL', 'C_LOYAL:0', 'M2', 'aircond-servicer', 'in_progress', 'pay_now', 130);
  // M4 - completed cash booking awaiting cash-confirm.
  await makeBooking('C_LOYAL', 'C_LOYAL:1', 'M4', 'home-cleaning', 'completed', 'cash', 110);
  // Customer.loyal - 3 completed bookings for history + reorder.
  const compM1 = await makeBooking('C_LOYAL', 'C_LOYAL:0', 'M1', 'plumber', 'completed', 'pay_later', 80);
  await makeBooking('C_LOYAL', 'C_LOYAL:0', 'M4', 'home-cleaning', 'completed', 'pay_later', 140);
  await makeBooking('C_LOYAL', 'C_LOYAL:1', 'M9', 'catering', 'completed', 'pay_later', 120);

  // ── Bulk completed bookings for ALL servicers ──
  // Each servicer gets 8-15 completed jobs (50 for AC Doctor) evenly spaced
  // across the last 30 days so every dashboard shows real 30-day revenue data.
  const servicerSlugs: { ref: string; slug: string; prices: number[]; count: number }[] = [
    { ref: 'M1',  slug: 'plumber',                prices: [80, 120, 160, 200, 250], count: 15 },
    { ref: 'M2',  slug: 'aircond-servicer',       prices: [80, 110, 140, 180],       count: 15 },
    { ref: 'M3',  slug: 'electrical-wiring',      prices: [60, 100, 150, 200],       count: 15 },
    { ref: 'M4',  slug: 'home-cleaning',          prices: [60, 100, 150, 200],       count: 15 },
    { ref: 'M5',  slug: 'sofa-mattress-cleaning', prices: [50, 70, 90, 120],         count: 12 },
    { ref: 'M6',  slug: 'carpet-cleaning',        prices: [40, 80, 140, 200],        count: 12 },
    { ref: 'M7',  slug: 'curtain-cleaning',       prices: [30, 50, 80, 120],         count: 12 },
    { ref: 'M8',  slug: 'event-planner',          prices: [1200, 3500, 8000, 20000],  count: 10 },
    { ref: 'M9',  slug: 'catering',               prices: [600, 1200, 2500, 4000],     count: 15 },
    { ref: 'M10', slug: 'professional-organizer', prices: [60, 100, 150, 200],       count: 12 },
    { ref: 'M11', slug: 'aircond-installer',      prices: [250, 400, 600, 900],      count: 12 },
    { ref: 'M12', slug: 'carpenter',              prices: [100, 200, 300, 500],      count: 12 },
    { ref: 'M13', slug: 'renovation',             prices: [30000, 55000, 85000, 120000], count: 8  },
    { ref: 'M14', slug: 'interior-design',        prices: [4000, 8000, 14000, 20000], count: 8  },
    { ref: 'M15', slug: 'door-gate',              prices: [80, 120, 180, 250],       count: 12 },
    { ref: 'M16', slug: 'roof',                   prices: [200, 400, 600, 1000],     count: 10 },
    { ref: 'M17', slug: 'washing-machine-repair', prices: [50, 80, 120, 160],        count: 12 },
    { ref: 'M18', slug: 'refrigerator-repair',    prices: [60, 80, 120, 180],        count: 12 },
    { ref: 'M19', slug: 'tv-repair',              prices: [40, 60, 100, 150],        count: 12 },
    { ref: 'M20', slug: 'oven-repair',            prices: [50, 70, 110, 160],        count: 12 },
    { ref: 'M21', slug: 'water-heater-repair',    prices: [60, 80, 130, 180],        count: 12 },
    { ref: 'M22', slug: 'ceiling-fan-repair',     prices: [40, 60, 90, 130],         count: 12 },
    { ref: 'M23', slug: 'aircond-repair',         prices: [60, 100, 150, 200],       count: 12 },
    { ref: 'M24', slug: 'art-class',              prices: [40, 60, 80, 120],         count: 12 },
    { ref: 'M25', slug: 'language-class',         prices: [40, 60, 80, 120],         count: 12 },
    { ref: 'M26', slug: 'music-class',            prices: [50, 70, 100, 150],        count: 12 },
    { ref: 'M27', slug: 'home-tutoring',          prices: [40, 60, 80, 120],         count: 12 },
    { ref: 'M28', slug: 'cooking-class',          prices: [60, 100, 150, 200],       count: 12 },
    { ref: 'M29', slug: 'gym-trainer',            prices: [60, 80, 120, 180],        count: 12 },
    { ref: 'M30', slug: '3d-modeling-class',      prices: [100, 150, 200, 300],      count: 12 },
    { ref: 'M31', slug: '3d-modeling-class',      prices: [80, 120, 180, 250],       count: 12 },
    { ref: 'M32', slug: '3d-modeling-class',      prices: [100, 150, 200, 300],      count: 50 },
    { ref: 'M33', slug: '3d-modeling-class',      prices: [120, 180, 250, 350],      count: 12 },
    { ref: 'M34', slug: '3d-modeling-class',      prices: [100, 150, 200, 300],      count: 12 },
    { ref: 'M35', slug: '3d-modeling-class',      prices: [120, 180, 250, 350],      count: 12 },
    { ref: 'M36', slug: 'alarm-cctv',             prices: [100, 200, 400, 800],      count: 12 },
    // ── Set B (M37–M66) ──
    { ref: 'M37',  slug: 'plumber',                prices: [80, 120, 160, 200],        count: 12 },
    { ref: 'M38',  slug: 'aircond-servicer',       prices: [90, 120, 150, 180],        count: 12 },
    { ref: 'M39',  slug: 'electrical-wiring',      prices: [55, 90, 140, 190],         count: 12 },
    { ref: 'M40',  slug: 'home-cleaning',          prices: [65, 100, 140, 200],        count: 12 },
    { ref: 'M41',  slug: 'sofa-mattress-cleaning', prices: [60, 80, 110, 150],         count: 10 },
    { ref: 'M42',  slug: 'carpet-cleaning',        prices: [55, 85, 130, 190],         count: 10 },
    { ref: 'M43',  slug: 'curtain-cleaning',       prices: [35, 55, 85, 120],          count: 10 },
    { ref: 'M44',  slug: 'event-planner',          prices: [1000, 3000, 7000, 15000],   count: 8  },
    { ref: 'M45',  slug: 'catering',               prices: [500, 1000, 2000, 3500],     count: 12 },
    { ref: 'M46',  slug: 'professional-organizer', prices: [70, 100, 150, 200],        count: 10 },
    { ref: 'M47',  slug: 'aircond-installer',      prices: [300, 450, 600, 900],       count: 10 },
    { ref: 'M48',  slug: 'carpenter',              prices: [100, 180, 280, 450],       count: 10 },
    { ref: 'M49',  slug: 'renovation',             prices: [25000, 50000, 80000, 110000], count: 8  },
    { ref: 'M50',  slug: 'interior-design',        prices: [5000, 10000, 15000, 20000], count: 8  },
    { ref: 'M51',  slug: 'door-gate',              prices: [80, 130, 200, 320],        count: 10 },
    { ref: 'M52',  slug: 'roof',                   prices: [200, 380, 600, 1000],      count: 8  },
    { ref: 'M53',  slug: 'washing-machine-repair', prices: [55, 85, 120, 160],         count: 10 },
    { ref: 'M54',  slug: 'refrigerator-repair',    prices: [60, 90, 120, 170],         count: 10 },
    { ref: 'M55',  slug: 'tv-repair',              prices: [45, 70, 100, 150],         count: 10 },
    { ref: 'M56',  slug: 'oven-repair',            prices: [50, 75, 110, 160],         count: 10 },
    { ref: 'M57',  slug: 'water-heater-repair',    prices: [60, 85, 130, 180],         count: 10 },
    { ref: 'M58',  slug: 'ceiling-fan-repair',     prices: [45, 65, 90, 130],          count: 10 },
    { ref: 'M59',  slug: 'aircond-repair',         prices: [65, 100, 150, 200],        count: 10 },
    { ref: 'M60',  slug: 'art-class',              prices: [45, 65, 85, 120],          count: 10 },
    { ref: 'M61',  slug: 'language-class',         prices: [45, 65, 85, 120],          count: 10 },
    { ref: 'M62',  slug: 'music-class',            prices: [55, 75, 100, 150],         count: 10 },
    { ref: 'M63',  slug: 'home-tutoring',          prices: [45, 65, 80, 120],          count: 10 },
    { ref: 'M64',  slug: 'cooking-class',          prices: [60, 90, 140, 200],         count: 10 },
    { ref: 'M65',  slug: 'gym-trainer',            prices: [60, 80, 120, 180],         count: 10 },
    { ref: 'M66',  slug: 'alarm-cctv',             prices: [120, 220, 450, 900],       count: 10 },
    // ── Set C (M67–M96) ──
    { ref: 'M67',  slug: 'plumber',                prices: [70, 110, 150, 200],        count: 10 },
    { ref: 'M68',  slug: 'aircond-servicer',       prices: [80, 110, 140, 180],        count: 10 },
    { ref: 'M69',  slug: 'electrical-wiring',      prices: [80, 120, 160, 220],        count: 10 },
    { ref: 'M70',  slug: 'home-cleaning',          prices: [60, 90, 130, 180],         count: 10 },
    { ref: 'M71',  slug: 'sofa-mattress-cleaning', prices: [55, 75, 100, 140],         count: 8  },
    { ref: 'M72',  slug: 'carpet-cleaning',        prices: [50, 80, 120, 180],         count: 8  },
    { ref: 'M73',  slug: 'curtain-cleaning',       prices: [30, 50, 75, 110],          count: 8  },
    { ref: 'M74',  slug: 'event-planner',          prices: [1500, 4000, 10000, 25000],  count: 8  },
    { ref: 'M75',  slug: 'catering',               prices: [700, 1500, 3000, 4000],     count: 10 },
    { ref: 'M76',  slug: 'professional-organizer', prices: [65, 95, 140, 190],         count: 8  },
    { ref: 'M77',  slug: 'aircond-installer',      prices: [280, 420, 580, 850],       count: 8  },
    { ref: 'M78',  slug: 'carpenter',              prices: [90, 160, 260, 420],        count: 8  },
    { ref: 'M79',  slug: 'renovation',             prices: [35000, 60000, 90000, 120000], count: 8  },
    { ref: 'M80',  slug: 'interior-design',        prices: [6000, 12000, 18000, 20000], count: 8  },
    { ref: 'M81',  slug: 'door-gate',              prices: [90, 140, 220, 350],        count: 8  },
    { ref: 'M82',  slug: 'roof',                   prices: [220, 400, 650, 1100],      count: 8  },
    { ref: 'M83',  slug: 'washing-machine-repair', prices: [50, 80, 115, 155],         count: 8  },
    { ref: 'M84',  slug: 'refrigerator-repair',    prices: [55, 85, 115, 165],         count: 8  },
    { ref: 'M85',  slug: 'tv-repair',              prices: [40, 65, 95, 145],          count: 8  },
    { ref: 'M86',  slug: 'oven-repair',            prices: [45, 70, 105, 155],         count: 8  },
    { ref: 'M87',  slug: 'water-heater-repair',    prices: [55, 80, 125, 175],         count: 8  },
    { ref: 'M88',  slug: 'ceiling-fan-repair',     prices: [40, 60, 85, 125],          count: 8  },
    { ref: 'M89',  slug: 'aircond-repair',         prices: [60, 95, 145, 195],         count: 8  },
    { ref: 'M90',  slug: 'art-class',              prices: [40, 60, 80, 115],          count: 8  },
    { ref: 'M91',  slug: 'language-class',         prices: [40, 60, 80, 115],          count: 8  },
    { ref: 'M92',  slug: 'music-class',            prices: [50, 70, 95, 145],          count: 8  },
    { ref: 'M93',  slug: 'home-tutoring',          prices: [40, 60, 75, 115],          count: 8  },
    { ref: 'M94',  slug: 'cooking-class',          prices: [55, 85, 130, 190],         count: 8  },
    { ref: 'M95',  slug: 'gym-trainer',            prices: [55, 75, 110, 170],         count: 8  },
    { ref: 'M96',  slug: 'alarm-cctv',             prices: [130, 240, 480, 950],       count: 8  },
    // ── New categories (M97–M105) - Painting, Moving, Gardening ──
    { ref: 'M97',  slug: 'painting',               prices: [120, 180, 240, 320],       count: 10 },
    { ref: 'M98',  slug: 'moving',                 prices: [200, 350, 500, 800],       count: 10 },
    { ref: 'M99',  slug: 'gardening',              prices: [80,  120, 180, 250],       count: 10 },
    { ref: 'M100', slug: 'painting',               prices: [110, 170, 230, 300],       count: 8  },
    { ref: 'M101', slug: 'moving',                 prices: [180, 320, 480, 750],       count: 8  },
    { ref: 'M102', slug: 'gardening',              prices: [70,  110, 160, 220],       count: 8  },
    { ref: 'M103', slug: 'painting',               prices: [100, 160, 220, 290],       count: 8  },
    { ref: 'M104', slug: 'moving',                 prices: [160, 300, 450, 700],       count: 8  },
    { ref: 'M105', slug: 'gardening',              prices: [65,  100, 150, 210],       count: 8  },
  ];
  const allBulkCompleted: { booking: Awaited<ReturnType<typeof makeBooking>>; servicerRef: string; price: number }[] = [];
  const allCustomerRefs = ['C_FRESH', 'C_FRESH2', 'C_FRESH3', 'C_ACTIVE', 'C_ACTIVE2', 'C_ACTIVE3', 'C_LOYAL', 'C_LOYAL2', 'C_LOYAL3', ...svcCustRefs, ...guestRefs];
  const allCustomerAddrs = ['C_FRESH:0', 'C_FRESH2:0', 'C_FRESH3:0', 'C_ACTIVE:0', 'C_ACTIVE2:0', 'C_ACTIVE3:0', 'C_LOYAL:0', 'C_LOYAL2:0', 'C_LOYAL3:0', ...svcCustAddrKeys, ...guestAddrKeys];
  for (const m of servicerSlugs) {
    const count = m.count;
    // Build a set of working days: ~80% chance per day (takes 1-2 days off per week).
    // Include today (day 0) so the admin dashboard shows activity for the current day.
    const workingDays: number[] = [];
    for (let d = 0; d >= -90; d--) {
      if (Math.random() < 0.8) workingDays.push(d);
    }
    // If for some reason we have fewer working days than bookings, pad with the last available day.
    const days = workingDays.length > 0 ? workingDays : [-1];
    for (let i = 0; i < count; i++) {
      const dayOffset = days[i % days.length];
      const sched = new Date(Date.now() + dayOffset * 86_400_000);
      const price = m.prices[i % m.prices.length];
      const pay = i % 7 === 0 ? 'cash' : 'pay_later';
      const custIdx = i % allCustomerRefs.length;
      const b = await makeBooking(
        allCustomerRefs[custIdx],
        allCustomerAddrs[custIdx],
        m.ref, m.slug, 'completed', pay, price,
        { scheduledDate: sched },
      );
      allBulkCompleted.push({ booking: b, servicerRef: m.ref, price });
    }
  }
  console.log(`  ✓ ${allBulkCompleted.length} bulk completed bookings across all servicers`);
  console.log('  ✓ in-flight bookings (pending, in-progress, cash, 3 completed)');

  // ── Per-servicer scenario bookings (all 105 servicers) ──
  // Each servicer account gets one of each state so every dashboard has real data.
  let scenarioIdx = 0;
  for (const m of servicerSlugs) {
    const custRef = allCustomerRefs[scenarioIdx % allCustomerRefs.length];
    const addrKey = allCustomerAddrs[scenarioIdx % allCustomerAddrs.length];
    // in_progress
    await makeBooking(custRef, addrKey, m.ref, m.slug, 'in_progress', 'pay_now', m.prices[1 % m.prices.length], { scheduledDate: new Date() });
    // cancelled
    await makeBooking(custRef, addrKey, m.ref, m.slug, 'cancelled', 'pay_later', m.prices[2 % m.prices.length], { scheduledDate: days(-1) });
    // future confirmed booking (every 3rd servicer, 1-14 days ahead)
    if (scenarioIdx % 3 === 0) {
      const futureDay = 1 + Math.floor(Math.random() * 14);
      await makeBooking(custRef, addrKey, m.ref, m.slug, 'confirmed', 'pay_now', m.prices[3 % m.prices.length], { scheduledDate: days(futureDay) });
    }
    scenarioIdx++;
  }
  console.log(`  ✓ per-servicer scenario bookings (in-progress, cancelled) for all ${servicerSlugs.length} servicers`);

  // ── Invoices + escrow_release for completed bookings ──
  // So that servicer dashboards show actual earnings on first boot.
  const completedBookings: { booking: typeof compM1; servicerRef: string; price: number }[] = [
    ...allBulkCompleted,
  ];
  let seqCounter = 1;
  for (const cb of completedBookings) {
    const servicerId = servicerByRef[cb.servicerRef];
    const doneAt = cb.booking.doneAt ?? new Date();
    // Apply a promo discount to roughly every 5th completed booking so the
    // earnings data reflects promotion usage.
    const promoDiscount = seqCounter % 5 === 0 ? Math.round(cb.price * 0.1 * 100) / 100 : 0;
    const total = cb.price - promoDiscount;
    await prisma.invoice.create({
      data: {
        bookingId: cb.booking.id,
        servicerId,
        invoiceNumber: `INV-SEED-${String(seqCounter).padStart(4, '0')}`,
        sequenceNumber: seqCounter++,
        lineItems: [
          { label: `${cb.servicerRef} service`, amount: cb.price, taxable: true, serviceChargeable: true },
        ],
        subtotal: cb.price,
        promoDiscount,
        taxRate: 0,
        taxAmount: 0,
        tipAmount: 0,
        platformFee: Math.round(total * 0.20 * 100) / 100,
        total,
        serviceChargeRate: 0,
        serviceChargeAmount: 0,
        sstApplies: false,
        taxInclusive: false,
        paidAt: doneAt,
        issuedAt: doneAt,
        createdAt: doneAt,
      },
    });
    await prisma.transaction.create({
      data: {
        type: 'escrow_release',
        amount: total,
        servicerId,
        bookingId: cb.booking.id,
        reference: `Seed - completed booking`,
        createdAt: doneAt,
      },
    });
  }
  console.log('  ✓ invoices + escrow_release for completed bookings');

  // ── Escrow rows for dashboard (D1) ──
  const escrowCandidates = allBulkCompleted.slice(0, 20);
  for (let i = 0; i < escrowCandidates.length; i++) {
    const cb = escrowCandidates[i];
    const isHeld = i < 3;
    await prisma.escrow.create({
      data: {
        bookingId: cb.booking.id,
        amount: cb.price,
        status: isHeld ? 'held' : 'released',
        platformFeeBase: cb.price,
        tipAmount: 0,
        releasedAt: isHeld ? null : (cb.booking.doneAt ?? new Date()),
      },
    });
  }
  console.log(`  ✓ escrow rows (${escrowCandidates.length} total, 3 held)`);

  // ── Urgent bookings + urgent_fee transactions (D4) ──
  const urgentCandidates = allBulkCompleted.filter((_cb, i) => i % 3 === 0).slice(0, 3);
  for (const ub of urgentCandidates) {
    await prisma.booking.update({
      where: { id: ub.booking.id },
      data: { isUrgent: true, urgentFee: 150 },
    });
    await prisma.transaction.create({
      data: {
        type: 'urgent_fee',
        amount: 30,
        bookingId: ub.booking.id,
        servicerId: servicerByRef[ub.servicerRef],
        reference: 'Seed - urgent fee platform share',
        createdAt: ub.booking.doneAt ?? new Date(),
      },
    });
  }
  console.log('  ✓ urgent bookings + urgent_fee transactions (3)');

  // ── Penalty scenarios ──
  // M3 (electrical-wiring) - active noshow penalty, deposit deducted.
  const m3Cancelled = await makeBooking('C_FRESH', 'C_FRESH:0', 'M3', 'electrical-wiring', 'cancelled', 'pay_later', 100);
  await prisma.penaltyLog.create({
    data: {
      bookingId: m3Cancelled.id,
      servicerId: servicerByRef['M3'],
      ruleId: penaltyRuleByType['noshow'],
      type: 'noshow',
      amountDeducted: 50,
    },
  });
  await prisma.servicerDeposit.update({
    where: { servicerId: servicerByRef['M3'] },
    data: { currentBalance: 450 },
  });
  await prisma.servicerCreditLog.create({
    data: {
      servicerId: servicerByRef['M3'],
      type: 'manual_adjustment',
      amount: -50,
      balanceAfter: 450,
      referenceId: m3Cancelled.id,
      note: 'No-show penalty deducted',
    },
  });

  // M23 (aircond-repair) - pending penalty appeal.
  const m23Cancelled = await makeBooking('C_FRESH', 'C_FRESH:0', 'M23', 'aircond-repair', 'cancelled', 'pay_later', 80);
  const m23Penalty = await prisma.penaltyLog.create({
    data: {
      bookingId: m23Cancelled.id,
      servicerId: servicerByRef['M23'],
      ruleId: penaltyRuleByType['noshow'],
      type: 'noshow',
      amountDeducted: 50,
    },
  });
  await prisma.penaltyAppeal.create({
    data: {
      penaltyLogId: m23Penalty.id,
      servicerId: servicerByRef['M23'],
      reason: 'Customer gave the wrong unit number; I waited 30 minutes outside.',
      status: 'pending',
    },
  });

  // M9 (catering) - approved appeal, penalty reversed.
  const m9Cancelled = await makeBooking('C_FRESH', 'C_FRESH:0', 'M9', 'catering', 'cancelled', 'pay_later', 90);
  const m9Penalty = await prisma.penaltyLog.create({
    data: {
      bookingId: m9Cancelled.id,
      servicerId: servicerByRef['M9'],
      ruleId: penaltyRuleByType['cancel'],
      type: 'cancel',
      amountDeducted: 30,
      status: 'reversed',
    },
  });
  await prisma.penaltyAppeal.create({
    data: {
      penaltyLogId: m9Penalty.id,
      servicerId: servicerByRef['M9'],
      reason: 'Family emergency - provided hospital documentation.',
      status: 'approved',
      adminNote: 'Appeal approved, RM30 reversed to deposit.',
      reviewedAt: days(-1),
    },
  });
  console.log('  ✓ penalty scenarios (M3 active, M23 appeal pending, M9 reversed)');

  // ── Promotions ──
  await prisma.promotion.createMany({
    data: [
      {
        label: 'Ahmad Plumbing 10% Off',
        description: 'Exclusive 10% discount on plumbing bookings.',
        triggerType: 'manual',
        valueType: 'percent',
        value: 10,
        conditions: { minOrderAmount: 50 },
        targetRole: 'customer',
        maxUses: 100,
        endDate: days(30),
      },
      {
        label: 'Maid Day First Booking',
        description: 'RM15 off your first maid service booking.',
        triggerType: 'manual',
        valueType: 'fixed',
        value: 15,
        conditions: { minOrderAmount: 80 },
        targetRole: 'customer',
        maxUses: 50,
      },
      {
        label: 'Welcome RM20 Off',
        description: 'Welcome offer - RM20 off your first booking.',
        triggerType: 'welcome',
        valueType: 'fixed',
        value: 20,
        conditions: { minOrderAmount: 100 },
        targetRole: 'customer',
        maxUses: 500,
        endDate: new Date('2026-12-31T23:59:59Z'),
      },
      {
        label: 'MMU Student 10% Off',
        description: '10% discount for MMU students.',
        triggerType: 'manual',
        valueType: 'percent',
        value: 10,
        targetRole: 'customer',
        maxUses: 200,
      },
    ],
  });
  console.log('  ✓ promotions (Ahmad 10%, Maid First, Welcome RM20, MMU 10%)');

  // ── Servicer schedules (all 36) ──
  const weekdaySlots: Array<{ weekday: Weekday; timeSlot: TimeSlot }> = [
    { weekday: Weekday.mon, timeSlot: TimeSlot.morning }, { weekday: Weekday.mon, timeSlot: TimeSlot.noon },
    { weekday: Weekday.tue, timeSlot: TimeSlot.morning }, { weekday: Weekday.tue, timeSlot: TimeSlot.noon },
    { weekday: Weekday.wed, timeSlot: TimeSlot.morning }, { weekday: Weekday.wed, timeSlot: TimeSlot.noon },
    { weekday: Weekday.thu, timeSlot: TimeSlot.morning }, { weekday: Weekday.thu, timeSlot: TimeSlot.noon },
    { weekday: Weekday.fri, timeSlot: TimeSlot.morning }, { weekday: Weekday.fri, timeSlot: TimeSlot.noon },
    { weekday: Weekday.sat, timeSlot: TimeSlot.morning },
    { weekday: Weekday.sun, timeSlot: TimeSlot.morning },
  ];
  const allRefs = Array.from({ length: 105 }, (_, i) => `M${i + 1}`);
  const scheduleRows = allRefs.flatMap(ref =>
    weekdaySlots.map(slot => ({ servicerId: servicerByRef[ref], ...slot }))
  );
  await prisma.servicerSchedule.createMany({ data: scheduleRows });
  console.log('  ✓ servicer schedules (all 36: weekday morning+noon, weekend morning)');

  // ── Admin queue items ──
  // Several pending category requests so the review queue is realistic.
  const categoryRequestSeed = [
    { ref: 'M1', name: 'gardening & landscaping', desc: 'Lawn mowing, hedge trimming and garden upkeep.' },
    { ref: 'M4', name: 'pet grooming', desc: 'Mobile pet grooming - washing, trimming, nail clipping.' },
    { ref: 'M24', name: 'photography class', desc: 'Photography lessons - beginner to advanced.' },
    { ref: 'M32', name: 'game development', desc: 'Unity, Unreal Engine, and game design tutoring.' },
    { ref: 'M28', name: 'bartending class', desc: 'Mixology and bartending skills workshop.' },
    { ref: 'M29', name: 'yoga instruction', desc: 'Yoga and pilates private sessions.' },
  ];
  for (const cr of categoryRequestSeed) {
    await prisma.categoryRequest.create({
      data: {
        servicerId: servicerByRef[cr.ref],
        name: cr.name,
        description: cr.desc,
        status: 'pending',
      },
    });
  }

  // Several pending withdrawal requests.
  const withdrawalSeed = [
    { ref: 'M1', amount: 120, bank: 'CIMB', acct: '7022 8841 0099' },
    { ref: 'M2', amount: 350, bank: 'Maybank', acct: '5141 2233 4455' },
    { ref: 'M13', amount: 500, bank: 'CIMB', acct: '7022 8841 0222' },
    { ref: 'M14', amount: 200, bank: 'Hong Leong', acct: '1900 4422 7888' },
    { ref: 'M15', amount: 175, bank: 'Maybank', acct: '5141 2233 4488' },
    { ref: 'M32', amount: 300, bank: 'Public Bank', acct: '3162 5577 8832' },
  ];
  for (const w of withdrawalSeed) {
    await prisma.servicerWithdrawal.create({
      data: {
        servicerId: servicerByRef[w.ref],
        amount: w.amount,
        bankName: w.bank,
        bankAccount: w.acct,
        status: 'pending',
      },
    });
  }

  // Extra pending penalty appeals.
  const appealSeed = [
    { ref: 'M1', slug: 'plumber',             reason: 'Customer rescheduled by phone but the app was never updated.' },
    { ref: 'M17', slug: 'washing-machine-repair', reason: 'Severe flooding blocked the only access road that morning.' },
    { ref: 'M22', slug: 'ceiling-fan-repair', reason: 'Wrong address given; I waited 40 minutes at the listed unit.' },
  ];
  for (const ap of appealSeed) {
    const b = await makeBooking('C_FRESH', 'C_FRESH:0', ap.ref, ap.slug, 'cancelled', 'pay_later', 100);
    const pl = await prisma.penaltyLog.create({
      data: {
        bookingId: b.id,
        servicerId: servicerByRef[ap.ref],
        ruleId: penaltyRuleByType['noshow'],
        type: 'noshow',
        amountDeducted: 50,
      },
    });
    await prisma.penaltyAppeal.create({
      data: {
        penaltyLogId: pl.id,
        servicerId: servicerByRef[ap.ref],
        reason: ap.reason,
        status: 'pending',
      },
    });
  }

  await prisma.report.create({
    data: {
      bookingId: compM1.id,
      userId: customerByRef['C_LOYAL'],
      subject: 'Minor leftover mess after the job',
      description: 'The job was done but there was some debris left behind.',
      status: 'open',
    },
  });
  console.log(
    `  ✓ admin queue (${categoryRequestSeed.length} category requests, ` +
      `${withdrawalSeed.length} withdrawals, ${appealSeed.length + 1} pending appeals, 1 report)`,
  );

  // ── Chat session for Customer.loyal ──
  const chat = await prisma.chatSession.create({
    data: {
      userId: customerByRef['C_LOYAL'],
      contextType: 'general',
      difyConversationId: 'demo-convo-loyal-001',
    },
  });
  // Stagger timestamps so the conversation renders in order (GET /messages sorts by createdAt).
  const chatBase = Date.now() - 5 * 60_000;
  const at = (i: number) => new Date(chatBase + i * 1000);
  await prisma.chatMessage.createMany({
    data: [
      {
        sessionId: chat.id,
        role: 'user',
        content: 'How do I reorder the same cleaning service I used last time?',
        createdAt: at(0),
      },
      {
        sessionId: chat.id,
        role: 'assistant',
        content:
          "You can find your past bookings under Order History. Tap 'Rebook same servicer' to submit a new quote pre-filled with the same service details.",
        createdAt: at(1),
      },
      { sessionId: chat.id, role: 'user', content: 'Can I change the date when I rebook?', createdAt: at(2) },
      {
        sessionId: chat.id,
        role: 'assistant',
        content:
          'Yes - the form is pre-filled but fully editable. You can change the date, time slot, or any other detail before submitting.',
        createdAt: at(3),
      },
    ],
  });
  console.log('  ✓ AI chat history for Customer.loyal');

  // ── Historical platform revenue (last 30 days, for the admin revenue chart) ──
  // Simulate realistic daily platform-fee income so the chart is populated on
  // first boot. Amounts vary with a weekday/weekend pattern + some noise.
  const revenuePattern = [
    // day offset from today (-29 = oldest, 0 = today)
    // [dayOffset, ...amountsRM]
    [-29, 42.5, 28.0],
    [-28, 55.0],
    [-27, 18.0, 32.0, 22.5],
    [-26, 0],
    [-25, 0],
    [-24, 63.0, 45.0],
    [-23, 38.0, 29.5, 51.0],
    [-22, 72.0, 38.5],
    [-21, 55.0, 48.0, 33.0],
    [-20, 44.0, 62.5],
    [-19, 0],
    [-18, 0],
    [-17, 88.0, 54.0],
    [-16, 67.5, 41.0, 29.0],
    [-15, 95.0, 52.5],
    [-14, 78.0, 63.0, 44.5],
    [-13, 112.0, 67.0],
    [-12, 0],
    [-11, 14.0],
    [-10, 103.5, 88.0, 55.0],
    [-9, 92.0, 71.5, 48.0],
    [-8, 118.0, 84.5],
    [-7, 135.0, 96.0, 62.5],
    [-6, 149.0, 107.0],
    [-5, 0],
    [-4, 22.5],
    [-3, 158.0, 112.0, 74.5],
    [-2, 167.5, 128.0, 91.0],
    [-1, 143.0, 119.5, 85.0, 62.0],
    [0, 88.0, 54.5],
  ] as [number, ...number[]][];

  // Build a map: categoryId → a representative completed booking in that category
  const bookingIds = allBulkCompleted.map(cb => cb.booking.id);
  const bookingsWithCats = await prisma.booking.findMany({
    where: { id: { in: bookingIds } },
    select: { id: true, quoteRequest: { select: { categoryId: true } } },
  });
  const catBookings = new Map<string, string>();
  for (const b of bookingsWithCats) {
    const catId = b.quoteRequest?.categoryId;
    if (catId && !catBookings.has(catId)) catBookings.set(catId, b.id);
  }
  const catIds = [...catBookings.keys()];

  let catIdx = 0;
  for (const [offset, ...amounts] of revenuePattern) {
    for (const amount of amounts) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      d.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
      const catId = catIds[catIdx % catIds.length];
      const bookingId = catBookings.get(catId)!;
      catIdx++;
      await prisma.transaction.create({
        data: {
          type: 'platform_fee',
          amount,
          bookingId,
          reference: 'Platform commission (seed)',
          createdAt: d,
        },
      });
    }
  }
  console.log('  ✓ 30-day historical platform revenue across categories (chart seed data)');

  // ── Self-check: fail loudly if core history is empty ──
  // Catches silent partial seeds (e.g. a mid-run ReferenceError that aborts before
  // bulk bookings). Without this, the seed exits 0-ish and the DB looks "seeded"
  // but servicer/admin charts are blank. Any zero here = hard failure.
  const chkCompleted = await prisma.booking.count({ where: { status: 'completed' } });
  const chkInvoices = await prisma.invoice.count();
  const chkEscrow = await prisma.transaction.count({ where: { type: 'escrow_release' } });
  if (chkCompleted === 0 || chkInvoices === 0 || chkEscrow === 0) {
    throw new Error(
      `Seed self-check FAILED - empty history (completed=${chkCompleted} invoices=${chkInvoices} escrow_release=${chkEscrow}). DB left partially seeded.`,
    );
  }
  console.log(`  ✓ self-check: ${chkCompleted} completed, ${chkInvoices} invoices, ${chkEscrow} escrow_release`);

  // ── Manifest ──
  const counts = {
    seededAt: new Date().toISOString(),
    deadlineOffsetMinutes: offset,
    categories: categories.length,
    servicers: servicers.length,
    customers: customers.length,
    adminId: admin.id,
  };
  writeFileSync(MANIFEST, JSON.stringify(counts, null, 2));
  console.log('\n✓ Seed complete. Demo password: ' + DEMO_PASSWORD + '  Admin PIN: ' + ADMIN_PIN);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
