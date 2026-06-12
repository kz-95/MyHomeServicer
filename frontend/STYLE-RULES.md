# Style Rules — My Home Servicer

> **Design direction:** Warm Editorial / Artisanal Marketplace
> **Date:** 2026-05-25 (rev. 2026-06-03 — quote form UX overhaul, §7.4-§7.7 added, §7.5→§7.20 renumbered)
> **Status:** ✅ Active — supersedes the audit-oriented `UI-UX-GUIDELINES.md` (deleted).
> This is the **prescriptive source of truth** for all frontend styling.

---

## 1. Design Direction

**Tone:** Warm, trustworthy, refined, editorial. Like a high-end print magazine
for home living — not a tech dashboard.

**What makes this unforgettable:** The burnt-orange(`--color-primary: #e07a3a`) and warm cream palette creates an immediate sense of warmth and craft. Cards use a three-layer stack — full-bleed photo → primary-colour washout gradient → white text — with staggered content reveal.

**Target audience:** Malaysian homeowners and independent service providers.
The design should feel local and grounded, not generic and globalised.

---

## 2. Colour System

### 2.1 Brand palette

```
--color-primary:        #e07a3a   burnt orange — CTA, links, active states
--color-primary-dark:   #c05e28   hover / pressed
--color-primary-light:  #f5e0d0   badge bg, light tint
--color-bg:             #faf7f2   warm cream — page canvas
--color-surface:        #ffffff   cards, panels, inputs
--color-border:         #e8e0d8   warm beige — dividers, borders
--color-text:           #2c2420   warm charcoal
--color-muted:          #6b6258   warm stone (darkened for 4.5:1 AA contrast)
--color-text-inverse:   #f5f0ea   light text on dark surfaces
```

### 2.2 Semantic palette

```
--color-success:        #4a8c5c    sage green
--color-success-bg:     #edf5ed
--color-danger:         #b9423a    brick red
--color-danger-bg:      #f8edec
--color-warning:        #c4903a    warm amber
--color-warning-bg:     #faf3e5
--color-promo:          #7a5a8c    muted aubergine
--color-promo-bg:       #f0ebf5
--color-promo-text:     #5a3a6c
--color-promo-border:   #ddd6e8
--color-accent:         #c4903a    Yellow orange — secondary brand element
--color-accent-bg:      #edf3ea
```

### 2.3 Status badge tokens

| Status    | bg        | text      | border    |
| --------- | --------- | --------- | --------- |
| open      | `#f0d6cc` | `#a8472e` | `#e3bfb3` |
| accepted  | `#e0eef5` | `#2a6b8c` | `#c5dae6` |
| progress  | `#faf0d1` | `#8c6a2a` | `#eddcae` |
| completed | `#dce8dc` | `#3a6c3a` | `#bcd0bc` |
| paid      | `#e4f0e8` | `#2e7a42` | `#bcd5c0` |
| cancelled | `#f0dcdc` | `#8c2a2a` | `#e3bebe` |
| pending   | `#f5ebd6` | `#8c702a` | `#e3d4ae` |

### 2.3b Status display names and badge mapping

Map human-readable display names to the §2.3 badge tokens. Use the shared `statusBadgeClass(status)` utility (`shared/status-badge.util.ts`) — it returns the CSS class string `badge badge-{token}` so every page renders badges consistently.

| Display name      | Backend status    | Badge token |
| ----------------- | ----------------- | ----------- |
| Request Pending   | `pending_confirm` | `open`      |
| Choose Proposals  | `pending_start`   | `accepted`  |
| In Progress       | `in_progress`     | `progress`  |
| Confirmed         | `confirmed`       | `accepted`  |
| Completed         | `completed`       | `completed` |
| Cancelled         | `cancelled`       | `cancelled` |
| Paid              | `paid`            | `paid`      |
| Pending (generic) | `pending`         | `pending`   |

**`statusBadgeClass(status: string): string`** — returns `'badge badge-open'`, `'badge badge-progress'`, etc. Import from `shared/status-badge.util.ts`. Never hand-roll per-page badge class logic.

### 2.4 Elevation & shadows

```
--shadow:          0 1px 3px rgba(44, 36, 32, 0.06)
--shadow-md:       0 4px 14px rgba(44, 36, 32, 0.08)
--shadow-lg:       0 12px 40px rgba(44, 36, 32, 0.15)
--shadow-primary:  0 2px 8px rgba(201, 90, 60, 0.25)
--color-backdrop:  rgba(28, 22, 18, 0.45)
```

### 2.5 Focus rings

```
--focus-ring:        0 0 0 3px rgba(201, 90, 60, 0.22)
--focus-ring-danger: 0 0 0 2px rgba(185, 66, 58, 0.2)
```

### 2.6 Gradient system

Gradients add depth to flat-colored surfaces without changing brand hue. Always pair with a solid `var(--color-*)` fallback on the same property so the cascade is explicit.

```css
/* Warm (default) — day primary gradients use a richer terracotta base #c95a3c
   (deeper/redder than the flat --color-primary #e07a3a; intentional, see formula) */
--gradient-primary: linear-gradient(135deg, #c95a3c 0%, #d4784a 100%)
  --gradient-primary-hover: linear-gradient(135deg, #a8472e 0%, #c95a3c 100%)
  --gradient-accent: linear-gradient(135deg, #c4903a 0%, #d4a84a 100%)
  --gradient-hero: linear-gradient(
    160deg,
    #fdf4ee 0%,
    #faf7f2 55%,
    #f5ede4 100%
  )
  --gradient-sidebar: linear-gradient(135deg, #c95a3c 0%, #a8472e 100%)
  /* Night ([data-theme="cool"] overrides) */
  --gradient-primary: linear-gradient(135deg, #d4884a 0%, #df9854 100%)
  --gradient-primary-hover: linear-gradient(135deg, #b8702e 0%, #d4884a 100%)
  --gradient-accent: linear-gradient(135deg, #c4903a 0%, #d4a84a 100%) ←
  identical to day
  --gradient-hero: linear-gradient(
    160deg,
    #28221a 0%,
    #1c1917 60%,
    #14110e 100%
  )
  --gradient-sidebar: linear-gradient(135deg, #d4884a 0%, #b8702e 100%);
```

**Applied to:**

| Surface                   | Token used                                        |
| ------------------------- | ------------------------------------------------- |
| `.btn-primary` (global)   | `--gradient-primary` / `--gradient-primary-hover` |
| Shell `.logo` wordmark    | `--gradient-primary` (gradient text)              |
| Shell sidebar active link | `--gradient-sidebar`                              |
| Home `.brand` wordmark    | `--gradient-primary` (gradient text)              |
| Home `.nav-btn--solid`    | `--gradient-primary`                              |
| Home `.num` step circles  | `--gradient-primary`                              |
| Home `.request-bar`       | `--gradient-primary`                              |
| Home `.page` background   | `--gradient-hero`                                 |

**Gradient formula:**

- **Day** primary gradients use a richer terracotta base `#c95a3c` — deeper and redder than the flat `--color-primary` (`#e07a3a`). Intentional: flat fills stay the lighter `#e07a3a`; gradients deepen for depth. `--gradient-primary`: `#c95a3c → #d4784a` (lighter end). `--gradient-primary-hover`: `#a8472e → #c95a3c` (reversed for press depth). `--gradient-sidebar`: `#c95a3c → #a8472e` (pressed/inset feel).
- **Night** primary gradients use the flat copper `#d4884a` AS their base (gradient base = flat primary, no offset). `--gradient-primary`: `#d4884a → #df9854`. `--gradient-primary-hover`: `#b8702e → #d4884a`. `--gradient-sidebar`: `#d4884a → #b8702e`.
- `--gradient-accent`: `#c4903a → #d4a84a` — **identical in both themes**. Amber/gold reads on both cream and dark stone.
- `--gradient-hero`: not primary-derived — day = cream wash, night = stone wash.

**Other rules:**

- Always write `background: var(--color-primary); background: var(--gradient-primary);` so the solid fallback is explicit before the gradient override.
- Gradient text uses `-webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;` — omit `color:` entirely.
- Never apply `--gradient-primary` inside `[data-theme="cool"]` component styles without testing both themes.

### 2.7 Rules

- Always use `var(--color-*)`. No raw hex in component styles.
- No fallback values — `var(--color-danger, red)` is forbidden.
- If a component needs a tint not in `:root`, add it to `:root` first.

---

## 3. Typography

### 3.1 Font stack

```
--font-display: 'DM Serif Display', Georgia, serif    (headings)
--font-body:    'Outfit', system-ui, -apple-system, sans-serif  (everything else)
```

Loaded in `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300..700&display=swap"
  rel="stylesheet"
/>
```

### 3.2 Scale

| Use                  | Size               | Weight | Font             |
| -------------------- | ------------------ | ------ | ---------------- |
| Hero heading (h1)    | 2.8rem → 2 → 1.7\* | 400    | `--font-display` |
| Section heading (h2) | 1.4rem             | 400    | `--font-display` |
| Subheading (h3)      | 1.15rem            | 500    | `--font-body`    |
| Card title / label   | 0.95rem            | 600    | `--font-body`    |
| Body text            | 0.95rem            | 400    | `--font-body`    |
| Small / hint text    | 0.82rem            | 400    | `--font-body`    |
| Badge / pill         | 0.7rem             | 600    | `--font-body`    |
| Table headers        | 0.78rem            | 600    | `--font-body`    |

