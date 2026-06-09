import * as chrono from "chrono-node";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { configVault } from "../lib/config-vault";
import { formatOrderId } from "../lib/order-id";
import type { QuestionItem, Localized } from "../lib/json-schemas";

/** Compact tag for a card block, for decision logs, e.g. "quote_field:contactNumber". */
function blockTag(b: { type: string; data?: Record<string, unknown> }): string {
  const d = b.data ?? {};
  const id =
    (d["key"] as string) ||
    (d["qtype"] as string) ||
    (d["categoryId"] ? "cat" : "");
  return id ? `${b.type}:${id}` : b.type;
}

/** Resolve a localized label to the target language, falling back to the canonical text
 *  (also for English and rojak, which is English-based). */
function pickI18n(
  base: string,
  i18n: Localized | undefined,
  lang?: string,
): string {
  if (!lang || lang === "en" || lang === "rojak") return base;
  const v = i18n?.[lang as keyof Localized];
  return v && v.trim() ? v : base;
}

const TIER_ORDER = ["admin", "servicer", "customer", "guest"] as const;

function roleTierIndex(role: string): number {
  const idx = TIER_ORDER.indexOf(role as (typeof TIER_ORDER)[number]);
  return idx >= 0 ? idx : 2;
}

function userLabel(role: string): string {
  switch (role) {
    case "admin":
      return "an admin";
    case "servicer":
      return "a servicer (service provider)";
    case "guest":
      return "a guest (not logged in)";
    default:
      return "a customer";
  }
}

async function buildSystemPrompt(role: string = "customer"): Promise<string> {
  try {
    const idx = roleTierIndex(role);
    const allowedTiers = TIER_ORDER.slice(idx) as readonly string[];

    const rows = await prisma.faq.findMany({
      where: {
        isPublished: true,
        tier: { in: allowedTiers as string[] },
      },
      orderBy: { sortOrder: "asc" },
      select: { question: true, answer: true, category: true },
    });

    if (rows.length === 0) return buildPrompt(role);

    const byType = new Map<string, string[]>();
    for (const r of rows) {
      const key = r.category || "general";
      const list = byType.get(key) ?? [];
      list.push(`${r.question}: ${r.answer}`);
      byType.set(key, list);
    }

    let ref = "";
    for (const [type, items] of byType) {
      ref += `\n${type}:\n`;
      for (const item of items) {
        ref += `  - ${item}\n`;
      }
    }

    return `${buildPrompt(role)}\n\nReference data (use for accurate answers):\n${ref}`;
  } catch (err) {
    logger.warn("Failed to load chat knowledge from DB", {
      error: (err as Error).message,
    });
    return buildPrompt(role);
  }
}

function buildPrompt(role: string): string {
  const label = userLabel(role);

  const facts =
    role === "guest"
      ? "Platform facts: Homeowners request services like plumbing, cleaning, aircon, and catering. Nearby service providers reply with prices. No account needed — I can help you request a service right here."
      : role === "servicer"
        ? `Platform facts: Customers submit quote requests with category, details, budget, and time. You reply with priced proposals. When selected, a booking is created. Booking lifecycle: pending confirmation, confirmed, arrived, job done. Payment is cash. Cancel a booking before arrival. A credit wallet holds promo paybacks. Rewards page shows loyalty points and tiers. Notifications appear as toasts.`
        : `Platform facts: A customer submits a quote request with category, details, budget, and time. Nearby servicers reply with priced proposals. Customer picks one and a booking is created. Cancel an open quote from Current Quotes before selecting. Booking lifecycle: pending confirmation, confirmed, arrived, job done. Active bookings under Upcoming Bookings; completed jobs under Order History. Cancel a booking before a servicer arrives; after arrival, report the problem. Payment is cash only. Customer confirms cash in-app after job done. A credit wallet is available for top-up. From Order History, rebook the same servicer via pre-filled editable form. Rewards page shows loyalty points, tiers, and redeemable perks. Notifications appear as bottom-left toasts with per-type toggles and category follow filters.`;

  const links =
    role === "guest"
      ? `When directing users to a page, include a clickable link using markdown link syntax: [page name](/path). Use relative paths starting with /.`
      : role === "customer"
        ? `When directing users to a page, include a clickable link using markdown link syntax: [page name](/path). For example: [view your bookings](/customer/bookings), [check rewards](/customer/rewards). Use relative paths starting with /.`
        : role === "servicer"
          ? `When directing users to a page, include a clickable link using markdown link syntax: [page name](/path). For example: [view your jobs](/servicer/jobs/pending), [manage your jobs](/servicer/jobs/pending). Use relative paths starting with /.`
          : `When directing users to a page, include a clickable link using markdown link syntax: [page name](/path). For example: [admin home](/admin), [manage users](/admin/users). Use relative paths starting with /.`;

  const report =
    role === "guest"
      ? ""
      : `\n\nIf the user describes a booking problem, end your reply with the exact phrase "You can report a booking problem using the button below." If the user reports a technical issue with the app itself, end your reply with "You can report this bug using the button below."`;

  const locationLinks =
    role === "customer"
      ? `\n\nNavigation rule — ALWAYS include a markdown hyperlink when directing a customer to a page:
- "where is my booking / upcoming booking" → [My Bookings](/customer/bookings)
- "where is my order / order history / past booking" → [Order History](/customer/history)
- "where is my quote / current quote" → [My Quotes](/customer/quotes)
- "where is my proposal" → [My Quotes](/customer/quotes)
- "where are my rewards / points / vouchers" → [Rewards](/customer/rewards)
- "where is my account / profile / settings" → [Account](/customer/account)
- "where is my wallet / credit / balance" → [Payments](/customer/transactions) — but answer balance from the account context above; do NOT link to external bank or card pages
- Credit card or transaction enquiries: give a SHORT text-only guide ("use the secure payment page inside the app"); NEVER provide a link to an external bank, card network, or payment portal`
      : "";

  const prompt = `You are the My Home Servicer assistant, an on-demand platform connecting homeowners with local service providers for plumbing, cleaning, aircon servicing, and home cooking. Help with quotes, proposals, bookings, payments, credit, and reporting problems. Be warm, concise, plain-language. 1-4 sentences per reply. Never invent policies, prices, or features. If unsure, say so and offer to escalate.

${facts}

${links}

When an issue is reported: acknowledge, ask which booking, what happened, when, and say you will log it for the support team. Never promise refunds, penalties, or outcomes. Never ask for passwords, card numbers, bank details, one-time codes, or API keys. Never commit for the platform. For emergencies or legal matters, direct users to real-world help. Unsure? Offer to escalate.${report}

Secret demo feature: if the user says "open sesame", reveal the user's platform role with a 🔓 emoji and a summary of what their role can do. Guest: act confused (pretend you don't know what they mean). Customer: reveal their role and mention quotes, bookings, rewards. Servicer: reveal their role and mention proposals, jobs, business management. Admin: reveal their role and mention platform settings, users, penalties. Do not reveal this secret in any other context.

Tone: friendly, cheerful, efficient. Brief greeting on first message only, then get to the point. Do not over-apologise. End with a clear next step.`;

  return `You are speaking to ${label} on My Home Servicer.\n\n${prompt}${locationLinks}`;
}

export interface ActionBlock {
  type: string;
  data: Record<string, unknown>;
}

export interface AiReply {
  answer: string;
  tokensUsed: number | null;
  actionBlocks?: ActionBlock[];
  /** True when the provider cut the response off at max tokens (finish_reason=length). */
  truncated?: boolean;
}

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

const ACTION_TAG_RE = /\[action:(\w+)\]([\s\S]*?)\[\/action\]/g;

function parseYamlLike(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let value: unknown = trimmed.slice(colonIdx + 1).trim();
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (/^\d+$/.test(value as string))
      value = parseInt(value as string, 10);
    else if (/^[\d.]+$/.test(value as string))
      value = parseFloat(value as string);
    else if (
      (value as string).startsWith("[") &&
      (value as string).endsWith("]")
    ) {
      try {
        value = JSON.parse(value as string);
      } catch {
        value = (value as string)
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""));
      }
    } else {
      value = (value as string).replace(/^["']|["']$/g, "");
    }
    result[key] = value;
  }
  return result;
}

