import { Badge, Group, Progress, Skeleton, Table, Text, Tooltip } from "@mantine/core";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { FiExternalLink } from "react-icons/fi";
import { Link } from "react-router-dom";
import { fetchLeaderboardMovement, type LeaderboardMovementRow } from "../../api/competition";
import type {
  LeaderboardRow,
  MetricHorizon,
  MetricWindow,
  UserLeaderboardRow,
} from "../../api/dashboardData";
import { formatMetric, formatPercent } from "../../utils/format";
import {
  compareLeaderboardAverageError,
  formatAveragePctError,
} from "../../utils/leaderboardMetrics";
import { modelTypeColor, normalizeModelType } from "../../utils/models";
import EntityHoverCard from "../cards/EntityHoverCard";
import LeaderboardMovementBadge from "../competition/LeaderboardMovementBadge";
import type { DashboardView } from "../dashboard/DashboardViewToggle";
import DashboardViewToggle from "../dashboard/DashboardViewToggle";
import RulesLink from "../help/RulesLink";
import SectionPanel from "../layout/SectionPanel";
import AvatarImage from "../users/AvatarImage";
import HorizonSelector from "./HorizonSelector";

type Props = {
  rows: LeaderboardRow[];
  userRows: UserLeaderboardRow[];
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  window: MetricWindow;
  horizon: MetricHorizon;
  onHorizonChange: (horizon: MetricHorizon) => void;
  loading: boolean;
};

type DisplayLeaderboardRow = LeaderboardRow | UserLeaderboardRow;

