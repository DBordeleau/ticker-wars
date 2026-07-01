import { Badge, Tooltip } from "@mantine/core";
import { FiArrowDown, FiArrowUp, FiMinus, FiStar } from "react-icons/fi";
import type { LeaderboardMovementRow } from "../../api/competition";

type Props = {
  movement?: LeaderboardMovementRow;
};

export default function LeaderboardMovementBadge({ movement }: Props) {
  if (!movement) return null;

  const delta = movement.rank_delta ?? 0;
  const meta = getMovementMeta(movement.movement_label, delta);

  return (
    <Tooltip label={meta.tooltip} openDelay={250}>
      <Badge className={`leaderboard-movement leaderboard-movement--${meta.variant}`} leftSection={<meta.Icon />}>
        {meta.label}
      </Badge>
    </Tooltip>
  );
}

function getMovementMeta(label: LeaderboardMovementRow["movement_label"], delta: number) {
  if (label === "new") {
    return {
      variant: "new",
      label: "New",
      tooltip: "New to this leaderboard.",
      Icon: FiStar,
    };
  }
  if (delta > 0) {
    return {
      variant: "up",
      label: `+${delta}`,
      tooltip: `Moved up ${delta} rank${delta === 1 ? "" : "s"} since the last snapshot.`,
      Icon: FiArrowUp,
    };
  }
  if (delta < 0) {
    return {
      variant: "down",
      label: `${delta}`,
      tooltip: `Moved down ${Math.abs(delta)} rank${delta === -1 ? "" : "s"} since the last snapshot.`,
      Icon: FiArrowDown,
    };
  }
  return {
    variant: "steady",
    label: "Even",
    tooltip: "Holding the same rank since the last snapshot.",
    Icon: FiMinus,
  };
}