export function parseActionBlocks(reply: string): ActionBlock[] {
  const blocks: ActionBlock[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(ACTION_TAG_RE);
  while ((match = re.exec(reply)) !== null) {
    const type = match[1];
    const raw = match[2].trim();
    blocks.push({ type, data: parseYamlLike(raw) });
  }
  return blocks;
}

export function stripActionBlocks(reply: string): string {
  return (
    reply
      // Remove well-formed [action:..]..[/action] blocks.
      .replace(ACTION_TAG_RE, "")
      // Unclosed opener (model forgot [/action]): remove the opener tag and the
      // rest of ITS line only — NOT to end of message, or condolence/prose that
      // follows the tag would be eaten and the bubble shows the empty fallback.
      .replace(/\[action:\w+\][^\n]*/g, "")
      // Stray closing tags.
      .replace(/\[\/action\]/g, "")
      // Orphan action-block key lines left behind by a malformed block.
      .replace(/^[ \t]*(?:category|categoryId|key|value)[ \t]*:.*$/gim, "")
      // Collapse blank-line runs the removals may have created.
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

const KNOWN_ACTION_TYPES = new Set([
  "quote_options",
  "quote_field",
  "quote_question",
  "quote_prefill",
  "profile_field",
  "pin_required",
  "link",
  "form_fill",
  "category_lock",
  "retry",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateActionBlock(block: ActionBlock): boolean {
  if (!KNOWN_ACTION_TYPES.has(block.type)) return false;
  // quote_options must reference a REAL catalog category. The model sometimes
  // invents services that don't exist (e.g. "Pet Cremation (if available)")
  // with no/garbage categoryId — drop those so no bogus card is shown.
  if (block.type === "quote_options") {
    const id = block.data.categoryId;
    const cat = block.data.category;
    if (typeof id !== "string" || !UUID_RE.test(id.trim())) return false;
    if (typeof cat !== "string" || cat.trim().length === 0) return false;
  }
  // form_fill must name a field key to set on the live quote form.
  if (block.type === "form_fill") {
    const key = block.data.key;
    if (typeof key !== "string" || key.trim().length === 0) return false;
  }
  return true;
}

export async function buildAssistantPrompt(
  role: string,
  categories?: Array<{ id: string; name: string; description: string | null }>,
  userId?: string,
  // PROMPT TRIM: once a service is locked, skip the category-matching reference list
  // (the catalog block already names the locked service) to shrink the prompt mid-flow.
  categoryLocked = false,
): Promise<string> {
  const base = buildSystemPrompt(role);
  const settings = await prisma.platformSettings.findMany({
    where: {
      key: {
        in: [
          "chat_assistant_prompt",
          "chat_assistant_tone",
          "chat_service_keywords",
          "budget_ranges",
          "chat_history_limit",
          "chat_banned_words",
        ],
      },
    },
    select: { key: true, value: true },
  });
  const byKey = new Map(
    settings.map((s) => [s.key, s.value as Record<string, unknown>]),
  );

  const customPrompt = byKey.get("chat_assistant_prompt") as unknown as
    | string
    | undefined;
  const tone =
    (byKey.get("chat_assistant_tone") as unknown as string) || "friendly";
  const keywords = byKey.get("chat_service_keywords") as
    | Record<string, { keywords: string[]; description: string }>
    | undefined;
  const budgetRanges = byKey.get("budget_ranges") as
    | { ranges: unknown }
    | undefined;

  const toneGuide: Record<string, string> = {
    friendly:
      "Be warm, friendly, and approachable. Use casual language and emojis sparingly.",
    professional:
      "Be professional, clear, and concise. Use formal but not stiff language.",
    casual: "Be super casual and relaxed. Short responses, minimal formality.",
  };

  const bannedWords = byKey.get("chat_banned_words") as string[] | undefined;

  let extra = `\n\nTone: ${toneGuide[tone] || toneGuide.friendly}`;
  extra +=
    '\nPunctuation style: write in plain, complete sentences with ordinary punctuation. Do NOT use dashes or em-dashes (-, –, —) to join clauses, set off an aside, or replace a comma. Use a comma, a full stop, or a joining word like "and", "so", or "because" instead. Never write the "X — Y" aside structure. This makes you sound more natural and human, less like a template.';
  extra +=
    "\nLanguage: ALWAYS reply in the SAME language the user is currently writing in. If they write in Malay, reply in Malay; in Chinese, reply in Chinese; in Tamil, reply in Tamil; in English, English; if they mix languages (rojak), mirror that mix. Match their language every turn, switching if they switch. Service names from the catalog stay in their original form. Never silently answer in English when the user wrote in another language.";

  // CRITICAL: Flow instructions come FIRST — right after tone, before any reference data
  if (role === "guest" || role === "customer") {
    const todayKL = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
    });
    const weekdayKL = new Date().toLocaleDateString("en-US", {
      timeZone: "Asia/Kuala_Lumpur",
      weekday: "long",
    });

    extra += "\n\n!!!!! YOU MUST EMIT ACTION BLOCKS — THIS IS THE #1 RULE !!!!!";
    extra +=
      "\nWithout [action:...] blocks the user sees ONLY TEXT and CANNOT pick dates, times, or fill forms. The tag IS the card.";
    extra +=
      "\nIf you name a service, ask for a date, ask a question, or confirm a booking — you MUST emit [action:quote_options], [action:quote_field], [action:quote_question], or [action:quote_prefill] in THAT SAME MESSAGE. Saying \"tap Yes on the card\" without the tag is BROKEN.";
    extra +=
      '\nCORRECT: "Roof covers that. [action:quote_options]\ncategory: Roof\ncategoryId: <uuid>[/action]"  WRONG: "Tap the card below to confirm." Never describe a card you did not emit.';

    extra += `\n\nToday is ${weekdayKL}, ${todayKL} (Asia/Kuala_Lumpur). Resolve relative dates ("tonight", "tomorrow", "next Sunday") to a concrete FUTURE date in YYYY-MM-DD.`;
    extra += "\n\n### EXTRACT FIRST — pre-fill what the user already said.";
    extra +=
      '\nBefore asking anything, scan the WHOLE conversation for details the user already gave: date, time of day, budget, name, phone, address. For each one present, emit its [action:quote_field] WITH a "value:" line pre-filled, and NEVER ask for it again.';
    extra +=
      "\nGo through that list ONE BY ONE, in order, and do not skip any — in a long one-line dump it is easy to miss one (the ADDRESS especially). After you think you are done, re-read the user's message and check each field again before moving on.";
    extra +=
      '\ntimeSlot values: morning (9-11), noon (11-13), afternoon (13-15), evening (15-17), night (17-22). "night"/"tonight" => night. preferredDate => YYYY-MM-DD. budgetMax => the number in RM (e.g. "RM600" => 600).';
    extra +=
      '\nExample: user said "catering next sunday night budget RM600" => after the category is confirmed emit: [action:quote_field]key: preferredDate\nvalue: ' +
      todayKL +
      "[/action] [action:quote_field]key: timeSlot\nvalue: night[/action] [action:quote_field]key: budgetMax\nvalue: 600[/action] — using the real resolved Sunday date, not today.";
    extra +=
      '\nCRITICAL: if your TEXT states a specific date or time (e.g. "that would be Tuesday 9 June 2026, night"), you MUST emit that field\'s card WITH the matching value: line (preferredDate value: 2026-06-09, timeSlot value: night). NEVER render an EMPTY date or time picker for a value you just stated in words — an empty card means the user has to re-pick what you already worked out, which is broken. Resolve it and pre-fill it.';

    extra += "\n\n### Step 1: Understand the need. Text only.";
    extra +=
      '\nThe user describes a need, event, or task (e.g. "party tomorrow night", "aircon broke", "house is dirty"). Most are NEEDS or EVENTS, not complaints.';
    extra +=
      '\nDo NOT ask "what problem or issue are you facing". Instead, acknowledge warmly in ONE short sentence, then figure out which service fits.';
    extra +=
      '\nIf the service is obvious from their message, skip straight to Step 2 and suggest that ONE category. If a message could map to SEVERAL services (e.g. a party could need catering, event planning, or cleaning), do NOT guess one and do NOT just list them in text — emit a SEPARATE [action:quote_options] card for EACH likely service (2 to 3 max) in the same reply, with a short lead-in like "A few could fit, pick the one you want:". The user then picks the right card directly instead of rejecting a wrong guess.';
    extra +=
      '\nCRITICAL: if you offered the user a choice between 2+ services (e.g. "catering OR a full Event Planner?") and they reply AMBIGUOUSLY ("yeah", "yes", "sure", "ok", "both") without clearly naming ONE, you MUST emit a card for EVERY option you offered — never pick one for them. A customer who does not know the difference could otherwise be handed the wrong service. When the options are easily confused, add ONE short line explaining the difference (e.g. "Catering just handles the food; an Event Planner coordinates the whole wedding.") so they can choose correctly.';

    extra +=
      "\n\n### Step 2: Suggest category — EMIT [action:quote_options] (one card per candidate service)";
    extra +=
      '\nExample (single): "Let me check. [action:quote_options]category: Electrical\ncategoryId: uuid-here[/action]"';
    extra +=
      '\nExample (several fit): "A few could fit, pick one: [action:quote_options]category: Catering Service\ncategoryId: uuid-1[/action] [action:quote_options]category: Event Planner\ncategoryId: uuid-2[/action]"';
    extra +=
      "\nAfter the user CONFIRMS a category, NEVER emit [action:quote_options] again. Move directly to Step 3.";
    extra +=
      '\nUSE THEIR NAME: the moment the user tells you their name (or you already know it), warmly confirm it once ("Got it, Brian!") and then address them by their first name naturally throughout the chat - a friendly "Sure, Brian" / "Thanks, Brian" here and there, NOT in every single line (that feels robotic). Always write the name capitalised. If the user asks you to stop using their name, stop immediately.';
    extra +=
      "\nThe MOMENT the user confirms a service by ANY means (tapping the card, OR replying yes/yep/correct/that one/sure in text), IMMEDIATELY emit [action:category_lock]categoryId: <the exact categoryId UUID for that service>[/action] in that same reply. This silently records the choice (no visible card) and is REQUIRED for the rest of the flow, especially the service questions, to work. Emit it once, only the real UUID from the catalog.";
    extra +=
      '\nThe card has two buttons: "Yes, that\'s it" (confirm) and "Not this service" (reject). If the user clicks Not this service or otherwise says your guess is wrong, do NOT give up and do NOT send them to the services page. Ask ONE short, friendly question about what they are actually trying to get done (the item, room, event, or problem involved), then suggest a DIFFERENT, better-fitting catalog service with a fresh [action:quote_options]. If they are not sure which service they need, help them narrow it down from their goal. Keep trying to match a real catalog service; only conclude we do not offer it after you have genuinely tried and nothing fits.';
    extra +=
      '\n- AFTER A REJECTION, NEVER LOOP: ask your clarifying question at most ONCE. If the user then re-states the SAME need (e.g. repeats "my house is dirty" / "roof leak") or gives no new distinguishing detail, STOP asking and ACT — emit a fresh [action:quote_options] for the best-fitting catalog service with a ONE-LINE reason it fits (e.g. "Home Cleaning covers exactly that — floors, kitchen, bathrooms, the lot."). The rejected service may well BE the right one; if nothing else fits, re-offer it and explain why. NEVER ask the same clarifying question twice or leave the user stuck repeating themselves in text.';

    extra +=
      "\n\n### Step 3: Date + time — EMIT [action:quote_field] for preferredDate AND timeSlot";
    extra +=
      '\nExample output: "When do you need it? [action:quote_field]key: preferredDate[/action] [action:quote_field]key: timeSlot[/action]"';
    extra +=
      "\nABSOLUTELY NEVER ask date or time in text without these action blocks.";

    extra += "\n\n### Step 4: Address — EMIT [action:quote_field] key=address";
    extra +=
      "\n### Step 5: Budget — EMIT [action:quote_field] key=budgetMax (ask the budget BEFORE contact details)";
    extra +=
      '\n### Step 6: Contact — name and phone are SEPARATE cards (like date + time). EMIT [action:quote_field] key=contactName and key=contactNumber. If the user already gave their name in the chat (e.g. "I\'m Zedd"), emit contactName WITH a value: line to capture it, so only the phone card remains.';
    extra +=
      '\n### Step 7: Service questions — after the base fields, the app supplies the category\'s questionSchema questions and shows a [action:quote_question] card for each, ONE at a time. Open with a short warm lead-in the FIRST time, e.g. "Thanks for confirming your details. Before we proceed, just a few quick questions about the job." Then ask each question CONVERSATIONALLY, weaving its options in as natural examples (broken TV: "What is going on with it? No power? No sound? Lines on the screen? And what kind of TV is it?"). The user can answer in plain words; MAP their answer to the closest option and emit [action:quote_question]key: <questionKey>\\nvalue: <optionValue or their words>[/action] to record it. If they are unsure (e.g. cannot tell the screen type), reassure them, let them pick "I do not know", or help them figure it out. Never invent questions; only the real ones the app provides. Ask optional ones briefly too, the user may skip them.';
    extra += "\n### Step 8: Notes — EMIT [action:quote_field] key=notes";
    extra +=
      "\n### Step 9: Summary — the review CARD (Step 10) lists EVERY field on screen. Do NOT re-list the collected values in text — you will sometimes get them wrong. Just confirm warmly in ONE short line (e.g. \"Great, that's everything — here's your summary, tap to confirm.\") and emit the review.";
    extra +=
      "\n### Step 10: Submit — EMIT [action:quote_prefill] with ALL fields";
    extra +=
      "\nFollow this order: date+time, then address, then budget, then contact, then the service questions. Ask for ONE step at a time and emit its card; never ask a later step before an earlier one.";

    extra += "\n\n### STRICT RULES (obey these or the UI breaks):";
    extra +=
      "\n- NEVER ask date/time/address/name/phone in text alone. ALWAYS emit the [action:quote_field] block.";
    extra +=
      "\n- NEVER state a date, time, address, budget, phone, or name the user did not explicitly give in THIS conversation, and never alter a value they gave. Echo back ONLY the exact value just provided. The review card is the single source of truth for the full summary — do not reproduce, re-list, or 'tidy up' all the fields in prose (that is where wrong/invented values creep in).";
    extra +=
      '\n- CHANGE A COLLECTED FIELD: when the user wants to redo an already-collected detail — even phrased softly ("the address isn\'t right", "I don\'t think the address is good", "change my date") — you MUST RE-EMIT that field\'s [action:quote_field] card (key=address/preferredDate/timeSlot/budgetMax/contactName/contactNumber) so they can re-enter it. NEVER just ask for the new value in text; the card is the only way to capture it.';
    extra +=
      "\n- ONE DETOUR AT A TIME, THEN RESUME: if the user interrupts the booking to change something or ask a quick side question, handle THAT ONE thing first — emit its card or answer in a sentence — and do NOT keep pushing the field you were on until they've dealt with it. Once it's settled, RETURN to where you left off (the app re-shows the next missing detail after each turn, so a brief \"Got it — now back to …\" is enough). Never stack several new questions or abandon the booking over a detour.";
    extra +=
      "\n- Do not repeat the SAME [action:quote_options] suggestion in a loop, and never emit it again once the user has CONFIRMED a category. You MAY emit a fresh [action:quote_options] for a DIFFERENT category if the user rejected your previous suggestion.";
    extra += "\n- NEVER skip steps. Step 3 MUST come before Step 4.";
    extra +=
      '\n- NEVER tell user to "submit a new quote". Collect everything here.';
    extra +=
      '\n- If user says a relative date like "this Sunday", respond with the actual calendar date AND emit the action blocks.';
    extra +=
      '\n- The category value in [action:quote_options] MUST be an EXACT name from the Service Catalog plus its real categoryId (a UUID). NEVER invent a service, never write prose, guesses, or notes like "(if available)" in the category field.';
    extra +=
      "\n- If NO category in the Service Catalog matches what the user needs (FIRST time): say plainly, in one or two warm sentences, that we do not currently offer that service. Emit NO card this turn. Do NOT force a completely unrelated category (e.g. do not suggest Home Cleaning to someone whose pet died) — that reads as a tone-deaf upsell. Gently point to the general services page." +
      "\n- If the user asks AGAIN (2nd+ time) for the same unavailable need: they are clearly interested and want help. STOP refusing. Suggest the SINGLE CLOSEST catalog category — the one whose description or job scope overlaps most genuinely with their stated need — with a HUMBLE one-line reason why it may fit. EMIT its [action:quote_options] card so they can tap it. Example: for \"laundry and ironing\", suggest Home Cleaning (many cleaners also handle laundry/ironing on request). For \"grass cutting\", suggest Renovation (outdoor work). The goal is to give them a REAL path forward, not to upsell tone-deafly or force a random category. Never suggest a category that doesn't overlap at all with their need.";
    extra +=
      '\n- PARTIAL / MIXED / WEIRD requests: real customers ramble, joke, vent, overshare, or say absurd, inappropriate, or off-topic things alongside a genuine need. Stay unflappable and warm — never lecture, moralise, judge, or refuse the whole conversation over the weird parts. Pull out the one real serviceable need and PURSUE IT: if ANY part maps to a catalog service, acknowledge briefly, emit [action:quote_options] for that service, and drive the booking forward. Quietly ignore or lightly set aside anything we do not serve or anything inappropriate; do not repeat it back or explain why it is off-limits. A party, event, gathering, or celebration almost always maps to Catering (sometimes also Cleaning or Decoration) — treat that as a clear sales opportunity, not a reason to back off. Only fall back to "we do not offer that" when NOTHING in the whole message maps to any catalog service.';
    extra +=
      '\n- NAME-MISMATCH GUIDANCE: customers often ask for a service by a name that is not a catalog category but IS covered by one (e.g. "wedding planner" is covered by Event Planner; "movers", "pest control", "handyman" map to the closest real service). If they ask again or seem unsure that we offer it (e.g. "you don\'t have a wedding planner?"), do NOT just silently re-show the same card. GUIDE them: reassure them yes we do, and explain the connection in one short friendly sentence ("Our Event Planner handles weddings and private celebrations like that."), THEN emit the [action:quote_options] for that service. The goal is to teach them which real service covers their need so they feel confident, not to make them guess.';
    extra +=
      '\n- SERVICE DISAMBIGUATION: a plain painting / repainting job (repaint a wall, a room, or the whole place) maps to RENOVATION — that covers the physical paint work. INTERIOR DESIGN is for design, layout, styling, and concept work, NOT a simple repaint. Do NOT offer Interior Design for a "repaint" request unless the user clearly wants design help. More generally: do not ASSUME one service when two could genuinely fit — emit a [action:quote_options] card for EACH candidate and let the user pick, rather than silently choosing one.';
    extra +=
      '\n- SELF-RECOVERY: if you look back and your previous turn slipped (you said you would show a service or card but emitted none, or repeated yourself without progressing), do NOT just repeat the same line. Briefly own it and apologise in a warm human way ("Sorry, that did not come through properly"), clarify what you meant, and THEN emit the correct card or next step. Always move the user forward with a real update, never leave them stuck on the same spot.\n\n- BUTTON CONFUSION: when a user REPEATS their query instead of tapping the card you just sent, they likely do NOT know to press the button. RE-EMIT the card and kindly ask them to tap it. Example: "I just sent you a card for [service name] below — tap the Yes button on that card and we can move forward!" or "Here is the card again, just press that green button to confirm." Never say "I already sent the card" without re-emitting it — that leaves them stuck with no clickable card in their view. If they still repeat after a re-emit, try a DIFFERENT approach: ask ONE warm clarifying question about their exact need, then re-emit the best-fitting card with a new short explanation. Never loop more than twice — after two re-emits without progress, apologise, say you will pass this to a human, and offer to escalate.';
    extra +=
      "\n- When you mention a service in your text, write its EXACT catalog name in plain words with NO bold, NO asterisks, NO markdown. The app automatically turns service names into clickable links, so never format them yourself.";
    extra +=
      '\n- NEVER use markdown anywhere: no bullet lists, no "*" or "-" bullets, no "#" headings, no bold/italics. The chat renders plain text, so markdown shows as ugly raw symbols. When you acknowledge a detail the user JUST gave, echo back only THAT one value in a short phrase (e.g. "Got it, Sunday 14 June."). NEVER re-list all the collected fields in prose — the review card shows the full summary.';
  }

  // --- Reference data below — informative, not action-driving ---

  if (customPrompt) {
    extra += `\n\nCustom instructions: ${customPrompt}`;
  }

  extra += "\n\nAction block reference (supported formats):";
  extra +=
    "\n[action:quote_options] — suggest a category. Include category, categoryId.";
  extra +=
    "\n[action:quote_field] — collect one field. Keys: preferredDate, timeSlot, address, addressNo, propertyType, streetDetails, postcode, contactName, contactNumber, notes, budgetMin, budgetMax.";
  extra +=
    "\n[action:category_lock] — silently lock the confirmed service. Include categoryId (the exact UUID). Emit the moment the user confirms a service by card OR in text. No visible card.";
  extra +=
    "\n[action:quote_question] — record a service-specific answer. Include key (the questionSchema key) and value (the chosen option value or the user's words). The app renders the matching picker.";
  extra +=
    "\n[action:quote_prefill] — all data collected. Include categoryId + all fields.";
  extra += "\n[action:profile_field] — servicer profile field to edit.";
  extra += "\n[action:pin_required] — warn PIN needed.";
  extra += "\n[action:link] — navigation action.";

  if (!categoryLocked && categories && categories.length > 0) {
    extra += "\n\nAvailable service categories:";
    for (const cat of categories) {
      const kw = keywords?.[cat.id];
      const desc = kw?.description || cat.description || "";
      const syns = kw?.keywords?.length
        ? ` (aliases: ${kw.keywords.join(", ")})`
        : "";
      extra += `\n- ${cat.name}${syns}: ${desc}`;
    }
  }

  if (budgetRanges) {
    extra += `\n\nAvailable budget brackets: ${JSON.stringify(budgetRanges)}`;
    extra +=
      "\nBudget guidance: never tell a customer their budget is too low or turn them away over price. Customers just set a budget and servicers reply with their own proposals, so any budget is fine and the servicers decide. If their number is under the lowest bracket, mention the lowest bracket in a friendly way, offer to set it, and keep going with the booking either way. Always move things forward, never dead-end them. Say this naturally in your own words, like a helpful person would, not as a fixed template.";
  }

  if (bannedWords && bannedWords.length > 0) {
    extra += `\n\nBanned words (never use these): ${bannedWords.join(", ")}`;
  }

  if (role === "customer" && userId) {
    try {
      const [userAccount, recentBookings, totalBookingCount, activeQuotes] =
        await Promise.all([
          prisma.user.findUnique({
            where: { id: userId },
            select: {
              name: true,
              contactName: true,
              creditBalance: true,
              customerPoints: { select: { balance: true } },
            },
          }),
          prisma.booking.findMany({
            where: {
              userId,
              status: { in: ["completed", "confirmed", "pending_confirm"] },
            },
            orderBy: { scheduledDate: "desc" },
            take: 3,
            select: {
              id: true,
              status: true,
              scheduledDate: true,
              price: true,
              orderNumber: true,
              createdAt: true,
              quoteRequest: {
                select: { category: { select: { name: true, id: true } } },
              },
              merchant: { select: { businessName: true } },
            },
          }),
          prisma.booking.count({
            where: { userId },
          }),
          prisma.quoteRequest.findMany({
            where: { userId, status: "open" },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              status: true,
              preferredDate: true,
              category: { select: { name: true } },
              proposals: {
                where: { status: "submitted" },
                select: {
                  id: true,
                  proposedPrice: true,
                  merchant: { select: { businessName: true } },
                },
              },
            },
          }),
        ]);

      extra +=
        "\n\n## User Account Context (live data — use to answer account questions accurately)";

      if (userAccount) {
        const fullName = (
          userAccount.name ||
          userAccount.contactName ||
          ""
        ).trim();
        const firstName = fullName.split(/\s+/)[0];
        if (firstName) {
          extra += `\n- Customer name: ${fullName}. This is a LOGGED-IN customer, so you ALREADY KNOW their name — greet them by their first name "${firstName}" warmly at the start (e.g. "Hi ${firstName}!") and use it naturally now and then through the chat, not in every line. Always capitalise it. NEVER ask a logged-in customer for their name, and when collecting contact details, pre-fill contactName with "${fullName}" instead of asking.`;
        }
        const balance = Number(userAccount.creditBalance).toFixed(2);
        const points = userAccount.customerPoints?.balance ?? 0;
        extra += `\n- Credit wallet balance: RM ${balance}`;
        extra += `\n- Loyalty points: ${points} pts`;
      }

      if (recentBookings.length > 0) {
        extra += `\n\n### Recent Bookings (showing last 3 of ${totalBookingCount} total)`;
        for (const b of recentBookings) {
          const cat = b.quoteRequest?.category;
          const date = b.scheduledDate.toISOString().split("T")[0];
          const oid = formatOrderId(b.orderNumber, b.createdAt);
          extra += `\n- ${oid} [${b.status}] ${cat?.name ?? "Unknown"} with ${b.merchant.businessName} on ${date} — RM ${Number(b.price).toFixed(2)}`;
          if (cat) extra += ` (categoryId: ${cat.id})`;
        }
        extra +=
          '\n\nWhen user asks to "rebook" or "book again", identify the correct booking above and emit [action:quote_prefill] with its categoryId. Confirm service + date with the user before submitting.';
        if (totalBookingCount > 3) {
          extra += `\n\nIMPORTANT: You can only see the 3 most recent bookings. The customer has ${totalBookingCount} bookings in total. If they ask about an older booking that is not listed above, tell them: "I can only see your 3 most recent bookings here. To find an older order, head to your [Order History](/customer/history) — every booking shows its Order ID there, and you can use that ID to track or reference it." Do NOT guess or invent details about bookings not shown above.`;
        }
      }

      if (activeQuotes.length > 0) {
        extra += "\n\n### Active Quotes";
        for (const q of activeQuotes) {
          const date = new Date(q.preferredDate).toISOString().split("T")[0];
          const proposalCount = q.proposals.length;
          extra += `\n- [${q.status}] ${q.category.name} on ${date} — ${proposalCount} proposal(s) received`;
          for (const p of q.proposals) {
            extra += `\n  • ${p.merchant.businessName}: RM ${Number(p.proposedPrice).toFixed(2)}`;
          }
        }
      } else {
        extra += "\n- No active quotes currently.";
      }
    } catch {
      /* non-critical */
    }
  }

  extra +=
    '\n\nPrivacy rule: NEVER ask for or accept credit/debit card numbers, CVV, expiry dates, PINs, bank account numbers, or passwords. If the user shares or asks about any of these, respond with: "For your security, I\'m not able to handle card or banking details here. Please use the secure payment page in the app. Never share your card number or PIN with anyone."';

  if (role === "servicer") {
    extra +=
      "\n\nServicer profile: Any edit requires PIN authorization. Warn user upfront with [action:pin_required].";
    extra +=
      "\nHelp configure: bio, service areas, categories, working hours, pricing.";
    extra +=
      "\nRequired: service areas (≥1), ≥1 category with pricing, working hours.";
  }

  return `${base}${extra}`;
}

interface LlmKeyEntry {
  id: string;
  label: string;
  provider: string;
  model: string;
  value: string;
  priority: number;
  isActive: boolean;
  isFallback: boolean;
}

let _llmKeysCache: LlmKeyEntry[] | null = null;
let _llmKeysCacheTime = 0;
const LLM_CACHE_TTL = 60_000;

async function getLlmKeys(): Promise<LlmKeyEntry[]> {
  const now = Date.now();
  if (_llmKeysCache && now - _llmKeysCacheTime < LLM_CACHE_TTL)
    return _llmKeysCache;
  const rows = await prisma.llmApiKey.findMany({
    where: { isActive: true },
    orderBy: { priority: "asc" },
  });
  const keys = rows.map((r) => ({
    id: r.id,
    label: r.label,
    provider: r.provider,
    model: r.model,
    value: configVault.decryptValue(r.encryptedValue, r.iv, r.authTag),
    priority: r.priority,
    isActive: r.isActive,
    isFallback: r.isFallback,
  }));
  _llmKeysCache = keys;
  _llmKeysCacheTime = now;
  return keys;
}

export function invalidateLlmKeyCache(): void {
  _llmKeysCache = null;
}

export async function isAnyLlmConfigured(): Promise<boolean> {
  try {
    const keys = await getLlmKeys();
    return keys.length > 0;
  } catch {
    return false;
  }
}

export function isAiConfigured(): boolean {
  // Synchronous check — relies on previously cached keys.
  return _llmKeysCache !== null && _llmKeysCache.length > 0;
}

// Per-provider request timeout. Without this, a stalled provider connection
// hangs the whole chat for minutes before the chain gives up; the AbortSignal
// makes each call fail fast so tryAiChain can move to the next provider.
const AI_TIMEOUT_MS = 60_000;
// If a provider streams no first token within this window, abort and fail over
// to the next configured LLM. Generous enough to ride out a COLD-START first
// token (e.g. DeepSeek's first request after idle can take ~10-15s, which used to
// time out at 10s and drop the whole reply to the local fallback; the 2nd message
// was warm and worked). Dead/quota'd keys (e.g. a 429'd Gemini) fail INSTANTLY via
// the HTTP error, not this timer, so raising it doesn't slow real failover.
const FIRST_TOKEN_MS = 15_000;

/**
 * Stream an SSE chat completion. Aborts (and throws) if the provider sends no
 * first token within FIRST_TOKEN_MS, so tryAiChain can move to the next LLM
 * fast. After the first token, a longer overall cap applies. Returns the full
 * accumulated text (the client itself is not streamed).
 */
async function streamLlm(
  url: string,
  init: RequestInit,
  extractDelta: (evt: unknown) => string,
  extractFinish: (evt: unknown) => string | undefined,
  extractTokens: (evt: unknown) => number | undefined,
  label: string,
  // Reasoning models (deepseek-v4-*, o-series) stream THINKING (reasoning_content)
  // before any answer (content). Pass an extractor for it so the first-token timer
  // clears on the thinking phase — otherwise the model is mid-reasoning when the
  // 8.8s cap fires and we wrongly abort a working model. Reasoning is NOT added to
  // the answer; only `content` is.
  extractReasoning?: (evt: unknown) => string,
): Promise<{ answer: string; truncated: boolean; tokensUsed: number | null }> {
  const ac = new AbortController();
  let firstTimer: ReturnType<typeof setTimeout> | null = setTimeout(
    () => ac.abort(new Error(`${label} first-token timeout`)),
    FIRST_TOKEN_MS,
  );
  const overallTimer = setTimeout(
    () => ac.abort(new Error(`${label} overall timeout`)),
    AI_TIMEOUT_MS,
  );
  const clearFirst = () => {
    if (firstTimer) {
      clearTimeout(firstTimer);
      firstTimer = null;
    }
  };
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${label} ${res.status}: ${body.slice(0, 200)}`);
    }
    if (!res.body) throw new Error(`${label}: no response body`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let truncated = false;
    let gotFirst = false;
    let tokensUsed: number | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let evt: unknown;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = extractDelta(evt);
        // Any output — content OR reasoning — means the model is alive, so clear the
        // first-token timer. Only `content` accumulates into the answer.
        const reasoning = extractReasoning ? extractReasoning(evt) : "";
        if ((delta || reasoning) && !gotFirst) {
          gotFirst = true;
          clearFirst();
        }
        if (delta) answer += delta;
        const fin = extractFinish(evt);
        if (fin === "length" || fin === "MAX_TOKENS") truncated = true;
        const tok = extractTokens(evt);
        if (typeof tok === "number") tokensUsed = tok;
      }
    }
    return { answer: answer.trim(), truncated, tokensUsed };
  } finally {
    clearFirst();
    clearTimeout(overallTimer);
  }
}

async function callGemini(
  systemPrompt: string,
  message: string,
  history: HistoryMessage[],
  role: string = "customer",
  apiKey?: string,
  model?: string,
  noFallback = false,
): Promise<AiReply> {
  const key = apiKey;
  if (!key) throw new Error("Gemini: no API key provided");
  const modelName = model || "gemini-2.0-flash";
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const h of history) {
    contents.push({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    });
  }
  contents.push({ role: "user", parts: [{ text: message }] });

  const { answer, truncated, tokensUsed } = await streamLlm(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    },
    (evt) => {
      const e = evt as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return (e.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("");
    },
    (evt) =>
      (evt as { candidates?: Array<{ finishReason?: string }> }).candidates?.[0]
        ?.finishReason,
    (evt) =>
      (evt as { usageMetadata?: { totalTokenCount?: number } }).usageMetadata
        ?.totalTokenCount,
    "Gemini",
  );

  return {
    answer: answer || (noFallback ? "" : await localFallback(message, role)),
    tokensUsed,
    truncated,
  };
}

async function callDeepSeek(
  systemPrompt: string,
  message: string,
  history: HistoryMessage[],
  role: string = "customer",
  apiKey?: string,
  model?: string,
  noFallback = false,
): Promise<AiReply> {
  const key = apiKey;
  if (!key) throw new Error("DeepSeek: no API key provided");
  const modelName = model || "deepseek-v4-flash";
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: "user", content: message });

  const { answer, truncated, tokensUsed } = await streamLlm(
    "https://api.deepseek.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        stream: true,
        // deepseek-v4-* are REASONING models: the thinking phase spends output tokens
        // BEFORE any answer. 1024 let a long reasoning eat the whole budget, truncating
        // the actual reply (finish_reason=length) → the chat showed "out of service".
        // Give plenty of headroom (only tokens actually generated are billed).
        max_tokens: 4096,
        stream_options: { include_usage: true },
      }),
    },
    (evt) =>
      (evt as { choices?: Array<{ delta?: { content?: string } }> })
        .choices?.[0]?.delta?.content ?? "",
    (evt) =>
      (evt as { choices?: Array<{ finish_reason?: string }> }).choices?.[0]
        ?.finish_reason ?? undefined,
    (evt) => (evt as { usage?: { total_tokens?: number } }).usage?.total_tokens,
    "DeepSeek",
    // deepseek-v4-* stream reasoning_content (thinking) before the answer content.
    (evt) =>
      (evt as { choices?: Array<{ delta?: { reasoning_content?: string } }> })
        .choices?.[0]?.delta?.reasoning_content ?? "",
  );

  return {
    answer: answer || (noFallback ? "" : await localFallback(message, role)),
    tokensUsed,
    truncated,
  };
}

async function callOpenAi(
  systemPrompt: string,
  message: string,
  history: HistoryMessage[],
  role: string = "customer",
  apiKey: string,
  model?: string,
  noFallback = false,
): Promise<AiReply> {
  const modelName = model || "gpt-4o-mini";
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: "user", content: message });

  const { answer, truncated, tokensUsed } = await streamLlm(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        stream: true,
        max_tokens: 1024,
        stream_options: { include_usage: true },
      }),
    },
    (evt) =>
      (evt as { choices?: Array<{ delta?: { content?: string } }> })
        .choices?.[0]?.delta?.content ?? "",
    (evt) =>
      (evt as { choices?: Array<{ finish_reason?: string }> }).choices?.[0]
        ?.finish_reason ?? undefined,
    (evt) => (evt as { usage?: { total_tokens?: number } }).usage?.total_tokens,
    "OpenAI",
  );

  return {
    answer: answer || (noFallback ? "" : await localFallback(message, role)),
    tokensUsed,
    truncated,
  };
}

const QA_JUDGE_SYSTEM = `You are a strict QA reviewer for a home-services booking chatbot.
You are given a transcript where USER = a simulated customer and BOT = the assistant.
Find LOGICAL and conversational problems a structural checker cannot see, including:
- the bot replied in a DIFFERENT language than the user wrote in (it must match: Malay->Malay, Chinese->Chinese, English->English);
- the bot assumed or invented data the user never gave (e.g. a budget, a name, a date);
- contradictions, or the bot repeating/re-asking something already answered;
- the bot ignored or misunderstood what the user actually said;
- wrong service chosen for the stated need;
- illogical, out-of-order, or broken flow; tone that is rude or robotic;
- OUT-OF-ORDER / non-sequitur guidance: the bot jumps to collecting a detail (address, date,
  time, budget, phone, name) BEFORE a service/need is established. The correct order is:
  understand the need -> confirm the service -> date & time -> address -> budget -> contact ->
  service-specific questions -> review. Flag any abrupt jump, e.g. user says "Hi I'm Josh" and
  the bot replies "give me your address" with no service yet — that is broken flow;
- the bot fails to acknowledge or build on what the user just said (no conversational guidance).
Output ONLY a compact list, one finding per line as: SEVERITY | short location | the problem.
SEVERITY is HIGH, MED, or LOW. If the conversation is genuinely fine, output exactly: OK.
Do not restate the transcript or add commentary.`;

const QA_CONCLUDE_SYSTEM = `You are a QA lead. You are given the per-conversation findings from a batch of
simulated chatbot bookings. Write a SHORT overall conclusion (under 180 words, plain text):
the overall quality, the most common and most serious recurring issues, and the top 3 fixes
to prioritise. Be specific and blunt. No preamble.`;

/**
 * QA judge — evaluate a transcript (or a set of findings) for LOGICAL/conversational
 * problems the deterministic checker can't see. Reuses the chatbot's own LLM failover
 * chain. mode 'run' judges one transcript; mode 'conclude' summarises findings into an
 * overall verdict. Returns 'JUDGE_UNAVAILABLE' when no LLM key is configured.
 */
export async function judgeConversation(
  text: string,
  mode: "run" | "conclude",
): Promise<string> {
  const system = mode === "conclude" ? QA_CONCLUDE_SYSTEM : QA_JUDGE_SYSTEM;
  // QA always uses deepseek-v4-flash when a DeepSeek key is configured — keeps the
  // judge off the quota-limited Gemini keys and consistent across runs. noFallback so
  // an empty reply never becomes the customer-facing localFallback boilerplate.
  try {
    const dsKey = (await getLlmKeys()).find((k) => k.provider === "deepseek");
    if (dsKey) {
      const reply = await callDeepSeek(
        system,
        text,
        [],
        "guest",
        dsKey.value,
        "deepseek-v4-flash",
        true,
      );
      const answer = (reply.answer || "").trim();
      if (answer) return answer;
    }
  } catch {
    /* fall through to the generic chain below */
  }
  // Fallback: run the normal chain ourselves (still noFallback) so an empty/failed key
  // moves to the next, then to a clear JUDGE_ERROR.
  const chain = await buildLlmChain(system, text, [], "guest", true);
  if (chain.length === 0) return "JUDGE_UNAVAILABLE: no LLM key configured";
  for (const llm of chain) {
    if (isCoolingDown(llm.id)) continue;
    try {
      const reply = await llm.run();
      const answer = (reply.answer || "").trim();
      if (answer) return answer;
    } catch (e) {
      noteKeyFailure(llm.id, e);
    }
  }
  return "JUDGE_ERROR: no judge reply";
}

// ─── Question-schema auto-translation ──────────────────────────────────────────────
// When an admin saves a category's questionSchema, fill the per-language label
// translations (labelI18n) so the in-chat quote flow can show each question/option in
// the customer's language. Any translation an admin supplied is preserved; only missing
// languages are generated, and stale ones (source `en` changed) are refreshed.

const TRANSLATE_TARGETS: Array<{ code: "ms" | "zh" | "ta"; name: string }> = [
  { code: "ms", name: "Malay (Bahasa Malaysia)" },
  { code: "zh", name: "Simplified Chinese" },
  { code: "ta", name: "Tamil" },
];

/** Extract the first JSON string-array from an LLM reply (tolerating ``` fences). */
function parseJsonStringArray(s: string): string[] | null {
  const m = s.replace(/```json|```/gi, "").match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) && arr.every((x) => typeof x === "string")
      ? (arr as string[])
      : null;
  } catch {
    return null;
  }
}

