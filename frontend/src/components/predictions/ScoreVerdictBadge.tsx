import { Badge } from "@mantine/core";
import { FiInfo } from "react-icons/fi";
import {
  isScoreVerdict,
  verdictForScore,
  VERDICT_COLORS,
  VERDICT_LABELS,
} from "../../api/gamification";
import type { UserPredictionScore } from "../../api/userPredictions";

type Props = {
  score:
    | (Pick<UserPredictionScore, "score_verdict" | "absolute_pct_error"> &
        Partial<Pick<UserPredictionScore, "prediction_horizon" | "direction_correct">>)
    | null
    | undefined;
  onClick?: () => void;
};

export default function ScoreVerdictBadge({ score, onClick }: Props) {
  const storedVerdict = score?.score_verdict;
  const computedVerdict = verdictForScore({
    absolutePctError: score?.absolute_pct_error,
    predictionHorizon: score?.prediction_horizon,
    directionCorrect: score?.direction_correct,
  });
  const verdict = computedVerdict ?? (isScoreVerdict(storedVerdict) ? storedVerdict : null);
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
      rightSection={onClick ? <FiInfo aria-hidden /> : undefined}
      className={className}
      aria-label={onClick ? `${label}. Open score breakdown.` : undefined}
      title={onClick ? "Open score breakdown" : undefined}
      onClick={onClick}
    >
      {label}
    </Badge>
  );
}
