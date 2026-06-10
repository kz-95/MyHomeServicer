/**
 * Automated chat-QA harness.
 *
 * Simulates real customers booking a quote end-to-end against the LIVE chatbot, to
 * catch flow regressions (skipped service selection, jump-to-review, loops, stalls,
 * hallucinated/missing fields, broken question schema). Each run is a CUSTOMER defined
 * on five axes — {Typing} {Tone} {Behavior} {Sorting} {Language} — plus concrete data
 * (service, date, time, address, budget, name, phone, question answers).
 *
 * The engine does NOT just type: it inspects whichever card the bot shows and calls
 * the real handler (via the QaHost adapter) — picking a category, confirming date/
 * time/address/budget/contact, answering the service questions — until the quote_prefill
 * REVIEW card appears (= success) or it stalls/loops/times out. A per-run checker logs
 * exactly which part failed.
 *
 * Kept out of chat-widget.component.ts on purpose: the component owns the Angular
 * signals + card methods (the QaHost adapter), this file owns the pure simulation.
 */

/** A rendered action block (subset of the component's ActionBlock). */
export interface QaBlock {
  type: string;
  data: Record<string, unknown>;
}

/** One transcript message as the harness sees it. */
export interface QaMsg {
  role: string;
  content: string;
  blocks: QaBlock[];
}

export interface QaAddress {
  no: string;
  street: string;
  postcode: string;
  propertyType: string;
}

/**
 * The bridge the component implements. The harness stays Angular-free and drives the
 * chat purely through these calls; each method maps to a real card action / signal.
 */
export interface QaHost {
  clear(): void;
  /** Reload state from storage WITHOUT wiping it — simulates a page refresh, so the
   *  returning-guest "is this {name}?" restore flow can be tested (vs clear()). */
  refresh(): void;
  /** Press "Review & submit", walk the live quote form to the Summary (no submit), and
   *  return a per-page report; then navigate back home. Optional (QA-only). */
  submitAndVerifyForm?(): Promise<string[]>;
  /** Full transcript snapshot (oldest first). */
  messages(): QaMsg[];
  /** True while a reply is in flight. */
  sending(): boolean;
  /** Current accumulated quote prefill data. */
  prefill(): Record<string, unknown>;
  /** Number of budget brackets loaded for the locked category (0 = not ready). */
  budgetRangeCount(): number;

  /** Type + send a free-text message as the customer. */
  sendText(text: string): void;
  /** Confirm / reject a suggested category card. */
  lockCategory(b: QaBlock): void;
  rejectCategory(b: QaBlock): void;
  /** Pick + confirm a date (YYYY-MM-DD). */
  confirmDate(value: string): void;
  /** Pick + confirm a time slot (morning|noon|afternoon|evening|night). */
  confirmTime(value: string): void;
  /** Fill + geocode-confirm the address card (async). */
  confirmAddress(a: QaAddress): void;
  /** Confirm a standalone property-type card. */
  confirmPropertyType(value: string): void;
  /** Pick a budget bracket by index + confirm. */
  confirmBudget(index: number): void;
  /** Confirm a free-text field card (contactName, notes, addressNo, postcode…). */
  confirmTextField(key: string, value: string): void;
  /** Confirm the phone card with a local digit string (no +60). */
  confirmPhone(localDigits: string): void;
  /** Answer a service-question card by applying the harness-computed human answer. */
  answerQuestion(b: QaBlock, answer: QaAnswer): void;
  /** Accept a returning-guest identity confirm. */
  confirmIdentity(yes: boolean): void;
  /** LLM review of a transcript ('run') or batch of findings ('conclude'). Optional. */
  judge?(text: string, mode: "run" | "conclude"): Promise<string>;
  /** Recorded REST exchanges (request body the FRONTEND sent + the BACKEND response),
   *  oldest first. Lets the log show frontend-vs-backend data per turn. Optional (QA-only). */
  restLog?(): QaRestEntry[];
}

/** One /chat REST exchange as the harness logs it — what the frontend SENT and what the
 *  backend RETURNED, for diagnosing where data (budget, lang, fields) diverges. */
export interface QaRestEntry {
  ts: string;
  sent: {
    collected?: string[];
    collectedData?: Record<string, unknown>;
    cardConfirm?: boolean;
    categoryId?: unknown;
    lang?: unknown;
  };
  recv: { reply: string; cards: string[] };
}

// ─── Persona axes ────────────────────────────────────────────────────────────────
export const QA_TYPING = ["proper", "lowercase", "typos", "abbrev", "verbose", "terse", "slang"] as const;
export const QA_TONE = ["polite", "blunt", "impatient", "friendly", "anxious", "chatty"] as const;
export const QA_BEHAVIOR = ["cooperative", "reject_first", "oversharer", "self_correct", "rambler", "minimal", "typing_shortcut", "typing_adhd"] as const;
export const QA_SORTING = ["service_first", "dump_all", "address_first", "budget_first", "contact_first", "vague_first"] as const;
export const QA_LANG = ["en", "ms", "zh", "ta", "rojak"] as const;

export type QaTyping = (typeof QA_TYPING)[number];
export type QaTone = (typeof QA_TONE)[number];
export type QaBehavior = (typeof QA_BEHAVIOR)[number];
export type QaSorting = (typeof QA_SORTING)[number];
export type QaLang = (typeof QA_LANG)[number];

export interface QaPersona {
  typing: QaTyping;
  tone: QaTone;
  behavior: QaBehavior;
  sorting: QaSorting;
  language: QaLang;
}

// ─── Data pools ──────────────────────────────────────────────────────────────────
/** Service needs, phrased per language. `en` always present; others fall back to en. */
interface QaService {
  needs: Partial<Record<QaLang, string>> & { en: string };
  vague: string;
}
const QA_SERVICES: QaService[] = [
  { needs: { en: "my kitchen sink is leaking badly", ms: "sink dapur saya bocor teruk", zh: "我家厨房水管漏水", ta: "என் சமையலறை சிங்க் மோசமாக கசிகிறது" }, vague: "there's water all over my kitchen floor" },
  { needs: { en: "my aircon is not cold anymore", ms: "aircond saya tak sejuk dah", zh: "我的冷气不冷了", ta: "என் ஏசி இனி குளிரவில்லை" }, vague: "my room is so hot even with the unit on" },
  { needs: { en: "my house is really dirty and needs a deep clean", ms: "rumah saya kotor sangat perlu cleaner", zh: "我家很脏需要打扫", ta: "என் வீடு மிகவும் அழுக்காக உள்ளது, சுத்தம் தேவை" }, vague: "the place is a complete mess, guests coming soon" },
  { needs: { en: "a power socket keeps sparking", ms: "soket kuasa saya mengeluarkan api", zh: "插座一直冒火花", ta: "ஒரு பவர் சாக்கெட் தீப்பொறி பறக்கிறது" }, vague: "something smells burnt near the wall plug" },
  { needs: { en: "lots of cockroaches in my kitchen", ms: "banyak lipas dalam dapur saya", zh: "厨房有很多蟑螂", ta: "என் சமையலறையில் நிறைய கரப்பான் பூச்சிகள்" }, vague: "there are bugs everywhere in the kitchen" },
  { needs: { en: "I need my ceiling fan installed", ms: "saya perlu pasang kipas siling", zh: "我需要安装吊扇", ta: "எனக்கு சீலிங் ஃபேன் பொருத்த வேண்டும்" }, vague: "this thing on the ceiling needs putting up" },
  { needs: { en: "I want to repaint my living room", ms: "saya nak cat semula ruang tamu", zh: "我想重新粉刷客厅", ta: "என் வரவேற்பறையை மீண்டும் பெயிண்ட் செய்ய வேண்டும்" }, vague: "the walls look terrible, need a new look" },
  { needs: { en: "my lawn is overgrown and needs trimming", ms: "rumput saya panjang perlu potong", zh: "我的草坪需要修剪", ta: "என் புல்வெளி வளர்ந்து வெட்ட வேண்டும்" }, vague: "the garden is a jungle now" },
  { needs: { en: "I need movers for my apartment", ms: "saya perlu pekerja pindah rumah", zh: "我需要搬家工人", ta: "என் வீட்டை மாற்ற ஆட்கள் தேவை" }, vague: "I have a lot of furniture to shift" },
  { needs: { en: "my door lock is jammed", ms: "kunci pintu saya tersangkut", zh: "我的门锁卡住了", ta: "என் கதவு பூட்டு சிக்கிக்கொண்டது" }, vague: "I can't get my door to work properly" },
  { needs: { en: "I want to install a CCTV camera", ms: "saya nak pasang kamera CCTV", zh: "我想安装闭路电视", ta: "எனக்கு சிசிடிவி கேமரா பொருத்த வேண்டும்" }, vague: "I want to keep an eye on my front gate" },
  { needs: { en: "I need a car wash and detailing", ms: "saya perlu cuci kereta", zh: "我需要洗车", ta: "எனக்கு கார் வாஷ் தேவை" }, vague: "my car is filthy inside and out" },
  { needs: { en: "I'm looking for a math tutor for my son", ms: "saya cari tutor matematik untuk anak saya", zh: "我想找数学补习老师", ta: "என் மகனுக்கு கணித டியூஷன் தேவை" }, vague: "my kid needs help with his studies" },
  { needs: { en: "I need laundry and ironing done", ms: "saya perlu basuh dan gosok baju", zh: "我需要洗衣和熨衣", ta: "எனக்கு துணி துவைத்து இஸ்திரி தேவை" }, vague: "I have a huge pile of clothes" },
  { needs: { en: "my roof is leaking when it rains", ms: "bumbung saya bocor bila hujan", zh: "下雨时屋顶漏水", ta: "மழை பெய்யும்போது என் கூரை கசிகிறது" }, vague: "water drips inside whenever it rains" },
  { needs: { en: "my washing machine stopped working", ms: "mesin basuh saya rosak", zh: "我的洗衣机坏了", ta: "என் சலவை இயந்திரம் வேலை செய்யவில்லை" }, vague: "one of my appliances just died" },
];

