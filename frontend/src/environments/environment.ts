/**
 * Frontend environment config. Note: no secrets ever live here - the Angular
 * bundle ships to every browser (security-notes.md §3 Layer 1). The frontend
 * only knows the API base path; all credentials stay on the Express server.
 */
export const environment = {
  production: false,
  apiBase: '/api/v1',
  socketUrl: '',
  /** Dev-bypass: demo account email sent as the x-dev-user header (set locally). */
  devUser: '',
  /** Google OAuth client ID - served from backend /config/public, blank = hide Google buttons. */
  googleClientId: '',
  /** Google Maps API key - served from backend /config/public, blank = degrade gracefully. */
  googleMapsApiKey: '',
  /** Stripe publishable key - served from backend /config/public, blank = degrade gracefully. */
  stripePublishableKey: '',
  /**
   * Build-time fallback for the demo/QA unlock phrase. The live value comes from
   * the backend (GET /config/public → demoUnlockPhrase, driven by the
   * DEMO_UNLOCK_PHRASE env var); this default only applies before that response
   * arrives or if the call fails. Typing it anywhere toggles demo UI on/off.
   */
  demoUnlockPhrase: 'unlockdemobar',
};
