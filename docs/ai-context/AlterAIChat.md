# AlterAIChat: Tiered Conditional Chat Architecture

**Status:** On hold (proposal, not implemented)

## Current State

`chat.service.ts` sends full context per message:
- All FAQ (tier-filtered, but complete list)
- All service categories + catalog
- Full user account state (recent bookings, active quotes, points, credit)
- Model decides action blocks to emit
- Guards strip duplicates/invalid blocks (reactive)

System prompt: ~2-3KB per message.

## Proposed Structure

```
{chat}
  → {tier condition}     Role gates FAQ (admin reads all; guest reads guest+customer)
  → {condition}          Event data type gates service-specific questions
  → {knowledge}          FAQ from admin (tier-filtered, curated)
  → {instructions}       buildAssistantPrompt() + only relevant categoryCatalog
  → {memory}             User account context (only current session state)
  → {temp prefill data}  In-flight card state (form step, not all past values)
  → {prefill data}       Confirmed/locked values (quote)
  → {fallback}           Cascade: LLM1 → LLM2 → local (deterministic, no API)
  → {cards}
      - Person Data (name, contact, style)
      - Event Data (service type, date/time, address, registration reminders)
      - Question Data (category's questionSchema, gated by {condition})
```

## Token Savings

- Tier gates FAQ upfront → admin doesn't see customer FAQ
- Condition gates questions → only service-relevant Q's sent
- Prefill data scoped → don't re-inject all locked values every turn
- Knowledge curated per context → smaller system prompt

**Estimated reduction:** 30-40% (current 2-3KB → ~800B-1.2KB per message)

## Design Principles

1. **Fallback cascades:** Earlier systems (AI) are flexible; later (local) are deterministic and fast. Degrade gracefully when LLM unavailable.
2. **Tier filtering:** Every layer respects user role. Knowledge visible only to tiers that need it.
3. **Condition-driven:** Rules pre-filter what the model sees, not model post-deciding. Predictable flow.
4. **Explicit state:** Temp vs locked data separated. Prefill data doesn't leak across requests.

## Trade-offs

| Aspect | Current | Proposed |
|--------|---------|----------|
| Flexibility | High (model adapts to full context) | Lower (rules pre-filter) |
| Token cost | 2-3KB/msg | ~1KB/msg |
| Guidance quality | Better (AI sees nuance) | Adequate (rules cover known cases) |
| Fallback clarity | Implicit (tryAiChain exists) | Explicit (part of design) |
| Code complexity | Lower (AI-driven) | Higher (condition logic) |

## When to Implement

- If LLM cost becomes critical (high traffic, cost per message matters)
- If current guards prove insufficient (too much model drift)
- If condition logic stabilizes (question schemas + service types locked down)

Current: Keep as-is, monitor token spend.
Proposed: Revisit after Q2 2026 when feature set stabilizes.
