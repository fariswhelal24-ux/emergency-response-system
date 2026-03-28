import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChoiceChips, InputField, SectionCaption } from "../../components/AuthFields";
import { Card, GhostButton, PrimaryButton, ScreenShell } from "../../components/Ui";
import { colors, radius, spacing } from "../../theme/tokens";
import { AccountType, LoginInput, VerificationStatus } from "../../types/auth";

const statusOptions: Array<{ label: string; value: VerificationStatus }> = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" }
];

const isValidEmail = (email: string): boolean => /^\S+@\S+\.\S+$/.test(email);

export const LoginScreen = ({
  role,
  onBack,
  onSwitchToSignup,
  onSubmit
}: {
  role: AccountType;
  onBack: () => void;
  onSwitchToSignup: () => void;
  onSubmit: (input: LoginInput) => void;
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("pending");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const nextErrors: Record<string, string> = {};

    if (!isValidEmail(email.trim())) {
      nextErrors.email = "Please enter a valid email.";
    }

    if (password.trim().length < 6) {
      nextErrors.password = "Password must be at least 6 characters.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit({
      email: email.trim(),
      password,
      mockVerificationStatus: role === "VOLUNTEER" ? verificationStatus : undefined
    });
  };

  return (
    <ScreenShell>
      <Card>
        <View style={styles.secureBanner}>
          <Text style={styles.secureTitle}>Secure Access</Text>
          <Text style={styles.secureText}>
            Sign in to your account to continue with emergency platform services.
          </Text>
        </View>

        <SectionCaption
          title="Login"
          subtitle={
            role === "USER"
              ? "Citizen account sign-in for emergency requests and history."
              : "Volunteer sign-in requires approved verification status."
          }
        />

        <InputField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.email}
        />

        <InputField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          secureTextEntry
          error={errors.password}
        />

        {role === "VOLUNTEER" ? (
          <View style={styles.mockBox}>
            <Text style={styles.helperTitle}>Mock verification status (demo only)</Text>
            <ChoiceChips options={statusOptions} value={verificationStatus} onChange={setVerificationStatus} />
          </View>
        ) : null}

        <PrimaryButton label="Login" onPress={submit} />
        <GhostButton label="Create New Account" onPress={onSwitchToSignup} />
        <GhostButton label="Back" onPress={onBack} />
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  secureBanner: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: "#EFF4FA",
    padding: spacing.md
  },
  secureTitle: {
    color: colors.info,
    fontSize: 15,
    fontWeight: "800"
  },
  secureText: {
    color: colors.inkMuted,
    marginTop: 4,
    lineHeight: 20
  },
  mockBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.sm
  },
  helperTitle: {
    color: colors.ink,
    fontWeight: "700",
    marginBottom: 8
  }
});
