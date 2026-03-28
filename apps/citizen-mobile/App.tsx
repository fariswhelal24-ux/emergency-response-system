import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { BottomNav } from "./src/components/BottomNav";
import { resolveMockVerificationStatus } from "./src/data/mockAuth";
import { liveCase } from "./src/data/mockCitizen";
import { createEmergencyRequest, sendEmergencyUpdate } from "./src/services/api";
import { AmbulanceDispatchedScreen } from "./src/screens/AmbulanceDispatchedScreen";
import { FirstAidScreen } from "./src/screens/FirstAidScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { MedicalChatScreen } from "./src/screens/MedicalChatScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { LoginScreen } from "./src/screens/auth/LoginScreen";
import { RoleMismatchScreen } from "./src/screens/auth/RoleMismatchScreen";
import { RoleSelectionScreen } from "./src/screens/auth/RoleSelectionScreen";
import { SignupScreen } from "./src/screens/auth/SignupScreen";
import { SplashScreen } from "./src/screens/auth/SplashScreen";
import { VerificationStatusScreen } from "./src/screens/auth/VerificationStatusScreen";
import { colors, radius, spacing } from "./src/theme/tokens";
import { CitizenTab, HomeFlow } from "./src/types";
import {
  AccountType,
  AuthStage,
  LoginInput,
  VerificationStatus,
  VolunteerSignupInput
} from "./src/types/auth";

const splashDurationMs = 1200;

