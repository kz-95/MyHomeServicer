# Settings Refinements - Customer + Servicer

> 2026-05-28 · Brainstorming session · Design decisions made during review

## Customer Settings - Changes

### 1. Add email field to Profile

**File:** `frontend/src/app/customer/pages/account.component.ts`

The current Profile form has Name, Phone, Contact name, Contact number, Preferred time slot - but **no email**. Add it to the grid:

```html
<div class="grid">
  <label>Name<input [(ngModel)]="p.name" name="name" /></label>
  <label>Email<input [(ngModel)]="p.email" name="email" type="email" /></label>      <!-- NEW -->
  <label>Phone<input [(ngModel)]="p.phone" name="phone" /></label>
  <label>Contact name<input [(ngModel)]="p.contactName" name="cn" /></label>
  <label>Contact number<input [(ngModel)]="p.contactNumber" name="cnum" /></label>
  <label>
    Preferred time slot
    <select [(ngModel)]="p.preferredTimeSlot" name="ts">
      ...
    </select>
  </label>
</div>
```

The `Profile` interface already has `email: string` (line 15 in account.component.ts). The grid layout is 2 columns, so email slots into the first column naturally. The `saveProfile()` PATCH already sends email - it just wasn't exposed in the template.

### 2. Remove "Saved Addresses" section

**File:** `frontend/src/app/customer/pages/account.component.ts`

Remove lines 114-144 (the entire `<section class="card page-child">` for Saved Addresses):

```
<!-- Addresses -->
<section class="card page-child">    ← DELETE THIS ENTIRE BLOCK
  <div class="head">                 ...
  ...
</section>
```

**Rationale:** The "Contact & Address Settings" (QuotePresets) section below already bundles contact + address into a single preset. The quote form's preset picker auto-fills the address (via `addressId`). Having a separate address management section alongside presets is redundant and confusing - same data, two places to manage it.

### 3. Contact & Address Presets - redesign to default + list

**File:** `frontend/src/app/customer/pages/account.component.ts`

Replace the current flat list of presets with a two-tier layout - default preset highlighted at top, remaining presets listed below:

**With default preset:**
```
┌── Contact & Address Settings ──────────────────────────┐
│                                                         │
│  Default preset                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │  🏠 Home - Ahmad · 012-3456789                     ││
│  │     12, Jalan SS2/1, 47300 PJ · Morning slot       ││
│  │  [Edit]  [Remove]                                   ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  Saved presets (3)                                       │
│  ┌─────────────────────────────────────────────────────┐│
│  │  🏢 Office - Sarah · 012-9876543                   ││
│  │     45, Jalan Ampang, KL · Lunch slot              ││
│  │  [Select as default]  [Edit]  [Remove]             ││
│  ├─────────────────────────────────────────────────────┤│
│  │  🏡 Parents - Ali · 011-2345678                    ││
│  │     8, Taman Desa, PJ · Evening slot               ││
│  │  [Select as default]  [Edit]  [Remove]             ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  [＋ Add new preset]                                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**With no presets yet:**
```
┌── Contact & Address Settings ──────────────────────────┐
│                                                         │
│  No preset saved yet.                                   │
│  Save your contact & address for faster quoting.        │
│                                                         │
│  [＋ Add new preset]                                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Behavior changes:**
- Default preset field: `isDefault` (already exists on QuotePreset model)
- Prominently displayed at top with no "Select" button (it IS the default)
- Other presets listed below with `[Select as default]` button to re-assign
- `[Select as default]` → PATCH `/user/me/quote-presets/:id` setting `isDefault: true` (clears others)
- Quote form preset picker: pre-selects the default preset on init, user can switch to another
- If user deletes the default, next preset in list becomes default (or none if empty)

### 3b. Preset address auto-fill in quote form (already works)

The preset picker in the quote form already calls `applyPresetObject()` which sets `addressId`, `contactName`, `contactNumber`, etc. No code change needed.

The preset picker in the quote form (`quote-form.component.ts`) already calls `applyPresetObject()` which sets `this.f.addressId = p.addressId` (line 1009). When the user picks a preset, the address dropdown selects the corresponding saved address. No code change needed here - the user was asking for this behavior and it already exists.

If the user wants **inline address preview** in the preset dropdown (showing the address text alongside the contact name), that's a small UI enhancement:

```html
<!-- In the preset picker dropdown, show address as subtitle -->
<select #cpick (change)="applyPreset(cpick.value)" name="preset">
  <option value="">- Enter details manually -</option>
  @for (p of presets(); track p.id) {
    <option [value]="p.id">
      {{ p.label || p.contactName }} · {{ p.contactNumber }}
      - {{ p.address?.address || 'No address' }}
    </option>
  }
</select>
```

## Servicer Settings - Changes

### 4. Profile visibility toggles (public email/phone)

