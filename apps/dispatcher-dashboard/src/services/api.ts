import { io, Socket } from "socket.io-client";

import { mockCaseDetail, mockCases, mockReports, mockStats } from "../data/mockDashboard";
import {
  ActiveCase,
  CaseDetail,
  DashboardStats,
  IncidentClosurePayload,
  ReportPoint
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4100/api/v1";
const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? "http://localhost:4100";
const DEMO_TOKEN = import.meta.env.VITE_DEMO_TOKEN ?? "";

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
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

  return response.json() as Promise<T>;
};

export const getDashboardOverview = async (): Promise<{
  stats: DashboardStats;
  activeCases: ActiveCase[];
}> => {
  try {
    const payload = await request<{ data: { stats: DashboardStats; activeCases: ActiveCase[] } }>(
      "/dispatcher/overview"
    );

    return payload.data;
  } catch {
    return {
      stats: mockStats,
      activeCases: mockCases
    };
  }
};

export const getCaseDetails = async (caseId: string): Promise<CaseDetail> => {
  try {
    const payload = await request<{ data: CaseDetail }>(`/dispatcher/cases/${caseId}`);
    return payload.data;
  } catch {
    return {
      ...mockCaseDetail,
      case: {
        ...mockCaseDetail.case,
        id: caseId
      }
    };
  }
};

export const assignAmbulance = async (caseId: string, ambulanceId?: string) => {
  try {
    const payload = await request<{ data: { case: CaseDetail["case"] } }>(
      `/dispatcher/cases/${caseId}/assign-ambulance`,
      {
        method: "POST",
        body: JSON.stringify({
          ambulanceId
        })
      }
    );

    return payload.data;
  } catch {
    return {
      case: {
        ...mockCaseDetail.case,
        id: caseId
      }
    };
  }
};

export const assignVolunteer = async (caseId: string, volunteerId: string) => {
  try {
    const payload = await request<{ data: { case: CaseDetail["case"] } }>(
      `/dispatcher/cases/${caseId}/assign-volunteer`,
      {
        method: "POST",
        body: JSON.stringify({ volunteerId })
      }
    );

    return payload.data;
  } catch {
    return {
      case: {
        ...mockCaseDetail.case,
        id: caseId
      }
    };
  }
};

export const closeCase = async (caseId: string, payload: IncidentClosurePayload) => {
  try {
    const result = await request<{ data: CaseDetail["case"] }>(`/dispatcher/cases/${caseId}/close`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    return result.data;
  } catch {
    return {
      ...mockCaseDetail.case,
      id: caseId,
      status: "CLOSED",
      closedAt: new Date().toISOString()
    };
  }
};

export const getReportsSummary = async (): Promise<ReportPoint[]> => {
  try {
    const payload = await request<{ data: ReportPoint[] }>("/dispatcher/reports/summary");
    return payload.data;
  } catch {
    return mockReports;
  }
};

export const createRealtimeConnection = (handlers: {
  onEmergencyCreated: () => void;
  onStatusChanged: () => void;
  onCaseUpdated: () => void;
}): Socket => {
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
