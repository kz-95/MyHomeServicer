import { prisma } from '../lib/prisma';
import { haversineKm } from '../lib/haversine';

const ARRIVE_MAX_DISTANCE_KM = 0.5; // 500m
const DONE_MAX_DISTANCE_KM = 1.0;  // 1km

/**
 * Compute distance between two coordinate pairs with the haversine formula.
 */
export function isWithinRadius(
  servicerLat: number,
  servicerLng: number,
  targetLat: number,
  targetLng: number,
  maxDistanceKm: number,
): boolean {
  return haversineKm(servicerLat, servicerLng, targetLat, targetLng) <= maxDistanceKm;
}

/**
 * Derive approximate coordinates from a district/postcode string using the
 * same area-coords lookup pattern as the seed data.
 */
function areaCoords(area: string): { lat: number | null; lng: number | null } {
  const a = area.toLowerCase();
  if (/damansara\s*utama|ss2|petaling\s*jaya/.test(a)) return { lat: 3.08, lng: 101.65 };
  if (/cyberjaya|putrajaya/.test(a)) return { lat: 2.924, lng: 101.657 };
  if (/klcc|bukit\s*bintang/.test(a)) return { lat: 3.15, lng: 101.71 };
  if (/cheras/.test(a)) return { lat: 3.1, lng: 101.72 };
  if (/damansara\s*heights|bangsar/.test(a)) return { lat: 3.13, lng: 101.63 };
  if (/subang\s*jaya/.test(a)) return { lat: 3.05, lng: 101.59 };
  if (/shah\s*alam/.test(a)) return { lat: 3.07, lng: 101.55 };
  if (/ampang/.test(a)) return { lat: 3.16, lng: 101.75 };
  if (/kepong|selayang/.test(a)) return { lat: 3.2, lng: 101.63 };
  if (/wangsa\s*maju|setapak/.test(a)) return { lat: 3.2, lng: 101.73 };
  if (/gombak/.test(a)) return { lat: 3.22, lng: 101.72 };
  if (/mont\s*kiara/.test(a)) return { lat: 3.17, lng: 101.65 };
  if (/kl|kuala\s*lumpur/.test(a)) return { lat: 3.14, lng: 101.69 };
  return { lat: null, lng: null };
}

/**
 * Look up the target coordinates for a booking's job site.
 * Priority: QuoteRequest.lat/lng → UserAddress.lat/lng → areaCoords from district/postcode.
 * Returns null if no coords can be resolved.
 */
async function resolveTargetCoords(bookingId: string): Promise<{ lat: number; lng: number } | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      quoteRequest: {
        select: {
          lat: true,
          lng: true,
          address: {
            select: {
              lat: true,
              lng: true,
              district: true,
              postcode: true,
            },
          },
        },
      },
    },
  });
  if (!booking) return null;

  // Priority 1: direct lat/lng on the quote request
  if (booking.quoteRequest.lat != null && booking.quoteRequest.lng != null) {
    return { lat: booking.quoteRequest.lat, lng: booking.quoteRequest.lng };
  }

  // Priority 2: lat/lng on the user address
  const addr = booking.quoteRequest.address;
  if (addr.lat != null && addr.lng != null) {
    return { lat: addr.lat, lng: addr.lng };
  }

  // Priority 3: area-coords lookup from district (then postcode)
  const searchStr = addr.district ?? addr.postcode ?? '';
  if (searchStr) {
    const coords = areaCoords(searchStr);
    if (coords.lat != null && coords.lng != null) {
      return { lat: coords.lat, lng: coords.lng };
    }
  }

  return null;
}

/**
 * Log a GPS event for arrive/done and verify the location.
 * Returns true if the location was verified (within allowed radius).
 */
async function logLocation(
  bookingId: string,
  servicerId: string,
  eventType: 'arrive' | 'done',
  servicerLat: number,
  servicerLng: number,
  accuracy: number | undefined,
): Promise<boolean> {
  const target = await resolveTargetCoords(bookingId);
  const maxDistance = eventType === 'arrive' ? ARRIVE_MAX_DISTANCE_KM : DONE_MAX_DISTANCE_KM;

  let verified = false;
  if (target) {
    verified = isWithinRadius(servicerLat, servicerLng, target.lat, target.lng, maxDistance);
  }
  // If no target coords can be resolved, treat as not verified.

  await prisma.bookingLocationLog.create({
    data: {
      bookingId,
      servicerId,
      eventType,
      lat: servicerLat,
      lng: servicerLng,
      accuracy: accuracy ?? null,
      verified,
      verifiedAt: verified ? new Date() : null,
    },
  });

  return verified;
}

/**
 * Log an "arrive" GPS event for a booking.
 * If verified (servicer within 500m of job site), updates booking.arrivedAt.
 * Returns true if location was verified.
 */
export async function logArrivalLocation(
  bookingId: string,
  servicerId: string,
  lat: number,
  lng: number,
  accuracy?: number,
): Promise<boolean> {
  const verified = await logLocation(bookingId, servicerId, 'arrive', lat, lng, accuracy);

  if (verified) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { arrivedAt: new Date() },
    });
  }

  return verified;
}

/**
 * Log a "done" GPS event for a booking.
 * If verified (servicer within 1km of job site), updates booking.doneAt.
 * Returns true if location was verified.
 */
export async function logDoneLocation(
  bookingId: string,
  servicerId: string,
  lat: number,
  lng: number,
  accuracy?: number,
): Promise<boolean> {
  const verified = await logLocation(bookingId, servicerId, 'done', lat, lng, accuracy);

  if (verified) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { doneAt: new Date() },
    });
  }

  return verified;
}