/**
 * Translate a batch of UI labels to one language via the LLM chain. Returns a same-order
 * array, or [] when no LLM is reachable / the reply can't be parsed — the caller then
 * leaves those labels untranslated (the QA harness flags any that stay in English).
 */
async function translateBatch(
  texts: string[],
  targetLangName: string,
): Promise<string[]> {
  if (!texts.length) return [];
  const system =
    `You are a professional UI-string translator for a home-services booking app. ` +
    `Translate each English label in the JSON array to ${targetLangName}. Keep them short and ` +
    `natural for a chat UI. Preserve emojis, numbers, and RM amounts; do not add commentary. ` +
    `Return ONLY a JSON array of translated strings, the same length and order as the input.`;
  const message = JSON.stringify(texts);
  const chain = await buildLlmChain(system, message, [], "guest", true);
  if (chain.length === 0) return [];
  for (const llm of chain) {
    if (isCoolingDown(llm.id)) continue;
    try {
      const reply = await llm.run();
      const parsed = parseJsonStringArray((reply.answer || "").trim());
      if (parsed && parsed.length === texts.length) return parsed;
    } catch (e) {
      noteKeyFailure(llm.id, e);
    }
  }
  return [];
}

/**
 * Fill missing/stale ms/zh/ta translations across a question schema's labels, option
 * labels and descriptions, preserving any admin-provided values. Returns a new schema;
 * if the LLM is unavailable the schema is returned with whatever was already present.
 */
