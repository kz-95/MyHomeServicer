# Admin Account — How It Works

> 2026-06-26 — Current state documentation.

## Admin credentials

| Field | Value |
|-------|-------|
| Email | `admin@demo.local` |
| Password | `Demo@2026` |
| Action PIN | `1234` |

Seeded by `backend/prisma/seed/seed.ts` line 818-820:
```typescript
email: 'admin@demo.local',
role: 'admin',
passwordHash: bcrypt.hashSync('Demo@2026', 10),
actionPinHash: bcrypt.hashSync('1234', 10),
```

## How to register as admin

There is **no public registration** for admin accounts. Admins are created via:
- **Seed**: `npm run db:reset` creates `admin@demo.local`
- **Manual DB insert**: Insert a row into the `users` table with `role = 'admin'`
- **Promotion**: A backend script or direct DB update can promote an existing user:
  ```sql
  UPDATE users SET role = 'admin' WHERE email = 'existing@user.com';
  ```

## Admin authentication flow

1. Admin visits `/login` page
2. Enters `admin@demo.local` + `Demo@2026`
3. Backend `auth.service.ts` checks: `user.role === 'admin'`
4. Issues JWT with `{ role: 'admin' }` in the payload
5. Frontend redirects to `/admin/dashboard`

## Admin route protection

All `/admin/*` routes use `requireAdmin` middleware (`backend/src/middleware/auth.ts:129`):
```typescript
export function requireAdmin(req, _res, next) {
  if (req.user.kind !== 'user' || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin account required' });
  }
  next();
}
```

## Action PIN

Sensitive admin actions require a second factor — the action PIN. The `requirePin` middleware (`backend/src/middleware/pin.ts:32`) validates `x-action-pin` header against the admin's `actionPinHash`.

Actions requiring PIN:
- Editing accounts, approving withdrawals, approving appeals
- Approving category requests
- Changing platform settings
- Editing/creating FAQ entries
- Unbanning users
- Saving platform fee rate, reward tiers, reward catalog
- Approving identity change requests

The demo admin PIN is `1234` (seeded, can be changed via `/admin/account`).

## Admin dashboard

The admin dashboard at `/admin/dashboard` shows:
- **Financial cards**: Gross Cashflow (IN/OUT/GROSS/Cashflow), Revenue, Escrow, Urgent
- **Pending queues**: Withdrawals, Appeals, Category Requests, Open Reports
- **Revenue chart**: 4-line SVG chart with date range + quarter controls + chart filter pills
- **Category breakdown**: Sortable table with search
- **Customer leaderboard**: Top 20 by spend
- **Servicer leaderboard**: Top 20 by revenue

All metrics are live SQL queries against the `bookings` and `transactions` tables. No pre-calculated values.

## Admin pages

| Route | Page |
|-------|------|
| `/admin/dashboard` | Financial dashboard |
| `/admin/users` | User management (customers, servicers, banned) |
| `/admin/servicers` | Servicer management |
| `/admin/quotes` | Quote management |
| `/admin/disputes` | Dispute management |
| `/admin/settings` | Platform settings |
| `/admin/money-settings` | Financial settings (fees, rewards, tiers, penalties) |
| `/admin/ai-chat-settings` | AI chatbot knowledge base + FAQ management |
| `/admin/reports` | Reports and audit log |

## Admin session

- JWT token stored in `localStorage`
- Token includes `role: 'admin'`
- Session persists across browser refreshes
- Logout clears token and redirects to `/login`

## Unplugging demo mode

The demo bar at the top of every page has an "Unplug" button. It:
1. Shows a 3-step confirmation modal
2. Requires admin PIN
3. Calls `POST /dev/clear-content` with PIN
4. Clears ALL demo data (calls `clearAll()` — same as `npm run reseed`)
5. Leaves admin logged in but with empty database

To recover after unplug: `npm run db:reset` re-seeds all demo data.
