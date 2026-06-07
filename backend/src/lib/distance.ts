/**
 * Haversine distance calculation.
 *
 * Computes the great-circle distance between two lat/lng points on the Earth's
 * surface (WGS-84 ellipsoid approximated as a sphere). Accuracy is ~0.3% which
 * is sufficient for servicer proximity matching.
 */

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Compute the Haversine distance between two geographic points.
 *
 * @param lat1 - Latitude of point 1 in degrees.
 * @param lng1 - Longitude of point 1 in degrees.
 * @param lat2 - Latitude of point 2 in degrees.
 * @param lng2 - Longitude of point 2 in degrees.
 * @returns Distance in kilometres, rounded to 2 decimal places.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_KM * c * 100) / 100;
}
