import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

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
  ambulanceRoute,
  volunteerRoute
}: {
  patientLocation?: Coordinate;
  volunteerLocation?: Coordinate;
  ambulanceLocation?: Coordinate;
  ambulanceRoute?: Coordinate[];
  volunteerRoute?: Coordinate[];
}) => {
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
  map: {
    width: "100%",
    height: "100%"
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
