import { PropsWithChildren } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle
} from "react-native";

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
  <View style={styles.titleWrap}>
    <Text style={styles.title}>{title}</Text>
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
  </View>
);

export const PrimaryButton = ({
  label,
  onPress,
  small
}: {
  label: string;
  onPress: () => void;
  small?: boolean;
}) => (
  <Pressable onPress={onPress} style={[styles.primaryButton, small && styles.smallButton]}>
    <Text style={styles.primaryText}>{label}</Text>
  </Pressable>
);

export const GhostButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.ghostButton}>
    <Text style={styles.ghostText}>{label}</Text>
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
    backgroundColor: "#EAF2EE"
  },
  bgBandMid: {
    position: "absolute",
    left: -90,
    top: 170,
    width: 250,
    height: 250,
    borderRadius: radius.round,
    backgroundColor: "#E4ECE8"
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
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 5
  },
  titleWrap: {
    gap: spacing.xs,
    marginBottom: spacing.md
  },
  title: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.inkMuted,
    lineHeight: 20
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg
  },
  smallButton: {
    paddingVertical: spacing.sm
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15
  },
  ghostButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg
  },
  ghostText: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 14
  }
});
