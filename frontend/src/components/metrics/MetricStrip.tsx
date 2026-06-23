import { FiAward, FiTarget, FiTrendingUp } from "react-icons/fi";
import { BsAwardFill } from "react-icons/bs";
import type {
  LeaderboardRow,
  MetricHorizon,
  MetricWindow,
  UserLeaderboardRow,
} from "../../api/dashboardData";
import type { DashboardView } from "../dashboard/DashboardViewToggle";
import { formatMetric, formatPercent } from "../../utils/format";
import MetricCard from "./MetricCard";

type Props = {
  leaderboard: LeaderboardRow[];
  userLeaderboard: UserLeaderboardRow[];
  view: DashboardView;
  window: MetricWindow;
  horizon: MetricHorizon;
  loading: boolean;
};

type DisplayLeaderboardRow = LeaderboardRow | UserLeaderboardRow;

export default function MetricStrip({
  leaderboard,
  userLeaderboard,
  view,
  window,
  horizon,
  loading,
}: Props) {
  const sourceRows: DisplayLeaderboardRow[] = view === "models" ? leaderboard : userLeaderboard;
  const rows = sourceRows.filter(
    (row) => row.window === window && row.prediction_horizon === horizon,
  );
  const ranked = rows.filter((row) => row.rank != null).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const bestByMae = ranked[0];
  const bestDirection = [...rows]
    .filter((row) => row.directional_accuracy != null)
    .sort((a, b) => (b.directional_accuracy ?? 0) - (a.directional_accuracy ?? 0))[0];
  const baseline =
    view === "models" ? (rows as LeaderboardRow[]).find((row) => row.model_slug === "baseline") : undefined;
  const horizonLabel = horizon === "all" ? "pooled horizons" : horizon.toUpperCase();
  const nameFor = (row: LeaderboardRow | UserLeaderboardRow | undefined) =>
    row ? ("model_name" in row ? row.model_name : row.username) : "Pending";
  const topModelDetail =
    bestByMae?.mae == null
      ? "The top performing model is the model with the lowest mean absolute error for the selected horizon."
      : `Lowest mean absolute error for ${horizonLabel}: ${formatMetric(bestByMae.mae)}.`;
  const topUserDetail =
    bestByMae?.mae == null
      ? "The top user is the public user with the lowest mean absolute error for the selected horizon."
      : `Lowest public-user mean absolute error for ${horizonLabel}: ${formatMetric(bestByMae.mae)}.`;
  const directionalDetail =
    bestDirection?.directional_accuracy == null
      ? view === "models"
        ? "The directional leader is the model that most often predicted whether the target close moved up or down."
        : "The directional leader is the public user that most often predicted whether the target close moved up or down."
      : `Highest price-direction hit rate for ${horizonLabel}: ${formatPercent(bestDirection.directional_accuracy)}.`;
  const baselineDetail =
    baseline?.rank == null
      ? "The baseline predicts no price change, giving every model a simple benchmark to beat."
      : `The baseline predicts no price change and ranks #${baseline.rank} for ${horizonLabel}.`;
  const scoredTotal = rows.reduce((total, row) => total + row.prediction_count, 0);

  return (
    <section className="metric-strip" aria-label="Dashboard summary metrics">
      <MetricCard
        label={view === "models" ? "Top Performing Model" : "Top User"}
        value={nameFor(bestByMae)}
        detail={view === "models" ? topModelDetail : topUserDetail}
        loading={loading}
        icon={BsAwardFill}
      />
      <MetricCard
        label="Directional Leader"
        value={nameFor(bestDirection)}
        detail={directionalDetail}
        loading={loading}
        icon={FiTrendingUp}
      />
      <MetricCard
        label={view === "models" ? "Baseline Rank" : "Scored Predictions"}
        value={view === "models" ? (baseline?.rank ? `#${baseline.rank}` : "Pending") : scoredTotal.toLocaleString()}
        detail={
          view === "models"
            ? baselineDetail
            : `Public user predictions scored for ${horizonLabel}. Private users are excluded.`
        }
        loading={loading}
        icon={FiTarget}
      />
    </section>
  );
}
