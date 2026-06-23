import { Badge, Group, Progress, Skeleton, Table, Text, Tooltip } from "@mantine/core";
import { motion } from "framer-motion";
import { FiExternalLink } from "react-icons/fi";
import { Link } from "react-router-dom";
import type { LeaderboardRow, MetricHorizon, MetricWindow } from "../../api/dashboardData";
import { formatMetric, formatPercent } from "../../utils/format";
import { modelTypeColor, normalizeModelType } from "../../utils/models";
import SectionPanel from "../layout/SectionPanel";
import HorizonSelector from "./HorizonSelector";

type Props = {
  rows: LeaderboardRow[];
  window: MetricWindow;
  horizon: MetricHorizon;
  onHorizonChange: (horizon: MetricHorizon) => void;
  loading: boolean;
};

export default function LeaderboardTable({
  rows,
  window,
  horizon,
  onHorizonChange,
  loading,
}: Props) {
  const visibleRows = rows
    .filter((row) => row.window === window && row.prediction_horizon === horizon)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const emptyMessage =
    horizon === "1y"
      ? "1Y rows need a full year to mature. Rankings will appear once those target closes arrive."
      : "No scored predictions yet for this horizon. Leaderboard rows will appear after target closes arrive.";

  return (
    <SectionPanel
      title="Leaderboard"
      className="leaderboard-panel"
    >
      <div className="leaderboard-horizon-control">
        <HorizonSelector value={horizon} onChange={onHorizonChange} />
      </div>
      {loading ? (
        <Skeleton height={300} radius="sm" />
      ) : visibleRows.length === 0 ? (
        <Text c="dimmed" size="sm">
          {emptyMessage}
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={780}>
          <Table verticalSpacing="md" className="leaderboard-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Rank</Table.Th>
                <Table.Th>Model</Table.Th>
                <MetricHeader label="MAE" tooltip="Mean absolute error. Lower is better." />
                <MetricHeader
                  label="Directional"
                  tooltip="How often the model correctly predicted whether price moved up or down."
                />
                <MetricHeader
                  label="Winkler"
                  tooltip="Interval score that rewards accurate, tighter prediction ranges. Lower is better."
                />
                <MetricHeader
                  label="Scored"
                  tooltip="Number of matured predictions included in this leaderboard row."
                  className="score-column"
                />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibleRows.map((row, index) => {
                const modelType = normalizeModelType(row.model_type);
                return (
                  <motion.tr
                    key={`${row.window}-${row.prediction_horizon}-${row.model_slug}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2, delay: index * 0.025 }}
                    className={`leaderboard-row ${row.model_slug === "baseline" ? "baseline-row" : ""}`}
                  >
                    <Table.Td>
                      <Text fw={800}>{row.rank ? `#${row.rank}` : "Pending"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Text
                          component={Link}
                          to={`/models/${row.model_slug}`}
                          fw={800}
                          className="leaderboard-model-link"
                        >
                          <span>{row.model_name}</span>
                          <FiExternalLink aria-hidden />
                        </Text>
                        <Badge color={modelTypeColor(modelType)}>{modelType}</Badge>
                      </Group>
                    </Table.Td>
                    <Table.Td>{formatMetric(row.mae)}</Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Progress.Root className="direction-progress" size="lg">
                          <Progress.Section
                            value={
                              row.directional_accuracy == null
                                ? 0
                                : row.directional_accuracy * 100
                            }
                            color="green"
                          />
                          <Progress.Section
                            value={
                              row.directional_accuracy == null
                                ? 100
                                : Math.max(0, (1 - row.directional_accuracy) * 100)
                            }
                            color={row.directional_accuracy == null ? "dark.3" : "red"}
                          />
                        </Progress.Root>
                        <Text size="sm">{formatPercent(row.directional_accuracy)}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>{formatMetric(row.winkler_score)}</Table.Td>
                    <Table.Td className="score-column">
                      {row.prediction_count.toLocaleString()}
                    </Table.Td>
                  </motion.tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </SectionPanel>
  );
}

type MetricHeaderProps = {
  label: string;
  tooltip: string;
  className?: string;
};

function MetricHeader({ label, tooltip, className }: MetricHeaderProps) {
  return (
    <Table.Th className={className}>
      <Tooltip label={tooltip} openDelay={250}>
        <span className="metric-header-tooltip">{label}</span>
      </Tooltip>
    </Table.Th>
  );
}
