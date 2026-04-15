import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { radius, spacing } from "../theme/tokens";

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "RA";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

const hasArabicText = (value: string): boolean => /[\u0600-\u06FF]/.test(value);

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim();

const toArabicPriority = (value: string): string => {
  const normalized = value.trim().toUpperCase();
  if (normalized.includes("CRITICAL")) {
    return "حرجة جدًا";
  }
  if (normalized.includes("HIGH")) {
    return "عالية";
  }
  if (normalized.includes("MEDIUM")) {
    return "متوسطة";
  }
  if (normalized.includes("LOW")) {
    return "منخفضة";
  }
  return value;
};

const translateMedicalTerms = (value: string): string =>
  value
    .replace(/heart attack/gi, "جلطة قلبية")
    .replace(/medical emergency/gi, "حالة طبية طارئة")
    .replace(/road traffic accident|vehicle accident|road collision/gi, "حادث سير")
    .replace(/difficulty breathing|breathing difficulty|shortness of breath/gi, "ضيق تنفس")
    .replace(/severe bleeding/gi, "نزيف شديد")
    .replace(/unconscious/gi, "فقدان وعي")
    .replace(/chest pain/gi, "ألم في الصدر")
    .replace(/patient\(s\)|patients|patient/gi, "مصاب")
    .replace(/caller/gi, "المتصل")
    .replace(/incident/gi, "الحالة")
    .replace(/in front of/gi, "أمام")
    .replace(/street/gi, "شارع");

const formatEmergencyTypeArabic = (value: string): string => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "حالة طبية طارئة";
  }
  if (hasArabicText(normalized)) {
    return normalized;
  }

  const translated = translateMedicalTerms(normalized);
  return hasArabicText(translated) ? translated : `حالة طارئة: ${normalized}`;
};

const formatUrgencyArabic = (value: string): string => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }
  if (hasArabicText(normalized)) {
    return normalized;
  }
  return normalized
    .replace(/critical urgency/gi, "خطورة حرجة جدًا")
    .replace(/high urgency/gi, "خطورة عالية")
    .replace(/medium urgency/gi, "خطورة متوسطة")
    .replace(/low urgency/gi, "خطورة منخفضة");
};

const formatPatientSummaryArabic = (value: string): string => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "تم استلام البلاغ، والتفاصيل الطبية قيد التحديث.";
  }

  if (hasArabicText(normalized)) {
    return normalized;
  }

  const fragments = normalized.split(/[.;]+/).map(normalizeText).filter(Boolean);
  const converted = fragments
    .map((fragment) => {
      if (/^segments=/i.test(fragment) || /^intent=/i.test(fragment) || /^confidence=/i.test(fragment)) {
        return "";
      }

      const detectedMatch = fragment.match(/^Detected\s+(\d+)\s+patient/i);
      if (detectedMatch) {
        return `تم رصد ${detectedMatch[1]} مصاب.`;
      }

      const priorityMatch = fragment.match(/^Priority\s+([A-Za-z_]+)/i);
      if (priorityMatch) {
        return `الأولوية: ${toArabicPriority(priorityMatch[1])}.`;
      }

      const volunteerMatch = fragment.match(/^Recommended volunteers:\s*(\d+)/i);
      if (volunteerMatch) {
        return `يوصى بإرسال ${volunteerMatch[1]} متطوع/متطوعة.`;
      }

      const callerMatch = fragment.match(/^Caller reported\s+(.+)/i);
      if (callerMatch) {
        return `أفاد المتصل بوجود ${translateMedicalTerms(callerMatch[1])}.`;
      }

      const translated = translateMedicalTerms(fragment);
      if (hasArabicText(translated)) {
        return `${translated}.`;
      }

      return `تفاصيل إضافية: ${translated}.`;
    })
    .filter(Boolean);

  const paragraph = normalizeText(converted.join(" "));
  return paragraph || "تم استلام بلاغ طارئ، يرجى متابعة التوجيهات من مركز الطوارئ.";
};

const formatAccessArabic = (value: string): string => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "سيتم تحديث الموقع حالًا.";
  }
  if (hasArabicText(normalized)) {
    return normalized;
  }

  return normalized
    .replace(/\bBuilding\b/gi, "مبنى")
    .replace(/\bGate\b/gi, "بوابة")
    .replace(/\bfloor\b/gi, "طابق")
    .replace(/\belevator available\b/gi, "يوجد مصعد")
    .replace(/\bStreet\b/gi, "شارع");
};

