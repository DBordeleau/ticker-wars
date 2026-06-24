import { Badge, Group, Progress, Skeleton, Table, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { FiExternalLink } from "react-icons/fi";
import { Link } from "react-router-dom";
import type {
  MetricHorizon,
  TickerHistoryRow,
  UserTickerLeaderboardRow,
} from "../../api/dashboardData";
import { formatMetric, formatPercent } from "../../utils/format";
import { getModelInfo, modelTypeColor } from "../../utils/models";
import type { DashboardView } from "../dashboard/DashboardViewToggle";
import DashboardViewToggle from "../dashboard/DashboardViewToggle";
import SectionPanel from "../layout/SectionPanel";
import AvatarImage from "../users/AvatarImage";
import HorizonSelector from "./HorizonSelector";

type Props = {
  ticker: string;
  history: TickerHistoryRow[];
  userRows: UserTickerLeaderboardRow[];
  loading: boolean;
};

type ModelTickerRow = {
  prediction_horizon: MetricHorizon;
  model_name: string;
  model_slug: string;
  mae: number;
  directional_accuracy: number | null;
  winkler_score: number | null;
  prediction_count: number;
  rank: number;
};

export default function TickerLeaderboard({ ticker, history, userRows, loading }: Props) {
  const [view, setView] = useState<DashboardView>("models");
  const [horizon, setHorizon] = useState<MetricHorizon>("all");
  const modelRows = useMemo(() => buildModelTickerRows(history), [history]);
  const visibleModelRows = modelRows.filter((row) => row.prediction_horizon === horizon);
  const visibleUserRows = userRows
    .filter((row) => row.ticker === ticker && row.window === "all" && row.prediction_horizon === horizon)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const emptyMessage =
    view === "models"
      ? `${ticker} model rankings will appear after scored ticker history is published.`
      : `${ticker} user rankings will appear after public user predictions for this ticker mature.`;

  return (
    <SectionPanel
      title={`${ticker} Leaderboard`}
      subtitle="Rankings scoped to predictions made for this ticker only."
      className="ticker-leaderboard-panel"
    >
      <div className="leaderboard-horizon-control">
        <DashboardViewToggle value={view} onChange={setView} label={`${ticker} leaderboard view`} />
        <HorizonSelector value={horizon} onChange={setHorizon} />
      </div>
      {loading ? (
        <Skeleton height={250} radius="sm" />
      ) : view === "models" ? (
        visibleModelRows.length === 0 ? (
          <Text c="dimmed" size="sm">
            {emptyMessage}
          </Text>
        ) : (
          <TickerLeaderboardTable rows={visibleModelRows} />
        )
      ) : visibleUserRows.length === 0 ? (
        <Text c="dimmed" size="sm">
          {emptyMessage}
        </Text>
      ) : (
        <TickerUserLeaderboardTable rows={visibleUserRows} />
      )}
    </SectionPanel>
  );
}

function TickerLeaderboardTable({ rows }: { rows: ModelTickerRow[] }) {
  return (
    <Table.ScrollContainer minWidth={720}>
      <Table verticalSpacing="md" className="leaderboard-table ticker-leaderboard-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="leaderboard-table-center">Rank</Table.Th>
            <Table.Th>Model</Table.Th>
            <Table.Th className="leaderboard-table-center">MAE</Table.Th>
            <Table.Th className="leaderboard-table-center">Directional</Table.Th>
            <Table.Th className="leaderboard-table-center">Winkler</Table.Th>
            <Table.Th className="leaderboard-table-center score-column">Scored</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => {
            const modelType = getModelInfo(row.model_slug, row.model_name).type;
            return (
              <Table.Tr key={`${row.prediction_horizon}-${row.model_slug}`}>
                <Table.Td className="leaderboard-table-center">
                  <Text fw={800}>#{row.rank}</Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Text component={Link} to={`/models/${row.model_slug}`} fw={800} className="leaderboard-model-link">
                      <span>{row.model_name}</span>
                      <FiExternalLink aria-hidden />
                    </Text>
                    <Badge color={modelTypeColor(modelType)}>{modelType}</Badge>
                  </Group>
                </Table.Td>
                <Table.Td className="leaderboard-table-center">{formatMetric(row.mae)}</Table.Td>
                <Table.Td className="leaderboard-table-center">
                  <DirectionalMeter value={row.directional_accuracy} />
                </Table.Td>
                <Table.Td className="leaderboard-table-center">{formatMetric(row.winkler_score)}</Table.Td>
                <Table.Td className="leaderboard-table-center score-column">{row.prediction_count}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function TickerUserLeaderboardTable({ rows }: { rows: UserTickerLeaderboardRow[] }) {
  return (
    <Table.ScrollContainer minWidth={660}>
      <Table verticalSpacing="md" className="leaderboard-table ticker-leaderboard-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="leaderboard-table-center">Rank</Table.Th>
            <Table.Th>User</Table.Th>
            <Table.Th className="leaderboard-table-center">MAE</Table.Th>
            <Table.Th className="leaderboard-table-center">Directional</Table.Th>
            <Table.Th className="leaderboard-table-center score-column">Scored</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={`${row.ticker}-${row.prediction_horizon}-${row.user_id}`}>
              <Table.Td className="leaderboard-table-center">
                <Text fw={800}>{row.rank ? `#${row.rank}` : "Pending"}</Text>
              </Table.Td>
              <Table.Td>
                <Group gap="xs" wrap="nowrap">
                  <AvatarImage
                    profile={{
                      display_username: row.username,
                      avatar_seed: row.avatar_seed,
                      avatar_options: row.avatar_options,
                    }}
                    size={38}
                  />
                  <Text fw={800}>{row.username}</Text>
                </Group>
              </Table.Td>
              <Table.Td className="leaderboard-table-center">{formatMetric(row.mae)}</Table.Td>
              <Table.Td className="leaderboard-table-center">
                <DirectionalMeter value={row.directional_accuracy} />
              </Table.Td>
              <Table.Td className="leaderboard-table-center score-column">
                {row.prediction_count.toLocaleString()}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function DirectionalMeter({ value }: { value: number | null }) {
  return (
    <Group gap="xs" wrap="nowrap" justify="center">
      <Progress.Root className="direction-progress" size="lg">
        <Progress.Section value={value == null ? 0 : value * 100} color="green" />
        <Progress.Section value={value == null ? 100 : Math.max(0, (1 - value) * 100)} color={value == null ? "dark.3" : "red"} />
      </Progress.Root>
      <Text size="sm">{formatPercent(value)}</Text>
    </Group>
  );
}

function buildModelTickerRows(history: TickerHistoryRow[]): ModelTickerRow[] {
  const scoredRows = history.filter((row) => row.actual_close != null);
  const horizons: MetricHorizon[] = ["all", "1w", "1m", "3m", "1y"];

  return horizons.flatMap((horizon) => {
    const rows = horizon === "all" ? scoredRows : scoredRows.filter((row) => row.prediction_horizon === horizon);
    const grouped = new Map<string, TickerHistoryRow[]>();

    rows.forEach((row) => {
      const key = row.model_slug || row.model_name;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    });

    const metrics = Array.from(grouped.values())
      .map((groupRows) => {
        const first = groupRows[0];
        const absoluteErrors = groupRows.map((row) => Math.abs(row.predicted_close - (row.actual_close ?? row.predicted_close)));
        const directionScores = groupRows
          .map((row) => direction(row.predicted_return) === direction(row.actual_return ?? 0))
          .map((correct) => (correct ? 1 : 0));
        const winklerValues = groupRows
          .map((row) => row.winkler_score)
          .filter((value): value is number => value != null);

        return {
          prediction_horizon: horizon,
          model_name: first.model_name,
          model_slug: first.model_slug,
          mae: average(absoluteErrors),
          directional_accuracy: directionScores.length ? average(directionScores) : null,
          winkler_score: winklerValues.length ? average(winklerValues) : null,
          prediction_count: groupRows.length,
          rank: 0,
        };
      })
      .sort((a, b) => a.mae - b.mae || a.model_name.localeCompare(b.model_name));

    return metrics.map((row, index) => ({ ...row, rank: index + 1 }));
  });
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function direction(value: number) {
  if (value > 0) {
    return 1;
  }
  if (value < 0) {
    return -1;
  }
  return 0;
}