\* Hero h1 steps: `2.8rem` >760px → `2rem` 561–760px → `1.7rem` ≤560px (canonical in §16.4).

### 3.3 Rules

- `font-family` is set on `body` — never repeat in components.
- Use `--font-display` for h1, h2, and major section headers.
- Use `--font-body` for everything else.
- All text sizes in `rem`. No `px` for font sizes.

---

## 4. Spacing System

### 4.1 Scale

```
--space-xs:   0.25rem
--space-sm:   0.5rem
--space-md:   0.75rem
--space-base: 1rem
--space-lg:   1.5rem
--space-xl:   2rem
--space-2xl:  3rem
```

### 4.2 Responsive adjustments

| Breakpoint      | Section padding | Card padding | Content max-width |
| --------------- | --------------- | ------------ | ----------------- |
| Desktop ≥1024   | 2rem 2.5rem     | 1.25rem      | 1100px            |
| Tablet 761-1023 | 1.5rem 2rem     | 1.25rem      | 100%              |
| Mobile ≤760     | 1rem 1.25rem    | 1rem         | 100%              |

### 4.3 Rules

- Use `gap` on flex/grid containers rather than `margin` on children.
- Use section padding values above for top-level page sections.

---

## 5. Breakpoints

### 5.1 Canonical

| Name | Width      | Layout mode                             |
| ---- | ---------- | --------------------------------------- |
| sm   | ≤ 560px    | Narrow mobile — single column, stacked  |
| md   | 561-760px  | Tablet narrow — sidebar collapses       |
| lg   | 761-1023px | Small desktop — sidebar visible (180px) |
| xl   | ≥ 1024px   | Full desktop — sidebar at 220px         |

### 5.2 Media query cheat sheet

```css
@media (max-width: 560px) {
  /* mobile */
}
@media (max-width: 760px) {
  /* mobile + tablet narrow */
}
@media (min-width: 761px) {
  /* desktop */
}
@media (min-width: 1024px) {
  /* wide desktop */
}
```

### 5.3 Portal shell adaptation

| Element       | Desktop ≥1024 | Tablet 761-1023  | Mobile ≤760         |
| ------------- | ------------- | ---------------- | ------------------- |
| Sidebar width | 220px         | 180px            | Full-width, scroll  |
| Topbar layout | Row all items | Row, some hidden | Wrapped, essentials |
| Demo bar      | Visible       | Visible          | Hidden              |
| Content pad   | 1.5rem 2rem   | 1.25rem 1.5rem   | 1rem                |

**Topbar behaviour:** The topbar / home topnav is a **normal element at the top of the page — no `position: sticky`, no animation.** It sits at the top of the layout and **scrolls away with the page** on scroll-down; it does not stay glued to the viewport, collapse, or fade. In the portal shell it stays at the top simply because it is the top flex row while `.body` scrolls internally (§15.4) — not via `sticky`. The earlier auto-hide / idle-fade via `appAutoHide` is **deprecated** (§7.16). The demo bar is the one exception — pinned at the very top via `position: sticky; top: 0` (§5.5).

**Flex scroll rule:** Any flex child with `overflow-y: auto` must have
`min-height: 0`. Without it, the flex item cannot shrink below its content
height and the overflow scrollbar never engages — content appears "chopped"
at the bottom of the container.

### 5.4 Mobile keyboard push

When the virtual keyboard opens on mobile, inputs near the bottom of the viewport
get pushed out of view. Global CSS in `styles.css` mitigates this:

```css
/* Applied to all scrollable containers */
padding-bottom: env(safe-area-inset-bottom);

/* Applied to inputs/textareas/selects inside scrollable areas */
scroll-margin-bottom: 80px;
```

Rule: every page's scrollable `.content-main` and form containers already inherit
this rule via `frontend/src/styles.css §5.4`. No per-component changes needed unless
a form has a custom scroll container outside `.content-main`.

### 5.5 Demo Bar

Rendered only when `config.hasDemoData` is true. Pins at the top of the page via `position: sticky; top: 0; z-index: 200` — above shell content, below modals (z-index 9999).

**Visibility:**

| Breakpoint      | Behaviour                    |
| --------------- | ---------------------------- |
| Desktop ≥761    | Visible                      |
| Tablet 761–1023 | Visible                      |
| Mobile ≤760     | **Hidden** (`display: none`) |

**Theme-aware tokens — no raw hex or hardcoded rgba:**

| Element                                          | Token                             |
| ------------------------------------------------ | --------------------------------- |
| Bar + message bar background                     | `var(--color-surface)`            |
| Bar border-bottom                                | `1px solid var(--color-border)`   |
| Link text (idle)                                 | `var(--color-muted)`              |
| Link text (hover / active)                       | `var(--color-text)`               |
| Dropdown background                              | `var(--color-surface)`            |
| Dropdown border                                  | `1px solid var(--color-border)`   |
| Dropdown shadow                                  | `var(--shadow-md)`                |
| Gold accent (badge, underlines, scrollbar thumb) | `var(--color-warning)`            |
| Hover underline from center animation            | `var(--color-warning)` (see §6.4) |

### 5.6 Portal topbar — phone (logged-in shell)

Distinct from the home/guest topnav (§12.2). The portal shell topbar (`shell.component.ts` —
customer / servicer / admin) on phone (≤560px):

- **Account name stays.** `.account` keeps `.uname` + `.utype` (the signed-in identity) — never
  a Login/Sign-up button, since the user is already in.
- **Logout becomes a far-right on/off SVG switch.** Replace the "Sign out" text button with a
  small on/off toggle pinned to the far right of the bar; flipping it signs out.
- **Shared baseline for all three roles.** Admin uses exactly this (account name + far-right
  on/off logout switch). Customer and servicer share the same baseline and add role-specific
  items later (TBD — capture when defined).

---

## 6. Motion & Animation

### 6.1 Tokens

```
--transition:            0.25s ease
--transition-fast:       0.15s ease
--transition-spring:     0.35s cubic-bezier(0.34, 1.56, 0.64, 1)
```

### 6.2 Page entry

```css
@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
/* Applied as: animation: page-enter 0.4s ease-out both; */
```

### 6.3 Staggered children

```css
.page-child {
  animation: page-enter 0.4s ease-out both;
}
.page-child:nth-child(1) {
  animation-delay: 0.05s;
}
.page-child:nth-child(2) {
  animation-delay: 0.1s;
}
.page-child:nth-child(3) {
  animation-delay: 0.15s;
}
.page-child:nth-child(4) {
  animation-delay: 0.2s;
}
.page-child:nth-child(5) {
  animation-delay: 0.25s;
}
.page-child:nth-child(6) {
  animation-delay: 0.3s;
}
.page-child:nth-child(7) {
  animation-delay: 0.35s;
}
.page-child:nth-child(8) {
  animation-delay: 0.4s;
}
```

### 6.4 Interaction micro-moments

| Element  | Trigger | Animation                            | Timing |
| -------- | ------- | ------------------------------------ | ------ |
| Buttons  | Hover   | Background shift                     | 0.25s  |
| Cards    | Hover   | Lift -2px + shadow                   | 0.25s  |
| Sidebar  | Hover   | translateX(2px)                      | 0.2s   |
| Modal    | Open    | Backdrop fade 0.2s, spring-pop 0.35s | —      |
| Toast    | Appear  | Slide up, hold 5s, fade out          | —      |
| Demo bar | Hover   | Gold underline from center           | 0.25s  |

### 6.5 Rules

- `--transition` (0.25s) is the default for all state changes.
- `--transition-fast` (0.15s) only for micro-moments (sidebar link hover).
- No decorative animation on data-heavy pages (tables, admin queues).
- Wrap animations in `@media (prefers-reduced-motion: no-preference)`.

---

## 7. Component Patterns

### 7.0 Global Prompt Guard Law

Any UI that must be the user's primary focus before they can continue (prompt guards, insufficient-credit overlays, confirmation blockers) follows these universal rules. §7.17 (proposal prompt) and §7.19 (top-up prompt) are specific applications of this law.

**Hard rules:**

1. **Fixed full-screen backdrop.** `var(--color-backdrop)` covers the entire viewport at `z-index: 9998`. Clicking the backdrop does **not** dismiss (the guard is intentionally blocking).

2. **Fixed panel above everything.** `position: fixed; z-index: 9999` — above modals, FAB, topbars. Center variant: `top: 50%; left: 50%; transform: translate(-50%, -50%)`. Bottom-anchored variant: `bottom: 0; left: 50%; transform: translateX(-50%)`.

3. **Body scroll locked.** Apply on mount, restore on dismiss and in `ngOnDestroy`:

   ```css
   body {
     overflow: hidden;
     touch-action: none;
   }
   ```

   Do NOT use `position: fixed` on `<body>` — iOS Safari loses scroll position.

4. **Internal scroll only.** Guard body: `max-height: 50–60vh; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin`.

5. **Autofocus first action.** First interactive element (primary button or input) receives focus on open.

6. **Header + footer pinned outside scroll.** Title, close (✕), and action buttons sit outside the scrollable body — always visible regardless of content length.

7. **One guard at a time.** Never stack multiple guards. Deduplicate if a second event fires while one is open.

8. **Esc dismisses** (unless intentionally non-dismissible — document the exception). Auto-dismiss timers pause on `mouseenter`, resume on `mouseleave`.

