import { ReactNode, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { LiveTrackingMap } from "../components/LiveTrackingMap";
import { colors, radius, spacing } from "../theme/tokens";

const dispatchedData = {
  etaMinutes: 3,
  unitLabel: "Nearest available ambulance unit",
  responderName: "Nearest responder",
  responderRole: "Certified EMT",
  responderUnit: "Emergency Unit",
  vehicleCode: "Assigned by dispatch",
  volunteerName: "Nearest volunteer",
  volunteerSpecialty: "Medical Volunteer",
  volunteerMessage: "has been notified.",
  helperText: "Call will stay connected for updates and guidance.",
  updateChips: ["Condition changed", "More bleeding", "Patient moved", "Breathing changed"],
  aiGuidance: [
    {
      id: "1",
      title: "Check Breathing",
      description: "Make sure the person is breathing. If not, begin CPR.",
      tone: "success" as const
    },
    {
      id: "2",
      title: "Stop Severe Bleeding",
      description: "Apply firm direct pressure with a clean cloth and keep pressure steady.",
      tone: "emergency" as const
    }
  ]
};

const cardShadow = {
  shadowColor: "#153250",
  shadowOffset: {
    width: 0,
    height: 14
  },
  shadowOpacity: 0.08,
  shadowRadius: 22,
  elevation: 8
} as const;

type LiveCoordinate = {
  latitude: number;
  longitude: number;
};

type CitizenLiveTrackingState = {
  statusText: string;
  volunteerLocation?: LiveCoordinate;
  ambulanceLocation?: LiveCoordinate & { etaMinutes?: number };
  citizenLocation?: LiveCoordinate;
  ambulanceRoute?: LiveCoordinate[];
  syncState: "connecting" | "connected" | "offline";
};

const AvatarBubble = ({
  initials,
  tint,
  size = 54
}: {
  initials: string;
  tint: string;
  size?: number;
}) => (
  <View
    style={[
      styles.avatarBubble,
      {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tint
      }
    ]}
  >
    <Text style={[styles.avatarInitials, size < 50 && styles.avatarInitialsSmall]}>{initials}</Text>
  </View>
);

const CardSurface = ({
  children,
  style
}: {
  children: ReactNode;
  style?: object;
}) => <View style={[styles.cardSurface, cardShadow, style]}>{children}</View>;

export const AmbulanceDispatchedScreen = ({
  caseSnapshot,
  liveTracking,
  onOpenFirstAid,
  onSendUpdate,
  onContactVolunteer,
  onOpenSettings,
  onEndCase
}: {
  caseSnapshot: {
    caseNumber: string;
    emergencyType: string;
    address: string;
    aiSummary: string;
    ambulanceEtaMinutes: number | null;
    volunteerEtaMinutes: number | null;
  };
  liveTracking: CitizenLiveTrackingState;
  onOpenFirstAid: () => void;
  onSendUpdate: (message: string) => void;
  onContactVolunteer: () => void;
  onOpenSettings: () => void;
  onEndCase: () => void;
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [updateText, setUpdateText] = useState("");

  const sendMessage = useMemo(() => {
    if (selectedChip && updateText.trim().length > 0) {
      return `${selectedChip}: ${updateText.trim()}`;
    }

    return selectedChip ?? updateText.trim();
  }, [selectedChip, updateText]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.bgTextureTop} />
      <View style={styles.bgTextureCircle} />
      <View style={styles.bgTextureCrossA}>
        <Text style={styles.crossGlyph}>+</Text>
      </View>
      <View style={styles.bgTextureCrossB}>
        <Text style={styles.crossGlyph}>+</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerProfileWrap}>
            <AvatarBubble initials="SD" tint="#F6DAD8" size={48} />
          </View>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>RapidAid</Text>
          </View>

          <Pressable style={[styles.headerAction, styles.qAction]} onPress={onOpenSettings}>
            <MaterialCommunityIcons name="cog-outline" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.statusWrap}>
          <Text style={styles.statusTitle}>Ambulance Dispatched</Text>
          <Text style={styles.statusSubtitle}>{liveTracking.statusText || "Help is on the way"}</Text>
          <Text style={styles.statusCaseMeta}>
            {(caseSnapshot.caseNumber || "New Case") + " • " + caseSnapshot.emergencyType}
          </Text>
          <Text style={styles.statusSync}>
            {liveTracking.syncState === "connected"
              ? "Live sync connected"
              : liveTracking.syncState === "connecting"
                ? "Connecting live sync..."
                : "Live sync offline"}
          </Text>
        </View>

        <CardSurface style={styles.mapCard}>
          <View style={styles.mapHeaderRow}>
            <Text style={styles.mapCardTitle}>Live Route</Text>
            <View style={styles.mapLiveBadge}>
              <View style={styles.mapLiveDot} />
              <Text style={styles.mapLiveText}>Tracking live</Text>
            </View>
          </View>

          <LiveTrackingMap
            patientLocation={liveTracking.citizenLocation}
            volunteerLocation={liveTracking.volunteerLocation}
            ambulanceLocation={liveTracking.ambulanceLocation}
            ambulanceRoute={liveTracking.ambulanceRoute}
          />
        </CardSurface>

        <CardSurface style={styles.etaCard}>
          <View style={styles.etaHeaderRow}>
            <Text style={styles.etaText}>
              ETA: {liveTracking.ambulanceLocation?.etaMinutes ?? caseSnapshot.ambulanceEtaMinutes ?? dispatchedData.etaMinutes} min
            </Text>
            <Text style={styles.etaMeta}>({dispatchedData.unitLabel})</Text>
          </View>

          <View style={styles.responderRow}>
            <AvatarBubble initials="AD" tint="#E8F0FA" />

            <View style={styles.responderInfo}>
              <Text style={styles.responderName}>🚑 {dispatchedData.responderName}</Text>
              <Text style={styles.responderMeta}>{dispatchedData.responderRole}</Text>
              <Text style={styles.responderMeta}>{dispatchedData.responderUnit}</Text>
              <Text style={styles.vehicleCodeLabel}>vehicle code:</Text>
              <Text style={styles.vehicleCodeValue}>{dispatchedData.vehicleCode}</Text>
            </View>

            <View style={styles.ambulanceThumb}>
              <MaterialCommunityIcons name="ambulance" size={34} color="#D11F34" />
            </View>
          </View>
        </CardSurface>

        <CardSurface style={styles.volunteerCard}>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardIconSoftGold}>
              <MaterialCommunityIcons name="shield-check" size={18} color="#B88214" />
            </View>
            <Text style={styles.cardTitleText}>Medical Volunteer Alerted</Text>
          </View>

          <View style={styles.volunteerRow}>
            <View style={styles.volunteerTextWrap}>
              <Text style={styles.volunteerText}>
                {dispatchedData.volunteerName} ({dispatchedData.volunteerSpecialty}) {dispatchedData.volunteerMessage}
              </Text>
              <Text style={styles.responderSupport}>Location: {caseSnapshot.address}</Text>

              <Pressable style={styles.contactButton} onPress={onContactVolunteer}>
                <MaterialCommunityIcons name="phone-outline" size={16} color="#FFFFFF" />
                <Text style={styles.contactButtonText}>Contact Volunteer</Text>
              </Pressable>
            </View>

            <AvatarBubble initials="SJ" tint="#FCE6D6" size={64} />
          </View>
        </CardSurface>

        <CardSurface style={styles.guidanceCard}>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardIconSoftRed}>
              <MaterialCommunityIcons name="message-text-outline" size={19} color="#D12136" />
            </View>
            <View style={styles.guidanceTitleWrap}>
              <Text style={styles.cardTitleText}>AI First-Aid Guidance</Text>
              <Text style={styles.guidanceSubtitle}>Stay calm. Follow these steps until help arrives.</Text>
            </View>
          </View>

          <Text style={styles.guidanceSummary}>{caseSnapshot.aiSummary}</Text>

          <View style={styles.guidanceList}>
            {dispatchedData.aiGuidance.map((item) => (
              <View key={item.id} style={styles.guidanceItem}>
                <View
                  style={[
                    styles.guidanceNumber,
                    item.tone === "success" ? styles.guidanceNumberSuccess : styles.guidanceNumberEmergency
                  ]}
                >
                  <Text style={styles.guidanceNumberText}>{item.id}</Text>
                </View>

                <View style={styles.guidanceContent}>
                  <Text style={styles.guidanceItemTitle}>{item.title}</Text>
                  <Text style={styles.guidanceItemText}>{item.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable style={styles.guidanceLink} onPress={onOpenFirstAid}>
            <Text style={styles.guidanceLinkText}>Open live first-aid guidance</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#D12136" />
          </Pressable>
        </CardSurface>

        <Pressable style={styles.primaryCta} onPress={() => setSheetOpen(true)}>
          <View style={styles.primaryCtaGlowLeft} />
          <View style={styles.primaryCtaGlowRight} />
          <MaterialCommunityIcons name="message-alert-outline" size={20} color="#FFFFFF" />
          <Text style={styles.primaryCtaText}>Send Additional Info +</Text>
        </Pressable>

        <Text style={styles.helperText}>{dispatchedData.helperText}</Text>

        <Pressable style={styles.endCaseButton} onPress={onEndCase}>
          <MaterialCommunityIcons name="check-circle-outline" size={18} color="#D12136" />
          <Text style={styles.endCaseButtonText}>End Case</Text>
        </Pressable>
      </ScrollView>

      <Modal transparent animationType="slide" visible={sheetOpen} onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetPanel}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Send Additional Info</Text>
            <Text style={styles.sheetSubtitle}>This update will be shared with dispatch and the incoming care team.</Text>

            <View style={styles.sheetChipWrap}>
              {dispatchedData.updateChips.map((chip) => {
                const active = chip === selectedChip;
                return (
                  <Pressable
                    key={chip}
                    style={[styles.sheetChip, active && styles.sheetChipActive]}
                    onPress={() => setSelectedChip(active ? null : chip)}
                  >
                    <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]}>{chip}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={updateText}
              onChangeText={setUpdateText}
              multiline
              placeholder="Add location notes, scene changes, or patient updates"
              placeholderTextColor="#8A98A8"
              style={styles.sheetInput}
            />

            <Pressable
              style={[styles.sheetSendButton, sendMessage.length === 0 && styles.sheetSendButtonDisabled]}
              disabled={sendMessage.length === 0}
              onPress={() => {
                onSendUpdate(sendMessage);
                setSheetOpen(false);
                setSelectedChip(null);
                setUpdateText("");
              }}
            >
              <Text style={styles.sheetSendButtonText}>Send Update</Text>
            </Pressable>

            <Pressable style={styles.sheetCancelButton} onPress={() => setSheetOpen(false)}>
              <Text style={styles.sheetCancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F8FB"
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 152,
    gap: spacing.lg
  },
  bgTextureTop: {
    position: "absolute",
    top: 108,
    left: 18,
    right: 18,
    height: 280,
    borderRadius: 42,
    backgroundColor: "#EEF3F8"
  },
  bgTextureCircle: {
    position: "absolute",
    top: 210,
    right: -42,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#ECF1F6"
  },
  bgTextureCrossA: {
    position: "absolute",
    top: 188,
    right: 34
  },
  bgTextureCrossB: {
    position: "absolute",
    top: 542,
    left: 34
  },
  crossGlyph: {
    color: "#F0C2C9",
    fontSize: 58,
    fontWeight: "200"
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm
  },
  headerProfileWrap: {
    width: 48
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "center"
  },
  headerTitle: {
    color: "#22364D",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.2
  },
  headerAction: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 10,
    position: "absolute",
    right: 16,
    top: 14,
    zIndex: 10
  },
  qAction: {
    backgroundColor: "#D90C1E",
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center"
  },
  qActionText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700"
  },
  avatarBubble: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)"
  },
  avatarInitials: {
    color: "#21374E",
    fontSize: 18,
    fontWeight: "800"
  },
  avatarInitialsSmall: {
    fontSize: 15
  },
  statusWrap: {
    alignItems: "center",
    paddingTop: spacing.sm,
    paddingBottom: spacing.md
  },
  statusIconWrap: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#EAF8F1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm
  },
  statusIconInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#26A667",
    alignItems: "center",
    justifyContent: "center"
  },
  statusTitle: {
    color: "#182D43",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center"
  },
  statusSubtitle: {
    color: "#26A667",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6
  },
  statusCaseMeta: {
    color: "#48607A",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "center"
  },
  statusSync: {
    color: "#6C7E92",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4
  },
  cardSurface: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#E7EDF4"
  },
  mapCard: {
    padding: spacing.md
  },
  mapHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md
  },
  mapCardTitle: {
    color: "#25384D",
    fontSize: 17,
    fontWeight: "800"
  },
  mapLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.round,
    backgroundColor: "#F3F7FB"
  },
  mapLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E32B39"
  },
  mapLiveText: {
    color: "#7A8898",
    fontSize: 12,
    fontWeight: "700"
  },
  mapCanvas: {
    height: 262,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#F7FAFD",
    borderWidth: 1,
    borderColor: "#EDF2F7"
  },
  mapBlock: {
    position: "absolute",
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#EBF0F6"
  },
  mapRoad: {
    position: "absolute",
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    opacity: 0.98
  },
  mapStreet: {
    position: "absolute",
    width: 14,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    opacity: 0.98
  },
  routeDot: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#E33343"
  },
  volunteerRouteDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2D80FF",
    opacity: 0.85
  },
  ambulanceBadge: {
    position: "absolute",
    top: 42,
    right: 42,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7EDF5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#17314A",
    shadowOffset: {
      width: 0,
      height: 8
    },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 7
  },
  endpointMarker: {
    position: "absolute",
    top: 48,
    right: 108,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#1D73F0",
    borderWidth: 4,
    borderColor: "#D9E9FF"
  },
  patientPulseOuter: {
    position: "absolute",
    bottom: 44,
    left: 58,
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "rgba(41, 120, 244, 0.12)"
  },
  patientPulseInner: {
    position: "absolute",
    bottom: 62,
    left: 76,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(41, 120, 244, 0.18)"
  },
  patientPinWrap: {
    position: "absolute",
    bottom: 68,
    left: 94,
    alignItems: "center"
  },
  patientPinCenter: {
    position: "absolute",
    top: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF"
  },
  etaCard: {
    padding: spacing.lg
  },
  etaHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: spacing.md
  },
  etaText: {
    color: "#182B42",
    fontSize: 27,
    fontWeight: "900"
  },
  etaMeta: {
    color: "#748395",
    fontSize: 14,
    fontWeight: "600"
  },
  responderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  responderInfo: {
    flex: 1
  },
  responderName: {
    color: "#1A2E44",
    fontSize: 18,
    fontWeight: "800"
  },
  responderMeta: {
    color: "#66788B",
    fontSize: 13,
    marginTop: 3
  },
  vehicleCodeLabel: {
    color: "#9AA7B5",
    fontSize: 12,
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  vehicleCodeValue: {
    color: "#1B3047",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2
  },
  ambulanceThumb: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#FFF2F4",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#F8D6DB"
  },
  volunteerCard: {
    padding: spacing.lg
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  cardIconSoftGold: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFF4D9",
    alignItems: "center",
    justifyContent: "center"
  },
  cardIconSoftRed: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFE5E8",
    alignItems: "center",
    justifyContent: "center"
  },
  cardTitleText: {
    color: "#1B3148",
    fontSize: 17,
    fontWeight: "800"
  },
  volunteerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  volunteerTextWrap: {
    flex: 1,
    gap: spacing.md
  },
  volunteerText: {
    color: "#53667A",
    fontSize: 14,
    lineHeight: 22
  },
  responderSupport: {
    color: "#667C95",
    fontSize: 12,
    marginTop: 4
  },
  contactButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.round,
    backgroundColor: "#2DAB6F"
  },
  contactButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800"
  },
  guidanceCard: {
    padding: spacing.lg
  },
  guidanceTitleWrap: {
    flex: 1
  },
  guidanceSubtitle: {
    color: "#7B8794",
    fontSize: 13,
    marginTop: 3
  },
  guidanceSummary: {
    color: "#384E66",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: spacing.md
  },
  guidanceList: {
    gap: spacing.md
  },
  guidanceItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: 4
  },
  guidanceNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },
  guidanceNumberSuccess: {
    backgroundColor: "#E3F7EC"
  },
  guidanceNumberEmergency: {
    backgroundColor: "#FFE3E7"
  },
  guidanceNumberText: {
    color: "#193048",
    fontSize: 14,
    fontWeight: "900"
  },
  guidanceContent: {
    flex: 1
  },
  guidanceItemTitle: {
    color: "#1B3046",
    fontSize: 15,
    fontWeight: "800"
  },
  guidanceItemText: {
    color: "#607286",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4
  },
  guidanceLink: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  guidanceLinkText: {
    color: "#D12136",
    fontSize: 14,
    fontWeight: "700"
  },
  primaryCta: {
    minHeight: 62,
    borderRadius: radius.round,
    backgroundColor: "#DA2338",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    ...cardShadow
  },
  primaryCtaGlowLeft: {
    position: "absolute",
    left: -24,
    top: -12,
    bottom: -12,
    width: 180,
    backgroundColor: "rgba(255, 124, 133, 0.34)",
    borderRadius: 90
  },
  primaryCtaGlowRight: {
    position: "absolute",
    right: -18,
    top: -18,
    bottom: -18,
    width: 170,
    backgroundColor: "rgba(165, 16, 32, 0.28)",
    borderRadius: 90
  },
  primaryCtaText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900"
  },
  helperText: {
    color: "#8D99A7",
    fontSize: 12,
    textAlign: "center",
    marginTop: -4
  },
  endCaseButton: {
    minHeight: 52,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: "#F2B9C1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  endCaseButtonText: {
    color: "#D12136",
    fontSize: 15,
    fontWeight: "800"
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17, 31, 48, 0.34)",
    justifyContent: "flex-end"
  },
  sheetPanel: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: spacing.lg,
    gap: spacing.md
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D8E0E8"
  },
  sheetTitle: {
    color: "#193048",
    fontSize: 21,
    fontWeight: "800"
  },
  sheetSubtitle: {
    color: "#718395",
    fontSize: 14,
    lineHeight: 20
  },
  sheetChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  sheetChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.round,
    backgroundColor: "#F5F8FB",
    borderWidth: 1,
    borderColor: "#E5EBF2"
  },
  sheetChipActive: {
    backgroundColor: "#FFE4E8",
    borderColor: "#F2B7C0"
  },
  sheetChipText: {
    color: "#4F6479",
    fontSize: 13,
    fontWeight: "700"
  },
  sheetChipTextActive: {
    color: "#D12036"
  },
  sheetInput: {
    minHeight: 110,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E4EAF1",
    backgroundColor: "#F9FBFD",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: "#163048",
    textAlignVertical: "top",
    fontSize: 14,
    lineHeight: 21
  },
  sheetSendButton: {
    minHeight: 56,
    borderRadius: radius.round,
    backgroundColor: "#DA2438",
    alignItems: "center",
    justifyContent: "center"
  },
  sheetSendButtonDisabled: {
    opacity: 0.46
  },
  sheetSendButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800"
  },
  sheetCancelButton: {
    minHeight: 54,
    borderRadius: radius.round,
    backgroundColor: "#F4F7FA",
    borderWidth: 1,
    borderColor: "#E4EAF1",
    alignItems: "center",
    justifyContent: "center"
  },
  sheetCancelButtonText: {
    color: "#40566D",
    fontSize: 15,
    fontWeight: "700"
  }
});
