# AI Smart Assistant — Design Spec

## Overview

Upgrade the existing chat widget into an **AI Smart Assistant** that:

- Takes initiative with proactive greetings (configurable presets, no LLM cost)
- Shows unread message count badge on the FAB (greeting + history)
- Detects user intent (quote request vs profile setup vs general help) through conversation
- For **customers/guests**: walks users through quote creation or pre-fills the quote form
- For **servicers**: helps set up company profile with PIN-gated edits
- All behavior configurable via admin **AI Chat Settings**

No breaking changes to the existing chat widget — it extends the reply pipeline with structured action blocks.

---

## 1. Proactive Greeting + Unread Badge

### Behavior by Role

| Role | Auto-open | Badge | Behavior |
|------|-----------|-------|----------|
| Guest | Yes, after 3s | Shows unread count | Chat opens automatically with a preset greeting |
| Customer | No | Shows unread count | FAB badge shows count; user clicks to open |
| Servicer | No | Shows unread count | Same as customer |

### Greeting System (Zero LLM Cost)

- Admin configures **10+ preset greetings** in AI Chat Settings → Greetings tab
- Greetings are stored in `platform_settings` as `chat_greetings` (JSON array of strings)
- On chat open, frontend picks the **first unused greeting** in round-robin order
- Guest auto-open picks a random greeting
- Examples: "Need help with something?", "Looking for a service?", "How can I assist you today?"
- No AI call is made for the greeting — purely frontend-displayed from the preset list

### Unread Badge

- The FAB shows a red badge with the unread count (same position as notification bell)
- Unread count = **unread AI replies from session history** (capped at 99+) + **1 if greeting hasn't been seen**
- On chat open, unread resets to 0 for that session
- Stored in `ChatWidgetService.chatUnread` signal (already exists)
- Backend returns `unreadCount` on `GET /chat/session/{id}/messages`
- Socket event `chat.unread` already fires — unread count is maintained server-side

### Chat History Limit

- Session stores max **50 user messages** + 50 AI replies = 100 total
- When limit is reached, oldest messages are pruned
- A small note at the top/bottom of the thread:
  > "Chat stores up to 100 messages. Older messages are automatically removed."
- Admin can configure the limit via `chat_history_limit` setting

---

## 2. Action Token System

The AI reply includes structured **action blocks** embedded in markdown. The frontend parses these and renders interactive cards.

### Format

```markdown
Here's what I found for you.

[action:quote_options]
category: plumbing
categoryId: uuid-here
confidence: high
questions:
  - key: issue_type
    label: What type of plumbing issue?
    options:
      - value: leaking_pipe
        label: Leaking pipe
      - value: clogged_drain
        label: Clogged drain
[/action]
```

### All Action Types

| Action | Purpose | Renders as | Roles |
|--------|---------|------------|-------|
| `quote_options` | AI identified matching category | Service card with two buttons: "Continue in chat" / "Go to form" | customer, guest |
| `quote_field` | AI asks one form field within chat | Inline input/selector for the specific field (name, address, date, time slot, notes) | customer, guest |
| `quote_prefill` | All data collected, ready to submit | "Review & submit" button → navigates to `/customer/quote/new?prefill=...` or `/guest/quote/new?prefill=...` | customer, guest |
| `profile_field` | Servicer profile field suggestion | Field preview card with "Edit with PIN" button | servicer |
| `pin_required` | AI warns PIN needed upfront | Info banner: "You'll need your PIN for this" | servicer |
| `link` | Generic navigation action | Clickable button/link | all |

### Frontend Parsing

- Regex extracts `[action:<type>]...[/action]` blocks from the reply markdown
- YAML-like content between tags is parsed into a structured object
- Validated against a known schema per action type
- Invalid blocks are silently dropped (graceful degradation)
- Action blocks are **stripped** before the message text is stored in DB/history

---

## 3. Quote Assistant Flow (Customer & Guest)

### Step 1: Intent Detection

User sends first message (or greeting triggers conversation). The AI system prompt includes:

- **Role context**: "The user is a [customer|guest] looking for home services."
- **Full category catalog**: Every active category with `name`, `description`, `questionSchema`, `defaultPriceSuggestion`
- **Budget ranges**: Available budget brackets
- **Instructions**: "If the user wants a quote, identify the best-matching category. Ask clarifying questions if needed."

### Step 2: Category Identification

AI asks questions to narrow down the service. Once confident, it emits:

```
[action:quote_options]
category: plumbing
categoryId: cf33b38e-13bc-4f0a-a7b4-9555ce8a96a0
confidence: high
questions: [...]
[/action]
```

