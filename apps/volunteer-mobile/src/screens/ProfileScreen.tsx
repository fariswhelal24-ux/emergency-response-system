import { StyleSheet, Text, View } from "react-native";

import { volunteerMeta } from "../data/mockVolunteer";
import { Card, GhostButton, ScreenShell, SectionTitle } from "../components/Ui";
import { colors, spacing } from "../theme/tokens";

const Field = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.fieldRow}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text style={styles.fieldValue}>{value}</Text>
  </View>
);

export const ProfileScreen = () => {
  return (
    <ScreenShell>
      <Card>
        <SectionTitle title="Volunteer Profile" subtitle={volunteerMeta.verifiedBadge} />

        <Card style={styles.identityCard}>
          <Text style={styles.avatar}>LH</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{volunteerMeta.name}</Text>
            <Text style={styles.specialty}>{volunteerMeta.specialty}</Text>
          </View>
          <Text style={styles.edit}>Edit</Text>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Credentials & Verification</Text>
          <Field label="Verification Badge" value={volunteerMeta.verifiedBadge} />
          <Field label="Professional Access" value="Emergency response volunteer" />
          <Field label="Licenses & Certifications" value="ACLS, BLS, Trauma First Aid" />
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Availability Settings</Text>
          <Text style={styles.setting}>Availability status</Text>
          <Text style={styles.setting}>Response radius</Text>
          <Text style={styles.setting}>Shift / Off Duty settings</Text>
          <Text style={styles.setting}>Notification settings</Text>
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
    backgroundColor: "#DFF4EC",
    color: colors.primary,
    textAlign: "center",
    textAlignVertical: "center",
    fontWeight: "800",
    overflow: "hidden",
    marginRight: spacing.sm
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
  edit: {
    color: colors.info,
    fontWeight: "700"
  },
  sectionCard: {
    marginBottom: spacing.md
  },
  sectionTitle: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: spacing.sm
  },
  fieldRow: {
    marginBottom: spacing.sm
  },
  fieldLabel: {
    color: colors.inkMuted,
    textTransform: "uppercase",
    fontSize: 12,
    fontWeight: "700"
  },
  fieldValue: {
    color: colors.ink,
    marginTop: 4
  },
  setting: {
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: "#EAF1EE",
    paddingVertical: 10
  }
});
