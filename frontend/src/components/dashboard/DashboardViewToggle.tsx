import { SegmentedControl, Tooltip } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { FiCpu, FiUsers } from "react-icons/fi";

export type DashboardView = "models" | "users";

type Props = {
  value: DashboardView;
  onChange: (value: DashboardView) => void;
  label: string;
};

export default function DashboardViewToggle({ value, onChange, label }: Props) {
  const [visualValue, setVisualValue] = useState(value);
  const pendingChange = useRef<number | null>(null);
  const options = [
    {
      value: "models" as const,
      label: "ML Models",
      icon: <FiCpu />,
      tooltip: "View the live rankings for machine learning models.",
    },
    {
      value: "users" as const,
      label: "Users",
      icon: <FiUsers />,
      tooltip: "View the live rankings for real users.",
    },
  ];

  useEffect(() => {
    setVisualValue(value);
  }, [value]);

  useEffect(() => () => {
    if (pendingChange.current != null) {
      window.clearTimeout(pendingChange.current);
    }
  }, []);

  const handleChange = (nextValue: string) => {
    const nextView = nextValue as DashboardView;
    setVisualValue(nextView);
    if (pendingChange.current != null) {
      window.clearTimeout(pendingChange.current);
    }
    pendingChange.current = window.setTimeout(() => {
      onChange(nextView);
      pendingChange.current = null;
    }, 170);
  };

  return (
    <div className="horizon-selector-wrap dashboard-view-toggle" aria-label={label}>
      <SegmentedControl
        className="horizon-selector dashboard-view-toggle-control"
        value={visualValue}
        onChange={handleChange}
        data={options.map((option) => ({
          value: option.value,
          label: (
            <Tooltip label={option.tooltip} openDelay={250}>
              <span className="horizon-selector-label dashboard-view-toggle-label">
                {option.icon}
                <span>{option.label}</span>
              </span>
            </Tooltip>
          ),
        }))}
      />
    </div>
  );
}
