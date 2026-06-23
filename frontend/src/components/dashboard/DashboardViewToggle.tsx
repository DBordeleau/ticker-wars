import { SegmentedControl } from "@mantine/core";

export type DashboardView = "models" | "users";

type Props = {
  value: DashboardView;
  onChange: (value: DashboardView) => void;
  label: string;
};

export default function DashboardViewToggle({ value, onChange, label }: Props) {
  return (
    <div className="dashboard-view-toggle" aria-label={label}>
      <SegmentedControl
        size="xs"
        value={value}
        onChange={(nextValue) => onChange(nextValue as DashboardView)}
        data={[
          { value: "models", label: "ML Models" },
          { value: "users", label: "Users" },
        ]}
      />
    </div>
  );
}