/** Real, geocode-resolvable KL/Selangor addresses (the address card validates). */
const QA_ADDRESSES: QaAddress[] = [
  { no: "18", street: "Jalan Tempua 5, Bandar Puchong Jaya", postcode: "47100", propertyType: "house" },
  { no: "12", street: "Jalan SS2/24, Petaling Jaya", postcode: "47300", propertyType: "house" },
  { no: "7", street: "Jalan Maarof, Bangsar", postcode: "59000", propertyType: "apartment" },
  { no: "33", street: "Jalan Ampang, Kuala Lumpur", postcode: "50450", propertyType: "office" },
  { no: "88", street: "Jalan PJU 5/20, Kota Damansara, Petaling Jaya", postcode: "47810", propertyType: "apartment" },
  { no: "5", street: "Jalan Cheras, Kuala Lumpur", postcode: "56000", propertyType: "house" },
  { no: "21", street: "Jalan Bukit Bintang, Kuala Lumpur", postcode: "55100", propertyType: "shop" },
  { no: "9", street: "Jalan USJ 9/5, Subang Jaya", postcode: "47620", propertyType: "house" },
  { no: "14", street: "Jalan Kenari, Bandar Puchong Jaya", postcode: "47100", propertyType: "house" },
  { no: "3", street: "Jalan Telawi, Bangsar", postcode: "59100", propertyType: "shop" },
  { no: "27", street: "Persiaran Surian, Mutiara Damansara", postcode: "47810", propertyType: "office" },
  { no: "6", street: "Jalan SS15/4, Subang Jaya", postcode: "47500", propertyType: "apartment" },
  // Near MMU Cyberjaya campus.
  { no: "10", street: "Persiaran Multimedia, Cyberjaya", postcode: "63100", propertyType: "apartment" },
  { no: "2", street: "Jalan Teknokrat 3, Cyberjaya", postcode: "63000", propertyType: "office" },
  { no: "15", street: "Persiaran APEC, Cyberjaya", postcode: "63000", propertyType: "house" },
];

const QA_NAMES = ["Brian", "Sarah", "Daniel", "Aaron", "Mei", "Aisha", "Kumar", "Wei Jie", "Farah", "Hafiz", "Nadia", "Chong", "Priya", "Zack", "Lina"];

/**
 * Customer presets — the 6th axis, used only in customer (logged-in) mode. Each is a
 * named test customer bundling fixed contact + address + a preference, so QA cycles
 * through realistic returning-customer identities instead of fully random data.
 */
export interface QaPreset {
  name: string;
  phoneLocal: string;
  addr: QaAddress;
  note: string;
}
export const QA_PRESETS: QaPreset[] = [
  { name: "Brian Tan", phoneLocal: "122334455", addr: { no: "18", street: "Jalan Tempua 5, Bandar Puchong Jaya", postcode: "47100", propertyType: "house" }, note: "prefers morning visits" },
  { name: "Mei Ling", phoneLocal: "169876543", addr: { no: "12", street: "Jalan SS2/24, Petaling Jaya", postcode: "47300", propertyType: "apartment" }, note: "call before arriving" },
  { name: "Aisha Rahman", phoneLocal: "133221100", addr: { no: "7", street: "Jalan Maarof, Bangsar", postcode: "59000", propertyType: "apartment" }, note: "leave at guardhouse" },
  { name: "Kumar Raj", phoneLocal: "175558899", addr: { no: "9", street: "Jalan USJ 9/5, Subang Jaya", postcode: "47620", propertyType: "house" }, note: "weekend only" },
  { name: "Hafiz Omar", phoneLocal: "194445566", addr: { no: "33", street: "Jalan Ampang, Kuala Lumpur", postcode: "50450", propertyType: "office" }, note: "office hours" },
  { name: "Priya Nair", phoneLocal: "187776655", addr: { no: "6", street: "Jalan SS15/4, Subang Jaya", postcode: "47500", propertyType: "apartment" }, note: "gate code 4321" },
];
// Must match the address card / address-fields <select> values, else the picked type
// can't be displayed/confirmed and lands empty in the quote form (landed|condo|commercial).
const QA_PROPERTY_TYPES = ["landed", "condo", "commercial"];
const QA_DATE_WORDS = ["this saturday", "tomorrow", "next monday", "this friday", "this sunday", "tonight", "next week tuesday"];
const QA_TIME_SLOTS = ["morning", "noon", "afternoon", "evening", "night"];

// ─── Random helpers ──────────────────────────────────────────────────────────────
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
/** A future YYYY-MM-DD, +3..21 days from today. */
function futureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + randInt(3, 21));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** Local phone digits (no +60), e.g. "123456789". */
function randomPhoneLocal(): string {
  const len = pick([9, 10]);
  let s = "1";
  for (let i = 1; i < len; i++) s += randInt(0, 9);
  return s;
}

// ─── Scenario ────────────────────────────────────────────────────────────────────
export interface QaScenario {
  persona: QaPersona;
  service: QaService;
  date: string;
  dateWords: string;
  timeSlot: string;
  addr: QaAddress;
  budget: "low" | "mid" | "high";
  name: string;
  phoneLocal: string;
  notes: string;
  preset?: QaPreset;
  openingTurns: string[];
  /** How many info pieces the opening front-loaded (0 = vague greeting only). */
  infoCount: number;
  /** Whether the opening actually stated the service need. */
  needIncluded: boolean;
  /** The styled service need, sent later if the opening withheld it (0-info case). */
  needPhrase: string;
  /** When true, this customer re-states info already given mid-flow (idempotency test). */
  repeats: boolean;
  label: string;
}

/** Apply the typing style to a sentence (kept gentle — substance must survive). */
function applyTyping(text: string, typing: QaTyping): string {
  switch (typing) {
    case "lowercase":
      return text.toLowerCase();
    case "abbrev":
      return text
        .replace(/\byou\b/gi, "u")
        .replace(/\byour\b/gi, "ur")
        .replace(/\bplease\b/gi, "pls")
        .replace(/\btomorrow\b/gi, "tmrw")
        .replace(/\btonight\b/gi, "tnite")
        .replace(/\band\b/gi, "n")
        .replace(/\bbecause\b/gi, "cuz");
    case "typos":
      // Drop a single char from a couple of longer words.
      return text
        .split(" ")
        .map((w) => (w.length > 5 && Math.random() < 0.35 ? w.slice(0, 2) + w.slice(3) : w))
        .join(" ")
        .toLowerCase();
    case "verbose":
      return `so basically ${text}, if that makes sense`;
    case "terse":
      // Strip filler down to the core.
      return text.replace(/\b(my|a|an|the|is|are|i|need|want|looking for|please)\b/gi, "").replace(/\s{2,}/g, " ").trim();
    case "slang":
      // English slang handled here; Malay/rojak slang is applied separately.
      return text.toLowerCase();
    case "proper":
    default:
      return text.charAt(0).toUpperCase() + text.slice(1);
  }
}

/**
 * Malaysian SMS-style Malay shortcuts — how Malays actually type ("saya tak perlu
 * ambil" → "i x prlu ambik", "boleh lah kan" → "blh la kn"). Applied to Malay text for
 * the slang/abbrev/terse typing styles so QA exercises real-world compressed Malay.
 */
function malayShortcut(text: string): string {
  const map: Array<[RegExp, string]> = [
    [/\bsaya\b/gi, "i"], [/\btak\b/gi, "x"], [/\bperlu\b/gi, "prlu"], [/\bambil\b/gi, "ambik"],
    [/\bboleh\b/gi, "blh"], [/\blah\b/gi, "la"], [/\bkan\b/gi, "kn"], [/\bdengan\b/gi, "dgn"],
    [/\byang\b/gi, "yg"], [/\bdalam\b/gi, "dlm"], [/\bsangat\b/gi, "sgt"], [/\bsahaja\b/gi, "je"],
    [/\bsudah\b/gi, "dh"], [/\bmacam\b/gi, "mcm"], [/\bitu\b/gi, "tu"], [/\bini\b/gi, "ni"],
    [/\btolong\b/gi, "tlg"], [/\buntuk\b/gi, "utk"], [/\bkereta\b/gi, "kete"], [/\bsekarang\b/gi, "skrg"],
    [/\bbanyak\b/gi, "byk"], [/\bkena\b/gi, "kna"], [/\bnombor\b/gi, "no"], [/\btelefon\b/gi, "fon"],
    [/\brumah\b/gi, "umah"], [/\bbetul\b/gi, "btul"], [/\bsejuk\b/gi, "sjuk"], [/\bmesin\b/gi, "msin"],
  ];
  let out = text.toLowerCase();
  for (const [re, r] of map) out = out.replace(re, r);
  return out;
}