**File:** `frontend/src/app/servicer/pages/account.component.ts`

Add visibility toggles to the Profile section. Each toggle controls whether the field is visible to customers on the servicer's public profile / job dispatch view:

```
┌── Profile ─────────────────────────────────────────────┐
│  [Logo upload/remove]  Business name                   │
│  Bio textarea  ·  Service areas (Places chips)         │
│                                                         │
│  Email:  [text input]      ☑ Show to customers         │
│  Phone:  [text input]      ☑ Show to customers         │
│                                                         │
│  [Save profile]                                         │
└────────────────────────────────────────────────────────┘
```

**Schema additions on `Servicer` model:**

```prisma
model Servicer {
  // existing fields...
  showEmailPublic     Boolean  @default(false) @map("show_email_public")
  showPhonePublic     Boolean  @default(false) @map("show_phone_public")
}
```

These fields control whether the servicer's email and phone are:
- Visible in the **job dispatch overlay** (customer contact info panel)
- Visible on any future **public servicer profile/storefront page**
- **NOT** related to the Phase 6 identity avatars - those show the *customer's* details to the servicer, not the other way around

**Backend:** Add fields to `Servicer` model, include in `PATCH /servicer/account` body validation, return in `GET /servicer/account`.

**Frontend:** Checkbox inputs in Profile section. On the dispatch overlay, conditionally show/hide email and phone based on these flags.

### 5. Invoice formatting - prefix/content/suffix

**File:** `frontend/src/app/servicer/pages/account.component.ts`

The current invoice formatting already has: Prefix, Year format, Separator, Padding. Extend it to support a **content** (custom text that goes after the prefix) and **suffix** (appended at the end):

**Current format:** `{prefix}{separator}{year}{separator}{number padded}` → `INV-2026-0042`

**New format:** `{prefix}{content}{separator}{year}{separator}{number padded}{suffix}`

Example patterns:
- `INV-2026-0042` (current default)
- `HS/2026/0042/SVC` (prefix=HS, separator=/, suffix=/SVC)
- `AHMAD-2026-0042` (prefix=AHMAD, no suffix)
- `SVC-26-42` (prefix=SVC, year=YY, padding=2)

**UI change** - add Content and Suffix inputs:

```html
<div class="row">
  <label>Prefix<input [(ngModel)]="f.invoicePrefix" name="ip" placeholder="INV" /></label>
  <label>Content<input [(ngModel)]="f.invoiceContent" name="ic" placeholder="(optional)" /></label>  <!-- NEW -->
  <label>Suffix<input [(ngModel)]="f.invoiceSuffix" name="isuf" placeholder="(optional)" /></label>  <!-- NEW -->
</div>
<div class="row">
  <label>
    Year format
    <select [(ngModel)]="f.invoiceYearFormat" name="iyf">
      <option value="YYYY">YYYY (e.g. 2026)</option>
      <option value="YY">YY (e.g. 26)</option>
      <option value="none">None</option>
    </select>
  </label>
  <label>
    Separator
    <input [(ngModel)]="f.invoiceSeparator" name="is" placeholder="-" maxlength="3" />
  </label>
  <label>
    Number padding
    <input type="number" min="1" max="10" [(ngModel)]="f.invoicePadding" name="ipad" />
  </label>
</div>
<p class="preview muted small">Preview: <strong>{{ invoicePreview() }}</strong></p>
```

**Backend:** `invoiceContent` and `invoiceSuffix` fields on `Servicer` model, both nullable strings. Include in the PATCH/GET for `/servicer/account`.

## Files changed (summary)

| File | Change |
|------|--------|
| `frontend/src/app/customer/pages/account.component.ts` | Add email field to Profile grid; remove Saved Addresses section |
| `frontend/src/app/servicer/pages/account.component.ts` | Add profile visibility toggles; extend invoice formatting with Content + Suffix |
| `backend/prisma/schema.prisma` (Servicer) | Add `showEmailPublic`, `showPhonePublic`, `invoiceContent`, `invoiceSuffix` |
| `backend/src/routes/servicer.routes.ts` | Extend PATCH/GET validation for new fields |
| `docs/ai-context/schema-notes.md` | Add new fields |
| `docs/api-reference/api-doc.md` | Update `PATCH /servicer/account` docs |

## DoD

| Gate | Expected |
|------|----------|
| `npx prisma db push` | Red/green for DLL lock, then clean |
| `npx tsc --noEmit` backend | 0 errors |
| `ng build` frontend | Exit 0 |
| Customer profile saves email | ✅ |
| Saved Addresses section gone from customer account | ✅ |
| Preset picker shows address in dropdown | ✅ |
| Servicer profile has email/phone visibility checkboxes | ✅ |
| Visibility flags control show/hide in dispatch overlay | ✅ |
| Invoice formatting includes Content + Suffix + preview updates | ✅ |