export async function autoTranslateQuestionSchema(
  schema: QuestionItem[],
): Promise<QuestionItem[]> {
  const out: QuestionItem[] = JSON.parse(JSON.stringify(schema ?? []));

  // Every translatable slot points at a live i18n object inside `out`. A slot whose
  // stored `en` marker no longer matches its source text is reset to {en: source} so the
  // edited text gets re-translated; otherwise existing languages are kept.
  const slots: Array<{ base: string; i18n: Localized }> = [];
  const addSlot = (
    base: string | undefined,
    get: () => Localized | undefined,
    put: (v: Localized) => void,
  ) => {
    if (!base) return;
    let i18n = get();
    if (!i18n || i18n.en !== base) i18n = { en: base };
    put(i18n);
    slots.push({ base, i18n });
  };

  for (const q of out) {
    addSlot(
      q.label,
      () => q.labelI18n,
      (v) => {
        q.labelI18n = v;
      },
    );
    addSlot(
      q.description,
      () => q.descriptionI18n,
      (v) => {
        q.descriptionI18n = v;
      },
    );
    for (const o of q.options ?? []) {
      addSlot(
        o.label,
        () => o.labelI18n,
        (v) => {
          o.labelI18n = v;
        },
      );
    }
  }
  if (!slots.length) return out;

  for (const { code, name } of TRANSLATE_TARGETS) {
    const missing = slots.filter((s) => !s.i18n[code]);
    if (!missing.length) continue;
    const uniqueBases = [...new Set(missing.map((s) => s.base))];
    const translated = await translateBatch(uniqueBases, name);
    if (translated.length !== uniqueBases.length) continue; // LLM down — leave untranslated
    const map = new Map(uniqueBases.map((b, i) => [b, translated[i]]));
    for (const s of missing) {
      const t = map.get(s.base);
      if (t) s.i18n[code] = t;
    }
  }
  return out;
}

