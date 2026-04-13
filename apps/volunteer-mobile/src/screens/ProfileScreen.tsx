import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { InputField } from "../components/AuthFields";
import { Card, GhostButton, PrimaryButton, ScreenShell, SectionTitle } from "../components/Ui";
import { colors, spacing } from "../theme/tokens";

export type VolunteerEditableProfile = {
  name: string;
  email: string;
  phone: string;
  specialty: string;
  verificationBadge: string;
  responseRadiusKm: string;
};

export const ProfileScreen = ({
  profile,
  onSave
}: {
  profile: VolunteerEditableProfile;
  onSave: (payload: VolunteerEditableProfile) => Promise<void> | void;
}) => {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [specialty, setSpecialty] = useState(profile.specialty);
  const [verificationBadge, setVerificationBadge] = useState(profile.verificationBadge);
  const [responseRadiusKm, setResponseRadiusKm] = useState(profile.responseRadiusKm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setName(profile.name);
    setEmail(profile.email);
    setPhone(profile.phone);
    setSpecialty(profile.specialty);
    setVerificationBadge(profile.verificationBadge);
    setResponseRadiusKm(profile.responseRadiusKm);
  }, [profile]);

  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return "V";
    }
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  }, [name]);

  const handleSave = async () => {
    const payload: VolunteerEditableProfile = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      specialty: specialty.trim(),
      verificationBadge: verificationBadge.trim(),
      responseRadiusKm: responseRadiusKm.trim()
    };

    setSaving(true);
    setMessage("");
    try {
      await onSave(payload);
      setMessage("Profile updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell>
      <Card>
        <SectionTitle title="Volunteer Profile" subtitle="Registration data syncs here automatically." />

        <Card style={styles.identityCard}>
          <Text style={styles.avatar}>{initials}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{name || "Volunteer"}</Text>
            <Text style={styles.specialty}>{specialty || "No specialty yet"}</Text>
          </View>
          <Text style={styles.edit}>Live</Text>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Account Information</Text>
          <InputField label="Full Name" value={name} onChangeText={setName} placeholder="Full name" />
          <InputField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <InputField label="Phone" value={phone} onChangeText={setPhone} placeholder="+970..." keyboardType="phone-pad" />
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Volunteer Settings</Text>
          <InputField label="Specialty" value={specialty} onChangeText={setSpecialty} placeholder="Doctor, nurse..." />
          <InputField
            label="Verification Badge"
            value={verificationBadge}
            onChangeText={setVerificationBadge}
            placeholder="Medical Volunteer"
            optional
          />
          <InputField
            label="Response Radius (km)"
            value={responseRadiusKm}
            onChangeText={setResponseRadiusKm}
            placeholder="5"
            keyboardType="number-pad"
            optional
          />
        </Card>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <PrimaryButton label={saving ? "Saving..." : "Save Profile"} onPress={() => void handleSave()} />
        <GhostButton label="Sign Out" onPress={() => {}} />
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E6F0FF",
    color: colors.primary,
    textAlign: "center",
    textAlignVertical: "center",
    fontWeight: "800",
    overflow: "hidden",
    marginRight: spacing.sm
  },
  name: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  specialty: {
    color: colors.inkMuted,
    marginTop: 2
  },
  edit: {
    color: colors.info,
    fontWeight: "700"
  },
  sectionCard: {
    marginBottom: spacing.md,
    gap: spacing.sm
  },
  sectionTitle: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: spacing.xs
  },
  message: {
    color: colors.info,
    fontWeight: "700",
    marginBottom: spacing.sm
  }
});
