import { StyleSheet, Text, View } from "react-native";

import { Card, ScreenShell } from "../../components/Ui";
import { colors, radius, spacing } from "../../theme/tokens";

export const SplashScreen = () => (
  <ScreenShell>
    <Card style={styles.card}>
      <View style={styles.sealWrap}>
        <View style={styles.seal}>
          <Text style={styles.sealText}>MED</Text>
        </View>
        <Text style={styles.sealCaption}>Volunteer Medical Network</Text>
      </View>

      <Text style={styles.title}>Volunteer Response System</Text>
      <Text style={styles.subtitle}>
        Verified medical volunteers integrated with emergency dispatch and field coordination.
      </Text>

      <View style={styles.metaCard}>
        <Text style={styles.metaLabel}>Operational Network</Text>
        <Text style={styles.metaValue}>Connected · Verified Access · Live Location Ready</Text>
      </View>
    </Card>
  </ScreenShell>
);

const styles = StyleSheet.create({
  card: {
    minHeight: 470,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "#FDFEFF"
  },
  sealWrap: {
    alignItems: "center",
    gap: 8
  },
  seal: {
    width: 96,
    height: 96,
    borderRadius: radius.round,
    backgroundColor: "#DCE8FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C5D8F5"
  },
  sealText: {
    color: colors.primary,
    fontSize: 27,
    fontWeight: "900"
  },
  sealCaption: {
    color: colors.inkMuted,
    fontWeight: "700",
    fontSize: 12
  },
  title: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: "900",
    textAlign: "center"
  },
  subtitle: {
    color: colors.inkMuted,
    textAlign: "center",
    lineHeight: 22
  },
  metaCard: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: "#EEF4FF",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.sm
  },
  metaLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: "700"
  },
  metaValue: {
    color: colors.primary,
    fontWeight: "800",
    marginTop: 2,
    textAlign: "center"
  }
});
