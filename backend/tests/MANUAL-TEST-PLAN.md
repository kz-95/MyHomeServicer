# Manual Test Plan — MyServicer

> These checks require a **live stack**: Postgres + Redis running via
> `docker compose up -d`, the database seeded with `npm run db:reset` in
> `backend/`, and the backend server started with `npm run dev`.
> The frontend can be served separately with `ng serve`.
>
> Automated suites cover the happy paths; this document covers runtime
> behaviour that cannot be asserted without a running system.

---

## Prerequisites

```bash
docker compose up -d           # Postgres + Redis
cd backend
npm install
npm run db:reset               # force-push schema + regenerate Prisma + seed
npm run dev                    # API on http://localhost:3000
# separate terminal:
cd frontend && ng serve        # SPA on http://localhost:4200
```

All demo accounts use password `Demo@2026`.

---

## MT-1 — Reseed produces a clean database

**Purpose:** Confirm `npm run db:reset` and `npm run seed` run without errors
and produce the expected baseline data set.

| Step | Expected result |
|------|-----------------|
| Run `npm run db:reset` in `backend/` | Command exits 0, no "column not found" or Prisma errors |
| Check terminal output | "✅ Seeded X quotes, Y bookings …" (or equivalent) |
| Open Prisma Studio: `npx prisma studio` | Tables populated: `User`, `Servicer`, `Category`, `QuoteRequest`, `Booking` all have rows |
| Log in as `customer.active@demo.local` | Login succeeds, role = customer |
| Log in as `admin@demo.local` (PIN: `1234`) | Login succeeds, role = admin |
| Log in as `servicer.1@demo.local` | Login succeeds, role = servicer |

**Pass criteria:** All logins succeed, no DB errors, all tables populated.

---

## MT-2 — Quote countdown timer ticks in real time

**Purpose:** The seed creates an "active" customer quote with a deadline of
`now + 30 minutes`. The frontend countdown component should tick down live.

| Step | Expected result |
|------|-----------------|
| Log in as `customer.active@demo.local` | Redirected to `/customer/quotes` |
| Locate the open quote | A countdown timer is visible (e.g., "29m 55s remaining") |
| Wait 10 seconds | Timer has decremented by ~10 seconds |
| Hard-refresh the page | Timer continues from the correct remaining time (not reset to 30m) |

**Pass criteria:** Timer counts down smoothly; a page refresh does not reset it.

**Note:** The seed sets `proposalDeadline = new Date(Date.now() + 30 * 60_000)`
at seed time. If the database was seeded more than 30 minutes ago, the quote
will have expired and no timer will be visible — reseed to reset.

---

## MT-3 — Seeded chat session is resumed in the UI

**Purpose:** `customer.loyal@demo.local` has a seeded chat session with
pre-populated messages. The chat UI should resume (not start fresh).

| Step | Expected result |
|------|-----------------|
| Log in as `customer.loyal@demo.local` | Redirected to customer portal |
| Navigate to the AI Chat (help icon / `/customer/chat`) | The existing session is loaded |
| Chat history is visible | At least one pre-seeded message appears above the input |
| Send a new message | Response is received (AI connected) or a "chat unavailable" notice appears (AI not configured) |
| Refresh the page | Chat history persists — the same session is resumed |

**Pass criteria:** Seeded messages are visible; session is not reset on refresh.

---

## MT-4 — Socket.io events fire correctly

**Purpose:** Verify that real-time events are emitted and received by the
frontend without errors.

### MT-4a — `quote.new` broadcast

| Step | Expected result |
|------|-----------------|
| Open the servicer portal as `servicer.1@demo.local` | Jobs board visible |
| In a second browser session, log in as `customer.fresh@demo.local` | |
| Submit a new quote from the customer session | Within ~2 s the servicer sees a new card appear in "Pending requests" (no page refresh) |
| Browser DevTools → Network → WS frame | A `quote.new` frame is visible |

### MT-4b — `booking.status_changed` event

| Step | Expected result |
|------|-----------------|
| Accept one of the seeded proposals as `customer.active@demo.local` | Booking created |
| In the servicer portal, confirm the booking | Customer portal status updates to "Confirmed" within ~2 s |
| Browser DevTools → Network → WS frame | A `booking.confirmed` or `booking.status_changed` frame is visible |

**Pass criteria:** UI updates without a page refresh; relevant WS frames visible.

---

## MT-5 — AI chatbot connects and responds

**Purpose:** Confirm the AI help-chat relay works end-to-end when an AI API
key is configured (Gemini, DeepSeek, or stored in LLM_KEYS table).

| Step | Expected result |
|------|-----------------|
| Ensure `AICHAT_LLM_API_KEY` or `AICHAT_LLM_FALLBACK_API_KEY` is set in `backend/.env` | — |
| Start the backend | No "API key missing" warning in logs |
| Log in as any customer and open the chat | Input field is active |
| Send "Hello" | A response is received within ~5 s |
| Send "What services do you offer?" | Relevant answer returned (not an error envelope) |

**Without an AI key:**
- The backend returns a controlled error (not a 500).
- The frontend shows a "Chat is unavailable" message instead of crashing.

**Pass criteria (with key):** Message sent → response received. Session ID
persists across page refresh. Rate-limit message appears if you fire >20
messages in 10 minutes.

---

## MT-6 — noshow.detect job fires after the service window

**Purpose:** Confirm the BullMQ job wakes up ~30 minutes after the service
window ends and cancels/flags an unattended confirmed booking.

