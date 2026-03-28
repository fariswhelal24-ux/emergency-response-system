import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { userHistory } from "../data/mockCitizen";
import { Card, ScreenShell, SectionTitle } from "../components/Ui";
import { colors, radius, spacing } from "../theme/tokens";

export const HistoryScreen = () => {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    if (!normalized) {
      return userHistory;
    }

    return userHistory.filter((item) => {
      return (
        item.emergencyType.toLowerCase().includes(normalized) ||
        item.address.toLowerCase().includes(normalized) ||
        item.id.toLowerCase().includes(normalized)
      );
    });
  }, [search]);

  return (
    <ScreenShell>
      <Card>
        <SectionTitle title="Emergency History" subtitle="Search and review previous incidents" />

        <View style={styles.searchRow}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by type or address"
            placeholderTextColor={colors.inkMuted}
            style={styles.searchInput}
          />
          <Pressable style={styles.filterButton}>
            <Text style={styles.filterText}>Filter</Text>
          </Pressable>
        </View>

        <View style={styles.listWrap}>
          {filtered.map((item) => (
            <Card key={item.id} style={styles.itemCard}>
              <Text style={styles.itemDate}>{item.dateTime}</Text>
              <Text style={styles.itemTitle}>{item.emergencyType}</Text>
              <Text style={styles.itemAddress}>{item.address}</Text>

              <View style={styles.rowBetween}>
                <Text style={styles.statusPill}>{item.status}</Text>
                <Text style={styles.detailsLink}>Review</Text>
              </View>
            </Card>
          ))}

          {filtered.length === 0 ? <Text style={styles.emptyText}>No incidents matched your search.</Text> : null}
        </View>
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSoft,
    color: colors.ink
  },
  filterButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  filterText: {
    color: colors.ink,
    fontWeight: "700"
  },
  listWrap: {
    gap: spacing.sm
  },
  itemCard: {
    padding: spacing.md
  },
  itemDate: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: "700"
  },
  itemTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 6
  },
  itemAddress: {
    color: colors.inkMuted,
    marginTop: 4
  },
  rowBetween: {
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  statusPill: {
    backgroundColor: "#E7F7EE",
    color: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.round,
    fontWeight: "700",
    fontSize: 12,
    overflow: "hidden"
  },
  detailsLink: {
    color: colors.info,
    fontWeight: "700"
  },
  emptyText: {
    color: colors.inkMuted,
    textAlign: "center",
    marginTop: spacing.md
  }
});
