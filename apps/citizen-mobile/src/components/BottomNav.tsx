import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../theme/tokens";
import { CitizenTab } from "../types";

const tabs: Array<{ key: CitizenTab; label: string; icon: string }> = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "history", label: "History", icon: "◷" },
  { key: "profile", label: "Profile", icon: "◉" }
];

export const BottomNav = ({
  activeTab,
  onChange
}: {
  activeTab: CitizenTab;
  onChange: (tab: CitizenTab) => void;
}) => (
  <View style={styles.outerWrap}>
    <View style={styles.wrapper}>
      {tabs.map((tab, index) => {
        const active = tab.key === activeTab;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={styles.tabButton}>
            <Text style={[styles.icon, active ? styles.iconActive : styles.iconInactive]}>{tab.icon}</Text>
            <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>{tab.label}</Text>
            {active ? <View style={styles.activeIndicator} /> : null}
            {index < tabs.length - 1 ? <View style={styles.separator} /> : null}
          </Pressable>
        );
      })}
    </View>
  </View>
);

const styles = StyleSheet.create({
  outerWrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg
  },
  wrapper: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#E7EAEE",
    paddingVertical: 6,
    shadowColor: "#1B2E45",
    shadowOffset: {
      width: 0,
      height: 7
    },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 8
  },
  tabButton: {
    flex: 1,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  icon: {
    fontSize: 23,
    fontWeight: "700",
    marginBottom: 2
  },
  iconActive: {
    color: "#E22A34"
  },
  iconInactive: {
    color: colors.navInactive
  },
  label: {
    fontSize: 15,
    fontWeight: "500"
  },
  labelActive: {
    color: "#DF202B",
    fontWeight: "700"
  },
  labelInactive: {
    color: colors.navInactive
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    width: 54,
    height: 3,
    borderRadius: radius.round,
    backgroundColor: "#E22A34"
  },
  separator: {
    position: "absolute",
    right: 0,
    top: 18,
    bottom: 18,
    width: 1,
    backgroundColor: "#E7EAEE"
  }
});
