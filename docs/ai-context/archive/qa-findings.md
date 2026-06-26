# QA Findings - My Home Servicer
**Date:** 2026-06-02  
**Tester:** Claude Sonnet 4.6 (automated)  
**Target:** http://localhost:4200  
**Scope:** Quote Flow (guest + customer), Account Settings (3 roles), UI Mixing, Mobile (375×812)  
**Screenshots:** `.gstack/qa-reports/screenshots/`

---

## Summary Table

| # | Page | Issue | Expected | Severity |
|---|------|--------|----------|----------|
| 1 | /guest/quote/new step 1 | Empty submit navigates to home page instead of showing validation | Validation errors shown inline | HIGH |
| 2 | /guest/quote/new step 1 | Required questions (* marked) not validated - form advances without any answer | Block advance until required answered | HIGH |
| 3 | /guest/quote/new step 4 (Bill) | Estimate shows RM 105 but Stripe charges RM 150 - no disclosure before redirect | Show hold amount on bill step before redirect | HIGH |
| 4 | /guest/quote/new step 4 (Bill) | TnC text is plain text with no link | "platform terms" should link to /terms | HIGH |
| 5 | /guest/quote/new + /customer/quote/new | Date picker off-by-one: clicking "10" stores date as "9 June", highlights wrong cell | Calendar cell highlight matches stored date | MEDIUM |
| 6 | /customer/quote/new step 4 (Bill) | Hold vs. estimate explanation + Refundable line visible only after scrolling | Show above the fold | MEDIUM |
| 7 | /customer/quote/new step 4 (Bill) | Wallet balance RM 100 < Pay now hold RM 150 - no insufficient balance warning | Warn user their wallet is short, prompt top-up | MEDIUM |
| 8 | /customer/account | Notification preference save does not persist - state reverts on reload | Saved prefs survive page reload | MEDIUM |
| 9 | /customer/account | Rewards popup persists throughout quote flow, blocks date picker + bill summary | Auto-dismiss after interaction or fixed z-index below form | MEDIUM |
| 10 | /servicer/account | PIN gate absent - page loads directly with no PIN prompt | PIN prompt before accessing sensitive account data | MEDIUM |
| 11 | /admin/financial-settings | 404 Page not found | Route should exist or redirect to /admin/money-settings | MEDIUM |
| 12 | DEMO bar (any role) | Servicer switch from customer session logs user out - /servicer redirects to /login | Session should switch cleanly to servicer account | MEDIUM |
| 13 | All pages (mobile 375px) | Footer duplicated twice on admin dashboard and customer account pages | Single footer only | MEDIUM |
| 14 | /guest/quote/new step 2 | Manually typed postcode does not auto-populate District/State | Postcode lookup should populate district/state | LOW |
| 15 | Stripe Checkout | Currency defaults to SGD/Singapore, not MYR/Malaysia | Default to MYR for Malaysian service bookings | LOW |
| 16 | Stripe Checkout | Product title shows "Wallet Top-Up" | Should describe the service payment, e.g. "Service Booking Hold" | LOW |
| 17 | /admin/money-settings Servicer Rules | Dispatch timeout field empty - no default value | Should have a default (e.g. 30 seconds) | LOW |
| 18 | Mobile (375px) | Logo "My Home Servicer" wraps to two lines in header | Single-line logo on mobile | LOW |
| 19 | Mobile (375px) | Address card layout messy - text overflows, buttons stack oddly | Clean card layout on mobile | LOW |
| 20 | Home page (console) | NG0955 duplicate track keys for @for loops across 6 categories, fires 3× per load | Unique track keys per item (use item.id not item.slug) | LOW |

---

## Console Error Summary

### Errors (2 unique)
| Error | Source | Count |
|-------|---------|-------|
| `401 Unauthorized` - resource load failure | Initial page load | 1 |
| `404 Not Found` - resource load failure | Initial page load | 1 |

### Warnings (many)
| Warning | Impact |
|---------|--------|
| `NG0955: duplicate track keys` on cleaning-service, appliance-repair, events-weddings, home-improvement, home-maintenance, training-classes | Angular @for renders may produce incorrect list items or reconciliation errors. Fires 3× per navigation (sidebar, footer, main). |
| `allowSignalWrites deprecated` (5×) | No functional impact; signals always allow writes in Angular 21 |

---

## Detailed Findings