### 7.1 Cards

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.25rem 1.25rem 1.5rem; /* 24px bottom buffer — see §7.1.2 */
}
.card-hover:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  border-color: var(--color-primary-light);
}
```

#### 7.1.2 Bottom buffer (every card)

Every `.card` keeps **≥1.5rem (24px) bottom padding** — slightly more than the
20px sides/top — so a trailing action or button row never hugs the card's bottom
edge. Rules:

- A card's last child (action `.actions` row, button pair, footer note) sits inside
  the card padding. Never zero or shrink the card's `padding-bottom`, and never pull
  the buttons flush to the border.
- `.actions` rows provide their own `margin-top` for separation from the body, but
  rely on the card's bottom padding for the buffer below — do not give `.actions`
  a negative bottom margin.
- Applies app-wide to the global `.card`; component-scoped cards inherit it and must
  not override `padding-bottom` smaller than 1.5rem.

#### 7.1.1 Card-scan load animation

Card grids that load asynchronously (API call on mount) show skeleton placeholders
with a sweeping light bar (`bw-scan`) during the loading state, then reveal cards
one-by-one with a stagger (70ms interval). Rules:

- **Skeleton count:** show the same number of skeletons as the expected card count
  (or 6 if unknown).
- **`bw-scan` keyframe:** defined in `styles.css`. Apply via class `bw-scan` on the
  skeleton `.svc-card` or `.bw-card`. The sweep uses `--color-primary` gradient.
- **Stagger signal:** use a `visibleCount = signal(0)` that increments every 70ms
  inside an interval started on load; clear on destroy.
- **`prefers-reduced-motion`:** set `visibleCount` to the full count immediately —
  no stagger animation.
- **Pages that implement this:** home, browse, children-browse, my-bookings, proposals,
  servicer/services.

### 7.2 Buttons

| Class          | Style                       | Use              |
| -------------- | --------------------------- | ---------------- |
| `.btn-primary` | Terracotta fill, white text | Primary CTA      |
| `.btn-ghost`   | Transparent, warm border    | Secondary action |
| `.btn-danger`  | Brick fill, white text      | Destructive      |

**Text-padding floor:** every button keeps **≥10px padding between its text and any
edge, on BOTH axes** (vertical and inline). The global `button` base is
`padding: 0.625rem 1rem` (10px vertical × 16px horizontal). Compact variants
(`.btn-sm`, `.btn-xs`, `.chip`, pills) may use a smaller font and tighter inline
padding but **never drop below 0.625rem (10px) on either axis** — they grow taller to
meet the vertical minimum rather than crowding the text against the border. This is a
deliberate app-wide minimum (taller compact controls), not a per-surface choice.
Icon-only buttons are exempt from the inline-text floor but keep ≥10px box padding
around the glyph.

### 7.3 Badges

Use `<span class="badge badge-{status}">Label</span>` — global in `styles.css`.

### 7.4 Forms

- Global input/select/textarea styles in `styles.css` (font-size, padding, border, border-radius, focus ring).
- Validation: `[class.input-error]="condition"` — global `.input-error` class handles `border-color: var(--color-danger)` + `box-shadow: var(--focus-ring-danger)`.
- Error message: `<span class="err">Message</span>` — uses global `.err` class (persistent validation only, not transient feedback).
- Label pattern: `<label><span>Field name<span class="req"> *</span></span><input /></label>` with `flex-direction: column; gap: 0.3rem`. **Required indicators (`<span class="req">`) must be wrapped in an inner `<span>` together with the label text** — never placed directly inside the `<label>` as a solo flex item, because `flex-direction: column` would push `*` to a new line.
- Never set `width`, `padding`, `font-size`, or `border-radius` on inputs inside components unless overriding a special case.
- Focus ring: `var(--focus-ring)` for normal, `var(--focus-ring-danger)` for error state.
- Never remove `outline` on focus without a visible replacement.

### 7.4.1 Phone number inputs — `<app-phone-input>` (rule)

**Every contact-phone input in the app uses the shared `<app-phone-input>` component** (`frontend/src/app/shared/phone-input.component.ts`) — never a bare `<input type="tel">`.

- **Why:** the customer base is international (e.g. people in Malaysia using WhatsApp numbers from other countries). Phone validation must be **global, not Malaysia-only**.
- **What it is:** a country-code prefix `<select>` (default **🇲🇾 +60**, dropdown of common codes) + the local-number input. It is a `ControlValueAccessor`, so it drops into any form exactly like an input via `[(ngModel)]` / `formControlName` and reads/writes a single full E.164-style string (e.g. `+60123456789`).
- **Validation rule:** a phone is valid when it matches `^\+\d{7,15}$` after stripping spaces/dashes/parentheses (E.164 range). Use the exported `isValidPhone()` helper — do **not** re-implement a per-form or Malaysia-specific regex.
- **Default prefix:** `+60`. Users from other countries pick their own code from the dropdown.
- **Already wired:** customer + servicer account (settings), customer + guest quote forms, customer + merchant registration, admin users, and the in-chat quote assistant's combined contact card. New phone fields must use it too.
- Country-code list lives once in `PHONE_PREFIXES` (same file) — add codes there, never duplicate the list per form.

### 7.5 Form subtitle row (`.sub-row`)

- The subtitle ("Your details stay in this browser...") and "⚡ Demo: Auto-fill" button sit in a flex row: `.sub-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.2rem; }`.
- The `.sub-muted` text gets `flex: 1` to push the button right.
- The demo autofill button uses `.btn-autofill` (pill shape, muted border, transparent bg, hover transitions).

### 7.6 Summary review (`.review` grid + collapsible service)

- The review grid uses `display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem`.
- The "Service" row uses a collapsible `<details>` with a custom arrow:
  ```html
  <details class="service-details">
    <summary class="service-summary">
      Service: XXX <span class="chevron">▸</span>
    </summary>
    <div class="service-answers">
      <div class="answer-row">
        <span class="answer-label">Label:</span>
        <span class="answer-value">Value</span>
      </div>
    </div>
  </details>
  ```
  CSS: `.service-summary` removes default list marker, `cursor: pointer`. `.chevron` rotates 90deg on `details[open]` via `transition: transform 0.2s ease`.
- Address shows as two lines: `.addr-line2 { font-size: 0.85rem; color: var(--color-muted); }` for District, Postcode below the No, Street line.

### 7.7 Demo autofill

- Both guest and customer quote forms have a "⚡ Demo: Auto-fill" button.
- Guest form: always visible (above stepper). Customer form: visible when `config.hasDemoData`, placed above Name | Phone No in Step 2.
- Customer demo autofill checks saved presets first (uses default or first preset), falls back to guest-style demo data.
- The existing preset section ("Save as Preset" / "Auto-fill (use preset)") stays below the address fields — independent from the demo autofill.

### 7.8 Modals

Use `<app-modal>` for all dialogs. Never use native `alert()`, `confirm()`, or `prompt()`.

Patterns:

- Backdrop: `var(--color-backdrop)`.
- Modal: `var(--shadow-lg)`, `border-radius: var(--radius)`.
- Actions: `<div class="modal-actions">` (global class — flex row, right-aligned, `gap: 0.5rem`, `margin-top: 1rem`).
- For native-style confirm/prompt dialogs (e.g. "Are you sure?"), use `DialogService.confirm()` and `DialogService.prompt()` which route through `app-dialog-outlet`.
- **Backdrop close requires press AND release on the backdrop.** Track the
  pointer with `(mousedown)`/`(mouseup)` and only close when _both_ the press
  and the release land on the backdrop itself (`event.target === event.currentTarget`).
  A drag that starts inside the dialog (e.g. selecting text in an input) and
  releases on the backdrop must **not** close it. Applies to `app-modal` and
  `app-dialog-outlet` (confirm/alert/prompt). Never close on a bare `(click)`.

- **`<app-modal>` must be placed outside any animated element** that uses
  `transform` (including `page-enter` keyframes). A CSS `transform` (even
  `translateY(0)`) creates a new containing block, causing the modal's `position:
fixed` to target the transformed ancestor instead of the viewport. Place the
  `<app-modal>` tag after the animated wrapper, not inside it.
- **All modal scrollable containers must have `overscroll-behavior: contain`**
  to prevent scroll chaining (scrolling the modal content must not scroll the
  page or trigger auto-hide on the topbar behind it).

```html
<app-modal [open]="showEdit()" title="Edit user" (closed)="showEdit.set(false)">
  <!-- form / content -->
  <div class="modal-actions">
    <button class="btn-ghost" (click)="showEdit.set(false)">Cancel</button>
    <button class="btn-primary" (click)="save()">Save</button>
  </div>
