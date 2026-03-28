import { ActiveCase, DashboardStats } from "../types";
import { AIListeningPanel } from "../components/ai/AIListeningPanel";
import { MetricCard } from "../components/common/MetricCard";

export const OverviewPage = ({
  stats,
  cases,
  selectedCaseId,
  onSelectCase,
  onOpenCaseDetails,
  onOpenAmbulance,
  onOpenVolunteers
}: {
  stats: DashboardStats;
  cases: ActiveCase[];
  selectedCaseId?: string;
  onSelectCase: (caseId: string) => void;
  onOpenCaseDetails: () => void;
  onOpenAmbulance: () => void;
  onOpenVolunteers: () => void;
}) => {
  const selectedCase = cases.find((item) => item.id === selectedCaseId) ?? cases[0];

  return (
    <section className="page-grid">
      <div className="metrics-grid">
        <MetricCard label="Active Cases" value={String(stats.activeCases)} tone="info" />
        <MetricCard label="Ambulances Available" value={String(stats.ambulancesAvailable)} tone="default" />
        <MetricCard label="Available Volunteers" value={String(stats.volunteersAvailable)} tone="success" />
        <MetricCard label="High Priority Incidents" value={String(stats.highPriorityIncidents)} tone="critical" />
      </div>

      <AIListeningPanel />

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
                    <td>{emergency.emergencyType}</td>
                    <td>{emergency.priority}</td>
                    <td>{emergency.address}</td>
                    <td>{new Date(emergency.createdAt).toLocaleTimeString()}</td>
                    <td>{emergency.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
