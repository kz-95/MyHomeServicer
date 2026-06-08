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
  /** Answer a service-question card (any qtype) with a valid value. */
  answerQuestion(b: QaBlock): void;
  /** Accept a returning-guest identity confirm. */
  confirmIdentity(yes: boolean): void;
}

// ─── Persona axes ────────────────────────────────────────────────────────────────
export const QA_TYPING = ["proper", "lowercase", "typos", "abbrev", "verbose", "terse"] as const;
export const QA_TONE = ["polite", "blunt", "impatient", "friendly", "anxious", "chatty"] as const;
export const QA_BEHAVIOR = ["cooperative", "reject_first", "oversharer", "self_correct", "rambler", "minimal"] as const;
export const QA_SORTING = ["service_first", "dump_all", "address_first", "budget_first", "contact_first", "vague_first"] as const;
export const QA_LANG = ["en", "ms", "zh", "rojak"] as const;

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
  { needs: { en: "my kitchen sink is leaking badly", ms: "sink dapur saya bocor teruk", zh: "我家厨房水管漏水" }, vague: "there's water all over my kitchen floor" },
  { needs: { en: "my aircon is not cold anymore", ms: "aircond saya tak sejuk dah", zh: "我的冷气不冷了" }, vague: "my room is so hot even with the unit on" },
  { needs: { en: "my house is really dirty and needs a deep clean", ms: "rumah saya kotor sangat perlu cleaner", zh: "我家很脏需要打扫" }, vague: "the place is a complete mess, guests coming soon" },
  { needs: { en: "a power socket keeps sparking", ms: "soket kuasa saya mengeluarkan api", zh: "插座一直冒火花" }, vague: "something smells burnt near the wall plug" },
  { needs: { en: "lots of cockroaches in my kitchen", ms: "banyak lipas dalam dapur saya", zh: "厨房有很多蟑螂" }, vague: "there are bugs everywhere in the kitchen" },
  { needs: { en: "I need my ceiling fan installed", ms: "saya perlu pasang kipas siling", zh: "我需要安装吊扇" }, vague: "this thing on the ceiling needs putting up" },
  { needs: { en: "I want to repaint my living room", ms: "saya nak cat semula ruang tamu", zh: "我想重新粉刷客厅" }, vague: "the walls look terrible, need a new look" },
  { needs: { en: "my lawn is overgrown and needs trimming", ms: "rumput saya panjang perlu potong", zh: "我的草坪需要修剪" }, vague: "the garden is a jungle now" },
  { needs: { en: "I need movers for my apartment", ms: "saya perlu pekerja pindah rumah", zh: "我需要搬家工人" }, vague: "I have a lot of furniture to shift" },
  { needs: { en: "my door lock is jammed", ms: "kunci pintu saya tersangkut", zh: "我的门锁卡住了" }, vague: "I can't get my door to work properly" },
  { needs: { en: "I want to install a CCTV camera", ms: "saya nak pasang kamera CCTV", zh: "我想安装闭路电视" }, vague: "I want to keep an eye on my front gate" },
  { needs: { en: "I need a car wash and detailing", ms: "saya perlu cuci kereta", zh: "我需要洗车" }, vague: "my car is filthy inside and out" },
  { needs: { en: "I'm looking for a math tutor for my son", ms: "saya cari tutor matematik untuk anak saya", zh: "我想找数学补习老师" }, vague: "my kid needs help with his studies" },
  { needs: { en: "I need laundry and ironing done", ms: "saya perlu basuh dan gosok baju", zh: "我需要洗衣和熨衣" }, vague: "I have a huge pile of clothes" },
  { needs: { en: "my roof is leaking when it rains", ms: "bumbung saya bocor bila hujan", zh: "下雨时屋顶漏水" }, vague: "water drips inside whenever it rains" },
  { needs: { en: "my washing machine stopped working", ms: "mesin basuh saya rosak", zh: "我的洗衣机坏了" }, vague: "one of my appliances just died" },
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
const QA_PROPERTY_TYPES = ["house", "apartment", "office", "shop"];
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
    case "proper":
    default:
      return text.charAt(0).toUpperCase() + text.slice(1);
  }
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
      return "ya betul";
    case "zh":
      return "对，就是这个";
    case "rojak":
      return "ya correct lah";
    default:
      return "yes please go ahead";
  }
}

