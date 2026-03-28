export const TopBar = ({
  activeCaseNumber,
  refreshedAt
}: {
  activeCaseNumber?: string;
  refreshedAt: string;
}) => {
  return (
    <header className="topbar">
      <div>
        <p className="topbar__eyebrow">Operations Control Room</p>
        <h1 className="topbar__title">Emergency Response Command Dashboard</h1>
      </div>

      <div className="topbar__meta">
        <span className="chip chip--live">Live Sync</span>
        {activeCaseNumber ? <span className="chip">Focused: {activeCaseNumber}</span> : null}
        <span className="chip">Updated {refreshedAt}</span>
      </div>
    </header>
  );
};
