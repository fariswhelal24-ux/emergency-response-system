import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomNav } from "./src/components/BottomNav";
import { activeEmergency } from "./src/data/mockVolunteer";
import { resolveMockVerificationStatus } from "./src/data/mockAuth";
import { respondToAlert, updateAvailability } from "./src/services/api";
import { AcceptedScreen } from "./src/screens/AcceptedScreen";
import { AlertsScreen } from "./src/screens/AlertsScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { InProgressScreen } from "./src/screens/InProgressScreen";
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
import { AlertFlow, VolunteerTab } from "./src/types";
import {
  AccountType,
  AuthStage,
  LoginInput,
  VerificationStatus,
  VolunteerSignupInput
} from "./src/types/auth";

const splashDurationMs = 1200;

export default function App() {
  const [tab, setTab] = useState<VolunteerTab>("alerts");
  const [flow, setFlow] = useState<AlertFlow>("incoming");
  const [available, setAvailable] = useState(true);
  const [banner, setBanner] = useState("");

  const [authStage, setAuthStage] = useState<AuthStage>("splash");
  const [accountType, setAccountType] = useState<AccountType>("VOLUNTEER");
  const [authenticatedRole, setAuthenticatedRole] = useState<AccountType | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("pending");

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
    setAccountType("VOLUNTEER");
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
            setFlow("incoming");
          }}
        />
      );
    }

    if (flow === "chat") {
      return (
        <MedicalChatScreen
          onBackToAlerts={() => {
            setFlow("incoming");
          }}
        />
      );
    }

    if (flow === "incoming") {
      return (
        <AlertsScreen
          available={available}
          onToggleAvailability={async () => {
            const next = !available;
            setAvailable(next);
            await updateAvailability(next);
            setBanner(next ? "You are available for nearby incidents." : "You are now off duty.");
          }}
          onAccept={async () => {
            await respondToAlert(activeEmergency.caseId, true);
            setFlow("accepted");
            setBanner("Emergency accepted. Route started.");
          }}
          onDecline={async () => {
            await respondToAlert(activeEmergency.caseId, false);
            setBanner("Emergency declined.");
          }}
          onOpenSettings={() => {
            setFlow("settings");
          }}
          onOpenMedicalChat={() => {
            setFlow("chat");
            setBanner("Medical Guidance Chat opened. Incident response actions remain in Alerts.");
          }}
        />
      );
    }

    if (flow === "accepted") {
      return (
        <AcceptedScreen
          onStartProgress={() => {
            setFlow("inProgress");
            setBanner("Response in progress. Keep dispatcher informed.");
          }}
        />
      );
    }

    return <InProgressScreen onBackToAccepted={() => setFlow("accepted")} />;
  }, [tab, flow, available]);

  if (authStage !== "authenticated") {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        {authContent}
      </View>
    );
  }

  if (authenticatedRole === "USER") {
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
          if (nextTab !== "alerts") {
            return;
          }

          if (flow === "chat" || flow === "settings") {
            setFlow("incoming");
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
    backgroundColor: "#133B35",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  bannerText: {
    color: "#E5F7EF",
    textAlign: "center",
    fontSize: 13
  }
});
