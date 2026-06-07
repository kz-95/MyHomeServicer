import * as chrono from "chrono-node";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { configVault } from "../lib/config-vault";
import { formatOrderId } from "../lib/order-id";

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
          ? `When directing users to a page, include a clickable link using markdown link syntax: [page name](/path). For example: [view your proposals](/servicer/quotes), [manage your jobs](/servicer/jobs). Use relative paths starting with /.`
          : `When directing users to a page, include a clickable link using markdown link syntax: [page name](/path). For example: [admin dashboard](/admin/dashboard), [manage users](/admin/users). Use relative paths starting with /.`;

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
- "where is my proposal" → [Proposals](/customer/proposals)
- "where are my rewards / points / vouchers" → [Rewards](/customer/rewards)
- "where is my account / profile / settings" → [Account](/customer/account)
- "where is my wallet / credit / balance" → [Deposit & Credit](/customer/deposit) — but answer balance from the account context above; do NOT link to external bank or card pages
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

  // CRITICAL: Flow instructions come FIRST — right after tone, before any reference data
  if (role === "guest" || role === "customer") {
    const todayKL = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
    });
    const weekdayKL = new Date().toLocaleDateString("en-US", {
      timeZone: "Asia/Kuala_Lumpur",
      weekday: "long",
    });

    extra += "\n\n!!!!! YOU MUST EMIT ACTION BLOCKS !!!!!";
    extra +=
      "\nWithout [action:...] blocks the user sees ONLY TEXT and CANNOT pick dates, times, or fill forms.";
    extra +=
      "\nEvery response that collects information MUST include the corresponding [action:...] block.";

    extra += `\n\nToday is ${weekdayKL}, ${todayKL} (Asia/Kuala_Lumpur). Resolve relative dates ("tonight", "tomorrow", "next Sunday") to a concrete FUTURE date in YYYY-MM-DD.`;
    extra += "\n\n### EXTRACT FIRST — pre-fill what the user already said.";
    extra +=
      '\nBefore asking anything, scan the WHOLE conversation for details the user already gave: date, time of day, budget, name, phone, address. For each one present, emit its [action:quote_field] WITH a "value:" line pre-filled, and NEVER ask for it again.';
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
      "\nUSE THEIR NAME: the moment the user tells you their name (or you already know it), warmly confirm it once (\"Got it, Brian!\") and then address them by their first name naturally throughout the chat - a friendly \"Sure, Brian\" / \"Thanks, Brian\" here and there, NOT in every single line (that feels robotic). Always write the name capitalised. If the user asks you to stop using their name, stop immediately.";
    extra +=
      "\nThe MOMENT the user confirms a service by ANY means (tapping the card, OR replying yes/yep/correct/that one/sure in text), IMMEDIATELY emit [action:category_lock]categoryId: <the exact categoryId UUID for that service>[/action] in that same reply. This silently records the choice (no visible card) and is REQUIRED for the rest of the flow, especially the service questions, to work. Emit it once, only the real UUID from the catalog.";
    extra +=
      '\nThe card has two buttons: "Yes, that\'s it" (confirm) and "Not this service" (reject). If the user clicks Not this service or otherwise says your guess is wrong, do NOT give up and do NOT send them to the services page. Ask ONE short, friendly question about what they are actually trying to get done (the item, room, event, or problem involved), then suggest a DIFFERENT, better-fitting catalog service with a fresh [action:quote_options]. If they are not sure which service they need, help them narrow it down from their goal. Keep trying to match a real catalog service; only conclude we do not offer it after you have genuinely tried and nothing fits.';

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
      "\n### Step 6: Contact — name and phone are SEPARATE cards (like date + time). EMIT [action:quote_field] key=contactName and key=contactNumber. If the user already gave their name in the chat (e.g. \"I'm Zedd\"), emit contactName WITH a value: line to capture it, so only the phone card remains.";
    extra +=
      '\n### Step 7: Service questions — after the base fields, the app supplies the category\'s questionSchema questions and shows a [action:quote_question] card for each, ONE at a time. Open with a short warm lead-in the FIRST time, e.g. "Thanks for confirming your details. Before we proceed, just a few quick questions about the job." Then ask each question CONVERSATIONALLY, weaving its options in as natural examples (broken TV: "What is going on with it? No power? No sound? Lines on the screen? And what kind of TV is it?"). The user can answer in plain words; MAP their answer to the closest option and emit [action:quote_question]key: <questionKey>\\nvalue: <optionValue or their words>[/action] to record it. If they are unsure (e.g. cannot tell the screen type), reassure them, let them pick "I do not know", or help them figure it out. Never invent questions; only the real ones the app provides. Ask optional ones briefly too, the user may skip them.';
    extra += "\n### Step 8: Notes — EMIT [action:quote_field] key=notes";
    extra += "\n### Step 9: Summary — text only. Confirm with user.";
    extra +=
      "\n### Step 10: Submit — EMIT [action:quote_prefill] with ALL fields";
    extra +=
      "\nFollow this order: date+time, then address, then budget, then contact, then the service questions. Ask for ONE step at a time and emit its card; never ask a later step before an earlier one.";

    extra += "\n\n### STRICT RULES (obey these or the UI breaks):";
    extra +=
      "\n- NEVER ask date/time/address/name/phone in text alone. ALWAYS emit the [action:quote_field] block.";
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
      "\n- If NO category in the Service Catalog matches what the user needs, do NOT emit [action:quote_options] and do NOT force an unrelated category. Say plainly, in one or two warm sentences, that we do not currently offer that service. Do NOT list or recommend specific unrelated services (e.g. do not suggest Home Cleaning to someone whose pet died) — that reads as a tone-deaf upsell. At most, gently point them to the general services page without naming categories. Do not guess.";
    extra +=
      '\n- PARTIAL / MIXED / WEIRD requests: real customers ramble, joke, vent, overshare, or say absurd, inappropriate, or off-topic things alongside a genuine need. Stay unflappable and warm — never lecture, moralise, judge, or refuse the whole conversation over the weird parts. Pull out the one real serviceable need and PURSUE IT: if ANY part maps to a catalog service, acknowledge briefly, emit [action:quote_options] for that service, and drive the booking forward. Quietly ignore or lightly set aside anything we do not serve or anything inappropriate; do not repeat it back or explain why it is off-limits. A party, event, gathering, or celebration almost always maps to Catering (sometimes also Cleaning or Decoration) — treat that as a clear sales opportunity, not a reason to back off. Only fall back to "we do not offer that" when NOTHING in the whole message maps to any catalog service.';
    extra +=
      '\n- NAME-MISMATCH GUIDANCE: customers often ask for a service by a name that is not a catalog category but IS covered by one (e.g. "wedding planner" is covered by Event Planner; "movers", "pest control", "handyman" map to the closest real service). If they ask again or seem unsure that we offer it (e.g. "you don\'t have a wedding planner?"), do NOT just silently re-show the same card. GUIDE them: reassure them yes we do, and explain the connection in one short friendly sentence ("Our Event Planner handles weddings and private celebrations like that."), THEN emit the [action:quote_options] for that service. The goal is to teach them which real service covers their need so they feel confident, not to make them guess.';
    extra +=
      '\n- NEVER PROMISE A CARD WITHOUT EMITTING IT. If your text says or implies a card is coming ("Let me check", "here is the service that fits", "pick the one you want"), you MUST include the actual [action:quote_options] (or the relevant action block) in that SAME reply. Ending a turn having promised a card but emitting none strands the user with nothing to tap. If you can name the service, emit its card now.';
    extra +=
      '\n- SELF-RECOVERY: if you look back and your previous turn slipped (you said you would show a service or card but emitted none, or repeated yourself without progressing), do NOT just repeat the same line. Briefly own it and apologise in a warm human way ("Sorry, that did not come through properly"), clarify what you meant, and THEN emit the correct card or next step. Always move the user forward with a real update, never leave them stuck on the same spot.';
    extra +=
      "\n- When you mention a service in your text, write its EXACT catalog name in plain words with NO bold, NO asterisks, NO markdown. The app automatically turns service names into clickable links, so never format them yourself.";
    extra +=
      '\n- NEVER use markdown anywhere: no bullet lists, no "*" or "-" bullets, no "#" headings, no bold/italics. The chat renders plain text, so markdown shows as ugly raw symbols. When you recap collected details (date, time, address, budget), write them in ONE short natural sentence (e.g. "So that is Sunday 14 June, night, at 42 Jalan SS2/72."), not as a bulleted list.';
  }

  // --- Reference data below — informative, not action-driving ---

  if (customPrompt) {
    extra += `\n\nCustom instructions: ${customPrompt}`;
  }

  extra += "\n\nAction block reference (supported formats):";
  extra +=
    "\n[action:quote_options] — suggest a category. Include category, categoryId.";
  extra +=
    "\n[action:quote_field] — collect one field. Keys: preferredDate, timeSlot, address, contactName, contactNumber, notes, budgetMin, budgetMax.";
  extra +=
    "\n[action:category_lock] — silently lock the confirmed service. Include categoryId (the exact UUID). Emit the moment the user confirms a service by card OR in text. No visible card.";
  extra +=
    "\n[action:quote_question] — record a service-specific answer. Include key (the questionSchema key) and value (the chosen option value or the user's words). The app renders the matching picker.";
  extra +=
    "\n[action:quote_prefill] — all data collected. Include categoryId + all fields.";
  extra += "\n[action:profile_field] — servicer profile field to edit.";
  extra += "\n[action:pin_required] — warn PIN needed.";
  extra += "\n[action:link] — navigation action.";

  if (categories && categories.length > 0) {
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

export function isGeminiConfigured(): boolean {
  return Boolean(env.AICHAT_LLM_API_KEY);
}

export function isDeepSeekConfigured(): boolean {
  return Boolean(env.AICHAT_LLM_FALLBACK_API_KEY);
}

export async function isAnyLlmConfigured(): Promise<boolean> {
  if (isGeminiConfigured() || isDeepSeekConfigured()) return true;
  try {
    const keys = await getLlmKeys();
    return keys.length > 0;
  } catch {
    return false;
  }
}

export function isAiConfigured(): boolean {
  return isGeminiConfigured() || isDeepSeekConfigured();
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
const FIRST_TOKEN_MS = 8_888;

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
        if (delta) {
          if (!gotFirst) {
            gotFirst = true;
            clearFirst();
          }
          answer += delta;
        }
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
): Promise<AiReply> {
  const key = apiKey || env.AICHAT_LLM_API_KEY;
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
    answer: answer || (await localFallback(message, role)),
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
): Promise<AiReply> {
  const key = apiKey || env.AICHAT_LLM_FALLBACK_API_KEY;
  const modelName = model || "deepseek-chat";
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
    "DeepSeek",
  );

  return {
    answer: answer || (await localFallback(message, role)),
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
    answer: answer || (await localFallback(message, role)),
    tokensUsed,
    truncated,
  };
}

