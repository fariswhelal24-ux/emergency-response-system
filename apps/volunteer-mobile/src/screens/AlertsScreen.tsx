import { Pressable, StyleSheet, Text, View } from "react-native";

import { activeEmergency, volunteerMeta } from "../data/mockVolunteer";
import { AppHeader } from "../components/AppHeader";
import { Card, GhostButton, PrimaryButton, ScreenShell, SectionTitle } from "../components/Ui";
import { colors, radius, spacing } from "../theme/tokens";

export const AlertsScreen = ({
  onAccept,
  onDecline,
  available,
  onToggleAvailability,
  onOpenSettings,
  onOpenMedicalChat
}: {
  onAccept: () => void;
  onDecline: () => void;
  available: boolean;
  onToggleAvailability: () => void;
  onOpenSettings: () => void;
  onOpenMedicalChat: () => void;
}) => {
  return (
    <ScreenShell>
      <AppHeader
        title="Volunteer Operations"
        subtitle="Verified medical response network"
        avatarLabel="LH"
        onPressSettings={onOpenSettings}
      />

      <Card>
        <View style={styles.topHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{volunteerMeta.name}</Text>
            <Text style={styles.specialty}>{volunteerMeta.specialty}</Text>
          </View>
          <Pressable onPress={onToggleAvailability} style={[styles.toggle, available && styles.toggleOn]}>
            <Text style={[styles.toggleText, available && styles.toggleTextOn]}>
              {available ? "Available" : "Off Duty"}
            </Text>
          </Pressable>
        </View>

        <Card style={styles.statusCard}>
          <Text style={styles.statusTitle}>You are {available ? "Available" : "Off Duty"}</Text>
          <Text style={styles.statusSub}>Location active • Response radius {volunteerMeta.radiusKm} km</Text>
        </Card>

        <SectionTitle title="New Emergency Nearby" subtitle="Ambulance already dispatched" />

        <Card style={styles.alertCard}>
          <Text style={styles.alertType}>{activeEmergency.emergencyType}</Text>
          <Text style={styles.alertMeta}>
            Distance {activeEmergency.distanceKm} km • ETA {activeEmergency.etaMinutes} min
          </Text>
          <Text style={styles.alertMeta}>Case ID: {activeEmergency.caseId}</Text>

          <View style={styles.actionRow}>
            <PrimaryButton label="Accept & Navigate" onPress={onAccept} />
            <GhostButton label="Decline" onPress={onDecline} />
          </View>
        </Card>

        <Card style={styles.chatCard}>
          <Text style={styles.chatTitle}>Non-Emergency Medical Chat</Text>
          <Text style={styles.chatCopy}>
            AI guidance only. Do not use this chat for active emergency incidents.
          </Text>
          <GhostButton label="Open Medical Guidance Chat" onPress={onOpenMedicalChat} />
        </Card>
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#E3EAE7"
  },
  name: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  specialty: {
    color: colors.inkMuted,
    marginTop: 2
  },
  toggle: {
    borderRadius: radius.round,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "#EEF3F1"
  },
  toggleOn: {
    backgroundColor: colors.primarySoft
  },
  toggleText: {
    color: colors.inkMuted,
    fontWeight: "700"
  },
  toggleTextOn: {
    color: colors.primary
  },
  statusCard: {
    marginBottom: spacing.md,
    backgroundColor: "#EEF5F1"
  },
  statusTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  statusSub: {
    color: colors.inkMuted,
    marginTop: 4
  },
  alertCard: {
    backgroundColor: "#F9FCFA",
    marginBottom: spacing.md
  },
  alertType: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "800"
  },
  alertMeta: {
    color: colors.inkMuted,
    marginTop: 5
  },
  actionRow: {
    marginTop: spacing.md,
    gap: spacing.sm
  },
  chatCard: {
    backgroundColor: "#F2F7F5"
  },
  chatTitle: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "800"
  },
  chatCopy: {
    color: colors.inkMuted,
    marginTop: 4,
    marginBottom: spacing.sm,
    lineHeight: 20
  }
});
