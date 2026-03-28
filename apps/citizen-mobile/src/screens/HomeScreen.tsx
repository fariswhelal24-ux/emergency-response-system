import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../theme/tokens";

export const HomeScreen = ({
  onEmergencyCall,
  onOpenMedicalChat,
  onOpenSettings
}: {
  onEmergencyCall: () => void;
  onOpenMedicalChat: () => void;
  onOpenSettings: () => void;
}) => (
  <SafeAreaView style={styles.root}>
    {/* Background Gradient & Decorative Elements */}
    <View style={styles.bgGradient} />
    
    {/* Ambulance Icons */}
    <Text style={styles.ambulanceTop}>🚑</Text>
    <Text style={styles.ambulanceRight}>🚑</Text>
    
    {/* Medical Cross Icons */}
    <View style={styles.decorCrossOne}>
      <Text style={styles.crossText}>+</Text>
    </View>
    <View style={styles.decorCrossTwo}>
      <Text style={styles.crossText}>+</Text>
    </View>
    <View style={styles.decorCrossThree}>
      <Text style={styles.crossText}>+</Text>
    </View>

    {/* Pulse Animations Background Elements */}
    <View style={styles.decorWaveOne} />
    <View style={styles.decorWaveTwo} />

    <View style={styles.content}>
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>RA</Text>
        </View>

        <Text style={styles.title}>RapidAid</Text>

        <Pressable onPress={onOpenSettings} style={styles.settingsButton}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>Online · GPS Ready</Text>
      </View>

        <View style={styles.centerWrap}>
          {/* 3D Glossy Emergency Button */}
          <View style={styles.emergencyOuterGlow}>
            <View style={styles.emergencyOuterRing}>
              <Pressable onPress={onEmergencyCall} style={styles.emergencyButton}>
              {/* Glossy Shine Effect */}
              <View style={styles.emergencyShine} />
              
                <Text style={{ fontSize: 62, marginBottom: 12, zIndex: 20 }}>📞</Text>
                <Text style={styles.emergencyLabel}>Emergency Call</Text>
              <View style={styles.emergencyDivider} />
              </Pressable>
            </View>
          </View>

          <Text style={styles.helperText}>Instant dispatch + AI first-aid guidance</Text>

          <Pressable onPress={onOpenMedicalChat} style={styles.nonEmergencyButton}>
            <Text style={styles.chatIcon}>💬</Text>
            <Text style={styles.nonEmergencyText}>Non-Emergency Assistance</Text>
          </Pressable>
      </View>

      <View style={styles.disclaimerWrap}>
        <Text style={styles.disclaimerText}>
          Your location will be shared only during emergencies.
        </Text>
        <Text style={styles.disclaimerText}>Calls are recorded for medical accuracy.</Text>
      </View>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    overflow: "hidden"
  },
  bgGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#F8FAFB",
    opacity: 0.85
  },
  ambulanceTop: {
    position: "absolute",
    top: 80,
    right: 30,
    fontSize: 48,
    opacity: 0.08,
    zIndex: 0
  },
  ambulanceRight: {
    position: "absolute",
    bottom: 200,
    left: 15,
    fontSize: 52,
    opacity: 0.07,
    zIndex: 0
  },
  crossText: {
    color: "#D90C1E",
    fontSize: 52,
    fontWeight: "200",
    opacity: 0.22
  },
  content: {
    flex: 1,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: 132,
    zIndex: 10
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#E6E8EB"
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    borderWidth: 2,
    borderColor: "#DDE2E8",
    backgroundColor: "#F2F4F7",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    color: "#5B6574",
    fontWeight: "800",
    fontSize: 14
  },
  title: {
    color: "#2D3748",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0.5
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    alignItems: "center",
    justifyContent: "center"
  },
  settingsIcon: {
    fontSize: 24,
    color: "#4A5260"
  },
  statusRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: radius.round,
    backgroundColor: "#6BC568"
  },
  statusText: {
    color: "#5C6878",
    fontSize: 14,
    fontWeight: "500"
  },
  centerWrap: {
    marginTop: 40,
    alignItems: "center"
  },
  emergencyOuterGlow: {
    shadowColor: "#D90C1E",
    shadowOffset: {
      width: 0,
      height: 24
    },
    shadowOpacity: 0.45,
    shadowRadius: 40,
    elevation: 18,
    borderRadius: radius.round
  },
  emergencyOuterRing: {
    width: 310,
    height: 310,
    borderRadius: radius.round,
    borderWidth: 6,
    borderColor: "#F5A8AF",
    backgroundColor: "#FDE5E7",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#F5A8AF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5
  },
  emergencyButton: {
    width: 280,
    height: 280,
    borderRadius: radius.round,
    backgroundColor: "#D90C1E",
    borderWidth: 3,
    borderColor: "#A00817",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 8
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10
  },
  emergencyShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "35%",
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: radius.round,
    opacity: 0.6
  },
  emergencyIcon: {
    color: "#FFFFFF",
    fontSize: 56,
    marginBottom: 12,
    zIndex: 20
  },
  emergencyLabel: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    zIndex: 20,
    letterSpacing: 0.3
  },
  emergencyDivider: {
    width: 120,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.5)",
    marginTop: 16,
    borderRadius: 1,
    zIndex: 20
  },
  helperText: {
    marginTop: 24,
    color: "#505B6B",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center"
  },
  nonEmergencyButton: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#F5A8AF",
    backgroundColor: "#FFFFFF",
    borderRadius: radius.round,
    paddingVertical: 16,
    width: "90%",
    shadowColor: "#D90C1E",
    shadowOffset: {
      width: 0,
      height: 8
    },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6
  },
  chatIcon: {
    color: "#D3222D",
    fontSize: 20,
    marginRight: 12
  },
  nonEmergencyText: {
    color: "#2D3748",
    fontSize: 15,
    fontWeight: "700"
  },
  disclaimerWrap: {
    marginTop: "auto",
    alignItems: "center",
    paddingBottom: 8
  },
  disclaimerText: {
    color: "#647084",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20
  },
  decorCrossOne: {
    position: "absolute",
    top: 120,
    right: 30,
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1
  },
  decorCrossTwo: {
    position: "absolute",
    top: 480,
    left: 25,
    width: 75,
    height: 75,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1
  },
  decorCrossThree: {
    position: "absolute",
    bottom: 200,
    right: 35,
    width: 70,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1
  },
  decorWaveOne: {
    position: "absolute",
    top: 300,
    left: 10,
    width: 100,
    height: 100,
    borderRadius: radius.round,
    borderWidth: 2,
    borderColor: "rgba(217, 12, 30, 0.08)",
    zIndex: 1
  },
  decorWaveTwo: {
    position: "absolute",
    bottom: 150,
    right: -50,
    width: 350,
    height: 80,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "rgba(217, 12, 30, 0.06)",
    zIndex: 1
  }
});
