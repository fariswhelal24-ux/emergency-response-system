import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, GhostButton, ScreenShell, SectionTitle } from "../components/Ui";
import { colors, radius, spacing } from "../theme/tokens";

const settingsItems = [
  "Availability and shift settings",
  "Response radius",
  "Credentials and profile",
  "Notifications and alerts",
  "Language and accessibility"
];

export const SettingsScreen = ({
  profile,
  onBack
}: {
  profile: {
    name: string;
    specialty: string;
    verificationBadge: string;
  };
  onBack: () => void;
}) => {
  const initials = profile.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "VR";

  return (
    <ScreenShell>
      <Card>
        <SectionTitle title="Settings" subtitle="Operational preferences and account controls" />

        <Card style={styles.identityCard}>
          <Text style={styles.avatar}>{initials}</Text>
          <View style={styles.identityContent}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.meta}>{profile.specialty}</Text>
            <Text style={styles.badge}>{profile.verificationBadge}</Text>
          </View>
          <Pressable style={styles.editButton}>
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        </Card>

        <Card style={styles.sectionCard}>
          {settingsItems.map((item) => (
            <View key={item} style={styles.settingRow}>
              <Text style={styles.settingName}>{item}</Text>
              <Text style={styles.settingAction}>Manage</Text>
            </View>
          ))}
        </Card>

        <GhostButton label="Back to Alerts" onPress={onBack} />
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.round,
    textAlign: "center",
    textAlignVertical: "center",
    backgroundColor: "#DEE9FF",
    color: colors.primary,
    fontWeight: "800",
    overflow: "hidden"
  },
  identityContent: {
    flex: 1
  },
  name: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800"
  },
  meta: {
    color: colors.inkMuted,
    marginTop: 2,
    fontSize: 12
  },
  badge: {
    color: colors.primary,
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700"
  },
  editButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft
  },
  editText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 12
  },
  sectionCard: {
    marginBottom: spacing.md,
    paddingVertical: spacing.sm
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#E2ECFA"
  },
  settingName: {
    color: colors.ink,
    fontWeight: "600"
  },
  settingAction: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 12
  }
});
