import { useMemo } from "react";
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

type Coordinate = {
  latitude: number;
  longitude: number;
};

const buildStaticMapUrl = (lat: number, lng: number, width = 640, height = 360) =>
  `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=${width}x${height}&maptype=mapnik`;

const openInMaps = (lat: number, lng: number) => {
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?ll=${lat},${lng}&q=Incident`
      : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  void Linking.openURL(url);
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
  const center = useMemo(() => {
    const pts = [patientLocation, volunteerLocation, ambulanceLocation, routeGeometry?.[0]].filter(
      Boolean
    ) as Coordinate[];
    if (pts.length === 0) {
      return { latitude: 31.7054, longitude: 35.2024 };
    }
    return {
      latitude: pts.reduce((s, p) => s + p.latitude, 0) / pts.length,
      longitude: pts.reduce((s, p) => s + p.longitude, 0) / pts.length
    };
  }, [ambulanceLocation, patientLocation, routeGeometry, volunteerLocation]);

  const uri = useMemo(
    () => buildStaticMapUrl(center.latitude, center.longitude),
    [center.latitude, center.longitude]
  );

  return (
    <View style={styles.wrapper}>
      <Image source={{ uri }} style={styles.mapImage} resizeMode="cover" accessibilityLabel="Map preview" />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.chipRow}>
          {patientLocation ? (
            <View style={[styles.chip, styles.chipPatient]}>
              <Text style={styles.chipText}>Patient</Text>
            </View>
          ) : null}
          {volunteerLocation ? (
            <View style={[styles.chip, styles.chipYou]}>
              <Text style={styles.chipText}>You</Text>
            </View>
          ) : null}
        </View>
        <Pressable
          style={({ pressed }) => [styles.openBtn, pressed && styles.openBtnPressed]}
          onPress={() => openInMaps(center.latitude, center.longitude)}
        >
          <Text style={styles.openBtnText}>Open in Maps</Text>
        </Pressable>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Live route (web preview)</Text>
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
  mapImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    padding: 10
  },
  chipRow: {
    flexDirection: "row",
    gap: 8
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1
  },
  chipPatient: {
    backgroundColor: "rgba(229,57,53,0.12)",
    borderColor: "rgba(229,57,53,0.35)"
  },
  chipYou: {
    backgroundColor: "rgba(30,136,229,0.12)",
    borderColor: "rgba(30,136,229,0.35)"
  },
  chipText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1C3856"
  },
  openBtn: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C9DBF5"
  },
  openBtnPressed: {
    opacity: 0.88
  },
  openBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1E63FF"
  },
  badge: {
    position: "absolute",
    bottom: 8,
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
  }
});
