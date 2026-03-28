import { StyleSheet, Text, View } from "react-native";

import { Card, GhostButton, PrimaryButton, ScreenShell } from "../../components/Ui";
import { colors, radius, spacing } from "../../theme/tokens";
import { VerificationStatus } from "../../types/auth";

const copyMap: Record<VerificationStatus, { title: string; message: string }> = {
  pending: {
    title: "Verification Pending",
    message:
      "Your volunteer account is under review. You can log in, but emergency response tools are locked until approval."
  },
  approved: {
    title: "Verification Approved",
    message: "Your account is approved. You can now access full volunteer tools."
  },
  rejected: {
    title: "Verification Rejected",
    message:
      "Your last submission was rejected. Please review your documents and submit an updated application."
  }
};

export const VerificationStatusScreen = ({
  status,
  onBackToLogin,
  onResubmit,
  onSimulateApproved,
  onSimulateRejected
}: {
  status: VerificationStatus;
  onBackToLogin: () => void;
  onResubmit: () => void;
  onSimulateApproved: () => void;
  onSimulateRejected: () => void;
}) => {
  const copy = copyMap[status];

  return (
    <ScreenShell>
      <Card>
        <View style={[styles.badge, status === "approved" ? styles.badgeApproved : undefined]}>
          <Text style={[styles.badgeText, status === "approved" ? styles.badgeTextApproved : undefined]}>
            {status.toUpperCase()}
          </Text>
        </View>

        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.subtitle}>{copy.message}</Text>

        {status === "rejected" ? <PrimaryButton label="Edit And Resubmit" onPress={onResubmit} /> : null}
        <GhostButton label="Back To Login" onPress={onBackToLogin} />

        <View style={styles.mockTools}>
          <Text style={styles.mockTitle}>Demo controls</Text>
          <GhostButton label="Simulate Approved" onPress={onSimulateApproved} />
          <GhostButton label="Simulate Rejected" onPress={onSimulateRejected} />
        </View>
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.round,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: "#FFF3DF",
    marginBottom: spacing.sm
  },
  badgeApproved: {
    backgroundColor: "#E7F7EE"
  },
  badgeText: {
    color: colors.warning,
    fontWeight: "800"
  },
  badgeTextApproved: {
    color: colors.success
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.inkMuted,
    lineHeight: 22,
    marginTop: 6,
    marginBottom: spacing.md
  },
  mockTools: {
    marginTop: spacing.sm,
    gap: spacing.sm
  },
  mockTitle: {
    color: colors.inkMuted,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase"
  }
});