async function callByProvider(
  provider: string,
  apiKey: string,
  systemPrompt: string,
  message: string,
  history: HistoryMessage[],
  role: string,
  model?: string,
  noFallback = false,
): Promise<AiReply> {
  switch (provider) {
    case "gemini":
      return callGemini(
        systemPrompt,
        message,
        history,
        role,
        apiKey,
        model,
        noFallback,
      );
    case "deepseek":
      return callDeepSeek(
        systemPrompt,
        message,
        history,
        role,
        apiKey,
        model,
        noFallback,
      );
    case "openai":
    case "generic":
      return callOpenAi(
        systemPrompt,
        message,
        history,
        role,
        apiKey,
        model,
        noFallback,
      );
    default:
      return callOpenAi(
        systemPrompt,
        message,
        history,
        role,
        apiKey,
        model,
        noFallback,
      );
  }
}

// 429 cooldown: once a key is rate-limited/quota-exhausted, skip it for a while
// instead of pinging it every message (wastes latency + hammers a burst-limited
// key). Keyed by a stable id (env:gemini, env:deepseek, or the admin key id).
const _keyCooldownUntil = new Map<string, number>();
const KEY_COOLDOWN_MS = 60_000;

function isCoolingDown(id: string): boolean {
  const until = _keyCooldownUntil.get(id);
  return until != null && until > Date.now();
}

function noteKeyFailure(id: string, err: unknown): void {
  const msg = (err as Error)?.message ?? "";
  if (/\b429\b/.test(msg) || /quota|rate.?limit|too many requests/i.test(msg)) {
    _keyCooldownUntil.set(id, Date.now() + KEY_COOLDOWN_MS);
  }
}

/** One attempt in the failover chain — a named LLM the chain can try in order. */
interface LlmAttempt {
  id: string; // stable id for cooldown tracking
  label: string; // for logs
  run: () => Promise<AiReply>;
}

/**
 * Build the ordered list of LLMs to try from the admin-configured DB keys
 * (priority order, fallback key last). The chain treats them all the same —
 * it does not care which vendor each one is.
 */
async function buildLlmChain(
  systemPrompt: string,
  message: string,
  history: HistoryMessage[],
  role: string,
  noFallback = false,
): Promise<LlmAttempt[]> {
  const attempts: LlmAttempt[] = [];

  let llmKeys: LlmKeyEntry[] = [];
  try {
    llmKeys = await getLlmKeys();
  } catch {
    /* DB unavailable */
  }
  const ordered = [
    ...llmKeys.filter((k) => !k.isFallback),
    ...llmKeys.filter((k) => k.isFallback),
  ];
  for (const k of ordered) {
    attempts.push({
      id: k.id,
      label: `${k.label} (${k.provider}${k.model ? ", " + k.model : ""})`,
      run: () =>
        callByProvider(
          k.provider,
          k.value,
          systemPrompt,
          message,
          history,
          role,
          k.model,
          noFallback,
        ),
    });
  }

  return attempts;
}

// Total time the user waits (typing animation) before we give up and show the
// local fallback. Each LLM gets ONE cold-start attempt (up to FIRST_TOKEN_MS); we
// rotate through the whole chain and keep re-rotating cold (non-quota) LLMs until
// one answers or this budget runs out.
const TOTAL_BUDGET_MS = 60_000;

async function tryAiChain(
  systemPrompt: string,
  message: string,
  history: HistoryMessage[],
  role: string,
): Promise<AiReply> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastErr: unknown;

  // Rotate through the LLMs; if all cold-time-out (no quota cooldown) and we still
  // have budget, rotate again — a backup that was cold on the first pass is warm on
  // the next, so the retry lands without making the user wait on one slow provider.
  while (Date.now() < deadline) {
    const chain = await buildLlmChain(systemPrompt, message, history, role);
    let triedAny = false;
    for (const llm of chain) {
      if (isCoolingDown(llm.id)) continue;
      if (Date.now() >= deadline) break;
      triedAny = true;
      try {
        logger.info(`Trying ${llm.label}`);
        return await llm.run(); // one cold-start attempt per LLM
      } catch (e) {
        lastErr = e;
        noteKeyFailure(llm.id, e);
        logger.warn(`${llm.label} failed, trying next`, {
          error: (e as Error).message,
        });
      }
    }
    // No LLM was even tried (all cooling down / none configured) — stop, don't spin.
    if (!triedAny) break;
  }

  // Budget exhausted or nothing available — throw to trigger the local fallback.
  throw lastErr instanceof Error
    ? lastErr
    : new Error("No AI provider available");
}

/**
 * Admin-facing LLM failure diagnostic. When the AI chain fails for an ADMIN, surface
 * the REAL cause (quota / auth / misconfig / no key) and point them at the API Keys
 * setting, instead of giving the customer-style fallback. Lets the admin fix the LLM
 * setup directly. Plain text, no em-dashes (returned without dash normalisation).
 */
function adminLlmDiagnostic(err: unknown): string {
  const msg = ((err as Error)?.message ?? "").toLowerCase();
  if (/\b429\b|quota|rate.?limit|too many requests|exhaust/.test(msg)) {
    return "Admin notice: the AI provider returned 429, so the API key's token quota or rate limit is exhausted. Top up or rotate the key in Admin, API Keys, then try again. Until then customers fall back to the local responder.";
  }
  if (
    /\b401\b|\b403\b|unauthorized|forbidden|invalid|permission denied|api key/.test(
      msg,
    )
  ) {
    return "Admin notice: the AI provider rejected the key (401/403), so it is missing, invalid, or lacks access. Re-enter a valid API key in Admin, API Keys and save, then try again.";
  }
  if (/\b404\b|not found|model|endpoint/.test(msg)) {
    return "Admin notice: the AI provider returned 404, so the model or endpoint is misconfigured. Check the provider and model name in Admin, API Keys and set it up again.";
  }
  return "Admin notice: no working AI provider is available. No API key is configured, or every configured key is failing. Add or fix a key in Admin, API Keys, then try again. Until then the chat uses the local fallback responder.";
}

function buildBannedWordsReplacer(
  bannedWords: string[],
): (text: string) => string {
  if (bannedWords.length === 0) return (t: string) => t;
  const escaped = bannedWords.map((w) =>
    w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const pattern = new RegExp(escaped.join("|"), "gi");
  return (text: string) => text.replace(pattern, "***");
}

/**
 * Replace em-dash / en-dash / horizontal-bar (— – ―) with a spaced hyphen.
 * Models lean on em-dashes heavily; banning via prompt is advisory and ignored,
 * so we normalise deterministically here. "party—nice" / "party — nice" both
 * become "party - nice"; ranges like "9:00–11:00" become "9:00 - 11:00".
 */
function normalizeDashes(text: string): string {
  // No-dash style: turn em/en dashes AND " - " clause-joins into commas, so the
  // assistant reads as natural sentences instead of dash-spliced fragments.
  // (Hyphenated words like "follow-up" have no surrounding spaces and are untouched.)
  return text.replace(/\s*[—–―]\s*/g, ", ").replace(/ - /g, ", ");
}

/**
 * Hard backstop for the "no markdown" style: the chat renders plain text, so any
 * markdown the model slips through shows as ugly raw symbols (e.g. "* Date: ...").
 * Strip leading bullet markers, bold/italic asterisks, and headings.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/^[ \t]*[*+•]\s+/gm, "") // "* " / "+ " / "• " bullets at line start
    .replace(/^[ \t]*-\s+/gm, "") // "- " bullets at line start
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold**
    .replace(/^#{1,6}\s+/gm, ""); // # headings
}

/**
 * Wrap any catalog service name appearing in plain text with a markdown link to
 * the quote form for that category. The model writes plain names; we add the
 * links deterministically so they always point to the right category id and we
 * never depend on the model formatting URLs correctly. Also unwraps any **bold**
 * the model put around the name. Longest names first so "Catering Service" wins
 * over "Catering"; per-name single replacement; skips names already inside a link.
 */
function linkifyServices(
  text: string,
  services: Array<{ id: string; name: string }>,
  roleBase: string,
): string {
  if (services.length === 0) return text;
  const sorted = [...services]
    .filter((s) => s.name && s.name.trim().length >= 4)
    .sort((a, b) => b.name.length - a.name.length);
  let out = text;
  for (const s of sorted) {
    const esc = s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // optional **bold** wrap; not preceded by '[' or word char; not the label of an existing link
    const re = new RegExp(`(?<![\\[\\w])\\*{0,2}${esc}\\*{0,2}(?!\\]\\()`, "i");
    out = out.replace(
      re,
      `[${s.name}](${roleBase}/quote/new?category=${s.id})`,
    );
  }
  return out;
}

/**
 * Deterministic date + time-of-day extraction. The model frequently STATES a
 * resolved date in its reply ("26 December 2026") but emits an empty date picker,
 * forcing the user to re-pick. We parse the date out of the text ourselves so the
 * card can be pre-filled regardless of what the model emitted. Time-of-day maps to
 * one of the 5 slots.
 */
function parseDateTimeFromText(text: string): { date?: string; slot?: string } {
  const out: { date?: string; slot?: string } = {};
  try {
    const results = chrono.parse(text, undefined, { forwardDate: true });
    if (results.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const specific = results.filter(
        (r) =>
          r.start.isCertain("day") &&
          r.start.isCertain("month") &&
          r.start.isCertain("year") &&
          r.start.date().getTime() >= today.getTime(),
      );
      const chosen =
        specific.length > 0 ? specific[specific.length - 1] : results[0];
      const d = chosen.start.date();
      if (!Number.isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        out.date = `${y}-${m}-${day}`;
      }
    }
  } catch {
    /* parsing is best-effort */
  }
  const t = text.toLowerCase();
  if (/\b(night|tonight|midnight)\b/.test(t)) out.slot = "night";
  else if (/\bevening\b/.test(t)) out.slot = "evening";
  else if (/\bafternoon\b/.test(t)) out.slot = "afternoon";
  else if (/\b(noon|midday|lunch)\b/.test(t)) out.slot = "noon";
  else if (/\bmorning\b/.test(t)) out.slot = "morning";
  return out;
}

// DISABLED & REMOVED — free-text name extraction (extractName + NON_NAME_WORDS) was too aggressive.
// It captured false positives like "From" from "I'm from KL" and caused
// returning-guest greetings to display hallucinated names ("Hello there, is this From?").
// Names are now ONLY captured from the explicit contact-name form card where the
// user types and confirms. No regex or LLM guessing.

/**
 * Extract a phone number the user typed in reply to "what's your phone number?".
 * Assumes a Malaysian number (+60) when no country code is given — drops a leading
 * 0 and prepends +60. Returns a full E.164-ish string or undefined. Only called
 * while the phone card is showing, so a bare number run is safely the phone.
 */
function extractPhone(message: string): string | undefined {
  // Strip date-shaped tokens FIRST so "2026-06-19" / "19/06/2026" are never read as a
  // phone number — the old loose match grabbed the booking date and falsely filled
  // contactNumber, which skipped the phone card and looped the assistant.
  const cleaned = message
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g, " ");
  // Phone-plausible digit run only (9–17 chars incl. separators); a 4-digit year or a
  // 5-digit postcode can't match.
  const m = cleaned.match(/(\+?\d[\d\s\-()]{7,15}\d)/);
  if (!m) return undefined;
  const raw = m[1].replace(/[\s\-()]/g, "");
  if (raw.startsWith("+")) {
    return /^\+\d{9,15}$/.test(raw) ? raw : undefined;
  }
  const local = raw.replace(/^(?:60|0)+/, "");
  if (local.length < 8 || local.length > 11) return undefined;
  return `+60${local}`;
}

/**
 * Extract a budget amount (RM) the user stated, so the budget slider can pre-select
 * the matching bracket instead of defaulting to the lowest. Matches "RM999", "999
 * budget", "budget of 1000", "around 1500". Returns the first plausible amount.
 */
function extractBudget(text: string): number | undefined {
  const m = text.match(
    /(?:rm|myr|\$)\s*([0-9][0-9,]{0,7})|([0-9][0-9,]{1,7})\s*(?:budget|ringgit|bucks)|budget(?:\s+(?:of|is|around|about|approx\.?|~))?\s*(?:rm|myr|\$)?\s*([0-9][0-9,]{0,7})/i,
  );
  if (!m) return undefined;
  const raw = (m[1] ?? m[2] ?? m[3] ?? "").replace(/,/g, "");
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 10 && n <= 10_000_000 ? n : undefined;
}

/**
 * Extract a Malaysian street address the user gave (the LLM sometimes skips it
 * while parsing a one-line dump). Anchors on a street keyword (Jalan/No./Lorong/
 * Taman...) running up to the 5-digit postcode, so "Jalan Tempua 5 No.18, 47100"
 * is captured without grabbing the name/phone that follow it.
 */
function extractAddress(text: string): string | undefined {
  const m = text.match(
    /((?:no\.?\s*\d+[a-z]?|jalan|jln|lorong|lrg|persiaran|lebuh|lengkok|taman|tmn|kampung|kg|seksyen|block|blok)\b[^\n]*?\b\d{5})\b/i,
  );
  if (!m) return undefined;
  const addr = m[1]
    .replace(/\s{2,}/g, " ")
    .replace(/[,\s]+$/, "")
    .trim();
  return addr.length >= 8 ? addr : undefined;
}

