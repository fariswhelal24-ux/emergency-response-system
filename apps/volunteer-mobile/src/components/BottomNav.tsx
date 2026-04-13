import { Pressable, StyleSheet, Text, View } from "react-native";

import { VolunteerTab } from "../types";
import { colors, radius, spacing } from "../theme/tokens";

const tabs: Array<{ key: VolunteerTab; label: string }> = [
  { key: "alerts", label: "Alerts" },
  { key: "history", label: "History" },
  { key: "profile", label: "Profile" }
];

export const BottomNav = ({
  activeTab,
  onChange
}: {
  activeTab: VolunteerTab;
  onChange: (tab: VolunteerTab) => void;
}) => (
  <View style={styles.wrapper}>
    {tabs.map((tab) => {
      const active = tab.key === activeTab;
      return (
        <Pressable
          key={tab.key}
          onPress={() => onChange(tab.key)}
          style={[styles.tabButton, active && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    padding: 6,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#0F2E5A",
    shadowOffset: {
      width: 0,
      height: 6
    },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 7
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.md,
    paddingVertical: spacing.sm
  },
  tabButtonActive: {
    backgroundColor: colors.primarySoft
  },
  tabText: {
    color: colors.navInactive,
    fontWeight: "700",
    fontSize: 13
  },
  tabTextActive: {
    color: colors.primary
  }
});
