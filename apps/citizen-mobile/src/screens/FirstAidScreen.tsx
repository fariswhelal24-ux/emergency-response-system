import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { liveCase } from "../data/mockCitizen";
import { Card, GhostButton, PrimaryButton, ScreenShell, SectionTitle } from "../components/Ui";
import { colors, radius, spacing } from "../theme/tokens";

export const FirstAidScreen = ({ onBack }: { onBack: () => void }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const activeStep = liveCase.firstAidSteps[stepIndex];

  return (
    <ScreenShell>
      <Card>
        <SectionTitle
          title="AI Guidance Active"
          subtitle={`Ambulance ETA ${liveCase.etaMinutes} min • Volunteer ETA ${liveCase.volunteerEtaMinutes} min`}
        />

        <Card style={styles.stepCard}>
          <Text style={styles.stepHeader}>Step {stepIndex + 1}</Text>
          <Text style={styles.stepTitle}>{activeStep.title}</Text>
          <Text style={styles.stepDescription}>{activeStep.description}</Text>

          <View style={styles.stepActions}>
            <PrimaryButton
              label="Done"
              small
              onPress={() => {
                if (stepIndex < liveCase.firstAidSteps.length - 1) {
                  setStepIndex(stepIndex + 1);
                }
              }}
            />
            <GhostButton
              label="Next"
              onPress={() => {
                if (stepIndex < liveCase.firstAidSteps.length - 1) {
                  setStepIndex(stepIndex + 1);
                }
              }}
            />
            <GhostButton label="I can't do this" onPress={() => {}} />
          </View>
        </Card>

        <View style={styles.controlRow}>
          <Pressable style={styles.controlButton}>
            <Text style={styles.controlText}>Mute</Text>
          </Pressable>
          <Pressable style={styles.controlButton}>
            <Text style={styles.controlText}>Speaker</Text>
          </Pressable>
          <Pressable style={styles.controlButton}>
            <Text style={styles.controlText}>Call Dispatcher</Text>
          </Pressable>
          <Pressable style={styles.controlButton}>
            <Text style={styles.controlText}>Call Volunteer</Text>
          </Pressable>
        </View>

        <Card style={styles.miniMapCard}>
          <Text style={styles.mapStatus}>Mini ETA Status</Text>
          <Text style={styles.mapCopy}>Patient: {liveCase.address}</Text>
          <Text style={styles.mapCopy}>Ambulance route active • Volunteer route active</Text>
        </Card>

        <TextInput
          placeholder="Talk to AI / Type a message"
          placeholderTextColor={colors.inkMuted}
          style={styles.inputBar}
        />

        <GhostButton label="Back to Live Case" onPress={onBack} />
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  stepCard: {
    backgroundColor: "#F8FCFF"
  },
  stepHeader: {
    color: colors.info,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase"
  },
  stepTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8
  },
  stepDescription: {
    color: colors.inkMuted,
    lineHeight: 21,
    marginBottom: spacing.md
  },
  stepActions: {
    gap: spacing.sm
  },
  controlRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  controlButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft
  },
  controlText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700"
  },
  miniMapCard: {
    marginTop: spacing.md,
    gap: 6,
    backgroundColor: "#EEF4FB"
  },
  mapStatus: {
    color: colors.info,
    fontWeight: "700"
  },
  mapCopy: {
    color: colors.inkMuted,
    fontSize: 13
  },
  inputBar: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSoft,
    color: colors.ink,
    marginBottom: spacing.md
  }
});
