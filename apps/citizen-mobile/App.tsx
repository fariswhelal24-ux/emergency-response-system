import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import * as Updates from "expo-updates";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { io, Socket } from "socket.io-client";

const APP_BUILD_TAG = "v2.2.0-fulltables-2026-04-19";

import { BottomNav as VolunteerBottomNav } from "../volunteer-mobile/src/components/BottomNav";
import {
  getVolunteerProfile,
  ensureVolunteerAuthToken,
  fetchLatestVolunteerEmergency,
  getVolunteerSocketBaseUrl,
  initVolunteerEmergencyCall,
  listVolunteerIncidents,
  loginVolunteerAccount,
  registerVolunteerAccount,
  respondToAlert as respondVolunteerToAlert,
  sendVolunteerLocationUpdate,
  type VolunteerEmergencyCase,
  updateVolunteerProfile,
  updateAvailability as updateVolunteerAvailability
} from "../volunteer-mobile/src/services/api";
import { AcceptedScreen as VolunteerAcceptedScreen } from "../volunteer-mobile/src/screens/AcceptedScreen";
import { AlertsScreen as VolunteerAlertsScreen } from "../volunteer-mobile/src/screens/AlertsScreen";
import { HistoryScreen as VolunteerHistoryScreen } from "../volunteer-mobile/src/screens/HistoryScreen";
import { InProgressScreen as VolunteerInProgressScreen } from "../volunteer-mobile/src/screens/InProgressScreen";
import { MedicalChatScreen as VolunteerMedicalChatScreen } from "../volunteer-mobile/src/screens/MedicalChatScreen";
import {
  ProfileScreen as VolunteerProfileScreen,
  VolunteerEditableProfile
} from "../volunteer-mobile/src/screens/ProfileScreen";
import { SettingsScreen as VolunteerSettingsScreen } from "../volunteer-mobile/src/screens/SettingsScreen";
import type { AlertFlow as VolunteerFlow, VolunteerTab } from "../volunteer-mobile/src/types";
import { BottomNav } from "./src/components/BottomNav";
import {
  createEmergencyRequest,
  ensureCitizenAuthToken,
  getCitizenEmergencyById,
  getCitizenMedicalProfile,
  getCitizenUserProfile,
  getCitizenSocketBaseUrl,
  initEmergencyCall,
  listCitizenEmergencies,
  loginCitizenAccount,
  registerCitizenAccount,
  switchAccountRole,
  sendCitizenLocationUpdate,
  sendEmergencyUpdate,
  updateCitizenMedicalProfile,
  updateCitizenUserProfile
} from "./src/services/api";
import { AmbulanceDispatchedScreen } from "./src/screens/AmbulanceDispatchedScreen";
import { FirstAidScreen } from "./src/screens/FirstAidScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { MedicalChatScreen } from "./src/screens/MedicalChatScreen";
import { CitizenEditableProfile, ProfileScreen } from "./src/screens/ProfileScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { LoginScreen } from "./src/screens/auth/LoginScreen";
import { RoleSelectionScreen } from "./src/screens/auth/RoleSelectionScreen";
import { SignupScreen } from "./src/screens/auth/SignupScreen";
import { SplashScreen } from "./src/screens/auth/SplashScreen";
import { colors, radius, spacing } from "./src/theme/tokens";
import { CitizenTab, HomeFlow } from "./src/types";
import { AccountType, AuthStage, LoginInput, VolunteerSignupInput } from "./src/types/auth";

const splashDurationMs = 1200;

type CaseCoordinate = {
  latitude: number;
  longitude: number;
};

type VolunteerSocketEmergency = {
  id: string;
  caseNumber: string;
  emergencyType: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  address: string;
  volunteerEtaMinutes: number | null;
  voiceDescription: string | null;
  transcriptionText: string | null;
  aiAnalysis: string | null;
  callerDetailsPending?: boolean;
  location: CaseCoordinate;
};

type VolunteerIncomingEmergency = VolunteerEmergencyCase | VolunteerSocketEmergency;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const toText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizePriority = (value: unknown): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" => {
  const normalized = toText(value)?.toUpperCase();
  if (normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH" || normalized === "CRITICAL") {
    return normalized;
  }

  return "HIGH";
};

const toVolunteerEmergencyFromSocket = (payload: unknown): VolunteerSocketEmergency | null => {
  const raw = asRecord(payload);
  if (!raw) {
    return null;
  }

  const casePayload = asRecord(raw.case) ?? raw;
  const id = toText(casePayload.id) ?? toText(raw.caseId);
  if (!id) {
    return null;
  }

  const location = asRecord(casePayload.location);
  const latitude = toNumber(location?.latitude);
  const longitude = toNumber(location?.longitude);
  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    id,
    caseNumber: toText(casePayload.caseNumber) ?? id,
    emergencyType: toText(casePayload.emergencyType) ?? "Medical Emergency",
    priority: normalizePriority(casePayload.priority),
    address: toText(casePayload.address) ?? "Live caller location",
    volunteerEtaMinutes: toNumber(casePayload.volunteerEtaMinutes),
    voiceDescription: toText(casePayload.voiceDescription),
    transcriptionText: toText(casePayload.transcriptionText),
    aiAnalysis: toText(casePayload.aiAnalysis),
    callerDetailsPending: casePayload.callerDetailsPending === true,
    location: {
      latitude,
      longitude
    }
  };
};

type CitizenLiveTracking = {
  statusText: string;
  volunteerLocation?: CaseCoordinate;
  ambulanceLocation?: CaseCoordinate & { etaMinutes?: number };
  citizenLocation?: CaseCoordinate;
  ambulanceRoute?: CaseCoordinate[];
  syncState: "connecting" | "connected" | "offline";
};

type CitizenCaseSnapshot = {
  id: string;
  caseNumber: string;
  emergencyType: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  address: string;
  aiSummary: string;
  ambulanceEtaMinutes: number | null;
  volunteerEtaMinutes: number | null;
};

const mapCaseStatusToTrackingText = (status: string): string => {
  const normalized = status.trim().toUpperCase();

  if (normalized.includes("VOLUNTEER_ACCEPTED")) {
    return "Volunteer accepted";
  }

  if (normalized.includes("AMBULANCE") || normalized.includes("ON_SCENE")) {
    return "Help is on the way";
  }

  if (normalized.includes("VOLUNTEERS_NOTIFIED")) {
    return "Searching...";
  }

  if (normalized.includes("CLOSED")) {
    return "Case closed";
  }

  return "Searching...";
};

const simplifyNetworkError = (message: string): string => {
  const text = message.trim().replace(/\s*\(base:[^)]+\)\s*$/i, "");
  if (/invalid login or password/i.test(text)) {
    return "Login failed. Check phone/email and password, or tap Create New Account.";
  }
  if (/tunnel unavailable|http 503|bad gateway|gateway timeout/i.test(text)) {
    return "Cannot reach the dev API through the tunnel. Install cloudflared (brew install cloudflared), run pnpm run dev:public:unified, scan the new QR, and try again.";
  }
  if (/cannot reach api server|network request failed|failed to fetch|load failed/i.test(text)) {
    return "Cannot reach the server. Start the API. For another network: run pnpm run dev:mobile:public (port 8081 free), scan the new QR, reopen the app. Same Wi‑Fi: pnpm run dev:mobile:phone.";
  }
  return text;
};

const deriveCitizenNameFromIdentifier = (identifier: string): string => {
  const base = identifier.split("@")[0]?.trim() || "Citizen User";
  const cleaned = base.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "Citizen User";
  }
  return cleaned
    .split(" ")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
};

const isEmailIdentifier = (value: string): boolean => /^\S+@\S+\.\S+$/.test(value.trim());

const buildCitizenFullName = (identifier: string): string => {
  const raw = identifier.trim();
  if (!raw) {
    return "Citizen User";
  }

  if (isEmailIdentifier(raw)) {
    const local = raw.split("@")[0]?.replace(/[._-]+/g, " ").trim() ?? "";
    if (local.length >= 2) {
      return local.slice(0, 60);
    }
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 2) {
    return `Citizen ${digits.slice(-4)}`;
  }

  return "Citizen User";
};

const buildCitizenSignupFromLogin = (identifier: string, password: string) => {
  const normalizedIdentifier = identifier.trim();
  const digits = normalizedIdentifier.replace(/\D/g, "");
  const generatedEmail = digits
    ? `citizen.${digits}@rapidaid.local`
    : `citizen.${Date.now()}@rapidaid.local`;

  return {
    fullName: buildCitizenFullName(normalizedIdentifier),
    email: isEmailIdentifier(normalizedIdentifier) ? normalizedIdentifier.toLowerCase() : generatedEmail,
    phone: isEmailIdentifier(normalizedIdentifier) ? undefined : normalizedIdentifier,
    password
  };
};