const MANGLISH = ["lah", "lor", "mah", "sia", "leh", "liao"];
/** Turn an English need into Manglish/rojak — mixed English with Malay particles. */
function rojakify(text: string): string {
  return `eh boss, ${text} ${pick(MANGLISH)}, can help anot?`;
}

/** Wrap a sentence with tone-coloured framing. */
function applyTone(text: string, tone: QaTone): string {
  switch (tone) {
    case "polite":
      return `Hi, could you help me — ${text}? Thank you.`;
    case "impatient":
      return `${text}. need this asap please`;
    case "friendly":
      return `hey there! ${text} 🙂`;
    case "anxious":
      return `sorry to bother you, ${text}, is that something you can do?`;
    case "chatty":
      return `oh hello! been meaning to ask, ${text} — what do you reckon?`;
    case "blunt":
    default:
      return text;
  }
}

/** Affirmation word in the chosen language (for nudges). */
export function qaAffirm(lang: QaLang): string {
  switch (lang) {
    case "ms":
      return "ya btul";
    case "zh":
      return "对，就是这个";
    case "ta":
      return "ஆம், சரிதான்";
    case "rojak":
      return "ya correct lah, can";
    default:
      return "yes please go ahead";
  }
}

/**
 * Apply this persona's language + typing + tone styling to one line. Malay gets SMS
 * shortcuts on the short typing styles; Chinese and Tamil are already localised (no
 * English transforms); rojak mixes English with Malay particles; English gets the
 * tone + typing colour. Shared by the opening turns and the question answers so a
 * customer "sounds" the same all the way through a run.
 */
function styleLine(p: QaPersona, text: string): string {
  switch (p.language) {
    case "ms":
      return ["slang", "abbrev", "terse"].includes(p.typing) ? malayShortcut(text) : text;
    case "zh":
    case "ta":
      return text;
    case "rojak":
      return rojakify(applyTyping(text, p.typing));
    case "en":
    default:
      return applyTone(applyTyping(text, p.typing), p.tone);
  }
}

/**
 * How many distinct info pieces the customer volunteers in the opening message. Real
 * people usually lead with one thing (the problem) and only sometimes dump several at
 * once — and occasionally open with nothing actionable ("hi, can you help?"). Weighted:
 *   0:10%  1:60%  2:10%  3:10%  4:4%  5:3%  6:2%  7(all):1%
 */
function pickInfoCount(): number {
  const r = randInt(1, 100);
  if (r <= 10) return 0;
  if (r <= 70) return 1;
  if (r <= 80) return 2;
  if (r <= 90) return 3;
  if (r <= 94) return 4;
  if (r <= 97) return 5;
  if (r <= 99) return 6;
  return 7;
}

/**
 * Compose the opening turn from a target info count. The service need (the anchor the
 * bot turns into a category) leads when present; up to six extra details — date, time,
 * address, budget, name, phone — are mixed in to reach the count. count 0 = a vague
 * greeting with nothing actionable, so the bot must ask and the engine supplies the
 * need on its next turn (see driveScenario's needSent recovery).
 */
function composeOpening(
  p: QaPersona,
  s: QaService,
  name: string,
  phone: string,
  addr: QaAddress,
  budgetWord: string,
  dateWords: string,
  timeSlot: string,
  count: number,
): { turns: string[]; needIncluded: boolean } {
  if (count <= 0) {
    const greet = pick(["hi", "hello, you there?", "hi, i need some help", "hey, got a minute?", "hello"]);
    return { turns: [styleLine(p, greet)], needIncluded: false };
  }
  const need = s.needs[p.language] ?? s.needs.en;
  const addrStr = `${addr.no} ${addr.street}, ${addr.postcode}`;
  const extras = [
    dateWords,
    `in the ${timeSlot}`,
    `I'm at ${addrStr}`,
    `budget around rm${budgetWord}`,
    `I'm ${name}`,
    `reach me at ${phone}`,
  ].sort(() => Math.random() - 0.5);
  const chosen = extras.slice(0, Math.min(count - 1, extras.length));
  return { turns: [styleLine(p, [need, ...chosen].join(", "))], needIncluded: true };
}

/**
 * A plain-text answer for a field card, the way a customer who ignores the picker would
 * type it (e.g. "budget around rm500", "this saturday", the address). Returns null for
 * fields the backend does NOT extract from free text (name, property type, etc.) — those
 * must use the card, so we never free-text them.
 */
function freeTextForField(key: string, scn: QaScenario): string | null {
  switch (key) {
    case "budgetMin":
    case "budgetMax": {
      const n =
        scn.budget === "low" ? randInt(80, 200) : scn.budget === "mid" ? randInt(250, 600) : randInt(800, 2000);
      return styleLine(scn.persona, pick([`budget around rm${n}`, `i can spend about ${n}`, `rm${n}`, `${n} max`]));
    }
    case "preferredDate":
      return styleLine(scn.persona, pick([scn.dateWords, `${scn.dateWords} works`, `let's do ${scn.dateWords}`]));
    case "timeSlot":
      return styleLine(scn.persona, pick([scn.timeSlot, `${scn.timeSlot} please`, `in the ${scn.timeSlot}`]));
    // NOTE: address is intentionally NOT free-texted. It is STRUCTURED (No / Street /
    // Postcode / Type); the backend only extracts the formatted `address` string from
    // free text, leaving the component fields empty so the quote form can't split them.
    // The address card captures all four, so always use the card.
    case "contactNumber":
      return styleLine(scn.persona, pick([`0${scn.phoneLocal}`, `my number is 0${scn.phoneLocal}`, `call me at 0${scn.phoneLocal}`]));
    default:
      return null;
  }
}

/** A natural re-statement of info the customer already gave, for the idempotency test. */
function repeatPhrase(scn: QaScenario): string {
  const choices = [
    scn.service.needs[scn.persona.language] ?? scn.service.needs.en,
    `oh and my name is ${scn.name}`,
    `the date i wanted is ${scn.dateWords}`,
    `just to confirm, ${scn.timeSlot} works for me`,
    `i'm at ${scn.addr.no} ${scn.addr.street}`,
  ];
  return styleLine(scn.persona, pick(choices));
}

/** Build one random scenario. In customer mode a preset supplies the identity. */
export function makeScenario(customerMode = false): QaScenario {
  const persona: QaPersona = {
    typing: pick(QA_TYPING),
    tone: pick(QA_TONE),
    behavior: pick(QA_BEHAVIOR),
    sorting: pick(QA_SORTING),
    language: pick(QA_LANG),
  };
  const service = pick(QA_SERVICES);
  const preset = customerMode ? pick(QA_PRESETS) : undefined;
  const addr = preset
    ? { ...preset.addr, propertyType: pick(QA_PROPERTY_TYPES) }
    : { ...pick(QA_ADDRESSES), propertyType: pick(QA_PROPERTY_TYPES) };
  const name = preset ? preset.name : pick(QA_NAMES);
  const phoneLocal = preset ? preset.phoneLocal : randomPhoneLocal();
  const budget = pick(["low", "mid", "high"] as const);
  const budgetWord = budget === "low" ? String(randInt(80, 200)) : budget === "mid" ? String(randInt(250, 600)) : String(randInt(800, 2000));
  const dateWords = pick(QA_DATE_WORDS);
  const timeSlot = pick(QA_TIME_SLOTS);
  const notes = pick(["please call before arriving", "gate code is 1234", "", "park at the visitor bay", "ring the doorbell twice"]);

  const infoCount = pickInfoCount();
  const opening = composeOpening(persona, service, name, phoneLocal, addr, budgetWord, dateWords, timeSlot, infoCount);

  return {
    persona,
    service,
    date: futureDate(),
    dateWords,
    timeSlot,
    addr,
    budget,
    name,
    phoneLocal,
    notes,
    preset,
    openingTurns: opening.turns,
    infoCount,
    needIncluded: opening.needIncluded,
    needPhrase: styleLine(persona, service.needs[persona.language] ?? service.needs.en),
    // ~30% of customers re-state info they already gave — exercises the bot's
    // dedup/idempotency (does it duplicate a card, re-ask, or absorb it cleanly?).
    repeats: Math.random() < 0.3,
    label: `${persona.typing}/${persona.tone}/${persona.behavior}/${persona.sorting}/${persona.language}${preset ? `/preset:${preset.name}` : ""} — ${service.needs.en} [infos:${infoCount}]`,
  };
}

export function generateScenarios(count: number, customerMode = false): QaScenario[] {
  const out: QaScenario[] = [];
  for (let i = 0; i < count; i++) out.push(makeScenario(customerMode));
  return out;
}

/** A fixed future date (today + `days`), YYYY-MM-DD. Deterministic — for the demo. */
function fixedFutureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Four hand-picked, guaranteed-pass demo bookings — one per supported language (NO rojak),
 * each a different customer name. Cooperative + service_first + clean ("proper") typing is
 * the happy path: state the need, tap every card, reach the review. Fixed (not random), so
 * the Demo button shows the same clean 0 → review booking each time, in each language.
 */
