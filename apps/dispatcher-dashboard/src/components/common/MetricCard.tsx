export const MetricCard = ({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "default" | "critical" | "success" | "info";
}) => {
  return (
    <article className={`metric-card metric-card--${tone ?? "default"}`}>
      <p>{label}</p>
      <h3>{value}</h3>
    </article>
  );
};