Frontend renders:

```
┌──────────────────────────────────────┐
│ 🔧 Plumbing Service                  │
│ I think you need a plumber. Does     │
│ this sound right?                    │
│                                      │
│ [Continue in chat]  [Go to form →]   │
└──────────────────────────────────────┘
```

### Step 3a: Continue in Chat (Path A)

- AI sends `quote_field` actions one at a time for each required field
- Frontend renders inline inputs (text, date picker, time slot selector, address autocomplete)
- As user fills each field, the answer is accumulated in a local `prefillData` object
- AI can skip optional fields based on user preference
- When all required fields collected → AI emits `quote_prefill`

### Step 3b: Go to Form (Path B)

- AI emits `quote_prefill` with all data collected so far
- Frontend navigates to the quote form page with query params
- Quote form reads params and pre-fills fields
- User reviews and submits manually

### Step 4: `quote_prefill` Action

```
[action:quote_prefill]
categoryId: uuid
contactName: Sarah Lim
contactNumber: 012-3456789
address: "12 Jalan SS2/72, Petaling Jaya"
timeSlot: morning
preferredDate: 2026-05-30
notes: Kitchen sink leaking under cabinet
budgetMin: 100
budgetMax: 500
paymentMode: pay_later
[/action]
```

Frontend accumulates all fields from the conversation. On confirmation, navigates to:
- Customer: `/customer/quote/new?prefill=<base64-encoded JSON>`
- Guest: `/guest/quote/new?prefill=<base64-encoded JSON>`

The quote form's `ngOnInit` checks for `prefill` param, decodes it, and populates the form state.

---

## 4. Servicer Profile Assistant Flow

### System Prompt

The AI knows:
- "The user is a servicer setting up their business."
- "You can help them configure: bio, service areas, categories offered, working hours, pricing."
- "Required fields to start: service areas (at least 1), at least 1 category with pricing, working hours."
- "Optional fields: bio, logo, bank account, invoice settings."
- "IMPORTANT: Any edit requires PIN authorization. Warn the user upfront."

### Flow

1. AI asks about the business (name, services offered, areas)
2. AI emits `pin_required` to set expectations
3. AI emits `profile_field` for each section
4. User clicks "Edit with PIN" → frontend opens PIN modal
5. PIN verified → backend saves via existing PATCH `/servicer/me` endpoints
6. AI confirms the update

### `profile_field` Action

```
[action:profile_field]
field: serviceAreas
label: Service areas
value: ["Petaling Jaya", "Kuala Lumpur"]
required: true
[/action]
```

Frontend renders:
```
┌──────────────────────────────────────┐
│ 🏢 Service Areas                     │
│ Petaling Jaya, Kuala Lumpur          │
│                                      │
│ [Edit with PIN 🔒]                   │
└──────────────────────────────────────┘
```

### PIN Modal

- Activated by `pin_required` action or "Edit with PIN" button
- Opens the existing PIN modal (`PinService` / `PinPromptComponent`)
- On successful PIN verification, a one-time `pinToken` is issued (short-lived, 5 min)
- Backend uses `pinToken` for the subsequent PATCH request
- PIN never touches chat history or frontend state beyond the modal

---

## 5. Admin AI Chat Settings

New tab/section in the admin settings (alongside Pricing, Rewards, Servicer tabs).

### Tab: General

| Setting | Key | Type | Default |
|---------|-----|------|---------|
| AI Assistant enabled | `chat_assistant_enabled` | boolean | true |
| Quote assistant enabled | `chat_quote_enabled` | boolean | true |
| Profile assistant enabled | `chat_profile_enabled` | boolean | true |
| Guest chat enabled | `chat_guest_enabled` | boolean | true |
| Chat history limit | `chat_history_limit` | number | 50 |
| Auto-open for guests | `chat_guest_auto_open` | boolean | true |
| Auto-open delay (ms) | `chat_guest_auto_open_delay` | number | 3000 |

### Tab: System Prompt

| Setting | Key | Type | Default |
|---------|-----|------|---------|
| Custom instructions | `chat_assistant_prompt` | text | "You are a friendly assistant..." |
| Tone | `chat_assistant_tone` | select | [friendly, professional, casual] |

The system prompt is built dynamically: base prompt + custom instructions + category catalog + role context.

### Tab: Greetings

| Setting | Key | Type | Count |
|---------|-----|------|-------|
| Greeting messages | `chat_greetings` | JSON array of strings | Min 10, max 50 |