export function makeDemoScenarios(): QaScenario[] {
  const langs: Array<{ language: QaLang; name: string; phone: string }> = [
    { language: "en", name: "Aaron", phone: "122003001" },
    { language: "ms", name: "Nadia", phone: "133004002" },
    { language: "zh", name: "Wei Jie", phone: "144005003" },
    { language: "ta", name: "Kumar", phone: "155006004" },
  ];
  const service = QA_SERVICES[0]; // kitchen sink leak → Plumber (reliable, phrased in every language)
  const addr: QaAddress = {
    no: "33",
    street: "Jalan Ampang, Kuala Lumpur",
    postcode: "50450",
    propertyType: "condo",
  };
  return langs.map((l, i) => {
    const persona: QaPersona = {
      typing: "proper",
      tone: "polite",
      behavior: "cooperative",
      sorting: "service_first",
      language: l.language,
    };
    const opening = composeOpening(
      persona, service, l.name, l.phone, addr, "300", "this friday", "afternoon", 1,
    );
    return {
      persona,
      service,
      date: fixedFutureDate(5 + i),
      dateWords: "this friday",
      timeSlot: "afternoon",
      addr,
      budget: "mid" as const,
      name: l.name,
      phoneLocal: l.phone,
      notes: "",
      openingTurns: opening.turns,
      infoCount: 1,
      needIncluded: opening.needIncluded,
      needPhrase: styleLine(persona, service.needs[l.language] ?? service.needs.en),
      repeats: false,
      label: `DEMO/${l.language}/${l.name} — ${service.needs.en}`,
    };
  });
}

// ─── Engine ──────────────────────────────────────────────────────────────────────
const ACTIONABLE = new Set(["quote_options", "quote_field", "quote_question", "quote_prefill", "identity_confirm"]);
/** Budget index by band — picked from the loaded bracket count at runtime. */
function budgetIndexFor(band: "low" | "mid" | "high", count: number): number {
  if (count <= 0) return 0;
  if (band === "low") return 0;
  if (band === "high") return count - 1;
  return Math.floor((count - 1) / 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Human-like pause (0.3–0.8s) before the customer responds — replying instantly raced
 *  the UI/backend and caused flaky stalls. Varied per turn so it isn't robotic. */
function replyDelay(): Promise<void> {
  return sleep(randInt(300, 800));
}

/**
 * All action blocks from the trailing run of assistant messages (since the last user
 * turn). The bot reveals cards one-per-message, so a single reply can be several
 * assistant messages — aggregate them so no card in the batch is missed.
 */
function latestBlocks(host: QaHost): QaBlock[] {
  const msgs = host.messages();
  const blocks: QaBlock[] = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") break;
    if (msgs[i].role === "assistant" && msgs[i].blocks?.length) {
      blocks.unshift(...msgs[i].blocks);
    }
  }
  return blocks;
}

/** Trailing assistant message text since the last user turn (lowercased, joined). */
function latestAssistantText(host: QaHost): string {
  const msgs = host.messages();
  const parts: string[] = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") break;
    if (msgs[i].role === "assistant" && msgs[i].content) parts.unshift(msgs[i].content);
  }
  return parts.join(" ").toLowerCase();
}

/** The bot's "I can't proceed" fallback (LLM failover exhausted / backend error). */
const OUT_OF_SERVICE_RE = /out of service|assistant is (currently )?(out|unavailable)|try again later|something went wrong/i;

/**
 * Whether a rendered card label is in the customer's language. Script-based, so only
 * reliable for the non-Latin languages (Chinese, Tamil); en/ms/rojak share the Latin
 * alphabet and can't be told apart this way, so we don't flag them. Catches the common
 * real bug: an English question-schema label shown in a Chinese/Tamil conversation.
 */
function labelMatchesLang(label: string, lang: QaLang): boolean {
  if (!label) return true;
  if (lang === "zh") return /[一-鿿]/.test(label);
  if (lang === "ta") return /[஀-௿]/.test(label);
  return true;
}

/** Compact tag for a transcript card: "quote_field:contactNumber" — surfaces WHICH
 *  card so stuck/duplicated cards are visible in the log, not just the type. */
function blockTag(b: QaBlock): string {
  const id =
    (b.data?.["key"] as string) ||
    (b.data?.["qtype"] as string) ||
    (b.data?.["categoryId"] ? "cat" : "");
  return id ? `${b.type}:${id}` : b.type;
}

/** Human-readable reasoning for every parameter a scenario chose — so the log tells
 *  you WHAT is being tested and WHY, not just raw JSON. */
function intentLabel(scn: QaScenario): string {
  const p = scn.persona;
  const parts: string[] = [];

  // ── Language intent ──
  const langWhy: Record<string, string> = {
    en: "English — baseline",
    ms: "Malay — tests SMS shortcuts (saya→i, tak→x) and local phrasing",
    zh: "Chinese — tests CJK character handling, i18n labels",
    ta: "Tamil — tests non-Latin script, i18n labels, btoa edge case",
    rojak: "Manglish/rojak — tests mixed Malay+English (lah, lor, mah)",
  };
  parts.push(langWhy[p.language] ?? p.language);

  // ── Typing intent ──
  const typingWhy: Record<string, string> = {
    proper: "proper caps+punct",
    lowercase: "all lowercase",
    typos: "random typos (dropped chars)",
    abbrev: "SMS abbreviations (u, ur, pls, tmrw)",
    verbose: "verbose+waffle ('so basically …, if that makes sense')",
    terse: "stripped filler words",
    slang: "slang/shortcuts (Malay: i, x, blh, dh, je)",
  };
  parts.push(typingWhy[p.typing] ?? p.typing);

  // ── Tone intent ──
  const toneWhy: Record<string, string> = {
    polite: "polite framing",
    blunt: "bare statements, no niceties",
    impatient: "pressing for speed",
    friendly: "casual+smiley",
    anxious: "worried/apologetic",
    chatty: "wordy+conversational",
  };
  parts.push(toneWhy[p.tone] ?? p.tone);

  // ── Behavior intent ──
  const behaveWhy: Record<string, string> = {
    cooperative: "follows prompts, picks first option → baseline",
    reject_first: "rejects first suggestion → tests recovery",
    oversharer: "adds extra/irrelevant info → tests filtering",
    self_correct: "sends then corrects → tests edit path",
    rambler: "drifts between options → tests contradiction handling",
    minimal: "short/minimal answers → tests prompting",
    typing_shortcut: "NEVER taps a card — types every answer in terse SMS shortcuts → tests pure free-text extraction",
    typing_adhd: "NEVER taps a card — types erratic, kid/ADHD answers (off-topic then the real value) → tests recovery from chaotic input",
  };
  parts.push(behaveWhy[p.behavior] ?? p.behavior);

  // ── Sorting intent ──
  const sortWhy: Record<string, string> = {
    service_first: "service first — normal flow",
    dump_all: "dumps all info in opener → tests multi-field extraction",
    address_first: "address before service → tests out-of-order",
    budget_first: "budget leads → tests budget-first parsing",
    contact_first: "contact info first → tests PII handling",
    vague_first: "vague greeting → tests bot clarifying flow",
  };
  parts.push(sortWhy[p.sorting] ?? p.sorting);

  // ── Info count ──
  parts.push(`infos:${scn.infoCount} (${scn.infoCount === 0 ? "vague greeting only" : `${scn.infoCount} fields front-loaded`})`);

  // ── Service ──
  parts.push(`need: "${scn.service.needs.en.slice(0, 60)}"`);

  // ── Data ──
  parts.push(`addr: ${scn.addr.propertyType} | ${scn.addr.no}, ${scn.addr.street.slice(0, 30)}`);
  parts.push(`budget: ${scn.budget} | date: "${scn.dateWords}" → ${scn.date} | time: ${scn.timeSlot}`);
  if (scn.repeats) parts.push("🔄 repeats info mid-flow (idempotency test)");

  return parts.join(" | ");
}

export interface QaRunResult {
  label: string;
  ok: boolean;
  steps: number;
  issues: string[];
  /** True when the in-chat flow reached the review card (so the form check can run). */
  reachedReview: boolean;
}

interface RunHandle {
  log(line: string): void;
  cancelled(): boolean;
}

