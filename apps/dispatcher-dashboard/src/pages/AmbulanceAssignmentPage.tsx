import { useMemo, useState } from "react";

import { CaseDetail } from "../types";

const etaFromDistance = (distanceKm: number): number => Math.max(2, Math.ceil(distanceKm * 2.2));

export const AmbulanceAssignmentPage = ({
  detail,
  onAssign
}: {
  detail?: CaseDetail;
  onAssign: (ambulanceId: string) => void;
}) => {
  const [showAvailableOnly, setShowAvailableOnly] = useState(true);
  const [showAdvancedSupportOnly, setShowAdvancedSupportOnly] = useState(false);

  const rows = useMemo(() => {
    return (detail?.nearby.ambulances ?? []).filter((item) => {
      if (showAvailableOnly && item.status !== "AVAILABLE") {
        return false;
      }

      if (showAdvancedSupportOnly && item.supportLevel !== "ALS") {
        return false;
      }

      return true;
    });
  }, [detail?.nearby.ambulances, showAvailableOnly, showAdvancedSupportOnly]);

  if (!detail) {
    return <div className="empty-state">Select a case first.</div>;
  }

  return (
    <article className="panel">
      <header className="panel__header">
        <h3>Ambulance Assignment</h3>
      </header>

      <div className="button-row">
        <button onClick={() => setShowAvailableOnly((current) => !current)}>
          {showAvailableOnly ? "Showing: Available only" : "Showing: All units"}
        </button>
        <button onClick={() => setShowAdvancedSupportOnly((current) => !current)}>
          {showAdvancedSupportOnly ? "Showing: ALS only" : "Showing: Any support"}
        </button>
      </div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Unit ID</th>
              <th>Status</th>
              <th>Distance</th>
              <th>ETA</th>
              <th>Crew</th>
              <th>Support</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{item.unitCode}</td>
                <td>{item.status}</td>
                <td>{item.distanceKm.toFixed(1)} km</td>
                <td>{etaFromDistance(item.distanceKm)} min</td>
                <td>{item.crewCount}</td>
                <td>{item.supportLevel}</td>
                <td>
                  <button onClick={() => onAssign(item.id)}>Assign</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
};
