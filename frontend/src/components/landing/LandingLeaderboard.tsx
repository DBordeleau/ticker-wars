import { Progress, Skeleton, Text } from "@mantine/core";
import { motion } from "framer-motion";
import { useMemo } from "react";
import type { AvatarOptions } from "../../auth/types";
import type { LeaderboardRow, UserLeaderboardRow } from "../../api/dashboardData";
import { formatPercent } from "../../utils/format";
import { getAveragePctError } from "../../utils/leaderboardMetrics";
import EntityHoverCard from "../cards/EntityHoverCard";
import MagicHoverSurface from "../layout/MagicHoverSurface";
import AvatarImage from "../users/AvatarImage";
import ModelAvatar from "./ModelAvatar";

type Props = {
  modelRows: LeaderboardRow[];
  userRows: UserLeaderboardRow[];
  loading: boolean;
  onUserProfileClick?: (username: string) => void;
};

type CombinedRow = {
  key: string;
  kind: "model" | "user";
  name: string;
  averageError: number | null;
  scored: number;
  modelSlug?: string;
  avatarSeed?: string;
  avatarOptions?: AvatarOptions;
  username?: string;
};

const TOP_N = 8;

function averageErrorValue(row: { averageError: number | null }) {
  return row.averageError ?? Number.POSITIVE_INFINITY;
}

export default function LandingLeaderboard({ modelRows, userRows, loading, onUserProfileClick }: Props) {
  const combined = useMemo<CombinedRow[]>(() => {
    const models: CombinedRow[] = modelRows
      .filter((row) => row.window === "all" && row.prediction_horizon === "all")
      .filter((row) => row.model_slug !== "baseline")
      .map((row) => ({
        key: `model-${row.model_slug}`,
        kind: "model",
        name: row.model_name,
        averageError: getAveragePctError(row),
        scored: row.prediction_count,
        modelSlug: row.model_slug,
      }));

    const users: CombinedRow[] = userRows
      .filter((row) => row.window === "all" && row.prediction_horizon === "all")
      .map((row) => ({
        key: `user-${row.user_id}`,
        kind: "user",
        name: row.username,
        averageError: getAveragePctError(row),
        scored: row.prediction_count,
        avatarSeed: row.avatar_seed,
        avatarOptions: row.avatar_options,
        username: row.username,
      }));

    return [...models, ...users]
      .sort(
        (a, b) =>
          averageErrorValue(a) - averageErrorValue(b) ||
          b.scored - a.scored ||
          a.name.localeCompare(b.name),
      )
      .slice(0, TOP_N);
  }, [modelRows, userRows]);

  const headline = useMemo(() => {
    const leader = combined[0];
    if (!leader || leader.averageError == null) return null;
    const who = leader.kind === "user" ? "A human" : "A machine";
    return `${who} leads — ${leader.name} averages ${formatPercent(leader.averageError, 2)} error.`;
  }, [combined]);

  return (
    <MagicHoverSurface className="section-magic-surface landing-leaderboard-surface">
      <section className="section-panel landing-leaderboard">
        <div className="landing-leaderboard-head">
          <Text className="landing-section-eyebrow">Updated every trading day</Text>
          <Text className="landing-section-title">Live leaderboard</Text>
          <Text className="landing-section-lead">
            Compete against machine learning models and other users.
          </Text>
          {headline ? <Text className="landing-leaderboard-headline">{headline}</Text> : null}
        </div>

        {loading ? (
          <Skeleton height={320} radius="sm" />
        ) : combined.length === 0 ? (
          <Text c="dimmed" size="sm" ta="center">
            Rankings appear once predictions mature and are scored. Be the first to put a human on
            the board.
          </Text>
        ) : (
          <div className="landing-leaderboard-rows">
            {combined.map((row, index) => (
              <motion.div
                key={row.key}
                className={`landing-leaderboard-row rank-${index + 1}`}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ amount: 0.6 }}
                transition={{ duration: 0.3, delay: index * 0.04 }}
              >
                <span className={`landing-rank landing-rank-${index + 1}`}>{index + 1}</span>
                {row.kind === "model" && row.modelSlug ? (
                  <EntityHoverCard kind="model" slug={row.modelSlug} name={row.name}>
                    <div className="landing-leaderboard-name">
                      <ModelAvatar size={34} />
                      <span className="landing-competitor-name">{row.name}</span>
                    </div>
                  </EntityHoverCard>
                ) : (
                  <EntityHoverCard
                    kind="user"
                    username={row.username ?? row.name}
                    onProfileClick={onUserProfileClick}
                  >
                    <div className="landing-leaderboard-name">
                      <AvatarImage
                        profile={{
                          display_username: row.username ?? row.name,
                          avatar_seed: row.avatarSeed ?? row.name,
                          avatar_options: row.avatarOptions as AvatarOptions,
                        }}
                        size={34}
                      />
                      <span className="landing-competitor-name">{row.name}</span>
                    </div>
                  </EntityHoverCard>
                )}
                <div className="landing-leaderboard-acc">
                  <Progress.Root size="lg" className="landing-acc-bar">
                    <Progress.Section
                      value={row.averageError == null ? 0 : Math.min(100, row.averageError * 100)}
                      color="green"
                    />
                  </Progress.Root>
                  <span className="landing-acc-value">{formatPercent(row.averageError, 2)}</span>
                </div>
                <span className="landing-leaderboard-scored">
                  {row.scored.toLocaleString()} scored
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </MagicHoverSurface>
  );
}
