// Post-build fix for Cloudflare Pages deep-route module loading.
//
// PROBLEM (proven via live browser repro, 2026-06-01):
//   Angular's `application` (esbuild) builder emits index.html with RELATIVE
//   asset references:
//     <link rel="modulepreload" href="chunk-XXX.js">
//     <script src="main-XXX.js" type="module">
//     <link rel="stylesheet" href="styles-XXX.css">
//   Chromium resolves `<link rel="modulepreload">` hrefs against the DOCUMENT
//   URL, not <base href="/">. On a deep route (e.g. /customer/quotes) the
//   preloads request /customer/chunk-XXX.js, which does not exist, so the
//   Cloudflare SPA catch-all (/*  /index.html  200) returns index.html
//   (text/html) -> "Failed to load module script" MIME errors (10 per load) +
//   ~22KB wasted per deep load. Non-fatal (the real module graph loads from
//   root because <script src> DOES honor <base href>), but it spams the
//   console (bad for investor demos) and wastes requests.
//
// FIX: rewrite the emitted index.html so every relative asset href/src is
//   root-absolute (/chunk-XXX.js). Then preloads hit root, succeed, and the
//   console is clean on every route. Deterministic, robust to outputHashing
//   (pattern-based), and safe (cannot break root-asset serving the way a
//   blanket _redirects /*.js -> 404 rule could).
//
// Idempotent: re-running on already-absolute output is a no-op.
//
// Wired via package.json "build": "ng build && node scripts/postbuild-absolutize.mjs".
// NOTE: the Cloudflare Pages build command MUST be `npm run build` (not a bare
//   `ng build`) for this step to run. See docs/ai-context/logs/devops-log.md.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, '..', 'dist', 'myhomeservicer', 'browser', 'index.html');

if (!existsSync(indexPath)) {
  console.error(`[absolutize] index.html not found at ${indexPath} — did ng build run?`);
  process.exit(1);
}

const original = readFileSync(indexPath, 'utf8');

// Match an `href="..."` or `src="..."` attribute whose value is a relative
// path (not already root-absolute, not a full URL, not a special scheme).
// The leading [\s"'] anchors the match to an attribute boundary so we never
// touch substrings like `data-href`. Skipped value prefixes: / // http: https:
// data: # mailto: tel: ? (and the empty value "").
const rewrite = /([\s"'])(href|src)="(?!\/|\/\/|https?:|data:|#|mailto:|tel:|\?|")/g;

let count = 0;
const fixed = original.replace(rewrite, (_m, pre, attr) => {
  count += 1;
  return `${pre}${attr}="/`;
});

if (count === 0) {
  console.log('[absolutize] no relative asset refs found (already absolute) — no-op.');
} else {
  writeFileSync(indexPath, fixed, 'utf8');
  console.log(`[absolutize] rewrote ${count} relative asset ref(s) -> root-absolute in index.html`);
}
