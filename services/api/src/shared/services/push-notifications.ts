import { env } from "../../config/env";

type EmergencyPushPayload = {
  emergencyId: string;
  location: {
    latitude: number;
    longitude: number;
  };
  type: string;
  severity: string;
  summary?: string;
  language?: "ar" | "en";
};

type VolunteerPushTarget = {
  volunteerId: string;
  userId: string;
  pushToken?: string | null;
};

const detectNotificationLanguage = (payload: EmergencyPushPayload): "ar" | "en" => {
  if (payload.language === "ar" || payload.language === "en") {
    return payload.language;
  }

  const text = `${payload.type} ${payload.summary ?? ""}`;
  return /[\u0600-\u06FF]/.test(text) ? "ar" : "en";
};

export const pushNotificationService = {
  sendEmergencyAlert: async (input: {
    targets: VolunteerPushTarget[];
    payload: EmergencyPushPayload;
  }): Promise<{ dispatched: number; simulated: boolean; provider: "fcm" | "socket" }> => {
    const cleanTargets = input.targets.filter((target) => target.pushToken && target.pushToken.trim().length > 0);

    // Keep system functional even when push tokens are not yet integrated in DB.
    if (cleanTargets.length === 0 || !env.fcmServerKey) {
      return {
        dispatched: input.targets.length,
        simulated: true,
        provider: "socket"
      };
    }

    const language = detectNotificationLanguage(input.payload);
    const title = language === "ar" ? "تنبيه طارئ" : "Emergency Alert";
    const body =
      language === "ar"
        ? `${input.payload.type} (${input.payload.severity}) بالقرب منك`
        : `${input.payload.type} (${input.payload.severity}) nearby`;

    const message = {
      registration_ids: cleanTargets.map((target) => target.pushToken),
      priority: "high",
      data: {
        emergencyId: input.payload.emergencyId,
        location: input.payload.location,
        type: input.payload.type,
        severity: input.payload.severity,
        language
      },
      notification: {
        title,
        body,
        sound: "default"
      }
    };

    try {
      await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `key=${env.fcmServerKey}`
        },
        body: JSON.stringify(message)
      });
    } catch (error: unknown) {
      const messageText = error instanceof Error ? error.message : "Unknown push error";
      console.error(`[push] FCM send failed: ${messageText}`);
      return {
        dispatched: 0,
        simulated: true,
        provider: "socket"
      };
    }

    return {
      dispatched: cleanTargets.length,
      simulated: false,
      provider: "fcm"
    };
  }
};
