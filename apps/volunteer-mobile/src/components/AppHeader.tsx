import { I18nManager, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../theme/tokens";

const isRTL = I18nManager.isRTL;

export const AppHeader = ({
  title,
  subtitle,
  avatarLabel,
  onPressSettings
}: {
  title: string;
  subtitle?: string;
  avatarLabel: string;
  onPressSettings: () => void;
}) => (
  <View style={styles.headerWrap}>
    <View style={[styles.mainRow, isRTL && styles.mainRowRtl]}>
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarLabel}>{avatarLabel}</Text>
      </View>

      <View style={styles.titleWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <Pressable onPress={onPressSettings} style={styles.settingsButton}>
        <Text style={styles.settingsText}>Settings</Text>
      </Pressable>
    </View>
  </View>
);

const styles = StyleSheet.create({
  headerWrap: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  mainRowRtl: {
    flexDirection: "row-reverse"
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    backgroundColor: "#DEE9FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C7DAF6"
  },
  avatarLabel: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 15
  },
  titleWrap: {
    flex: 1,
    gap: 2
  },
  title: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 18,
    textAlign: isRTL ? "right" : "left"
  },
  subtitle: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 12,
    textAlign: isRTL ? "right" : "left"
  },
  settingsButton: {
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 8
  },
  settingsText: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 12
  }
});