const DEFAULT_BETHLEHEM_LOCATION: CaseCoordinate = {
  latitude: 31.7054,
  longitude: 35.2024
};

const defaultCitizenProfile: CitizenEditableProfile = {
  fullName: "Citizen User",
  phone: "",
  email: "",
  bloodType: "",
  conditions: "",
  allergies: "",
  emergencyContactName: "",
  emergencyContactPhone: ""
};

const defaultVolunteerProfile: VolunteerEditableProfile = {
  name: "Volunteer",
  email: "",
  phone: "",
  specialty: "General First Aid",
  verificationBadge: "Medical Volunteer",
  responseRadiusKm: "5"
};

type VolunteerEmergencyState = {
  caseId: string;
  caseLabel: string;
  emergencyType: string;
  distanceKm: number;
  etaMinutes: number;
  ambulanceDispatched: boolean;
  patientSummary: string;
  urgencyLabel: string;
  safeAccess: string;
  callerDetailsPending: boolean;
};

const defaultVolunteerEmergencyState: VolunteerEmergencyState = {
  caseId: "",
  caseLabel: "",
  emergencyType: "Medical Emergency",
  distanceKm: 0,
  etaMinutes: 0,
  ambulanceDispatched: false,
  patientSummary: "No active emergency yet.",
  urgencyLabel: "HIGH urgency",
  safeAccess: "Live caller location",
  callerDetailsPending: false
};

const defaultCitizenCaseSnapshot: CitizenCaseSnapshot = {
  id: "",
  caseNumber: "",
  emergencyType: "Medical Emergency",
  priority: "HIGH",
  address: "Live device location",
  aiSummary: "Awaiting AI analysis...",
  ambulanceEtaMinutes: null,
  volunteerEtaMinutes: null
};