/** Compose the customer's opening turn(s) from persona + sorting + language. */
function composeOpening(p: QaPersona, s: QaService, name: string, phone: string, addr: QaAddress, budgetWord: string, dateWords: string): string[] {
  const need = s.needs[p.language] ?? s.needs.en;
  const addrStr = `${addr.no} ${addr.street}, ${addr.postcode}`;
  // Language transforms only colour English/rojak; ms/zh needs are already localised.
  const style = (t: string) => (p.language === "en" || p.language === "rojak" ? applyTone(applyTyping(t, p.typing), p.tone) : t);

  switch (p.sorting) {
    case "dump_all":
      return [style(`${need}, ${dateWords} ${pick(QA_TIME_SLOTS)}, I'm at ${addrStr}, budget around rm${budgetWord}, I'm ${name} call ${phone}`)];
    case "address_first":
      return [style(`I'm at ${addrStr}`), style(need)];
    case "budget_first":
      return [style(`I've got about rm${budgetWord} to spend`), style(need)];
    case "contact_first":
      return [style(`I'm ${name}, reach me at ${phone}`), style(need)];
    case "vague_first":
      return [style(s.vague), style(need)];
    case "service_first":
    default:
      return [style(need)];
  }
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
    openingTurns: composeOpening(persona, service, name, phoneLocal, addr, budgetWord, dateWords),
    label: `${persona.typing}/${persona.tone}/${persona.behavior}/${persona.sorting}/${persona.language}${preset ? `/preset:${preset.name}` : ""} — ${service.needs.en}`,
  };
}

