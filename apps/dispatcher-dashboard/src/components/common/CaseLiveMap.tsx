import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";

type Coordinate = {
  latitude: number;
  longitude: number;
};

const createPinIcon = (className: string) =>
  L.divIcon({
    className: `ers-map-pin ${className}`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

const patientIcon = createPinIcon("ers-map-pin--patient");
const volunteerIcon = createPinIcon("ers-map-pin--volunteer");
const ambulanceIcon = createPinIcon("ers-map-pin--ambulance");

const buildBounds = (points: Coordinate[]) => {
  if (points.length === 0) {
    return undefined;
  }

  return L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as [number, number]));
};

const defaultCenter: [number, number] = [31.7054, 35.2024];

export const CaseLiveMap = ({
  patientLocation,
  volunteerLocation,
  ambulanceLocation,
  ambulanceRoute
}: {
  patientLocation?: Coordinate;
  volunteerLocation?: Coordinate;
  ambulanceLocation?: Coordinate;
  ambulanceRoute?: Coordinate[];
}) => {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const points = [
    ...(patientLocation ? [patientLocation] : []),
    ...(volunteerLocation ? [volunteerLocation] : []),
    ...(ambulanceLocation ? [ambulanceLocation] : []),
    ...((ambulanceRoute ?? []).slice(0, 50))
  ];

  const bounds = buildBounds(points);

  useEffect(() => {
    if (!mapHostRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapHostRef.current, {
      zoomControl: true,
      attributionControl: true
    }).setView(defaultCenter, 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layerGroup;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) {
      return;
    }

    const map = mapRef.current;
    const layerGroup = layerRef.current;
    layerGroup.clearLayers();

    if (ambulanceRoute && ambulanceRoute.length > 1) {
      L.polyline(
        ambulanceRoute.map((point) => [point.latitude, point.longitude] as [number, number]),
        { color: "#1f8a3d", weight: 4, opacity: 0.9 }
      ).addTo(layerGroup);
    }

    if (patientLocation) {
      L.marker([patientLocation.latitude, patientLocation.longitude], { icon: patientIcon })
        .addTo(layerGroup)
        .bindTooltip("Patient", { direction: "top", permanent: true, offset: [0, -4] });
    }

    if (volunteerLocation) {
      L.marker([volunteerLocation.latitude, volunteerLocation.longitude], { icon: volunteerIcon })
        .addTo(layerGroup)
        .bindTooltip("Volunteer", { direction: "top", offset: [0, -4] });
    }

    if (ambulanceLocation) {
      L.marker([ambulanceLocation.latitude, ambulanceLocation.longitude], { icon: ambulanceIcon })
        .addTo(layerGroup)
        .bindTooltip("Ambulance", { direction: "top", offset: [0, -4] });
    }

    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView(defaultCenter, 14);
    }
  }, [ambulanceLocation, ambulanceRoute, bounds, patientLocation, volunteerLocation]);

  return <div ref={mapHostRef} className="dispatcher-map" />;
};
