import { StyleSheet, Text } from "react-native";

import { Card, GhostButton, ScreenShell } from "../../components/Ui";
import { colors } from "../../theme/tokens";

export const RoleMismatchScreen = ({ onRestart }: { onRestart: () => void }) => (
  <ScreenShell>
    <Card>
      <Text style={styles.title}>Normal User Account Detected</Text>
      <Text style={styles.subtitle}>
        This app instance is configured for volunteer response operations. For citizen/patient tools, open the
        Citizen app and sign in there.
      </Text>
      <GhostButton label="Back To Role Selection" onPress={onRestart} />
    </Card>
  </ScreenShell>
);

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.inkMuted,
    lineHeight: 22,
    marginTop: 8
  }
});