> This test requires running the worker process: `npm run worker` in
> `backend/`.

| Step | Expected result |
|------|-----------------|
| Seed a booking that is in `confirmed` status with a past `scheduledDate` | — |
| Start the worker: `npm run worker` | Worker logs show registered handlers |
| Wait for the job to fire (or use BullMQ's `delay: 0` by backfilling via `POST /dev/…`) | — |
| Check booking status in Prisma Studio | Status changed to `cancelled`, `cancelledBy = 'servicer'`, reason = "No-show — servicer did not arrive" |
| Check servicer's `consecutiveNoshow` counter | Incremented by 1 |
| Verify `PenaltyLog` row created | `type = 'noshow'`, `amountDeducted > 0` |

**Pass criteria:** Booking cancelled, counter incremented, penalty logged.

---

## MT-7 — escrow.release job pays out after job completion

**Purpose:** Confirm that a `pay_now` booking releases escrow to the servicer
after `doneJob` is called.

| Step | Expected result |
|------|-----------------|
| Run the full `pay_now` E2E flow manually (or via `npm run test:e2e`) | Booking reaches `completed` |
| Start the worker (`npm run worker`) | — |
| Wait ≥ 60 s (release has a 60 s delay) | — |
| Check `Escrow.status` in Prisma Studio | Changed from `held` → `released` |
| Check `Transaction` table | Two new rows: `platform_fee` + `escrow_release` |
| Check `ServicerDeposit.currentBalance` | Increased by `price - platformFee + tip` |

**Pass criteria:** Escrow released, transactions recorded, servicer balance updated.

---

## MT-8 — Servicer deposit top-up approval flow

**Purpose:** Servicer requests a deposit top-up; admin credits it; servicer
balance increases.

| Step | Expected result |
|------|-----------------|
| Log in as `servicer.6@demo.local` | — |
| Navigate to Deposit / Top-Up | Current balance visible |
| Submit a top-up request for RM 200 | Request created, status = `pending` |
| Log in as `admin@demo.local` (PIN: `1234`) | — |
| Navigate to Admin → Deposit Top-ups | New request visible |
| Approve the top-up (PIN required) | Status → `credited` |
| Return to servicer portal | Balance increased by RM 200 |

**Pass criteria:** Balance updated; `ServicerDeposit.currentBalance` matches.

---

## MT-9 — Notification delivery (snackbar + settings)

**Purpose:** In-app notifications appear in the bottom-left snackbar.

| Step | Expected result |
|------|-----------------|
| Log in as `customer.fresh@demo.local` | — |
| In a second session, accept a proposal for this customer | — |
| Within 45 s (polling interval) | A snackbar notification appears: "Servicer confirmed your booking" |
| Navigate to Settings → Notifications | Toggle list is visible |
| Disable `booking_confirmed` type | — |
| Trigger another booking confirm | No snackbar appears for that type |

**Pass criteria:** Snackbar fires on first confirm; toggles suppress future ones.

---

## MT-10 — Auto-accept job fires on quote submission

**Purpose:** A servicer with auto-accept enabled should have a proposal
submitted automatically when a matching quote arrives.

| Step | Expected result |
|------|-----------------|
| Log in as `servicer.2@demo.local` | — |
| Set up auto-accept on their service listing (if not seeded) | — |
| Submit a matching quote as `customer.fresh@demo.local` | — |
| Within ~2 s | A `QuoteProposal` is created automatically (visible in Prisma Studio or servicer portal) |
| Customer proposal list | Proposal from `servicer.2` visible without any manual action |

**Pass criteria:** Proposal created without servicer manually opening the quote.

---

## MT-11 — Invoice PDF generated after job completion

**Purpose:** Confirm the `invoice.generate` BullMQ job creates a PDF and
stores it.

| Step | Expected result |
|------|-----------------|
| Complete any booking (confirm → arrive → done) | `invoice.generate` job enqueued |
| Start worker if not running (`npm run worker`) | — |
| Wait ~5 s for job to process | — |
| Check `Invoice` table in Prisma Studio | Row created, `pdfUrl` populated (S3 URL or local path) |
| Navigate to servicer → Invoices | Invoice visible with download link |

**Pass criteria:** PDF URL present in DB; invoice appears in servicer portal.
(S3 upload requires valid credentials; without them, the URL may be a local
placeholder — confirm the job does not crash.)

---

## MT-12 — Demo account blocked in production mode

**Purpose:** Demo accounts must not be usable in production.

| Step | Expected result |
|------|-----------------|
| Set `NODE_ENV=production` in `backend/.env` temporarily | — |
| Restart the backend | — |
| Attempt login as `customer.fresh@demo.local` | Response 403, `code: "FORBIDDEN"` |
| Attempt login with the `admin@demo.local` demo admin | Response 403 |
| Create a regular (non-demo) account and log in | Succeeds normally |

**Pass criteria:** All demo logins blocked; real accounts unaffected.
**Cleanup:** Revert `NODE_ENV` to `development` after this test.

---

## Regression checklist (after any schema change)

Run these after every `npm run db:reset` or `npm run db:sync`:

- [ ] `npm test` — all unit tests pass (no infrastructure required)
- [ ] `npm run test:e2e` — full E2E suite green (requires live stack)
- [ ] Prisma Studio — all tables exist, seed data present
- [ ] Backend starts without "column does not exist" errors
- [ ] One full manual booking lifecycle (quote → done → invoice)
- [ ] MT-2 (countdown), MT-4 (sockets), MT-9 (notifications) spot-checked
