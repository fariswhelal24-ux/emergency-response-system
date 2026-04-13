import { useState } from "react";

import { ActiveCase, AvailableVolunteerSummary, DashboardStats, RegisteredVolunteerSummary } from "../types";
import { AIListeningPanel } from "../components/ai/AIListeningPanel";
import { MetricCard } from "../components/common/MetricCard";
import { getCaseDetails, updateEmergencyCase } from "../services/api";

type CasePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const toPriority = (value: string): CasePriority => {
  const normalized = value.trim().toUpperCase();
  if (normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH" || normalized === "CRITICAL") {
    return normalized;
  }

  return "MEDIUM";
};

const inferPriorityFromAI = (riskLevel?: string | null, aiAnalysis?: string | null): CasePriority | null => {
  const risk = (riskLevel || "").toUpperCase();
  if (risk.includes("CRITICAL")) return "CRITICAL";
  if (risk.includes("HIGH")) return "HIGH";
  if (risk.includes("MEDIUM")) return "MEDIUM";
  if (risk.includes("LOW")) return "LOW";

  const analysis = (aiAnalysis || "").toUpperCase();
  if (analysis.includes("CRITICAL")) return "CRITICAL";
  if (analysis.includes("HIGH")) return "HIGH";
  if (analysis.includes("MEDIUM")) return "MEDIUM";
  if (analysis.includes("LOW")) return "LOW";

  return null;
};

