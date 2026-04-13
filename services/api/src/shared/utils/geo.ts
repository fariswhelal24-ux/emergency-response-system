export type GeoPoint = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const isValidCoordinate = (value: number): boolean => Number.isFinite(value);

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (
    !isValidCoordinate(lat1) ||
    !isValidCoordinate(lon1) ||
    !isValidCoordinate(lat2) ||
    !isValidCoordinate(lon2)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type VolunteerCandidate = {
  latitude: number | null;
  longitude: number | null;
};

export function findNearestVolunteers<T extends VolunteerCandidate>(
  userLocation: GeoPoint,
  volunteers: T[],
  limit: number = 5
): Array<T & { distanceKm: number }> {
  const boundedLimit = Math.max(1, Math.floor(limit));

  return volunteers
    .map((volunteer) => {
      const lat = volunteer.latitude ?? userLocation.latitude;
      const lon = volunteer.longitude ?? userLocation.longitude;

      return {
        ...volunteer,
        distanceKm: getDistance(userLocation.latitude, userLocation.longitude, lat, lon)
      };
    })
    .filter((entry) => Number.isFinite(entry.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, boundedLimit);
}

export const buildLinearRoute = (
  from: GeoPoint,
  to: GeoPoint,
  segments: number = 24
): GeoPoint[] => {
  const pointsCount = Math.max(2, Math.floor(segments));
  const route: GeoPoint[] = [];

  for (let index = 0; index <= pointsCount; index += 1) {
    const ratio = index / pointsCount;

    route.push({
      latitude: from.latitude + (to.latitude - from.latitude) * ratio,
      longitude: from.longitude + (to.longitude - from.longitude) * ratio
    });
  }

  return route;
};
