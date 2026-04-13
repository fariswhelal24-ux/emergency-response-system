export const MetricCard = ({
  label,
  value,
  tone,
  icon
}: {
  label: string;
  value: string;
  tone?: "default" | "critical" | "success" | "info";
  icon?: string;
}) => {
  return (
    <article className={`metric-card metric-card--${tone ?? "default"}`}>
      <div className="metric-card__top">
        <p>{label}</p>
        {icon ? (
          <span className="metric-card__icon" aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      <h3>{value}</h3>
    </article>
  );
};
