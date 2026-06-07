/**
 * Cloudflare Pages Function — reverse proxy for /socket.io/* to the Railway backend.
 * Companion to frontend/functions/api/[[path]].js. Forwards the WebSocket upgrade +
 * polling requests so real-time (notifications, future dispatch prompts) works through
 * the same origin. Uses the same per-project BACKEND_URL env var.
 */
export async function onRequest(context) {
  const { request, env } = context;
  const backend = (env.BACKEND_URL || '').replace(/\/+$/, '');
  if (!backend) {
    return new Response('BACKEND_URL is not configured for this Pages project', { status: 500 });
  }
  const incoming = new URL(request.url);
  const target = backend + incoming.pathname + incoming.search;
  return fetch(new Request(target, request));
}