async function callByProvider(
  provider: string,
  apiKey: string,
  systemPrompt: string,
  message: string,
  history: HistoryMessage[],
  role: string,
  model?: string,
): Promise<AiReply> {
  switch (provider) {
    case "gemini":
      return callGemini(systemPrompt, message, history, role, apiKey, model);
    case "deepseek":
      return callDeepSeek(systemPrompt, message, history, role, apiKey, model);
    case "openai":
    case "generic":
      return callOpenAi(systemPrompt, message, history, role, apiKey, model);
    default:
      return callOpenAi(systemPrompt, message, history, role, apiKey, model);
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
 * Build the ordered list of LLMs to try: the .env primary + fallback first
 * (local-dev convenience; left empty on deploy), then the admin-configured keys
 * (priority order, fallback key last). The chain treats them all the same — it
 * does not care which vendor each one is.
 */
async function buildLlmChain(
  systemPrompt: string,
  message: string,
  history: HistoryMessage[],
  role: string,
): Promise<LlmAttempt[]> {
  const attempts: LlmAttempt[] = [];

  if (env.AICHAT_LLM_API_KEY) {
    attempts.push({
      id: "env:primary",
      label: "Primary LLM (.env)",
      run: () => callGemini(systemPrompt, message, history, role),
    });
  }
  if (env.AICHAT_LLM_FALLBACK_API_KEY) {
    attempts.push({
      id: "env:fallback",
      label: "Fallback LLM (.env)",
      run: () => callDeepSeek(systemPrompt, message, history, role),
    });
  }

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
        callByProvider(k.provider, k.value, systemPrompt, message, history, role, k.model),
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
        logger.warn(`${llm.label} failed, trying next`, { error: (e as Error).message });
      }
    }
    // No LLM was even tried (all cooling down / none configured) — stop, don't spin.
    if (!triedAny) break;
  }

  // Budget exhausted or nothing available — throw to trigger the local fallback.
  throw (lastErr instanceof Error ? lastErr : new Error("No AI provider available"));
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
      const d = results[0].start.date();
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

