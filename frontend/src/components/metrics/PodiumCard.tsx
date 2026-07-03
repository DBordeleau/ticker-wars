import { Badge, Card, Skeleton, Text } from "@mantine/core";
import { FaCrown, FaMedal } from "react-icons/fa";
import { FiExternalLink } from "react-icons/fi";
import { Link } from "react-router-dom";
import type { IconType } from "react-icons";
import type { LeaderboardRow, UserLeaderboardRow } from "../../api/dashboardData";
import type { DashboardView } from "../dashboard/DashboardViewToggle";
import { formatMetric, formatPercent } from "../../utils/format";
import { modelTypeColor, normalizeModelType } from "../../utils/models";
import EntityHoverCard from "../cards/EntityHoverCard";
import MagicHoverSurface from "../layout/MagicHoverSurface";
import ModelAvatar from "../landing/ModelAvatar";
import AvatarImage from "../users/AvatarImage";

export type PodiumTier = 1 | 2 | 3;

type Props = {
  tier: PodiumTier;
  view: DashboardView;
  row?: LeaderboardRow | UserLeaderboardRow;
  loading?: boolean;
};

const tierMeta: Record<PodiumTier, { variant: string; label: string; icon: IconType }> = {
  1: { variant: "gold", label: "Champion", icon: FaCrown },
  2: { variant: "silver", label: "Runner-up", icon: FaMedal },
  3: { variant: "bronze", label: "Third place", icon: FaMedal },
};

export default function PodiumCard({ tier, view, row, loading }: Props) {
  const meta = tierMeta[tier];
  const Medal = meta.icon;
  const cardClass = `metric-card podium-card podium-card--${meta.variant}${row ? "" : " podium-card--open"}`;
  const card = (
    <MagicHoverSurface className="metric-magic-surface">
      <Card className={cardClass}>
        {loading ? (
          <Skeleton height={120} radius="sm" />
        ) : (
          <>
            <div className="podium-card-top">
              <span className="podium-medal" aria-hidden>
                <Medal />
              </span>
              <span className="podium-rank-copy">
                <span className="podium-eyebrow">{meta.label}</span>
                <span className="podium-rank-num">#{tier}</span>
              </span>
              <div className="podium-identity">
                {row ? <Identity view={view} row={row} /> : <OpenIdentity view={view} />}
              </div>
            </div>
            {row ? <PodiumStats row={row} /> : <GhostStats />}
          </>
        )}
      </Card>
    </MagicHoverSurface>
  );

  if (!row || loading) {
    return card;
  }

  return view === "models" ? (
    <EntityHoverCard kind="model" slug={(row as LeaderboardRow).model_slug} name={(row as LeaderboardRow).model_name}>
      <div className="podium-hover-target">{card}</div>
    </EntityHoverCard>
  ) : (
    <EntityHoverCard kind="user" username={(row as UserLeaderboardRow).username}>
      <div className="podium-hover-target">{card}</div>
    </EntityHoverCard>
  );
}

function Identity({ view, row }: { view: DashboardView; row: LeaderboardRow | UserLeaderboardRow }) {
  const isModel = view === "models";

  return (
    <>
      {isModel ? (
        <ModelAvatar size={44} />
      ) : (
        <AvatarImage
          profile={{
            display_username: (row as UserLeaderboardRow).username,
            avatar_seed: (row as UserLeaderboardRow).avatar_seed,
            avatar_options: (row as UserLeaderboardRow).avatar_options,
          }}
          size={44}
          className="podium-avatar-img"
        />
      )}
      <div className="podium-identity-copy">
        {isModel ? (
          <ModelName row={row as LeaderboardRow} />
        ) : (
          <Link className="podium-name podium-name--link" to={`/users/${(row as UserLeaderboardRow).username}`}>
            <span>{(row as UserLeaderboardRow).username}</span>
            <FiExternalLink aria-hidden />
          </Link>
        )}
        {isModel ? (
          <ModelTypeBadge row={row as LeaderboardRow} />
        ) : (
          <span className="podium-sub">Public user</span>
        )}
      </div>
    </>
  );
}

function OpenIdentity({ view }: { view: DashboardView }) {
  return (
    <>
      <span className="podium-avatar-ghost" aria-hidden>
        ?
      </span>
      <div className="podium-identity-copy">
        <span className="podium-name podium-name--open">
          <span>Open seat</span>
        </span>
        <span className="podium-sub">
          {view === "models"
            ? "Awaiting scored predictions"
            : "Be the first to claim this spot"}
        </span>
      </div>
    </>
  );
}

function ModelName({ row }: { row: LeaderboardRow }) {
  return (
    <Text
      component={Link}
      to={`/models/${row.model_slug}`}
      className="podium-name podium-name--link"
    >
      <span>{row.model_name}</span>
      <FiExternalLink aria-hidden />
    </Text>
  );
}

function ModelTypeBadge({ row }: { row: LeaderboardRow }) {
  const modelType = normalizeModelType(row.model_type);
  return (
    <Badge color={modelTypeColor(modelType)} size="sm" className="podium-type-badge">
      {modelType}
    </Badge>
  );
}

function PodiumStats({ row }: { row: LeaderboardRow | UserLeaderboardRow }) {
  return (
    <div className="podium-stats">
      <PodiumStat label="Directional" value={formatPercent(row.directional_accuracy)} accent />
      <PodiumStat label="MAE" value={formatMetric(row.mae)} />
      <PodiumStat label="Scored" value={row.prediction_count.toLocaleString()} />
    </div>
  );
}

function GhostStats() {
  return (
    <div className="podium-stats podium-stats--ghost">
      <PodiumStat label="Directional" value="—" />
      <PodiumStat label="MAE" value="—" />
      <PodiumStat label="Scored" value="—" />
    </div>
  );
}

function PodiumStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`podium-stat${accent ? " podium-stat--accent" : ""}`}>
      <span className="podium-stat-value">{value}</span>
      <span className="podium-stat-label">{label}</span>
    </div>
  );
}
