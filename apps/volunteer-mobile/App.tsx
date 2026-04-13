import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { io, Socket } from "socket.io-client";

import { BottomNav } from "./src/components/BottomNav";
import {
  ensureVolunteerAuthToken,
  fetchLatestVolunteerEmergency,
  getVolunteerSocketBaseUrl,
  getVolunteerProfile,
  initVolunteerEmergencyCall,
  listVolunteerIncidents,
  loginVolunteerAccount,
  registerVolunteerAccount,
  respondToAlert,
  sendVolunteerLocationUpdate,
  type VolunteerEmergencyCase,
  updateVolunteerProfile,
  updateAvailability
} from "./src/services/api";
import { AcceptedScreen } from "./src/screens/AcceptedScreen";
import { AlertsScreen } from "./src/screens/AlertsScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { InProgressScreen } from "./src/screens/InProgressScreen";
import { MedicalChatScreen } from "./src/screens/MedicalChatScreen";
import { ProfileScreen, VolunteerEditableProfile } from "./src/screens/ProfileScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { LoginScreen } from "./src/screens/auth/LoginScreen";
import { RoleSelectionScreen } from "./src/screens/auth/RoleSelectionScreen";
import { SignupScreen } from "./src/screens/auth/SignupScreen";
import { SplashScreen } from "./src/screens/auth/SplashScreen";
import { colors, radius, spacing } from "./src/theme/tokens";
import { AlertFlow, VolunteerTab } from "./src/types";
import { AccountType, AuthStage, LoginInput, VolunteerSignupInput } from "./src/types/auth";

const splashDurationMs = 1200;

const simplifyNetworkError = (message: string): string => {
  const text = message.trim().replace(/\s*\(base:[^)]+\)\s*$/i, "");
  if (/citizen account.*volunteer app|not a volunteer account|registered as a citizen/i.test(text)) {
    return "This login is a citizen account. Use QR from: pnpm run dev:public:unified — choose Volunteer, then log in or sign up as a volunteer.";
  }
  if (/invalid login or password/i.test(text)) {
    return "Login failed. Check phone/email and password, or create a new account.";
  }
  if (/tunnel unavailable|http 503|bad gateway|gateway timeout/i.test(text)) {
    return "Tunnel failed (common with localtunnel). Install cloudflared: brew install cloudflared — then run pnpm run dev:public:volunteer-app or dev:public:unified, scan the new QR.";
  }
  if (/cannot reach api server|network request failed|failed to fetch|load failed/i.test(text)) {
    return "Cannot reach the server. Start the API. External network: pnpm run dev:public:volunteer-app (port 8081 free), scan QR, reopen app. Same Wi‑Fi: pnpm run dev:volunteer:phone.";
  }
  return text;
};

type GeoPoint = {
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
  location: GeoPoint;
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
    location: {
      latitude,
      longitude
    }
  };
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
  safeAccess: "Live caller location"
};

