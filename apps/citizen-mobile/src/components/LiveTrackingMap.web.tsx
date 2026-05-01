import { useMemo } from "react";
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

type Coordinate = {
  latitude: number;
  longitude: number;
};

const buildStaticMapUrl = (lat: number, lng: number, width = 640, height = 400) =>
  `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=14&size=${width}x${height}&maptype=mapnik`;

const openInMaps = (lat: number, lng: number) => {
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?ll=${lat},${lng}&q=Incident`
      : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  void Linking.openURL(url);
};

export const LiveTrackingMap = ({
  patientLocation,
  volunteerLocation,
  ambulanceLocation,
  ambulanceRoute: _ambulanceRoute,
  volunteerRoute: _volunteerRoute
}: {
  patientLocation?: Coordinate;
  volunteerLocation?: Coordinate;
  ambulanceLocation?: Coordinate;
  ambulanceRoute?: Coordinate[];
  volunteerRoute?: Coordinate[];
}) => {
  const center = useMemo(() => {
    const pts = [patientLocation, volunteerLocation, ambulanceLocation].filter(Boolean) as Coordinate[];
    if (pts.length === 0) {
      return { latitude: 31.7054, longitude: 35.2024 };
    }
    return {
      latitude: pts.reduce((s, p) => s + p.latitude, 0) / pts.length,
      longitude: pts.reduce((s, p) => s + p.longitude, 0) / pts.length
    };
  }, [ambulanceLocation, patientLocation, volunteerLocation]);

  const uri = useMemo(
    () => buildStaticMapUrl(center.latitude, center.longitude),
    [center.latitude, center.longitude]
  );

  return (
    <View style={styles.wrapper}>
      <Image source={{ uri }} style={styles.mapImage} resizeMode="cover" accessibilityLabel="Map preview" />
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.openBtn, pressed && styles.openBtnPressed]}
          onPress={() => openInMaps(center.latitude, center.longitude)}
        >
          <Text style={styles.openBtnText}>Open in Maps</Text>
        </Pressable>
      </View>
      <View style={styles.legend} pointerEvents="none">
        <Text style={styles.legendText}>Live map (web)</Text>
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
  mapImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: 12
  },
  openBtn: {
    backgroundColor: "rgba(255,255,255,0.96)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#C9DBF5"
  },
  openBtnPressed: {
    opacity: 0.9
  },
  openBtnText: {
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
    borderColor: "rgba(30,99,255,0.15)"
  },
  legendText: {
    fontSize: 12,
    color: "#2E4057",
    fontWeight: "800"
  }
});
