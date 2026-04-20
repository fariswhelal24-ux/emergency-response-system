import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

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
  const mapsModule = useMemo(() => {
    try {
      // react-native-maps works in Expo Go for SDK 50+.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const maps = require("react-native-maps");
      return maps;
    } catch {
      return null;
    }
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
        title: "Volunteer",
        pinColor: "#1E88E5"
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

  if (!mapsModule?.default || !mapsModule?.Marker || !mapsModule?.Polyline) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>Live map needs a dev build</Text>
          <Text style={styles.fallbackText}>
            Incident GPS is updating. Install a dev client to render native maps on iOS.
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
        initialRegion={region}
        provider={Platform.OS === "android" ? providerGoogle : undefined}
        toolbarEnabled={false}
      >
        {volunteerToPatientLine.length >= 2 ? (
          <Polyline coordinates={volunteerToPatientLine} strokeColor="#1E88E5" strokeWidth={4} />
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
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Live Navigation</Text>
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
    borderColor: "#D9E6F3"
  },
  map: {
    width: "100%",
    height: "100%"
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  badgeText: {
    color: "#284A6A",
    fontSize: 11,
    fontWeight: "700"
  },
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F2F7FC",
    paddingHorizontal: 16
  },
  fallbackTitle: {
    color: "#1C3856",
    fontWeight: "800",
    fontSize: 13
  },
  fallbackText: {
    marginTop: 6,
    color: "#5C738C",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16
  }
});
