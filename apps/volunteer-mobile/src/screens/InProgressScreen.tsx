import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { activeEmergency } from "../data/mockVolunteer";
import { Card, GhostButton, PrimaryButton, ScreenShell, SectionTitle } from "../components/Ui";
import { colors, radius, spacing } from "../theme/tokens";

export const InProgressScreen = ({ onBackToAccepted }: { onBackToAccepted: () => void }) => {
  const [note, setNote] = useState("");

  return (
    <ScreenShell>
      <Card>
        <SectionTitle title="Response In Progress" subtitle="Live route and case coordination" />

        <Card style={styles.etaCard}>
          <Text style={styles.etaValue}>{activeEmergency.etaMinutes} min</Text>
          <Text style={styles.etaLabel}>ETA Countdown</Text>
          <Text style={styles.etaSub}>Ambulance status: en route</Text>
        </Card>

        <Card style={styles.mapCard}>
          <Text style={styles.mapTitle}>Route Map</Text>
          <Text style={styles.mapCopy}>Live route to patient active</Text>
        </Card>

        <View style={styles.quickRow}>
          <GhostButton label="Call Patient" onPress={() => {}} />
          <GhostButton label="Contact Dispatcher" onPress={() => {}} />
          <GhostButton label="Send Update" onPress={() => {}} />
        </View>

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Optional note"
          placeholderTextColor={colors.inkMuted}
          style={styles.noteInput}
        />

        <PrimaryButton label="Handover Mode" onPress={() => {}} />
        <GhostButton label="Back" onPress={onBackToAccepted} />
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  etaCard: {
    alignItems: "center",
    backgroundColor: "#F1FBF6",
    marginBottom: spacing.md
  },
  etaValue: {
    color: colors.primary,
    fontSize: 34,
    fontWeight: "900"
  },
  etaLabel: {
    color: colors.ink,
    fontWeight: "700"
  },
  etaSub: {
    color: colors.inkMuted,
    marginTop: 4
  },
  mapCard: {
    backgroundColor: "#EBF4FF",
    marginBottom: spacing.md
  },
  mapTitle: {
    color: colors.info,
    fontWeight: "800"
  },
  mapCopy: {
    color: colors.inkMuted,
    marginTop: 4
  },
  quickRow: {
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSoft,
    color: colors.ink,
    marginBottom: spacing.md
  }
});
