import { useMemo } from "react";

import { CaseDetail } from "../types";

const etaFromDistance = (distanceKm: number): number => Math.max(2, Math.ceil(distanceKm * 2.4));

export const VolunteerCoordinationPage = ({
  detail,
  onNotify
}: {
  detail?: CaseDetail;
  onNotify: (volunteerId: string) => void;
}) => {
  const assignmentStatusByVolunteer = useMemo(() => {
    const index = new Map<string, string>();

    (detail?.assignments.volunteers ?? []).forEach((assignment) => {
      index.set(assignment.volunteerId, assignment.status);
    });

    return index;
  }, [detail?.assignments.volunteers]);

  if (!detail) {
    return <div className="empty-state">Select a case first.</div>;
  }

  return (
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
              <th>Availability</th>
              <th>App</th>
              <th>Distance</th>
              <th>ETA</th>
              <th>Response</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {detail.nearby.volunteers.map((item) => (
              <tr key={item.volunteerId}>
                <td>{item.name}</td>
                <td>{item.specialty}</td>
                <td>{item.availability}</td>
                <td>
                  <span className={`badge ${item.appConnected ? "badge--success" : "badge--muted"}`}>
                    {item.appConnected ? "Live" : "Offline"}
                  </span>
                </td>
                <td>{item.distanceKm.toFixed(1)} km</td>
                <td>{etaFromDistance(item.distanceKm)} min</td>
                <td>{assignmentStatusByVolunteer.get(item.volunteerId) ?? "PENDING"}</td>
                <td>
                  <div className="button-row">
                    <button onClick={() => onNotify(item.volunteerId)}>Notify</button>
                    <button>Call</button>
                    <button>Message</button>
                    <button>Mark Assigned</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
};