Default greetings:
1. "Hi there! How can I help you today?"
2. "Need help with something around the house?"
3. "Looking for a service? I can help you find what you need."
4. "Welcome! What brings you here today?"
5. "Got a question? Ask me anything about our services."
6. "Hi! I'm your AI assistant. What can I do for you?"
7. "Need a hand finding the right service? Let's chat!"
8. "Hello! How can I make your day easier?"
9. "Looking to book a service? I'm here to help."
10. "Hi! Whether you need a quote or just have a question, I'm here."

### Tab: Service Data (for AI matching)

| Setting | Key | Type |
|---------|-----|------|
| Keywords/synonyms per category | `chat_service_keywords` | JSON: `{ categoryId: { keywords: string[], description: string } }` |

Admin can override the AI's understanding of each category by providing alternative names, synonyms, and richer descriptions for better matching.

---

## 6. Backend Changes

### New / Updated Endpoints

| Method | Path | Change |
|--------|------|--------|
| POST | `/chat/session/:id/message` | AI reply now includes `actionBlocks` in the response alongside `text` |
| POST | `/chat/guest` | Same — returns `actionBlocks` alongside `reply` |
| GET | `/chat/session/:id/messages` | Returns `unreadCount` in response |
| GET | `/admin/chat/settings` | Returns all `chat_*` settings as a grouped object |
| POST | `/admin/chat/verify-pin` | Validates PIN, returns short-lived `pinToken` |
| POST | `/admin/chat/apply-profile` | Applies profile changes using `pinToken` |

### AI Reply Enhancement (chat.service.ts)

After getting the raw reply from Gemini/DeepSeek/fallback:

1. Parse `[action:...]` blocks from the reply text
2. Validate each block against its schema
3. Remove action blocks from the stored text
4. Return `{ text, actionBlocks }` to the route handler
5. Route handler attaches `actionBlocks` to the response alongside `reply`

### System Prompt Builder

New function `buildAssistantPrompt(role, categories, settings)`:
- Loads `chat_assistant_prompt` from platform_settings
- Loads active categories with question schemas
- Loads `chat_service_keywords` for overrides
- Loads budget ranges
- Assembles into a structured markdown prompt

---

## 7. Frontend Changes

### Chat Widget Component

- **Parse action blocks**: After receiving a reply, scan for `[action:...]` blocks
- **Render action cards**: New template section after the message text renders inline cards
- **Quote field inputs**: Inline form fields for `quote_field` actions (name, phone, address autocomplete, date picker, time slot buttons)
- **Prefill data accumulator**: Local `prefillData` signal accumulates data from multiple `quote_field` actions
- **Navigation on prefill**: "Go to form" / "Review & submit" buttons navigate to the form with prefill data
- **PIN modal trigger**: `pin_required` action opens PIN modal; on success, sends PIN token with subsequent profile changes
- **Unread count display**: Badge on FAB showing `chatUnread` signal; reset on open

### Chat Widget Service

- `chatUnread` signal already exists — enhanced to track greeting state
- New method `markGreetingSeen()` called on chat open
- New method `setUnreadCount(n)` called from socket/API responses

### Quote Form Components (customer + guest)

- `ngOnInit` checks for `prefill` query param
- Decodes base64 JSON, validates field names, populates form state
- Skips to the appropriate step (summary if fully filled, or the first empty step)

### Shell Component

- FAB badge bound to `chatWidget.chatUnread()`
- Guest auto-open timer: starts on page load, opens chat after `chat_guest_auto_open_delay` ms (only for guest role, no shell)

### Home Component

- Same FAB badge integration (already has access to `ChatWidgetService`)

---

## 8. Context Window Strategy

- **System prompt** is rebuilt on every request (settings may change)
- **Conversation history** sent to AI: last N messages where N = `chat_history_limit` (default 50)
- **Action blocks are stripped** from history before sending to AI (prevent confusion)
- **Category catalog** is included in system prompt (changes infrequently, cached)
- If conversation drifts from quote/profile intent, AI is instructed to ask "Is there something else I can help you with?"

---

## 9. Future Considerations

- **Multi-language support**: Greetings and system prompt could be translated
- **Voice input**: Chat could support voice-to-text for accessibility
- **Follow-up notifications**: If a quote request was started but not completed, AI could send a reminder
- **Analytics**: Admin dashboard showing top user intents, completion rates for quote assistant

---

## Spec Self-Review

- [x] No placeholders or TODOs
- [x] Internal consistency — flows match existing patterns (chat widget, quote form, PIN modal, admin settings)
- [x] Scope focused — single feature (AI Smart Assistant upgrade), no unrelated changes
- [x] Ambiguity resolved — action token format specified, greeting behavior per-role defined, PIN flow detailed
