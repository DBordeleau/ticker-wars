import { Group, Skeleton } from "@mantine/core";

export default function ChartLoadingState() {
  return (
    <div className="chart-loading-state" aria-label="Loading ticker chart">
      <div className="chart-toggle-skeletons">
        {[0, 1, 2, 3, 4].map((item) => (
          <Skeleton key={item} height={40} radius="sm" />
        ))}
      </div>
      <div className="chart-box ticker-chart-box chart-skeleton-box">
        <Skeleton height={360} radius="sm" />
        <div className="chart-skeleton-line chart-skeleton-line-primary" />
        <div className="chart-skeleton-line chart-skeleton-line-secondary" />
        <div className="chart-skeleton-line chart-skeleton-line-tertiary" />
      </div>
      <Group gap="md" mt="xs">
        <Skeleton width={150} height={16} radius="sm" />
        <Skeleton width={210} height={16} radius="sm" />
      </Group>
    </div>
  );
}
