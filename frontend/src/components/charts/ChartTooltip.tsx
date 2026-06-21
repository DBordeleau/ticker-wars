import { formatCurrency } from "../../utils/format";

export type ChartTooltipItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: string | number;
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

  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <div key={String(item.dataKey)} className="chart-tooltip-row">
          <span style={{ color: item.color ?? item.stroke }}>{item.name}</span>
          <span>{formatCurrency(Number(item.value))}</span>
        </div>
      ))}
    </div>
  );
}
