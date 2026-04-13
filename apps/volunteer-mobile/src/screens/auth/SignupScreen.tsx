import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { InputField, SectionCaption } from "../../components/AuthFields";
import { Card, GhostButton, PrimaryButton, ScreenShell } from "../../components/Ui";
import { colors, radius, spacing } from "../../theme/tokens";
import {
  AccountType,
  FamilyMemberInput,
  UserSignupInput,
  VolunteerSignupInput
} from "../../types/auth";

const isValidEmail = (email: string): boolean => /^\S+@\S+\.\S+$/.test(email);

const buildFamilyId = (): string => `fam-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

export const SignupScreen = ({
  role,
  submitting,
  onBack,
  onSwitchToLogin,
  onSubmitUser,
  onSubmitVolunteer
}: {
  role: AccountType;
  submitting?: boolean;
  onBack: () => void;
  onSwitchToLogin: () => void;
  onSubmitUser: (input: UserSignupInput) => void;
  onSubmitVolunteer: (input: VolunteerSignupInput) => void;
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nationalId, setNationalId] = useState("");

  const [cityAddress, setCityAddress] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");

  const [specialty, setSpecialty] = useState("");
  const [licenseFileRef, setLicenseFileRef] = useState("");
  const [profilePhotoRef, setProfilePhotoRef] = useState("");

  const [familyMembers, setFamilyMembers] = useState<FamilyMemberInput[]>([]);
  const [familyName, setFamilyName] = useState("");
  const [familyRelation, setFamilyRelation] = useState("");
  const [familyAge, setFamilyAge] = useState("");
  const [familyMedicalNotes, setFamilyMedicalNotes] = useState("");
  const [familyPhone, setFamilyPhone] = useState("");

  const addFamilyMember = () => {
    const nextErrors: Record<string, string> = {};

    if (!familyName.trim()) {
      nextErrors.familyName = "Member name is required.";
    }

    if (!familyRelation.trim()) {
      nextErrors.familyRelation = "Relation is required.";
    }

    setErrors((current) => ({ ...current, ...nextErrors }));

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const item: FamilyMemberInput = {
      id: buildFamilyId(),
      name: familyName.trim(),
      relation: familyRelation.trim(),
      age: familyAge.trim(),
      medicalNotes: familyMedicalNotes.trim(),
      phone: familyPhone.trim()
    };

    setFamilyMembers((current) => [...current, item]);
    setFamilyName("");
    setFamilyRelation("");
    setFamilyAge("");
    setFamilyMedicalNotes("");
    setFamilyPhone("");
    setErrors((current) => ({ ...current, familyName: "", familyRelation: "" }));
  };

  const removeFamilyMember = (memberId: string) => {
    setFamilyMembers((current) => current.filter((item) => item.id !== memberId));
  };

  const submit = () => {
    const nextErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      nextErrors.fullName = "Full name is required.";
    }

    if (!phone.trim()) {
      nextErrors.phone = "Phone number is required.";
    }

    if (!isValidEmail(email.trim())) {
      nextErrors.email = "Please enter a valid email.";
    }

    if (password.trim().length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    if (role === "USER") {
      if (!cityAddress.trim()) {
        nextErrors.cityAddress = "Address or city is required.";
      }

      if (!emergencyContact.trim()) {
        nextErrors.emergencyContact = "Emergency contact is required.";
      }
    }

    if (role === "VOLUNTEER") {
      if (!nationalId.trim()) {
        nextErrors.nationalId = "National ID is required.";
      }

      if (!specialty.trim()) {
        nextErrors.specialty = "Profession or specialty is required.";
      }

      if (!licenseFileRef.trim()) {
        nextErrors.licenseFileRef = "License or certificate upload is required.";
      }
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (submitting) {
      return;
    }

    if (role === "USER") {
      onSubmitUser({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        password: password.trim(),
        nationalId: nationalId.trim() || undefined,
        cityAddress: cityAddress.trim(),
        emergencyContact: emergencyContact.trim(),
        familyMembers
      });
      return;
    }

    onSubmitVolunteer({
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      password: password.trim(),
      nationalId: nationalId.trim(),
      specialty: specialty.trim(),
      licenseFileRef: licenseFileRef.trim(),
      profilePhotoRef: profilePhotoRef.trim() || undefined
    });
  };

  return (
    <ScreenShell>
      <Card>
        <View style={styles.formBanner}>
          <Text style={styles.formBannerTitle}>
            {role === "USER" ? "Citizen Registration" : "Volunteer Registration"}
          </Text>
          <Text style={styles.formBannerText}>
            {role === "USER"
              ? "Create your official emergency profile with identity and family details."
              : "Submit professional details to start volunteer emergency operations."}
          </Text>
        </View>

        <SectionCaption
          title={role === "USER" ? "Create User Account" : "Create Volunteer Account"}
          subtitle={
            role === "USER"
              ? "Set up your emergency profile and family information."
              : "Register for medical response workflow."
          }
        />

        <InputField
          label="Full Name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your full name"
          error={errors.fullName}
        />

        <InputField
          label="Phone Number"
          value={phone}
          onChangeText={setPhone}
          placeholder="+970..."
          keyboardType="phone-pad"
          error={errors.phone}
        />

        <InputField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          error={errors.email}
        />

        <InputField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          error={errors.password}
        />

        <InputField
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter password"
          secureTextEntry
          error={errors.confirmPassword}
        />

        <InputField
          label={role === "USER" ? "National ID" : "National ID"}
          value={nationalId}
          onChangeText={setNationalId}
          placeholder="ID number"
          optional={role === "USER"}
          error={errors.nationalId}
        />

        {role === "USER" ? (
          <>
            <InputField
              label="Address / City"
              value={cityAddress}
              onChangeText={setCityAddress}
              placeholder="City and address"
              error={errors.cityAddress}
            />

            <InputField
              label="Emergency Contact"
              value={emergencyContact}
              onChangeText={setEmergencyContact}
              placeholder="Contact name and phone"
              error={errors.emergencyContact}
            />

            <View style={styles.familyCard}>
              <Text style={styles.familyTitle}>Family Information</Text>
              <Text style={styles.familySubtitle}>Add family members and emergency details.</Text>

              <InputField
                label="Member Name"
                value={familyName}
                onChangeText={setFamilyName}
                placeholder="Family member name"
                error={errors.familyName}
              />
              <InputField
                label="Relation"
                value={familyRelation}
                onChangeText={setFamilyRelation}
                placeholder="Father, sister, child..."
                error={errors.familyRelation}
              />
              <InputField
                label="Age"
                value={familyAge}
                onChangeText={setFamilyAge}
                placeholder="Age"
                keyboardType="number-pad"
                optional
              />
              <InputField
                label="Medical Notes"
                value={familyMedicalNotes}
                onChangeText={setFamilyMedicalNotes}
                placeholder="Conditions, allergies, medications"
                multiline
                optional
              />
              <InputField
                label="Phone"
                value={familyPhone}
                onChangeText={setFamilyPhone}
                placeholder="Phone if needed"
                keyboardType="phone-pad"
                optional
              />

              <PrimaryButton label="Add Family Member" onPress={addFamilyMember} />

              {familyMembers.map((member) => (
                <View key={member.id} style={styles.memberItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberMeta}>
                      {member.relation}
                      {member.age ? ` • ${member.age}` : ""}
                    </Text>
                    {member.medicalNotes ? <Text style={styles.memberMeta}>{member.medicalNotes}</Text> : null}
                    {member.phone ? <Text style={styles.memberMeta}>{member.phone}</Text> : null}
                  </View>
                  <Pressable onPress={() => removeFamilyMember(member.id)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            <InputField
              label="Profession / Specialty"
              value={specialty}
              onChangeText={setSpecialty}
              placeholder="Doctor, nurse, paramedic..."
              error={errors.specialty}
            />

            <InputField
              label="License / Certificate Upload"
              value={licenseFileRef}
              onChangeText={setLicenseFileRef}
              placeholder="File name or upload reference"
              error={errors.licenseFileRef}
            />

            <InputField
              label="Profile Photo"
              value={profilePhotoRef}
              onChangeText={setProfilePhotoRef}
              placeholder="Optional image reference"
              optional
            />
          </>
        )}

        <PrimaryButton
          label={submitting ? "Please wait..." : "Sign Up"}
          onPress={submit}
          disabled={submitting}
        />
        <GhostButton label="Already have an account? Login" onPress={onSwitchToLogin} />
        <GhostButton label="Back" onPress={onBack} />
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  formBanner: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: "#EEF4FF",
    padding: spacing.md
  },
  formBannerTitle: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 16
  },
  formBannerText: {
    color: colors.inkMuted,
    marginTop: 4,
    lineHeight: 20
  },
  familyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: "#F5F9FF"
  },
  familyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800"
  },
  familySubtitle: {
    color: colors.inkMuted,
    marginBottom: 4
  },
  memberItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center"
  },
  memberName: {
    color: colors.ink,
    fontWeight: "800"
  },
  memberMeta: {
    color: colors.inkMuted,
    marginTop: 2,
    fontSize: 12
  },
  removeText: {
    color: colors.danger,
    fontWeight: "700"
  }
});
