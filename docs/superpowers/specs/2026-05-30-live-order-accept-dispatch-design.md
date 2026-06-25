# SP4 - Live order-accept prompt (availability-gated rotation dispatch)

**Date:** 2026-05-30
**Status:** Design approved (brainstorm). Largest sub-project; own spec + own session to build.
**Scope:** Backend dispatch service + socket presence + servicer prompt UI + admin setting
**Related:** [Category Settings / Question Schema spec](2026-05-30-category-settings-question-schema-design.md) (SP3 "Accept mode" step links here)

---

## Problem

Today listings effectively **always auto-accept**: on a customer order, the platform
silently auto-submits a proposal on behalf of any servicer whose listing matches
([auto-accept.service.ts](../../backend/src/services/auto-accept.service.ts) →
`quoteMatchesAutoAccept` + `computeAutoPrice`). The servicer is never asked, never sees
the job, can't judge fit. "Matchmaking only."

**Goal:** when a customer orders, route the job to an **available** servicer with a
**big, crystal-clear prompt** so they consciously **Accept or Decline**. Silent auto-accept
becomes an opt-in per-listing convenience, not the default.

## Current building blocks (reuse, don't rebuild)

- `Servicer.isOnline` ([schema.prisma:469](../../backend/prisma/schema.prisma)) - exists,
  **defaults `true`, no real presence tracking**. Indexed `[isOnline, isBanned]`.
- `ServicerSchedule` - working-hours system already built (7×4 grid,
  `GET/PATCH /servicer/me/schedule`). **This is the core availability check.**
- socket.io with JWT handshake - already in stack (used by `quote.new` proposal prompt, G-2).
- G-2 proposal prompt banner/inline form - extend into the big prompt guard.
- Dispatch Overlay (4-panel, QR, arrive/done) - existing post-acceptance flow.
- `@angular/google-maps` - already a dependency (for the map preview).

## Decisions (from brainstorm)

| Topic | Decision |
|---|---|
| Auto-accept vs prompt | **Prompt is default**; per-listing "instant auto-accept (no prompt)" is opt-in (SP3 step 4). |
| Who gets prompted | Servicer with a matching listing **AND available** = online (logged in) **AND within working hours** (`ServicerSchedule`). |
| Decline / expiry fallback | **Rotation, then async**: prompt one available servicer at a time; on decline/expiry, rotate to the next; once all available servicers are exhausted, drop the order into the async incoming-quotes pool. |
| Timer | **Admin-configurable, default 10s** per servicer in the rotation. |
| Presence | `isOnline` set true on login/socket-connect, false on logout/disconnect (needs real wiring). |
| Notifications | In-app notification on prompt + on confirmed booking. Email on confirmed booking is a **future** add (when email is hooked). |

## Prompt content (crystal-clear)

The big prompt guard shows:

- **Job + customer basics** - service/category, customer name + avatar, location/area,
  preferred date + time slot.
- **Customer's answers** to the category's `questionSchema` (what they actually need).
- **Money** - customer budget, the servicer's computed price for this job, platform fee / net.
- **Google Map preview** of the job location (reuse `@angular/google-maps`; ties into the
  parked map-view fix + Maps/Waze deep-link on confirmed booking).
- **Countdown timer** + big **Accept** / **Decline** buttons; expiry rotates to next servicer.

## Flow

```
customer submits order in category C
        │
        ▼
build eligible list:
  servicers with a matching listing in C
  filtered by availability (isOnline AND within ServicerSchedule working hours)
  filtered by match conditions (budget/slot/etc.)
        │
        ▼
ROTATION (one at a time, admin-configurable timer, default 10s):
  ── emit prompt (socket) + in-app notification to servicer[i]
  ── Accept  → confirm booking → notify customer + servicer → Maps/Waze deep-link → DONE
  ── Decline / expiry → rotate to servicer[i+1]
        │
        ▼ (all available servicers exhausted)
async fallback: order enters incoming-quotes pool for later response
```

> Per-listing **instant auto-accept** servicers skip the rotation prompt entirely and
> auto-confirm (current behavior, now opt-in).

## Backend work

- **Dispatch service** - on order: compute eligible+available list, run the rotation
  (BullMQ job per rotation step / delayed job for the 10s timeout), emit socket prompt +
  create notifications, advance on decline/expiry, fall through to async pool.
- **Accept / Decline endpoints** - Accept confirms the booking (reuse booking confirm path);
  Decline marks + advances rotation. PIN/auth-gated as appropriate; idempotent.
- **Presence wiring** - set `isOnline` on socket connect (post-JWT) and login; clear on
  disconnect/logout. Replace the always-true default with real state.
- **Availability check** - reuse `ServicerSchedule` to gate eligibility by working hours.
- **Admin setting** - `dispatch_prompt_timeout_seconds` (default 10) added to settings
  (surfaced in Financial Settings → Servicer Rules, or a new dispatch settings card).
- BullMQ payloads Zod-validated (per CLAUDE.md rule).

## Frontend work

- **Big prompt guard component** - full-screen blocking overlay (STYLE-RULES §7.14 prompt
  guard pattern), map preview, countdown, all detail sections, Accept/Decline. Extend/replace
  the G-2 banner.
- **Servicer online indicator** - show online/available state; auto-online on login.
- **Notification** entries for prompts + confirmed bookings.

## Docs to update

- `schema-notes.md` - presence semantics, any dispatch fields/state added.
- `api-doc.md` - accept/decline + dispatch endpoints, new admin setting.
- `security-notes.md` - socket presence auth, idempotent accept.
- `tech-stack.md` - (map already a dep; note if BullMQ usage expands).
- `TODO.md`.

## Open questions / risks

- **Race conditions** - two servicers accepting near-simultaneously (rotation is one-at-a-time,
  so low risk, but opt-in instant-auto-accept servicers could still collide). Need an atomic
  "first accept wins" claim on the order.
- **10s is aggressive** - confirm it's enough time to read details + check the map; admin-tunable
  mitigates.
- **Eligible-list ordering** - fairness/priority of rotation order (rating? round-robin?
  nearest?) - undecided.
- **Offline-everyone case** - if no servicer is available at order time, order goes straight
  to async pool; confirm customer messaging.
- Interaction with existing Dispatch Overlay + booking confirm path - map exact reuse during build.

## Sequencing

Build **after SP2 + SP3** (needs clean questions for the prompt detail, and the listing
"Accept mode" toggle from SP3). Largest and riskiest piece - its own implementation session.
