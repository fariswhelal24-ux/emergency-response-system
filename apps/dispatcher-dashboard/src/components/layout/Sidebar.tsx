import { DashboardView } from "../../types";

const items: Array<{ key: DashboardView; label: string }> = [
  { key: "overview", label: "Emergency Dashboard" },
  { key: "caseDetails", label: "Case Details" },
  { key: "ambulanceAssignment", label: "Ambulance Assignment" },
  { key: "volunteerCoordination", label: "Volunteer Coordination" },
  { key: "liveTracking", label: "Live Tracking" },
  { key: "reports", label: "Incident Closure & Reports" }
];

export const Sidebar = ({
  activeView,
  onChange
}: {
  activeView: DashboardView;
  onChange: (view: DashboardView) => void;
}) => {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__logo">ER</div>
        <div>
          <p className="brand__eyebrow">Dispatch Center</p>
          <h2 className="brand__title">Real-Time Emergency Ops</h2>
        </div>
      </div>

      <nav className="sidebar__nav">
        {items.map((item) => {
          const active = item.key === activeView;
          return (
            <button
              key={item.key}
              type="button"
              className={`nav-item ${active ? "nav-item--active" : ""}`}
              onClick={() => onChange(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
