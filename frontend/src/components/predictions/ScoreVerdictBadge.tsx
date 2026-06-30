import { Badge } from "@mantine/core";
import { isScoreVerdict, VERDICT_COLORS, VERDICT_LABELS } from "../../api/gamification";
import type { UserPredictionScore } from "../../api/userPredictions";

type Props = {
  score: UserPredictionScore | null | undefined;
  onClick?: () => void;
};

export default function ScoreVerdictBadge({ score, onClick }: Props) {
  const verdict = score?.score_verdict;
  const known = isScoreVerdict(verdict);
  const label = known ? VERDICT_LABELS[verdict] : "Scored";
  const color = known ? VERDICT_COLORS[verdict] : "gray";
  const className = `score-verdict-badge score-verdict-${known ? verdict : "unknown"}${
    onClick ? " score-verdict-clickable" : ""
  }`;

  return (
    <Badge
      component={onClick ? "button" : "span"}
      type={onClick ? "button" : undefined}
      variant="light"
      color={color}
      className={className}
      onClick={onClick}
    >
      {label}
    </Badge>
  );
}
