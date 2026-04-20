import { RouteCoordinate } from "./routing.validation.js";

type RouteResult = {
  geometry: RouteCoordinate[];
  distanceKm: number;
  durationMinutes: number;
  provider: "mapbox" | "osrm" | "linear";
  trafficAware: boolean;
};

const EARTH_RADIUS_KM = 6371;
const OSRM_BASE = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || "";
const MAPBOX_PROFILE = "mapbox/driving-traffic";
const CACHE_TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 4500;

const cache = new Map<string, { value: RouteResult; expiresAt: number }>();

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const haversineKm = (a: RouteCoordinate, b: RouteCoordinate): number => {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const linearRoute = (
  from: RouteCoordinate,
  to: RouteCoordinate,
  trafficAware: boolean
): RouteResult => {
  const segments = 20;
  const geometry: RouteCoordinate[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const r = i / segments;
    geometry.push({
      latitude: from.latitude + (to.latitude - from.latitude) * r,
      longitude: from.longitude + (to.longitude - from.longitude) * r
    });
  }
  const distanceKm = haversineKm(from, to);
  return {
    geometry,
    distanceKm,
    durationMinutes: Math.max(1, Math.ceil((distanceKm / 35) * 60)),
    provider: "linear",
    trafficAware
  };
};

const fetchWithTimeout = async (url: string): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const decodePolyline = (encoded: string, precision = 5): RouteCoordinate[] => {
  const factor = Math.pow(10, precision);
  const coordinates: RouteCoordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({ latitude: lat / factor, longitude: lng / factor });
  }

  return coordinates;
};

const tryMapbox = async (
  from: RouteCoordinate,
  to: RouteCoordinate
): Promise<RouteResult | null> => {
  if (!MAPBOX_TOKEN) {
    return null;
  }
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url =
    `https://api.mapbox.com/directions/v5/${MAPBOX_PROFILE}/${coords}` +
    `?alternatives=true&geometries=polyline6&overview=full&access_token=${MAPBOX_TOKEN}`;

  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      routes?: Array<{ geometry: string; distance: number; duration: number }>;
    };
    const best = (payload.routes || []).slice().sort((a, b) => a.duration - b.duration)[0];
    if (!best) {
      return null;
    }
    return {
      geometry: decodePolyline(best.geometry, 6),
      distanceKm: best.distance / 1000,
      durationMinutes: Math.max(1, Math.round(best.duration / 60)),
      provider: "mapbox",
      trafficAware: true
    };
  } catch {
    return null;
  }
};

const tryOsrm = async (
  from: RouteCoordinate,
  to: RouteCoordinate
): Promise<RouteResult | null> => {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?alternatives=false&geometries=polyline6&overview=full`;

  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      routes?: Array<{ geometry: string; distance: number; duration: number }>;
    };
    const best = payload.routes?.[0];
    if (!best) {
      return null;
    }
    return {
      geometry: decodePolyline(best.geometry, 6),
      distanceKm: best.distance / 1000,
      durationMinutes: Math.max(1, Math.round(best.duration / 60)),
      provider: "osrm",
      trafficAware: false
    };
  } catch {
    return null;
  }
};

const cacheKey = (from: RouteCoordinate, to: RouteCoordinate, mode: string): string =>
  `${mode}:${from.latitude.toFixed(4)},${from.longitude.toFixed(4)}->${to.latitude.toFixed(4)},${to.longitude.toFixed(4)}`;

export const routingService = {
  getRoute: async (
    from: RouteCoordinate,
    to: RouteCoordinate,
    options: { mode?: "fastest" | "shortest"; avoidTraffic?: boolean } = {}
  ): Promise<RouteResult> => {
    const mode = options.mode ?? "fastest";
    const avoidTraffic = options.avoidTraffic ?? true;

    const key = cacheKey(from, to, mode);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }

    let result: RouteResult | null = null;

    if (avoidTraffic) {
      result = await tryMapbox(from, to);
    }
    if (!result) {
      result = await tryOsrm(from, to);
    }
    if (!result) {
      result = linearRoute(from, to, false);
    }

    cache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }
};

export type { RouteResult };