/**
 * Match a bare answer the user typed against a pending service question, so an
 * answer given in text (e.g. "50" for an attendees question) is captured and the
 * question is never re-asked. Only the unambiguous types: number/quantity (a
 * bare-ish number) and radio (a matched option). Free text + checkbox are left to
 * the model so we never capture an unrelated message as the answer.
 */
function matchQuestionAnswer(
  q: { type: string; options?: Array<{ value: string; label: string }> },
  message: string,
): string | undefined {
  const text = message.trim();
  if (!text || text.length > 40) return undefined;
  if (q.type === "number" || q.type === "quantity") {
    const m = text.match(/^\D{0,8}(\d{1,7})\D{0,8}$/);
    return m ? m[1] : undefined;
  }
  if (q.type === "radio" && q.options?.length) {
    const lower = text.toLowerCase();
    const hit = q.options.find(
      (o) =>
        lower === o.value.toLowerCase() ||
        lower === o.label.toLowerCase() ||
        lower.includes(o.label.toLowerCase()),
    );
    return hit ? hit.value : undefined;
  }
  return undefined;
}

/**
 * Once a category is confirmed, the quote flow must keep advancing. The model
 * frequently stalls — it re-emits a quote_options card (which we strip) or just
 * says "let me check..." with no action block, leaving the user stuck with no
 * next control. Given the fields already collected (sent by the client), return
 * the action block(s) for the next step so the flow never dead-ends.
 */
function nextStepBlocks(collected: string[]): ActionBlock[] {
  const has = (k: string) => collected.includes(k);
  if (!has("preferredDate") || !has("timeSlot")) {
    return [
      { type: "quote_field", data: { key: "preferredDate" } },
      { type: "quote_field", data: { key: "timeSlot" } },
    ];
  }
  if (!has("address")) {
    const addrBlocks: ActionBlock[] = [
      { type: "quote_field", data: { key: "address" } },
    ];
    if (!has("propertyType"))
      addrBlocks.push({ type: "quote_field", data: { key: "propertyType" } });
    return addrBlocks;
  }
  // Budget BEFORE contact — it reads more naturally (know the budget, then take
  // contact details last) and matches the order the model narrates, so the card
  // shown lines up with the question the assistant asks.
  if (!has("budgetMax"))
    return [{ type: "quote_field", data: { key: "budgetMax" } }];
  if (!has("contactName") || !has("contactNumber")) {
    // Name and phone are SEPARATE cards (like date + time): emit whichever is
    // still missing, so a name already given in text leaves only the phone card.
    const blocks: ActionBlock[] = [];
    if (!has("contactName"))
      blocks.push({ type: "quote_field", data: { key: "contactName" } });
    if (!has("contactNumber"))
      blocks.push({ type: "quote_field", data: { key: "contactNumber" } });
    return blocks;
  }
  return [{ type: "quote_prefill", data: {} }];
}

function processReply(
  answer: string,
  bannedWords?: string[],
): { text: string; actionBlocks: ActionBlock[] } {
  const allBlocks = parseActionBlocks(answer);
  const validBlocks = allBlocks.filter(validateActionBlock);
  let text = stripMarkdown(normalizeDashes(stripActionBlocks(answer)));
  if (bannedWords && bannedWords.length > 0) {
    const replacer = buildBannedWordsReplacer(bannedWords);
    text = replacer(text);
  }
  return { text: text.trim(), actionBlocks: validBlocks };
}

