const toRadians = (value: number): number => (value * Math.PI) / 180;

export const haversineDistanceKm = (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
};
