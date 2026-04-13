import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { InputField } from "../components/AuthFields";
import { Card, GhostButton, PrimaryButton, ScreenShell, SectionTitle } from "../components/Ui";
import { colors, spacing } from "../theme/tokens";

export type CitizenEditableProfile = {
  fullName: string;
  phone: string;
  email: string;
  bloodType: string;
  conditions: string;
  allergies: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

export const ProfileScreen = ({
  profile,
  onSave
}: {
  profile: CitizenEditableProfile;
  onSave: (payload: CitizenEditableProfile) => Promise<void> | void;
}) => {
  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone);
  const [email, setEmail] = useState(profile.email);
  const [bloodType, setBloodType] = useState(profile.bloodType);
  const [conditions, setConditions] = useState(profile.conditions);
  const [allergies, setAllergies] = useState(profile.allergies);
  const [emergencyContactName, setEmergencyContactName] = useState(profile.emergencyContactName);
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(profile.emergencyContactPhone);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setFullName(profile.fullName);
    setPhone(profile.phone);
    setEmail(profile.email);
    setBloodType(profile.bloodType);
    setConditions(profile.conditions);
    setAllergies(profile.allergies);
    setEmergencyContactName(profile.emergencyContactName);
    setEmergencyContactPhone(profile.emergencyContactPhone);
  }, [profile]);

  const initials = useMemo(() => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return "U";
    }
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  }, [fullName]);

  const handleSave = async () => {
    const payload: CitizenEditableProfile = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      bloodType: bloodType.trim(),
      conditions: conditions.trim(),
      allergies: allergies.trim(),
      emergencyContactName: emergencyContactName.trim(),
      emergencyContactPhone: emergencyContactPhone.trim()
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
        <SectionTitle title="My Profile" subtitle="Your account info updates automatically after sign-up/login." />

        <Card style={styles.identityCard}>
          <Text style={styles.avatar}>{initials}</Text>
          <View style={styles.identityTextWrap}>
            <Text style={styles.name}>{fullName || "User"}</Text>
            <Text style={styles.phone}>{phone || "No phone yet"}</Text>
          </View>
          <Text style={styles.edit}>Live</Text>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Account Information</Text>
          <InputField label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Full name" />
          <InputField label="Phone" value={phone} onChangeText={setPhone} placeholder="+970..." keyboardType="phone-pad" />
          <InputField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Medical Information</Text>
          <InputField label="Blood Type" value={bloodType} onChangeText={setBloodType} placeholder="O+" optional />
          <InputField
            label="Conditions"
            value={conditions}
            onChangeText={setConditions}
            placeholder="Conditions"
            multiline
            optional
          />
          <InputField
            label="Allergies"
            value={allergies}
            onChangeText={setAllergies}
            placeholder="Allergies"
            multiline
            optional
          />
          <InputField
            label="Emergency Contact Name"
            value={emergencyContactName}
            onChangeText={setEmergencyContactName}
            placeholder="Contact name"
            optional
          />
          <InputField
            label="Emergency Contact Phone"
            value={emergencyContactPhone}
            onChangeText={setEmergencyContactPhone}
            placeholder="+970..."
            keyboardType="phone-pad"
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
    color: colors.info,
    textAlign: "center",
    textAlignVertical: "center",
    fontWeight: "800",
    overflow: "hidden",
    marginRight: spacing.sm
  },
  identityTextWrap: {
    flex: 1
  },
  name: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  phone: {
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
  sectionHeader: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: spacing.xs
  },
  message: {
    color: colors.info,
    fontWeight: "700",
    marginBottom: spacing.sm
  }
});
