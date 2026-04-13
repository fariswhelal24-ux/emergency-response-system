import { useEffect, useMemo, useState } from "react";

import { MetricCard } from "./components/common/MetricCard";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { AmbulanceAssignmentPage } from "./pages/AmbulanceAssignmentPage";
import { CaseDetailsPage } from "./pages/CaseDetailsPage";
import { LiveTrackingPage } from "./pages/LiveTrackingPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ReportsPage } from "./pages/ReportsPage";
import { VolunteerCoordinationPage } from "./pages/VolunteerCoordinationPage";
import {
  assignAmbulance,
  assignVolunteer,
  closeCase,
  RealtimeAmbulanceUpdate,
  RealtimeCallStateUpdate,
  RealtimeLocationUpdate,
  createRealtimeConnection,
  getCaseDetails,
  getDashboardOverview,
  getReportsSummary
} from "./services/api";
import {
  ActiveCase,
  AvailableVolunteerSummary,
  CaseDetail,
  DashboardStats,
  DashboardView,
  RegisteredVolunteerSummary,
  ReportPoint
} from "./types";

const defaultStats: DashboardStats = {
  activeCases: 0,
  ambulancesAvailable: 0,
  volunteersAvailable: 0,
  highPriorityIncidents: 0
};

type LiveSyncCaseState = {
  caseId: string;
  statusText?: string;
  volunteerLocation?: { latitude: number; longitude: number; recordedAt?: string };
  ambulanceLocation?: { latitude: number; longitude: number; etaMinutes?: number; recordedAt?: string };
  citizenLocation?: { latitude: number; longitude: number; recordedAt?: string };
  ambulanceRoute?: Array<{ latitude: number; longitude: number }>;
  updatedAt: string;
};