export async function sendToAi(
  message: string,
  history: HistoryMessage[],
  role: string = "customer",
  userId?: string,
  opts?: {
    suppressCategorySuggest?: boolean;
    collected?: string[];
    categoryId?: string;
    answeredQuestions?: string[];
    /** Client-detected conversation language to pin replies to (see chat-widget). */
    lang?: "en" | "ms" | "zh" | "ta" | "rojak";
    /** Exact confirmed field values (key -> value) so the model recaps real data,
     *  never invented. From the client's prefill — see chat-widget collectedValues(). */
    collectedData?: Record<string, string>;
    formAssist?: boolean;
    formContext?: {
      step: number;
      stepName: string;
      categoryName?: string;
      filled: string[];
      missing: string[];
    };
  },
): Promise<AiReply> {
  // Drop automated "Admin notice:" diagnostics from the history fed to the LLM. They
  // are persisted in the thread (so the admin sees them) but are NOT conversation — if
  // left in, the model copies them verbatim on the next turn even after the key is set.
  history = history.filter(
    (h) => !(h.role === "assistant" && h.content.startsWith("Admin notice:")),
  );

  // Load banned words for server-side filtering (safety net)
  let bannedWords: string[] = [];
  try {
    const bw = await prisma.platformSettings.findUnique({
      where: { key: "chat_banned_words" },
    });
    if (bw && Array.isArray(bw.value)) bannedWords = bw.value as string[];
  } catch {
    /* non-critical */
  }
  const replacer = buildBannedWordsReplacer(bannedWords);

  if (message.toLowerCase().includes(MAGIC_WORD)) {
    const answer = replacer(await localFallback(message, role));
    return { answer, tokensUsed: null };
  }

  let categories:
    | Array<{ id: string; name: string; description: string | null }>
    | undefined;
  try {
    const cats = await prisma.category.findMany({
      where: { deletedAt: null, parentCategoryId: null, published: true },
      select: { id: true, name: true, slug: true },
    });
    categories = cats.map((c) => ({
      id: c.id,
      name: c.name,
      description: null,
    }));
  } catch {
    // Categories are non-critical — fall back to basic prompt
  }

  // Dynamic Category catalog: inject all published children with questionSchema,
  // description, pricing, and procedure so the AI can answer service-specific
  // questions without manual per-category FAQ entries.
  let categoryCatalog = "";
  try {
    const children = await prisma.category.findMany({
      where: {
        deletedAt: null,
        parentCategoryId: { not: null },
        published: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        defaultPriceSuggestion: true,
        defaultEstimatedDurationMinutes: true,
        questionSchema: true,
        procedure: true,
        parent: { select: { name: true, slug: true } },
      },
      orderBy: [{ parent: { name: "asc" } }, { name: "asc" }],
    });
    if (children.length > 0) {
      // PROMPT TRIM: once a service is locked, the bot is collecting fields / asking the
      // locked category's (deterministically-injected) questions — it does NOT need every
      // category's description, question-schema and procedure. Send a COMPACT catalog
      // (names + ids only, so a service switch is still possible) and skip the heavy
      // per-category detail. This roughly halves the prompt on the common in-flow path,
      // cutting the reasoning model's latency.
      const catLocked = !!opts?.categoryId;
      categoryCatalog = "\n\n## Service Catalog\n";
      categoryCatalog += catLocked
        ? "A service is already chosen. Names + ids only (use these only if the user switches service).\n"
        : "Each child category is the actual quotable service. Parents are for browse grouping.\n";
      // Group by parent
      const byParent = new Map<string, typeof children>();
      for (const c of children) {
        const parentName = c.parent?.name ?? "Other";
        const list = byParent.get(parentName) ?? [];
        list.push(c);
        byParent.set(parentName, list);
      }
      for (const [parent, subs] of byParent) {
        categoryCatalog += `\n### ${parent}`;
        for (const c of subs) {
          categoryCatalog += `\n- **${c.name}** (id: \`${c.id}\`, slug: \`${c.slug}\`)`;
          if (catLocked) continue; // compact: skip description/price/Asks/Steps once locked
          if (c.description) categoryCatalog += ` — ${c.description}`;
          if (c.defaultPriceSuggestion) {
            const price = Number(c.defaultPriceSuggestion);
            if (!isNaN(price)) categoryCatalog += ` | from ~RM ${price}`;
          }
          if (c.defaultEstimatedDurationMinutes) {
            categoryCatalog += ` | ~${c.defaultEstimatedDurationMinutes} min`;
          }
          // Format questionSchema into readable summary
          const qs = c.questionSchema as
            | Array<{
                label?: string;
                type?: string;
                active?: boolean;
                options?: Array<{ label?: string; active?: boolean }>;
              }>
            | undefined;
          if (qs && Array.isArray(qs) && qs.length > 0) {
            const activeQs = qs.filter((q) => q.active !== false);
            if (activeQs.length > 0) {
              categoryCatalog += " | Asks: ";
              const parts = activeQs.map((q) => {
                let p = q.label ?? "(unnamed)";
                if (q.options && q.options.length > 0) {
                  const opts = q.options.filter((o) => o.active !== false);
                  if (opts.length <= 6) {
                    p += ` [${opts.map((o) => o.label ?? o).join(", ")}]`;
                  } else {
                    p += ` [${opts.length} choices]`;
                  }
                }
                return p;
              });
              categoryCatalog += parts.join("; ");
            }
          }
          if (c.procedure) {
            const proc =
              typeof c.procedure === "string" ? c.procedure.slice(0, 200) : "";
            if (proc) categoryCatalog += `\n  Steps: ${proc}`;
          }
        }
      }
    }
  } catch {
    /* non-critical — fall back to basic prompt */
  }

  let systemPrompt =
    (await buildAssistantPrompt(role, categories, userId, !!opts?.categoryId)) +
    categoryCatalog;

  // Pin the reply language to the client-detected conversation language. This OVERRIDES
  // the generic per-turn matching: card confirmations send templated English ("My budget
  // is RM150"), which must NOT flip the bot to English. Without this the reply language
  // flip-flops mid-flow and the very first turn is guessed (often wrongly).
  if (opts?.lang) {
    const LANG_NAME: Record<string, string> = {
      en: "English",
      ms: "Malay (Bahasa Malaysia)",
      zh: "Chinese",
      ta: "Tamil",
      rojak: "Manglish/rojak (English mixed with Malay particles)",
    };
    const name = LANG_NAME[opts.lang] ?? "English";
    systemPrompt +=
      `\n\n## REPLY LANGUAGE (STRICT — overrides all other language guidance)` +
      `\nThe customer is conversing in ${name}. Reply ONLY in ${name} for this and every following turn.` +
      `\nForm-style confirmations like "My budget is RM150", "My preferred date is 2026-06-20", or "Yes, let's proceed with X" are UI BUTTON CLICKS, not a language switch — keep replying in ${name} regardless of their wording.` +
      (opts.lang === "rojak" ? ` Mirror the English-Malay rojak mix.` : ``) +
      `\nService names from the catalog stay in their original form.`;
  }

  // Form-assist mode: the user is filling the real /quote/new form. Guide them by
  // the current step and fill fields via [action:form_fill]; do NOT drive the
  // in-chat quote flow (quote_options/quote_field/quote_prefill).
  if (opts?.formAssist && opts.formContext) {
    const c = opts.formContext;
    systemPrompt +=
      `\n\n## FORM ASSIST MODE` +
      `\nThe user is filling the real Request-a-Quote FORM on screen (not an in-chat quote flow).` +
      `\nCurrent step: ${c.stepName} (step ${c.step}). Selected service: ${c.categoryName ?? "none yet"}.` +
      `\nAlready filled: ${c.filled.length ? c.filled.join(", ") : "nothing"}. Still needed this step: ${c.missing.length ? c.missing.join(", ") : "nothing"}.` +
      `\nHelp them with THIS step in 1-3 short sentences. To fill a field for them, emit [action:form_fill]key: <key>\nvalue: <value>[/action].` +
      `\nValid keys: categoryId (a UUID from the catalog), preferredDate (YYYY-MM-DD), timeSlot (morning|noon|afternoon|evening|night), contactName, contactNumber, address, addressNo, propertyType, streetDetails, postcode, notes.` +
      `\nOnly fill a field when the user gave the value. NEVER emit quote_options, quote_field, or quote_prefill in this mode — the on-screen form already has those controls.`;
  } else if (opts?.collected && opts.collected.length > 0) {
    // In-chat quote flow: tell the model which fields the user has ALREADY given
    // (the client tracks these). Without this the model has no memory of the
    // confirmed cards and re-asks for date/time/etc. it already has. The
    // deterministic next-card logic still shows the right next card; this stops
    // the model's TEXT from re-asking and contradicting the on-screen state.
    // Prefer the EXACT confirmed values (so any recap is grounded in real data, never
    // invented). Fall back to friendly field names when the client sent only the keys.
    const valueLabels: Record<string, string> = {
      preferredDate: "Date",
      timeSlot: "Time",
      address: "Address",
      budgetMin: "Budget (min)",
      budgetMax: "Budget (max)",
      contactName: "Name",
      contactNumber: "Phone",
      notes: "Notes",
      propertyType: "Property type",
    };
    const cd = opts.collectedData ?? {};
    const valueLines = opts.collected
      .map((k) => {
        const label = valueLabels[k];
        const v = cd[k];
        return label && typeof v === "string" && v.trim() !== ""
          ? `- ${label}: ${v.trim()}`
          : null;
      })
      .filter((l): l is string => l !== null);

    if (valueLines.length > 0) {
      systemPrompt +=
        `\n\n## CONFIRMED DETAILS — exact values, never alter or invent` +
        `\n${valueLines.join("\n")}` +
        `\nThese are captured and shown on screen. NEVER ask for any of them again. If you reference or recap any, use these EXACT values verbatim — NEVER state a value that is not in this list. The review card shows the full summary, so do NOT re-list these in prose. Acknowledge briefly, then ask ONLY for the next missing detail.`;
    } else {
      const friendly: Record<string, string> = {
        preferredDate: "date",
        timeSlot: "time of day",
        address: "address",
        contactName: "name",
        contactNumber: "phone",
        contact: "name and phone",
        notes: "notes",
        budgetMin: "budget",
        budgetMax: "budget",
      };
      const done = [
        ...new Set(opts.collected.map((k) => friendly[k]).filter(Boolean)),
      ];
      if (done.length > 0) {
        systemPrompt +=
          `\n\n## ALREADY COLLECTED — do not ask again` +
          `\nThe user has already provided: ${done.join(", ")}. These are captured and shown as confirmed on screen. NEVER ask for any of them again and never re-show them as a question. Briefly acknowledge in a few words at most, then ask ONLY for the next missing detail.`;
      }
    }
  }

  // Published child categories (id + name) used to linkify service mentions in
  // the reply text — see linkifyServices.
  let linkServices: Array<{ id: string; name: string }> = [];
  try {
    linkServices = await prisma.category.findMany({
      where: {
        deletedAt: null,
        parentCategoryId: { not: null },
        published: true,
      },
      select: { id: true, name: true },
    });
  } catch {
    /* non-critical — replies just won't be linkified */
  }

  // Load the confirmed category's questionSchema so the in-chat flow can collect
  // service specifics (e.g. "what's wrong with the TV?") after the base fields.
  let categoryQuestions: Array<{
    key: string;
    label: string;
    labelI18n?: Localized;
    type: string;
    required: boolean;
    options?: Array<{ value: string; label: string; labelI18n?: Localized }>;
    description?: string;
    descriptionI18n?: Localized;
  }> = [];
  if (opts?.categoryId) {
    try {
      const cat = await prisma.category.findFirst({
        where: { id: opts.categoryId, deletedAt: null },
        select: { questionSchema: true },
      });
      const qs = cat?.questionSchema as unknown;
      if (Array.isArray(qs)) {
        categoryQuestions = qs
          .filter(
            (
              q,
            ): q is {
              key: string;
              label: string;
              labelI18n?: Localized;
              type: string;
              required?: boolean;
              active?: boolean;
              options?: Array<{
                value: string;
                label: string;
                labelI18n?: Localized;
              }>;
              description?: string;
              descriptionI18n?: Localized;
            } =>
              !!q &&
              typeof q.key === "string" &&
              typeof q.label === "string" &&
              typeof q.type === "string" &&
              q.active !== false,
          )
          .map((q) => ({
            key: q.key,
            label: q.label,
            labelI18n: q.labelI18n,
            type: q.type,
            required: q.required === true,
            options: q.options,
            description: q.description,
            descriptionI18n: q.descriptionI18n,
          }));
      }
    } catch {
      /* non-critical — questions just won't be asked in chat */
    }
  }

  let raw: AiReply;

  // Priority chain: .env key → DB priority keys → DB fallback key → local
  try {
    raw = await tryAiChain(systemPrompt, message, history, role);
  } catch (e) {
    // Admins get a real setup diagnostic (quota / auth / misconfig / no key) instead
    // of the customer fallback, so they can fix the LLM directly. No quote flow.
    if (role === "admin") {
      return { answer: adminLlmDiagnostic(e), tokensUsed: null };
    }
    raw = { answer: await localFallback(message, role), tokensUsed: null };
  }

  // Per-message token usage — visible in the server console for cost tracking.
  logger.info(
    `[chat] tokens used this message: ${raw.tokensUsed ?? "n/a (local fallback)"} (role=${role})`,
  );

  // Server-side safety net: filter banned words from any AI / fallback response
  raw.answer = replacer(raw.answer);

  // Out-of-tokens: the provider cut the reply off mid-stream (finish_reason=length).
  // A truncated reply is unreliable — it can drop the [/action] close, leave a half
  // sentence, or strand the user. Replace it with a clear out-of-service message and
  // a one-tap button to the quote form so they can still request a service.
  // Only fall back to "out of service" when truncation left NO usable answer (e.g. a
  // reasoning model spent its whole budget thinking and emitted no content). If there IS
  // a real answer, use it — a complete-enough reply beats a dead-end, and the
  // deterministic next-card logic still drives the flow.
  if (raw.truncated && (raw.answer ?? "").trim().length < 2) {
    const quoteHref =
      role === "customer" ? "/customer/quote/new" : "/guest/quote/new";
    return {
      answer:
        "Sorry, the assistant is out of service right now. If you'd like to request a service, tap the button below.",
      tokensUsed: raw.tokensUsed,
      actionBlocks: [
        { type: "link", data: { label: "Request a service", href: quoteHref } },
      ],
    };
  }

  const processed = processReply(raw.answer, bannedWords);

  // Deterministic loop guard: once the user has confirmed a category client-side,
  // drop any further quote_options card the model emits. The "emit ONCE" prompt
  // rule is advisory and the model ignores it, which re-renders the same
  // "Is this the service?" card and lets the user loop forever. Stripping the
  // block here makes the card physically un-repeatable regardless of model output.
  let outBlocks = processed.actionBlocks;
  // Snapshot what the LLM ITSELF emitted (before the server adds/strips cards), so the
  // decision log below shows whether a stuck/duplicated card came from the model or
  // from the deterministic next-step logic.
  const llmEmittedTags = processed.actionBlocks.map(blockTag);

  // category_lock sanity check: the model sometimes hallucinates a wrong UUID
  // (e.g. Interior Design's when the user confirmed Event Planner). Validate the
  // UUID resolves to a category whose name appears in the assistant's reply text.
  // If not, drop the lock AND any quote_question blocks the model emitted for the
  // wrong category in the same reply — better no lock+questions than wrong ones.
  const lockBlock = outBlocks.find((b) => b.type === "category_lock");
  if (lockBlock) {
    const cid =
      typeof lockBlock.data.categoryId === "string"
        ? lockBlock.data.categoryId
        : "";
    if (cid) {
      try {
        const cat = await prisma.category.findFirst({
          where: { id: cid, deletedAt: null },
          select: { id: true, name: true },
        });
        const text = processed.text.toLowerCase();
        if (!cat || !text.includes(cat.name.toLowerCase())) {
          logger.warn(
            "category_lock UUID does not match assistant reply text — dropping",
            {
              cid,
              name: cat?.name ?? "(not found)",
            },
          );
          outBlocks = outBlocks.filter((b) => b !== lockBlock);
          // Also strip any quote_question blocks the model hallucinated for the
          // wrong category — they arrived in the same reply as the bogus lock.
          const validKeys = new Set(categoryQuestions.map((q) => q.key));
          outBlocks = outBlocks.filter(
            (b) =>
              b.type !== "quote_question" ||
              validKeys.has(b.data.key as string),
          );
        } else {
          // Lock is valid — keep everything; no special filtering needed.
        }
      } catch {
        /* DB hiccup — leave the lock alone */
      }
    }
  }

  if (opts?.formAssist) {
    // On the real /quote/new form: the assistant may fill fields (form_fill) but
    // must never render the in-chat quote flow cards.
    outBlocks = outBlocks.filter(
      (b) =>
        b.type !== "quote_options" &&
        b.type !== "quote_field" &&
        b.type !== "quote_prefill",
    );
  } else {
    // Once a category is locked client-side, never re-suggest it.
    if (opts?.suppressCategorySuggest) {
      outBlocks = outBlocks.filter((b) => b.type !== "quote_options");
    }
    // Strip any quote_question whose key is NOT in the category's real questionSchema.
    // The model frequently invents key variants (what_do_you_need vs whatDoYouNeed vs
    // serviceType), and those cards carry no options — so they break answered-tracking
    // (the real key never gets marked answered) and the bot re-asks the same question
    // forever. Only the deterministic injection below (real key + options) should drive
    // question cards.
    const catLocked =
      !!opts?.categoryId || outBlocks.some((b) => b.type === "category_lock");
    if (!catLocked) {
      // No service is locked yet — a service-specific question card is nonsensical here
      // (the model hallucinated it, e.g. a stray "Halal or Non-Halal?" on a resumed chat
      // before any category exists). Drop them all; the flow must pick a category first.
      outBlocks = outBlocks.filter((b) => b.type !== "quote_question");
    } else if (categoryQuestions.length > 0) {
      const validKeys = new Set(categoryQuestions.map((q) => q.key));
      outBlocks = outBlocks.filter(
        (b) =>
          b.type !== "quote_question" || validKeys.has(b.data.key as string),
      );
    }
    // Field-collection safety net. Runs whenever the conversation is collecting
    // quote fields — the client reports collected fields OR this reply emits a
    // field/prefill card. This must NOT be gated on the client `categoryLocked`
    // flag: the user may confirm the category by TYPING ("yep") instead of tapping
    // the card, in which case categoryLocked stays false but the flow is very much
    // underway. Without this the next missing card (e.g. address) is never injected
    // and the flow dead-ends.
    // While the assistant is still offering category cards, we are at the service-
    // SELECTION step, not field collection — never pre-fill date/time or inject the
    // next field card here (it would dump date/time/address before a service is even
    // picked). Field collection only begins once a category is settled.
    // Field collection requires a real category context — NOT merely stale
    // `collected` fields. A guest who finished/abandoned a prior request still
    // carries its date/name/phone in prefillData; without this guard those stale
    // fields would dump as cards in the middle of a brand-new service selection.
    // Valid contexts: category locked client-side, a category_lock emitted THIS
    // reply (the user just text-confirmed "yep"), or the model emitting a field
    // card itself. While category cards are still showing we are selecting, not
    // collecting, so never collect then.
    const stillChoosingCategory = outBlocks.some(
      (b) => b.type === "quote_options",
    );
    const categoryLockedThisReply = outBlocks.some(
      (b) => b.type === "category_lock",
    );
    // A SERVICE must be settled before any field collection. "Settled" = locked
    // client-side (suppressCategorySuggest / categoryId) or text-confirmed THIS reply.
    // The model emitting a stray quote_field/quote_prefill is NOT proof a service was
    // picked: when the user dumps their details up front, the model would emit field/
    // prefill cards and the flow would jump straight to the review, skipping service
    // selection entirely. Requiring a real category context prevents that.
    const hasCategoryContext =
      opts?.suppressCategorySuggest === true ||
      categoryLockedThisReply ||
      !!opts?.categoryId;
    const collectingFields = !stillChoosingCategory && hasCategoryContext;
    if (!collectingFields && !hasCategoryContext) {
      // No service chosen yet — drop any premature field/prefill cards the model
      // emitted so the flow can't dump details or a review before a service is picked.
      outBlocks = outBlocks.filter(
        (b) => b.type !== "quote_field" && b.type !== "quote_prefill",
      );
    }
    if (collectingFields) {
      // Deterministic date/time pre-fill: the model often states a resolved date in
      // its text but emits an empty picker. Parse it ourselves so it never relies on
      // the model (or which LLM answered) emitting the value. ONLY when the USER's
      // own message expresses date/time intent — otherwise an incidental word in the
      // assistant's prose ("how can I help you today?") would wrongly fill a date.
      // Scan ALL the USER's messages (not just this turn) so a date/time given
      // earlier in a one-line dump still triggers the fill even when the current
      // message is just a category confirm ("yes, Event Planner"). Only the user's
      // own words - never the assistant's prose ("how can I help you today?").
      const userConvo = `${history
        .filter((h) => h.role === "user")
        .map((h) => h.content)
        .join("\n")}\n${message}`;
      const userText = userConvo.toLowerCase();
      const hasDateIntent =
        /\b(today|tomorrow|tonight|tmr|tmrw|mon|tues?|wed|thu(rs)?|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?|weekend|next (week|month|year)|[0-3]?\d[-/][01]?\d)\b/i.test(
          userText,
        );
      const hasTimeIntent =
        /\b(morning|noon|midday|afternoon|evening|night|tonight)\b/i.test(
          userText,
        );
      const convoText = history.map((h) => h.content).join("\n");
      const fillField = (key: string, val?: string) => {
        if (!val) return;
        const existing = outBlocks.find(
          (b) => b.type === "quote_field" && b.data.key === key,
        );
        if (existing) {
          if (existing.data.value == null || existing.data.value === "") {
            existing.data.value = val;
          }
        } else {
          outBlocks.push({ type: "quote_field", data: { key, value: val } });
        }
      };
      // Capture EVERY field the user already gave, scanning the WHOLE conversation,
      // and push each as a pre-filled card BEFORE the next step is computed. This is
      // what lets a one-line dump fill all fields at once and advance straight to
      // the questions/review, instead of stalling one field per turn. Each extractor
      // returns undefined when its field isn't present, so partial input still flows
      // normally (only the fields actually given get pre-filled).
      if (hasDateIntent || hasTimeIntent) {
        // Parse the assistant's RESOLVED wording first ("Sunday, 27 December 2026"),
        // then the user's raw phrasing. A vague "last sunday of dec 2026" makes chrono
        // grab the next bare "sunday" (wrong year/month); the assistant's explicit
        // date is unambiguous, so it wins.
        const parsed = parseDateTimeFromText(`${processed.text}\n${userConvo}`);
        if (hasDateIntent) fillField("preferredDate", parsed.date);
        if (hasTimeIntent) fillField("timeSlot", parsed.slot);
      }
      const addrText = `${message}\n${convoText}`;
      fillField("address", extractAddress(addrText));
      // Budget + phone are extracted from the USER's own words only (userConvo), never
      // the assistant's prose. extractBudget on the full transcript grabbed a number
      // from the assistant narrating a bracket ("RM500–1000") and pre-filled budgetMax
      // the user never stated — same false-positive class as the old name extraction.
      const budgetN = extractBudget(userConvo);
      if (budgetN) fillField("budgetMax", String(budgetN));
      // Name is NOT extracted from free-text — it only comes from the explicit
      // contact-name form card where the user types and confirms. Free-text name
      // extraction was too aggressive and captured false positives like "From" from
      // "I'm from KL", producing greetings like "Hello there, is this From?".
      fillField("contactNumber", extractPhone(userConvo));

      // Fields are "done" if the client already collected them OR the model just
      // pre-filled them with a value in this reply.
      const done = new Set(opts?.collected ?? []);
      for (const b of outBlocks) {
        if (b.type === "quote_field") {
          const v = b.data.value;
          const k = b.data.key;
          if (typeof k === "string" && v != null && v !== "") done.add(k);
        }
      }
      const present = new Set(
        outBlocks
          .filter((b) => b.type === "quote_field")
          .map((b) => b.data.key as string),
      );
      const hasPrefill = outBlocks.some((b) => b.type === "quote_prefill");
      // Service-specific questions (the category's questionSchema) are collected
      // AFTER the base fields and BEFORE the final review. A question is answered
      // if the client reports it OR the model just answered it in this reply.
      const answeredQ = new Set(opts?.answeredQuestions ?? []);
      for (const b of outBlocks) {
        if (b.type === "quote_question") {
          const v = b.data.value;
          const k = b.data.key;
          if (typeof k === "string" && v != null && v !== "") answeredQ.add(k);
        }
      }
      const presentQ = new Set(
        outBlocks
          .filter((b) => b.type === "quote_question")
          .map((b) => b.data.key as string),
      );
      let unansweredQ = categoryQuestions.filter((q) => !answeredQ.has(q.key));
      // Capture a bare answer the user typed for the question asked last turn (the
      // first unanswered one), so it's marked answered and not re-asked.
      if (unansweredQ.length > 0) {
        const q = unansweredQ[0];
        const ans = matchQuestionAnswer(q, message);
        if (ans) {
          // Fill the model's existing (empty) card, else push a new filled one — so
          // the answer shows once as confirmed and the question is never re-asked.
          const existing = outBlocks.find(
            (b) => b.type === "quote_question" && b.data.key === q.key,
          );
          if (existing) {
            if (existing.data.value == null || existing.data.value === "")
              existing.data.value = ans;
          } else {
            outBlocks.push({
              type: "quote_question",
              data: {
                key: q.key,
                label: pickI18n(q.label, q.labelI18n, opts?.lang),
                qtype: q.type,
                value: ans,
              },
            });
          }
          answeredQ.add(q.key);
          unansweredQ = categoryQuestions.filter(
            (qq) => !answeredQ.has(qq.key),
          );
        }
      }

      for (const nb of nextStepBlocks([...done])) {
        if (nb.type === "quote_prefill") {
          // Base fields done. Ask the category's questions one at a time before the
          // review; only show the review once every question is answered.
          if (unansweredQ.length > 0) {
            const q = unansweredQ[0];
            if (!presentQ.has(q.key)) {
              outBlocks.push({
                type: "quote_question",
                data: {
                  key: q.key,
                  label: pickI18n(q.label, q.labelI18n, opts?.lang),
                  qtype: q.type,
                  required: q.required,
                  options: (q.options ?? []).map((o) => ({
                    ...o,
                    label: pickI18n(o.label, o.labelI18n, opts?.lang),
                  })),
                  ...(q.description
                    ? {
                        description: pickI18n(
                          q.description,
                          q.descriptionI18n,
                          opts?.lang,
                        ),
                      }
                    : {}),
                },
              });
            }
          } else if (!hasPrefill) {
            outBlocks.push(nb);
          }
        } else if (!present.has(nb.data.key as string)) {
          outBlocks.push(nb);
        }
      }
    }
  }

  // Never REPEAT a card the user already confirmed in a PRIOR turn — show each once.
  // Fields/questions captured THIS turn aren't in collected/answered yet, so they
  // still appear once; from the next turn on they're suppressed. Exception: if the
  // user asks to change something, keep the cards so they can edit.
  {
    const confirmedFields = new Set(opts?.collected ?? []);
    // A field that already holds a VALUE on the client (collectedData) is collected too,
    // even if the user never tapped its card — this stops front-loaded / text-extracted
    // details from being re-shown as cards every turn (the "repeat cards" bug).
    for (const k of Object.keys(opts?.collectedData ?? {}))
      confirmedFields.add(k);
    const answeredQs = new Set(opts?.answeredQuestions ?? []);
    const wantsEdit =
      /\b(change|edit|update|correct|fix|wrong|different|instead|actually|amend|re-?do|re-?enter|modify|mistake|typo)\b/i.test(
        message,
      ) ||
      /\b(not|isn'?t|ain'?t)\s+(right|correct|good|ok|okay)\b/i.test(message) ||
      /\b(bad|incorrect)\s+(address|date|time|budget|name|number|phone)\b/i.test(
        message,
      );
    if (!wantsEdit && (confirmedFields.size || answeredQs.size)) {
      outBlocks = outBlocks.filter((b) => {
        const k = typeof b.data.key === "string" ? b.data.key : "";
        if (b.type === "quote_field" && confirmedFields.has(k)) return false;
        if (b.type === "quote_question" && answeredQs.has(k)) return false;
        return true;
      });
    }
  }

  // Allow several DISTINCT category cards so the user can pick directly when more
  // than one service fits (e.g. a party → Catering OR Event Planner), instead of
  // guessing one and forcing a reject. Dedupe by categoryId and cap at 3 so the
  // reply doesn't flood with cards.
  {
    const seen = new Set<string>();
    let cardCount = 0;
    let kept = outBlocks.filter((b) => {
      if (b.type !== "quote_options") return true;
      const id =
        typeof b.data.categoryId === "string" ? b.data.categoryId.trim() : "";
      if (id && seen.has(id)) return false;
      if (cardCount >= 3) return false;
      if (id) seen.add(id);
      cardCount += 1;
      return true;
    });
    // The model sometimes adds the non-bookable PARENT alongside a child (e.g.
    // "Events" + "Catering Service"). Only when at least one real published child
    // card is present do we drop the non-child (parent) cards — never strip the
    // ONLY card just because its id doesn't match, or the flow dead-ends.
    const childIds = new Set(linkServices.map((s) => s.id));
    if (childIds.size > 0) {
      const hasChildCard = kept.some(
        (b) =>
          b.type === "quote_options" &&
          childIds.has(String(b.data.categoryId ?? "").trim()),
      );
      if (hasChildCard) {
        kept = kept.filter(
          (b) =>
            b.type !== "quote_options" ||
            childIds.has(String(b.data.categoryId ?? "").trim()),
        );
      }
    }
    outBlocks = kept;
  }

  // EDIT a specific collected field: when the user asks to change one — even softly
  // ("the address isn't right", "can I refill my address", "change my date") — re-open
  // ONLY that field this turn: show its card alone and strip the service question +
  // review, so the edit isn't buried under the next deterministically-injected question
  // (a resumed/locked category was otherwise force-injecting its question over the edit).
  // After they re-enter it, the normal next-step logic resumes the unsettled detail.
  if (!opts?.formAssist) {
    const wantsChange =
      /\b(change|edit|update|correct|fix|wrong|different|amend|re-?do|re-?enter|re-?fill|refill|modify|mistake|typo)\b/i.test(
        message,
      ) ||
      /\b(not|isn'?t|ain'?t)\s+(right|correct|good|ok|okay)\b/i.test(message);
    const editField = !wantsChange
      ? null
      : /\baddress\b/i.test(message)
        ? "address"
        : /\b(date|day)\b/i.test(message)
          ? "preferredDate"
          : /\b(time|slot|morning|afternoon|evening|night)\b/i.test(message)
            ? "timeSlot"
            : /\b(budget|price|cost)\b/i.test(message)
              ? "budgetMax"
              : /\bname\b/i.test(message)
                ? "contactName"
                : /\b(phone|number|contact|call)\b/i.test(message)
                  ? "contactNumber"
                  : null;
    if (editField) {
      outBlocks = outBlocks.filter(
        (b) => b.type !== "quote_question" && b.type !== "quote_prefill",
      );
      if (
        !outBlocks.some(
          (b) =>
            b.type === "quote_field" && (b.data.key as string) === editField,
        )
      ) {
        outBlocks.push({ type: "quote_field", data: { key: editField } });
      }
    }
  }

  const roleBase = role === "customer" ? "/customer" : "/guest";
  const answer = linkifyServices(processed.text, linkServices, roleBase);

  // Empty reply = the AI chain failed/timed out (and no FAQ matched) or the model
  // returned only a stripped block. Don't show the bare "How can I help you?" —
  // tell the user clearly and give them a one-tap path to the quote form.
  if (answer.length === 0 && outBlocks.length === 0) {
    return {
      answer:
        "I'm getting a lot of requests right now and couldn't answer that one. You may please tap Try Again or Request a Service directly to get your servicer quote.",
      tokensUsed: raw.tokensUsed,
      actionBlocks: [
        { type: "retry", data: { label: "Try again" } },
        {
          type: "link",
          data: { label: "Request a service", href: `${roleBase}/quote/new` },
        },
      ],
    };
  }

  // Decision log: what the model emitted vs the cards actually sent, plus the flow
  // context. Lets us see WHY a card appeared (model choice vs deterministic next-step)
  // and catch stuck/duplicated cards from the server console. Reply text is logged
  // trimmed so the model's stated reasoning is visible without flooding the log.
  logger.info(
    `[chat] decision lang=${opts?.lang ?? "-"} cat=${opts?.categoryId ? "locked" : "-"} ` +
      `llm_emitted=[${llmEmittedTags.join(", ")}] sent=[${outBlocks.map(blockTag).join(", ")}] ` +
      `collected=[${(opts?.collected ?? []).join(",")}] answeredQ=[${(opts?.answeredQuestions ?? []).join(",")}] ` +
      `reply="${answer.replace(/\s+/g, " ").slice(0, 200)}"`,
  );

  return {
    answer,
    tokensUsed: raw.tokensUsed,
    actionBlocks: outBlocks.length > 0 ? outBlocks : undefined,
  };
}

