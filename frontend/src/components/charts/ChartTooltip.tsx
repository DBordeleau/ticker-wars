import { formatCurrency } from "../../utils/format";

export type ChartTooltipItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: string | number | [number, number] | null;
  color?: string;
  stroke?: string;
};

type Props = {
  label: string;
  payload: ChartTooltipItem[];
};

export default function ChartTooltip({ payload, label }: Props) {
  if (!payload.length) {
    return null;
  }

  const rows = compactTooltipRows(payload);

  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {rows.map((row) => (
        <div key={row.key} className="chart-tooltip-row">
          <span style={{ color: row.color }}>{row.name}</span>
          <span>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

type TooltipRow = {
  key: string;
  name: string;
  value: string;
  color?: string;
};

function compactTooltipRows(payload: ChartTooltipItem[]): TooltipRow[] {
  const rangeByModel = new Map<string, ChartTooltipItem>();
  payload.forEach((item) => {
    const name = String(item.name ?? "");
    if (name.endsWith(" 80% range")) {
      rangeByModel.set(name.replace(" 80% range", ""), item);
    }
  });

  return payload
    .filter((item) => !String(item.name ?? "").endsWith(" 80% range"))
    .map((item) => {
      const name = String(item.name ?? item.dataKey ?? "");
      const range = rangeByModel.get(name);
      const rangeValue = range?.value;
      const estimate = formatTooltipValue(item.value);
      const interval = Array.isArray(rangeValue)
        ? ` (${formatTooltipRange(rangeValue)})`
        : "";

      return {
        key: String(item.dataKey ?? name),
        name,
        value: `${estimate}${interval}`,
        color: item.color ?? item.stroke,
      };
    });
}

function formatTooltipValue(value: ChartTooltipItem["value"]) {
  if (Array.isArray(value)) {
    return formatTooltipRange(value);
  }
  return formatCurrency(Number(value));
}

function formatTooltipRange(value: [number, number]) {
  return `${formatCurrency(value[0])} - ${formatCurrency(value[1])}`;
}
