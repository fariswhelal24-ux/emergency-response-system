import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, PrimaryButton, ScreenShell } from "../../components/Ui";
import { colors, radius, spacing } from "../../theme/tokens";
import { AccountType } from "../../types/auth";

const roleItems: Array<{
  key: AccountType;
  title: string;
  subtitle: string;
  description: string;
}> = [
  {
    key: "USER",
    title: "Normal User",
    subtitle: "Citizen / Patient",
    description: "Request emergency assistance, manage family medical details, and receive guided updates."
  },
  {
    key: "VOLUNTEER",
    title: "Volunteer",
    subtitle: "Medical Responder",
    description: "Verified medical volunteer account with controlled incident and dispatch access."
  }
];

export const RoleSelectionScreen = ({
  selected,
  onSelect,
  onContinue
}: {
  selected: AccountType;
  onSelect: (role: AccountType) => void;
  onContinue: () => void;
}) => (
  <ScreenShell>
    <Card>
      <View style={styles.headerBlock}>
        <Text style={styles.kicker}>National Emergency Access</Text>
        <Text style={styles.title}>Choose Account Type</Text>
        <Text style={styles.subtitle}>One app, one QR. Choose Citizen or Volunteer role.</Text>
      </View>

      <View style={styles.listWrap}>
        {roleItems.map((item) => {
          const active = selected === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              style={[styles.roleCard, active && styles.roleCardActive]}
            >
              <Text style={[styles.roleTitle, active && styles.roleTitleActive]}>{item.title}</Text>
              <Text style={[styles.roleSubtitle, active && styles.roleSubtitleActive]}>{item.subtitle}</Text>
              <Text style={styles.roleCopy}>{item.description}</Text>
            </Pressable>
          );
        })}
      </View>

      <PrimaryButton label="Continue" onPress={onContinue} />
    </Card>
  </ScreenShell>
);

const styles = StyleSheet.create({
  headerBlock: {
    gap: 4,
    marginBottom: spacing.md
  },
  kicker: {
    alignSelf: "flex-start",
    borderRadius: radius.round,
    backgroundColor: colors.infoSoft,
    color: colors.info,
    fontWeight: "800",
    fontSize: 11,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    overflow: "hidden",
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.inkMuted,
    lineHeight: 20
  },
  listWrap: {
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  roleCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.md,
    gap: 6
  },
  roleCardActive: {
    borderColor: colors.info,
    backgroundColor: colors.infoSoft
  },
  roleTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  roleTitleActive: {
    color: colors.info
  },
  roleSubtitle: {
    color: colors.inkMuted,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase"
  },
  roleSubtitleActive: {
    color: colors.info
  },
  roleCopy: {
    color: colors.inkMuted,
    lineHeight: 20
  }
});
