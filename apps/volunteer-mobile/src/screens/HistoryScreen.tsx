import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { volunteerHistory, volunteerMeta, volunteerStats } from "../data/mockVolunteer";
import { Card, ScreenShell, SectionTitle } from "../components/Ui";
import { colors, radius, spacing } from "../theme/tokens";

const tabs = ["Recent", "Critical", "All Time"] as const;
type HistoryTab = (typeof tabs)[number];

export const HistoryScreen = () => {
  const [activeTab, setActiveTab] = useState<HistoryTab>("Recent");

  return (
    <ScreenShell>
      <Card>
        <SectionTitle title="History & Achievements" subtitle={volunteerMeta.verifiedBadge} />

        <Card style={styles.headerCard}>
          <Text style={styles.name}>{volunteerMeta.name}</Text>
          <Text style={styles.specialty}>{volunteerMeta.specialty}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{volunteerStats.incidentsResponded}</Text>
              <Text style={styles.statLabel}>Incidents</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{volunteerStats.averageRating}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{volunteerStats.yearsVolunteering} yrs</Text>
              <Text style={styles.statLabel}>Volunteering</Text>
            </View>
          </View>
        </Card>

        <View style={styles.tabsRow}>
          {tabs.map((tab) => {
            const active = tab === activeTab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tabButton, active && styles.tabButtonActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.listWrap}>
          {volunteerHistory.map((item) => (
            <Card key={item.id} style={styles.itemCard}>
              <Text style={styles.itemTitle}>{item.emergencyType}</Text>
              <Text style={styles.itemAddress}>{item.address}</Text>
              <Text style={styles.itemMeta}>Response Time: {item.responseTime}</Text>
              <Text style={styles.itemOutcome}>{item.outcome}</Text>
            </Card>
          ))}
        </View>

        <View style={styles.statsGrid}>
          <Card style={styles.metricCard}>
            <Text style={styles.metricValue}>{volunteerStats.ambulanceHandoffs}</Text>
            <Text style={styles.metricLabel}>Ambulance handoffs</Text>
          </Card>
          <Card style={styles.metricCard}>
            <Text style={styles.metricValue}>{volunteerStats.firstAidRendered}</Text>
            <Text style={styles.metricLabel}>First aid rendered</Text>
          </Card>
          <Card style={styles.metricCard}>
            <Text style={styles.metricValue}>{volunteerStats.updatesShared}</Text>
            <Text style={styles.metricLabel}>Updates shared</Text>
          </Card>
          <Card style={styles.metricCard}>
            <Text style={styles.metricValue}>{volunteerStats.averageRating}</Text>
            <Text style={styles.metricLabel}>Average rating</Text>
          </Card>
        </View>
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  headerCard: {
    marginBottom: spacing.md,
    backgroundColor: "#F5FBF8"
  },
  name: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "800"
  },
  specialty: {
    color: colors.inkMuted,
    marginTop: 3
  },
  statsRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    gap: spacing.sm
  },
  statTile: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm
  },
  statValue: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 17
  },
  statLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    marginTop: 2
  },
  tabsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "#EEF4F1"
  },
  tabButtonActive: {
    backgroundColor: colors.primarySoft
  },
  tabText: {
    color: colors.inkMuted,
    fontWeight: "700"
  },
  tabTextActive: {
    color: colors.primary
  },
  listWrap: {
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  itemCard: {
    padding: spacing.md
  },
  itemTitle: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 16
  },
  itemAddress: {
    color: colors.inkMuted,
    marginTop: 3
  },
  itemMeta: {
    color: colors.info,
    marginTop: 4,
    fontWeight: "700"
  },
  itemOutcome: {
    color: colors.primary,
    marginTop: 4,
    fontWeight: "700"
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  metricCard: {
    width: "48%",
    padding: spacing.sm
  },
  metricValue: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "800"
  },
  metricLabel: {
    color: colors.inkMuted,
    marginTop: 4,
    fontSize: 12
  }
});
