import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  key: "patient" | "volunteer" | "ambulance";
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  ring: string;
};

const DEFAULT_CENTER: Coordinate = {
  latitude: 31.7054,
  longitude: 35.2024
};

/** RN forwardRef components are objects, not `function` — old check always failed. */
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
  const pad = 0.002;

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.008, (maxLat - minLat) * 1.6 + pad),
    longitudeDelta: Math.max(0.008, (maxLng - minLng) * 1.6 + pad)
  };
};

/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic react-native-maps import */
type MapsPack = {
  MapView: ComponentType<any>;
  Marker: ComponentType<any>;
  Polyline: ComponentType<any>;
  PROVIDER_GOOGLE: string | undefined;
};

const PIN_SIZE = 40;

const MarkerPin = ({
  icon,
  color,
  ring
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  ring: string;
}) => (
  <View style={styles.markerWrap} accessibilityLabel="map marker">
    <View style={[styles.markerRing, { borderColor: ring }]} />
    <View style={[styles.markerCore, { backgroundColor: color }]}>
      <MaterialCommunityIcons name={icon} size={22} color="#FFFFFF" />
    </View>
  </View>
);

/** In-app schematic when native maps are not available — no external apps. */
const LiveRouteDiagram = ({
  points,
  variant = "onLight"
}: {
  points: TrackedPoint[];
  variant?: "onLight" | "onDark";
}) => {
  const labelColor = variant === "onDark" ? "#E2E8F0" : "#10243A";
  const hintColor = variant === "onDark" ? "rgba(148,163,184,0.95)" : "#64748B";

  if (points.length === 0) {
    return (
      <View style={[styles.diagramOuter, styles.loadingWrap]}>
        <MaterialCommunityIcons name="map-marker-radius" size={40} color="#94A3B8" />
        <Text style={[styles.diagramEmpty, { color: hintColor }]}>Waiting for GPS positions…</Text>
      </View>
    );
  }

  return (
    <View style={styles.diagramOuter}>
      <View style={styles.diagramRow}>
        {points.map((p, index) => (
          <View key={p.key} style={styles.diagramSegment}>
            <View style={styles.diagramPair}>
              <MarkerPin icon={p.icon} color={p.color} ring={p.ring} />
              <Text style={[styles.diagramLabel, { color: labelColor }]}>{p.title}</Text>
            </View>
            {index < points.length - 1 ? (
              <MaterialCommunityIcons
                name="arrow-right-bold"
                size={18}
                color="#94A3B8"
                style={styles.diagramBetween}
              />
            ) : null}
          </View>
        ))}
      </View>
      <Text style={[styles.diagramHint, { color: hintColor }]}>Route updates when responders move</Text>
    </View>
  );
};

type MapBodyProps = {
  maps: MapsPack;
  initialRegion: Region;
  points: TrackedPoint[];
  ambulanceRoute?: Coordinate[];
  volunteerRoute?: Coordinate[];
  directVolunteerLine: Coordinate[] | null;
  directAmbulanceLine: Coordinate[] | null;
  mapViewStyle: StyleProp<ViewStyle>;
};

