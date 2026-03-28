import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { assignAmbulance, assignVolunteer, closeCase, createRealtimeConnection, getCaseDetails, getDashboardOverview, getReportsSummary } from "./services/api";
const defaultStats = {
    activeCases: 0,
    ambulancesAvailable: 0,
    volunteersAvailable: 0,
    highPriorityIncidents: 0
};
export default function App() {
    const [activeView, setActiveView] = useState("overview");
    const [stats, setStats] = useState(defaultStats);
    const [cases, setCases] = useState([]);
    const [selectedCaseId, setSelectedCaseId] = useState(undefined);
    const [caseDetail, setCaseDetail] = useState(undefined);
    const [reports, setReports] = useState(mockReports);
    const [loading, setLoading] = useState(true);
    const [refreshedAt, setRefreshedAt] = useState("--");
    const [banner, setBanner] = useState("");
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
        const handleAssignAmbulance = async (ambulanceId) => {
            if (!selectedCaseId) {
                return;
            }
            await assignAmbulance(selectedCaseId, ambulanceId);
            setBanner(`Ambulance ${ambulanceId} assigned to case.`);
            await refreshOverview();
            const detail = await getCaseDetails(selectedCaseId);
            setCaseDetail(detail);
        };
        const handleNotifyVolunteer = async (volunteerId) => {
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
            return (_jsx(OverviewPage, { stats: stats, cases: cases, selectedCaseId: selectedCaseId, onSelectCase: setSelectedCaseId, onOpenCaseDetails: () => setActiveView("caseDetails"), onOpenAmbulance: () => setActiveView("ambulanceAssignment"), onOpenVolunteers: () => setActiveView("volunteerCoordination") }));
        }
        if (activeView === "caseDetails") {
            return (_jsx(CaseDetailsPage, { detail: caseDetail, onOpenAmbulance: () => setActiveView("ambulanceAssignment"), onOpenVolunteers: () => setActiveView("volunteerCoordination"), onAssignAmbulance: handleAssignAmbulance, onNotifyVolunteer: handleNotifyVolunteer }));
        }
        if (activeView === "ambulanceAssignment") {
            return (_jsx(AmbulanceAssignmentPage, { detail: caseDetail, onAssign: handleAssignAmbulance }));
        }
        if (activeView === "volunteerCoordination") {
            return (_jsx(VolunteerCoordinationPage, { detail: caseDetail, onNotify: handleNotifyVolunteer }));
        }
        if (activeView === "liveTracking") {
            return (_jsx(LiveTrackingPage, { detail: caseDetail, onCloseCase: () => setActiveView("reports") }));
        }
        return (_jsx(ReportsPage, { reports: reports, onCloseCase: async (payload) => {
                if (!selectedCaseId) {
                    return;
                }
                await closeCase(selectedCaseId, payload);
                setBanner("Case closed and report generated.");
                await Promise.all([refreshOverview(), refreshReports()]);
                const detail = await getCaseDetails(selectedCaseId);
                setCaseDetail(detail);
            } }));
    };
    return (_jsxs("div", { className: "app-shell", children: [_jsx(Sidebar, { activeView: activeView, onChange: setActiveView }), _jsxs("main", { className: "app-main", children: [_jsx(TopBar, { activeCaseNumber: selectedCaseNumber, refreshedAt: refreshedAt }), banner ? _jsx("div", { className: "banner", children: banner }) : null, loading ? (_jsxs("section", { className: "loading-grid", children: [_jsx(MetricCard, { label: "Loading", value: "..." }), _jsx(MetricCard, { label: "Dispatch", value: "Syncing", tone: "info" })] })) : (renderPage())] })] }));
}
