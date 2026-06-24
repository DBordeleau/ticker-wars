import { SegmentedControl, Tooltip } from "@mantine/core";
import type { MetricHorizon } from "../../api/dashboardData";

type Props = {
  value: MetricHorizon;
  onChange: (horizon: MetricHorizon) => void;
  label?: string;
};

const options: { label: string; value: MetricHorizon; description: string }[] = [
  {
    label: "ALL",
    value: "all",
    description: "Show predictions across every horizon.",
  },
  {
    label: "1W",
    value: "1w",
    description: "Show predictions made 1 week in advance.",
  },
  {
    label: "1M",
    value: "1m",
    description: "Show predictions made 1 month in advance.",
  },
  {
    label: "3M",
    value: "3m",
    description: "Show predictions made 3 months in advance.",
  },
  {
    label: "1Y",
    value: "1y",
    description: "Show predictions made 1 year in advance.",
  },
];

export default function PredictionHorizonSelector({
  value,
  onChange,
  label = "Prediction horizon",
}: Props) {
  return (
    <div className="horizon-selector-wrap prediction-horizon-selector" aria-label={label}>
      <SegmentedControl
        className="horizon-selector"
        data={options.map((option) => ({
          value: option.value,
          label: (
            <Tooltip label={option.description} openDelay={250}>
              <span className="horizon-selector-label">{option.label}</span>
            </Tooltip>
          ),
        }))}
        value={value}
        onChange={(nextValue) => onChange(nextValue as MetricHorizon)}
      />
    </div>
  );
}
