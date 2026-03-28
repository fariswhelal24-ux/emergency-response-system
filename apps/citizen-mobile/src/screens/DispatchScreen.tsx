import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { liveCase } from "../data/mockCitizen";
import { Card, GhostButton, PrimaryButton, ScreenShell, SectionTitle } from "../components/Ui";
import { colors, radius, spacing } from "../theme/tokens";

export const DispatchScreen = ({
  onOpenFirstAid,
  onSendUpdate
}: {
  onOpenFirstAid: () => void;
  onSendUpdate: (message: string) => void;
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [updateText, setUpdateText] = useState("");

  const sendMessage = useMemo(() => {
    if (selectedChip && updateText.trim().length) {
      return `${selectedChip}: ${updateText.trim()}`;
    }

    return selectedChip ?? updateText.trim();
  }, [selectedChip, updateText]);

  return (
    <ScreenShell>
      <Card>
        <SectionTitle title="Ambulance Dispatched" subtitle="Help is on the way" />

        <View style={styles.mapPanel}>
          <Text style={styles.mapTitle}>Live Incident Map</Text>
          <Text style={styles.mapMeta}>Patient • Ambulance • Volunteer routes</Text>
          <View style={styles.markerRow}>
            <Text style={[styles.marker, styles.patientMarker]}>Patient</Text>
            <Text style={[styles.marker, styles.ambulanceMarker]}>Ambulance</Text>
            <Text style={[styles.marker, styles.volunteerMarker]}>Volunteer</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <Card style={styles.smallCard}>
            <Text style={styles.cardKicker}>ETA</Text>
            <Text style={styles.bigValue}>{liveCase.etaMinutes} min</Text>
          </Card>
          <Card style={styles.smallCard}>
            <Text style={styles.cardKicker}>Volunteer ETA</Text>
            <Text style={styles.bigValue}>{liveCase.volunteerEtaMinutes} min</Text>
          </Card>
        </View>

        <Card style={styles.unitCard}>
          <Text style={styles.cardKicker}>Ambulance Unit</Text>
          <Text style={styles.unitTitle}>{liveCase.ambulanceUnit}</Text>
          <Text style={styles.unitSub}>{liveCase.ambulanceCrew}</Text>
        </Card>

        <Card style={styles.unitCard}>
          <Text style={styles.cardKicker}>Volunteer Alert</Text>
          <Text style={styles.unitTitle}>{liveCase.volunteerName}</Text>
          <Text style={styles.unitSub}>{liveCase.volunteerSpecialty}</Text>
        </Card>

        <Card style={styles.guidanceCard}>
          <Text style={styles.guidanceTitle}>AI First-Aid Guidance</Text>
          <Text style={styles.guidanceCopy}>{liveCase.aiSummary}</Text>
          <PrimaryButton label="Open Live Guidance" onPress={onOpenFirstAid} />
        </Card>

        <View style={styles.actionRow}>
          <PrimaryButton label="Contact Volunteer" onPress={() => {}} small />
          <GhostButton label="Send Additional Info" onPress={() => setSheetOpen(true)} />
        </View>
      </Card>

      {sheetOpen ? (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Send Additional Info</Text>
            <Text style={styles.sheetSub}>This update will be shared with dispatcher and responders</Text>

            <View style={styles.chipsWrap}>
              {liveCase.quickUpdateChips.map((chip) => {
                const selected = chip === selectedChip;
                return (
                  <Pressable
                    key={chip}
                    onPress={() => setSelectedChip(selected ? null : chip)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{chip}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.quickActionsRow}>
              <Text style={styles.ghostMini}>+ Add photo</Text>
              <Text style={styles.ghostMini}>● Record audio</Text>
              <Text style={styles.ghostMini}>⌖ Share live location</Text>
              <Text style={styles.ghostMini}>Voice input</Text>
            </View>

            <TextInput
              value={updateText}
              onChangeText={setUpdateText}
              multiline
              numberOfLines={3}
              placeholder="Add exact location details or notes"
              placeholderTextColor={colors.inkMuted}
              style={styles.input}
            />

            <View style={styles.sheetButtons}>
              <PrimaryButton
                label="Send Update"
                onPress={() => {
                  if (sendMessage.length > 0) {
                    onSendUpdate(sendMessage);
                  }
                  setSheetOpen(false);
                  setSelectedChip(null);
                  setUpdateText("");
                }}
              />
              <GhostButton label="Cancel" onPress={() => setSheetOpen(false)} />
            </View>
          </View>
        </View>
      ) : null}
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  mapPanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#EAF2FD",
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  mapTitle: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 16
  },
  mapMeta: {
    color: colors.inkMuted,
    fontSize: 13
  },
  markerRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap"
  },
  marker: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.round
  },
  patientMarker: {
    backgroundColor: "#FFF3B8",
    color: "#7A5D0A"
  },
  ambulanceMarker: {
    backgroundColor: "#DCEBFF",
    color: colors.info
  },
  volunteerMarker: {
    backgroundColor: "#E4F7EE",
    color: colors.success
  },
  infoGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  smallCard: {
    flex: 1,
    padding: spacing.md
  },
  cardKicker: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  bigValue: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 4
  },
  unitCard: {
    marginBottom: spacing.md,
    padding: spacing.md
  },
  unitTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4
  },
  unitSub: {
    color: colors.inkMuted,
    fontSize: 14,
    marginTop: 2
  },
  guidanceCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: "#F5F8FF"
  },
  guidanceTitle: {
    color: colors.info,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8
  },
  guidanceCopy: {
    color: colors.ink,
    lineHeight: 21,
    marginBottom: spacing.md
  },
  actionRow: {
    gap: spacing.sm
  },
  sheetBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(21, 33, 47, 0.35)",
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.border
  },
  sheetTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "800"
  },
  sheetSub: {
    color: colors.inkMuted,
    lineHeight: 20,
    marginBottom: 6
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft
  },
  chipSelected: {
    backgroundColor: colors.emergencySoft,
    borderColor: "#F4A5A5"
  },
  chipText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: "700"
  },
  chipTextSelected: {
    color: colors.emergency
  },
  quickActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginVertical: 6
  },
  ghostMini: {
    color: colors.info,
    fontSize: 12,
    fontWeight: "600"
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 80,
    color: colors.ink,
    textAlignVertical: "top",
    backgroundColor: colors.surfaceSoft
  },
  sheetButtons: {
    gap: spacing.sm,
    marginTop: spacing.sm
  }
});
