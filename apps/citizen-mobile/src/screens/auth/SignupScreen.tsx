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
  onBack,
  onSwitchToLogin,
  onSubmitUser,
  onSubmitVolunteer
}: {
  role: AccountType;
  onBack: () => void;
  onSwitchToLogin: () => void;
  onSubmitUser: (input: UserSignupInput) => void;
  onSubmitVolunteer: (input: VolunteerSignupInput) => void;
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
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

    if (role === "USER") {
      onSubmitUser({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
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
              : "Submit professional details for verification before operational access."}
          </Text>
        </View>

        <SectionCaption
          title={role === "USER" ? "Create User Account" : "Create Volunteer Account"}
          subtitle={
            role === "USER"
              ? "Set up your emergency profile and family information."
              : "Register for medical response and verification workflow."
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
            <View style={styles.volunteerNotice}>
              <Text style={styles.volunteerNoticeTitle}>Verification Required</Text>
              <Text style={styles.volunteerNoticeText}>
                Volunteer accounts stay pending until credentials are reviewed and approved.
              </Text>
            </View>

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

        <PrimaryButton label="Sign Up" onPress={submit} />
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
    backgroundColor: "#EFF4FA",
    padding: spacing.md
  },
  formBannerTitle: {
    color: colors.info,
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
    backgroundColor: "#F3F7FC"
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
    color: colors.emergency,
    fontWeight: "700"
  },
  volunteerNotice: {
    borderWidth: 1,
    borderColor: "#E4DCC9",
    borderRadius: radius.md,
    backgroundColor: "#F9F4E8",
    padding: spacing.sm
  },
  volunteerNoticeTitle: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: "800"
  },
  volunteerNoticeText: {
    color: colors.inkMuted,
    marginTop: 4,
    lineHeight: 19
  }
});
