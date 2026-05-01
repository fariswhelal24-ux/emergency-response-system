import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Coordinate = {
  latitude: number;
  longitude: number;
};

type TrackedPoint = Coordinate & {
  title: string;
  color: string;
};

const DEFAULT_CENTER: Coordinate = {
  latitude: 31.7054,
  longitude: 35.2024
};

const toRegion = (points: Coordinate[]): Region => {
  if (points.length === 0) {
    return {
      ...DEFAULT_CENTER,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05
    };
  }

  if (points.length === 1) {
    return {
      latitude: points[0].latitude,
      longitude: points[0].longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02
    };
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.8),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.8)
  };
};

const staticPreviewUrl = (lat: number, lng: number) =>
  `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=14&size=640x400&maptype=mapnik`;

const StaticLivePreview = ({ lat, lng }: { lat: number; lng: number }) => {
  const uri = staticPreviewUrl(lat, lng);
  const open = () => {
    const url =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?ll=${lat},${lng}&q=Incident`
        : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    void Linking.openURL(url);
  };

  return (
    <View style={styles.wrapper}>
      <Image source={{ uri }} style={styles.map} resizeMode="cover" />
      <View style={styles.staticOverlay} pointerEvents="box-none">
        <Pressable style={({ pressed }) => [styles.openMaps, pressed && { opacity: 0.9 }]} onPress={open}>
          <Text style={styles.openMapsText}>Open in Maps</Text>
        </Pressable>
      </View>
      <View style={styles.legend} pointerEvents="none">
        <Text style={styles.legendText}>Map preview</Text>
      </View>
    </View>
  );
};

/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic react-native-maps import */
type MapsPack = {
  MapView: ComponentType<any>;
  Marker: ComponentType<any>;
  Polyline: ComponentType<any>;
  PROVIDER_GOOGLE: string | undefined;
};

export const LiveTrackingMap = ({
  patientLocation,
  volunteerLocation,
  ambulanceLocation,
  ambulanceRoute,
  volunteerRoute
}: {
  patientLocation?: Coordinate;
  volunteerLocation?: Coordinate;
  ambulanceLocation?: Coordinate;
  ambulanceRoute?: Coordinate[];
  volunteerRoute?: Coordinate[];
}) => {
  const [maps, setMaps] = useState<MapsPack | "unavailable" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await import("react-native-maps");
        if (cancelled) {
          return;
        }
        const MapView = m.default;
        const Marker = m.Marker;
        const Polyline = m.Polyline;
        if (typeof MapView !== "function" || typeof Marker !== "function" || typeof Polyline !== "function") {
          setMaps("unavailable");
          return;
        }
        setMaps({
          MapView: MapView as ComponentType<any>,
          Marker: Marker as ComponentType<any>,
          Polyline: Polyline as ComponentType<any>,
          PROVIDER_GOOGLE: m.PROVIDER_GOOGLE as string | undefined
        });
      } catch {
        if (!cancelled) {
          setMaps("unavailable");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const points = useMemo<TrackedPoint[]>(() => {
    const next: TrackedPoint[] = [];
    if (patientLocation) {
      next.push({ ...patientLocation, title: "Patient", color: "#E53935" });
    }
    if (volunteerLocation) {
      next.push({ ...volunteerLocation, title: "Volunteer", color: "#1E63FF" });
    }
    if (ambulanceLocation) {
      next.push({ ...ambulanceLocation, title: "Ambulance", color: "#2E7D32" });
    }
    return next;
  }, [ambulanceLocation, patientLocation, volunteerLocation]);

  const initialRegion = useMemo(() => {
    const routePoints = [...(ambulanceRoute ?? []), ...(volunteerRoute ?? [])];
    return toRegion([...points, ...routePoints]);
  }, [ambulanceRoute, points, volunteerRoute]);

  const previewCenter = useMemo(() => {
    if (points.length === 0) {
      return DEFAULT_CENTER;
    }
    return {
      latitude: points.reduce((s, p) => s + p.latitude, 0) / points.length,
      longitude: points.reduce((s, p) => s + p.longitude, 0) / points.length
    };
  }, [points]);

  if (maps === null) {
    return (
      <View style={[styles.wrapper, styles.loadingWrap]}>
        <ActivityIndicator size="large" color="#1E63FF" />
        <Text style={styles.loadingText}>Loading map…</Text>
      </View>
    );
  }

  if (maps === "unavailable") {
    return <StaticLivePreview lat={previewCenter.latitude} lng={previewCenter.longitude} />;
  }

  const { MapView, Marker, Polyline, PROVIDER_GOOGLE } = maps;

  return (
    <View style={styles.wrapper}>
      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        region={initialRegion}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        loadingEnabled
        mapType="standard"
      >
        {volunteerRoute && volunteerRoute.length > 1 ? (
          <Polyline coordinates={volunteerRoute} strokeColor="#1E63FF" strokeWidth={5} lineCap="round" />
        ) : null}

        {ambulanceRoute && ambulanceRoute.length > 1 ? (
          <Polyline coordinates={ambulanceRoute} strokeColor="#2E7D32" strokeWidth={5} lineCap="round" />
        ) : null}

        {points.map((point) => (
          <Marker
            key={`${point.title}-${point.latitude}-${point.longitude}`}
            coordinate={point}
            title={point.title}
            pinColor={point.color}
          />
        ))}
      </MapView>

      <View style={styles.legend} pointerEvents="none">
        <Text style={styles.legendText}>Live map</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    height: 262,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EDF2F7",
    backgroundColor: "#F7FAFD"
  },
  loadingWrap: {
    justifyContent: "center",
    alignItems: "center",
    gap: 10
  },
  loadingText: {
    color: "#5C738C",
    fontSize: 13,
    fontWeight: "600"
  },
  map: {
    width: "100%",
    height: "100%"
  },
  staticOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: 12
  },
  openMaps: {
    backgroundColor: "rgba(255,255,255,0.96)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#C9DBF5"
  },
  openMapsText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1E63FF"
  },
  legend: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(30,99,255,0.15)",
    shadowColor: "#0F2E5A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3
  },
  legendText: {
    fontSize: 12,
    color: "#2E4057",
    fontWeight: "800"
  }
});