### ISSUE-001 - Empty submit exits quote wizard
**Page:** `/guest/quote/new` → Step 1 (Choose Service)  
**Severity:** HIGH  
**Steps to repro:**
1. Navigate to /guest/quote/new
2. Click "Next: Contact →" without selecting Category or Service
3. Observe redirect to home page  
**Expected:** Inline validation - highlight required fields, stay on step 1  
**Actual:** Page redirects to http://localhost:4200/  
**Screenshot:** `02-guest-quote-empty-submit.png`

---

### ISSUE-002 - Required service questions bypass
**Page:** `/guest/quote/new` + `/customer/quote/new` → Step 1 (Choose Service)  
**Severity:** HIGH  
**Steps to repro:**
1. Select category + service (e.g. Training → 3D Modeling Class)
2. Leave ALL required questions (* marked) unchecked/unselected
3. Click "Next: Contact →"
4. Form advances to Contact step  
**Expected:** Block advance; highlight unfilled required questions  
**Actual:** Wizard proceeds; Summary step shows all questions as "-"  
**Screenshot:** `12-guest-autofill-step1-next.png`, `13-guest-step3-summary.png`

---

### ISSUE-003 - Bill estimate vs Stripe hold mismatch (guest)
**Page:** `/guest/quote/new` → Step 4 (Bill/Confirmation)  
**Severity:** HIGH  
**Steps to repro:**
1. Complete guest quote flow with Demo Auto-fill
2. On Bill step, note "Estimated total: RM 105.00"
3. Agree to TnC and click "Send request"
4. Stripe Checkout shows "Credit wallet top-up of RM 150.00"  
**Expected:** Bill step discloses the hold amount (RM 150) and the reason for the difference  
**Actual:** Guest bill shows only RM 105 estimate; Stripe charges RM 150 without prior disclosure  
**Note:** Customer flow correctly shows hold (RM 150) vs estimate (RM 100) with explanation - guest flow missing this entirely  
**Screenshot:** `14-guest-step4-bill.png`, `16-guest-quote-submitted.png`

---

### ISSUE-004 - Guest TnC has no link to Terms & Conditions
**Page:** `/guest/quote/new` → Step 4 (Bill)  
**Severity:** HIGH  
**Description:** Guest checkbox reads "I agree to the platform terms and data collection." with plain text - no hyperlink to the Terms & Conditions page. Customer flow correctly has "I've read and agree to the Terms & Conditions" with a link to `/terms`. Inconsistency between flows.  
**Expected:** Hyperlink to /terms in checkbox label  
**Actual:** Plain text only  
**Screenshot:** `15-guest-bill-no-tnc.png`

---

### ISSUE-005 - Date picker off-by-one visual bug
**Page:** `/guest/quote/new` + `/customer/quote/new` → Step 2 (Contact)  
**Severity:** MEDIUM  
**Steps to repro:**
1. On Contact step, click calendar date "10"
2. Observe label text shows "9 June 2026 (Tuesday)" (correct day/date for June 9)
3. But calendar highlights cell "10" visually  
**Expected:** Highlighted cell matches displayed date  
**Actual:** Calendar highlights the cell after the stored date (stored=9, highlighted=10)  
**Confirmed in both guest and customer flows**  
**Screenshot:** `08-guest-date-selected.png`, `26-customer-quote-summary.png`

---

### ISSUE-006 - Customer bill hold/refund info below the fold
**Page:** `/customer/quote/new` → Step 4 (Bill)  
**Severity:** MEDIUM  
**Description:** Price Summary shows "Service estimate: RM 100.00" and "We'll hold: RM 150.00" at top, but the explanation text ("To secure your booking, we hold your chosen budget ceiling upfront…") and "Refundable: ~RM 50.00" line are only visible after scrolling past the footer. Most users will not scroll.  
**Expected:** Full hold explanation visible without scrolling  
**Actual:** Critical financial info requires scroll to discover  
**Screenshot:** `30-customer-bill-scroll2.png`

---

### ISSUE-007 - No insufficient wallet balance warning on Pay now
**Page:** `/customer/quote/new` → Step 4 (Bill)  
**Severity:** MEDIUM  
**Description:** Wallet balance shows RM 100.00 but "Pay now" option states "RM 150.00 held now via card or wallet". No warning that wallet is RM 50 short. If user selects "Wallet credit" + "Pay now", the payment will fail at submission.  
**Expected:** Warning or Top-Up prompt when wallet < hold amount  
**Actual:** No indication of insufficient balance  
**Screenshot:** `28-customer-bill-no-popup.png`

