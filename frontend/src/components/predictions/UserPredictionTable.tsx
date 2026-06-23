import { Badge, Group, Skeleton, Table, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import type { LatestUserPrediction, MetricHorizon } from "../../api/dashboardData";
import type { DashboardView } from "../dashboard/DashboardViewToggle";
import DashboardViewToggle from "../dashboard/DashboardViewToggle";
import { formatCurrency, formatDate, formatHorizon, formatSignedPercent } from "../../utils/format";
import SectionPanel from "../layout/SectionPanel";
import AvatarImage from "../users/AvatarImage";
import PredictionHorizonSelector from "./PredictionHorizonSelector";

type Props = {
  rows: LatestUserPrediction[];
  loading: boolean;
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  horizon: MetricHorizon;
  onHorizonChange: (horizon: MetricHorizon) => void;
};

export default function UserPredictionTable({
  rows,
  loading,
  view,
  onViewChange,
  horizon,
  onHorizonChange,
}: Props) {
  const visibleRows = rows
    .filter((row) => (horizon === "all" ? true : row.prediction_horizon === horizon))
    .sort((a, b) => a.ticker.localeCompare(b.ticker) || a.username.localeCompare(b.username));

  const controls = (
    <Group className="prediction-controls" justify="flex-end" gap="sm">
      <DashboardViewToggle value={view} onChange={onViewChange} label="Latest prediction view" />
      <PredictionHorizonSelector value={horizon} onChange={onHorizonChange} />
    </Group>
  );

  return (
    <SectionPanel
      title="Latest User Predictions"
      subtitle="Public user predictions. Private profiles are excluded."
      action={controls}
    >
      {loading ? (
        <Skeleton height={300} radius="sm" />
      ) : visibleRows.length === 0 ? (
        <Text c="dimmed" size="sm">
          No public user predictions match this horizon yet.
        </Text>
      ) : (
        <>
          <div className="desktop-table">
            <Table.ScrollContainer minWidth={780}>
              <Table highlightOnHover verticalSpacing="sm" className="prediction-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ticker</Table.Th>
                    <Table.Th>User</Table.Th>
                    <Table.Th className="prediction-table-center">Horizon</Table.Th>
                    <Table.Th className="prediction-table-center">Predicted</Table.Th>
                    <Table.Th className="prediction-table-center">Matures On</Table.Th>
                    <Table.Th className="prediction-table-center">Predicted On</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {visibleRows.map((row) => (
                    <Table.Tr key={row.prediction_id}>
                      <Table.Td>
                        <Text component={Link} to={`/tickers/${row.ticker}`} fw={800} className="plain-link">
                          {row.ticker}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <AvatarImage
                            profile={{
                              display_username: row.username,
                              avatar_seed: row.avatar_seed,
                              avatar_options: row.avatar_options,
                            }}
                            size={34}
                          />
                          <Text fw={800}>{row.username}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td className="prediction-table-center">
                        <Badge variant="light" color="green">
                          {formatHorizon(row.prediction_horizon)}
                        </Badge>
                      </Table.Td>
                      <Table.Td className="prediction-table-center">
                        <Text fw={850}>{formatCurrency(row.predicted_close)}</Text>
                        <Text size="xs" className={row.predicted_return >= 0 ? "prediction-return-up" : "prediction-return-down"}>
                          {formatSignedPercent(row.predicted_return)}
                        </Text>
                      </Table.Td>
                      <Table.Td className="prediction-table-center">{formatDate(row.target_date)}</Table.Td>
                      <Table.Td className="prediction-table-center">{formatDate(row.prediction_date)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </div>
          <div className="mobile-cards">
            <div className="prediction-card-list">
              {visibleRows.map((row) => (
                <article className="prediction-card" key={row.prediction_id}>
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <div className="prediction-card-copy">
                      <Text component={Link} to={`/tickers/${row.ticker}`} fw={800} className="plain-link">
                        {row.ticker}
                      </Text>
                      <Group gap="xs">
                        <AvatarImage
                          profile={{
                            display_username: row.username,
                            avatar_seed: row.avatar_seed,
                            avatar_options: row.avatar_options,
                          }}
                          size={28}
                        />
                        <Text size="sm" fw={800}>
                          {row.username}
                        </Text>
                      </Group>
                    </div>
                    <Badge variant="light" color="green">
                      {formatHorizon(row.prediction_horizon)}
                    </Badge>
                  </Group>
                  <Group mt="sm" justify="space-between">
                    <Text size="xs" c="dimmed">
                      Predicted
                    </Text>
                    <Text fw={850}>{formatCurrency(row.predicted_close)}</Text>
                  </Group>
                  <Group mt={6} justify="space-between">
                    <Text size="xs" c="dimmed">
                      Matures on
                    </Text>
                    <Text size="sm">{formatDate(row.target_date)}</Text>
                  </Group>
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </SectionPanel>
  );
}