const NON_NAME_WORDS = new Set([
  "yeah", "yes", "yep", "no", "nope", "ok", "okay", "sure", "hi", "hello", "hey",
  "thanks", "thank", "morning", "noon", "afternoon", "evening", "night", "today",
  "tomorrow", "tonight", "correct", "right", "yup", "cool", "great",
  // common words that follow "name"/"you are" but are NOT names
  "and", "a", "an", "the", "your", "my", "our", "or", "number", "contact",
  "is", "are", "was", "to", "for", "at", "on", "in", "of", "with", "you", "we",
  "it", "that", "this", "please", "here", "there", "name", "phone", "details",
]);

/**
 * Extract a person's name the user typed in reply to "what name should I put the
 * booking under?" — the model often acknowledges it ("Thanks Hugo!") but emits an
 * empty name field. Only called while the name card is showing, so a bare one-word
 * reply is safely treated as the name.
 */
function extractName(message: string, replyText = ""): string | undefined {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // Explicit patterns, checked on the user message AND the assistant's echo (the
  // model often confirms "I have your name as Brian" when the user gave it earlier).
  const explicit =
    /(?:my name(?:'?s| is| as)|i'?m|i am|call me|name(?:'?s| is| as)|it'?s|this is|you(?:'?re| are)|speaking (?:with|to))\s+([A-Za-z][A-Za-z'-]{1,30})/i;
  const m = `${message} ${replyText}`.match(explicit);
  if (m && !NON_NAME_WORDS.has(m[1].toLowerCase())) return cap(m[1]);
  // Personalised-address echo in the assistant's reply ("Got it, Brian!", "Thanks,
  // Brian"). The next word MUST be Capitalised — names are, mid-sentence stopwords
  // are not — which keeps "Thanks for"/"Got it now" from matching.
  const echo = replyText.match(
    /\b(?:got it|thanks|thank you|alright|welcome|noted|sure|okay|ok)[,!]?\s+([A-Z][a-z'-]{1,20})\b/,
  );
  if (echo && !NON_NAME_WORDS.has(echo[1].toLowerCase())) return cap(echo[1]);
  // Bare one-word reply — ONLY the user's message (the reply is long prose).
  const trimmed = message.trim();
  if (
    /^[A-Za-z][A-Za-z'-]{1,30}$/.test(trimmed) &&
    !NON_NAME_WORDS.has(trimmed.toLowerCase())
  ) {
    return cap(trimmed);
  }
  return undefined;
}

/**
 * Extract a phone number the user typed in reply to "what's your phone number?".
 * Assumes a Malaysian number (+60) when no country code is given — drops a leading
 * 0 and prepends +60. Returns a full E.164-ish string or undefined. Only called
 * while the phone card is showing, so a bare number run is safely the phone.
 */
function extractPhone(message: string): string | undefined {
  const m = message.match(/(\+?\d[\d\s\-()]{6,18}\d)/);
  if (!m) return undefined;
  const raw = m[1].replace(/[\s\-()]/g, "");
  if (raw.startsWith("+")) {
    return /^\+\d{7,15}$/.test(raw) ? raw : undefined;
  }
  const local = raw.replace(/^0+/, "");
  if (local.length < 7 || local.length > 12) return undefined;
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
  if (!has("address"))
    return [{ type: "quote_field", data: { key: "address" } }];
  // Budget BEFORE contact — it reads more naturally (know the budget, then take
  // contact details last) and matches the order the model narrates, so the card
  // shown lines up with the question the assistant asks.
  if (!has("budgetMax"))
    return [{ type: "quote_field", data: { key: "budgetMax" } }];
  if (!has("contactName") || !has("contactNumber")) {
    // Name and phone are SEPARATE cards (like date + time): emit whichever is
    // still missing, so a name already given in text leaves only the phone card.
    const blocks: ActionBlock[] = [];
    if (!has("contactName")) blocks.push({ type: "quote_field", data: { key: "contactName" } });
    if (!has("contactNumber")) blocks.push({ type: "quote_field", data: { key: "contactNumber" } });
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
      categoryCatalog = "\n\n## Service Catalog\n";
      categoryCatalog +=
        "Each child category is the actual quotable service. Parents are for browse grouping.\n";
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
          categoryCatalog += `\n- **${c.name}** (slug: \`${c.slug}\`)`;
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
    (await buildAssistantPrompt(role, categories, userId)) + categoryCatalog;

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
      `\nValid keys: categoryId (a UUID from the catalog), preferredDate (YYYY-MM-DD), timeSlot (morning|noon|afternoon|evening|night), contactName, contactNumber, address, notes.` +
      `\nOnly fill a field when the user gave the value. NEVER emit quote_options, quote_field, or quote_prefill in this mode — the on-screen form already has those controls.`;
  } else if (opts?.collected && opts.collected.length > 0) {
    // In-chat quote flow: tell the model which fields the user has ALREADY given
    // (the client tracks these). Without this the model has no memory of the
    // confirmed cards and re-asks for date/time/etc. it already has. The
    // deterministic next-card logic still shows the right next card; this stops
    // the model's TEXT from re-asking and contradicting the on-screen state.
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
    type: string;
    required: boolean;
    options?: Array<{ value: string; label: string }>;
    description?: string;
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
              type: string;
              required?: boolean;
              active?: boolean;
              options?: Array<{ value: string; label: string }>;
              description?: string;
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
            type: q.type,
            required: q.required === true,
            options: q.options,
            description: q.description,
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
  } catch {
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
  if (raw.truncated) {
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
    const stillChoosingCategory = outBlocks.some((b) => b.type === "quote_options");
    const categoryLockedThisReply = outBlocks.some((b) => b.type === "category_lock");
    const collectingFields =
      !stillChoosingCategory &&
      (opts?.suppressCategorySuggest === true ||
        categoryLockedThisReply ||
        outBlocks.some(
          (b) => b.type === "quote_field" || b.type === "quote_prefill",
        ));
    if (collectingFields) {
      // Deterministic date/time pre-fill: the model often states a resolved date in
      // its text but emits an empty picker. Parse it ourselves so it never relies on
      // the model (or which LLM answered) emitting the value. ONLY when the USER's
      // own message expresses date/time intent — otherwise an incidental word in the
      // assistant's prose ("how can I help you today?") would wrongly fill a date.
      const userText = message.toLowerCase();
      const hasDateIntent =
        /\b(today|tomorrow|tonight|tmr|tmrw|mon|tues?|wed|thu(rs)?|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?|weekend|next (week|month|year)|[0-3]?\d[-/][01]?\d)\b/i.test(
          userText,
        );
      const hasTimeIntent = /\b(morning|noon|midday|afternoon|evening|night|tonight)\b/i.test(userText);
      if (hasDateIntent || hasTimeIntent) {
        const parsed = parseDateTimeFromText(`${message} ${processed.text}`);
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
        if (hasDateIntent) fillField("preferredDate", parsed.date);
        if (hasTimeIntent) fillField("timeSlot", parsed.slot);
      }


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
      const unansweredQ = categoryQuestions.filter(
        (q) => !answeredQ.has(q.key),
      );

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
                  label: q.label,
                  qtype: q.type,
                  required: q.required,
                  options: q.options ?? [],
                  ...(q.description ? { description: q.description } : {}),
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

      // Now that the contact step's cards are present, capture a name the user typed
      // into an empty contactName card — the model often acknowledges "Thanks Hugo!"
      // but emits an empty name field. Fills only an EXISTING empty card (we're at
      // the name step), so a one-word reply is safely treated as the name.
      const nameCard = outBlocks.find(
        (b) => b.type === "quote_field" && b.data.key === "contactName",
      );
      if (nameCard && (nameCard.data.value == null || nameCard.data.value === "")) {
        const name = extractName(message, processed.text);
        if (name) nameCard.data.value = name;
      }

      // Same for the phone card — capture a number typed in text (assume Malaysia
      // +60 when no country code). Only fills an existing empty phone card.
      const phoneCard = outBlocks.find(
        (b) => b.type === "quote_field" && b.data.key === "contactNumber",
      );
      if (phoneCard && (phoneCard.data.value == null || phoneCard.data.value === "")) {
        const phone = extractPhone(`${message} ${processed.text}`);
        if (phone) phoneCard.data.value = phone;
      }

      // Budget card — capture a stated amount so the slider pre-selects the right
      // bracket instead of defaulting to the lowest. Only fills an existing card.
      const budgetCard = outBlocks.find(
        (b) => b.type === "quote_field" && (b.data.key === "budgetMax" || b.data.key === "budgetMin"),
      );
      if (budgetCard && (budgetCard.data.value == null || budgetCard.data.value === "")) {
        const budget = extractBudget(`${message} ${processed.text}`);
        if (budget) budgetCard.data.value = String(budget);
      }
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