const NativeMapBody = ({
  maps,
  initialRegion,
  points,
  ambulanceRoute,
  volunteerRoute,
  directVolunteerLine,
  directAmbulanceLine,
  mapViewStyle
}: MapBodyProps) => {
  const { MapView, Marker, Polyline, PROVIDER_GOOGLE } = maps;

  return (
    <MapView
      style={mapViewStyle}
      initialRegion={initialRegion}
      region={initialRegion}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      showsUserLocation={false}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      loadingEnabled
      mapType="standard"
      rotateEnabled={false}
      pitchEnabled={false}
    >
      {volunteerRoute && volunteerRoute.length > 1 ? (
        <Polyline
          coordinates={volunteerRoute}
          strokeColor="#1E63FF"
          strokeWidth={5}
          lineCap="round"
          lineJoin="round"
        />
      ) : null}
      {directVolunteerLine && directVolunteerLine.length >= 2 ? (
        <Polyline
          coordinates={directVolunteerLine}
          strokeColor="#1E63FF"
          strokeWidth={3}
          lineDashPattern={[10, 6]}
          lineCap="round"
        />
      ) : null}

      {ambulanceRoute && ambulanceRoute.length > 1 ? (
        <Polyline
          coordinates={ambulanceRoute}
          strokeColor="#D11F34"
          strokeWidth={5}
          lineCap="round"
          lineJoin="round"
        />
      ) : null}
      {directAmbulanceLine && directAmbulanceLine.length >= 2 ? (
        <Polyline
          coordinates={directAmbulanceLine}
          strokeColor="#D11F34"
          strokeWidth={3}
          lineDashPattern={[10, 6]}
          lineCap="round"
        />
      ) : null}

      {points.map((point) => (
        <Marker
          key={point.key}
          coordinate={point}
          title={point.title}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <MarkerPin icon={point.icon} color={point.color} ring={point.ring} />
        </Marker>
      ))}
    </MapView>
  );
};

