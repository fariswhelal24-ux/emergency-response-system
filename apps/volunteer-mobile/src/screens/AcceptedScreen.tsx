import { StyleSheet, Text, View } from "react-native";

import { Card, GhostButton, PrimaryButton, ScreenShell, SectionTitle } from "../components/Ui";
import { colors, radius, spacing } from "../theme/tokens";

export const AcceptedScreen = ({
  emergency,
  onStartProgress
}: {
  emergency: {
    etaMinutes: number;
    urgencyLabel: string;
    emergencyType: string;
    distanceKm: number;
    ambulanceDispatched: boolean;
    patientSummary: string;
    safeAccess: string;
  };
  onStartProgress: () => void;
}) => {
  const equipmentChecklist = ["Gloves", "Gauze", "Pulse oximeter", "Portable airway kit"];
  return (
    <ScreenShell>
      <Card>
        <SectionTitle title="Head To Patient" subtitle={`ETA ${emergency.etaMinutes} min`} />

        <Card style={styles.mapCard}>
          <Text style={styles.mapTitle}>Navigation Route Active</Text>
          <Text style={styles.mapMeta}>Patient location pinned • Ambulance en route</Text>
        </Card>

        <Card style={styles.summaryCard}>
          <Text style={styles.label}>{emergency.urgencyLabel}</Text>
          <Text style={styles.summaryTitle}>{emergency.emergencyType}</Text>
          <Text style={styles.summaryMeta}>Distance {emergency.distanceKm} km</Text>
          <Text style={styles.summaryMeta}>Ambulance en route: {emergency.ambulanceDispatched ? "Yes" : "No"}</Text>
        </Card>

        <Card style={styles.aiCard}>
          <Text style={styles.aiTitle}>AI Case Summary</Text>
          <Text style={styles.aiCopy}>{emergency.patientSummary}</Text>
        </Card>

        <View style={styles.actionRow}>
          <PrimaryButton label="I'm On My Way" onPress={onStartProgress} />
          <GhostButton label="Call Patient" onPress={() => {}} />
          <GhostButton label="Message Patient" onPress={() => {}} />
          <GhostButton label="Contact Dispatcher" onPress={() => {}} />
          <GhostButton label="Send Update" onPress={() => {}} />
        </View>

        <Card style={styles.safeCard}>
          <Text style={styles.safeTitle}>Safe Access</Text>
          <Text style={styles.safeCopy}>{emergency.safeAccess}</Text>
          <Text style={styles.safeLink}>Request access details</Text>
        </Card>

        <Card style={styles.safeCard}>
          <Text style={styles.safeTitle}>Equipment Checklist</Text>
          {equipmentChecklist.map((item) => (
            <Text key={item} style={styles.checkItem}>
              • {item}
            </Text>
          ))}
        </Card>

        <Text style={styles.privacy}>Patient contact shared for this incident only.</Text>
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  mapCard: {
    backgroundColor: "#ECF5FF",
    marginBottom: spacing.md
  },
  mapTitle: {
    color: colors.info,
    fontWeight: "800",
    fontSize: 16
  },
  mapMeta: {
    color: colors.inkMuted,
    marginTop: 4
  },
  summaryCard: {
    marginBottom: spacing.md
  },
  label: {
    alignSelf: "flex-start",
    backgroundColor: "#FEE7D5",
    color: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.round,
    overflow: "hidden",
    fontWeight: "700",
    fontSize: 12
  },
  summaryTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 8
  },
  summaryMeta: {
    color: colors.inkMuted,
    marginTop: 4
  },
  aiCard: {
    backgroundColor: "#F3F8FF",
    marginBottom: spacing.md
  },
  aiTitle: {
    color: colors.primary,
    fontWeight: "800",
    marginBottom: 4
  },
  aiCopy: {
    color: colors.ink,
    lineHeight: 21
  },
  actionRow: {
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  safeCard: {
    marginBottom: spacing.md
  },
  safeTitle: {
    color: colors.ink,
    fontWeight: "800",
    marginBottom: 4
  },
  safeCopy: {
    color: colors.inkMuted,
    lineHeight: 20
  },
  safeLink: {
    color: colors.info,
    fontWeight: "700",
    marginTop: spacing.sm
  },
  checkItem: {
    color: colors.ink,
    marginTop: 4
  },
  privacy: {
    color: colors.inkMuted,
    textAlign: "center",
    fontSize: 12
  }
});
