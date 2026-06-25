/**
 * Per-category budget brackets a customer picks from on the quote form / chat.
 * Keyed by category slug; the seed maps these onto category ids. Shared by the
 * full seed (seed.ts) which now handles both initial create and non-destructive upsert
 * so the two never drift.
 */
export type BudgetRange = { min: number; max: number | null };

export const BUDGET_RANGE_PRESETS: Record<string, BudgetRange[]> = {
  'plumber':                [{ min: 50, max: 150 }, { min: 150, max: 300 }, { min: 300, max: 500 }, { min: 500, max: null }],
  'aircond-servicer':       [{ min: 50, max: 150 }, { min: 150, max: 250 }, { min: 250, max: 400 }, { min: 400, max: null }],
  'electrical-wiring':      [{ min: 50, max: 150 }, { min: 150, max: 300 }, { min: 300, max: 500 }, { min: 500, max: null }],
  'home-cleaning':          [{ min: 30, max: 100 }, { min: 100, max: 200 }, { min: 200, max: 350 }, { min: 350, max: null }],
  'sofa-mattress-cleaning': [{ min: 30, max: 80 },  { min: 80, max: 150 },  { min: 150, max: 250 }, { min: 250, max: null }],
  'carpet-cleaning':        [{ min: 30, max: 80 },  { min: 80, max: 150 },  { min: 150, max: 250 }, { min: 250, max: null }],
  'curtain-cleaning':       [{ min: 20, max: 60 },  { min: 60, max: 120 },  { min: 120, max: 200 }, { min: 200, max: null }],
  'event-planner':          [{ min: 500, max: 1000 }, { min: 1000, max: 2000 }, { min: 1500, max: 2500 }, { min: 2500, max: 5000 }, { min: 5000, max: null }],
  'catering':               [{ min: 100, max: 300 }, { min: 300, max: 600 }, { min: 600, max: 1000 }, { min: 1000, max: null }],
  'professional-organizer': [{ min: 50, max: 120 }, { min: 120, max: 250 }, { min: 250, max: 400 }, { min: 400, max: null }],
  'aircond-installer':      [{ min: 200, max: 500 }, { min: 500, max: 1000 }, { min: 1000, max: 2000 }, { min: 2000, max: null }],
  'carpenter':              [{ min: 80, max: 200 }, { min: 200, max: 400 }, { min: 400, max: 800 }, { min: 800, max: null }],
  'renovation':             [{ min: 300, max: 1000 }, { min: 1000, max: 3000 }, { min: 3000, max: 7000 }, { min: 7000, max: null }],
  'interior-design':        [{ min: 200, max: 600 }, { min: 600, max: 1500 }, { min: 1500, max: 4000 }, { min: 4000, max: null }],
  'door-gate':              [{ min: 50, max: 150 }, { min: 150, max: 300 }, { min: 300, max: 500 }, { min: 500, max: null }],
  'roof':                   [{ min: 150, max: 400 }, { min: 400, max: 700 }, { min: 700, max: 1200 }, { min: 1200, max: null }],
  'painting':               [{ min: 50, max: 150 },  { min: 150, max: 400 },  { min: 400, max: 800 },  { min: 800, max: null }],
  'moving':                 [{ min: 80, max: 200 },  { min: 200, max: 400 },  { min: 400, max: 800 },  { min: 800, max: null }],
  'gardening':              [{ min: 40, max: 100 },  { min: 100, max: 250 },  { min: 250, max: 500 },  { min: 500, max: null }],
  'washing-machine-repair': [{ min: 40, max: 100 }, { min: 100, max: 200 }, { min: 200, max: 350 }, { min: 350, max: null }],
  'refrigerator-repair':    [{ min: 40, max: 100 }, { min: 100, max: 200 }, { min: 200, max: 350 }, { min: 350, max: null }],
  'tv-repair':              [{ min: 30, max: 80 },  { min: 80, max: 150 },  { min: 150, max: 250 }, { min: 250, max: null }],
  'oven-repair':            [{ min: 40, max: 100 }, { min: 100, max: 200 }, { min: 200, max: 300 }, { min: 300, max: null }],
  'water-heater-repair':    [{ min: 40, max: 100 }, { min: 100, max: 200 }, { min: 200, max: 350 }, { min: 350, max: null }],
  'ceiling-fan-repair':     [{ min: 30, max: 80 },  { min: 80, max: 150 },  { min: 150, max: 250 }, { min: 250, max: null }],
  'aircond-repair':         [{ min: 50, max: 120 }, { min: 120, max: 250 }, { min: 250, max: 400 }, { min: 400, max: null }],
  'art-class':              [{ min: 30, max: 80 },  { min: 80, max: 150 },  { min: 150, max: 250 }, { min: 250, max: null }],
  'language-class':         [{ min: 30, max: 80 },  { min: 80, max: 150 },  { min: 150, max: 250 }, { min: 250, max: null }],
  'music-class':            [{ min: 40, max: 100 }, { min: 100, max: 200 }, { min: 200, max: 300 }, { min: 300, max: null }],
  'home-tutoring':          [{ min: 30, max: 80 },  { min: 80, max: 150 },  { min: 150, max: 300 }, { min: 300, max: null }],
  'cooking-class':          [{ min: 50, max: 120 }, { min: 120, max: 250 }, { min: 250, max: 400 }, { min: 400, max: null }],
  'gym-trainer':            [{ min: 40, max: 100 }, { min: 100, max: 200 }, { min: 200, max: 300 }, { min: 300, max: null }],
  '3d-modeling-class':      [{ min: 60, max: 150 }, { min: 150, max: 300 }, { min: 300, max: 500 }, { min: 500, max: null }],
  'alarm-cctv':             [{ min: 100, max: 300 }, { min: 300, max: 600 }, { min: 600, max: 1200 }, { min: 1200, max: null }],
};
