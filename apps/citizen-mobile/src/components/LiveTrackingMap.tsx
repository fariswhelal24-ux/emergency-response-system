import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";

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

export const LiveTrackingMap = ({
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
  const isExpoGo = Constants.appOwnership === "expo";

  const mapsModule = useMemo(() => {
    if (isExpoGo) {
      return null;
    }
    try {
      // `react-native-maps` may be unavailable in Expo Go runtime.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const maps = require("react-native-maps");
      return maps;
    } catch {
      return null;
    }
  }, [isExpoGo]);

  const points = useMemo<TrackedPoint[]>(() => {
    const next: TrackedPoint[] = [];
    if (patientLocation) {
      next.push({ ...patientLocation, title: "Patient", color: "#E53935" });
    }
    if (volunteerLocation) {
      next.push({ ...volunteerLocation, title: "Volunteer", color: "#1E88E5" });
    }
    if (ambulanceLocation) {
      next.push({ ...ambulanceLocation, title: "Ambulance", color: "#2E7D32" });
    }
    return next;
  }, [ambulanceLocation, patientLocation, volunteerLocation]);

  const initialRegion = useMemo(() => {
    const routePoints = ambulanceRoute ?? [];
    return toRegion([...points, ...routePoints]);
  }, [ambulanceRoute, points]);

  if (!mapsModule?.default || !mapsModule?.Marker || !mapsModule?.Polyline) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>Live map needs a dev build</Text>
          <Text style={styles.fallbackText}>
            GPS updates are still running. Use EAS/Dev Client to render native maps on iOS.
          </Text>
        </View>
      </View>
    );
  }

  const MapView = mapsModule.default;
  const Marker = mapsModule.Marker;
  const Polyline = mapsModule.Polyline;
  const providerGoogle = mapsModule.PROVIDER_GOOGLE;

  return (
    <View style={styles.wrapper}>
      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        provider={Platform.OS === "android" ? providerGoogle : undefined}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {ambulanceRoute && ambulanceRoute.length > 1 ? (
          <Polyline coordinates={ambulanceRoute} strokeColor="#2E7D32" strokeWidth={4} />
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

      <View style={styles.legend}>
        <Text style={styles.legendText}>Live Map</Text>
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
  map: {
    width: "100%",
    height: "100%"
  },
  legend: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  legendText: {
    fontSize: 12,
    color: "#2E4057",
    fontWeight: "700"
  },
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: "#F7FAFD"
  },
  fallbackTitle: {
    color: "#1E3550",
    fontSize: 15,
    fontWeight: "800"
  },
  fallbackText: {
    marginTop: 8,
    color: "#5D7288",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18
  }
});