</app-modal>
```

### 7.8.1 Help Assistant chat widget (`app-chat-widget`)

The floating AI Help Assistant has a desktop and a mobile presentation:

- **Desktop:** a docked panel (`position: fixed; bottom/right: 1.5rem; width: 480px; height: 750px; z-index: 999`) with a transparent full-viewport backdrop at `z-index: 998` that closes the panel on click.
- **Mobile (≤640px):** the panel **takes over the whole screen** (`inset: 0`, no border/radius) and the backdrop is **dimmed** (`var(--color-backdrop)`) so nothing behind it can be tapped while the chat is open. Tap the backdrop or close to return to the page. Never leave the page tappable behind an open mobile chat.
- **Status mark:** a dot before the status text — `var(--color-success)` (green) when reachable, blinking (`statusPulse`) while active; grey only when explicitly offline. The AI is HTTP-reachable, so it defaults to active and a dropped realtime socket must NOT grey it out.

### 7.9 Toasts

Use `ToastService.success()` / `.error()` / `.info()`.
Toasts auto-dismiss after 4.5s (action toasts) or 5s (notification toasts).
Never use inline `<p class="err">` for transient feedback — use `ToastService` instead.
Inline `.err` is appropriate only for persistent validation messages (field errors, page-level load errors).

**Reward / points feedback uses the brand primary — never success-green.** Anything tied to
the rewards/points system (the redeem/earn `.flash` on the Rewards page, points-earned toasts)
uses `var(--color-primary)` — orange in day, copper at night, flipping with the theme. Reserve
`var(--color-success)` green for generic "saved / done" confirmations. Rewards carry the brand
accent so they read as a perk, not a plain system-success; a green reward message on the white
day surface looks off.

### 7.10 Tabbed views

Multi-section pages use one shared **pill tab-bar** pattern (admin Accounts,
admin Review Queues, AI Chat Settings, Platform/Money/Category Settings, FAQ,
servicer Jobs, servicer Calendar). The active tab is a filled pill matching the
sidebar active link — **no underline tabs** (rev. 2026-06-12; the old
`border-bottom` underline pattern is retired):

```css
.tabs {
  display: flex;
  gap: 0.4rem;
}
.tab {
  background: transparent;
  border: none;
  border-radius: 999px;
  padding: 0.6rem 1.2rem;
  color: var(--color-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.tab:hover:not(.active) {
  color: var(--color-text);
  background: var(--color-bg);
}
.tab.active {
  background: var(--color-primary); /* solid fallback (§2.6) */
  background: var(--gradient-sidebar);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 1px 6px rgba(201, 90, 60, 0.2);
}
.tab .n {
  /* count chip — inverts on the active pill */
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
}
.tab.active .n {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}
```

- Tab labels are short (`Pending` / `Active` / `History`), each with an
  optional count chip `.n`.
- Drive the active tab with a `signal<'a'|'b'|'c'>()`; render content with `@if`.

### 7.11 Card grids & content centering

Lists of cards use a centered, auto-fitting grid so content fills to a
comfortable width and the group stays centered on any screen:

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 360px));
  gap: 0.8rem;
  justify-content: center; /* center the group, not left-aligned */
  align-items: start;
}
```

- Prefer `auto-fit` (not `auto-fill`) so a few cards stretch/center instead of
  leaving empty tracks on the left.
- Loading/empty/error messages span the full row (`grid-column: 1 / -1`) and are
  centered.

### 7.12 Floating FAB stack (portals)

The customer/servicer/admin shell shows a fixed bottom-right `.fab-stack`
(`bottom/right: 2rem`, `flex-direction: column`, `align-items: flex-end`):

- `.fab-toggle` — small minimize/expand caret, always visible.
- `.fab-bubbles` — wraps the bubbles: the **chat bubble (3rem circle)** and, for
  customers, the **request bar rendered as a compact 3rem circle** (not a wide bar).
- **Collapse hides the bubbles AND drops the toggle to the corner:**
  `.fab-stack.collapsed .fab-bubbles { max-height: 0; opacity: 0; overflow: hidden; }`
  collapses the wrapper height (animated), which pulls the toggle to the
  bottom-right corner; `.fab-stack.collapsed { gap: 0; }` so it sits flush.
- The request bar's label is hidden, so it shows a **floating CSS tooltip**
  (`.request-bar::after`, revealed on `:hover`) to its left.

### 7.13 Chat panel

The help-chat panel floats with a `1.5rem` inset from the bottom-right corner,
fully rounded (`border-radius: var(--radius)`), `max-width: calc(100vw - 3rem)` / `max-height: calc(100vh - 3rem)`.
On `≤420px` it goes flush full-width (`bottom/right: 0`, top corners rounded only).

### 7.14 Date inputs

Constrain `input[type="date"]` to `max-width: ~12rem`. A full-width native date
input anchors the browser's calendar popup to the input's far-left edge; a
compact input makes the popup open under the calendar icon.

### 7.15 Dropdown menus & selects

**All dropdowns must overlay the background (never clip under a parent).**
Every dropdown menu, popover, autocomplete list, datepicker, or select picker
must use `position: absolute` (or `fixed` for detached menus) with an explicit
`z-index` so it renders **above** (overlays) the surrounding page content — never clipped or
pushed by elements below it. Never rely on `overflow: visible` on a parent — margins, transforms,
or **`overflow: hidden` on an ancestor** (common on nav/topbars, e.g. the home `.topnav`) will
clip the dropdown. If the container must clip or scroll, detach the dropdown with
`position: fixed` (or a CDK overlay) so it escapes the clip and overlays the page. The shared `<app-search-select>` component and any
hand-rolled `<select>` alternative must follow this rule.

**Every dropdown must scroll past a threshold.** Any custom dropdown,
menu, autocomplete list, or option list that can exceed **~8 items** must cap
its height and scroll, never grow unbounded:

- `max-height: min(60vh, ~8 rows); overflow-y: auto; overscroll-behavior: contain;`
- Thin scrollbar: `scrollbar-width: thin` + a `::-webkit-scrollbar` thumb tinted
  with the brand/border colour.

**Long option dropdowns must be searchable with fuzzy matching.** Any
`<select>`-style picker with many options (categories, servicers, addresses,
etc.) should use a searchable dropdown:

- A filter input at the top of the open menu.
- **Fuzzy search** — match by case-insensitive subsequence so typos and partial
  words still match (e.g. "ac dr" → "AC Doctor Malaysia"); rank closer matches
  first and show them as live suggestions while typing.
- Keep the matched list scrollable per the threshold rule above.
- Implemented once as the shared **`<app-search-select>`**
  (`shared/search-select.component.ts`) — reuse it, don't hand-roll per page.
  It's a `ControlValueAccessor` (drops into `[(ngModel)]`/reactive forms like a
  native `<select>`), takes `[options]` (`{ value, label }[]`), `placeholder`,
  and `searchPlaceholder` inputs, and exports `fuzzyScore(query, text)` for the
  ranking. Has keyboard nav (↑/↓/Enter/Esc) and click-outside close. First
  consumer: Platform Settings → Customer-tab category picker (labels carry the
  budget span). When the option labels derive from other state, drive
  `[options]` from a `computed()` over signals so they stay reactive.

- Sort static list contents alphabetically — group headings A→Z and items A→Z
  within each group (unless ranked by search relevance).

### 7.16 Auto-hiding nav bars — ⚠️ DEPRECATED

> **Deprecated 2026-06-02.** The auto-hide / scroll-away / 30s-idle fade is dropped. The
> topbar and home topnav are now **normal always-on sticky elements with no animation**
> (§5.3, §12.2). Do **not** wire `appAutoHide` to nav/top bars. Remaining usages are being
> removed (TODO DISP-12). The historical spec below is kept for reference only.

Sticky nav/header bars use the shared `appAutoHide` directive
(`shared/auto-hide.directive.ts`):

- Scroll **down** past ~80px → host gets `is-collapsed` (CSS winds it up into a
  minimal bar); scroll **up** → restores the full bar.
- **30s** of no activity → host gets `is-idle` (CSS fades it out over ~**10s**);
  any activity (move/key/scroll/touch/click) restores it.
- The host component owns the `.is-collapsed` (slim/minimal) and `.is-idle`
  styles + transitions.
- **`.is-idle` minimizes to a thin bar** (not invisible) so content below pushes
  up: `padding-top/bottom: 0.1rem; gap: 0; overflow: hidden;` with a delayed
  transition (1s ease, 4s delay) so the shrink completes ~5s after idle triggers.
  The base class's fast transition (0.3s) restores the full bar instantly on
  activity.
- Listeners run outside Angular's zone; the directive toggles classes via
  `Renderer2` (no change-detection churn on scroll/move).
- The scroll source differs by layout (window for public pages; the scrolling
  content container inside the portal shell) — wire the directive to the element
  that actually scrolls.
- The directive uses capture-phase `window` scroll listener, which catches
  scroll events from **all** elements including modals. To prevent modal scroll
  from affecting the navbar, `handleScroll` must early-return when
  `e.target.closest('.backdrop')` is truthy.

### 7.17 Proposal prompt guard

When a new incoming quote arrives, a fixed-position prompt guard appears at the
bottom-centre of the viewport to surface the opportunity immediately. This is a
**blocking overlay pattern** — the prompt must be the user's primary focus.

**Hard rules:**

1. **Always visible on-screen.** The prompt guard uses `position: fixed; z-index: 9999`
   so it renders above every other element including modals, FAB stacks, and
   topbars. Never race a `z-index` — use the explicit layer.

2. **Disable background scroll.** When the prompt guard is open:

   ```css
   body {
     overflow: hidden; /* lock the page */
     touch-action: none; /* prevent mobile pull-to-refresh */
   }
   ```

   Apply on mount, remove on dismiss. Do NOT use `position: fixed` on `<body>`
   — iOS Safari loses its scroll position.

3. **Only the prompt scrolls.** The prompt guard body uses:

   ```css
   .prompt-guard {
     max-height: 60vh;
     overflow-y: auto;
     overscroll-behavior: contain; /* prevent scroll chaining */
     scrollbar-width: thin;
   }
   ```

4. **Dismiss options must remain reachable.** The close (✕) button and any
   action buttons must sit outside the scrollable body — pinned to the
   prompt guard's header or footer — so they remain visible regardless of
   content length.

5. **Backdrop must be visible.** A full-screen semi-transparent backdrop
   (`var(--color-backdrop)`) behind the prompt guard provides visual
   separation and signals that the page is temporarily locked. Clicking
   the backdrop does NOT dismiss (unlike modals) — the prompt guard is
   intentionally blocking.

6. **Restore scroll on dismiss.** After the guard closes (manually or via
   60s auto-dismiss), restore `body` overflow to its previous value. Track
   the original value before overriding it to avoid data loss.

**Template structure:**

```html
@if (promptOpen()) {
<div class="prompt-backdrop"></div>
<div class="prompt-guard">
  <div class="prompt-header">
    <span class="prompt-badge">{{ quoteCount() }} new</span>
    <strong>{{ categoryName }}</strong>
    <button class="prompt-close" (click)="dismiss()">✕</button>
  </div>
  <div class="prompt-body">
    <!-- expandable inline proposal form or quote detail -->
  </div>
  <div class="prompt-footer">
    @if (!expanded()) {
    <button class="btn-ghost" (click)="expand()">View & respond</button>
    }
  </div>
</div>
}
```

**Rules:**

- One prompt guard per page — never stack multiple guards.
- The `quote.new` socket event deduplicates by quote ID; a second event
  does not spawn a second guard while one is already open.
- Auto-dismiss after 60s of no interaction (timer pauses on mouseenter,
  resumes on mouseleave).
- Esc key dismisses immediately.
- On mobile ≤560px, the prompt guard goes full-width with
  `border-radius: var(--radius) var(--radius) 0 0` and snaps to the
  bottom edge.

### 7.18 Data tables — search + filter + sort

Every page section that presents a list or table of data must include three
controls as a **mandatory triad**:

```
┌──────────────────────────────────────────────┐
│ 🔍 Search...           [Category ▼] [Sort ▼] │
├──────────────────────────────────────────────┤
│ Table / list rows                             │
│ ...                                           │
└──────────────────────────────────────────────┘
```

| Control    | Behaviour                                                                                                                                                                       | Implementation                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Search** | Free-text, case-insensitive, fuzzy matching against visible row labels (name, email, title, etc.).                                                                              | `input[type="search"]` with `(input)` handler filtering the data signal. Debounce 250ms if the dataset is large. |
| **Filter** | Dropdown or chip group that narrows rows by a categorical attribute (status, role, category, date range). First option is always `"All"`.                                       | `<select>` or `<app-search-select>` wired to a `filter` signal. Filter value `''` means no filter.               |
| **Sort**   | Ascending / descending toggle on one or two key columns. Default sort is by most-recently-created first. Active sort column is visually indicated (arrow ▲/▼ in column header). | Signal for sort field + direction. Use `Array.sort()` on the filtered list.                                      |

**Reusable toolbar:** All list/table pages use `<app-list-toolbar>` (`shared/list-toolbar.component.ts`) with content projection:

- `toolbar-search` — search input element
- `toolbar-filters` — chip group or filter controls
- `toolbar-sort` — sort dropdown or direction toggle

```html
<app-list-toolbar>
  <input class="search" placeholder="Search..." toolbar-search />
  <div class="chips" toolbar-filters>
    <button class="chip" [class.on]="filter() === 'all'" ...>All</button>
  </div>
  <select toolbar-sort>
    ...
  </select>
</app-list-toolbar>
```

**Implementation pattern (Angular signals):**

```ts
search = signal("");
filter = signal("");
sortField = signal<"name" | "createdAt" | "status">("createdAt");
sortDir = signal<"asc" | "desc">("desc");

displayData = computed(() => {
  let items = this.rawData();
  const q = this.search().toLowerCase();
  if (q) items = items.filter((r) => r.name.toLowerCase().includes(q));
  const f = this.filter();
  if (f) items = items.filter((r) => r.status === f);
  const dir = this.sortDir() === "asc" ? 1 : -1;
  items = [...items].sort((a, b) => {
    const va = a[this.sortField()],
      vb = b[this.sortField()];
    return va < vb ? -dir : va > vb ? dir : 0;
  });
  return items;
});
```

**Exceptions** (explicitly opt out, not forget):

- A page with a single row or inherently unfilterable content (e.g. a single
  settings section) is exempt.
- A table with ≤5 rows that are always visible (e.g. a 4-item breakdown) does
  not need search, but must still have filter + sort if there are status
  variants.

**Purpose:** Every admin data table in this project (accounts, bookings, quotes,
rewards, etc.) must give the user the ability to quickly narrow and reorder
rows. No bare table is acceptable.

### 7.19 Top-up prompt guard (insufficient credit overlay)

When a user attempts to submit a pay_now quote with insufficient wallet credit, a
fixed-position centered prompt guard overlays the page instead of a modal. This
follows the same blocking overlay pattern as §7.17.

**Hard rules:**

1. **Fixed centered positioning.** The guard uses:

   ```css
   position: fixed;
   top: 50%;
   left: 50%;
   transform: translate(-50%, -50%);
   z-index: 9999;
   ```

   It renders above every other element regardless of nesting.

2. **Full-screen backdrop.** A semi-transparent backdrop at `z-index: 9998`
   covers the entire viewport. Clicking the backdrop does NOT dismiss (the guard
   is intentionally blocking — user must tap Cancel or Top Up).

3. **Body scroll locked.** When the prompt is open:

   ```css
   body {
     overflow: hidden;
     touch-action: none;
   }
   ```

   Restored on dismiss (Cancel, Top Up redirect) and in `ngOnDestroy`.

4. **Only the body scrolls.** The prompt body caps at `max-height: 50vh` with
   `overflow-y: auto; overscroll-behavior: contain`. The header (title + close)
   and footer (actions) are pinned outside the scroll area.

5. **Pre-filled amount.** The amount input is pre-filled to `max(shortfall, 10)`
   where `shortfall = total - creditBalance`. Minimum top-up is enforced at RM 10
   on both frontend and backend.

6. **Two action paths:**
   - **Top Up** — calls backend `/user/me/topup` which creates a Stripe Checkout
     session and redirects. Backend validates the RM 10 minimum.
   - **Demo top-up** — calls `/dev/topup` (instant credit, dev-only, blocked in
     production). Updates local balance for immediate use.

**Template structure (quote-form.component.ts):**

```html
@if (showTopUp()) {
<div class="tp-backdrop"></div>
<div class="tp-guard">
  <div class="tp-header">
    <strong>Top up your credit</strong>
    <button class="tp-close" (click)="dismissTopUp()">✕</button>
  </div>
  <div class="tp-body">
    <!-- balance, shortfall, amount input -->
  </div>
  <div class="tp-footer">
    <!-- Cancel, Demo top-up, Top Up buttons -->
  </div>
</div>
}
```

### 7.20 Site footer (`<app-site-footer>` / `.sf`)

The shared footer (`shared/site-footer.component.ts`, class `.sf`) renders on every
page — via `shell.component.ts` (portal pages) and `app.component.ts` (guest/public
pages). Rules:

- **Top margin ≥300px on every page.** `.sf` keeps **`margin-top: 300px` minimum** so
  the footer never crowds the page content above it and there is always a clear band of
  whitespace before it, on every route. Do not shrink or zero this per-page.
- The inner content stays width-capped (`.sf-inner` `max-width: var(--content-max)`,
  centered) — the 300px buffer is on the outer `.sf`, not the inner padding.

---

## 8. Theme System — Warm (Day) / Night (Stone + Copper)

### 8.1 How it works

Two themes coexist via `data-theme` attribute on `<html>`:

- `data-theme="warm"` (default) — burnt orange + cream editorial palette
- `data-theme="cool"` — deep stone + copper night palette

The `ThemeService` (`core/services/theme.service.ts`) manages the toggle,
persists the choice to `localStorage`, and applies the attribute.

Both themes share the same **warm character** — night mode is not a cold blue
inversion, it is the same brand at low light. The copper primary `#d4884a` sits
in the same warm-orange family as the day primary `#e07a3a`.

### 8.2 Character by function

| Element function     | Day (warm)              | Night (stone + copper)   |
| -------------------- | ----------------------- | ------------------------ |
| Primary CTAs         | Burnt orange `#e07a3a`  | Copper `#d4884a`         |
| Page background      | Cream `#faf7f2`         | Warm stone `#1c1917`     |
| Cards / surfaces     | White `#ffffff`         | Stone-800 `#28231e`      |
| Body text            | Warm charcoal `#2c2420` | Warm cream `#f5f0e8`     |
| Muted text           | Stone `#6b6258`         | Stone `#a09384`          |
| Accent               | Olive `#5a7a4a`         | Dark gold `#a16207`      |
| Success indicators   | Sage green              | Bright green (unchanged) |
| Danger / errors      | Brick red               | Warm red (unchanged)     |
| Status badges (open) | Warm peach              | Copper-tinted dark       |
| Shadows              | Warm brown undertone    | Near-black, warm         |

### 8.3 Theme toggle usage

Add to any top nav or shell:

```html
<button class="theme-toggle" (click)="themeSvc.toggle()">
  <span class="dot"></span>
  {{ themeSvc.theme() === 'warm' ? 'Day' : 'Night' }}
</button>
```

### 8.4 Rules

- All colour tokens use `var(--color-*)` — themes swap the variable values.
- Components never know about the theme; they just reference variables.
- Status badges swap per-theme via `[data-theme="cool"]` overrides in `:root`.
- The toggle is a `.theme-toggle` pill button (defined globally in `styles.css`).

---

## 9. Image & Banner System

### 9.1 Image types overview

| Image type             | Who edits | Where hosted        | Format   | Size / specs            | Delivery              |
| ---------------------- | --------- | ------------------- | -------- | ----------------------- | --------------------- |
| Brand logo             | Admin     | Frontend `/assets/` | SVG      | Vector, ≤16KB           | Bundled               |
| Category icons         | Admin     | Frontend `/assets/` | SVG      | 48×48dp viewBox, vector | Bundled               |
| Hero banner            | Admin     | S3 (presigned)      | WebP     | 1440×600px, ≤200KB      | Lazy loaded           |
| Category banners       | Admin     | S3 (presigned)      | WebP     | 1200×400px, ≤150KB      | Lazy loaded           |
| Servicer profile photo | Servicer  | S3 (presigned)      | WebP     | 400×400px, ≤100KB       | User upload           |
| Servicer cover banner  | Servicer  | S3 (presigned)      | WebP     | 1200×300px, ≤150KB      | User upload           |
| Servicer documents     | Servicer  | S3 (presigned)      | PDF/WebP | ≤5MB                    | User upload           |
| Booking photos         | Servicer  | S3 (presigned)      | WebP     | 1920×1080px, ≤500KB     | User upload via app   |
| Invoice PDF            | System    | S3 (presigned)      | PDF      | Standard A4             | Generated server-side |
| Empty state art        | Admin     | Frontend `/assets/` | SVG      | ≤5KB each               | Bundled               |

### 9.2 Where images are stored

- **System-owned images** (logo, icons, empty-state illustrations, default
  templates) — live in `frontend/src/assets/images/`, bundled with the app.
  No network round-trip for these. Accessed via `/assets/images/{name}.svg`.

- **User-generated and admin-managed images** (banners, profile photos,
  booking photos, documents) — stored in S3. The backend issues presigned
  upload URLs via `POST /files/presign`; the browser uploads directly to S3.
  Upload confirmation is sent to `POST /files/:id/confirm`.

- **Invoice PDFs** — generated server-side with `pdf-lib`, uploaded to S3
  automatically by the `invoice.generate` BullMQ job.

### 9.3 Admin-managed images (via admin panel)

| Image           | Management endpoint           | Model field                    |
| --------------- | ----------------------------- | ------------------------------ |
| Brand logo      | `PATCH /admin/settings`       | `Setting key: logo_url`        |
| Hero banner     | `PATCH /admin/settings`       | `Setting key: hero_banner_url` |
| Category banner | `PATCH /admin/categories/:id` | `Category.bannerUrl`           |
| Category icon   | `PATCH /admin/categories/:id` | `Category.icon`                |

Admins upload via the standard presigned flow: `POST /files/presign` →
direct S3 upload → `POST /files/:id/confirm` → update the setting/category
record with the confirmed file URL.

### 9.4 Servicer-managed images (via servicer account)

| Image           | Management endpoint           | Model field               |
| --------------- | ----------------------------- | ------------------------- |
| Profile photo   | `PATCH /servicer/me`          | `Servicer.logoUrl`        |
| Cover banner    | `PATCH /servicer/me`          | `Servicer.coverUrl`       |
| Documents (KYC) | `POST /servicer/me/documents` | `ServicerDocument.fileId` |

Servicers use the same presigned upload flow as admins, then update their
profile with the returned file URL.

### 9.5 Image storage rules

- All uploaded images have EXIF metadata stripped via `sharp` before storage.
- Presigned URLs expire in 15 minutes (configured in `files.service.ts`).
- Accepted MIME types on upload: `image/webp`, `image/jpeg`, `image/png`.
- File size upper limit: 10MB per file (enforced server-side and via presign
  validators).
- S3 bucket structure: `/{tenant}/uploads/{model}/{id}/{filename}`.
- Default/fallback images: if a banner or photo URL is null, the frontend
  shows a CSS placeholder (gradient with icon overlay) instead of a broken
  image.

### 9.6 Image dimension guidelines

| Context               | Recommended size | Aspect ratio | Notes                    |
| --------------------- | ---------------- | ------------ | ------------------------ |
| Hero banner (desktop) | 1440×600px       | 2.4:1        | Top section of home page |
| Hero banner (mobile)  | 750×400px        | 1.88:1       | Responsive crop          |
| Category card         | 1200×400px       | 3:1          | Behind category icon     |
| Servicer cover        | 1200×300px       | 4:1          | Top of servicer profile  |
| Servicer avatar       | 400×400px        | 1:1          | Circular crop            |
| Booking photo         | 1920×1080px      | 16:9         | Before/after job photos  |
| Empty state           | CSS only         | —            | Gradient + SVG icon      |

#### 9.6.1 `object-fit`: `cover` vs `contain` (never crop evidence)

Picking the wrong `object-fit` is why photos appear "cut off" inside modals and
cards. The two have opposite jobs:

- **`object-fit: cover`** — fills a **fixed decorative frame** and **crops**
  whatever overflows. Use **only** where the frame shape matters more than seeing
  the whole image: circular avatars, square category/list thumbnails, hero/cover
  banners. These are intentional crops.
- **`object-fit: contain`** — shows the **whole image**, letterboxed, **never
  crops**. Use for any image the user must read in full.

**Hard rule: evidence / preview images MUST use `contain`, never `cover`.**
This covers upload previews (arrival/completion photos), incoming job photos,
before/after shots, lightbox/zoom, and document previews. Cropping a photo the
user uploaded as proof — or needs to assess a job — hides the very content it
exists to show.

```css
/* Evidence / preview image */
.preview,
.job-photo {
  width: 100%;
  max-height: 220px; /* cap height; width drives the scale */
  object-fit: contain; /* show the whole photo — never crop */
  background: var(--color-bg); /* clean letterbox fill */
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
}
```

Decorative frames (avatars, thumbnails) keep `cover` — that crop is deliberate.

### 9.7 Future: image management UI

Planned admin features (not yet built):

- **Banner manager**: Upload, crop, preview, and schedule banners per page
  section (hero, category, promotion).
- **Media library**: Browse all uploaded images in a grid, filter by type,
  re-use across pages.
- **Default images**: Set fallback images per content type (category, servicer
  profile, etc.).

Planned servicer features (not yet built):

- **Photo gallery**: Upload and manage before/after job photos.
- **Banner editor**: Simple overlay text on cover photo before uploading.

### 9.8 Status

The core image pipeline is implemented: presigned S3 upload flow (`POST /files/presign`
→ direct S3 upload → `POST /files/:id/confirm`), admin category icon/banner fields,
servicer cover-banner field, and CSS fallback placeholders for null image URLs. The two
remaining UIs — admin banner manager and servicer photo gallery — are future work (§9.7).
Live task state lives in `TODO.md`, not in this file.

---

## 10. Page Loading States

Every data-fetching page must handle:

1. **Loading** — skeleton shimmer (preferred) or spinner.
2. **Empty** — meaningful empty state with illustration + CTA.
3. **Error** — error card with retry button.
4. **Data** — the actual content.

---

## 11. Accessibility

- Icon-only buttons must have `aria-label`.
- Modals: `role="dialog" aria-modal="true"` (provided by `app-modal`).
- Focus rings never removed without visible replacement.
- Colour never sole conveyer of meaning.
- Respect `prefers-reduced-motion`.
- All inputs have associated `<label>`.

---

## 12. Home Page Layout

Real section order, top → bottom (one centred column, §12.1 alignment):

```
TOP NAV   brand · search · login / join              (sticky)
──────────────────────────────────────────────────────────
HERO      full-bleed photo + theme-bg wash (§16.4)
          h1 + subtitle + search bar — text in var(--color-text)
──────────────────────────────────────────────────────────
BROWSE    "Browse services" — §16 thumbnail card grid   (.cats)
──────────────────────────────────────────────────────────
TRUST     "Trusted by homeowners" — testimonial marquee (.testimonials)
──────────────────────────────────────────────────────────
HOW       "How it works" — 4 steps, horizontal          (.how → .how-inner)
──────────────────────────────────────────────────────────
FOOTER    sitemap + company / support / legal
```

### 12.1 Section alignment contract (all section titles align)

Every top-level home section's inner content shares ONE horizontal alignment, so all
section headings — "Browse services", "Trusted by homeowners", "How it works" — left-align
to the same x. Each section's inner wrapper uses an identical contract:

```css
max-width: var(--content-max); /* 1100px */
margin: 0 auto; /* centre the column */
padding-inline: 1.5rem; /* home section gutter — SAME value on every section */
```

- **Full-bleed band** (section has its own background/border, e.g. `.how`): put the contract
  on an **inner wrapper** (`.how-inner`), not the band — the band stretches edge-to-edge but its
  content still aligns to the same gutter.
- **Flush section** (`.cats`, `.testimonials`): apply the contract to the section element directly.
- **Never** drop or change `padding-inline` on one section. That is the exact bug where
  "Browse services" (`.cats`, 0 side padding) sits 1.5rem left of "Trusted by homeowners"
  (`.testimonials`, 1.5rem). All section titles must share one left edge.

### 12.2 Phone top nav

On phone (≤560px) the home/guest top nav strips to one compact row of essentials:

| Item               | Desktop / tablet               | Phone (≤560px)                                                   |
| ------------------ | ------------------------------ | ---------------------------------------------------------------- |
| Brand              | logo icon + "My Home Servicer" | **wordmark text only** — drop the `.logo-icon` image             |
| Search             | inline search field            | hidden (the hero has its own search)                             |
| Theme toggle       | dot + "Day"/"Night" label      | **dot only** — hide the label text, keep `.dot`                  |
| Log in / My portal | shown                          | shown                                                            |
| Join as Servicer   | shown                          | **hidden** (secondary CTA; still reachable from the page/footer) |

Result: a phone bar of **brand text · theme dot · Log in** — three light items, no wrap, no crowding.

---

## 13. Desktop / Tablet / Mobile Behaviour

| Feature              | Desktop (≥1024)       | Tablet (761-1023) | Mobile (≤760)                           |
| -------------------- | --------------------- | ----------------- | --------------------------------------- |
| Hero layout          | Side-by-side          | Stacked           | Stacked, smaller                        |
| Category grid        | thumbnail cards (§16) | equal cards       | 1 col (≤760)                            |
| How it works         | Row of 3              | Row of 3          | Column of 3                             |
| Section padding      | 3rem 0                | 2rem 0            | 1.5rem 0                                |
| Top nav              | Row all items         | Row, condensed    | Brand text · theme dot · Log in (§12.2) |
| Hero h1              | 2.8rem                | 2.8rem            | 2rem (1.7rem ≤560)                      |
| Hero search          | 520px max             | 90% width         | 100% width                              |
| Page-enter animation | 0.4s (see §6.2)       | 0.4s              | 0.4s                                    |

---

## 14. Image Style for Presentation

> See §9 (Image & Banner System) for the full image strategy including hosting,
> editing permissions, and specs. This section covers presentational details.

Visual decoration mixes CSS patterns with real imagery — cards load per-category
placeholder images from `assets/Images/` (plus admin-managed S3 banners, §16) and icons
are bundled Lucide SVGs. Pure-CSS techniques remain for ornaments and skeleton loaders:

| Element          | Technique                 | Notes                                  |
| ---------------- | ------------------------- | -------------------------------------- |
| Hero ornament    | CSS concentric rings      | Pure CSS, no image file needed         |
| Category icons   | Lucide SVG (`<app-icon>`) | Bundled vector set — not emoji         |
| Empty states     | SVG icon + text           | Simple illustration with muted styling |
| Skeleton loading | CSS gradient shimmer      | `@keyframes shimmer` animation         |

**Production upgrade path (see §9 for full details):**

- Category icons → SVG set in `frontend/src/assets/images/categories/`
- Hero banner → S3-managed, admin-editable WebP
- Category banners → S3-managed, admin-editable WebP
- Servicer cover photos → S3-managed, servicer-editable
- Empty states → SVG illustrations in `frontend/src/assets/images/`

---

## 15. Sidebar

### 15.1 Layout & corner rounding

The portal sidebar sits as a flex column inside `.body` and uses rounded corners on the right edge where it meets the content area:

```css
.sidebar {
  width: 220px;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  padding: 1rem 0.75rem;
  border-radius: 0 var(--radius) var(--radius) 0;
}
```

### 15.2 Nav links

Links inside the sidebar are stacked vertically with `gap: 0.25rem`:

```css
.sidebar a {
  padding: 0.55rem 0.8rem;
  border-radius: var(--radius);
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    transform 0.12s ease;
}
.sidebar a:hover {
  background: var(--color-bg);
  transform: translateX(2px);
}
.sidebar a.active {
  background: var(--color-primary);
  background: var(--gradient-sidebar);
  color: #fff;
  transform: none;
}
```

### 15.3 Mobile adaptation

On screens ≤760px the sidebar collapses to a full-width horizontal scrollable row — border-radius is removed so it sits flush:

```css
@media (max-width: 760px) {
  .sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
    border-radius: 0;
    padding: 0.4rem 0.5rem;
  }
  .sidebar nav {
    flex-direction: row;
    overflow-x: auto;
    gap: 0.3rem;
  }
}
```

**No visible horizontal scrollbar.** The mobile horizontal row scrolls by swipe/drag but must
hide its scrollbar — `scrollbar-width: none` + `.sidebar nav::-webkit-scrollbar { display: none }`.
A side-scroll bar at the bottom of the sidebar is useless clutter. The desktop sidebar must not
overflow on the x-axis at all (only the vertical `nav` scroll of §15.4 is allowed).

### 15.4 Viewport height fit (desktop/tablet)

**The sidebar must always fit the available empty space height — never taller, never shorter.**
On desktop/tablet (≥761px) it fills exactly the space beside the content
(`100vh − demo bar − topbar`) and stops at the bottom edge of the screen — no gap below it,
no page-level scrollbar, never short above the fold. The fit comes from the flex height chain
below (`.shell` 100vh → `.body` `flex: 1`), so it tracks the remaining space automatically as
the demo bar / topbar change height.

This is achieved by the shell height chain (no explicit height on `.sidebar`):

```css
.shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.body {
  display: flex;
  flex: 1;
  overflow: hidden;
} /* sidebar + content row */
.sidebar {
  /* no height — flex-stretches to fill .body, i.e. 100vh − topbar */
  display: flex;
  flex-direction: column;
  min-height: 0; /* allow shrink so internal scroll engages */
}
.sidebar nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto; /* nav links scroll inside the sidebar, not the page */
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
```

**Hard rules:**

- Never set a fixed `height`/`max-height` on `.sidebar` (e.g. `height: 100%` against
  a non-sized parent, or a `px`/`vh` literal). It must derive its height from the
  `.shell` (100vh) → `.body` (`flex: 1; overflow: hidden`) chain so it tracks the
  viewport exactly, including after the topbar height changes.
- **The component host must relay the stretch.** `.sidebar` lives inside the
  `<app-shell-nav>` host — the host, not `.sidebar`, is the actual flex child of
  `.body`. The host therefore needs `:host { display: flex; flex-direction: column;
min-height: 0 }` and `.sidebar { flex: 1 }`. Without the `:host` rule the `.body`
  flex-stretch never reaches `.sidebar`, which collapses to its content height and
  stops short of the viewport (the 2026-06-03 bug: sidebar 389px on an 800px viewport).
  Mobile override: `.sidebar { flex: none }` so it stays a short horizontal row.
- If nav links exceed the available height, the **sidebar's own `nav` scrolls**
  (`overflow-y: auto` + `min-height: 0`) — the page never scrolls to reveal sidebar
  items. This is the §5.3 flex-scroll rule applied to the sidebar.
- Pinned footer items (theme toggle, sign-out) sit outside the scrolling `nav` so
  they stay glued to the bottom edge regardless of link count.
- Mobile (≤760px, §15.3) is exempt: the sidebar becomes a horizontal row and the
  viewport-height fit does not apply.

---

## 16. Thumbnail Cards (service cards & hero)

Service cards and the home hero pair **editorial copy with photography**. Each is
a horizontal composition: a **category-colour wash + text on the LEFT** dissolves
into a **real service photo on the RIGHT**. The colour side stays opaque enough that
copy is always legible; the photo side is admin-managed (see §9). Until a photo
is set, a per-category placeholder image from `assets/Images/` shows.

> Think: the left ~60% is a coloured "label" you can always read; the right side is a
> window onto a photo of that service. Direction is fixed — colour LEFT → photo RIGHT.

**One canonical card.** All three grids that use this pattern — the home "Browse services"
grid, the customer **Browse** page, and the public **`/services/:category`** drill-down —
MUST use the single `.svc-card` / `.svc-grid` spec in §16.3. Do not hand-tune heights or
column counts per page; divergent per-page cards are the exact bug this section prevents.

### 16.1 Layer stack (front→back)

```
z-index 3 (front) — Body: icon, name, price/CTA — white text
z-index 2         — Wash: linear-gradient(90deg, var(--cat-color) … transparent 74%)
z-index 1         — Photo: full-bleed, watermark-cropped (scale 1.12, top), placeholder fallback
z-index 0 (base)  — Card shell: var(--color-surface), border, shadow
```

The photo sits below the wash so the category-colour gradient overlays the image on the
left. The wash colour is **per-category** (`--cat-color`, fallback `var(--color-primary)`) —
not a fixed brand colour. White body text on the wash stays readable.

### 16.2 Tokens

No new colours (see §2). The wash colour is the per-category `--cat-color` (set inline
from `cat.cardColor`, fallback `var(--color-primary)`), staying in the warm family. Card
shell reuses §7.1: `1px var(--color-border)`, `var(--radius)`, `var(--shadow)`; hover lifts
`translateY(-2px)` + `var(--shadow-md)` + `border-color: var(--color-primary-light)`. Text
on the wash: `#fff` (title + CTA) · `rgba(255,255,255,0.88)` (price/description).

### 16.3 Service card — the one canonical spec

Used by home, customer browse, and the public drill-down via the shared `.svc-card` /
`.svc-grid` classes (or a shared `<app-service-card>` component). The grid follows the
§12.1 alignment contract (`max-width: var(--content-max); margin: 0 auto; padding-inline: 1.5rem`).

```html
<button
  class="svc-card"
  (click)="pick(cat)"
  [style]="{'--cat-color': cat.cardColor || 'var(--color-primary)'}"
>
  <span class="svc-wash"></span>
  <span
    class="svc-photo"
    [style.background-image]="'url(' + (cat.bannerUrl || cat.imageUrl || placeholderUrl(cat.slug)) + ')'"
    [style.background-size]="(cat.bgZoom ?? 100) + '%'"
    [style.background-position]="(cat.bgPosX ?? 50) + '% ' + (cat.bgPosY ?? 50) + '%'"
  ></span>
  <span class="svc-body">
    <span class="svc-ic"
      ><app-icon
        [name]="cat.icon || 'home'"
        sizeToken="md"
        stroke="#fff"
        strokeWidth="1.5"
    /></span>
    <strong>{{ cat.name }}</strong>
    <span class="svc-price">from RM {{ cat.defaultPriceSuggestion }}</span>
    <span class="svc-cta">Request a quote →</span>
  </span>
</button>
```

```css
/* Canonical grid — auto-fit so columns adapt with no per-page breakpoints:
   ~3 cols desktop, 2 on tablet, 1 on a phone, all from one rule. */
.svc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  grid-auto-rows: 1fr;
  gap: var(--space-base);
  max-width: var(--content-max);
  margin: 0 auto;
  padding-inline: 1.5rem; /* §12.1 alignment contract */
}

.svc-card {
  position: relative;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  min-height: 100px; /* canonical height — identical on every page */
  text-align: left;
  cursor: pointer;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  transition:
    box-shadow var(--transition),
    transform var(--transition),
    border-color var(--transition);
}
.svc-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  border-color: var(--color-primary-light);
}

/* 1 — photo; scale + top-anchor crops the AI-art watermark at the bottom edge */
.svc-photo {
  position: absolute;
  inset: 0;
  z-index: 1;
  background-color: var(--color-bg);
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center top;
  transform: scale(1.12);
  transform-origin: top center;
}

/* 2 — wash: per-category colour left → transparent right */
.svc-wash {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: linear-gradient(
    90deg,
    var(--cat-color) 0%,
    var(--cat-color) 30%,
    color-mix(in srgb, var(--cat-color) 55%, transparent) 50%,
    transparent 74%
  );
}

/* 3 — body: white text, left ~60% */
.svc-body {
  position: relative;
  z-index: 3;
  flex: 1;
  min-width: 0;
  max-width: 60%;
  padding: 0.7rem 1rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.15rem;
  color: #fff;
}
.svc-ic {
  width: 1.5rem;
  height: 1.5rem;
  color: rgba(255, 255, 255, 0.92);
  margin-bottom: 0.15rem;
  flex-shrink: 0;
}
.svc-body strong {
  font-family: var(--font-display);
  font-size: 1.05rem;
  line-height: 1.1;
  color: #fff;
}
.svc-price {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.88);
}
.svc-cta {
  margin-top: 0.1rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: #fff;
}
/* Phone: drop the CTA text — the whole card is tappable, so "Request a quote →"
   only crowds the narrow card. Hide it, keep the price. */
@media (max-width: 560px) {
  .svc-cta {
    display: none;
  }
}
```

> The customer Browse page currently uses `bw-*` clones of these classes. Unify it to
> `.svc-card` (or the shared component) — see the §16 dispatch task in TODO.

### 16.4 Hero — dynamic theme-bg wash

Same photo+wash idea, but the wash is **not** a brand or dark colour — it is a
**theme-background washout** driven by `var(--color-bg)`, so it is cream in day and deep
stone at night, flipping automatically with `[data-theme]`. Hero text uses
`var(--color-text)` / `var(--color-muted)` (NOT white) so it reads on either wash. An edge
mask fades both horizontal ends.

```html
<section class="hero">
  <!-- photo + wash live in their own clipped layer so the search dropdown below
       (in .hero-inner) is NOT clipped by the hero's overflow/mask -->
  <span class="hero-bg">
    <span
      class="hero-photo"
      [style.background-image]="'url(' + (heroBannerUrl() || '/assets/Images/Banner_Placeholder.png') + ')'"
    ></span>
    <span class="hero-wash"></span>
  </span>
  <div class="hero-inner page-child">
    <h1>Home service,<br />sorted.</h1>
    <p class="hero-sub">…</p>
    <p class="hero-hint">…</p>
  </div>
</section>
```

```css
/* Section itself does NOT clip — no overflow/mask here (see "Hero search dropdown
   must not be clipped" below). */
.hero {
  position: relative;
  width: 100%;
  padding: 2rem 1.5rem 0.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* Background layer carries the overflow clip + edge mask, NOT the section. */
.hero-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  mask-image: linear-gradient(
    90deg,
    transparent 2%,
    #000 6%,
    #000 94%,
    transparent 98%
  );
}
.hero-photo {
  position: absolute;
  inset: 0;
  background-color: var(--color-bg);
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center;
}
/* theme-bg washout — flips day/night automatically */
.hero-wash {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-bg) 92%, transparent) 0%,
    color-mix(in srgb, var(--color-bg) 60%, transparent) 45%,
    transparent 72%
  );
}
.hero-inner {
  position: relative;
  z-index: 2;
  flex: 1;
  min-width: 0;
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 0 1.5rem;
}
.hero h1 {
  font-family: var(--font-display);
  font-size: 2.8rem;
  line-height: 1.15;
  color: var(--color-text);
}
.hero-sub {
  color: var(--color-muted);
}
.hero-hint a {
  color: var(--color-primary);
  font-weight: 600;
}
```

**Hero h1 responsive sizes:** `2.8rem` (>760px) → `2rem` (561–760px) → `1.7rem` (≤560px).
This supersedes the stale "tablet 2.2rem" in §13 and "2rem ≤560" in §3.2.

**Photo layers never tile.** Every photo layer (`.hero-photo`, `.svc-photo`) sets
`background-repeat: no-repeat` alongside `background-size: cover`. When an admin zoom
(`bgZoom`) drops below 100% a missing `no-repeat` makes the image repeat/tile — most
visible on phones, where a wide banner is scaled small. `cover` + `no-repeat` is the
baseline.

**Phone: hero banner zooms to FIT.** On phone (≤560px) the hero photo switches to
`background-size: contain` (+ `background-position: center`) so the **whole** banner is
visible, scaled to fit the short hero — no crop. Because the admin zoom is applied as an
inline `[style.background-size]`, the phone override needs `!important` to win:

```css
@media (max-width: 560px) {
  .hero-photo {
    background-size: contain !important;
    background-position: center !important;
  }
}
```

The letterbox area fills with `--color-bg` (the photo layer's `background-color`), so it
reads as part of the theme wash.

**Hero search dropdown must not be clipped.** The hero search suggestions (`.search-dropdown`,
`position: absolute; top: 100%; z-index: 200`) open _below_ the search bar, past the hero's
bottom edge. Therefore the hero **section** must NOT set `overflow: hidden` or `mask-image`
— both clip descendants and would cut the dropdown off (z-index can't rescue a clipped
element). Put the overflow clip + edge mask on the **`.hero-bg`** layer (photo + wash only);
the section stays unclipped so the dropdown overlays the section below. Same principle as the
topnav (§7.15): a nav/hero that hosts a dropdown cannot clip its own overflow.

**Hero top spacing.** The topnav is a normal element directly above the hero (it scrolls with
the page — not sticky, §5.3). Give the hero enough `padding-top` for breathing room above the
h1 ("Home service, sorted.") — more on phone, where the nav row is taller.

**Phone: drop the edge mask, keep the wash.** The horizontal edge fade
(`mask-image: linear-gradient(90deg, transparent 2%, … transparent 98%)`, now on `.hero-bg`)
is a desktop/tablet flourish. On phone (≤560px) set `.hero-bg { mask-image: none; -webkit-mask-image: none }`
so the banner fills edge-to-edge — but keep `.hero-wash` (the theme-bg overlay still applies).

**Hero search bar text stays dark.** The hero search input has a fixed white background
(`.hero-search-white input { background: #fff }`) in BOTH themes, so its text + placeholder
must use a fixed **dark** colour (the day `--color-text`, `#2c2420`) — never `var(--color-text)`,
which flips to cream in night theme and renders white-on-white (invisible). This is one of the
few places a hardcoded colour is correct, because the surface it sits on is theme-independent.

### 16.5 Admin settings — Zoom / X / Y

Each card photo supports three admin-adjustable background properties (stored in
the `Category` model as `bgZoom`, `bgPosX`, `bgPosY`):

| Slider     | Range   | Default | CSS property            |
| ---------- | ------- | ------- | ----------------------- |
| Zoom       | 50–200% | 100%    | `background-size`       |
| X Position | 0–100%  | 50%     | `background-position-x` |
| Y Position | 0–100%  | 50%     | `background-position-y` |

```
┌──────────────────────────────────────────────────────────┐
│██████████████▓▓▓▓▒▒▒░░                                     │
│██ COLOUR WASH (--cat-color) ░   ← gradient →    PHOTO      │
│██  icon                     ░                              │
│██  Plumbing        (white)  ░    [ real service photo,     │
│██  Leaks, installs & …      ░      object-fit: cover ]     │
│██  from RM 80 · Request →   ░                              │
│██████████████▓▓▓▓▒▒▒░░                                     │
└──────────────────────────────────────────────────────────┘
   ^ opaque, text lives here       ^ photo revealed here
```

Three stacked layers inside one positioned container:

1. **Photo layer** (bottom) — fills the card, `background-size: cover`.
2. **Colour wash** (middle) — a `90deg` gradient: solid category colour on the
   left → transparent by ~70–76%, so the photo shows on the right.
3. **Body** (top) — icon, title, one-line description, price/CTA. **White text.**

**Direction is fixed:** gradient runs **left (colour) → right (transparent)**.
Never reverse it; never put the photo on the left.

---
