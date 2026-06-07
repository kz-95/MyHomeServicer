/**
 * Google Geocoding API wrapper.
 *
 * Reads GOOGLE_MAPS_API_KEY from process.env. Geocodes a free-form address
 * string into a { lat, lng } pair. Returns null when the address cannot be
 * resolved (no results or API error) — the caller decides whether to reject
 * or proceed without coordinates.
 */

const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Geocode a free-form address string to lat/lng coordinates.
 *
 * @param address - A human-readable address (e.g. "12, Jalan SS 15/8, 47500
 *                  Subang Jaya, Selangor").
 * @returns A `{ lat, lng }` pair, or `null` if geocoding failed or returned
 *          zero results. The caller decides the error handling strategy.
 */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    return null;
  }

  const url = `${GEOCODE_BASE}?address=${encodeURIComponent(address)}&key=${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let body: GeocodeResponse;
  try {
    body = (await response.json()) as GeocodeResponse;
  } catch {
    return null;
  }

  if (body.status !== 'OK' || !body.results || body.results.length === 0) {
    return null;
  }

  const { lat, lng } = body.results[0].geometry.location;
  return { lat, lng };
}

export interface AddressValidation {
  valid: boolean;
  formattedAddress?: string;
  /** Street number + route (e.g. "12 Jalan SS2/72"), when resolvable. */
  street?: string;
  /** Postal code, when resolvable. */
  postcode?: string;
  lat?: number;
  lng?: number;
}

/**
 * Validate an address and return structured result including the formatted
 * address from Google. Useful for chat-based address validation where we
 * want to confirm the address is real and show the canonical version.
 */
export async function validateAddress(address: string): Promise<AddressValidation> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    return { valid: false };
  }

  const url = `${GEOCODE_BASE}?address=${encodeURIComponent(address)}&key=${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return { valid: false };
  }

  if (!response.ok) return { valid: false };

  let body: GeocodeResponse;
  try {
    body = (await response.json()) as GeocodeResponse;
  } catch {
    return { valid: false };
  }

  if (body.status !== 'OK' || !body.results || body.results.length === 0) {
    return { valid: false };
  }

  const { lat, lng } = body.results[0].geometry.location;
  const formattedAddress = body.results[0].formatted_address;
  return { valid: true, formattedAddress, lat, lng };
}

/**
 * Reverse-geocode a lat/lng pair into a human-readable formatted address.
 * Used by the chat widget's "use my current location" (GPS) button: the
 * browser supplies coordinates, the server resolves them to an address with
 * the server-safe key. Returns null when the point cannot be resolved.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<AddressValidation> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    return { valid: false };
  }

  const url = `${GEOCODE_BASE}?latlng=${encodeURIComponent(`${lat},${lng}`)}&key=${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return { valid: false };
  }

  if (!response.ok) return { valid: false };

  let body: GeocodeResponse;
  try {
    body = (await response.json()) as GeocodeResponse;
  } catch {
    return { valid: false };
  }

  if (body.status !== 'OK' || !body.results || body.results.length === 0) {
    return { valid: false };
  }

  const result = body.results[0];
  const formattedAddress = result.formatted_address;
  const { street, postcode } = parseComponents(result.address_components);
  return { valid: true, formattedAddress, street, postcode, lat, lng };
}

/** Pull street (number + route) and postal code out of geocode components. */
function parseComponents(
  components?: Array<{ long_name: string; short_name: string; types: string[] }>,
): { street?: string; postcode?: string } {
  if (!components) return {};
  let streetNumber = '';
  let route = '';
  let postcode = '';
  for (const c of components) {
    if (c.types.includes('street_number')) streetNumber = c.long_name;
    else if (c.types.includes('route')) route = c.long_name;
    else if (c.types.includes('postal_code')) postcode = c.long_name;
  }
  const street = [streetNumber, route].filter(Boolean).join(' ').trim();
  return { street: street || undefined, postcode: postcode || undefined };
}

interface GeocodeResponse {
  status: string;
  results: Array<{
    formatted_address: string;
    address_components?: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
}
