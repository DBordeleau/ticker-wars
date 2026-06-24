import { Card, Group, Skeleton, Text, Tooltip } from "@mantine/core";
import type { IconType } from "react-icons";
import MagicHoverSurface from "../layout/MagicHoverSurface";

type Props = {
  label: string;
  value: string;
  detail?: string;
  loading?: boolean;
  icon: IconType;
};

export default function MetricCard({ label, value, detail, loading, icon: Icon }: Props) {
  return (
    <MagicHoverSurface className="metric-magic-surface">
      <Card className="metric-card">
        {loading ? (
          <Skeleton height={70} radius="sm" />
        ) : (
          <>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text className="metric-label" size="xs" tt="uppercase" fw={700}>
                  {label}
                </Text>
                <Text className="metric-value">{value}</Text>
              </div>
              <Tooltip label={detail ?? label}>
                <span className="metric-icon" aria-label={label}>
                  <Icon />
                </span>
              </Tooltip>
            </Group>
            {detail ? (
              <Text className="secondary-text" size="xs" mt="xs" lineClamp={2}>
                {detail}
              </Text>
            ) : null}
          </>
        )}
      </Card>
    </MagicHoverSurface>
  );
}
