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

const DEFAULT_CENTER: Coordinate = {
  latitude: 31.7054,
  longitude: 35.2024
};

const isRenderableComponent = (c: unknown): boolean => {
  if (typeof c === "function") {
    return true;
  }
  if (typeof c === "object" && c !== null) {
    const o = c as Record<string, unknown>;
    return typeof o.render === "function" || "$$typeof" in o;
  }
  return false;
};

const createRegion = (points: Coordinate[]): Region => {
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

  const lats = points.map((point) => point.latitude);
  const lngs = points.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.8),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.8)
  };
};

const staticPreviewUrl = (lat: number, lng: number) =>
  `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=640x360&maptype=mapnik`;

const StaticMapPreview = ({ lat, lng }: { lat: number; lng: number }) => {
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
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>Map preview</Text>
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

export const IncidentMap = ({
  patientLocation,
  volunteerLocation,
  ambulanceLocation,
  routeGeometry
}: {
  patientLocation?: Coordinate;
  volunteerLocation?: Coordinate;
  ambulanceLocation?: Coordinate;
  routeGeometry?: Coordinate[];
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
        if (!isRenderableComponent(MapView) || !isRenderableComponent(Marker) || !isRenderableComponent(Polyline)) {
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

  const markers = useMemo(() => {
    const next: Array<{ key: string; coordinate: Coordinate; title: string; pinColor: string }> = [];

    if (patientLocation) {
      next.push({
        key: "patient",
        coordinate: patientLocation,
        title: "Patient",
        pinColor: "#E53935"
      });
    }
    if (volunteerLocation) {
      next.push({
        key: "volunteer",
        coordinate: volunteerLocation,
        title: "You",
        pinColor: "#1E63FF"
      });
    }
    if (ambulanceLocation) {
      next.push({
        key: "ambulance",
        coordinate: ambulanceLocation,
        title: "Ambulance",
        pinColor: "#2E7D32"
      });
    }

    return next;
  }, [ambulanceLocation, patientLocation, volunteerLocation]);

  const region = useMemo(
    () => createRegion([...markers.map((item) => item.coordinate), ...(routeGeometry ?? [])]),
    [markers, routeGeometry]
  );

  const volunteerToPatientLine = useMemo(() => {
    if (routeGeometry && routeGeometry.length > 1) {
      return routeGeometry;
    }
    if (!volunteerLocation || !patientLocation) {
      return [];
    }
    return [volunteerLocation, patientLocation];
  }, [patientLocation, routeGeometry, volunteerLocation]);

  const previewCenter = useMemo(() => {
    const pts = markers.map((m) => m.coordinate);
    if (pts.length === 0) {
      return DEFAULT_CENTER;
    }
    return {
      latitude: pts.reduce((s, p) => s + p.latitude, 0) / pts.length,
      longitude: pts.reduce((s, p) => s + p.longitude, 0) / pts.length
    };
  }, [markers]);

  if (maps === null) {
    return (
      <View style={[styles.wrapper, styles.loadingWrap]}>
        <ActivityIndicator size="large" color="#1E63FF" />
        <Text style={styles.loadingText}>Loading map…</Text>
      </View>
    );
  }

  if (maps === "unavailable") {
    return <StaticMapPreview lat={previewCenter.latitude} lng={previewCenter.longitude} />;
  }

  const { MapView, Marker, Polyline, PROVIDER_GOOGLE } = maps;

  return (
    <View style={styles.wrapper}>
      <MapView
        style={styles.map}
        initialRegion={region}
        region={region}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        loadingEnabled
        mapType="standard"
      >
        {volunteerToPatientLine.length >= 2 ? (
          <Polyline coordinates={volunteerToPatientLine} strokeColor="#1E63FF" strokeWidth={5} lineCap="round" />
        ) : null}
        {markers.map((item) => (
          <Marker
            key={item.key}
            coordinate={item.coordinate}
            title={item.title}
            pinColor={item.pinColor}
          />
        ))}
      </MapView>
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>Live map</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    height: 180,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E6F3",
    backgroundColor: "#E8F0FA"
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
    padding: 10
  },
  openMaps: {
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C9DBF5"
  },
  openMapsText: {
    color: "#1E63FF",
    fontWeight: "800",
    fontSize: 12
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(30,99,255,0.2)",
    shadowColor: "#0F2E5A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3
  },
  badgeText: {
    color: "#1C3856",
    fontSize: 11,
    fontWeight: "800"
  }
});
