import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { InputField, SectionCaption } from "../../components/AuthFields";
import { Card, GhostButton, PrimaryButton, ScreenShell } from "../../components/Ui";
import { colors, radius, spacing } from "../../theme/tokens";
import { AccountType, LoginInput } from "../../types/auth";

const isValidEmail = (value: string): boolean => /^\S+@\S+\.\S+$/.test(value.trim());
const isLikelyPhone = (value: string): boolean => /^[+0-9][0-9+\-\s]{5,}$/.test(value.trim());

export const LoginScreen = ({
  role,
  submitting,
  onBack,
  onSwitchToSignup,
  onSubmit
}: {
  role: AccountType;
  submitting?: boolean;
  onBack: () => void;
  onSwitchToSignup: () => void;
  onSubmit: (input: LoginInput) => void;
}) => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const nextErrors: Record<string, string> = {};

    if (!isValidEmail(identifier) && !isLikelyPhone(identifier)) {
      nextErrors.identifier = "Enter a valid phone number or email.";
    }

    if (password.trim().length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (submitting) {
      return;
    }

    onSubmit({
      identifier: identifier.trim(),
      password
    });
  };

  return (
    <ScreenShell>
      <Card>
        <View style={styles.secureBanner}>
          <Text style={styles.secureTitle}>Secure Access</Text>
          <Text style={styles.secureText}>
            Sign in to continue with emergency volunteer and citizen services.
          </Text>
        </View>

        <SectionCaption
          title="Login"
          subtitle={
            role === "USER"
              ? "Citizen sign-in using phone number or email and password."
              : "Volunteer sign-in using phone number or email and password."
          }
        />

        <InputField
          label="Phone or Email"
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="+970... or you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          error={errors.identifier}
        />

        <InputField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          secureTextEntry
          error={errors.password}
        />

        <PrimaryButton label={submitting ? "Signing in..." : "Login"} onPress={submit} disabled={submitting} />
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
    backgroundColor: "#EEF4FF",
    padding: spacing.md
  },
  secureTitle: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "800"
  },
  secureText: {
    color: colors.inkMuted,
    marginTop: 4,
    lineHeight: 20
  }
});
