# Quote Form — Preset Picker Integration — F-C (remaining work)

> 2026-05-28 · Brainstorming session · Ready for execution

## Goal

Complete the quote-form preset integration. The backend CRUD infrastructure and account-page preset management already exist. The quote form already has a preset picker dropdown that auto-fills contact fields. The remaining piece is a **"Save as preset" button** inside the quote form so customers can create a preset from their current Contact step values without leaving the quote flow.

## Current state — what already works

### Backend (✅ Complete)
- `QuotePreset` model with fields: `id`, `userId`, `label`, `contactName`, `contactNumber`, `addressId`, `instruction`, `preferredTimeSlot`, `isDefault`
- CRUD endpoints: `GET/POST /user/me/quote-presets`, `PATCH/DELETE /user/me/quote-presets/:id`
- All routes Zod-validated

### Account page UI (`account.component.ts`) — ✅ Complete
- "Contact & Address Settings" section with saved presets list
- Add/Edit/Delete preset modals
- 10-entry limit enforced
- Default-preset tagging

### Quote form picker (`quote-form.component.ts`) — ✅ Complete
- `presets` signal loaded from `GET /user/me/quote-presets` on init (line 713)
- Dropdown at top of Contact step: "Use a saved quote preset" (lines 177-185)
- `applyPresetObject()` fills: `contactName`, `contactNumber`, `addressId`, `notes` (from `instruction`), `timeSlot` (from `preferredTimeSlot`) — lines 1006-1012
- Clear "— Enter details manually —" default option

### Guest quote form (`guest-quote.component.ts`) — ✅ No change needed
- Guests have no account, so presets are irrelevant for them
- Guest→logged-in conversion already handled

## What's left to build

### "Save as preset" button in quote form

**File:** `frontend/src/app/customer/pages/quote-form.component.ts`

Add a ghost button at the bottom of the Contact step fields (above the error/actions row):

```html
<button
  type="button"
  class="btn-ghost small-btn"
  (click)="saveAsPreset()"
  [disabled]="savingPreset()"
>
  {{ savingPreset() ? 'Saving…' : 'Save as preset for next time' }}
</button>
```

**Component logic:**

```typescript
savingPreset = signal(false);

saveAsPreset(): void {
  if (!this.f.contactName.trim() || !this.f.contactNumber.trim()) return;
  if (this.presets().length >= 10) {
    this.toast.warning('You've reached the 10-preset limit. Delete one in your account settings first.');
    return;
  }
  this.savingPreset.set(true);
  const label = `${this.f.contactName} — ${this.categoryName() || 'service'}`;
  this.api.post('/user/me/quote-presets', {
    label,
    contactName: this.f.contactName,
    contactNumber: this.f.contactNumber,
    addressId: this.f.addressId || undefined,
    instruction: this.f.notes || undefined,
    preferredTimeSlot: this.f.timeSlot || undefined,
  }).subscribe({
    next: () => {
      this.savingPreset.set(false);
      this.toast.success('Saved as a preset.');
      // Reload presets list so the new preset appears in the dropdown
      this.api.get<{ data: Preset[] }>('/user/me/quote-presets').subscribe({
        next: (r) => this.presets.set(r.data),
      });
    },
    error: (e) => {
      this.savingPreset.set(false);
      this.toast.error(e.message ?? 'Could not save preset.');
    },
  });
}
```

**UI placement:** Between the "extra details" textarea and the `stepError()` + actions row. Same visual style as the "+ New address" button — ghost button with `small-btn` class.

**Constraints:**
- Button disabled if `contactName` or `contactNumber` is empty (required fields)
- 10-preset limit enforced client-side before POST (server also enforces)
- After save: reload presets list, show success toast, preset appears in dropdown immediately
- Does NOT navigate away from the quote form — user stays on Contact step
- Does NOT change the preset dropdown selection (stays on "— Enter details manually —")

### ToastService import

The `ToastService` needs to be injected in `QuoteFormComponent`. Check if it already exists — if not:

```typescript
private toast = inject(ToastService);
```

Add to the import list:
```typescript
import { ToastService } from '../../core/services/toast.service';
```

## DoD

| Gate | Expected |
|------|----------|
| `ng build` | Exit 0 |
| `npx tsc --noEmit` | 0 errors |
| "Save as preset" button visible on Contact step when name+number filled | ✅ Visible |
| Button hidden/disabled when name/number empty | ✅ Disabled |
| Click saves preset via POST `/user/me/quote-presets` | ✅ Preset created |
| Preset appears in dropdown without page reload | ✅ Reloads list |
| 10-preset limit shows warning toast | ✅ Toast shown |
| Guest quote form unchanged | ✅ No regression |
| Existing preset picker + auto-fill still works | ✅ Unchanged |

## Files changed

| File | Change |
|------|--------|
| `frontend/src/app/customer/pages/quote-form.component.ts` | Add `savingPreset` signal, `saveAsPreset()` method, "Save as preset" button in Contact step template, `ToastService` inject |
