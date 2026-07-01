import { Group, Skeleton, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { FiShield, FiTarget, FiTrendingUp } from "react-icons/fi";
import { Link } from "react-router-dom";
import type { MetricHorizon, MetricWindow } from "../../api/dashboardData";
import { fetchNearbyRivals, type NearbyRivalRow } from "../../api/competition";
import { useAuth } from "../../auth/AuthProvider";
import { formatMetric } from "../../utils/format";
import EntityHoverCard from "../cards/EntityHoverCard";
import SectionPanel from "../layout/SectionPanel";
import AvatarImage from "../users/AvatarImage";

type Props = {
  window: MetricWindow;
  horizon: MetricHorizon;
};

const relationCopy = {
  catch: { label: "Catch", Icon: FiTarget },
  defend: { label: "Defend", Icon: FiShield },
  podium: { label: "Podium chase", Icon: FiTrendingUp },
};

export default function NearbyRivalsPanel({ window, horizon }: Props) {
  const { user } = useAuth();
  const [rivals, setRivals] = useState<NearbyRivalRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) {
      setRivals([]);
      return undefined;
    }

    setLoading(true);
    fetchNearbyRivals(user.id, window, horizon)
      .then((rows) => {
        if (active) setRivals(rows);
      })
      .catch(() => {
        if (active) setRivals([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [horizon, user, window]);

  if (!user) return null;

  return (
    <SectionPanel
      title="Nearby Rivals"
      subtitle="The next users around your current leaderboard lane."
      className="competition-panel"
    >
      {loading ? (
        <Skeleton height={116} radius="sm" />
      ) : rivals.length === 0 ? (
        <Text c="dimmed" size="sm">
          Rivals appear after you have a ranked public leaderboard row.
        </Text>
      ) : (
        <div className="nearby-rivals-grid">
          {rivals.map((rival) => (
            <RivalCard key={`${rival.evaluation_window}-${rival.prediction_horizon}-${rival.relation}`} rival={rival} />
          ))}
        </div>
      )}
    </SectionPanel>
  );
}

function RivalCard({ rival }: { rival: NearbyRivalRow }) {
  const meta = relationCopy[rival.relation] ?? relationCopy.catch;
  const Icon = meta.Icon;
  const rankGap = rival.rank_gap == null ? "Nearby" : `${rival.rank_gap} rank${rival.rank_gap === 1 ? "" : "s"}`;
  const maeCopy =
    rival.mae_gap == null
      ? "MAE gap pending"
      : rival.mae_gap > 0
        ? `${formatMetric(rival.mae_gap)} behind`
        : `${formatMetric(Math.abs(rival.mae_gap))} ahead`;

  return (
    <EntityHoverCard kind="user" username={rival.rival_username}>
      <Link to={`/users/${rival.rival_username}`} className="nearby-rival-card plain-link">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <span className="nearby-rival-icon" aria-hidden>
              <Icon />
            </span>
            <AvatarImage
              profile={{
                display_username: rival.rival_username,
                avatar_seed: rival.rival_avatar_seed,
                avatar_options: rival.rival_avatar_options,
              }}
              size={38}
            />
            <span className="nearby-rival-copy">
              <span className="nearby-rival-label">{meta.label}</span>
              <span className="nearby-rival-name">{rival.rival_username}</span>
            </span>
          </Group>
          <span className="nearby-rival-rank">#{rival.rival_rank ?? "?"}</span>
        </Group>
        <div className="nearby-rival-foot">
          <span>{rankGap}</span>
          <span>{maeCopy}</span>
        </div>
      </Link>
    </EntityHoverCard>
  );
}
