import { CaseDetail } from "../types";

export const LiveTrackingPage = ({
  detail,
  onCloseCase
}: {
  detail?: CaseDetail;
  onCloseCase?: () => void;
}) => {
  if (!detail) {
    return <div className="empty-state">Select a case first.</div>;
  }

  return (
    <section className="tracking-grid">
      <article className="panel">
        <header className="panel__header">
          <h3>Real-Time Map Tracking</h3>
        </header>
        <div className="map-surface map-surface--large">
          <div className="map-pill map-pill--incident">Patient</div>
          <div className="map-pill map-pill--ambulance">Ambulance</div>
          <div className="map-pill map-pill--volunteer">Volunteer</div>
        </div>
      </article>

      <article className="panel">
        <header className="panel__header">
          <h3>Activity Feed</h3>
        </header>
        <div className="timeline-list">
          {detail.timeline.map((entry) => (
            <div key={entry.id} className="timeline-item">
              <p className="timeline-title">{entry.updateType.replaceAll("_", " ")}</p>
              <p>{entry.message}</p>
            </div>
          ))}
        </div>

        <div className="button-row">
          <button>Call Patient</button>
          <button>Call Volunteer</button>
          <button>Call Ambulance Unit</button>
          <button>Send Update</button>
          <button onClick={onCloseCase}>Close Case</button>
        </div>
      </article>
    </section>
  );
};
