import { CaseLiveMap } from "../components/common/CaseLiveMap";
import { CaseDetail } from "../types";

export const LiveTrackingPage = ({
  detail,
  liveSync,
  onCloseCase
}: {
  detail?: CaseDetail;
  liveSync?: {
    statusText?: string;
    volunteerLocation?: { latitude: number; longitude: number; recordedAt?: string };
    ambulanceLocation?: { latitude: number; longitude: number; etaMinutes?: number; recordedAt?: string };
    citizenLocation?: { latitude: number; longitude: number; recordedAt?: string };
    ambulanceRoute?: Array<{ latitude: number; longitude: number }>;
  };
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
        <CaseLiveMap
          patientLocation={liveSync?.citizenLocation ?? detail.case.location}
          volunteerLocation={liveSync?.volunteerLocation}
          ambulanceLocation={liveSync?.ambulanceLocation}
          ambulanceRoute={liveSync?.ambulanceRoute}
        />
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          <p style={{ margin: 0, color: "#4A627F", fontSize: 13 }}>
            Status: <strong style={{ color: "#173A63" }}>{liveSync?.statusText ?? detail.case.status}</strong>
          </p>
          <p style={{ margin: 0, color: "#4A627F", fontSize: 13 }}>
            Citizen: {liveSync?.citizenLocation?.latitude?.toFixed(5) ?? detail.case.location.latitude.toFixed(5)},{" "}
            {liveSync?.citizenLocation?.longitude?.toFixed(5) ?? detail.case.location.longitude.toFixed(5)}
          </p>
          <p style={{ margin: 0, color: "#4A627F", fontSize: 13 }}>
            Volunteer:{" "}
            {liveSync?.volunteerLocation
              ? `${liveSync.volunteerLocation.latitude.toFixed(5)}, ${liveSync.volunteerLocation.longitude.toFixed(5)}`
              : "Waiting for volunteer GPS feed"}
          </p>
          <p style={{ margin: 0, color: "#4A627F", fontSize: 13 }}>
            Ambulance:{" "}
            {liveSync?.ambulanceLocation
              ? `${liveSync.ambulanceLocation.latitude.toFixed(5)}, ${liveSync.ambulanceLocation.longitude.toFixed(5)}`
              : "Virtual ambulance dispatching..."}
          </p>
          <p style={{ margin: 0, color: "#1E5A92", fontSize: 12 }}>
            Route points: {liveSync?.ambulanceRoute?.length ?? 0}
          </p>
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
