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
  map: {
    width: "100%",
    height: "100%"
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
