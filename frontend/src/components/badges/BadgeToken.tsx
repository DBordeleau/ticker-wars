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
  const classes = [
    "badge-token",
    `badge-token--${badge.rarity}`,
    compact ? "badge-token--compact" : "",
    featured ? "badge-token--featured" : "",
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
      </span>
    </Tooltip>
  );
}