export default function App() {
  const [tab, setTab] = useState<CitizenTab>("home");
  const [flow, setFlow] = useState<HomeFlow>("ready");
  const [activeCaseId, setActiveCaseId] = useState(liveCase.caseId);
  const [banner, setBanner] = useState<string>("");
  const emergencyPhone = "+970569039023";

  const [authStage, setAuthStage] = useState<AuthStage>("splash");
  const [accountType, setAccountType] = useState<AccountType>("USER");
  const [authenticatedRole, setAuthenticatedRole] = useState<AccountType | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("pending");

  const startEmergencyRequest = async (
    payloadOverride?: Partial<{
      emergencyType: string;
      priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      voiceDescription: string;
      transcriptionText: string;
      aiAnalysis: string;
      possibleCondition: string;
      riskLevel: string;
      address: string;
      latitude: number;
      longitude: number;
    }>
  ) => {
    try {
      setBanner("Sending emergency request...");

      const created = await createEmergencyRequest({
        emergencyType: payloadOverride?.emergencyType ?? liveCase.emergencyType,
        priority: payloadOverride?.priority ?? "CRITICAL",
        voiceDescription:
          payloadOverride?.voiceDescription ?? "Patient has severe breathing difficulty and dizziness.",
        transcriptionText: payloadOverride?.transcriptionText,
        aiAnalysis: payloadOverride?.aiAnalysis,
        possibleCondition: payloadOverride?.possibleCondition,
        riskLevel: payloadOverride?.riskLevel,
        address: payloadOverride?.address ?? liveCase.address,
        latitude: payloadOverride?.latitude ?? 31.9038,
        longitude: payloadOverride?.longitude ?? 35.2034
      });

      setActiveCaseId(created.id);
      setFlow("dispatched");
      setBanner("Emergency sent. Ambulance and volunteers are now notified.");
    } catch {
      setBanner("Unable to send emergency request. Please try again.");
    }
  };

  const callEmergencyNumber = async () => {
    try {
      await Linking.openURL(`tel:${emergencyPhone}`);
    } catch {
      setBanner(`Unable to start the call. Please dial ${emergencyPhone} manually.`);
    }
  };

  useEffect(() => {
    if (authStage !== "splash") {
      return;
    }

    const timer = setTimeout(() => {
      setAuthStage("roleSelection");
    }, splashDurationMs);

    return () => clearTimeout(timer);
  }, [authStage]);

  const restartAuthFlow = () => {
    setAuthStage("roleSelection");
    setAccountType("USER");
    setAuthenticatedRole(null);
    setVerificationStatus("pending");
    setBanner("");
  };

  const handleLogin = (input: LoginInput) => {
    if (accountType === "VOLUNTEER") {
      const resolvedStatus = resolveMockVerificationStatus(input.email, input.mockVerificationStatus);
      setVerificationStatus(resolvedStatus);

      if (resolvedStatus === "approved") {
        setAuthenticatedRole("VOLUNTEER");
        setAuthStage("authenticated");
        return;
      }

      setAuthStage("verification");
      return;
    }

    setAuthenticatedRole("USER");
    setAuthStage("authenticated");
  };

  const handleVolunteerSignup = (_input: VolunteerSignupInput) => {
    setVerificationStatus("pending");
    setAuthStage("verification");
  };

  const authContent = useMemo(() => {
    if (authStage === "splash") {
      return <SplashScreen />;
    }

    if (authStage === "roleSelection") {
      return (
        <RoleSelectionScreen
          selected={accountType}
          onSelect={setAccountType}
          onContinue={() => setAuthStage("login")}
        />
      );
    }

    if (authStage === "login") {
      return (
        <LoginScreen
          role={accountType}
          onSubmit={handleLogin}
          onSwitchToSignup={() => setAuthStage("signup")}
          onBack={() => setAuthStage("roleSelection")}
        />
      );
    }

    if (authStage === "signup") {
      return (
        <SignupScreen
          role={accountType}
          onBack={() => setAuthStage("roleSelection")}
          onSwitchToLogin={() => setAuthStage("login")}
          onSubmitUser={() => {
            setAuthenticatedRole("USER");
            setAuthStage("authenticated");
          }}
          onSubmitVolunteer={handleVolunteerSignup}
        />
      );
    }

    return (
      <VerificationStatusScreen
        status={verificationStatus}
        onBackToLogin={() => setAuthStage("login")}
        onResubmit={() => setAuthStage("signup")}
        onSimulateApproved={() => {
          setVerificationStatus("approved");
          setAuthenticatedRole("VOLUNTEER");
          setAuthStage("authenticated");
        }}
        onSimulateRejected={() => {
          setVerificationStatus("rejected");
          setAuthStage("verification");
        }}
      />
    );
  }, [accountType, authStage, verificationStatus]);

  const mainContent = useMemo(() => {
    if (tab === "history") {
      return <HistoryScreen />;
    }

    if (tab === "profile") {
      return <ProfileScreen />;
    }

    if (flow === "settings") {
      return (
        <SettingsScreen
          onBack={() => {
            setFlow("ready");
          }}
        />
      );
    }

    if (flow === "chat") {
      return (
        <MedicalChatScreen
          onBack={() => {
            setFlow("ready");
          }}
          onUseEmergency={() => {
            void startEmergencyRequest();
          }}
        />
      );
    }

    if (flow === "ready") {
      return (
        <HomeScreen
          onEmergencyCall={() => {
            void callEmergencyNumber();
            void startEmergencyRequest();
          }}
          onOpenMedicalChat={() => {
            setFlow("chat");
          }}
          onOpenSettings={() => {
            setFlow("settings");
          }}
        />
      );
    }

    if (flow === "firstAid") {
      return (
        <FirstAidScreen
          onBack={() => {
            setFlow("dispatched");
          }}
        />
      );
    }

    return (
      <AmbulanceDispatchedScreen
        onOpenFirstAid={() => setFlow("firstAid")}
        onSendUpdate={async (message) => {
          await sendEmergencyUpdate(activeCaseId, message);
          setBanner("Additional info sent to dispatcher and responders.");
        }}
        onContactVolunteer={() => {
          void Linking.openURL("tel:+911");
        }}
        onOpenSettings={() => setFlow("settings")}
      />
    );
  }, [tab, flow, activeCaseId]);

  if (authStage !== "authenticated") {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        {authContent}
      </View>
    );
  }

  if (authenticatedRole === "VOLUNTEER") {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <RoleMismatchScreen onRestart={restartAuthFlow} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {mainContent}

      {banner ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>
      ) : null}

      <BottomNav
        activeTab={tab}
        onChange={(nextTab) => {
          setTab(nextTab);
          if (nextTab !== "home") {
            return;
          }

          if (flow === "settings" || flow === "chat") {
            setFlow("ready");
            return;
          }

          if (flow === "ready") {
            return;
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  banner: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 98,
    backgroundColor: "#1A314B",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  bannerText: {
    color: "#E7F0FB",
    fontSize: 13,
    textAlign: "center"
  }
});
