import { DashboardView } from "../../types";

const items: Array<{ key: DashboardView; label: string; icon: string }> = [
  { key: "overview", label: "Emergency Dashboard", icon: "◉" },
  { key: "caseDetails", label: "Case Details", icon: "▣" },
  { key: "ambulanceAssignment", label: "Ambulance Assignment", icon: "⬢" },
  { key: "volunteerCoordination", label: "Volunteer Coordination", icon: "◇" },
  { key: "liveTracking", label: "Live Tracking", icon: "◎" },
  { key: "reports", label: "Incident Closure & Reports", icon: "▤" }
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
        <div className="brand__logo">P</div>
        <div>
          <p className="brand__eyebrow">Pulse Dispatch</p>
          <h2 className="brand__title">Emergency Operations</h2>
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
              <span className="nav-item__icon" aria-hidden>
                {item.icon}
              </span>
              <span className="nav-item__label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
