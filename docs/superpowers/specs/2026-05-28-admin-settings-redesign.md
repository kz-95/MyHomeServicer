# Admin Platform Settings Redesign

> 2026-05-28 · Brainstorming session · Approved

## Goal

Restructure the admin Platform Settings page from the current 4-tab layout into a cleaner 5-tab layout that groups all per-category configuration into one place, adds time slot management, custom question CRUD, and global condo entry note.

## Current layout

```
┌───────────┬────────────┬───────────┬──────────────┐
│ Customer  │  Servicer  │ Platform  │  Thumbnails  │
├───────────┼────────────┼───────────┼──────────────┤
│ Budget    │ Min charge │ Fee rate  │ Per-category │
│ ranges    │ Deposit    │ SST rate  │ image upload │
│ per-cat   │ No-show    │ Quote     │              │
│ Discount  │ thresholds │ buffer    │              │
│           │            │ Discount  │              │
└───────────┴────────────┴───────────┴──────────────┘
```

Problem: per-category settings (budget, time slots, thumbnails, custom questions) are scattered across tabs. No admin UI for time slots or custom questions.

## New layout

```
┌──────────┬──────────────┬───────────┬─────────────┬──────────────┐
│ General  │  Categories  │ Servicer  │  Location   │  Thumbnails  │
└──────────┴──────────────┴───────────┴─────────────┴──────────────┘
```

## Tab details

### General tab

Global one-value settings on a single page:

| Setting | Type | Current key |
|---------|------|-------------|
| Platform fee rate | % input | `platform_fee_rate` |
| SST rate | % input | `sst_rate` |
| Quote buffer | minutes input | `quote_buffer_minutes` |
| No-response discount | type select + value + expiry | `no_response_discount` |
| Condo entry note | textarea | new key: `condo_entry_note` |

The **condo entry note** is shown to the customer when they select "Condo" as property type in the quote form. Example: *"If you live in a condo, please inform your management and guide the servicer on how to enter your building. Each condo has its own visitor policy."*

### Categories tab

Search bar + filter dropdown (All / Active / Inactive). Each category is a collapsible card.

**Within each expanded category:**

| Section | UI | Source |
|---------|-----|--------|
| **Budget ranges** | Existing range-row UI (min–max inputs + Add/Remove) | Stored in `budget_ranges` platform setting per-category |
| **Time slots** | Checkboxes: ☐ Morning ☐ Noon ☐ Afternoon ☐ Evening ☐ Night | New per-category field `allowedTimeSlots` (String[] on Category model) |
| **Custom questions** | Full CRUD: list of questions with Add/Edit/Delete/Reorder | `questionSchema` JSON field on Category model |
| **Condo note** | *(Removed from per-category — moved to General tab)* | — |
| **[Save]** button | Saves all changes for this category | PATCH `/admin/categories/:id` |

**Custom questions CRUD:**
Each question has:
- Label (string, e.g. "Select type of aircon and type of cleaning")
- Type (radio / checkbox / text)
- Required (boolean toggle)
- Priced (boolean toggle — priced questions feed `computePrefill()` proposal price calc)
- Options (for radio/checkbox): list of { value, label } with Add/Remove per row

Backend: extends existing `PATCH /admin/categories/:id` to accept `questionSchema` updates.

### Servicer tab

Unchanged from current — rules for charge floors, deposit/withdrawal limits, no-show enforcement. Will be extended later with team size rules when the servicer proposal feature is designed.

### Location tab

New tab for postcode-to-district/state mapping. Searchable table with postcode, district, state columns. Allows manual overrides. Backed by seeded `Postcode` model.

### Thumbnails tab

Unchanged from current — per-category image upload with preview and clear.

---

## Schema changes

### Category model additions

```prisma
model Category {
  // existing fields...
  allowedTimeSlots  String[]  @default(["morning","noon","afternoon","evening","night"]) @map("allowed_time_slots")
}
```

### Postcode model (new)

```prisma
model Postcode {
  postcode String  @id
  district String
  state    String
  lat      Float?
  lng      Float?

  @@map("postcodes")
}
```

### Global settings additions

New key `condo_entry_note` in `PlatformSettings` key-value store.

---

## Backend API

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/admin/categories` | List all categories with all fields (for admin) |
| `PATCH` | `/admin/categories/:id` | Update category: budget ranges, time slots, question schema (PIN-gated) |
| `GET` | `/admin/postcodes` | List/search postcodes (with query param) |
| `POST` | `/admin/postcodes` | Add/override postcode mapping |
| `POST` | `/admin/postcodes/import` | Bulk import postcode CSV |
| `GET` | `/postcodes/lookup?q=47300` | Public: postcode → district + state (used by address auto-fill) |

Existing `GET/PATCH /admin/settings` remains for the key-value store settings.

---

## Frontend components

| Component | File | Description |
|-----------|------|-------------|
| `settings.component.ts` | `admin/pages/settings.component.ts` | Main page — rebuild tabs, add Categories component |
| *(inline)* | Inside settings | Categories tab: search bar + filter + collapsible category cards |
| *(inline)* | Inside settings | Custom question editor: inline CRUD rows per category |
| *(postcodes)* | New or inline | Location tab: searchable postcode table |

---

## Seed data

- Time slots on all 11 categories: default all 5 slots (`morning`, `noon`, `afternoon`, `evening`, `night`)
- Aircond category: disable `night` slot
- Postcodes: seed with ~100 major Malaysian postcodes covering all states and major districts (expandable via CSV import)
- Condo entry note: default text seeded in `static.ts`

---

## Testing

- Admin can view categories tab, search, and filter
- Admin can toggle time slots per category and save
- Admin can add/edit/delete custom questions per category
- Postcode lookup returns correct district + state
- Condo entry note appears in General tab and is used in quote form when property type is Condo