export const AlertsScreen = ({
  available,
  volunteerName,
  emergency,
  hasActiveEmergency,
  onToggleAvailability,
  onOpenSettings,
  onEmergencyCall,
  onRejectEmergencyCall,
  onCallAnotherVolunteer,
  onOpenMedicalChat
}: {
  available: boolean;
  volunteerName: string;
  emergency: {
    caseId: string;
    caseLabel: string;
    emergencyType: string;
    distanceKm: number;
    etaMinutes: number;
    patientSummary: string;
    urgencyLabel: string;
    safeAccess: string;
    /** Caller / dispatcher has not finished entering case details yet. */
    callerDetailsPending?: boolean;
  };
  hasActiveEmergency: boolean;
  onToggleAvailability: () => void;
  onOpenSettings: () => void;
  onEmergencyCall: () => void;
  onRejectEmergencyCall: () => void;
  onCallAnotherVolunteer: () => void;
  onOpenMedicalChat: () => void;
}) => {
  const detailsPending = emergency.callerDetailsPending === true;
  const emergencyTypeArabic = detailsPending
    ? "حالة طارئة — بانتظار التفاصيل"
    : formatEmergencyTypeArabic(emergency.emergencyType);
  const patientSummaryArabic = detailsPending
    ? "تم إشعارك فور بدء مكالمة الإسعاف. تفاصيل الحالة الطبية ستظهر هنا بمجرد إدخالها من المتصل أو مركز التوجيه. يمكنك الرفض الآن، أو الانتظار ثم القبول بعد التحديث."
    : formatPatientSummaryArabic(emergency.patientSummary);
  const accessArabic = formatAccessArabic(emergency.safeAccess);
  const urgencyArabic = formatUrgencyArabic(emergency.urgencyLabel);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(volunteerName || "RapidAid Volunteer")}</Text>
          </View>
          <Text style={styles.title}>RapidAid Volunteer</Text>
          <Pressable onPress={onOpenSettings} style={styles.settingsButton}>
            <Text style={styles.settingsText}>SET</Text>
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, !available && styles.statusDotOff]} />
          <Text style={styles.statusText}>{available ? "Online - Ready" : "Off Duty"}</Text>
          <Pressable onPress={onToggleAvailability} style={styles.statusToggle}>
            <Text style={styles.statusToggleText}>{available ? "Go Off Duty" : "Go Online"}</Text>
          </Pressable>
        </View>

        {hasActiveEmergency ? (
          <>
            <View style={styles.alertCard}>
              <Text style={styles.alertKicker}>تنبيه حالة طارئة جديدة</Text>
              <View style={styles.caseMetaWrap}>
                <Text style={styles.caseMetaLabel}>رقم الحالة</Text>
                <Text style={styles.alertCase}>{emergency.caseLabel || emergency.caseId}</Text>
              </View>
              <Text style={styles.alertTitle}>{emergencyTypeArabic}</Text>
              {urgencyArabic ? <Text style={styles.alertUrgency}>مستوى الخطورة: {urgencyArabic}</Text> : null}
              <Text style={styles.alertBody}>{patientSummaryArabic}</Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>موقع الوصول:</Text>
                <Text style={styles.infoValue}>{accessArabic}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>المسافة والوقت:</Text>
                <Text style={styles.infoValue}>
                  {emergency.distanceKm} كم • {emergency.etaMinutes} دقيقة
                </Text>
              </View>

              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() => {
                    if (detailsPending) {
                      return;
                    }
                    onEmergencyCall();
                  }}
                  style={[styles.acceptButton, detailsPending && styles.acceptButtonDisabled]}
                  disabled={detailsPending}
                >
                  <Text style={[styles.acceptText, detailsPending && styles.acceptTextDisabled]}>
                    {detailsPending ? "انتظر تفاصيل الحالة" : "قبول الحالة"}
                  </Text>
                </Pressable>
                <Pressable onPress={onRejectEmergencyCall} style={styles.rejectButton}>
                  <Text style={styles.rejectText}>رفض</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.idleCard}>
            <Text style={styles.idleTitle}>No Active Emergency Request</Text>
            <Text style={styles.idleText}>
              Waiting for a new case assignment. This screen updates automatically when a dispatcher sends you a
              request.
            </Text>
          </View>
        )}

        <Pressable
          onPress={() => {
            if (hasActiveEmergency && detailsPending) {
              return;
            }
            onEmergencyCall();
          }}
          style={[styles.callButton, hasActiveEmergency && detailsPending && styles.callButtonDisabled]}
          disabled={hasActiveEmergency && detailsPending}
        >
          <Text style={styles.callButtonTitle}>
            {hasActiveEmergency
              ? detailsPending
                ? "بانتظار تفاصيل الحالة"
                : "Call Ambulance"
              : "Start New Ambulance Call"}
          </Text>
          <Text style={styles.callButtonSub}>
            {hasActiveEmergency
              ? detailsPending
                ? "لا يمكن إكمال القبول حتى تصل التفاصيل من المتصل"
                : "Immediate medical dispatch for this case"
              : "Create a new emergency case and dispatch ambulance now"}
          </Text>
        </Pressable>

        <Pressable onPress={onCallAnotherVolunteer} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Call Another Volunteer</Text>
        </Pressable>

        <Pressable onPress={onOpenMedicalChat} style={styles.secondaryButtonOutline}>
          <Text style={styles.secondaryOutlineText}>Non-Emergency Assistance</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F5F9FF"
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 126
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#DCE6F4",
    paddingBottom: spacing.sm
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    borderWidth: 2,
    borderColor: "#D4E2F4",
    backgroundColor: "#EDF4FF",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    color: "#325072",
    fontWeight: "800"
  },
  title: {
    color: "#1F3551",
    fontSize: 24,
    fontWeight: "900"
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    alignItems: "center",
    justifyContent: "center"
  },
  settingsText: {
    color: "#4D607A",
    fontSize: 12,
    fontWeight: "800"
  },
  statusRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: radius.round,
    backgroundColor: "#2A7BFF"
  },
  statusDotOff: {
    backgroundColor: "#9AA9BD"
  },
  statusText: {
    color: "#4F617B",
    fontSize: 14,
    fontWeight: "600"
  },
  statusToggle: {
    borderWidth: 1,
    borderColor: "#BED0EC",
    borderRadius: radius.round,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusToggleText: {
    color: "#235AB5",
    fontSize: 11,
    fontWeight: "800"
  },
  alertCard: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#C5D6F2",
    borderRadius: radius.lg,
    padding: 14
  },
  alertKicker: {
    color: "#1E63FF",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "right",
    writingDirection: "rtl"
  },
  caseMetaWrap: {
    marginTop: 4,
    alignItems: "flex-end"
  },
  caseMetaLabel: {
    color: "#607694",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl"
  },
  alertCase: {
    color: "#5D6E85",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
    textAlign: "right",
    writingDirection: "rtl"
  },
  alertTitle: {
    color: "#1F3551",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 8,
    textAlign: "right",
    writingDirection: "rtl"
  },
  alertUrgency: {
    color: "#2257A5",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 5,
    textAlign: "right",
    writingDirection: "rtl"
  },
  alertBody: {
    color: "#3E5474",
    marginTop: 8,
    lineHeight: 25,
    textAlign: "right",
    writingDirection: "rtl",
    fontSize: 16
  },
  infoRow: {
    marginTop: 8,
    alignItems: "flex-end"
  },
  infoLabel: {
    color: "#2C4F86",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
    writingDirection: "rtl"
  },
  infoValue: {
    color: "#556B88",
    fontSize: 14,
    marginTop: 2,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 21
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  acceptButton: {
    flex: 1,
    borderRadius: radius.round,
    backgroundColor: "#1E63FF",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10
  },
  acceptText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14
  },
  acceptButtonDisabled: {
    backgroundColor: "#B8CAE8"
  },
  acceptTextDisabled: {
    color: "#F4F7FD"
  },
  rejectButton: {
    flex: 1,
    borderRadius: radius.round,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#CDD9EB",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10
  },
  rejectText: {
    color: "#536783",
    fontWeight: "800",
    fontSize: 14
  },
  callButton: {
    marginTop: 12,
    backgroundColor: "#1759D6",
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 16
  },
  callButtonDisabled: {
    backgroundColor: "#9AA9BD"
  },
  callButtonTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900"
  },
  callButtonSub: {
    color: "#D9E6FF",
    marginTop: 4,
    fontSize: 13
  },
  idleCard: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D8E5F8",
    borderRadius: radius.lg,
    padding: 16
  },
  idleTitle: {
    color: "#1F3551",
    fontSize: 18,
    fontWeight: "900"
  },
  idleText: {
    color: "#5C6F89",
    marginTop: 8,
    lineHeight: 19
  },
  secondaryButton: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: "#ADC5EB",
    borderRadius: radius.round,
    backgroundColor: "#EDF4FF",
    alignItems: "center",
    paddingVertical: 12
  },
  secondaryText: {
    color: "#255AA7",
    fontSize: 16,
    fontWeight: "800"
  },
  secondaryButtonOutline: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: "#ADC5EB",
    borderRadius: radius.round,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    paddingVertical: 12
  },
  secondaryOutlineText: {
    color: "#284A74",
    fontSize: 16,
    fontWeight: "800"
  }
});
