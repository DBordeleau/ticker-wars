type LegendEntry = {
  value?: string | number;
  color?: string;
};

export default function FilteredLegend({ payload }: { payload?: LegendEntry[] }) {
  const entries = (payload ?? []).filter(
    (entry) => !String(entry.value ?? "").includes("80% range"),
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="chart-custom-legend">
      {entries.map((entry) => (
        <span className="chart-custom-legend-item" key={String(entry.value)}>
          <span
            className="chart-custom-legend-line"
            style={{ backgroundColor: entry.color ?? "#f4f7f5" }}
            aria-hidden
          />
          <span className="chart-legend-label">{entry.value}</span>
        </span>
      ))}
    </div>
  );
}
