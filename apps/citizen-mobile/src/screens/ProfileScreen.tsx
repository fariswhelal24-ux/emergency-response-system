import { StyleSheet, Text, View } from "react-native";

import { citizenProfile } from "../data/mockCitizen";
import { Card, GhostButton, ScreenShell, SectionTitle } from "../components/Ui";
import { colors, spacing } from "../theme/tokens";

const ProfileRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

export const ProfileScreen = () => {
  return (
    <ScreenShell>
      <Card>
        <SectionTitle title="My Profile" subtitle="Personal and emergency medical information" />

        <Card style={styles.identityCard}>
          <Text style={styles.avatar}>SD</Text>
          <View style={styles.identityTextWrap}>
            <Text style={styles.name}>{citizenProfile.fullName}</Text>
            <Text style={styles.phone}>{citizenProfile.phone}</Text>
          </View>
          <Text style={styles.edit}>Edit</Text>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Medical Information</Text>
          <ProfileRow label="Blood Type" value={citizenProfile.bloodType} />
          <ProfileRow label="Conditions" value={citizenProfile.conditions} />
          <ProfileRow label="Allergies" value={citizenProfile.allergies} />
          <ProfileRow label="Emergency Contact" value={citizenProfile.emergencyContact} />
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Settings</Text>
          <Text style={styles.settingItem}>Health Data Sharing</Text>
          <Text style={styles.settingItem}>Notification Settings</Text>
          <Text style={styles.settingItem}>Privacy & Security</Text>
          <Text style={styles.settingItem}>Language</Text>
        </Card>

        <GhostButton label="Sign Out" onPress={() => {}} />
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E6F0FF",
    color: colors.info,
    textAlign: "center",
    textAlignVertical: "center",
    fontWeight: "800",
    overflow: "hidden",
    marginRight: spacing.sm
  },
  identityTextWrap: {
    flex: 1
  },
  name: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  phone: {
    color: colors.inkMuted,
    marginTop: 2
  },
  edit: {
    color: colors.info,
    fontWeight: "700"
  },
  sectionCard: {
    marginBottom: spacing.md
  },
  sectionHeader: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: spacing.sm
  },
  row: {
    marginBottom: spacing.sm
  },
  rowLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  rowValue: {
    color: colors.ink,
    marginTop: 4,
    lineHeight: 20
  },
  settingItem: {
    color: colors.ink,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7"
  }
});
