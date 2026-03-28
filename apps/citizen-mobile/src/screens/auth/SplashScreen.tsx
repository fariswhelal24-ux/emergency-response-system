import { StyleSheet, Text, View } from "react-native";

import { Card, ScreenShell } from "../../components/Ui";
import { colors, radius, spacing } from "../../theme/tokens";

export const SplashScreen = () => (
  <ScreenShell>
    <Card style={styles.card}>
      <View style={styles.sealWrap}>
        <View style={styles.seal}>
          <Text style={styles.sealText}>EMS</Text>
        </View>
        <Text style={styles.sealCaption}>Public Emergency Service</Text>
      </View>

      <Text style={styles.title}>LifeLine Emergency System</Text>
      <Text style={styles.subtitle}>
        Official emergency response platform for citizens, medical volunteers, and dispatch operations.
      </Text>

      <View style={styles.metaCard}>
        <Text style={styles.metaLabel}>System Status</Text>
        <Text style={styles.metaValue}>Online · Secure · Location Ready</Text>
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
    backgroundColor: "#DEE9F6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C7D8EA"
  },
  sealText: {
    color: colors.info,
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
    backgroundColor: "#EFF4FA",
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
    color: colors.info,
    fontWeight: "800",
    marginTop: 2
  }
});