export default function App() {
  const [tab, setTab] = useState<CitizenTab>("home");
  const [flow, setFlow] = useState<HomeFlow>("ready");
  const [activeCaseId, setActiveCaseId] = useState("");
  const [banner, setBanner] = useState<string>("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [activeCaseLocation, setActiveCaseLocation] = useState<CaseCoordinate>(DEFAULT_BETHLEHEM_LOCATION);
  const [trackingState, setTrackingState] = useState<CitizenLiveTracking>({
    statusText: "Searching...",
    citizenLocation: DEFAULT_BETHLEHEM_LOCATION,
    syncState: "offline"
  });
  const [activeCaseSnapshot, setActiveCaseSnapshot] = useState<CitizenCaseSnapshot>(defaultCitizenCaseSnapshot);
  const [citizenHistory, setCitizenHistory] = useState<
    Array<{ id: string; dateTime: string; emergencyType: string; address: string; status: string }>
  >([]);

  const [volunteerTab, setVolunteerTab] = useState<VolunteerTab>("alerts");
  const [volunteerFlow, setVolunteerFlow] = useState<VolunteerFlow>("incoming");
  const [volunteerAvailable, setVolunteerAvailable] = useState(true);
  const [volunteerBanner, setVolunteerBanner] = useState("");
  const [volunteerCaseVersion, setVolunteerCaseVersion] = useState(0);
  const [volunteerHasActiveEmergency, setVolunteerHasActiveEmergency] = useState(false);
  const [volunteerCaseLocation, setVolunteerCaseLocation] = useState<CaseCoordinate | null>(null);
  const [volunteerAmbulanceLocation, setVolunteerAmbulanceLocation] = useState<CaseCoordinate | null>(null);
  const [volunteerLiveLocation, setVolunteerLiveLocation] = useState<CaseCoordinate | null>(null);
  const [volunteerEmergencyState, setVolunteerEmergencyState] = useState<VolunteerEmergencyState>(
    defaultVolunteerEmergencyState
  );
  const [volunteerIncidentHistory, setVolunteerIncidentHistory] = useState<
    Array<{
      id: string;
      emergencyType: string;
      address: string;
      responseTime: string;
      outcome: string;
    }>
  >([]);
  const lastSyncedVolunteerCaseIdRef = useRef<string>("");
  const lastVolunteerCallerDetailsPendingRef = useRef(false);
  const volunteerSocketRef = useRef<Socket | null>(null);
  const volunteerPositionRef = useRef<CaseCoordinate | null>(null);
  const citizenLocationRef = useRef<CaseCoordinate>(DEFAULT_BETHLEHEM_LOCATION);
  const volunteerDeviceLocationRef = useRef<CaseCoordinate | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const pendingEmergencyAfterCallRef = useRef(false);
  const activeCallEmergencyIdRef = useRef<string>("");
  const citizenSocketRef = useRef<Socket | null>(null);

  const emergencyPhone = "+970569039023";

  const [authStage, setAuthStage] = useState<AuthStage>("splash");
  const [accountType, setAccountType] = useState<AccountType>("USER");
  const [authenticatedRole, setAuthenticatedRole] = useState<AccountType | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string>("");
  const [updateBusy, setUpdateBusy] = useState<boolean>(false);
  const [citizenProfileState, setCitizenProfileState] = useState<CitizenEditableProfile>(defaultCitizenProfile);
  const [volunteerProfileState, setVolunteerProfileState] =
    useState<VolunteerEditableProfile>(defaultVolunteerProfile);

  const applyVolunteerEmergencyState = useCallback((incoming: VolunteerIncomingEmergency) => {
    const pending = incoming.callerDetailsPending === true;
    const summary = pending
      ? ""
      : incoming.voiceDescription ||
        incoming.aiAnalysis ||
        incoming.transcriptionText ||
        "Emergency case requires immediate medical response.";
    const volunteerEta = incoming.volunteerEtaMinutes ?? 5;
    const estimatedDistanceKm = Math.max(0.5, Number(((volunteerEta * 35) / 60).toFixed(1)));
    const urgencyLabel = `${incoming.priority} urgency`;
    const isNewCase = lastSyncedVolunteerCaseIdRef.current !== incoming.id;
    const sameCase = lastSyncedVolunteerCaseIdRef.current === incoming.id;
    const wasPending = lastVolunteerCallerDetailsPendingRef.current;

    setVolunteerEmergencyState({
      caseId: incoming.id,
      caseLabel: incoming.caseNumber,
      emergencyType: incoming.emergencyType,
      etaMinutes: volunteerEta,
      distanceKm: estimatedDistanceKm,
      ambulanceDispatched: true,
      patientSummary: summary,
      urgencyLabel,
      safeAccess: incoming.address,
      callerDetailsPending: pending
    });
    setVolunteerCaseLocation({
      latitude: incoming.location.latitude,
      longitude: incoming.location.longitude
    });
    setVolunteerHasActiveEmergency(true);
    setVolunteerCaseVersion((value) => value + 1);
    setVolunteerTab("alerts");
    setVolunteerFlow("incoming");
    if (isNewCase) {
      setVolunteerBanner(
        pending
          ? "بلاغ طارئ: مكالمة إسعاف — بانتظار تفاصيل الحالة من المتصل."
          : `New emergency alert: ${incoming.emergencyType}`
      );
    } else if (sameCase && wasPending && !pending) {
      setVolunteerBanner("تم تحديث تفاصيل الحالة — يمكنك الآن القبول أو الرفض.");
    }
    lastSyncedVolunteerCaseIdRef.current = incoming.id;
    lastVolunteerCallerDetailsPendingRef.current = pending;
  }, []);

  const setPendingAfterCall = (value: boolean) => {
    pendingEmergencyAfterCallRef.current = value;
  };

  const resolveLatestCitizenLocation = useCallback(async (): Promise<CaseCoordinate> => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        return citizenLocationRef.current ?? activeCaseLocation;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      const resolved = {
        latitude: Number(current.coords.latitude.toFixed(7)),
        longitude: Number(current.coords.longitude.toFixed(7))
      };

      citizenLocationRef.current = resolved;
      setActiveCaseLocation(resolved);
      setTrackingState((prev) => ({
        ...prev,
        citizenLocation: resolved
      }));
      return resolved;
    } catch {
      return citizenLocationRef.current ?? activeCaseLocation;
    }
  }, [activeCaseLocation]);

  const startEmergencyRequest = useCallback(async (
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
      const latestLocation = await resolveLatestCitizenLocation();
      setFlow("dispatched");
      setBanner("Sending emergency request...");
      setTrackingState((current) => ({
        ...current,
        statusText: "Searching...",
        syncState: "connecting"
      }));

      const created = await createEmergencyRequest({
        emergencyType: payloadOverride?.emergencyType ?? "Medical Emergency",
        priority: payloadOverride?.priority ?? "CRITICAL",
        voiceDescription:
          payloadOverride?.voiceDescription ?? "Patient has severe breathing difficulty and dizziness.",
        transcriptionText: payloadOverride?.transcriptionText,
        aiAnalysis: payloadOverride?.aiAnalysis,
        possibleCondition: payloadOverride?.possibleCondition,
        riskLevel: payloadOverride?.riskLevel,
        address: payloadOverride?.address ?? "Live device location",
        latitude: payloadOverride?.latitude ?? latestLocation.latitude,
        longitude: payloadOverride?.longitude ?? latestLocation.longitude
      });
      console.log("[Citizen] emergency request sent", {
        caseId: created.id,
        latitude: latestLocation.latitude,
        longitude: latestLocation.longitude
      });

      setActiveCaseId(created.id);
      setActiveCaseSnapshot({
        id: created.id,
        caseNumber: created.caseNumber ?? created.id,
        emergencyType: created.emergencyType ?? "Medical Emergency",
        priority: created.priority ?? "HIGH",
        address: created.address ?? "Live device location",
        aiSummary: payloadOverride?.aiAnalysis ?? payloadOverride?.voiceDescription ?? "Emergency request created.",
        ambulanceEtaMinutes: null,
        volunteerEtaMinutes: null
      });
      if (created?.location?.latitude && created?.location?.longitude) {
        setActiveCaseLocation({
          latitude: Number(created.location.latitude),
          longitude: Number(created.location.longitude)
        });
      }
      setFlow("dispatched");
      setBanner("Emergency sent. Ambulance and volunteers are now notified.");
      void sendCitizenLocationUpdate({
        caseId: created.id,
        latitude: latestLocation.latitude,
        longitude: latestLocation.longitude
      }).catch(() => undefined);
    } catch {
      setFlow("dispatched");
      setBanner("Unable to send emergency request. Please try again.");
      setTrackingState((current) => ({
        ...current,
        syncState: "offline"
      }));
    }
  }, [resolveLatestCitizenLocation]);

  const initEmergencyFromCall = useCallback(async (): Promise<string | null> => {
    let latestLocation = citizenLocationRef.current ?? activeCaseLocation;
    try {
      latestLocation = await resolveLatestCitizenLocation();
      setFlow("dispatched");
      setBanner("Initializing emergency call session...");
      setTrackingState((current) => ({
        ...current,
        statusText: "Searching...",
        syncState: "connecting"
      }));

      const initialized = await initEmergencyCall({
        location: {
          latitude: latestLocation.latitude,
          longitude: latestLocation.longitude,
          address: "Live device location"
        },
        callType: "Emergency Voice Call"
      });

      const emergencyId = typeof initialized?.emergencyId === "string" ? initialized.emergencyId : null;
      if (!emergencyId) {
        throw new Error("Missing emergencyId");
      }

      activeCallEmergencyIdRef.current = emergencyId;
      setActiveCaseId(emergencyId);
      setActiveCaseSnapshot({
        id: emergencyId,
        caseNumber: initialized?.caseNumber ?? emergencyId,
        emergencyType: initialized?.case?.emergencyType ?? "Emergency Voice Call",
        priority: initialized?.case?.priority ?? "HIGH",
        address: initialized?.case?.address ?? "Live device location",
        aiSummary:
          initialized?.case?.voiceDescription ??
          initialized?.case?.aiAnalysis ??
          "Emergency call started. AI listening is active.",
        ambulanceEtaMinutes: initialized?.case?.ambulanceEtaMinutes ?? null,
        volunteerEtaMinutes: initialized?.case?.volunteerEtaMinutes ?? null
      });

      const location = initialized?.location;
      if (
        location &&
        typeof location.latitude === "number" &&
        Number.isFinite(location.latitude) &&
        typeof location.longitude === "number" &&
        Number.isFinite(location.longitude)
      ) {
        setActiveCaseLocation({
          latitude: Number(location.latitude),
          longitude: Number(location.longitude)
        });
      }

      setBanner(`Emergency session started (ID: ${initialized?.caseNumber ?? emergencyId}).`);
      return emergencyId;
    } catch (error) {
      const reason = simplifyNetworkError(error instanceof Error ? error.message : "Unknown error");
      if (/session expired|authentication required|invalid or expired/i.test(reason)) {
        setAuthenticatedRole(null);
        setAuthStage("login");
        setFlow("ready");
        setBanner("Session expired. Please login again, then retry Emergency Call.");
        return null;
      }

      try {
        setBanner(`Call init failed (${reason}). Sending emergency request...`);
        const created = await createEmergencyRequest({
          emergencyType: "Emergency Voice Call",
          priority: "CRITICAL",
          voiceDescription: "Emergency call started. Fallback request sent automatically.",
          address: "Live device location",
          latitude: latestLocation.latitude,
          longitude: latestLocation.longitude
        });

        if (!created?.id) {
          throw new Error("Missing case id");
        }

        activeCallEmergencyIdRef.current = created.id;
        setActiveCaseId(created.id);
        setActiveCaseSnapshot({
          id: created.id,
          caseNumber: created.caseNumber ?? created.id,
          emergencyType: created.emergencyType ?? "Emergency Voice Call",
          priority: created.priority ?? "CRITICAL",
          address: created.address ?? "Live device location",
          aiSummary: "Emergency request created.",
          ambulanceEtaMinutes: null,
          volunteerEtaMinutes: null
        });
        setFlow("dispatched");
        setTrackingState((current) => ({
          ...current,
          syncState: "connecting"
        }));
        setBanner("Emergency request sent. Calling emergency center now...");
        return created.id as string;
      } catch (fallbackError) {
        const fallbackReason = simplifyNetworkError(
          fallbackError instanceof Error ? fallbackError.message : "Unknown fallback error"
        );
        if (/session expired|authentication required|invalid or expired/i.test(fallbackReason)) {
          setAuthenticatedRole(null);
          setAuthStage("login");
          setFlow("ready");
          setBanner("Session expired. Please login again, then retry Emergency Call.");
          return null;
        }
        setFlow("ready");
        setTrackingState((current) => ({
          ...current,
          syncState: "offline"
        }));
        setBanner(
          `Unable to initialize emergency session. ${reason}. Fallback failed: ${fallbackReason}`
        );
        return null;
      }
    }
  }, [resolveLatestCitizenLocation]);

  const callEmergencyNumber = useCallback(async (): Promise<boolean> => {
    try {
      const emergencyUri = `tel:${emergencyPhone}`;
      const canOpen = await Linking.canOpenURL(emergencyUri);

      if (!canOpen) {
        throw new Error("Dialer unavailable");
      }

      await Linking.openURL(`tel:${emergencyPhone}`);
      return true;
    } catch {
      setBanner(`Unable to start the call. Please dial ${emergencyPhone} manually.`);
      return false;
    }
  }, [emergencyPhone]);

  useEffect(() => {
    if (authStage !== "authenticated" || authenticatedRole !== "USER") {
      return;
    }

    let closed = false;
    let watcher: Location.LocationSubscription | null = null;

    const startCitizenLocationTracking = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          setBanner("Location permission is required for live emergency dispatch.");
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        const initial = {
          latitude: Number(current.coords.latitude.toFixed(7)),
          longitude: Number(current.coords.longitude.toFixed(7))
        };

        if (closed) {
          return;
        }

        citizenLocationRef.current = initial;
        setActiveCaseLocation(initial);
        setTrackingState((prev) => ({
          ...prev,
          citizenLocation: initial
        }));

        watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 6000,
            distanceInterval: 5
          },
          (position) => {
            const next = {
              latitude: Number(position.coords.latitude.toFixed(7)),
              longitude: Number(position.coords.longitude.toFixed(7))
            };

            citizenLocationRef.current = next;
            setActiveCaseLocation(next);
            setTrackingState((prev) => ({
              ...prev,
              citizenLocation: next
            }));

            const caseId = activeCaseId.trim().length > 0 ? activeCaseId : undefined;

            if (caseId && citizenSocketRef.current) {
              citizenSocketRef.current.emit("location_update", {
                caseId,
                actorType: "CITIZEN",
                latitude: next.latitude,
                longitude: next.longitude
              });
            }

            void sendCitizenLocationUpdate({
              caseId,
              latitude: next.latitude,
              longitude: next.longitude
            }).catch(() => undefined);
          }
        );
      } catch (error) {
        const message = simplifyNetworkError(
          error instanceof Error ? error.message : "Could not start live GPS tracking."
        );
        setBanner(message);
      }
    };

    void startCitizenLocationTracking();

    return () => {
      closed = true;
      watcher?.remove();
    };
  }, [activeCaseId, authStage, authenticatedRole]);

  useEffect(() => {
    if (authStage !== "authenticated" || authenticatedRole !== "USER") {
      return;
    }

    let cancelled = false;

    const syncHistory = async () => {
      try {
        const rows = await listCitizenEmergencies();
        if (cancelled) {
          return;
        }

        setCitizenHistory(
          rows.map((item) => ({
            id: item.caseNumber || item.id,
            dateTime: item.createdAt ? new Date(item.createdAt).toLocaleString() : "N/A",
            emergencyType: item.emergencyType || "Medical Emergency",
            address: item.address || "Unknown location",
            status: item.status || "OPEN"
          }))
        );
      } catch {
        if (!cancelled) {
          setCitizenHistory([]);
        }
      }
    };

    void syncHistory();
    const timer = setInterval(() => {
      void syncHistory();
    }, 20_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [authStage, authenticatedRole]);

  useEffect(() => {
    if (authStage !== "authenticated" || authenticatedRole !== "USER" || !activeCaseId) {
      return;
    }

    let cancelled = false;
    const syncCaseDetails = async () => {
      try {
        const details = await getCitizenEmergencyById(activeCaseId);
        if (cancelled) {
          return;
        }

        const caseRow = details.case;
        setActiveCaseSnapshot((prev) => ({
          ...prev,
          id: caseRow.id,
          caseNumber: caseRow.caseNumber || caseRow.id,
          emergencyType: caseRow.emergencyType || prev.emergencyType,
          priority: caseRow.priority || prev.priority,
          address: caseRow.address || prev.address,
          aiSummary:
            caseRow.aiAnalysis ||
            caseRow.voiceDescription ||
            caseRow.transcriptionText ||
            prev.aiSummary,
          ambulanceEtaMinutes: caseRow.ambulanceEtaMinutes ?? prev.ambulanceEtaMinutes,
          volunteerEtaMinutes: caseRow.volunteerEtaMinutes ?? prev.volunteerEtaMinutes
        }));
      } catch {
        // Keep previous snapshot
      }
    };

    void syncCaseDetails();
    const timer = setInterval(() => {
      void syncCaseDetails();
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeCaseId, authStage, authenticatedRole]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (!pendingEmergencyAfterCallRef.current) {
        return;
      }

      if ((previousState === "inactive" || previousState === "background") && nextState === "active") {
        setPendingAfterCall(false);
        const emergencyId = activeCallEmergencyIdRef.current || activeCaseId;
        if (emergencyId) {
          citizenSocketRef.current?.emit("call_ended", {
            emergencyId,
            at: new Date().toISOString()
          });
          setBanner("Call ended. Live emergency tracking continues.");
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [activeCaseId]);

  useEffect(() => {
    if (
      authStage !== "authenticated" ||
      authenticatedRole !== "USER" ||
      !activeCaseId ||
      (flow !== "dispatched" && flow !== "firstAid")
    ) {
      return;
    }

    let disposed = false;
    let socket: Socket | null = null;
    let locationTimer: ReturnType<typeof setInterval> | null = null;

    setTrackingState((current) => ({
      ...current,
      statusText: current.statusText || "Searching...",
      citizenLocation: activeCaseLocation,
      syncState: "connecting"
    }));

    const connectRealtime = async () => {
      try {
        const [token, socketBaseUrl] = await Promise.all([ensureCitizenAuthToken(), getCitizenSocketBaseUrl()]);
        if (disposed) {
          return;
        }

        socket = io(socketBaseUrl, {
          transports: ["websocket"],
          autoConnect: true,
          auth: { token }
        });
        citizenSocketRef.current = socket;

        const joinCaseRoom = () => {
          socket?.emit("case:join", activeCaseId);
          if (pendingEmergencyAfterCallRef.current) {
            socket?.emit("call_connected", {
              emergencyId: activeCaseId,
              at: new Date().toISOString()
            });
          }
          setTrackingState((current) => ({
            ...current,
            syncState: "connected"
          }));
        };

        socket.on("connect", joinCaseRoom);
        socket.on("connection:ready", joinCaseRoom);

        socket.on("volunteer_requested", (payload: { caseId?: string }) => {
          if (payload?.caseId !== activeCaseId) {
            return;
          }

          setTrackingState((current) => ({
            ...current,
            statusText: "Searching..."
          }));
        });

        socket.on("volunteer_accepted", (payload: { caseId?: string }) => {
          if (payload?.caseId !== activeCaseId) {
            return;
          }

          setTrackingState((current) => ({
            ...current,
            statusText: "Volunteer accepted"
          }));
        });

        socket.on("status_changed", (payload: { caseId?: string; status?: string }) => {
          if (payload?.caseId !== activeCaseId || !payload.status) {
            return;
          }

          const nextStatus = payload.status;

          setTrackingState((current) => ({
            ...current,
            statusText: mapCaseStatusToTrackingText(nextStatus)
          }));
        });

        socket.on("call_started", (payload: { emergencyId?: string }) => {
          if (payload?.emergencyId !== activeCaseId) {
            return;
          }

          setTrackingState((current) => ({
            ...current,
            statusText: "Call started"
          }));
        });

        socket.on("call_connected", (payload: { emergencyId?: string }) => {
          if (payload?.emergencyId !== activeCaseId) {
            return;
          }

          setTrackingState((current) => ({
            ...current,
            statusText: "Call connected"
          }));
        });

        socket.on("call_ended", (payload: { emergencyId?: string }) => {
          if (payload?.emergencyId !== activeCaseId) {
            return;
          }

          setTrackingState((current) => ({
            ...current,
            statusText: "Help is on the way"
          }));
        });

        socket.on(
          "location_update",
          (payload: {
            caseId?: string;
            location?: {
              actorType?: "CITIZEN" | "VOLUNTEER" | "AMBULANCE" | "DISPATCHER";
              latitude?: number;
              longitude?: number;
              etaMinutes?: number;
            };
          }) => {
            if (payload?.caseId !== activeCaseId || !payload.location) {
              return;
            }

            const lat = Number(payload.location.latitude);
            const lng = Number(payload.location.longitude);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              return;
            }

            if (payload.location.actorType === "VOLUNTEER") {
              setTrackingState((current) => ({
                ...current,
                volunteerLocation: {
                  latitude: lat,
                  longitude: lng
                }
              }));
              return;
            }

            if (payload.location.actorType === "AMBULANCE") {
              setTrackingState((current) => ({
                ...current,
                ambulanceLocation: {
                  latitude: lat,
                  longitude: lng,
                  etaMinutes: payload.location?.etaMinutes
                },
                statusText: "Help is on the way"
              }));
            }
          }
        );

        socket.on(
          "ambulance_update",
          (payload: {
            caseId?: string;
            ambulance?: {
              latitude: number;
              longitude: number;
              etaMinutes?: number;
              status?: string;
            };
            route?: Array<{ latitude: number; longitude: number }>;
          }) => {
            if (payload?.caseId !== activeCaseId || !payload.ambulance) {
              return;
            }

            const ambulance = payload.ambulance;

            setTrackingState((current) => ({
              ...current,
              ambulanceLocation: {
                latitude: ambulance.latitude,
                longitude: ambulance.longitude,
                etaMinutes: ambulance.etaMinutes
              },
              ambulanceRoute: payload.route,
              statusText: ambulance.status === "arrived" ? "Help arrived" : "Help is on the way"
            }));
          }
        );

        locationTimer = setInterval(() => {
          const location = citizenLocationRef.current ?? activeCaseLocation;
          socket?.emit("location_update", {
            caseId: activeCaseId,
            actorType: "CITIZEN",
            latitude: location.latitude,
            longitude: location.longitude
          });
          void sendCitizenLocationUpdate({
            caseId: activeCaseId,
            latitude: location.latitude,
            longitude: location.longitude
          }).catch(() => undefined);
        }, 7000);
      } catch {
        if (!disposed) {
          setTrackingState((current) => ({
            ...current,
            syncState: "offline"
          }));
        }
      }
    };

    void connectRealtime();

    return () => {
      disposed = true;

      if (locationTimer) {
        clearInterval(locationTimer);
      }

      if (socket) {
        socket.emit("case:leave", activeCaseId);
        socket.disconnect();
      }

      if (citizenSocketRef.current === socket) {
        citizenSocketRef.current = null;
      }
    };
  }, [activeCaseId, activeCaseLocation, authStage, authenticatedRole, flow]);

  useEffect(() => {
    if (authStage !== "splash") {
      return;
    }

    const timer = setTimeout(() => {
      setAuthStage("roleSelection");
    }, splashDurationMs);

    return () => clearTimeout(timer);
  }, [authStage]);

  useEffect(() => {
    let cancelled = false;

    const autoCheckForUpdates = async () => {
      try {
        if (typeof Updates.checkForUpdateAsync !== "function") {
          return;
        }
        const check = await Updates.checkForUpdateAsync();
        if (cancelled) {
          return;
        }
        if (check && check.isAvailable) {
          setUpdateStatus("Downloading latest version...");
          const fetched = await Updates.fetchUpdateAsync();
          if (cancelled) {
            return;
          }
          if (fetched && fetched.isNew) {
            setUpdateStatus("New version ready. Reloading...");
            await Updates.reloadAsync();
          }
        }
      } catch {
      }
    };

    void autoCheckForUpdates();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleForceRefresh = useCallback(async () => {
    if (updateBusy) {
      return;
    }
    setUpdateBusy(true);
    setUpdateStatus("Checking for latest version...");
    try {
      const check = await Updates.checkForUpdateAsync();
      if (check && check.isAvailable) {
        setUpdateStatus("Downloading...");
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched && fetched.isNew) {
          setUpdateStatus("Reloading app with new version...");
          await Updates.reloadAsync();
          return;
        }
      }
      setUpdateStatus("Already on latest version. Reloading...");
      try {
        await Updates.reloadAsync();
      } catch {
        setUpdateStatus("Already on latest version.");
        setUpdateBusy(false);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setUpdateStatus(`Update check failed: ${reason}`);
      setUpdateBusy(false);
    }
  }, [updateBusy]);

  useEffect(() => {
    if (authStage !== "authenticated" || authenticatedRole !== "VOLUNTEER") {
      return;
    }

    let cancelled = false;

    const syncIncomingCase = async () => {
      let incoming: VolunteerEmergencyCase | null = null;
      try {
        incoming = await fetchLatestVolunteerEmergency();
      } catch (error) {
        if (!cancelled) {
          const message = simplifyNetworkError(
            error instanceof Error ? error.message : "Could not refresh volunteer emergency list."
          );
          setVolunteerBanner(message);
        }
        return;
      }

      if (cancelled) {
        return;
      }

      if (!incoming) {
        // Keep alert visible until volunteer explicitly accepts/rejects.
        if (volunteerFlow === "incoming" && volunteerHasActiveEmergency) {
          return;
        }
        setVolunteerHasActiveEmergency(false);
        setVolunteerEmergencyState(defaultVolunteerEmergencyState);
        setVolunteerAmbulanceLocation(null);
        lastSyncedVolunteerCaseIdRef.current = "";
        lastVolunteerCallerDetailsPendingRef.current = false;
        return;
      }
      applyVolunteerEmergencyState(incoming);
    };

    void syncIncomingCase();

    const timer = setInterval(() => {
      void syncIncomingCase();
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [authStage, authenticatedRole, applyVolunteerEmergencyState, volunteerFlow, volunteerHasActiveEmergency]);

  useEffect(() => {
    if (authStage !== "authenticated" || authenticatedRole !== "VOLUNTEER") {
      return;
    }

    void updateVolunteerAvailability(true).catch((error) => {
      const message = simplifyNetworkError(
        error instanceof Error ? error.message : "Could not set volunteer availability."
      );
      setVolunteerBanner(message);
    });
  }, [authStage, authenticatedRole]);

  useEffect(() => {
    if (authStage !== "authenticated" || authenticatedRole !== "VOLUNTEER") {
      return;
    }

    let cancelled = false;

    const syncVolunteerIncidents = async () => {
      try {
        const rows = await listVolunteerIncidents();
        if (cancelled) {
          return;
        }

        setVolunteerIncidentHistory(
          rows.map((item) => ({
            id: item.caseNumber || item.caseId,
            emergencyType: item.emergencyType || "Medical Emergency",
            address: item.address || "Unknown location",
            responseTime:
              typeof item.responseEtaMinutes === "number" ? `${item.responseEtaMinutes} min` : "N/A",
            outcome: item.assignmentStatus || item.caseStatus || "RECORDED"
          }))
        );
      } catch {
        if (!cancelled) {
          setVolunteerIncidentHistory([]);
        }
      }
    };

    void syncVolunteerIncidents();
    const timer = setInterval(() => {
      void syncVolunteerIncidents();
    }, 20_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [authStage, authenticatedRole]);

  useEffect(() => {
    if (authStage !== "authenticated" || authenticatedRole !== "VOLUNTEER") {
      return;
    }

    let disposed = false;
    let socket: Socket | null = null;

    const syncVolunteerCaseFromSocket = async () => {
      let incoming: VolunteerEmergencyCase | null = null;
      try {
        incoming = await fetchLatestVolunteerEmergency();
      } catch (error) {
        if (!disposed) {
          const message = simplifyNetworkError(
            error instanceof Error ? error.message : "Could not sync volunteer emergency from realtime signal."
          );
          setVolunteerBanner(message);
        }
        return;
      }

      if (disposed) {
        return;
      }

      if (!incoming) {
        // Keep alert visible until volunteer explicitly accepts/rejects.
        if (volunteerFlow === "incoming" && volunteerHasActiveEmergency) {
          return;
        }
        setVolunteerHasActiveEmergency(false);
        setVolunteerEmergencyState(defaultVolunteerEmergencyState);
        setVolunteerAmbulanceLocation(null);
        lastSyncedVolunteerCaseIdRef.current = "";
        lastVolunteerCallerDetailsPendingRef.current = false;
        return;
      }

      applyVolunteerEmergencyState(incoming);
      socket?.emit("case:join", incoming.id);
    };

    const handleRealtimeEmergency = (payload: unknown) => {
      console.log("[Volunteer] realtime emergency event received", payload);
      const incoming = toVolunteerEmergencyFromSocket(payload);
      if (incoming) {
        applyVolunteerEmergencyState(incoming);
        socket?.emit("case:join", incoming.id);
      }

      void syncVolunteerCaseFromSocket();
    };

    const connectRealtime = async () => {
      try {
        const [token, socketBaseUrl] = await Promise.all([ensureVolunteerAuthToken(), getVolunteerSocketBaseUrl()]);
        if (disposed) {
          return;
        }

        socket = io(socketBaseUrl, {
          transports: ["websocket"],
          autoConnect: true,
          auth: { token }
        });
        volunteerSocketRef.current = socket;

        socket.on("connect", () => {
          const caseIdToJoin = lastSyncedVolunteerCaseIdRef.current || volunteerEmergencyState.caseId;
          if (caseIdToJoin) {
            socket?.emit("case:join", caseIdToJoin);
          }
        });

        socket.on("new_request", handleRealtimeEmergency);
        socket.on("emergency_created", handleRealtimeEmergency);
        socket.on("volunteer_requested", handleRealtimeEmergency);
        socket.on("emergency:update", handleRealtimeEmergency);

        socket.on(
          "ambulance_update",
          (payload: {
            caseId?: string;
            ambulance?: { etaMinutes?: number; status?: string; latitude?: number; longitude?: number };
          }) => {
            if (payload?.caseId !== volunteerEmergencyState.caseId || !payload.ambulance) {
              return;
            }

            if (
              typeof payload.ambulance.latitude === "number" &&
              typeof payload.ambulance.longitude === "number"
            ) {
              setVolunteerAmbulanceLocation({
                latitude: payload.ambulance.latitude,
                longitude: payload.ambulance.longitude
              });
            }

            if (payload.ambulance.status === "arrived") {
              setVolunteerBanner("Ambulance has arrived at the incident location.");
              return;
            }

            if (typeof payload.ambulance.etaMinutes === "number") {
              setVolunteerBanner(`Ambulance ETA: ${payload.ambulance.etaMinutes} min`);
            }
          }
        );
      } catch {
        if (!disposed) {
          setVolunteerBanner("Realtime sync unavailable. Using periodic refresh.");
        }
      }
    };

    void connectRealtime();

    return () => {
      disposed = true;

      if (socket) {
        if (volunteerEmergencyState.caseId) {
          socket.emit("case:leave", volunteerEmergencyState.caseId);
        }
        socket.disconnect();
      }

      if (volunteerSocketRef.current === socket) {
        volunteerSocketRef.current = null;
      }
    };
  }, [
    authStage,
    authenticatedRole,
    applyVolunteerEmergencyState,
    volunteerFlow,
    volunteerHasActiveEmergency,
    volunteerEmergencyState.caseId
  ]);

  useEffect(() => {
    if (authStage !== "authenticated" || authenticatedRole !== "VOLUNTEER") {
      return;
    }

    let closed = false;
    let watcher: Location.LocationSubscription | null = null;

    const startVolunteerLocationTracking = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          setVolunteerBanner("Location permission is required for live volunteer dispatch.");
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        const initial = {
          latitude: Number(current.coords.latitude.toFixed(7)),
          longitude: Number(current.coords.longitude.toFixed(7))
        };

        if (closed) {
          return;
        }

        volunteerDeviceLocationRef.current = initial;
        volunteerPositionRef.current = initial;
        setVolunteerLiveLocation(initial);

        watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 6000,
            distanceInterval: 5
          },
          (position) => {
            const next = {
              latitude: Number(position.coords.latitude.toFixed(7)),
              longitude: Number(position.coords.longitude.toFixed(7))
            };

            volunteerDeviceLocationRef.current = next;
            volunteerPositionRef.current = next;
            setVolunteerLiveLocation(next);

            const caseId =
              (volunteerFlow === "accepted" || volunteerFlow === "inProgress") &&
              volunteerEmergencyState.caseId.trim().length > 0
                ? volunteerEmergencyState.caseId
                : undefined;

            if (volunteerSocketRef.current) {
              volunteerSocketRef.current.emit("location_update", {
                caseId,
                actorType: "VOLUNTEER",
                latitude: next.latitude,
                longitude: next.longitude
              });
            }

            void sendVolunteerLocationUpdate({
              caseId,
              latitude: next.latitude,
              longitude: next.longitude
            }).catch(() => undefined);
          }
        );
      } catch (error) {
        const message = simplifyNetworkError(
          error instanceof Error ? error.message : "Could not start volunteer GPS tracking."
        );
        setVolunteerBanner(message);
      }
    };

    void startVolunteerLocationTracking();

    return () => {
      closed = true;
      watcher?.remove();
    };
  }, [authStage, authenticatedRole, volunteerFlow, volunteerEmergencyState.caseId]);

  const handleLogin = (input: LoginInput) => {
    setAuthSubmitting(true);
    setBanner("Signing in...");

    const loginTask = async () => {
      const identifier = input.identifier.trim();
      let authData;

      if (accountType === "VOLUNTEER") {
        try {
          authData = await loginVolunteerAccount({
            identifier,
            password: input.password
          });
        } catch (error) {
          const raw = error instanceof Error ? error.message : String(error);
          const normalized = raw.toLowerCase();
          const canAutoCreateVolunteer =
            identifier.includes("@") &&
            (normalized.includes("invalid credentials") || normalized.includes("invalid login or password"));

          if (!canAutoCreateVolunteer) {
            throw error;
          }

          setBanner("No volunteer account found. Creating one automatically...");
          try {
            await registerVolunteerAccount({
              fullName: deriveCitizenNameFromIdentifier(identifier),
              email: identifier.toLowerCase(),
              password: input.password
            });
          } catch (registerError) {
            const registerRaw =
              registerError instanceof Error ? registerError.message : String(registerError);
            const registerNormalized = registerRaw.toLowerCase();
            if (registerNormalized.includes("already registered")) {
              throw new Error(
                "This email is already registered as a citizen account. Use a different email for the volunteer, or ask the owner to log in with the correct password."
              );
            }
            throw registerError;
          }

          authData = await loginVolunteerAccount({
            identifier,
            password: input.password
          });
        }
      } else {
        try {
          authData = await loginCitizenAccount({
            identifier,
            password: input.password
          });
        } catch (error) {
          const raw = error instanceof Error ? error.message : String(error);
          const normalized = raw.toLowerCase();
          const canAutoCreateCitizen =
            identifier.includes("@") &&
            (normalized.includes("invalid credentials") || normalized.includes("invalid login or password"));

          if (!canAutoCreateCitizen) {
            throw error;
          }

          setBanner("No account found. Creating a citizen account automatically...");
          try {
            await registerCitizenAccount({
              fullName: deriveCitizenNameFromIdentifier(identifier),
              email: identifier.toLowerCase(),
              password: input.password
            });
          } catch (registerError) {
            const registerRaw =
              registerError instanceof Error ? registerError.message : String(registerError);
            const registerNormalized = registerRaw.toLowerCase();
            if (registerNormalized.includes("already registered")) {
              throw new Error(
                "This email is already registered. Please enter the correct password, or tap Back and use Create New Account with a different email."
              );
            }
            throw registerError;
          }
          authData = await loginCitizenAccount({
            identifier,
            password: input.password
          });
        }
      }

      let resolvedRole = String(authData?.user?.role || "").toUpperCase();

      if (accountType === "VOLUNTEER" && resolvedRole !== "VOLUNTEER" && resolvedRole !== "") {
        setBanner("Upgrading this account to Volunteer...");
        try {
          const switched = await switchAccountRole({
            identifier,
            password: input.password,
            newRole: "VOLUNTEER"
          });
          if (switched) {
            authData = switched as typeof authData;
            resolvedRole = String(authData?.user?.role || "").toUpperCase();
          }
        } catch (switchError) {
          const switchRaw =
            switchError instanceof Error ? switchError.message : String(switchError);
          throw new Error(
            `Could not switch this account to Volunteer. ${switchRaw}. Use a different email or sign in as Citizen.`
          );
        }
      }

      if (resolvedRole === "VOLUNTEER") {
        setAccountType("VOLUNTEER");
        setAuthenticatedRole("VOLUNTEER");
        setAuthStage("authenticated");
        setVolunteerTab("alerts");
        setVolunteerFlow("incoming");
        setBanner("");
        try {
          const volunteerProfile = await getVolunteerProfile();
          setVolunteerProfileState({
            name: volunteerProfile.name || defaultVolunteerProfile.name,
            email: volunteerProfile.email || "",
            phone: volunteerProfile.phone || "",
            specialty: volunteerProfile.specialty || "",
            verificationBadge: volunteerProfile.verificationBadge || "",
            responseRadiusKm: String(volunteerProfile.responseRadiusKm || 5)
          });
        } catch {
          setVolunteerProfileState(defaultVolunteerProfile);
        }
        return;
      }

      if (resolvedRole === "CITIZEN" || resolvedRole === "USER" || resolvedRole === "") {
        setAccountType("USER");
        setAuthenticatedRole("USER");
        setAuthStage("authenticated");
        setTab("home");
        setFlow("ready");
        setBanner("");
        try {
          const [userProfile, medicalProfile] = await Promise.all([
            getCitizenUserProfile(),
            getCitizenMedicalProfile()
          ]);
          setCitizenProfileState({
            fullName: userProfile.fullName || defaultCitizenProfile.fullName,
            phone: userProfile.phone || "",
            email: userProfile.email || "",
            bloodType: medicalProfile.bloodType || "",
            conditions: medicalProfile.conditions || "",
            allergies: medicalProfile.allergies || "",
            emergencyContactName: medicalProfile.emergencyContactName || "",
            emergencyContactPhone: medicalProfile.emergencyContactPhone || ""
          });
        } catch {
          setCitizenProfileState((current) => ({
            ...defaultCitizenProfile,
            fullName: current.fullName || defaultCitizenProfile.fullName,
            phone: current.phone || identifier,
            email: current.email
          }));
        }
        return;
      }

      throw new Error(`Unsupported account role: ${resolvedRole}`);
    };

    void (async () => {
      try {
        await Promise.race([
          loginTask(),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(
                  "Sign-in timed out. Check network, run the API, and rescan the latest Expo QR (pnpm run dev:mobile:public if not on the same Wi‑Fi)."
                )
              );
            }, 55_000);
          })
        ]);
      } catch (error) {
        const message = simplifyNetworkError(error instanceof Error ? error.message : "Login failed");
        setBanner(message);
      } finally {
        setAuthSubmitting(false);
      }
    })();
  };

  const handleVolunteerSignup = (input: VolunteerSignupInput) => {
    setAuthSubmitting(true);
    setBanner("Creating volunteer account...");

    const signupTask = async () => {
      await registerVolunteerAccount({
        fullName: input.fullName,
        email: input.email,
        password: input.password,
        phone: input.phone
      });
      const signupAuth = await loginVolunteerAccount({
        identifier: input.phone.trim(),
        password: input.password
      });
      const resolvedRole = String(signupAuth?.user?.role || "").toUpperCase();

      if (resolvedRole === "VOLUNTEER") {
        setAccountType("VOLUNTEER");
        setAuthenticatedRole("VOLUNTEER");
        setAuthStage("authenticated");
        setBanner("");
        try {
          const volunteerProfile = await getVolunteerProfile();
          setVolunteerProfileState({
            name: volunteerProfile.name || input.fullName,
            email: volunteerProfile.email || input.email,
            phone: volunteerProfile.phone || input.phone,
            specialty: volunteerProfile.specialty || input.specialty,
            verificationBadge: volunteerProfile.verificationBadge || "Medical Volunteer",
            responseRadiusKm: String(volunteerProfile.responseRadiusKm || 5)
          });
        } catch {
          setVolunteerProfileState({
            ...defaultVolunteerProfile,
            name: input.fullName,
            email: input.email,
            phone: input.phone,
            specialty: input.specialty
          });
        }
      } else {
        try {
          const [userProfile, medicalProfile] = await Promise.all([
            getCitizenUserProfile(),
            getCitizenMedicalProfile()
          ]);
          setCitizenProfileState({
            fullName: userProfile.fullName || input.fullName,
            phone: userProfile.phone || input.phone,
            email: userProfile.email || input.email,
            bloodType: medicalProfile.bloodType || "",
            conditions: medicalProfile.conditions || "",
            allergies: medicalProfile.allergies || "",
            emergencyContactName: medicalProfile.emergencyContactName || "",
            emergencyContactPhone: medicalProfile.emergencyContactPhone || ""
          });
        } catch {
          setCitizenProfileState((current) => ({
            ...defaultCitizenProfile,
            fullName: current.fullName || input.fullName,
            phone: current.phone || input.phone,
            email: current.email || input.email
          }));
        }
        setAccountType("USER");
        setAuthenticatedRole("USER");
        setAuthStage("authenticated");
        setBanner("This phone number is already linked to a citizen account. Logged in successfully.");
      }
    };

    void (async () => {
      try {
        await Promise.race([
          signupTask(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Sign-up timed out. Check tunnel/network and rescan QR.")), 90_000);
          })
        ]);
      } catch (error) {
        const message = simplifyNetworkError(
          error instanceof Error ? error.message : "Unable to register volunteer account."
        );
        setBanner(message);
      } finally {
        setAuthSubmitting(false);
      }
    })();
  };

  const handleCitizenProfileSave = useCallback(async (payload: CitizenEditableProfile) => {
    await Promise.all([
      updateCitizenUserProfile({
        fullName: payload.fullName,
        phone: payload.phone
      }),
      updateCitizenMedicalProfile({
        bloodType: payload.bloodType,
        conditions: payload.conditions,
        allergies: payload.allergies,
        emergencyContactName: payload.emergencyContactName,
        emergencyContactPhone: payload.emergencyContactPhone
      })
    ]);

    setCitizenProfileState(payload);
  }, []);

  const handleVolunteerProfileSave = useCallback(async (payload: VolunteerEditableProfile) => {
    await updateVolunteerProfile({
      specialty: payload.specialty,
      verificationBadge: payload.verificationBadge,
      responseRadiusKm: Number(payload.responseRadiusKm) || 5
    });

    setVolunteerProfileState(payload);
  }, []);

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
          submitting={authSubmitting}
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
          submitting={authSubmitting}
          onBack={() => setAuthStage("roleSelection")}
          onSwitchToLogin={() => setAuthStage("login")}
          onSubmitUser={(input) => {
            setAuthSubmitting(true);
            setBanner("Creating account...");

            const signupTask = async () => {
              await registerCitizenAccount({
                fullName: input.fullName,
                email: input.email,
                password: input.password,
                phone: input.phone
              });
              const signupAuth = await loginCitizenAccount({
                identifier: input.phone.trim(),
                password: input.password
              });
              const resolvedRole = String(signupAuth?.user?.role || "").toUpperCase();

              if (resolvedRole === "VOLUNTEER") {
                try {
                  const volunteerProfile = await getVolunteerProfile();
                  setVolunteerProfileState({
                    name: volunteerProfile.name || input.fullName,
                    email: volunteerProfile.email || input.email,
                    phone: volunteerProfile.phone || input.phone,
                    specialty: volunteerProfile.specialty || "",
                    verificationBadge: volunteerProfile.verificationBadge || "Medical Volunteer",
                    responseRadiusKm: String(volunteerProfile.responseRadiusKm || 5)
                  });
                } catch {
                  setVolunteerProfileState({
                    ...defaultVolunteerProfile,
                    name: input.fullName,
                    email: input.email,
                    phone: input.phone
                  });
                }
                setAccountType("VOLUNTEER");
                setAuthenticatedRole("VOLUNTEER");
                setBanner("This phone number is linked to a volunteer account. Logged in successfully.");
              } else {
                setCitizenProfileState({
                  fullName: input.fullName,
                  phone: input.phone,
                  email: input.email,
                  bloodType: "",
                  conditions: "",
                  allergies: "",
                  emergencyContactName: input.emergencyContact,
                  emergencyContactPhone: ""
                });
                setAccountType("USER");
                setAuthenticatedRole("USER");
                setBanner("");
              }
              setAuthStage("authenticated");
            };

            void (async () => {
              try {
                await Promise.race([
                  signupTask(),
                  new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error("Sign-up timed out. Check tunnel/network and rescan QR.")), 90_000);
                  })
                ]);
              } catch (error) {
                const message = simplifyNetworkError(
                  error instanceof Error ? error.message : "Unable to create account."
                );
                setBanner(message);
              } finally {
                setAuthSubmitting(false);
              }
            })();
          }}
          onSubmitVolunteer={handleVolunteerSignup}
        />
      );
    }

    return null;
  }, [accountType, authStage, authSubmitting]);

  const citizenContent = useMemo(() => {
    if (tab === "history") {
      return <HistoryScreen items={citizenHistory} />;
    }

    if (tab === "profile") {
      return <ProfileScreen profile={citizenProfileState} onSave={handleCitizenProfileSave} />;
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
            setBanner("Calling emergency center...");

            void (async () => {
              const emergencyId = await initEmergencyFromCall();
              if (!emergencyId) {
                return;
              }

              setPendingAfterCall(true);

              const opened = await callEmergencyNumber();

              if (!opened) {
                setPendingAfterCall(false);
                citizenSocketRef.current?.emit("call_connected", {
                  emergencyId,
                  at: new Date().toISOString()
                });
                return;
              }

              citizenSocketRef.current?.emit("call_connected", {
                emergencyId,
                at: new Date().toISOString()
              });

              // Fallback for environments that do not trigger background/active transitions.
              setTimeout(() => {
                if (!pendingEmergencyAfterCallRef.current) {
                  return;
                }

                setPendingAfterCall(false);
                citizenSocketRef.current?.emit("call_ended", {
                  emergencyId,
                  at: new Date().toISOString()
                });
                setBanner("Call ended. Emergency tracking remains active.");
              }, 8000);
            })();
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
          emergencyAddress={activeCaseSnapshot.address}
          ambulanceEtaMinutes={activeCaseSnapshot.ambulanceEtaMinutes}
          volunteerEtaMinutes={activeCaseSnapshot.volunteerEtaMinutes}
          onBack={() => {
            setFlow("dispatched");
          }}
        />
      );
    }

    return (
      <AmbulanceDispatchedScreen
        caseSnapshot={activeCaseSnapshot}
        liveTracking={trackingState}
        onOpenFirstAid={() => setFlow("firstAid")}
        onSendUpdate={async (message) => {
          if (!activeCaseId) {
            return;
          }
          await sendEmergencyUpdate(activeCaseId, message);
          setBanner("Additional info sent to dispatcher and responders.");
        }}
        onContactVolunteer={() => {
          void Linking.openURL("tel:+911");
        }}
        onOpenSettings={() => setFlow("settings")}
        onEndCase={() => {
          setPendingAfterCall(false);
          activeCallEmergencyIdRef.current = "";
          setActiveCaseId("");
          setActiveCaseSnapshot(defaultCitizenCaseSnapshot);
          setFlow("ready");
          setTab("home");
          setTrackingState((current) => ({
            ...current,
            syncState: "offline"
          }));
          setBanner("Case ended.");
        }}
      />
    );
  }, [
    tab,
    flow,
    activeCaseId,
    trackingState,
    activeCaseSnapshot,
    citizenHistory,
    citizenProfileState,
    handleCitizenProfileSave,
    callEmergencyNumber,
    initEmergencyFromCall,
    startEmergencyRequest
  ]);

  const volunteerContent = useMemo(() => {
    if (volunteerTab === "history") {
      return (
        <VolunteerHistoryScreen
          profile={{
            name: volunteerProfileState.name,
            specialty: volunteerProfileState.specialty,
            verificationBadge: volunteerProfileState.verificationBadge
          }}
          history={volunteerIncidentHistory}
        />
      );
    }

    if (volunteerTab === "profile") {
      return <VolunteerProfileScreen profile={volunteerProfileState} onSave={handleVolunteerProfileSave} />;
    }

    if (volunteerFlow === "settings") {
      return (
        <VolunteerSettingsScreen
          profile={{
            name: volunteerProfileState.name,
            specialty: volunteerProfileState.specialty,
            verificationBadge: volunteerProfileState.verificationBadge
          }}
          onBack={() => {
            setVolunteerFlow("incoming");
          }}
        />
      );
    }

    if (volunteerFlow === "chat") {
      return (
        <VolunteerMedicalChatScreen
          onBackToAlerts={() => {
            setVolunteerFlow("incoming");
          }}
        />
      );
    }

    if (volunteerFlow === "incoming") {
      return (
        <VolunteerAlertsScreen
          available={volunteerAvailable}
          volunteerName={volunteerProfileState.name}
          emergency={volunteerEmergencyState}
          hasActiveEmergency={volunteerHasActiveEmergency}
          onToggleAvailability={async () => {
            const next = !volunteerAvailable;
            setVolunteerAvailable(next);
            try {
              await updateVolunteerAvailability(next);
              setVolunteerBanner(next ? "You are available for nearby incidents." : "You are now off duty.");
            } catch (error) {
              setVolunteerAvailable(!next);
              const message = simplifyNetworkError(
                error instanceof Error ? error.message : "Could not update volunteer availability."
              );
              setVolunteerBanner(message);
            }
          }}
          onEmergencyCall={async () => {
            try {
              if (volunteerHasActiveEmergency) {
                if (!volunteerEmergencyState.caseId) {
                  throw new Error("No active emergency case to accept.");
                }
                if (volunteerEmergencyState.callerDetailsPending) {
                  setVolunteerBanner("لا يمكن قبول الحالة قبل وصول تفاصيل من المتصل أو مركز التوجيه.");
                  return;
                }
                await respondVolunteerToAlert(volunteerEmergencyState.caseId, true);
                setVolunteerHasActiveEmergency(true);
                setVolunteerFlow("accepted");
                setVolunteerBanner("Ambulance call started. Emergency accepted and route started.");
                return;
              }

              const fallbackLocation =
                volunteerPositionRef.current ??
                volunteerCaseLocation ?? {
                  latitude: DEFAULT_BETHLEHEM_LOCATION.latitude,
                  longitude: DEFAULT_BETHLEHEM_LOCATION.longitude
                };

              const initialized = await initVolunteerEmergencyCall({
                location: {
                  latitude: fallbackLocation.latitude,
                  longitude: fallbackLocation.longitude,
                  address: "Volunteer live location"
                },
                callType: "Volunteer Emergency Call"
              });

              const emergencyId = initialized.emergencyId;
              const caseData = initialized.case;

              setVolunteerEmergencyState({
                caseId: emergencyId,
                caseLabel: initialized.caseNumber || caseData?.caseNumber || emergencyId,
                emergencyType: caseData?.emergencyType || "Volunteer Emergency Call",
                etaMinutes: caseData?.ambulanceEtaMinutes ?? 6,
                distanceKm: Math.max(0.5, Number((caseData?.volunteerEtaMinutes ? (caseData.volunteerEtaMinutes * 35) / 60 : 2.5).toFixed(1))),
                ambulanceDispatched: true,
                patientSummary:
                  caseData?.voiceDescription ||
                  caseData?.aiAnalysis ||
                  "Emergency case created by volunteer. Ambulance dispatch is active.",
                urgencyLabel: `${caseData?.priority ?? "CRITICAL"} urgency`,
                safeAccess: caseData?.address || "Live caller location",
                callerDetailsPending: Boolean(caseData?.callerDetailsPending)
              });

              if (
                initialized.location &&
                typeof initialized.location.latitude === "number" &&
                typeof initialized.location.longitude === "number"
              ) {
                const nextCaseLocation = {
                  latitude: Number(initialized.location.latitude),
                  longitude: Number(initialized.location.longitude)
                };
                setVolunteerCaseLocation(nextCaseLocation);
                volunteerPositionRef.current = nextCaseLocation;
              }

              volunteerSocketRef.current?.emit("case:join", emergencyId);
              setVolunteerHasActiveEmergency(true);
              setVolunteerCaseVersion((value) => value + 1);
              setVolunteerFlow("accepted");
              setVolunteerBanner("New emergency case created. Ambulance and responders have been dispatched.");
            } catch (error) {
              const message = simplifyNetworkError(
                error instanceof Error ? error.message : "Could not start ambulance call."
              );
              setVolunteerBanner(message);
            }
          }}
          onRejectEmergencyCall={async () => {
            if (!volunteerEmergencyState.caseId) {
              return;
            }
            await respondVolunteerToAlert(volunteerEmergencyState.caseId, false);
            lastSyncedVolunteerCaseIdRef.current = "";
            lastVolunteerCallerDetailsPendingRef.current = false;
            setVolunteerHasActiveEmergency(false);
            setVolunteerEmergencyState(defaultVolunteerEmergencyState);
            setVolunteerAmbulanceLocation(null);
            setVolunteerBanner("Emergency request declined. Another nearby volunteer will be alerted.");
          }}
          onCallAnotherVolunteer={() => {
            setVolunteerBanner("Backup volunteer request sent to nearby responders.");
          }}
          onOpenSettings={() => {
            setVolunteerFlow("settings");
          }}
          onOpenMedicalChat={() => {
            setVolunteerFlow("chat");
            setVolunteerBanner("Medical Guidance Chat opened. Incident response actions remain in Alerts.");
          }}
        />
      );
    }

    if (volunteerFlow === "accepted") {
      return (
        <VolunteerAcceptedScreen
          emergency={{
            ...volunteerEmergencyState,
            patientLocation: volunteerCaseLocation ?? undefined,
            volunteerLocation: volunteerLiveLocation ?? volunteerDeviceLocationRef.current ?? undefined,
            ambulanceLocation: volunteerAmbulanceLocation ?? undefined
          }}
          onStartProgress={() => {
            setVolunteerFlow("inProgress");
            setVolunteerBanner("Response in progress. Keep dispatcher informed.");
          }}
        />
      );
    }

    return (
      <VolunteerInProgressScreen
        etaMinutes={volunteerEmergencyState.etaMinutes}
        onBackToAccepted={() => setVolunteerFlow("accepted")}
      />
    );
  }, [
    volunteerTab,
    volunteerFlow,
    volunteerAvailable,
    volunteerCaseVersion,
    volunteerHasActiveEmergency,
    volunteerCaseLocation,
    volunteerLiveLocation,
    volunteerAmbulanceLocation,
    volunteerProfileState,
    handleVolunteerProfileSave,
    volunteerEmergencyState,
    volunteerIncidentHistory
  ]);

  if (authStage !== "authenticated") {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        {authContent}

        <View style={styles.buildBadge} pointerEvents="box-none">
          <Text style={styles.buildBadgeText}>Build {APP_BUILD_TAG}</Text>
          <Pressable
            onPress={handleForceRefresh}
            disabled={updateBusy}
            style={({ pressed }) => [
              styles.buildBadgeButton,
              pressed ? styles.buildBadgeButtonPressed : null,
              updateBusy ? styles.buildBadgeButtonDisabled : null
            ]}
          >
            <Text style={styles.buildBadgeButtonText}>
              {updateBusy ? "Updating..." : "Force Refresh App"}
            </Text>
          </Pressable>
          {updateStatus ? <Text style={styles.buildBadgeStatus}>{updateStatus}</Text> : null}
        </View>

        {banner ? (
          <View style={styles.authBanner}>
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (authenticatedRole === "VOLUNTEER") {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />

        {volunteerContent}

        {volunteerBanner ? (
          <View style={styles.volunteerBanner}>
            <Text style={styles.volunteerBannerText}>{volunteerBanner}</Text>
          </View>
        ) : null}

        <VolunteerBottomNav
          activeTab={volunteerTab}
          onChange={(nextTab) => {
            setVolunteerTab(nextTab);
            if (nextTab !== "alerts") {
              return;
            }

            if (volunteerFlow === "chat" || volunteerFlow === "settings") {
              setVolunteerFlow("incoming");
            }
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {citizenContent}

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
  authBanner: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: "#1A314B",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  buildBadge: {
    position: "absolute",
    top: 4,
    right: 8,
    alignItems: "flex-end",
    gap: 4
  },
  buildBadgeText: {
    fontSize: 10,
    color: "#6B7B8F",
    fontWeight: "600"
  },
  buildBadgeButton: {
    backgroundColor: "#1A4F7A",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  buildBadgeButtonPressed: {
    opacity: 0.7
  },
  buildBadgeButtonDisabled: {
    opacity: 0.5
  },
  buildBadgeButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700"
  },
  buildBadgeStatus: {
    fontSize: 10,
    color: "#1A4F7A",
    maxWidth: 200,
    textAlign: "right"
  },
  bannerText: {
    color: "#E7F0FB",
    fontSize: 13,
    textAlign: "center"
  },
  volunteerBanner: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 98,
    backgroundColor: "#133B35",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  volunteerBannerText: {
    color: "#E5F7EF",
    textAlign: "center",
    fontSize: 13
  }
});
