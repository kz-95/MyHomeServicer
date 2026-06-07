/**
 * Cloudflare Pages Function — reverse proxy for /api/* to the Railway backend.
 *
 * Why this exists: Cloudflare Pages `_redirects` cannot proxy (200 rewrite) to an
 * EXTERNAL origin — only same-project paths. So the old `_redirects` line silently
 * fell through to the SPA shell. This Function does the real reverse proxy.
 *
 * BACKEND_URL is set PER Cloudflare project (demo vs prod) in the dashboard, so the
 * same master build serves any environment without a frontend rebuild
 * (security-notes §3 Layer 1). Same-origin to the browser → no CORS needed.
 *
 * NOTE: lives under frontend/functions because the Cloudflare project Root directory
 * is `frontend`. Pages detects the functions/ dir relative to the root directory.
 *
 * Set in Cloudflare → Pages → <project> → Settings → Environment variables:
 *   BACKEND_URL = https://myhomeservicerdemo.up.railway.app         (demo project)
 *   BACKEND_URL = https://my-home-servicer-production.up.railway.app (prod project)
 */
export async function onRequest(context) {
  const { request, env } = context;
  const backend = (env.BACKEND_URL || '').replace(/\/+$/, '');
  if (!backend) {
    return new Response('BACKEND_URL is not configured for this Pages project', { status: 500 });
  }
  const incoming = new URL(request.url);
  const target = backend + incoming.pathname + incoming.search;
  // Forward method, headers, and body unchanged — transparent reverse proxy.
  return fetch(new Request(target, request));
}
