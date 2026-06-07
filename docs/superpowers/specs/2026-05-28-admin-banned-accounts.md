# Admin Banned Accounts Tab

> 2026-05-28 · Brainstorming session · Ready for execution
> Dependency: requires **Deactivate Account** spec (BannedEmail model + ban logic)

## Goal

Admin can view and manage banned email addresses from a dedicated UI tab. See who was banned, when, why, and manually unban or ban an email.

## Where it lives

New tab under **Admin → Platform Settings** — alongside General, Categories, Servicer, Location, Thumbnails (from the admin-redesign spec):

```
┌──────────┬──────────────┬───────────┬─────────────┬──────────────┬──────────┐
│ General  │  Categories  │ Servicer  │  Location   │  Thumbnails  │  Banned  │
└──────────┴──────────────┴───────────┴─────────────┴──────────────┴──────────┘
```

## Backend API

### GET /admin/banned-emails

```typescript
Query params: search (string?), page (default 1), limit (default 20)

Response: {
  data: {
    id: string;
    email: string;
    reason: string | null;
    bannedAt: string;
    bannedBy: string | null;
    deactivations: number;
  }[];
  total: number;
  page: number;
}
```

### POST /admin/banned-emails

Manually ban an email (admin action):

```typescript
validate([
  body('email').isEmail(),
  body('reason').optional().isString(),
])
// PIN-gated via x-action-pin header
```

### DELETE /admin/banned-emails/:id

Unban an email (remove from BannedEmail table):

```typescript
// PIN-gated via x-action-pin header
Response: { message: 'Email unbanned.' }
```

## Frontend

**File:** `admin/pages/settings.component.ts` — add "Banned" tab

### Template

```
┌─────────────────────────────────────────────────────┐
│  Banned Emails                                      │
│                                                     │
│  ┌─ Search ─────────────────────────────────────────┐│
│  │  [Search by email…                     🔍]       ││
│  │                                         [+Ban]   ││
│  └──────────────────────────────────────────────────┘│
│                                                     │
│  ┌── Results ──────────────────────────────────────┐│
│  │  Email                    Reason     Banned     ││
│  │  spammer@example.com      Spam       15 Jun ☑  ││
│  │  abuser@test.com          Abuse      14 Jun ☑  ││
│  │  ahmad_d10@gmail.com      Auto-ban   13 Jun ☑  ││
│  │   (auto-ban after 10 deactivations)            ││
│  └──────────────────────────────────────────────────┘│
│                                                     │
│  Showing 1-3 of 3 results                           │
└─────────────────────────────────────────────────────┘
```

### Ban modal

```
┌────────────────────────────────────────────┐
│  Ban Email                                 │
│                                            │
│  Email          [____________________]     │
│  Reason         [____________________]     │
│                                            │
│  [Ban]     [Cancel]                        │
└────────────────────────────────────────────┘
(PIN-gated — admin PIN required)
```

### Unban confirmation

```
┌────────────────────────────────────────────┐
│  Unban this email?                         │
│                                            │
│  spammer@example.com will be allowed       │
│  to register again.                        │
│                                            │
│  [Unban]     [Cancel]                      │
└────────────────────────────────────────────┘
(PIN-gated)
```

### Empty state

```
┌────────────────────────────────────────────┐
│  No banned emails.                         │
│                                            │
│  Banned accounts from deactivation or      │
│  manual admin action will appear here.     │
└────────────────────────────────────────────┘
```

## DoD

| Gate | Expected |
|------|----------|
| `ng build` frontend | Exit 0 |
| Banned tab visible in Platform Settings | ✅ |
| Search filters by email substring | ✅ |
| List shows email, reason, banned date, deactivation count | ✅ |
| Manual ban via [+Ban] button → PIN gate → POST | ✅ |
| Unban via ☑ button → confirmation → PIN gate → DELETE | ✅ |
| Auto-banned emails appear with "Auto-ban" reason | ✅ |
| Empty state renders when no banned emails | ✅ |
