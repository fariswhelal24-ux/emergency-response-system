import { CaseDetail } from "../types";

const etaFromDistance = (distanceKm: number): number => Math.max(2, Math.ceil(distanceKm * 2.2));

export const CaseDetailsPage = ({
  detail,
  onOpenAmbulance,
  onOpenVolunteers,
  onAssignAmbulance,
  onNotifyVolunteer
}: {
  detail?: CaseDetail;
  onOpenAmbulance?: () => void;
  onOpenVolunteers?: () => void;
  onAssignAmbulance?: (ambulanceId: string) => void;
  onNotifyVolunteer?: (volunteerId: string) => void;
}) => {
  if (!detail) {
    return <div className="empty-state">Select a case to view details.</div>;
  }

  return (
    <section className="page-stack">
      <article className="panel">
        <header className="panel__header">
          <h3>Case {detail.case.caseNumber}</h3>
          <span className="badge badge--critical">{detail.case.priority}</span>
        </header>

        <div className="panel-block">
          <p>
            <strong>Emergency type:</strong> {detail.case.emergencyType}
          </p>
          <p>
            <strong>Time received:</strong> {new Date(detail.case.createdAt).toLocaleString()}
          </p>
          <p>
            <strong>Current status:</strong> {detail.case.status}
          </p>
          <div className="button-row">
            <button onClick={onOpenAmbulance}>Assign Ambulance</button>
            <button onClick={onOpenVolunteers}>Notify Nearby Volunteers</button>
          </div>
        </div>

        <div className="three-col">
          <div className="panel-block">
            <h4>Emergency Analysis</h4>
            <p><strong>Caller description:</strong> {detail.case.voiceDescription ?? "Not available"}</p>
            <p><strong>System analysis:</strong> {detail.case.aiAnalysis ?? "Pending"}</p>
            <p><strong>Possible condition:</strong> {detail.case.possibleCondition ?? "Pending"}</p>
            <p><strong>Risk level:</strong> {detail.case.riskLevel ?? "Pending"}</p>
            <p>
              <strong>Keywords detected:</strong>{" "}
              {(detail.case.transcriptionText ?? detail.case.voiceDescription ?? "No transcript yet")
                .split(" ")
                .slice(0, 6)
                .join(", ")}
            </p>
          </div>

          <div className="panel-block">
            <h4>Patient Info</h4>
            <p><strong>Name:</strong> {detail.case.patient.name}</p>
            <p><strong>Phone:</strong> {detail.case.patient.phone ?? "N/A"}</p>
            <p><strong>Conditions:</strong> {detail.case.patient.conditions ?? "N/A"}</p>
            <p><strong>Allergies:</strong> {detail.case.patient.allergies ?? "N/A"}</p>
            <div className="button-row">
              <button>Call Patient</button>
              <button>Message Patient</button>
            </div>
          </div>

          <div className="panel-block">
            <h4>Location</h4>
            <p>{detail.case.address}</p>
            <div className="map-surface map-surface--small" />
          </div>
        </div>
      </article>

      <article className="panel">
        <header className="panel__header">
          <h3>Timeline of Actions</h3>
        </header>

        <div className="timeline-list">
          {detail.timeline.map((entry) => (
            <div key={entry.id} className="timeline-item">
              <p className="timeline-title">{entry.updateType.replaceAll("_", " ")}</p>
              <p>{entry.message}</p>
              <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <header className="panel__header">
          <h3>Ambulance Selection</h3>
        </header>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Status</th>
                <th>Distance</th>
                <th>ETA</th>
                <th>Assign</th>
              </tr>
            </thead>
            <tbody>
              {detail.nearby.ambulances.map((ambulance) => (
                <tr key={ambulance.id}>
                  <td>{ambulance.unitCode}</td>
                  <td>{ambulance.status}</td>
                  <td>{ambulance.distanceKm.toFixed(1)} km</td>
                  <td>{etaFromDistance(ambulance.distanceKm)} min</td>
                  <td>
                    <button onClick={() => onAssignAmbulance?.(ambulance.id)}>Assign</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <header className="panel__header">
          <h3>Volunteer Coordination</h3>
        </header>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Specialty</th>
                <th>App</th>
                <th>Distance</th>
                <th>Status</th>
                <th>Notify</th>
              </tr>
            </thead>
            <tbody>
              {detail.nearby.volunteers.map((volunteer) => {
                const assignment = detail.assignments.volunteers.find(
                  (item) => item.volunteerId === volunteer.volunteerId
                );

                return (
                  <tr key={volunteer.volunteerId}>
                    <td>{volunteer.name}</td>
                    <td>{volunteer.specialty}</td>
                    <td>
                      <span
                        className={`badge ${volunteer.appConnected ? "badge--success" : "badge--muted"}`}
                      >
                        {volunteer.appConnected ? "Live" : "Offline"}
                      </span>
                    </td>
                    <td>{volunteer.distanceKm.toFixed(1)} km</td>
                    <td>{assignment?.status ?? "PENDING"}</td>
                    <td>
                      <button onClick={() => onNotifyVolunteer?.(volunteer.volunteerId)}>Notify</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
};
