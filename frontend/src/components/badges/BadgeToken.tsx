import { Tooltip } from "@mantine/core";
import type { IconType } from "react-icons";
import {
  FiActivity,
  FiAward,
  FiBarChart2,
  FiCompass,
  FiCrosshair,
  FiFlag,
  FiGrid,
  FiLayers,
  FiList,
  FiMap,
  FiStar,
  FiTarget,
  FiTrendingUp,
  FiZap,
} from "react-icons/fi";
import type { BadgeDefinition } from "../../api/gamification";
import { BADGE_FLAMES, BADGE_SPARKLES, getBadgeEffects } from "./badgeEffects";

type BadgeLike = Pick<BadgeDefinition, "slug" | "name" | "description" | "rarity" | "icon_name"> & {
  title_unlock?: string | null;
};

type Props = {
  badge: BadgeLike;
  compact?: boolean;
  featured?: boolean;
  className?: string;
};

const iconMap: Record<string, IconType> = {
  activity: FiActivity,
  award: FiAward,
  bar_chart: FiBarChart2,
  bullseye: FiCrosshair,
  crown: FiStar,
  crosshair: FiCrosshair,
  flag: FiFlag,
  grid: FiGrid,
  layers: FiLayers,
  list: FiList,
  map: FiMap,
  star: FiStar,
  target: FiTarget,
  telescope: FiCompass,
  trending_up: FiTrendingUp,
  "trending-up": FiTrendingUp,
  zap: FiZap,
};

export default function BadgeToken({ badge, compact = false, featured = false, className }: Props) {
  const Icon = iconMap[badge.icon_name] ?? FiAward;
  const effects = getBadgeEffects(badge);
  const hasGlow = effects.includes("glow");
  const hasSparkle = effects.includes("sparkle");
  const hasHolo = effects.includes("holo");
  const hasFlame = effects.includes("flame");
  const classes = [
    "badge-token",
    `badge-token--${badge.rarity}`,
    compact ? "badge-token--compact" : "",
    featured ? "badge-token--featured" : "",
    hasGlow ? "badge-token--fx-glow" : "",
    hasSparkle ? "badge-token--fx-sparkle" : "",
    hasHolo ? "badge-token--fx-holo" : "",
    hasFlame ? "badge-token--fx-flame" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tooltip label={`${badge.name}: ${badge.description}`} openDelay={250} multiline maw={260}>
      <span className={classes}>
        <span className="badge-token-icon" aria-hidden>
          <Icon />
        </span>
        {compact ? null : (
          <span className="badge-token-copy">
            <span className="badge-token-name">{badge.name}</span>
          </span>
        )}
        {hasHolo ? <span className="badge-token-holo" aria-hidden /> : null}
        {hasFlame ? (
          <span className="badge-token-flames" aria-hidden>
            {BADGE_FLAMES.map((flame, index) => (
              <span
                key={index}
                className="badge-token-flame"
                style={{
                  left: flame.left,
                  width: flame.size,
                  height: flame.size * 1.7,
                  animationDelay: `${flame.delay}s`,
                }}
              />
            ))}
          </span>
        ) : null}
        {hasSparkle ? (
          <span className="badge-token-sparkles" aria-hidden>
            {BADGE_SPARKLES.map((sparkle, index) => (
              <span
                key={index}
                className="badge-token-sparkle"
                style={{
                  top: sparkle.top,
                  left: sparkle.left,
                  width: sparkle.size,
                  height: sparkle.size,
                  animationDelay: `${sparkle.delay}s`,
                }}
              />
            ))}
          </span>
        ) : null}
      </span>
    </Tooltip>
  );
}
