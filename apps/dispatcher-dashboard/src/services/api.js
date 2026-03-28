import { io } from "socket.io-client";
import { mockCaseDetail, mockCases, mockReports, mockStats } from "../data/mockDashboard";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4100/api/v1";
const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? "http://localhost:4100";
const DEMO_TOKEN = import.meta.env.VITE_DEMO_TOKEN ?? "";
const request = async (path, init) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(DEMO_TOKEN ? { Authorization: `Bearer ${DEMO_TOKEN}` } : {}),
            ...(init?.headers ?? {})
        }
    });
    if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
    }
    return response.json();
};
export const getDashboardOverview = async () => {
    try {
        const payload = await request("/dispatcher/overview");
        return payload.data;
    }
    catch {
        return {
            stats: mockStats,
            activeCases: mockCases
        };
    }
};
export const getCaseDetails = async (caseId) => {
    try {
        const payload = await request(`/dispatcher/cases/${caseId}`);
        return payload.data;
    }
    catch {
        return {
            ...mockCaseDetail,
            case: {
                ...mockCaseDetail.case,
                id: caseId
            }
        };
    }
};
export const assignAmbulance = async (caseId, ambulanceId) => {
    try {
        const payload = await request(`/dispatcher/cases/${caseId}/assign-ambulance`, {
            method: "POST",
            body: JSON.stringify({
                ambulanceId
            })
        });
        return payload.data;
    }
    catch {
        return {
            case: {
                ...mockCaseDetail.case,
                id: caseId
            }
        };
    }
};
export const assignVolunteer = async (caseId, volunteerId) => {
    try {
        const payload = await request(`/dispatcher/cases/${caseId}/assign-volunteer`, {
            method: "POST",
            body: JSON.stringify({ volunteerId })
        });
        return payload.data;
    }
    catch {
        return {
            case: {
                ...mockCaseDetail.case,
                id: caseId
            }
        };
    }
};
export const closeCase = async (caseId, payload) => {
    try {
        const result = await request(`/dispatcher/cases/${caseId}/close`, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        return result.data;
    }
    catch {
        return {
            ...mockCaseDetail.case,
            id: caseId,
            status: "CLOSED",
            closedAt: new Date().toISOString()
        };
    }
};
export const getReportsSummary = async () => {
    try {
        const payload = await request("/dispatcher/reports/summary");
        return payload.data;
    }
    catch {
        return mockReports;
    }
};
export const createRealtimeConnection = (handlers) => {
    if (!DEMO_TOKEN) {
        return io(WS_BASE_URL, {
            autoConnect: false
        });
    }
    const socket = io(WS_BASE_URL, {
        transports: ["websocket"],
        autoConnect: true,
        auth: { token: DEMO_TOKEN },
        extraHeaders: {
            Authorization: `Bearer ${DEMO_TOKEN}`
        }
    });
    socket.on("emergency:created", handlers.onEmergencyCreated);
    socket.on("emergency:status-changed", handlers.onStatusChanged);
    socket.on("emergency:ambulance-assigned", handlers.onCaseUpdated);
    socket.on("emergency:volunteer-assigned", handlers.onCaseUpdated);
    socket.on("emergency:update", handlers.onCaseUpdated);
    socket.emit("dashboard:join");
    return socket;
};
