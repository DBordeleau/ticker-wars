import { FiAward, FiTarget, FiTrendingUp } from "react-icons/fi";
import type { LeaderboardRow, MetricWindow } from "../../api/dashboardData";
import { formatMetric, formatPercent } from "../../utils/format";
import MetricCard from "./MetricCard";

type Props = {
  leaderboard: LeaderboardRow[];
  window: MetricWindow;
  loading: boolean;
};

export default function MetricStrip({ leaderboard, window, loading }: Props) {
  const rows = leaderboard.filter((row) => row.window === window);
  const ranked = rows.filter((row) => row.rank != null).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const bestByMae = ranked[0];
  const bestDirection = [...rows]
    .filter((row) => row.directional_accuracy != null)
    .sort((a, b) => (b.directional_accuracy ?? 0) - (a.directional_accuracy ?? 0))[0];
  const baseline = rows.find((row) => row.model_slug === "baseline");
  const windowLabel = window.toUpperCase();
  const topModelDetail =
    bestByMae?.mae == null
      ? "The top performing model is the model with the lowest mean absolute error during the selected time period."
      : `Lowest mean absolute error during the selected time period: ${windowLabel} MAE ${formatMetric(bestByMae.mae)}.`;
  const directionalDetail =
    bestDirection?.directional_accuracy == null
      ? "The directional leader is the model that most often predicted whether the next close moved up or down during the selected time period."
      : `Highest price-direction hit rate during the selected time period: ${formatPercent(bestDirection.directional_accuracy)}.`;
  const baselineDetail =
    baseline?.rank == null
      ? "The baseline predicts no price change, giving every model a simple benchmark to beat."
      : `The baseline predicts no price change and ranks #${baseline.rank} for the selected time period.`;

  return (
    <section className="metric-strip" aria-label="Dashboard summary metrics">
      <MetricCard
        label="Top Performing Model"
        value={bestByMae?.model_name ?? "Pending"}
        detail={topModelDetail}
        loading={loading}
        icon={FiAward}
      />
      <MetricCard
        label="Directional Leader"
        value={bestDirection?.model_name ?? "Pending"}
        detail={directionalDetail}
        loading={loading}
        icon={FiTrendingUp}
      />
      <MetricCard
        label="Baseline Rank"
        value={baseline?.rank ? `#${baseline.rank}` : "Pending"}
        detail={baselineDetail}
        loading={loading}
        icon={FiTarget}
      />
    </section>
  );
}
