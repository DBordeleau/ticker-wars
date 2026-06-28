import { FaCrown } from "react-icons/fa";
import type {
  LeaderboardRow,
  MetricHorizon,
  MetricWindow,
  UserLeaderboardRow,
} from "../../api/dashboardData";
import type { DashboardView } from "../dashboard/DashboardViewToggle";
import { formatHorizon } from "../../utils/format";
import PodiumCard from "./PodiumCard";
import type { PodiumTier } from "./PodiumCard";

type Props = {
  leaderboard: LeaderboardRow[];
  userLeaderboard: UserLeaderboardRow[];
  view: DashboardView;
  window: MetricWindow;
  horizon: MetricHorizon;
  loading: boolean;
};

type DisplayLeaderboardRow = LeaderboardRow | UserLeaderboardRow;

const tiers: PodiumTier[] = [1, 2, 3];

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
  // The baseline is the benchmark every model should beat, not a champion to
  // celebrate, so it is excluded from the podium (mirrors the landing board).
  const contenders = (
    view === "models"
      ? (rows as LeaderboardRow[]).filter((row) => row.model_slug !== "baseline")
      : rows
  )
    .filter((row) => row.rank != null)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .slice(0, 3);

  const horizonLabel = horizon === "all" ? "All horizons" : formatHorizon(horizon);

  return (
    <section className="metric-strip-section" aria-label="Leaderboard podium">
      <header className="metric-strip-head">
        <span className="metric-strip-eyebrow">
          <FaCrown aria-hidden /> Podium
        </span>
        <span className="metric-strip-sub">
          Top {view === "models" ? "models" : "users"} · {horizonLabel}
        </span>
      </header>
      <div className="metric-strip">
        {tiers.map((tier) => (
          <PodiumCard
            key={tier}
            tier={tier}
            view={view}
            row={contenders[tier - 1]}
            loading={loading}
          />
        ))}
      </div>
    </section>
  );
}
