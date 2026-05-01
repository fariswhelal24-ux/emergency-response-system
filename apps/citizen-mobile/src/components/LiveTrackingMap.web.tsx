import { useMemo, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Coordinate = {
  latitude: number;
  longitude: number;
};

const buildStaticMapUrl = (lat: number, lng: number, width: number, height: number) =>
  `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=14&size=${width}x${height}&maptype=mapnik`;

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
  const [fullscreen, setFullscreen] = useState(false);
  const insets = useSafeAreaInsets();

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

  const uriEmbed = useMemo(
    () => buildStaticMapUrl(center.latitude, center.longitude, 640, 400),
    [center.latitude, center.longitude]
  );
  const uriFull = useMemo(
    () => buildStaticMapUrl(center.latitude, center.longitude, 1024, 768),
    [center.latitude, center.longitude]
  );

  return (
    <>
      <View style={styles.wrapper}>
        <Image source={{ uri: uriEmbed }} style={styles.mapImage} resizeMode="cover" accessibilityLabel="Map" />
        <View style={styles.legend} pointerEvents="none">
          <Text style={styles.legendTitle}>Live route</Text>
          <Text style={styles.legendSub}>You · Ambulance · Volunteer</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.expandFab, pressed && { opacity: 0.9 }]}
          onPress={() => setFullscreen(true)}
          accessibilityLabel="Expand map"
        >
          <MaterialCommunityIcons name="fullscreen" size={22} color="#10243A" />
        </Pressable>
      </View>

      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={[styles.modalRoot, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Live route</Text>
            <Pressable style={styles.modalClose} onPress={() => setFullscreen(false)}>
              <MaterialCommunityIcons name="close" size={26} color="#FFFFFF" />
            </Pressable>
          </View>
          <Image source={{ uri: uriFull }} style={styles.modalImage} resizeMode="contain" />
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    height: 228,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E6F3",
    backgroundColor: "#EEF4FB"
  },
  mapImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  legend: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(30,99,255,0.18)"
  },
  legendTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#10243A"
  },
  legendSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: "#5B6E84"
  },
  expandFab: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C9DBF5",
    elevation: 4
  },
  modalRoot: {
    flex: 1,
    backgroundColor: "#0A1628"
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800"
  },
  modalClose: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center"
  },
  modalImage: {
    flex: 1,
    width: "100%"
  }
});