const EMBED_HEIGHT = 228;

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
  const [fullscreen, setFullscreen] = useState(false);
  const insets = useSafeAreaInsets();

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

  const points = useMemo<TrackedPoint[]>(() => {
    const byKey: Partial<Record<TrackedPoint["key"], TrackedPoint>> = {};
    if (patientLocation) {
      byKey.patient = {
        ...patientLocation,
        key: "patient",
        title: "You",
        icon: "crosshairs-gps",
        color: "#D11F34",
        ring: "rgba(209,31,52,0.45)"
      };
    }
    if (volunteerLocation) {
      byKey.volunteer = {
        ...volunteerLocation,
        key: "volunteer",
        title: "Volunteer",
        icon: "account-heart",
        color: "#1E63FF",
        ring: "rgba(30,99,255,0.45)"
      };
    }
    if (ambulanceLocation) {
      byKey.ambulance = {
        ...ambulanceLocation,
        key: "ambulance",
        title: "Ambulance",
        icon: "ambulance",
        color: "#1B5E20",
        ring: "rgba(27,94,32,0.45)"
      };
    }
    const order: TrackedPoint["key"][] = ["patient", "ambulance", "volunteer"];
    return order.flatMap((k) => (byKey[k] ? [byKey[k]!] : []));
  }, [ambulanceLocation, patientLocation, volunteerLocation]);

  const directVolunteerLine = useMemo(() => {
    if (volunteerRoute && volunteerRoute.length > 1) {
      return null;
    }
    if (patientLocation && volunteerLocation) {
      return [patientLocation, volunteerLocation];
    }
    return null;
  }, [patientLocation, volunteerLocation, volunteerRoute]);

  const directAmbulanceLine = useMemo(() => {
    if (ambulanceRoute && ambulanceRoute.length > 1) {
      return null;
    }
    if (patientLocation && ambulanceLocation) {
      return [patientLocation, ambulanceLocation];
    }
    return null;
  }, [ambulanceLocation, ambulanceRoute, patientLocation]);

  const initialRegion = useMemo(() => {
    const routePoints = [...(ambulanceRoute ?? []), ...(volunteerRoute ?? [])];
    const flat = points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    return toRegion([...flat, ...routePoints]);
  }, [ambulanceRoute, points, volunteerRoute]);

  const mapBodyProps: MapBodyProps | null =
    maps !== null && maps !== "unavailable"
      ? {
          maps,
          initialRegion,
          points,
          ambulanceRoute,
          volunteerRoute,
          directVolunteerLine,
          directAmbulanceLine,
          mapViewStyle: styles.mapFill
        }
      : null;

  const expandControl = (
    <Pressable
      style={({ pressed }) => [styles.expandFab, pressed && styles.expandFabPressed]}
      onPress={() => setFullscreen(true)}
      accessibilityLabel="Expand map full screen"
    >
      <MaterialCommunityIcons name="fullscreen" size={22} color="#10243A" />
    </Pressable>
  );

  const legend = (
    <View style={styles.legend} pointerEvents="none">
      <Text style={styles.legendTitle}>Live route</Text>
      <View style={styles.legendRow}>
        <View style={styles.legendDot} />
        <Text style={styles.legendSub}>Patient · Volunteer · Ambulance</Text>
      </View>
    </View>
  );

  const renderEmbedContent = () => {
    if (maps === null) {
      return (
        <View style={[styles.embedSurface, styles.loadingWrap]}>
          <ActivityIndicator size="large" color="#1E63FF" />
          <Text style={styles.loadingText}>Loading map…</Text>
        </View>
      );
    }

    if (maps === "unavailable" || !mapBodyProps) {
      return (
        <View style={styles.embedSurface}>
          <LiveRouteDiagram points={points} variant="onLight" />
          {expandControl}
          {legend}
        </View>
      );
    }

    return (
      <View style={styles.embedSurface}>
        <NativeMapBody {...mapBodyProps} mapViewStyle={styles.mapFill} />
        {expandControl}
        {legend}
      </View>
    );
  };

  return (
    <>
      <View style={styles.wrapper}>{renderEmbedContent()}</View>

      <Modal
        visible={fullscreen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setFullscreen(false)}
      >
        <View style={[styles.modalRoot, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Live route</Text>
            <Pressable
              style={({ pressed }) => [styles.modalClose, pressed && { opacity: 0.85 }]}
              onPress={() => setFullscreen(false)}
              accessibilityLabel="Close full screen map"
            >
              <MaterialCommunityIcons name="close" size={26} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.modalMapArea}>
            {maps === null ? (
              <View style={[styles.mapFill, styles.loadingWrap, styles.modalLoadingBg]}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={styles.modalLoadingText}>Loading map…</Text>
              </View>
            ) : maps === "unavailable" || !mapBodyProps ? (
              <View style={[styles.mapFill, styles.modalDiagramBg]}>
                <LiveRouteDiagram points={points} variant="onDark" />
              </View>
            ) : (
              <NativeMapBody {...mapBodyProps} mapViewStyle={styles.mapFill} />
            )}
          </View>

          <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Text style={styles.modalFooterText}>Pinch to zoom · Drag to pan</Text>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    height: EMBED_HEIGHT,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E6F3",
    backgroundColor: "#EEF4FB"
  },
  embedSurface: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#F7FAFD"
  },
  mapFill: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
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
    shadowColor: "#0F2E5A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 20
  },
  expandFabPressed: {
    opacity: 0.92
  },
  legend: {
    position: "absolute",
    top: 10,
    left: 10,
    zIndex: 15,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(30,99,255,0.18)",
    maxWidth: "72%"
  },
  legendTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#10243A"
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#22C55E"
  },
  legendSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "#5B6E84",
    flex: 1
  },
  markerWrap: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    alignItems: "center",
    justifyContent: "center"
  },
  markerRing: {
    position: "absolute",
    width: PIN_SIZE + 10,
    height: PIN_SIZE + 10,
    borderRadius: (PIN_SIZE + 10) / 2,
    borderWidth: 3
  },
  markerCore: {
    width: PIN_SIZE - 6,
    height: PIN_SIZE - 6,
    borderRadius: (PIN_SIZE - 6) / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  diagramOuter: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: "center"
  },
  diagramRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 2
  },
  diagramSegment: {
    flexDirection: "row",
    alignItems: "center"
  },
  diagramPair: {
    alignItems: "center",
    gap: 6
  },
  diagramBetween: {
    marginHorizontal: 6
  },
  diagramEmpty: {
    marginTop: 8,
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center"
  },
  diagramLabel: {
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    maxWidth: 92
  },
  diagramHint: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center"
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)"
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
  modalMapArea: {
    flex: 1,
    position: "relative"
  },
  modalLoadingBg: {
    backgroundColor: "#0B1520"
  },
  modalLoadingText: {
    marginTop: 8,
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "600"
  },
  modalDiagramBg: {
    backgroundColor: "#0B1520"
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingTop: 8,
    alignItems: "center"
  },
  modalFooterText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600"
  }
});
