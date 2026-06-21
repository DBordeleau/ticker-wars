import { Badge, Group, Progress, Skeleton, Table, Text } from "@mantine/core";
import { motion } from "framer-motion";
import { FiExternalLink } from "react-icons/fi";
import { Link } from "react-router-dom";
import type { LeaderboardRow, MetricWindow } from "../../api/dashboardData";
import { formatMetric, formatPercent } from "../../utils/format";
import SectionPanel from "../layout/SectionPanel";

type Props = {
  rows: LeaderboardRow[];
  window: MetricWindow;
  loading: boolean;
};

export default function LeaderboardTable({ rows, window, loading }: Props) {
  const visibleRows = rows
    .filter((row) => row.window === window)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  return (
    <SectionPanel
      title="Leaderboard"
      className="leaderboard-panel"
    >
      {loading ? (
        <Skeleton height={300} radius="sm" />
      ) : visibleRows.length === 0 ? (
        <Text c="dimmed" size="sm">
          No scored predictions yet. Leaderboard rows will appear after target closes arrive.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={900}>
          <Table verticalSpacing="md" className="leaderboard-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Rank</Table.Th>
                <Table.Th>Model</Table.Th>
                <Table.Th>MAE</Table.Th>
                <Table.Th>RMSE</Table.Th>
                <Table.Th>MAPE</Table.Th>
                <Table.Th>Directional</Table.Th>
                <Table.Th className="score-column">Scored</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibleRows.map((row, index) => (
                <motion.tr
                  key={`${row.window}-${row.model_slug}`}
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
                      {row.model_slug === "baseline" ? <Badge color="gray">Baseline</Badge> : null}
                      {row.is_toy_model ? <Badge color="yellow">Toy LLM</Badge> : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>{formatMetric(row.mae)}</Table.Td>
                  <Table.Td>{formatMetric(row.rmse)}</Table.Td>
                  <Table.Td>{formatPercent(row.mape)}</Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Progress.Root className="direction-progress" size="lg">
                        <Progress.Section
                          value={row.directional_accuracy == null ? 0 : row.directional_accuracy * 100}
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
                  <Table.Td className="score-column">{row.prediction_count.toLocaleString()}</Table.Td>
                </motion.tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </SectionPanel>
  );
}