export const OverviewPage = ({
  stats,
  cases,
  availableVolunteers,
  registeredVolunteers,
  selectedCaseId,
  liveSync,
  onSelectCase,
  onOpenCaseDetails,
  onOpenAmbulance,
  onOpenVolunteers,
  onCaseFlowUpdated
}: {
  stats: DashboardStats;
  cases: ActiveCase[];
  availableVolunteers: AvailableVolunteerSummary[];
  registeredVolunteers: RegisteredVolunteerSummary[];
  selectedCaseId?: string;
  liveSync?: {
    statusText?: string;
    volunteerLocation?: { latitude: number; longitude: number; recordedAt?: string };
    ambulanceLocation?: { latitude: number; longitude: number; etaMinutes?: number; recordedAt?: string };
    citizenLocation?: { latitude: number; longitude: number; recordedAt?: string };
    ambulanceRoute?: Array<{ latitude: number; longitude: number }>;
  };
  onSelectCase: (caseId: string) => void;
  onOpenCaseDetails: () => void;
  onOpenAmbulance: () => void;
  onOpenVolunteers: () => void;
  onCaseFlowUpdated?: (caseId?: string) => void;
}) => {
  const selectedCase = cases.find((item) => item.id === selectedCaseId) ?? cases[0];
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [draftEmergencyType, setDraftEmergencyType] = useState("");
  const [draftAddress, setDraftAddress] = useState("");
  const [draftPriority, setDraftPriority] = useState<CasePriority>("MEDIUM");
  const [savingCaseId, setSavingCaseId] = useState<string | null>(null);
  const [applyingAiCaseId, setApplyingAiCaseId] = useState<string | null>(null);
  const [tableMessage, setTableMessage] = useState("");

  const startEditing = (emergency: ActiveCase) => {
    setEditingCaseId(emergency.id);
    setDraftEmergencyType(emergency.emergencyType);
    setDraftAddress(emergency.address);
    setDraftPriority(toPriority(emergency.priority));
    setTableMessage("");
  };

  const cancelEditing = () => {
    setEditingCaseId(null);
    setTableMessage("");
  };

  const handleSaveInline = async (caseId: string) => {
    const emergencyType = draftEmergencyType.trim();
    const address = draftAddress.trim();

    if (!emergencyType || !address) {
      setTableMessage("Emergency type and address are required.");
      return;
    }

    setSavingCaseId(caseId);
    setTableMessage("");
    try {
      await updateEmergencyCase(caseId, {
        emergencyType,
        address,
        priority: draftPriority
      });
      setEditingCaseId(null);
      setTableMessage("Case updated successfully.");
      await onCaseFlowUpdated?.(caseId);
      onSelectCase(caseId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update case.";
      setTableMessage(message);
    } finally {
      setSavingCaseId(null);
    }
  };

  const handleApplyAiSuggestion = async (caseId: string) => {
    setApplyingAiCaseId(caseId);
    setTableMessage("");
    try {
      const detail = await getCaseDetails(caseId);

      const suggestedEmergencyType = detail.case.possibleCondition?.trim() || detail.case.emergencyType;
      const suggestedPriority = inferPriorityFromAI(detail.case.riskLevel, detail.case.aiAnalysis);

      if (!suggestedEmergencyType && !suggestedPriority) {
        setTableMessage("No AI suggestion available yet. Run AI listening first.");
        return;
      }

      await updateEmergencyCase(caseId, {
        emergencyType: suggestedEmergencyType || detail.case.emergencyType,
        priority: suggestedPriority ?? toPriority(detail.case.priority),
        address: detail.case.address
      });

      setTableMessage("AI suggestion applied successfully.");
      await onCaseFlowUpdated?.(caseId);
      onSelectCase(caseId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to apply AI suggestion.";
      setTableMessage(message);
    } finally {
      setApplyingAiCaseId(null);
    }
  };

  return (
    <section className="page-grid">
      <div className="metrics-grid">
        <MetricCard label="Active Cases" value={String(stats.activeCases)} tone="info" icon="📋" />
        <MetricCard label="Ambulances Available" value={String(stats.ambulancesAvailable)} tone="default" icon="🚑" />
        <MetricCard
          label="Volunteers live (AVAILABLE + app open)"
          value={String(stats.volunteersAvailable)}
          tone="success"
          icon="🤝"
        />
        <MetricCard label="High Priority Incidents" value={String(stats.highPriorityIncidents)} tone="critical" icon="⚡" />
      </div>

      <AIListeningPanel onCaseFlowUpdated={onCaseFlowUpdated} selectedCase={selectedCase} />

      <article className="panel">
        <header className="panel__header">
          <h3>Registered Volunteers (Real Accounts Only)</h3>
        </header>

        {registeredVolunteers.length === 0 ? (
          <p style={{ margin: 0, color: "#5A6E86" }}>
            No real volunteer accounts are registered yet.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Specialty</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>App</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {registeredVolunteers.map((volunteer) => (
                  <tr key={volunteer.volunteerId}>
                    <td>{volunteer.name}</td>
                    <td>{volunteer.email}</td>
                    <td>{volunteer.specialty}</td>
                    <td>{volunteer.phone ?? "N/A"}</td>
                    <td>{volunteer.availability}</td>
                    <td>
                      <span
                        className={`badge ${volunteer.appConnected ? "badge--success" : "badge--muted"}`}
                      >
                        {volunteer.appConnected ? "Live" : "Offline"}
                      </span>
                    </td>
                    <td>{new Date(volunteer.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <div className="overview-layout">
        <article className="panel">
          <header className="panel__header">
            <h3>Incoming Emergencies</h3>
          </header>

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Location</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((emergency) => (
                  <tr
                    key={emergency.id}
                    className={selectedCase?.id === emergency.id ? "table-row--active" : ""}
                    onClick={() => onSelectCase(emergency.id)}
                  >
                    <td>{emergency.caseNumber}</td>
                    <td>
                      {editingCaseId === emergency.id ? (
                        <input
                          value={draftEmergencyType}
                          onChange={(event) => setDraftEmergencyType(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          style={{ minWidth: 140 }}
                        />
                      ) : (
                        emergency.emergencyType
                      )}
                    </td>
                    <td>
                      {editingCaseId === emergency.id ? (
                        <select
                          value={draftPriority}
                          onChange={(event) => setDraftPriority(event.target.value as CasePriority)}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <option value="LOW">LOW</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HIGH">HIGH</option>
                          <option value="CRITICAL">CRITICAL</option>
                        </select>
                      ) : (
                        emergency.priority
                      )}
                    </td>
                    <td>
                      {editingCaseId === emergency.id ? (
                        <input
                          value={draftAddress}
                          onChange={(event) => setDraftAddress(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          style={{ minWidth: 160 }}
                        />
                      ) : (
                        emergency.address
                      )}
                    </td>
                    <td>{new Date(emergency.createdAt).toLocaleTimeString()}</td>
                    <td>{emergency.status}</td>
                    <td>
                      {editingCaseId === emergency.id ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleSaveInline(emergency.id);
                            }}
                            disabled={savingCaseId === emergency.id}
                          >
                            {savingCaseId === emergency.id ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              cancelEditing();
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              startEditing(emergency);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleApplyAiSuggestion(emergency.id);
                            }}
                            disabled={applyingAiCaseId === emergency.id}
                          >
                            {applyingAiCaseId === emergency.id ? "Applying..." : "Apply AI"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tableMessage ? (
              <p style={{ margin: "8px 0 0", color: "#334155", fontSize: 13 }}>
                {tableMessage}
              </p>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <header className="panel__header">
            <h3>Live Map</h3>
          </header>

          <div className="map-surface">
            <div className="map-pill map-pill--incident">Incident</div>
            <div className="map-pill map-pill--ambulance">Ambulance</div>
            <div className="map-pill map-pill--volunteer">Volunteer</div>
          </div>

          {selectedCase ? (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#5A6E86" }}>
                Status: <strong style={{ color: "#1F3C5D" }}>{liveSync?.statusText ?? selectedCase.status}</strong>
              </div>
              <div style={{ fontSize: 12, color: "#5A6E86" }}>
                Citizen: {liveSync?.citizenLocation?.latitude?.toFixed(5) ?? selectedCase.location.latitude.toFixed(5)}
                , {liveSync?.citizenLocation?.longitude?.toFixed(5) ?? selectedCase.location.longitude.toFixed(5)}
              </div>
              <div style={{ fontSize: 12, color: "#5A6E86" }}>
                Volunteer:{" "}
                {liveSync?.volunteerLocation
                  ? `${liveSync.volunteerLocation.latitude.toFixed(5)}, ${liveSync.volunteerLocation.longitude.toFixed(5)}`
                  : "Awaiting volunteer location"}
              </div>
              <div style={{ fontSize: 12, color: "#5A6E86" }}>
                Ambulance:{" "}
                {liveSync?.ambulanceLocation
                  ? `${liveSync.ambulanceLocation.latitude.toFixed(5)}, ${liveSync.ambulanceLocation.longitude.toFixed(5)}`
                  : "Dispatching virtual ambulance..."}
              </div>
              {liveSync?.ambulanceLocation?.etaMinutes !== undefined ? (
                <div style={{ fontSize: 12, color: "#1E5A92", fontWeight: 600 }}>
                  ETA: {liveSync.ambulanceLocation.etaMinutes} min
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedCase ? (
            <div className="case-summary">
              <h4>{selectedCase.caseNumber}</h4>
              <p>{selectedCase.emergencyType}</p>
              <p>{selectedCase.address}</p>

              <div className="button-row">
                <button onClick={onOpenCaseDetails}>Open Case Details</button>
                <button onClick={onOpenAmbulance}>Assign Ambulance</button>
                <button onClick={onOpenVolunteers}>Alert Volunteer</button>
              </div>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
};