/** Drive ONE scenario to the review card. Returns the result + appends transcript. */
async function driveScenario(host: QaHost, scn: QaScenario, h: RunHandle, refreshed = false): Promise<QaRunResult> {
  const issues: string[] = [];
  const MAX_STEPS = 40;
  let steps = 0;
  let rejectedOnce = false;
  // Per-card "one off-topic detour already used" set for the typing_adhd persona — must
  // persist across turns, so it lives here and is passed by reference to actOnCard.
  const chaosUsed = new Set<string>();
  let lastSig = "";
  let sameSigCount = 0;
  let emptyTurns = 0;
  let redundantNudges = 0;
  let success = false;
  let sawAnyCard = false;
  // Set when the run ends in a terminal/unsupported state — suppresses the redundant
  // "incomplete prefill: missing …" dump that would otherwise bury the real reason.
  let terminal = false;
  // False when the opening withheld the service need (0-info case) — the engine states
  // it the first time the bot stalls, instead of a meaningless affirmation.
  let needSent = scn.needIncluded;
  // Field keys actually confirmed on a card this run — lets the final checker catch a
  // field that reached the review WITHOUT ever being collected on screen.
  const confirmedKeys = new Set<string>();
  // Card labels already flagged for wrong language (report each at most once).
  const langFlagged = new Set<string>();
  // Card signatures already flagged as duplicated (report each at most once).
  const dupFlagged = new Set<string>();
  // Out-of-order flow flagged once per run.
  let flowFlagged = false;
  const lang = scn.persona.language;
  // How many times this customer will re-state already-given info (0 = never).
  let repeatsLeft = scn.repeats ? randInt(1, 2) : 0;

  // waitIdle — block until the in-flight reply lands. Some confirms (address geocode)
  // start their request a beat later, so also give a short window for sending to rise.
  const waitIdle = async () => {
    const startRise = Date.now();
    while (!host.sending() && Date.now() - startRise < 1800) {
      await sleep(120);
    }
    const start = Date.now();
    while (host.sending() && Date.now() - start < 25000) await sleep(150);
    await sleep(250);
  };

  // Append any new transcript messages to the log. Every new message produces a line
  // (even an empty bot reply) so the judge always reviews the REAL conversation and
  // can't hallucinate from a blank transcript.
  let logged = host.messages().length;
  let restLogged = 0;
  const NO_CARD_RE = /\b(card|button|tap|press|click|kad|butang|tekan|klik)\b/i;
  // HH:MM:SS wall-clock for each logged line (diagnostic only — not determinism-critical).
  const ts = () => new Date().toISOString().slice(11, 19);
  const flush = () => {
    const msgs = host.messages();
    const startLogged = logged;
    for (let i = logged; i < msgs.length; i++) {
      const m = msgs[i];
      const tag = m.role === "user" ? "USER" : "BOT ";
      // Strip stale [⚙ ...] annotations from logged content so the log is clean.
      const txt = (m.content || "").replace(/\[⚙[^\]]*\]\s*/g, "").replace(/\n+/g, " ").trim();
      const blocks = m.blocks?.length ? ` [${m.blocks.map(blockTag).join(", ")}]` : "";
      h.log(`[${ts()}] ${tag}: ${txt || (blocks ? "" : "(empty reply)")}${blocks}`.trimEnd());
    }
    // Batch-level ⚠ NO CARD check: scan trailing assistant messages since last user turn.
    // If COMBINED text mentions card/button but combined blocks have no actionable ones,
    // warn once. This avoids false positives when blocks arrive in a SEPARATE message from
    // the text that describes them (common LLM streaming behavior).
    {
      const batch = msgs.slice(logged);
      const combined = batch.filter((m) => m.role === "assistant");
      const text = combined.map((m) => m.content ?? "").join(" ");
      const allBlocks = combined.flatMap((m) => m.blocks ?? []);
      if (NO_CARD_RE.test(text) && !allBlocks.some((bk) => ACTIONABLE.has(bk.type))) {
        h.log("⚠ NO CARD");
      }
    }
    logged = msgs.length;

    // Frontend <-> backend trace + actual collected data. Shows WHERE a value diverges:
    // what the frontend SENT, what the backend RETURNED, and the resulting prefill (the
    // data the quote form receives). Only emitted when there's new activity this flush.
    const rest = host.restLog?.() ?? [];
    const hadNew = msgs.length > startLogged || rest.length > restLogged;
    for (let i = restLogged; i < rest.length; i++) {
      const e = rest[i];
      const data =
        e.sent.collectedData && Object.keys(e.sent.collectedData).length
          ? JSON.stringify(e.sent.collectedData)
          : "{}";
      h.log(
        `  > SENT collected=[${(e.sent.collected ?? []).join(",")}] data=${data} cardConfirm=${e.sent.cardConfirm} cat=${e.sent.categoryId ? "set" : "-"} lang=${e.sent.lang ?? "-"}`,
      );
      h.log(`  < RECV reply="${e.recv.reply}" cards=[${e.recv.cards.join(",")}]`);
    }
    restLogged = rest.length;
    if (hadNew) {
      const pf = host.prefill();
      const g = (k: string) => {
        const v = pf[k];
        return v == null || v === "" ? "-" : String(v);
      };
      h.log(
        `  = DATA cat=${pf["categoryId"] ? "set" : "-"} date=${g("preferredDate")} time=${g("timeSlot")} addr=${pf["address"] ? "set" : "-"} no=${g("addressNo")} postcode=${g("postcode")} type=${g("propertyType")} budgetMax=${g("budgetMax")} budgetIndex=${g("budgetIndex")} name=${g("contactName")} phone=${g("contactNumber")}`,
      );
    }
  };

  // Refresh restore check: a reload (instead of clear) should bring a returning guest
  // back with an "is this {name}?" identity confirm + their saved details, and the flow
  // must CONTINUE from there. Done before the opening so the new booking resumes cleanly.
  if (refreshed) {
    const priorName = (host.prefill()["contactName"] as string) || "";
    const idBlocks = latestBlocks(host).filter((b) => ACTIONABLE.has(b.type));
    const hasIdentity = idBlocks.some((b) => b.type === "identity_confirm");
    if (priorName && !hasIdentity) {
      issues.push(`refresh: returning guest "${priorName}" not asked "is this ${priorName}?" after reload`);
    }
    if (hasIdentity) {
      host.confirmIdentity(true);
      await waitIdle();
      flush();
      if (!host.prefill()["contactName"]) {
        issues.push("refresh: saved contact not restored after identity confirm");
      }
    }
  }

  let lastSend = 0;
  // Thin throttle: ensure at least MIN_GAP ms between sends so the 10 req/min
  // guest rate limit is never tripped, even on fast LLM replies.
  const MIN_GAP = 6000;
  const pace = async () => {
    const wait = lastSend ? MIN_GAP - (Date.now() - lastSend) : 0;
    if (wait > 0) await sleep(wait);
    lastSend = Date.now();
  };

  // Opening turn(s).
  for (const turn of scn.openingTurns) {
    if (h.cancelled()) return { label: scn.label, ok: false, steps, issues: ["cancelled"], reachedReview: false };
    await replyDelay();
    await pace();
    host.sendText(turn);
    await waitIdle();
    flush();
  }

  while (steps < MAX_STEPS) {
    if (h.cancelled()) { issues.push("cancelled"); break; }
    steps++;
    // Pause like a human before reading the bot's reply and responding — replying
    // instantly raced the UI/backend and produced flaky stalls.
    await replyDelay();
    await pace();
    const rawBlocks = latestBlocks(host);
    const blocks = rawBlocks.filter((b) => ACTIONABLE.has(b.type));
    if (blocks.length) sawAnyCard = true;

    // Correct-language check: each visible card's rendered label must be in the
    // customer's language. Catches untranslated question-schema labels shown in a
    // Chinese/Tamil conversation (a real bug a type-only check is blind to).
    for (const bk of blocks) {
      // Skip quote_options: the card shows the catalog SERVICE NAME, which is kept in
      // its original form on purpose (not a translation defect).
      if (bk.type === "quote_options") continue;
      const label = String(bk.data["renderedLabel"] ?? "");
      if (label && !langFlagged.has(label) && !labelMatchesLang(label, lang)) {
        langFlagged.add(label);
        issues.push(`language: card label not in ${lang}: "${label}"`);
      }
    }

    // Duplicate-card check: the SAME field/question shown more than once in one reply.
    // For quote_options, include the categoryId so offering two DIFFERENT services in
    // one reply is NOT flagged as duplicate (the prompt explicitly allows this).
    const seenSig = new Set<string>();
    for (const bk of blocks) {
      const s = `${bk.type}:${(bk.data["key"] as string) ?? (bk.data["qtype"] as string) ?? (bk.data["categoryId"] as string) ?? ""}`;
      if (seenSig.has(s) && !dupFlagged.has(s)) {
        dupFlagged.add(s);
        issues.push(`duplicate: card "${s}" shown more than once in one reply`);
      }
      seenSig.add(s);
    }

    // Flow-order check: before a service is locked, only the service card (quote_options)
    // belongs on screen. A detail field/question with no category yet — and no service
    // card offered — means the bot jumped ahead ("Hi I'm Josh" → "give me your address"),
    // i.e. broken conversational guidance.
    if (!flowFlagged && !host.prefill()["categoryId"]) {
      const hasServiceCard = blocks.some((b) => b.type === "quote_options");
      const premature = blocks.find((b) => b.type === "quote_field" || b.type === "quote_question");
      if (premature && !hasServiceCard) {
        flowFlagged = true;
        issues.push(`flow: asked for "${blockTag(premature)}" before any service was offered/locked`);
      }
    }

    if (blocks.length === 0) {
      // No actionable card. First decide if this is a TERMINAL state (the bot can't
      // continue) rather than a transient text-only turn worth nudging through.
      const hasLink = rawBlocks.some((b) => b.type === "link");
      if (hasLink || OUT_OF_SERVICE_RE.test(latestAssistantText(host))) {
        // Backend LLM failover exhausted → the bot drops to its out-of-service link.
        issues.push("assistant-error: bot dropped to out-of-service/link fallback (LLM failover exhausted)");
        terminal = true;
        break;
      }
      if (!needSent) {
        // 0-info opening: nothing for the bot to act on yet. State the real need now,
        // the way a customer answers "what do you need?" — not a blank affirmation.
        needSent = true;
        emptyTurns = 0;
        host.sendText(scn.needPhrase);
        await waitIdle();
        flush();
        continue;
      }
      emptyTurns++;
      // A clarifying TEXT question is NOT a failure — real users don't expect a card for
      // every question, and the engine answers in text below. Only fail after several
      // unproductive turns where the bot never advances the booking to the next card.
      if (emptyTurns >= 3) {
        issues.push(
          sawAnyCard
            ? `stalled: bot stayed on text for ${emptyTurns} turns without advancing the booking`
            : "unsupported: bot never produced a service card (service not in catalog or LLM declined)",
        );
        terminal = !sawAnyCard;
        break;
      }
      // Vary the nudge so the conversation does NOT look like a stuck user copy-pasting
      // the same line — a real person re-words after being ignored. Each nudge escalates:
      // first repeats the need, then asks what service fits, then directly asks for a card.
      const needCore = scn.service.needs[scn.persona.language] ?? scn.service.needs.en;
      const nudges = [
        scn.needPhrase,
        styleLine(scn.persona, pick([`i need ${needCore}, what can you do?`, `can you help with ${needCore}?`, `so about ${needCore}... anyone?`])),
        styleLine(scn.persona, pick([`i dont see a card or button, can you send it again?`, `where do i click? i only see text`, `there's nothing to tap, can you re-send?`])),
      ];
      const nudgeIdx = Math.min(emptyTurns - 1, nudges.length - 1);
      host.sendText(nudges[nudgeIdx]);
      await waitIdle();
      flush();
      continue;
    }
    emptyTurns = 0;

    // Reached the review — success.
    if (blocks.some((b) => b.type === "quote_prefill")) {
      success = true;
      break;
    }

    // A real customer never repeats info they already gave. Skip any quote_field card
    // whose value is already in the prefill (front-loaded in the opening, or confirmed
    // earlier) and act on a still-missing field instead. If the bot is ONLY re-asking
    // for already-known fields, that's a bot UX flaw — log it and nudge forward once
    // rather than parroting the same details back.
    const pf = host.prefill();
    const satisfied = (bk: QaBlock) =>
      bk.type === "quote_field" &&
      typeof bk.data["key"] === "string" &&
      pf[bk.data["key"] as string] != null &&
      pf[bk.data["key"] as string] !== "";
    const fresh = blocks.filter((bk) => !satisfied(bk));
    if (fresh.length === 0) {
      redundantNudges++;
      issues.push(`redundant: bot re-requested already-provided field(s) ${blocks.map((bk) => bk.data["key"]).filter(Boolean).join(", ")}`);
      if (redundantNudges >= 2) {
        issues.push("stuck: bot keeps re-asking for info already given");
        break;
      }
      host.sendText("yes that is all correct, please continue");
      await waitIdle();
      flush();
      continue;
    }

    const b = fresh[0];
    const sig = `${b.type}:${(b.data["key"] as string) ?? (b.data["categoryId"] as string) ?? (b.data["qtype"] as string) ?? ""}`;
    if (sig === lastSig) {
      sameSigCount++;
      if (sameSigCount >= 4) {
        issues.push(`looping: same card "${sig}" ${sameSigCount}x — flow not advancing`);
        break;
      }
    } else {
      sameSigCount = 0;
      lastSig = sig;
    }

    // ~35% of the time, answer a field in PLAIN TEXT instead of using the card — tests
    // the bot's free-text extraction (budget/date/time/address/phone). Counts as
    // collected (the customer DID provide it, just by typing) so it isn't mis-flagged
    // unconfirmed. Fields with no text extractor (name, property type) always use the card.
    if (b.type === "quote_field" && Math.random() < 0.35) {
      const key = (b.data["key"] as string) ?? "";
      const text = freeTextForField(key, scn);
      if (text) {
        confirmedKeys.add(key);
        host.sendText(text);
        await waitIdle();
        flush();
        continue;
      }
    }

    try {
      await actOnCard(host, b, scn, { rejectedOnce, chaosUsed });
      if (b.type === "quote_field" && typeof b.data["key"] === "string") {
        confirmedKeys.add(b.data["key"] as string);
      }
      if (b.type === "quote_options" && scn.persona.behavior === "reject_first" && !rejectedOnce) {
        rejectedOnce = true;
      }
    } catch {
      issues.push(`error acting on card "${sig}"`);
    }
    await waitIdle();
    flush();

    // Idempotency probe: a repeating customer occasionally re-states something already
    // given. A healthy bot absorbs it (no new/duplicate card); if it re-asks or dupes,
    // the redundant/duplicate checks above catch it on the next turn.
    if (repeatsLeft > 0 && confirmedKeys.size > 0 && Math.random() < 0.4) {
      repeatsLeft--;
      host.sendText(repeatPhrase(scn));
      await waitIdle();
      flush();
    }
  }

  if (!success && steps >= MAX_STEPS) issues.push(`timeout: review card not reached in ${MAX_STEPS} steps`);

  // ─── Checker — what landed in the final prefill vs what was expected. ───
  // Skip when the run ended terminal (out-of-service / unsupported service): listing
  // every missing field there is noise that buries the actual cause.
  const pf = host.prefill();
  const missing: string[] = [];
  if (!terminal) {
    if (!pf["categoryId"]) missing.push("categoryId (no service locked)");
    for (const k of ["preferredDate", "timeSlot", "address", "budgetMax", "contactName", "contactNumber"]) {
      const v = pf[k];
      if (v === undefined || v === null || v === "") missing.push(k);
    }
    if (missing.length) issues.push(`incomplete prefill: missing ${missing.join(", ")}`);

    // "Not picking up info": the user PROVIDED a field (tapped its card or typed the
    // value — so it's in confirmedKeys) but it never landed in the prefill. This is the
    // bot ignoring input the customer clearly gave — e.g. a typed address that never
    // registered, so the address card kept re-appearing. Distinct from "incomplete"
    // (a field never asked/given) and from "unconfirmed" (in the review yet never on a
    // card). This is the precise signal for the address-loop / 鬼打墙 class of bug.
    const notRegistered = [...confirmedKeys].filter((k) => {
      const v = pf[k];
      return v === undefined || v === null || v === "";
    });
    if (notRegistered.length)
      issues.push(
        `not-registered: user gave ${notRegistered.join(", ")} but the bot never captured it (kept re-asking)`,
      );
  }

  // Reached the review with a single-card field present that we never actually confirmed
  // on screen → the bot assumed/fabricated it (e.g. asked for phone in text and moved
  // on). A structural PASS would otherwise hide this. (Budget/address use multiple or
  // aliased cards, so they're excluded to avoid false positives.)
  if (success && !terminal) {
    for (const k of ["preferredDate", "timeSlot", "contactName", "contactNumber"]) {
      const v = pf[k];
      const has = v !== undefined && v !== null && v !== "";
      if (has && !confirmedKeys.has(k)) {
        issues.push(`unconfirmed: "${k}" is in the review but was never collected via a card`);
      }
    }
  }

  // Quality defects (wrong language, duplicate/redundant re-asks, fabricated fields,
  // loops) must FAIL the run — a structural prefill alone is not "good".
  const qualityFail = issues.some(
    (i) =>
      i.startsWith("language:") ||
      i.startsWith("redundant:") ||
      i.startsWith("duplicate:") ||
      i.startsWith("unconfirmed:") ||
      i.startsWith("not-registered:") ||
      i.startsWith("refresh:") ||
      i.startsWith("flow:") ||
      i.startsWith("stuck") ||
      i.startsWith("looping"),
  );

  return { label: scn.label, ok: success && !terminal && missing.length === 0 && !qualityFail, steps, issues, reachedReview: success };
}

