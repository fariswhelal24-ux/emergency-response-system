import { useEffect, useMemo, useState } from "react";

import { MetricCard } from "./components/common/MetricCard";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { mockReports } from "./data/mockDashboard";
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
  createRealtimeConnection,
  getCaseDetails,
  getDashboardOverview,
  getReportsSummary
} from "./services/api";
import { ActiveCase, CaseDetail, DashboardStats, DashboardView, ReportPoint } from "./types";

const defaultStats: DashboardStats = {
  activeCases: 0,
  ambulancesAvailable: 0,
  volunteersAvailable: 0,
  highPriorityIncidents: 0
};

export default function App() {
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [cases, setCases] = useState<ActiveCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | undefined>(undefined);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | undefined>(undefined);
  const [reports, setReports] = useState<ReportPoint[]>(mockReports);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<string>("--");
  const [banner, setBanner] = useState<string>("");

  const selectedCaseNumber = useMemo(() => {
    const selected = cases.find((item) => item.id === selectedCaseId);
    return selected?.caseNumber;
  }, [cases, selectedCaseId]);

  const refreshOverview = async () => {
    const overview = await getDashboardOverview();
    setStats(overview.stats);
    setCases(overview.activeCases);
    setSelectedCaseId((current) => current ?? overview.activeCases[0]?.id);
    setRefreshedAt(new Date().toLocaleTimeString());
  };

  const refreshReports = async () => {
    const data = await getReportsSummary();
    setReports(data);
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
    if (!selectedCaseId) {
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
      onEmergencyCreated: () => {
        void refreshOverview();
      },
      onStatusChanged: () => {
        void refreshOverview();
      },
      onCaseUpdated: () => {
        void refreshOverview();
        if (selectedCaseId) {
          void getCaseDetails(selectedCaseId).then(setCaseDetail);
        }
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
      setBanner(`Volunteer ${volunteerId} notified.`);
      await refreshOverview();
      const detail = await getCaseDetails(selectedCaseId);
      setCaseDetail(detail);
    };

    if (activeView === "overview") {
      return (
        <OverviewPage
          stats={stats}
          cases={cases}
          selectedCaseId={selectedCaseId}
          onSelectCase={setSelectedCaseId}
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
