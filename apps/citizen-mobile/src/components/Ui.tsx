import { PropsWithChildren } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius, spacing } from "../theme/tokens";

export const ScreenShell = ({ children }: PropsWithChildren) => (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.bgBandTop} />
    <View style={styles.bgBandMid} />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  </SafeAreaView>
);

export const Card = ({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) => (
  <View style={[styles.card, style]}>{children}</View>
);

export const SectionTitle = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <View style={styles.sectionTitleWrap}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
  </View>
);

export const PrimaryButton = ({
  label,
  onPress,
  danger,
  small,
  disabled
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  small?: boolean;
  disabled?: boolean;
}) => (
  <Pressable
    disabled={disabled}
    onPress={onPress}
    style={[
      styles.primaryButton,
      danger ? styles.primaryDanger : styles.primaryInfo,
      small && styles.smallButton,
      disabled && styles.primaryButtonDisabled
    ]}
  >
    <Text style={[styles.primaryButtonText, disabled && styles.primaryButtonTextDisabled]}>{label}</Text>
  </Pressable>
);

export const GhostButton = ({
  label,
  onPress
}: {
  label: string;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={styles.ghostButton}>
    <Text style={styles.ghostButtonText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  bgBandTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 220,
    backgroundColor: "#EBF1F7"
  },
  bgBandMid: {
    position: "absolute",
    right: -80,
    top: 170,
    width: 240,
    height: 240,
    borderRadius: radius.round,
    backgroundColor: "#E4ECF5"
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 120
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    shadowColor: "#122A43",
    shadowOffset: {
      width: 0,
      height: 10
    },
    shadowOpacity: 0.11,
    shadowRadius: 20,
    elevation: 5
  },
  sectionTitleWrap: {
    gap: spacing.xs,
    marginBottom: spacing.md
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: "800"
  },
  sectionSubtitle: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20
  },
  primaryButton: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg
  },
  smallButton: {
    paddingVertical: spacing.sm
  },
  primaryDanger: {
    backgroundColor: colors.emergency
  },
  primaryInfo: {
    backgroundColor: colors.info
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15
  },
  primaryButtonDisabled: {
    opacity: 0.55
  },
  primaryButtonTextDisabled: {
    opacity: 0.95
  },
  ghostButton: {
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: "#F8D1D3",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSoft,
    minHeight: 56
  },
  ghostButtonText: {
    color: colors.emergency,
    fontWeight: "600",
    fontSize: 15
  }
});