/**
 * A human-style answer the harness computes for a service-question card. The harness
 * owns the persona/language/service, so it decides WHAT to answer; the host just
 * applies it to the right control (radio/checkbox/number/quantity/free text).
 */
export interface QaAnswer {
  qtype: "radio" | "checkbox" | "number" | "quantity" | "text";
  radio?: string;
  checkbox?: string[];
  number?: number;
  quantity?: Record<string, number>;
  text?: string;
}

/** Option labels/values a real customer would skip past unless nothing else fits. */
const GENERIC_OPT = /^(other|none|no\s*preference|not\s*sure|n\/?a|skip|unknown)\b/i;
function plausibleOptions(
  opts: Array<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  const real = opts.filter((o) => !GENERIC_OPT.test(o.label || "") && !GENERIC_OPT.test(o.value || ""));
  return real.length ? real : opts;
}

/** A short, believable free-text answer in the customer's own language + style. */
function humanAnswerText(scn: QaScenario): string {
  const p = scn.persona;
  // Non-Latin scripts: keep it coherent by reusing the localised problem phrase
  // instead of styling English text into the wrong script.
  if (p.language === "zh" || p.language === "ta") {
    return scn.service.needs[p.language] ?? scn.service.vague;
  }
  const base = pick([
    scn.service.vague,
    "not too sure exactly, just need someone to take a look",
    "it started a few days ago and keeps getting worse",
    "fairly urgent, hoping to get it sorted soon",
    "nothing fancy, just the standard job",
  ]);
  return styleLine(p, base);
}

/**
 * Pick a human-like answer for a service-question card from its qtype + options.
 * Non-rambler behaviors pick the FIRST plausible option (most common/default).
 * Ramblers pick RANDOMLY among plausible options — they drift and contradict.
 */