export default function App() {
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [cases, setCases] = useState<ActiveCase[]>([]);
  const [availableVolunteers, setAvailableVolunteers] = useState<AvailableVolunteerSummary[]>([]);
  const [registeredVolunteers, setRegisteredVolunteers] = useState<RegisteredVolunteerSummary[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | undefined>(undefined);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | undefined>(undefined);
  const [reports, setReports] = useState<ReportPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<string>("--");
  const [banner, setBanner] = useState<string>("");
  const [liveSyncByCase, setLiveSyncByCase] = useState<Record<string, LiveSyncCaseState>>({});

  const selectedCaseNumber = useMemo(() => {
    const selected = cases.find((item) => item.id === selectedCaseId);
    return selected?.caseNumber;
  }, [cases, selectedCaseId]);

  const selectedCaseLiveSync = useMemo(() => {
    if (!selectedCaseId) {
      return undefined;
    }

    return liveSyncByCase[selectedCaseId];
  }, [liveSyncByCase, selectedCaseId]);

  const patchLiveSyncCase = (caseId: string, patch: Partial<LiveSyncCaseState>) => {
    setLiveSyncByCase((current) => {
      const existing = current[caseId];
      return {
        ...current,
        [caseId]: {
          ...existing,
          ...patch,
          caseId,
          updatedAt: new Date().toISOString()
        }
      };
    });
  };

  const refreshOverview = async (preferredCaseId?: string) => {
    const overview = await getDashboardOverview();
    setStats(overview.stats);
    setCases(overview.activeCases);
    setAvailableVolunteers(overview.availableVolunteers ?? []);
    setRegisteredVolunteers(overview.registeredVolunteers ?? []);
    setSelectedCaseId((current) => {
      const preferred = preferredCaseId ?? current;
      if (preferred && overview.activeCases.some((item) => item.id === preferred)) {
        return preferred;
      }

      return overview.activeCases[0]?.id;
    });
    setRefreshedAt(new Date().toLocaleTimeString());
  };

  const refreshReports = async () => {
    const data = await getReportsSummary();
    setReports(data);
  };

  const handleCaseFlowUpdated = async (caseId?: string) => {
    await refreshOverview(caseId);
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      await Promise.all([refreshOverview(), refreshReports()]);

      if (!active) {
        return;
      }

      setLoading(false);
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshOverview();
    }, 8000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedCaseId) {
      setCaseDetail(undefined);
      return;
    }

    let active = true;

    const fetchDetail = async () => {
      const detail = await getCaseDetails(selectedCaseId);

      if (!active) {
        return;
      }

      setCaseDetail(detail);
    };

    void fetchDetail();

    return () => {
      active = false;
    };
  }, [selectedCaseId]);

  useEffect(() => {
    const socket = createRealtimeConnection({
      onEmergencyCreated: (payload?: unknown) => {
        const caseId =
          typeof payload === "object" && payload && "id" in payload
            ? (payload as { id?: string }).id
            : undefined;
        if (caseId) {
          patchLiveSyncCase(caseId, {
            statusText: "Searching nearest responders..."
          });
        }
        void refreshOverview();
      },
      onStatusChanged: (payload?: unknown) => {
        const caseId =
          typeof payload === "object" && payload && "caseId" in payload
            ? (payload as { caseId?: string }).caseId
            : undefined;
        const status =
          typeof payload === "object" && payload && "status" in payload
            ? (payload as { status?: string }).status
            : undefined;
        if (caseId && status) {
          patchLiveSyncCase(caseId, {
            statusText: status
          });
        }
        void refreshOverview();
      },
      onCaseUpdated: (payload?: unknown) => {
        const caseId =
          typeof payload === "object" && payload && "caseId" in payload
            ? (payload as { caseId?: string }).caseId
            : selectedCaseId;
        if (caseId) {
          patchLiveSyncCase(caseId, {});
        }
        void refreshOverview();
        if (selectedCaseId) {
          void getCaseDetails(selectedCaseId).then(setCaseDetail);
        }
      },
      onVolunteerRequested: (payload?: unknown) => {
        const caseId =
          typeof payload === "object" && payload && "caseId" in payload
            ? (payload as { caseId?: string }).caseId
            : undefined;
        if (caseId) {
          patchLiveSyncCase(caseId, {
            statusText: "Volunteer requested"
          });
          setBanner("Nearest volunteers have been alerted.");
        }
      },
      onVolunteerAccepted: (payload?: unknown) => {
        const caseId =
          typeof payload === "object" && payload && "caseId" in payload
            ? (payload as { caseId?: string }).caseId
            : undefined;
        if (caseId) {
          patchLiveSyncCase(caseId, {
            statusText: "Volunteer accepted"
          });
          setBanner("A volunteer accepted and is heading to the patient.");
        }
      },
      onVolunteerAvailabilityChanged: () => {
        void refreshOverview();
      },
      onLocationUpdate: (payload: RealtimeLocationUpdate) => {
        const timestamp = payload.location.recordedAt ?? new Date().toISOString();

        if (payload.location.actorType === "VOLUNTEER") {
          patchLiveSyncCase(payload.caseId, {
            volunteerLocation: {
              latitude: payload.location.latitude,
              longitude: payload.location.longitude,
              recordedAt: timestamp
            }
          });
          return;
        }

        if (payload.location.actorType === "AMBULANCE") {
          patchLiveSyncCase(payload.caseId, {
            ambulanceLocation: {
              latitude: payload.location.latitude,
              longitude: payload.location.longitude,
              etaMinutes: payload.location.etaMinutes ?? undefined,
              recordedAt: timestamp
            },
            statusText: "Help is on the way"
          });
          return;
        }

        if (payload.location.actorType === "CITIZEN") {
          patchLiveSyncCase(payload.caseId, {
            citizenLocation: {
              latitude: payload.location.latitude,
              longitude: payload.location.longitude,
              recordedAt: timestamp
            }
          });
        }
      },
      onAmbulanceUpdate: (payload: RealtimeAmbulanceUpdate) => {
        patchLiveSyncCase(payload.caseId, {
          ambulanceLocation: {
            latitude: payload.ambulance.latitude,
            longitude: payload.ambulance.longitude,
            etaMinutes: payload.ambulance.etaMinutes,
            recordedAt: payload.ambulance.updatedAt
          },
          ambulanceRoute: payload.route,
          statusText: payload.ambulance.status === "arrived" ? "Ambulance arrived" : "Help is on the way"
        });
      },
      onCallStarted: (payload: RealtimeCallStateUpdate) => {
        const emergencyId = payload.emergencyId || payload.caseId;
        if (!emergencyId) {
          return;
        }

        setActiveView("overview");
        setSelectedCaseId(emergencyId);
        patchLiveSyncCase(emergencyId, {
          statusText: "Call started - AI listening active"
        });
        setBanner(`Incoming call linked to case ${emergencyId}.`);
        void refreshOverview();
      },
      onCallConnected: (payload: RealtimeCallStateUpdate) => {
        const emergencyId = payload.emergencyId || payload.caseId;
        if (!emergencyId) {
          return;
        }

        patchLiveSyncCase(emergencyId, {
          statusText: "Call connected"
        });
      },
      onCallEnded: (payload: RealtimeCallStateUpdate) => {
        const emergencyId = payload.emergencyId || payload.caseId;
        if (!emergencyId) {
          return;
        }

        patchLiveSyncCase(emergencyId, {
          statusText: "Call ended - processing AI timeline"
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedCaseId]);

  const renderPage = () => {
    const handleAssignAmbulance = async (ambulanceId: string) => {
      if (!selectedCaseId) {
        return;
      }

      await assignAmbulance(selectedCaseId, ambulanceId);
      setBanner(`Ambulance ${ambulanceId} assigned to case.`);
      await refreshOverview();
      const detail = await getCaseDetails(selectedCaseId);
      setCaseDetail(detail);
    };

    const handleNotifyVolunteer = async (volunteerId: string) => {
      if (!selectedCaseId) {
        return;
      }

      await assignVolunteer(selectedCaseId, volunteerId);
      const volunteerName =
        caseDetail?.nearby?.volunteers?.find((item) => item.volunteerId === volunteerId)?.name ??
        registeredVolunteers.find((item) => item.volunteerId === volunteerId)?.name ??
        availableVolunteers.find((item) => item.volunteerId === volunteerId)?.name ??
        volunteerId;
      setBanner(`Volunteer ${volunteerName} notified.`);
      await refreshOverview();
      const detail = await getCaseDetails(selectedCaseId);
      setCaseDetail(detail);
    };

    if (activeView === "overview") {
      return (
        <OverviewPage
          stats={stats}
          cases={cases}
          availableVolunteers={availableVolunteers}
          registeredVolunteers={registeredVolunteers}
          selectedCaseId={selectedCaseId}
          liveSync={selectedCaseLiveSync}
          onSelectCase={setSelectedCaseId}
          onCaseFlowUpdated={handleCaseFlowUpdated}
          onOpenCaseDetails={() => setActiveView("caseDetails")}
          onOpenAmbulance={() => setActiveView("ambulanceAssignment")}
          onOpenVolunteers={() => setActiveView("volunteerCoordination")}
        />
      );
    }

    if (activeView === "caseDetails") {
      return (
        <CaseDetailsPage
          detail={caseDetail}
          onOpenAmbulance={() => setActiveView("ambulanceAssignment")}
          onOpenVolunteers={() => setActiveView("volunteerCoordination")}
          onAssignAmbulance={handleAssignAmbulance}
          onNotifyVolunteer={handleNotifyVolunteer}
        />
      );
    }

    if (activeView === "ambulanceAssignment") {
      return (
        <AmbulanceAssignmentPage
          detail={caseDetail}
          onAssign={handleAssignAmbulance}
        />
      );
    }

    if (activeView === "volunteerCoordination") {
      return (
        <VolunteerCoordinationPage
          detail={caseDetail}
          onNotify={handleNotifyVolunteer}
        />
      );
    }

    if (activeView === "liveTracking") {
      return (
        <LiveTrackingPage
          detail={caseDetail}
          liveSync={selectedCaseLiveSync}
          onCloseCase={() => setActiveView("reports")}
        />
      );
    }

    return (
      <ReportsPage
        reports={reports}
        onCloseCase={async (payload) => {
          if (!selectedCaseId) {
            return;
          }

          await closeCase(selectedCaseId, payload);
          setBanner("Case closed and report generated.");
          await Promise.all([refreshOverview(), refreshReports()]);
          const detail = await getCaseDetails(selectedCaseId);
          setCaseDetail(detail);
        }}
      />
    );
  };

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onChange={setActiveView} />

      <main className="app-main">
        <TopBar activeCaseNumber={selectedCaseNumber} refreshedAt={refreshedAt} />

        {banner ? <div className="banner">{banner}</div> : null}

        {loading ? (
          <section className="loading-grid">
            <MetricCard label="Loading" value="..." />
            <MetricCard label="Dispatch" value="Syncing" tone="info" />
          </section>
        ) : (
          renderPage()
        )}
      </main>
    </div>
  );
}