export function generateScenarios(count: number, customerMode = false): QaScenario[] {
  const out: QaScenario[] = [];
  for (let i = 0; i < count; i++) out.push(makeScenario(customerMode));
  return out;
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

export interface QaRunResult {
  label: string;
  ok: boolean;
  steps: number;
  issues: string[];
}

interface RunHandle {
  log(line: string): void;
  cancelled(): boolean;
}

/** Drive ONE scenario to the review card. Returns the result + appends transcript. */
async function driveScenario(host: QaHost, scn: QaScenario, h: RunHandle): Promise<QaRunResult> {
  const issues: string[] = [];
  const MAX_STEPS = 40;
  let steps = 0;
  let rejectedOnce = false;
  let lastSig = "";
  let sameSigCount = 0;
  let emptyTurns = 0;
  let success = false;

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

  // Append any new transcript messages to the log.
  let logged = host.messages().length;
  const flush = () => {
    const msgs = host.messages();
    for (let i = logged; i < msgs.length; i++) {
      const m = msgs[i];
      const tag = m.role === "user" ? "USER" : "BOT ";
      const txt = (m.content || "").replace(/\n+/g, " ").trim();
      if (txt) h.log(`${tag}: ${txt}`);
      else if (m.blocks?.length) h.log(`${tag}: [${m.blocks.map((b) => b.type).join(", ")}]`);
    }
    logged = msgs.length;
  };

  // Opening turn(s).
  for (const turn of scn.openingTurns) {
    if (h.cancelled()) return { label: scn.label, ok: false, steps, issues: ["cancelled"] };
    host.sendText(turn);
    await waitIdle();
    flush();
  }

  while (steps < MAX_STEPS) {
    if (h.cancelled()) { issues.push("cancelled"); break; }
    steps++;
    const blocks = latestBlocks(host).filter((b) => ACTIONABLE.has(b.type));

    if (blocks.length === 0) {
      // No card to act on — the bot replied with text only.
      emptyTurns++;
      if (emptyTurns >= 2) {
        issues.push(`stalled: bot showed no card for ${emptyTurns} turns (stuck on text)`);
        break;
      }
      // One nudge: affirm + restate the need, the way a confused customer would.
      host.sendText(qaAffirm(scn.persona.language));
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

    const b = blocks[0];
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

    try {
      await actOnCard(host, b, scn, { rejectedOnce });
      if (b.type === "quote_options" && scn.persona.behavior === "reject_first" && !rejectedOnce) {
        rejectedOnce = true;
      }
    } catch {
      issues.push(`error acting on card "${sig}"`);
    }
    await waitIdle();
    flush();
  }

  if (!success && steps >= MAX_STEPS) issues.push(`timeout: review card not reached in ${MAX_STEPS} steps`);

  // ─── Checker — what landed in the final prefill vs what was expected. ───
  const pf = host.prefill();
  const missing: string[] = [];
  if (!pf["categoryId"]) missing.push("categoryId (no service locked)");
  for (const k of ["preferredDate", "timeSlot", "address", "budgetMax", "contactName", "contactNumber"]) {
    const v = pf[k];
    if (v === undefined || v === null || v === "") missing.push(k);
  }
  if (missing.length) issues.push(`incomplete prefill: missing ${missing.join(", ")}`);

  return { label: scn.label, ok: success && missing.length === 0, steps, issues };
}

/** Map a card to the right host action, filling it with the scenario's data. */
async function actOnCard(host: QaHost, b: QaBlock, scn: QaScenario, st: { rejectedOnce: boolean }): Promise<void> {
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
    host.answerQuestion(b);
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
  onProgress?: (done: number, total: number, label: string) => void;
  cancelled?: () => boolean;
}

/**
 * Run the whole QA suite. Returns the transcript+report log lines (for download).
 * Drives the host through `count` random scenarios, one full quote each.
 */
export async function runQaHarness(host: QaHost, opts: QaHarnessOptions): Promise<string[]> {
  const log: string[] = [];
  const push = (line: string) => log.push(line);
  const cancelled = opts.cancelled ?? (() => false);
  const scenarios = generateScenarios(opts.count, opts.customerMode === true);
  const results: QaRunResult[] = [];

  push(`# ${opts.logName}`);
  push(`Automated chat QA — ${opts.count} simulated customers, each booking a full quote`);
  push(`Mode: ${opts.customerMode ? "customer (with presets)" : "guest"}`);
  push(`Generated: ${new Date().toISOString()}`);
  push("");

  for (let i = 0; i < scenarios.length; i++) {
    if (cancelled()) break;
    const scn = scenarios[i];
    opts.onProgress?.(i + 1, scenarios.length, scn.label);
    push("");
    push(`## ${i + 1}. ${scn.label}`);
    push(`persona: ${JSON.stringify(scn.persona)}`);
    host.clear();
    await sleep(700);
    const res = await driveScenario(host, scn, {
      log: push,
      cancelled,
    });
    results.push(res);
    push(`RESULT: ${res.ok ? "PASS" : "FAIL"} (${res.steps} steps)${res.issues.length ? " — " + res.issues.join("; ") : ""}`);
    await sleep(600);
  }

  // ─── Summary first-page report. ───
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  const issueTally = new Map<string, number>();
  for (const r of results) {
    for (const iss of r.issues) {
      const kind = iss.split(":")[0];
      issueTally.set(kind, (issueTally.get(kind) ?? 0) + 1);
    }
  }
  const summary: string[] = [
    "",
    "---",
    "## SUMMARY",
    `Ran: ${results.length}   Pass: ${pass}   Fail: ${fail}`,
    "Issue breakdown:",
    ...[...issueTally.entries()].map(([k, n]) => `  - ${k}: ${n}`),
    "",
    "Failures:",
    ...results.filter((r) => !r.ok).map((r, i) => `  ${i + 1}. ${r.label} — ${r.issues.join("; ") || "incomplete"}`),
  ];
  // Put the summary at the TOP (after the title) so it's the first thing read.
  return [...log.slice(0, 4), ...summary, ...log.slice(4)];
}
