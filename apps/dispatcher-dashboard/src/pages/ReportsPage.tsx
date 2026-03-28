import { useState } from "react";

import { IncidentClosurePayload, ReportPoint } from "../types";

export const ReportsPage = ({
  reports,
  onCloseCase
}: {
  reports: ReportPoint[];
  onCloseCase: (payload: IncidentClosurePayload) => void;
}) => {
  const [totalResponseSeconds, setTotalResponseSeconds] = useState("420");
  const [ambulanceArrivalSeconds, setAmbulanceArrivalSeconds] = useState("190");
  const [volunteerArrivalSeconds, setVolunteerArrivalSeconds] = useState("140");
  const [interventions, setInterventions] = useState("Guided airway support, bleeding control, oxygen prep.");
  const [notes, setNotes] = useState("Volunteer stabilized patient before ambulance handover.");
  const [outcome, setOutcome] = useState("Resolved after first aid and ambulance handover");

  return (
    <section className="page-stack">
      <article className="panel">
        <header className="panel__header">
          <h3>Incident Closure</h3>
        </header>

        <label className="form-label" htmlFor="total-response-seconds">
          Total response time (sec)
        </label>
        <input
          id="total-response-seconds"
          value={totalResponseSeconds}
          onChange={(event) => setTotalResponseSeconds(event.target.value)}
        />

        <label className="form-label" htmlFor="ambulance-arrival-seconds">
          Ambulance arrival time (sec)
        </label>
        <input
          id="ambulance-arrival-seconds"
          value={ambulanceArrivalSeconds}
          onChange={(event) => setAmbulanceArrivalSeconds(event.target.value)}
        />

        <label className="form-label" htmlFor="volunteer-arrival-seconds">
          Volunteer arrival time (sec)
        </label>
        <input
          id="volunteer-arrival-seconds"
          value={volunteerArrivalSeconds}
          onChange={(event) => setVolunteerArrivalSeconds(event.target.value)}
        />

        <label className="form-label" htmlFor="interventions">
          Interventions performed
        </label>
        <textarea
          id="interventions"
          value={interventions}
          onChange={(event) => setInterventions(event.target.value)}
        />

        <label className="form-label" htmlFor="notes">
          Dispatcher notes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        <label className="form-label" htmlFor="outcome">
          Final outcome
        </label>
        <textarea id="outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)} />

        <div className="button-row">
          <button
            onClick={() =>
              onCloseCase({
                totalResponseSeconds: Number(totalResponseSeconds) || undefined,
                ambulanceArrivalSeconds: Number(ambulanceArrivalSeconds) || undefined,
                volunteerArrivalSeconds: Number(volunteerArrivalSeconds) || undefined,
                interventions: interventions.trim() || undefined,
                notes: notes.trim() || undefined,
                finalOutcome: outcome.trim()
              })
            }
          >
            Close Case
          </button>
        </div>
      </article>

      <article className="panel">
        <header className="panel__header">
          <h3>Reporting Summary</h3>
        </header>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Daily Case Count</th>
                <th>Avg Response Time (sec)</th>
                <th>Volunteer Contributions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((item) => (
                <tr key={item.date}>
                  <td>{item.date}</td>
                  <td>{item.caseCount}</td>
                  <td>{item.avgTotalResponseSeconds ?? "N/A"}</td>
                  <td>{item.volunteerContributions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
};