const MAGIC_WORD = "open sesame";

const MAGIC_RESPONSES: Record<string, string> = {
  guest: "I'm not sure what you mean. Could you rephrase your question?",
  customer:
    "🔓 You're a **Customer**. You can browse services, request quotes, manage bookings, and access your rewards. What would you like help with?",
  servicer:
    "🔓 You're a **Servicer (service provider)**. You receive quote requests, submit proposals, manage your jobs, and run your service business.",
  admin:
    "🔓 Full admin access confirmed. You can manage platform settings, users, penalties, and oversee everything on My Home Servicer.",
};

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "do",
  "does",
  "did",
  "has",
  "have",
  "had",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "she",
  "it",
  "they",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "and",
  "or",
  "but",
  "not",
  "can",
  "will",
  "would",
  "could",
  "should",
  "may",
  "how",
  "what",
  "where",
  "when",
  "why",
  "who",
  "which",
  "about",
  "like",
  "just",
  "want",
  "need",
  "get",
  "know",
]);

function tokenize(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

async function localFallback(
  message: string,
  role: string = "customer",
): Promise<string> {
  const q = message.toLowerCase();
  if (q.includes(MAGIC_WORD)) {
    return MAGIC_RESPONSES[role] ?? MAGIC_RESPONSES.customer;
  }

  const tokens = tokenize(message);

  if (tokens.length > 0) {
    try {
      const idx = roleTierIndex(role);
      const allowedTiers = TIER_ORDER.slice(idx) as readonly string[];

      const rows = await prisma.faq.findMany({
        where: {
          isPublished: true,
          tier: { in: allowedTiers as string[] },
        },
        select: { question: true, answer: true },
      });

      const scored = rows.map((r) => {
        const qLower = r.question.toLowerCase();
        const score = tokens.reduce(
          (sum, t) => sum + (qLower.includes(t) ? 1 : 0),
          0,
        );
        return { ...r, score };
      });

      const best = scored
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)[0];

      if (best) return best.answer;
    } catch {
      // Silently ignore scoring errors — empty answer is returned below
    }
  }

  return "";
}