function answerForQuestion(b: QaBlock, scn: QaScenario): QaAnswer {
  const qtype = ((b.data["qtype"] as string) || (b.data["type"] as string) || "text");
  const options = (b.data["options"] as Array<{ value: string; label: string }>) || [];
  const real = plausibleOptions(options);
  const ramble = scn.persona.behavior === "rambler";
  switch (qtype) {
    case "radio":
      if (real.length) {
        const choice = ramble ? pick(real) : real[0];
        return { qtype: "radio", radio: choice.value };
      }
      return { qtype: "text", text: humanAnswerText(scn) };
    case "checkbox": {
      if (!real.length) return { qtype: "text", text: humanAnswerText(scn) };
      if (!ramble) return { qtype: "checkbox", checkbox: [real[0].value] };
      const n = Math.min(real.length, randInt(1, 2));
      const chosen = [...real].sort(() => Math.random() - 0.5).slice(0, n);
      return { qtype: "checkbox", checkbox: chosen.map((o) => o.value) };
    }
    case "number":
      return { qtype: "number", number: ramble ? randInt(1, 4) : 1 };
    case "quantity": {
      if (!real.length) return { qtype: "number", number: 1 };
      if (!ramble) {
        const q: Record<string, number> = {};
        q[real[0].value] = 1;
        return { qtype: "quantity", quantity: q };
      }
      const n = Math.min(real.length, randInt(1, 2));
      const chosen = [...real].sort(() => Math.random() - 0.5).slice(0, n);
      const q: Record<string, number> = {};
      for (const o of chosen) q[o.value] = randInt(1, 3);
      return { qtype: "quantity", quantity: q };
    }
    default:
      return { qtype: "text", text: humanAnswerText(scn) };
  }
}

/** How often a service question is answered by TYPING a natural sentence (routed through
 *  the LLM) instead of tapping the card option. Real customers often reply in their own
 *  words, so this exercises the bot's free-text -> question mapping, not just option taps. */
const QUESTION_FREETEXT_RATE = 0.4;

/**
 * Turn the option the harness would have picked into a believable free-text sentence in
 * the customer's language/style — so the bot has to map natural words back to the right
 * option. Falls back to a generic human phrase when there are no options.
 */
function naturalQuestionReply(b: QaBlock, scn: QaScenario): string {
  const ans = answerForQuestion(b, scn);
  const options = (b.data["options"] as Array<{ value: string; label: string }>) || [];
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  let core = "";
  switch (ans.qtype) {
    case "radio":
      core = ans.radio ? labelOf(ans.radio) : "";
      break;
    case "checkbox":
      core = (ans.checkbox ?? []).map(labelOf).join(" and ");
      break;
    case "number":
      core = ans.number != null ? `about ${ans.number}` : "";
      break;
    case "quantity":
      core = Object.entries(ans.quantity ?? {})
        .map(([v, n]) => `${n} ${labelOf(v)}`)
        .join(", ");
      break;
    default:
      // Free-text question — already a styled human sentence.
      return humanAnswerText(scn);
  }
  if (!core) return humanAnswerText(scn);
  return styleLine(scn.persona, core);
}

/** The two typing-only personas never tap a card — they type every answer as free text. */
function isTypingOnly(b: QaBehavior): boolean {
  return b === "typing_shortcut" || b === "typing_adhd";
}

/** Heavy SMS-shortcut compression for the typing_shortcut persona. */
function shortcutText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bplease\b/g, "pls")
    .replace(/\byou\b/g, "u")
    .replace(/\byour\b/g, "ur")
    .replace(/\btomorrow\b/g, "tmrw")
    .replace(/\btonight\b/g, "tnite")
    .replace(/\band\b/g, "n")
    .replace(/\bnumber\b/g, "no")
    .replace(/\baround\b/g, "~")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Kid-with-ADHD off-topic non-answer — jumpy, distracted; forces the bot to re-ask once. */
function kidChatter(): string {
  return pick([
    "wait what",
    "ummm idk",
    "hang on",
    "my dog just barked lol",
    "can we go faster",
    "oops nvm",
    "huh",
    "ya whatever",
    "im hungry",
    "one sec brb",
    "what was the question again",
  ]);
}

/** Free-text a customer would type for ANY field card. Extends freeTextForField to the
 *  fields it deliberately skips (address, name, property type) — used only by the
 *  typing-only personas, which never tap a card even at the cost of the structured-address
 *  gap (typed addresses leave No/Postcode/Type empty — a real, worth-surfacing finding). */
function typingFieldText(key: string, scn: QaScenario): string {
  const ft = freeTextForField(key, scn);
  if (ft) return ft;
  const p = scn.persona;
  switch (key) {
    case "address":
      return styleLine(p, `${scn.addr.no} ${scn.addr.street} ${scn.addr.postcode}`);
    case "contactName":
      return styleLine(p, pick([scn.name, `i'm ${scn.name}`, `name's ${scn.name}`]));
    case "propertyType":
      return styleLine(p, scn.addr.propertyType);
    case "notes":
      return styleLine(p, scn.notes || "no notes");
    default:
      return styleLine(p, "ok");
  }
}

/** Map a card to the right host action, filling it with the scenario's data. */
async function actOnCard(
  host: QaHost,
  b: QaBlock,
  scn: QaScenario,
  st: { rejectedOnce: boolean; chaosUsed: Set<string> },
): Promise<void> {
  // Typing-only personas: never tap a card — type the answer as free text so the LLM has
  // to extract it. (identity_confirm is a yes/no gate, not a data card — still tapped.)
  if (isTypingOnly(scn.persona.behavior) && b.type !== "identity_confirm") {
    const sig = `${b.type}:${(b.data["key"] as string) ?? (b.data["categoryId"] as string) ?? (b.data["qtype"] as string) ?? ""}`;
    // ADHD: one off-topic non-answer per card before the real value (forces a single
    // re-ask, capped so it can't trip the 4x same-card loop detector).
    if (
      scn.persona.behavior === "typing_adhd" &&
      !st.chaosUsed.has(sig) &&
      Math.random() < 0.45
    ) {
      st.chaosUsed.add(sig);
      host.sendText(kidChatter());
      return;
    }
    // Address is structured-only now — the composer is LOCKED until the address card is
    // filled, so even a type-only persona must use the card (No./Street/Postcode/Type +
    // geocode). Typing a free-text address can no longer satisfy it.
    if (b.type === "quote_field" && (b.data["key"] as string) === "address") {
      host.confirmAddress(scn.addr);
      return;
    }
    let text: string;
    if (b.type === "quote_options") {
      // Confirm (or reject) the service by typing, not tapping.
      text =
        scn.persona.behavior === "reject_first" && !st.rejectedOnce
          ? pick(["not that", "no thats wrong", "nope"])
          : pick([
              qaAffirm(scn.persona.language),
              scn.service.needs[scn.persona.language] ?? scn.service.needs.en,
              "ya that one",
            ]);
    } else if (b.type === "quote_question") {
      text = naturalQuestionReply(b, scn);
    } else if (b.type === "quote_field") {
      text = typingFieldText((b.data["key"] as string) ?? "", scn);
    } else {
      return; // quote_prefill / other — nothing to type
    }
    if (scn.persona.behavior === "typing_shortcut") text = shortcutText(text);
    host.sendText(text);
    return;
  }
  if (b.type === "identity_confirm") {
    host.confirmIdentity(true);
    return;
  }
  if (b.type === "quote_options") {
    if (scn.persona.behavior === "reject_first" && !st.rejectedOnce) host.rejectCategory(b);
    else host.lockCategory(b);
    return;
  }
  if (b.type === "quote_question") {
    // Sometimes TYPE a natural answer (LLM must map it) instead of tapping the option.
    // Skip the typed path for ramblers (they already drift via random option picks).
    if (scn.persona.behavior !== "rambler" && Math.random() < QUESTION_FREETEXT_RATE) {
      host.sendText(naturalQuestionReply(b, scn));
      return;
    }
    host.answerQuestion(b, answerForQuestion(b, scn));
    return;
  }
  if (b.type === "quote_field") {
    const key = (b.data["key"] as string) ?? "";
    switch (key) {
      case "preferredDate":
        host.confirmDate(scn.date);
        return;
      case "timeSlot":
        host.confirmTime(scn.timeSlot);
        return;
      case "address":
        host.confirmAddress(scn.addr);
        return;
      case "propertyType":
        host.confirmPropertyType(scn.addr.propertyType);
        return;
      case "budgetMax":
      case "budgetMin": {
        // Budget brackets load after the category locks — wait briefly for them.
        let waited = 0;
        while (host.budgetRangeCount() === 0 && waited < 3000) {
          await sleep(200);
          waited += 200;
        }
        host.confirmBudget(budgetIndexFor(scn.budget, host.budgetRangeCount()));
        return;
      }
      case "contactNumber":
        host.confirmPhone(scn.phoneLocal);
        return;
      case "contactName":
        host.confirmTextField("contactName", scn.name);
        return;
      case "notes":
        host.confirmTextField("notes", scn.notes || "no special notes");
        return;
      case "addressNo":
        host.confirmTextField("addressNo", scn.addr.no);
        return;
      case "postcode":
        host.confirmTextField("postcode", scn.addr.postcode);
        return;
      case "streetDetails":
        host.confirmTextField("streetDetails", scn.addr.street);
        return;
      default:
        host.confirmTextField(key, "ok");
        return;
    }
  }
}