---

### ISSUE-008 - Notification preferences don't persist
**Page:** `/customer/account`  
**Severity:** MEDIUM  
**Steps to repro:**
1. On /customer/account, scroll to Notification Preferences
2. Uncheck "Email" for "Booking updates" (currently checked)
3. Click "Save notification preferences"
4. Reload page
5. "Email" for "Booking updates" shows checked again  
**Expected:** Unchecked state persists after reload  
**Actual:** Reverts to original state on reload

---

### ISSUE-009 - Rewards popup blocks form interaction
**Page:** `/customer/quote/new`  
**Severity:** MEDIUM  
**Description:** Rewards points notification ("You have points waiting! Redeem them...") persists throughout the entire quote flow and overlaps the date picker on Contact step and the Price Summary section on the Bill step. Closing the popup with × was inconsistent.  
**Screenshot:** `27-customer-bill-step.png`

---

### ISSUE-010 - Servicer account has no PIN gate
**Page:** `/servicer/account`  
**Severity:** MEDIUM  
**Description:** Navigating to /servicer/account loads the full Account Settings page directly - no PIN is required to access sensitive fields (bank details, withdrawals, business info). The "Action PIN" section exists within the page (shows "Using default (123456)") but is not used as an access gate.  
**Note:** Default PIN is 123456, not 1234 as documented in scope.  
**Screenshot:** `35-servicer-account.png`, `37-servicer-pin-section.png`

---

### ISSUE-011 - /admin/financial-settings returns 404
**Page:** `/admin/financial-settings`  
**Severity:** MEDIUM  
**Description:** The route /admin/financial-settings returns a "Page not found" 404 error. The actual Financial Settings page is at `/admin/money-settings`. Any bookmarks, docs, or links to `/admin/financial-settings` will break.  
**Screenshot:** `44-admin-financial-settings.png`

---

### ISSUE-012 - DEMO bar servicer switch logs out customer session
**Page:** Any page while logged in as customer  
**Severity:** MEDIUM  
**Steps to repro:**
1. Log in as customer (e.g. Sarah Lim via DEMO bar)
2. Open DEMO bar → Servicers ▾ → select any servicer
3. Navigate to /servicer  
**Expected:** Session switches to selected servicer account  
**Actual:** /servicer redirects to /login; customer session appears cleared  
**Works from:** Admin session (switching to servicer from admin works correctly)  
**Screenshot:** `52-ui-mix-servicer.png`

---

### ISSUE-013 - Footer duplicated twice on mobile
**Page:** /admin (mobile 375px), /customer/account (mobile 375px)  
**Severity:** MEDIUM  
**Description:** The site-wide footer (CLEANING / REPAIR / EVENT / IMPROVEMENT / MAINTENANCE columns) renders twice on mobile - once after the main content and again at the very bottom. Adds significant scroll length and looks broken.  
**Screenshot:** `53-mobile-home.png`, `55-mobile-customer-account.png`

---

## Top 5 Things to Fix

1. **ISSUE-001/002** - Quote wizard validation broken: empty submit exits wizard, required questions bypass. Any user can submit a meaningless quote with zero answers.

2. **ISSUE-003/004** - Guest bill hides hold amount (RM 150) while showing lower estimate (RM 105), and TnC has no link. Users are sent to Stripe with no warning of the higher charge.

3. **ISSUE-012** - DEMO bar servicer role switch from customer context breaks auth and logs the user out. Core demo flow is broken for that path.

4. **ISSUE-013** - Double footer on mobile (admin + customer account). Visible on every mobile session.

5. **ISSUE-005** - Date picker off-by-one: calendar highlights wrong cell. Every scheduled booking has a display inconsistency.

---

## Positive Findings

- Guest → Stripe Checkout redirect works end-to-end (test mode `cs_test_` session created) ✓
- Customer preset auto-fill populates all contact + address fields correctly ✓
- Customer TnC checkbox has correct hyperlink to /terms ✓
- Admin Category Settings → Edit modal → Sub-categories tab exists and loads correctly ✓
- Customer and servicer navs are correctly isolated (no role UI leakage) ✓
- Profile save (name change) persists after page reload ✓
- Servicer Work Hours schedule grid displays and toggles correctly ✓
- Financial Settings Servicer Rules → Dispatch timeout field is visible ✓
- Address CRUD modal opens correctly in customer account ✓
- Customer bill refundable estimate (~RM 50) and explanation text present when scrolled ✓
