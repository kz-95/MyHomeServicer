# My Home Servicer — Capstone Deck Brainstorm

Working notes. Reframe deck around real thesis before page-by-page polish.

---

## Core thesis (corrected by Zen)

Two-sided marketplace, but the **hero problem is servicer-side**.

- Many skilled servicers (handymen, plumbers, electricians, cleaners) have
  **real skill but no cert and no exposure**. They can't get discovered, so
  they miss jobs.
- Tenants, meanwhile, **don't know who to call** when something breaks at home.
- The marketplace closes that gap: **exposure engine for freelancers/SMEs**,
  **discovery + trust channel for tenants**.
- Emotional story leads with the underdog servicer getting new jobs; the tenant
  convenience is the other half of the same loop.

## Facts to keep straight (corrections)

- Builder: **Kuan Zhe Huang (Zen)**, Junior Fullstack Developer, Puchong MY.
- Project name: **My Home Servicer** (not "MyServicer").
- Timeline: **project build ~1 month+** (the 2 months was the AGMO *training*
  period, not the build). FIX the "2 months" stat on profile slide.
- **Drop PMP certification** line (not accurate). Replace personal positioning
  with: looking forward to **building services that help businesses upscale**.
- Solo build. 3 portals (customer / servicer / admin). 49 DB models.
- Real features: AI chat assistant (categorize issue -> suggest service ->
  guide booking -> auto-fill summary), role-aware AI across 4 user types,
  multi-key LLM failover, admin ops console w/ 2-layer PIN gate, live dispatch.

## No-em-dash rule

User instruction: **no em-dashes anywhere** in the deck. Use commas / periods /
colons. (Already swept once.)

---

## Open framing forks (to decide together)

1. **Whose problem opens the deck?**
   - (a) Lead with servicer exposure pain (underdog story), tenant as second beat.
   - (b) Lead with tenant "who do I call" pain, servicer as the supply answer.
   - (c) Frame both as one broken matching market from slide 1.

2. **Profile slide stat set** (now that 2-months is wrong):
   - Candidate stats: ~1 month build, solo, 3 portals, 49 DB models,
     4 AI user-roles, AI assistant as core feature.
   - Which 4 carry the most punch?

3. **Personal narrative angle** (replacing PMP):
   - "helping businesses upscale" -> tie builder's mission to the servicer's
     growth story? (developer who builds tools that grow small businesses)

4. **Demo framing** (slide 5): which single flow to show live?
   - Tenant describes problem to AI -> booking auto-filled -> servicer accepts
     -> admin sees it? Pick the one that best proves the thesis.

---

## DECISIONS (locked)

1. **Story spine = Both sides, one broken market.** From slide 1 frame it as a
   matching failure: skilled supply is invisible, demand is lost. Servicer +
   tenant are two sides of the same gap.
2. **Personal angle = Builder for small-biz growth.** Zen = developer who builds
   tools that help small businesses and freelancers upscale. Ties his mission to
   the servicer growth story. (Replaces PMP line.)
3. **Live demo = Full loop end-to-end.** Tenant describes problem to AI ->
   booking auto-fills -> servicer accepts -> admin sees it. Proves whole thesis
   in one run.

---

## Proposed deck outline (v2, post-brainstorm)

Structure fixed by rubric (6 slides), content re-pointed at the thesis.

1. **Title (30s)** — "My Home Servicer", one-line context = the matching market
   for home services. Name + capstone tag.
2. **Profile (1m)** — Zen, photo, Junior Fullstack, "builder for small-biz
   growth" angle. Stats: ~1mo build, solo, 3 portals, 49 models (drop 2mo/PMP).
   Skills tags. Maybe links (github/site).
3. **Problem (2m)** — ONE broken market, two faces:
   - Supply: skilled servicers, no cert, no exposure -> miss jobs.
   - Demand: tenants don't know who to call.
   - Tie: the match never happens. (market-size stat as backup.)
4. **Solution (2m)** — My Home Servicer closes the gap. 3 portals + AI assistant
   as the matching engine. Lead the value as "exposure for servicers, trust for
   tenants."
5. **Live Demo (5m)** — full loop placeholder slide. localhost CTA.
6. **Closing + Q&A (5m)** — thank you, contact, mission line.

## DECISIONS round 2 (locked)

- **Expand to per-role slides.** Role split = **Guest+Customer / Servicer /
  Admin** (3 slides; guest+customer merged = demand side).
- **Cut the $600B market stat.** Not well-researched, do not fake credibility.
  Problem slide stays on the underdog/matching framing instead.
- **Role slide content (all four):** key features per role + real screenshot of
  that portal + how the role-aware AI behaves for that user + the pain it solves.
- **Ending reorder:** Q&A is **second-to-last**; the **final slide = Contact**
  (personal QR + website + links). Drop a website + QR on contact slide.

## Deck outline v4 (LOCKED structure, 10 slides)

1. Title (30s) — My Home Servicer, matching-market one-liner, name + tag.
2. Profile (1m) — Zen, photo, builder-for-small-biz-growth angle.
   Stats: ~1mo build, solo, 3 portals, 49 models. (no 2mo, no PMP.)
3. Problem (2m) — one broken market, two faces (supply invisible + demand lost).
   NO $600B stat.
4. Solution overview (1m) — the matching engine: 3 portals + AI assistant.
5. Guest + Customer experience (1m) — features + screenshot + AI role + pain.
6. Servicer experience (1m) — features + screenshot + AI role + pain.
7. Admin experience (1m) — features + screenshot + AI role + pain.
8. Live Demo (5m) — full loop placeholder + localhost CTA.
9. Q&A (second-to-last).
10. Contact / Thank you (last) — personal QR + website + github/linkedin.

## Build blockers (need before generating)
- **QR target URL(s):** personal site (zen-resume.pages.dev) and/or live app
  (myhomeservicer.pages.dev)? QR needs a definite target.
- **Screenshots:** 3 role slides need real portal screenshots. Requires the
  frontend running (ng serve :4200) + login per role. Either start the app so I
  can capture, or use clean placeholder frames for now.