export interface QaHarnessOptions {
  count: number;
  logName: string;
  /** Customer mode draws identities from the preset list (the 6th axis). */
  customerMode?: boolean;
  /** Demo mode: run the 4 fixed guaranteed-pass scenarios (en/ms/zh/ta) instead of random
   *  ones, never refresh between them. One clean booking per language, 0 → review. */
  demo?: boolean;
  onProgress?: (done: number, total: number, label: string) => void;
  cancelled?: () => boolean;
  /** Incremental writer — called with each new chunk (header, per scenario, summary)
   *  so the log is persisted to disk as the run goes, surviving a stop or crash. */
  onChunk?: (text: string) => Promise<void> | void;
}

/**
 * Run the whole QA suite. Returns the transcript+report log lines (for download).
 * Drives the host through `count` random scenarios, one full quote each.
 */
export async function runQaHarness(host: QaHost, opts: QaHarnessOptions): Promise<string[]> {
  const log: string[] = [];
  let pending: string[] = [];
  const push = (line: string) => {
    log.push(line);
    pending.push(line);
  };
  // Flush the buffered lines to the incremental writer (disk), then clear the buffer.
  const flushChunk = async () => {
    if (pending.length && opts.onChunk) await opts.onChunk(pending.join("\n") + "\n");
    pending = [];
  };
  const cancelled = opts.cancelled ?? (() => false);
  const scenarios = opts.demo
    ? makeDemoScenarios()
    : generateScenarios(opts.count, opts.customerMode === true);
  const results: QaRunResult[] = [];

  push(`# ${opts.logName}`);
  push(
    opts.demo
      ? `Demo flow — ${scenarios.length} guaranteed-pass bookings, one per language (en/ms/zh/ta), 0 → review`
      : `Automated chat QA — ${scenarios.length} simulated customers, each booking a full quote`,
  );
  push(`Mode: ${opts.demo ? "demo" : opts.customerMode ? "customer (with presets)" : "guest"}`);
  push(`Generated: ${new Date().toISOString()}`);
  push("");
  await flushChunk(); // create the file with the header immediately

  const judgeFindings: string[] = [];
  let judgeIssueRuns = 0;
  let judgeErrorRuns = 0;
  let judgeUnavailable = false;

  for (let i = 0; i < scenarios.length; i++) {
    if (cancelled()) break;
    const scn = scenarios[i];
    opts.onProgress?.(i + 1, scenarios.length, scn.label);
    push("");
    push(`## ${i + 1}. ${scn.label}`);
    push(`persona: ${JSON.stringify(scn.persona)}`);
    push(`service: "${scn.service.needs.en}"`);
    push(`intent | ${intentLabel(scn)}`);
    const startLen = log.length;
    // ~30% of guest runs (after the first, which seeds saved state) REFRESH instead of
    // clearing — reloading from storage to exercise the returning-guest "is this {name}?"
    // restore flow and confirm the booking continues after a reload.
    const doRefresh =
      !opts.demo && i > 0 && opts.customerMode !== true && Math.random() < 0.3;
    if (doRefresh) {
      host.refresh();
      push("(refresh: reloaded from storage instead of clearing — testing returning-guest restore)");
    } else {
      host.clear();
    }
    await sleep(700);
    let res: QaRunResult;
    try {
      res = await driveScenario(host, scn, { log: push, cancelled }, doRefresh);
    } catch (e) {
      // One scenario crashing must NOT abort the whole suite (and skip the final
      // summary) — record it as a failed run and carry on so the log still completes.
      const msg = (e as Error)?.message ?? String(e);
      push(`SCENARIO ERROR: ${msg}`);
      res = { label: scn.label, ok: false, steps: 0, issues: [`error: ${msg}`], reachedReview: false };
    }
    results.push(res);
    push(`RESULT: ${res.ok ? "PASS" : "FAIL"} (${res.steps} steps)${res.issues.length ? " — " + res.issues.join("; ") : ""}`);

    // Reached the review → press "Review & submit" and walk the real quote form to the
    // Summary (no submit), logging each page, then the host returns home for the next run.
    if (res.reachedReview && host.submitAndVerifyForm && !cancelled()) {
      push("--- FORM CHECK (Review & submit → quote page) ---");
      try {
        for (const line of await host.submitAndVerifyForm()) push(line);
      } catch (e) {
        push(`FORM CHECK ERROR: ${(e as Error)?.message ?? String(e)}`);
      }
      await flushChunk();
    }

    // LLM judge — catch logical/conversational issues the heuristic checker can't see
    // (wrong reply language, assumed data, contradictions, ignored input, bad flow).
    if (host.judge && !judgeUnavailable) {
      const transcriptLines = log.slice(startLen);
      // Transcript lines are timestamped ("[HH:MM:SS] USER: ..."), so the marker is
      // after the clock prefix — match it there, not at column 0. (A bare /^(USER|BOT)/
      // matched nothing once timestamps were added, flagging every run "no-transcript".)
      const hasConversation = transcriptLines.some((l) =>
        /^\[\d{2}:\d{2}:\d{2}\]\s+(USER|BOT)\b/.test(l),
      );
      if (!hasConversation) {
        // No real exchange was captured — don't let the judge fabricate findings from
        // the RESULT line alone. Flag the run for investigation instead.
        push("JUDGE: (no transcript captured — review skipped; conversation did not run)");
        if (!res.issues.includes("no-transcript")) res.issues.push("no-transcript: conversation produced no messages");
        await flushChunk();
        await sleep(600);
        continue;
      }
      const transcript = transcriptLines.join("\n");
      try {
        const verdict = (await host.judge(transcript, "run")).trim();
        if (verdict.startsWith("JUDGE_UNAVAILABLE")) {
          judgeUnavailable = true;
          push("JUDGE: (no LLM key configured — logical review skipped)");
        } else if (verdict.startsWith("JUDGE_ERROR")) {
          // Judge LLM returned nothing (empty/failed) — a review gap, not a bot finding.
          judgeErrorRuns++;
          push("JUDGE: (no reply from judge LLM — review skipped this run)");
        } else if (verdict && verdict.toUpperCase() !== "OK") {
          judgeIssueRuns++;
          push("JUDGE:");
          for (const line of verdict.split("\n")) if (line.trim()) push(`  ${line.trim()}`);
          judgeFindings.push(`#${i + 1} ${scn.label}\n${verdict}`);
        } else {
          push("JUDGE: OK");
        }
      } catch {
        push("JUDGE: (review error)");
      }
    }
    await flushChunk(); // persist this scenario before moving on
    await sleep(600);
  }

  // ─── Structural tally — computed BEFORE the conclusion so the judge sees the real
  //      pass/fail, not just findings. Without this it called a 0-pass run "excellent"
  //      whenever the judge happened to return no findings (e.g. it was offline). ───
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  const issueTally = new Map<string, number>();
  for (const r of results) {
    for (const iss of r.issues) {
      const kind = iss.split(":")[0];
      issueTally.set(kind, (issueTally.get(kind) ?? 0) + 1);
    }
  }
  const reviewedRuns = Math.max(0, results.length - judgeErrorRuns);

  // ─── Final conclusion — one LLM pass over the structural facts + findings. ───
  let conclusion = "";
  if (host.judge && !judgeUnavailable && results.length) {
    const structural =
      `Structural results: ${pass}/${results.length} runs completed the booking, ${fail} failed. ` +
      `Issue breakdown: ${[...issueTally.entries()].map(([k, n]) => `${k}=${n}`).join(", ") || "none"}. ` +
      `The LLM judge reviewed ${reviewedRuns}/${results.length} runs (${judgeErrorRuns} returned no judge reply).`;
    const findingsText = judgeFindings.length
      ? `${structural}\n\nPer-conversation findings:\n${judgeFindings.join("\n\n")}`
      : `${structural}\n\nThe judge surfaced no logical findings${judgeErrorRuns ? " on the runs it could review" : ""}. Base the conclusion on the STRUCTURAL results above — do NOT call the system healthy if runs failed.`;
    try {
      const c = (await host.judge(findingsText, "conclude")).trim();
      if (c && !c.startsWith("JUDGE_UNAVAILABLE") && !c.startsWith("JUDGE_ERROR")) conclusion = c;
    } catch {
      /* conclusion optional */
    }
  }

  // ─── Summary first-page report. ───
  const summary: string[] = [
    "",
    "---",
    "## CONCLUSION",
    conclusion ||
      (judgeUnavailable || judgeErrorRuns === results.length
        ? `(LLM judge unavailable — structural checks only: ${pass}/${results.length} completed, ${fail} failed.)`
        : "(no conclusion)"),
    "",
    "## SUMMARY",
    `Ran: ${results.length}   Structurally complete: ${pass}   Incomplete: ${fail}`,
    `LLM judge: reviewed ${reviewedRuns}/${results.length} runs, flagged issues in ${judgeIssueRuns}` +
      (judgeErrorRuns ? `, no reply on ${judgeErrorRuns}` : ``),
    "Structural issue breakdown:",
    ...[...issueTally.entries()].map(([k, n]) => `  - ${k}: ${n}`),
    "",
    "Incomplete runs:",
    ...results.filter((r) => !r.ok).map((r, i) => `  ${i + 1}. ${r.label} — ${r.issues.join("; ") || "incomplete"}`),
  ];
  // Stream the conclusion + summary as the final chunk so it lands on disk too.
  for (const line of summary) push(line);
  await flushChunk();
  return log;
}
