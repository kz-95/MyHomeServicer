# Visible Calendar Date Picker

> 2026-05-28 · Brainstorming session · Approved

## Goal

Replace the native `type="date"` inputs on the customer and guest quote forms with a custom visible calendar component that sits below the date field, is collapsible, and shows the time slot selection inline.

## Scope

| Form | Current | Change |
|------|---------|--------|
| Customer quote form (`quote-form.component.ts`) | `type="date"` + separate time slot radios | Calendar component with integrated time slots |
| Guest quote form (`guest-quote.component.ts`) | `type="date"` + separate time slot radios | Calendar component with integrated time slots |
| Edit quote modal (`my-quotes.component.ts`) | `type="date"` | Keep as-is - no change |

## UI Layout

```
┌─────────────────────────────────────────┐
│ Preferred date                    📅 ▾  │  ← clickable row, ▾ collapses
│ 28 May 2026 (Thursday)                  │
├─────────────────────────────────────────┤
│ ◀        May 2026            ▶         │  ← month navigation (arrows)
│ Mo  Tu  We  Th  Fr  Sa  Su            │
│          1   2   3   4   5   6         │
│  7   8   9  10  11  12  13            │
│ 14  15  16  17  18  19  20            │
│ 21  22  23  24  25  26  27            │
│ 28  29  30  31                         │
│ ───────────────────────────────────── │
│ Morning  │  Noon  │  Afternoon         │  ← time slot pills inline
│ Evening  │  Night                      │
└─────────────────────────────────────────┘
```

**Key behaviors:**

- **Visible by default** - the calendar grid shows open when the form loads
- **Collapsible** - clicking the ▾ arrow on the input row hides/shows the calendar grid
- **Month navigation** - ◀ and ▶ arrows cycle months, no year dropdown (keep it simple)
- **Date selection** - clicking a day fills the input above with readable format (e.g. "28 May 2026 (Thursday)")
- **Time slots** - rendered directly below the calendar grid as pill buttons, not separate radios
- **min date** - past dates are greyed out and unclickable (today is the minimum)

## Component design

Build a new shared component: `shared/calendar-picker.component.ts`

**Inputs:**
- `selectedDate: string` - two-way bindable (YYYY-MM-DD format for ngModel compatibility)
- `selectedSlot: string` - two-way bindable
- `minDate: string` - YYYY-MM-DD minimum date (defaults to today)
- `availableSlots: string[]` - which time slots to show (defaults to all 5)

**Outputs:**
- `selectedDateChange: string`
- `selectedSlotChange: string`

**Internal state:**
- `viewMonth: number` - currently displayed month (0-11)
- `viewYear: number` - currently displayed year
- `collapsed: boolean` - is the calendar collapsed?

**Template structure:**
```
.input-row           → displays selected date + collapse toggle
.calendar-grid       → 7-column month grid
  .month-header      → ◀ Month Year ▶
  .weekday-header    → Mo Tu We Th Fr Sa Su
  .day-cell (× ~35)  → numbered days, today highlighted, past greyed
.time-slot-row       → pill buttons for each available slot
```

**Edge cases:**
- No date selected yet → input shows "Select a date"
- Month with 31 days → 5 rows of 7 (day cells wrap to next month's grid)
- Current month → today's cell highlighted
- Switching months preserves the selected date highlight if visible

## Integration

### Customer quote form (`quote-form.component.ts`)
Replace lines ~224-247 (date input + time slot radios) with:
```html
<app-calendar-picker
  [(selectedDate)]="f.preferredDate"
  [(selectedSlot)]="f.timeSlot"
  [minDate]="todayStr"
/>
```

### Guest quote form (`guest-quote.component.ts`)
Replace lines ~224-240 (date input + time slot radios) with the same component.

### Form state
No change to `f.preferredDate` or `f.timeSlot` - the component uses the same string format.

## No backend changes

This is purely a frontend replacement. The calendar generates all dates client-side. No new API, no schema changes, no seed updates. The date is submitted in the same format as before.

## Testing

- Calendar shows correct days for current month
- Clicking a day sets the date in the input
- Month navigation arrows cycle correctly (including December→January)
- Past dates (before today) are greyed and not clickable
- Time slot pills highlight on click, only one selected at a time
- Collapse toggle hides/shows the grid smoothly
- Component works in both customer and guest quote forms