export default function App() {
  const [tab, setTab] = useState<VolunteerTab>("alerts");
  const [flow, setFlow] = useState<AlertFlow>("incoming");
  const [available, setAvailable] = useState(true);
  const [banner, setBanner] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [activeCaseVersion, setActiveCaseVersion] = useState(0);
  const [hasActiveEmergency, setHasActiveEmergency] = useState(false);
  const [incidentHistory, setIncidentHistory] = useState<
    Array<{ id: string; emergencyType: string; address: string; responseTime: string; outcome: string }>
  >([]);
  const [activeEmergencyState, setActiveEmergencyState] = useState<VolunteerEmergencyState>(
    defaultVolunteerEmergencyState
  );

  const [authStage, setAuthStage] = useState<AuthStage>("splash");
  const [accountType, setAccountType] = useState<AccountType>("VOLUNTEER");
  const [authenticatedRole, setAuthenticatedRole] = useState<AccountType | null>(null);
  const [volunteerProfileState, setVolunteerProfileState] =
    useState<VolunteerEditableProfile>(defaultVolunteerProfile);
  const [activeCaseLocation, setActiveCaseLocation] = useState<GeoPoint | null>(null);
  const lastSyncedCaseIdRef = useRef<string>("");
  const volunteerSocketRef = useRef<Socket | null>(null);
  const volunteerPositionRef = useRef<GeoPoint | null>(null);

  const applyIncomingEmergencyState = useCallback((incoming: VolunteerIncomingEmergency) => {
    const summary =
      incoming.voiceDescription ||
      incoming.aiAnalysis ||
      incoming.transcriptionText ||
      "Emergency case requires immediate medical response.";
    const volunteerEta = incoming.volunteerEtaMinutes ?? 5;
    const estimatedDistanceKm = Math.max(0.5, Number(((volunteerEta * 35) / 60).toFixed(1)));
    const urgencyLabel = `${incoming.priority} urgency`;
    const isNewCase = lastSyncedCaseIdRef.current !== incoming.id;

    setActiveEmergencyState({
      caseId: incoming.id,
      caseLabel: incoming.caseNumber,
      emergencyType: incoming.emergencyType,
      etaMinutes: volunteerEta,
      distanceKm: estimatedDistanceKm,
      ambulanceDispatched: true,
      patientSummary: summary,
      urgencyLabel,
      safeAccess: incoming.address
    });
    setActiveCaseLocation({
      latitude: incoming.location.latitude,
      longitude: incoming.location.longitude
    });
    setHasActiveEmergency(true);
    setActiveCaseVersion((value) => value + 1);
    setTab("alerts");
    setFlow("incoming");
    if (isNewCase) {
      setBanner(`New emergency alert: ${incoming.emergencyType}`);
    }
    lastSyncedCaseIdRef.current = incoming.id;
  }, []);

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
          setBanner(message);
        }
        return;
      }

      if (cancelled) {
        return;
      }

      if (!incoming) {
        // Keep alert visible until volunteer explicitly accepts/rejects.
        if (flow === "incoming" && hasActiveEmergency) {
          return;
        }
        setHasActiveEmergency(false);
        setActiveEmergencyState(defaultVolunteerEmergencyState);
        lastSyncedCaseIdRef.current = "";
        return;
      }
      applyIncomingEmergencyState(incoming);
    };

    void syncIncomingCase();

    const timer = setInterval(() => {
      void syncIncomingCase();
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [authStage, authenticatedRole, applyIncomingEmergencyState, flow, hasActiveEmergency]);

  useEffect(() => {
    if (authStage !== "authenticated" || authenticatedRole !== "VOLUNTEER") {
      return;
    }

    void updateAvailability(true).catch((error) => {
      const message = simplifyNetworkError(
        error instanceof Error ? error.message : "Could not set volunteer availability."
      );
      setBanner(message);
    });
  }, [authStage, authenticatedRole]);

  useEffect(() => {
    if (authStage !== "authenticated" || authenticatedRole !== "VOLUNTEER") {
      return;
    }

    let cancelled = false;

    const syncIncidents = async () => {
      try {
        const rows = await listVolunteerIncidents();
        if (cancelled) {
          return;
        }
        setIncidentHistory(
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
          setIncidentHistory([]);
        }
      }
    };

    void syncIncidents();
    const timer = setInterval(() => {
      void syncIncidents();
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

    const syncFromSocketSignal = async () => {
      let incoming: VolunteerEmergencyCase | null = null;
      try {
        incoming = await fetchLatestVolunteerEmergency();
      } catch (error) {
        if (!disposed) {
          const message = simplifyNetworkError(
            error instanceof Error ? error.message : "Could not sync volunteer emergency from realtime signal."
          );
          setBanner(message);
        }
        return;
      }

      if (disposed) {
        return;
      }

      if (!incoming) {
        // Keep alert visible until volunteer explicitly accepts/rejects.
        if (flow === "incoming" && hasActiveEmergency) {
          return;
        }
        setHasActiveEmergency(false);
        setActiveEmergencyState(defaultVolunteerEmergencyState);
        lastSyncedCaseIdRef.current = "";
        return;
      }

      applyIncomingEmergencyState(incoming);
      socket?.emit("case:join", incoming.id);
    };

    const handleRealtimeEmergency = (payload: unknown) => {
      const incoming = toVolunteerEmergencyFromSocket(payload);

      if (incoming) {
        applyIncomingEmergencyState(incoming);
        socket?.emit("case:join", incoming.id);
      }

      void syncFromSocketSignal();
    };

    const connectRealtime = async () => {
      try {
        const [token, socketBaseUrl] = await Promise.all([ensureVolunteerAuthToken(), getVolunteerSocketBaseUrl()]);
        if (disposed) {
          return;
        }

        socket = io(socketBaseUrl, {
          transports: ["websocket", "polling"],
          autoConnect: true,
          auth: { token }
        });
        volunteerSocketRef.current = socket;

        socket.on("connect", () => {
          const caseIdToJoin = lastSyncedCaseIdRef.current || activeEmergencyState.caseId;
          if (caseIdToJoin) {
            socket?.emit("case:join", caseIdToJoin);
          }
        });

        socket.on("emergency_created", handleRealtimeEmergency);
        socket.on("volunteer_requested", handleRealtimeEmergency);
        socket.on("emergency:update", handleRealtimeEmergency);

        socket.on("volunteer_accepted", (payload: { caseId?: string }) => {
          if (payload?.caseId && payload.caseId === activeEmergencyState.caseId) {
            setBanner("Case accepted. Proceed to patient location.");
          }
        });

        socket.on(
          "ambulance_update",
          (payload: { caseId?: string; ambulance?: { etaMinutes?: number; status?: string } }) => {
            if (payload?.caseId !== activeEmergencyState.caseId || !payload.ambulance) {
              return;
            }

            if (payload.ambulance.status === "arrived") {
              setBanner("Ambulance has arrived at the incident location.");
              return;
            }

            if (typeof payload.ambulance.etaMinutes === "number") {
              setBanner(`Ambulance ETA: ${payload.ambulance.etaMinutes} min`);
            }
          }
        );
      } catch {
        if (!disposed) {
          setBanner("Realtime sync unavailable. Using automatic refresh.");
        }
      }
    };

    void connectRealtime();

    return () => {
      disposed = true;

      if (socket) {
        if (activeEmergencyState.caseId) {
          socket.emit("case:leave", activeEmergencyState.caseId);
        }
        socket.disconnect();
      }

      if (volunteerSocketRef.current === socket) {
        volunteerSocketRef.current = null;
      }
    };
  }, [authStage, authenticatedRole, applyIncomingEmergencyState, flow, hasActiveEmergency, activeEmergencyState.caseId]);

  useEffect(() => {
    if (authStage !== "authenticated" || authenticatedRole !== "VOLUNTEER") {
      return;
    }

    let closed = false;
    let watcher: Location.LocationSubscription | null = null;

    const startLocationTracking = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          setBanner("Location permission is required for live volunteer dispatch.");
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        const initialPosition = {
          latitude: Number(current.coords.latitude.toFixed(7)),
          longitude: Number(current.coords.longitude.toFixed(7))
        };
        if (closed) {
          return;
        }

        volunteerPositionRef.current = initialPosition;

        watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 6000,
            distanceInterval: 5
          },
          (position) => {
            const nextPosition = {
              latitude: Number(position.coords.latitude.toFixed(7)),
              longitude: Number(position.coords.longitude.toFixed(7))
            };

            volunteerPositionRef.current = nextPosition;
            const caseId =
              (flow === "accepted" || flow === "inProgress") && activeEmergencyState.caseId
                ? activeEmergencyState.caseId
                : undefined;

            volunteerSocketRef.current?.emit("location_update", {
              caseId,
              actorType: "VOLUNTEER",
              latitude: nextPosition.latitude,
              longitude: nextPosition.longitude
            });

            void sendVolunteerLocationUpdate({
              caseId,
              latitude: nextPosition.latitude,
              longitude: nextPosition.longitude
            }).catch(() => undefined);
          }
        );
      } catch (error) {
        const message = simplifyNetworkError(
          error instanceof Error ? error.message : "Could not start volunteer GPS tracking."
        );
        setBanner(message);
      }
    };

    void startLocationTracking();

    return () => {
      closed = true;
      watcher?.remove();
    };
  }, [authStage, authenticatedRole, flow]);

  const restartAuthFlow = () => {
    setAuthStage("roleSelection");
    setAccountType("VOLUNTEER");
    setAuthenticatedRole(null);
    setBanner("");
  };

  const handleLogin = (input: LoginInput) => {
    setAuthSubmitting(true);
    setBanner("Signing in...");

    const loginTask = async () => {
      const authData = await loginVolunteerAccount({
        identifier: input.identifier.trim(),
        password: input.password
      });
      const role = String(authData?.user?.role || "").toUpperCase();
      if (role === "CITIZEN" || role === "USER") {
        throw new Error(
          "This login is registered as a citizen, not a volunteer. Use the unified app QR (pnpm run dev:public:unified), choose Volunteer, then sign up or log in."
        );
      }
      if (role !== "VOLUNTEER" && role !== "") {
        throw new Error(`Only volunteer accounts can use this app (your role: ${role}).`);
      }

      setAuthenticatedRole("VOLUNTEER");
      setAuthStage("authenticated");
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
        if (role === "") {
          setAuthStage("login");
          setAuthenticatedRole(null);
          throw new Error(
            "Could not load volunteer profile. You may be using a citizen account — use dev:public:unified QR, pick Volunteer, and register or log in as a volunteer."
          );
        }
        setVolunteerProfileState(defaultVolunteerProfile);
      }
    };

    void (async () => {
      try {
        await Promise.race([
          loginTask(),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(
                  "Sign-in timed out. Check network, run dev:public:volunteer-app with cloudflared (brew install cloudflared), scan the latest QR."
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
          error instanceof Error ? error.message : "Unable to create volunteer account."
        );
        setBanner(message);
      } finally {
        setAuthSubmitting(false);
      }
    })();
  };

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
          onSubmitUser={() => {
            setAuthenticatedRole("USER");
            setAuthStage("authenticated");
          }}
          onSubmitVolunteer={handleVolunteerSignup}
        />
      );
    }
    return null;
  }, [accountType, authStage, authSubmitting]);

  const mainContent = useMemo(() => {
    if (tab === "history") {
      return (
        <HistoryScreen
          profile={{
            name: volunteerProfileState.name,
            specialty: volunteerProfileState.specialty,
            verificationBadge: volunteerProfileState.verificationBadge
          }}
          history={incidentHistory}
        />
      );
    }

    if (tab === "profile") {
      return <ProfileScreen profile={volunteerProfileState} onSave={handleVolunteerProfileSave} />;
    }

    if (flow === "settings") {
      return (
        <SettingsScreen
          profile={{
            name: volunteerProfileState.name,
            specialty: volunteerProfileState.specialty,
            verificationBadge: volunteerProfileState.verificationBadge
          }}
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
          volunteerName={volunteerProfileState.name}
          emergency={{
            caseId: activeEmergencyState.caseId,
            caseLabel: activeEmergencyState.caseLabel,
            emergencyType: activeEmergencyState.emergencyType,
            distanceKm: activeEmergencyState.distanceKm,
            etaMinutes: activeEmergencyState.etaMinutes,
            patientSummary: activeEmergencyState.patientSummary,
            urgencyLabel: activeEmergencyState.urgencyLabel,
            safeAccess: activeEmergencyState.safeAccess
          }}
          hasActiveEmergency={hasActiveEmergency}
          onToggleAvailability={async () => {
            const next = !available;
            setAvailable(next);
            try {
              await updateAvailability(next);
              setBanner(next ? "You are available for nearby incidents." : "You are now off duty.");
            } catch (error) {
              setAvailable(!next);
              const message = simplifyNetworkError(
                error instanceof Error ? error.message : "Could not update availability."
              );
              setBanner(message);
            }
          }}
          onEmergencyCall={async () => {
            try {
              if (hasActiveEmergency) {
                if (!activeEmergencyState.caseId) {
                  throw new Error("No active emergency case to accept.");
                }
                await respondToAlert(activeEmergencyState.caseId, true);
                setHasActiveEmergency(true);
                setFlow("accepted");
                setBanner("Ambulance call started. Emergency accepted and route started.");
                return;
              }

              const fallbackLocation =
                volunteerPositionRef.current ??
                activeCaseLocation ?? {
                  latitude: 31.7054,
                  longitude: 35.2024
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

              setActiveEmergencyState({
                caseId: emergencyId,
                caseLabel: initialized.caseNumber || caseData?.caseNumber || emergencyId,
                emergencyType: caseData?.emergencyType || "Volunteer Emergency Call",
                etaMinutes: caseData?.ambulanceEtaMinutes ?? 6,
                distanceKm: Math.max(
                  0.5,
                  Number(
                    (
                      caseData?.volunteerEtaMinutes ? (caseData.volunteerEtaMinutes * 35) / 60 : 2.5
                    ).toFixed(1)
                  )
                ),
                ambulanceDispatched: true,
                patientSummary:
                  caseData?.voiceDescription ||
                  caseData?.aiAnalysis ||
                  "Emergency case created by volunteer. Ambulance dispatch is active.",
                urgencyLabel: `${caseData?.priority ?? "CRITICAL"} urgency`,
                safeAccess: caseData?.address || "Live caller location"
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
                setActiveCaseLocation(nextCaseLocation);
                volunteerPositionRef.current = nextCaseLocation;
              }

              volunteerSocketRef.current?.emit("case:join", emergencyId);
              setHasActiveEmergency(true);
              setActiveCaseVersion((value) => value + 1);
              setFlow("accepted");
              setBanner("New emergency case created. Ambulance and responders have been dispatched.");
            } catch (error) {
              const message = simplifyNetworkError(
                error instanceof Error ? error.message : "Could not start ambulance call."
              );
              setBanner(message);
            }
          }}
          onRejectEmergencyCall={async () => {
            if (!activeEmergencyState.caseId) {
              return;
            }
            await respondToAlert(activeEmergencyState.caseId, false);
            lastSyncedCaseIdRef.current = "";
            setHasActiveEmergency(false);
            setActiveEmergencyState(defaultVolunteerEmergencyState);
            setBanner("Emergency request declined. Another nearby volunteer will be alerted.");
          }}
          onCallAnotherVolunteer={() => {
            setBanner("Backup volunteer request sent to nearby responders.");
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
          emergency={{
            etaMinutes: activeEmergencyState.etaMinutes,
            urgencyLabel: activeEmergencyState.urgencyLabel,
            emergencyType: activeEmergencyState.emergencyType,
            distanceKm: activeEmergencyState.distanceKm,
            ambulanceDispatched: activeEmergencyState.ambulanceDispatched,
            patientSummary: activeEmergencyState.patientSummary,
            safeAccess: activeEmergencyState.safeAccess
          }}
          onStartProgress={() => {
            setFlow("inProgress");
            setBanner("Response in progress. Keep dispatcher informed.");
          }}
        />
      );
    }

    return <InProgressScreen etaMinutes={activeEmergencyState.etaMinutes} onBackToAccepted={() => setFlow("accepted")} />;
  }, [
    tab,
    flow,
    available,
    activeCaseVersion,
    hasActiveEmergency,
    handleVolunteerProfileSave,
    volunteerProfileState,
    incidentHistory
  ]);

  if (authStage !== "authenticated") {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        {authContent}
        {banner ? (
          <View style={styles.authBanner}>
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        ) : null}
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
  authBanner: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
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