export default function LeaderboardTable({
  rows,
  userRows,
  view,
  onViewChange,
  window,
  horizon,
  onHorizonChange,
  loading,
}: Props) {
  const [movementRows, setMovementRows] = useState<LeaderboardMovementRow[]>([]);
  const sourceRows: DisplayLeaderboardRow[] = view === "models" ? rows : userRows;
  const visibleRows = sourceRows
    .filter((row) => row.window === window && row.prediction_horizon === horizon)
    .sort(
      (a, b) =>
        compareLeaderboardAverageError(a, b) ||
        (b.directional_accuracy ?? -1) - (a.directional_accuracy ?? -1) ||
        b.prediction_count - a.prediction_count,
    );
  const movementByUserId = useMemo(
    () => new Map(movementRows.map((row) => [row.user_id, row])),
    [movementRows],
  );
  const emptyMessage =
    horizon === "1y"
      ? "1Y rows need a full year to mature. Rankings will appear once those target closes arrive."
      : "No scored predictions yet for this horizon. Leaderboard rows will appear after target closes arrive.";

  useEffect(() => {
    let active = true;
    if (view !== "users") {
      setMovementRows([]);
      return undefined;
    }

    fetchLeaderboardMovement(window, horizon)
      .then((nextRows) => {
        if (active) setMovementRows(nextRows);
      })
      .catch(() => {
        if (active) setMovementRows([]);
      });

    return () => {
      active = false;
    };
  }, [horizon, view, window]);

  return (
    <SectionPanel
      title="Leaderboard"
      className="leaderboard-panel"
      action={
        <RulesLink
          section="leaderboards"
          compact
          iconOnly
          tooltipLabel="Learn more about leaderboard rules."
        >
          Leaderboard rules
        </RulesLink>
      }
    >
      <div className="leaderboard-horizon-control">
        <DashboardViewToggle value={view} onChange={onViewChange} label="Leaderboard view" />
        <HorizonSelector value={horizon} onChange={onHorizonChange} />
      </div>
      {loading ? (
        <Skeleton height={300} radius="sm" />
      ) : visibleRows.length === 0 ? (
        <Text c="dimmed" size="sm">
          {emptyMessage}
        </Text>
      ) : (
        <>
          <div className="desktop-table">
            <Table.ScrollContainer minWidth={780}>
              <Table verticalSpacing="md" className="leaderboard-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th className="leaderboard-table-center">Rank</Table.Th>
                    <Table.Th>{view === "models" ? "Model" : "User"}</Table.Th>
                    <MetricHeader
                      label="Avg Error"
                      tooltip="Average absolute percent error. Lower is better."
                      className="leaderboard-table-center"
                    />
                    <MetricHeader
                      label="Directional"
                      tooltip={
                        view === "models"
                          ? "How often the model correctly predicted whether price moved up or down."
                          : "How often the user correctly predicted whether price moved up or down."
                      }
                      className="leaderboard-table-center"
                    />
                    {view === "models" ? (
                      <MetricHeader
                        label="Winkler"
                        tooltip="Interval score that rewards accurate, tighter prediction ranges. Lower is better."
                        className="leaderboard-table-center"
                      />
                    ) : (
                      <MetricHeader
                        label="Winkler"
                        tooltip="User predictions are point estimates in this MVP."
                        className="leaderboard-table-center"
                      />
                    )}
                    <MetricHeader
                      label="Scored"
                      tooltip="Number of matured predictions included in this leaderboard row."
                      className="leaderboard-table-center score-column"
                    />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {visibleRows.map((row, index) => {
                    const isModelRow = "model_slug" in row;
                    const displayRank = index + 1;
                    return (
                      <motion.tr
                        key={`${row.window}-${row.prediction_horizon}-${isModelRow ? row.model_slug : row.user_id}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        whileHover={{ x: 4 }}
                        transition={{ duration: 0.2, delay: index * 0.025 }}
                        className={`leaderboard-row ${isModelRow && row.model_slug === "baseline" ? "baseline-row" : ""}`}
                      >
                        <Table.Td className="leaderboard-table-center">
                          <Group gap="xs" justify="center" wrap="nowrap">
                            <Text fw={800}>{row.rank ? `#${displayRank}` : "Pending"}</Text>
                            {!isModelRow ? (
                              <LeaderboardMovementBadge movement={movementByUserId.get((row as UserLeaderboardRow).user_id)} />
                            ) : null}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          {isModelRow ? (
                            <ModelIdentity row={row} />
                          ) : (
                            <EntityHoverCard kind="user" username={row.username}>
                              <Group gap="xs" wrap="nowrap" className="user-cell-link">
                                <AvatarImage
                                  profile={{
                                    display_username: row.username,
                                    avatar_seed: row.avatar_seed,
                                    avatar_options: row.avatar_options,
                                  }}
                                  size={38}
                                />
                                <Text component={Link} to={`/users/${row.username}`} fw={800} className="plain-link">
                                  {row.username}
                                </Text>
                              </Group>
                            </EntityHoverCard>
                          )}
                        </Table.Td>
                    <Table.Td className="leaderboard-table-center">{formatAveragePctError(row)}</Table.Td>
                    <Table.Td className="leaderboard-table-center">
                      {isBaselineModelRow(row) ? (
                        <Text size="sm" c="dimmed">—</Text>
                      ) : (
                        <Group gap="xs" wrap="nowrap" justify="center">
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
                      )}
                    </Table.Td>
                        <Table.Td className="leaderboard-table-center">
                          {isModelRow ? formatMetric(row.winkler_score) : "-"}
                        </Table.Td>
                        <Table.Td className="leaderboard-table-center score-column">
                          <ScoredCount row={row} isModelRow={isModelRow} />
                        </Table.Td>
                      </motion.tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </div>
          <div className="mobile-cards">
            <div className="leaderboard-card-list">
              {visibleRows.map((row, index) => {
                const isModelRow = "model_slug" in row;
                const displayRank = index + 1;
                const isBaseline = isModelRow && row.model_slug === "baseline";
                const isMedal = !isBaseline && Boolean(row.rank) && displayRank <= 3;
                return (
                  <article
                    key={`card-${row.window}-${row.prediction_horizon}-${isModelRow ? row.model_slug : row.user_id}`}
                    className={`leaderboard-card${isMedal ? ` leaderboard-card--rank-${displayRank}` : ""}${isBaseline ? " baseline-row" : ""}`}
                  >
                    <div className="leaderboard-card-head">
                      <span
                        className={`leaderboard-card-rank${isMedal ? ` leaderboard-card-rank--${displayRank}` : ""}`}
                      >
                        {row.rank ? `#${displayRank}` : "Pending"}
                      </span>
                      <div className="leaderboard-card-identity">
                        {isModelRow ? (
                          <ModelIdentity row={row} />
                        ) : (
                          <EntityHoverCard kind="user" username={row.username}>
                            <Group gap="xs" wrap="nowrap" className="user-cell-link">
                              <AvatarImage
                                profile={{
                                  display_username: row.username,
                                  avatar_seed: row.avatar_seed,
                                  avatar_options: row.avatar_options,
                                }}
                                size={34}
                              />
                              <Text component={Link} to={`/users/${row.username}`} fw={800} className="plain-link">
                                {row.username}
                              </Text>
                            </Group>
                          </EntityHoverCard>
                        )}
                      </div>
                      {!isModelRow ? (
                        <LeaderboardMovementBadge
                          movement={movementByUserId.get((row as UserLeaderboardRow).user_id)}
                        />
                      ) : null}
                    </div>
                    <dl className="leaderboard-card-stats">
                      <div>
                        <dt>Avg Error</dt>
                        <dd>{formatAveragePctError(row)}</dd>
                      </div>
                      <div>
                        <dt>Directional</dt>
                        <dd>{isBaselineModelRow(row) ? "—" : formatPercent(row.directional_accuracy)}</dd>
                      </div>
                      <div>
                        <dt>Winkler</dt>
                        <dd>{isModelRow ? formatMetric(row.winkler_score) : "-"}</dd>
                      </div>
                      <div>
                        <dt>Scored</dt>
                        <dd><ScoredCount row={row} isModelRow={isModelRow} /></dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </div>
        </>
      )}
    </SectionPanel>
  );
}

function ScoredCount({
  row,
  isModelRow,
}: {
  row: DisplayLeaderboardRow;
  isModelRow: boolean;
}) {
  const count = row.prediction_count.toLocaleString();
  if (isModelRow) {
    return <>{count}</>;
  }

  const userRow = row as UserLeaderboardRow;
  return (
    <Text
      component={Link}
      to={`/users/${userRow.username}/scored?window=${row.window}&horizon=${row.prediction_horizon}`}
      className="leaderboard-score-link"
      fw={850}
    >
      {count}
    </Text>
  );
}

function ModelIdentity({ row }: { row: LeaderboardRow }) {
  const modelType = normalizeModelType(row.model_type);

  return (
    <Group gap="xs">
      <EntityHoverCard kind="model" slug={row.model_slug} name={row.model_name}>
        <Text
          component={Link}
          to={`/models/${row.model_slug}`}
          fw={800}
          className="leaderboard-model-link"
        >
          <span>{row.model_name}</span>
          <FiExternalLink aria-hidden />
        </Text>
      </EntityHoverCard>
      <Badge color={modelTypeColor(modelType)}>{modelType}</Badge>
    </Group>
  );
}

function isBaselineModelRow(row: DisplayLeaderboardRow) {
  return "model_slug" in row && row.model_slug === "baseline";
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
