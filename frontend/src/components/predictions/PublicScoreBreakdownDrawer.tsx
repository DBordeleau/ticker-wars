import { Badge, Drawer, Group, Stack, Text, Title } from "@mantine/core";
import { isScoreVerdict, verdictForScore, VERDICT_LABELS } from "../../api/gamification";
import type { PublicProfilePrediction } from "../../api/publicProfiles";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatHorizon,
  formatPercent,
  formatSignedPercent,
} from "../../utils/format";
import RulesLink from "../help/RulesLink";
import ScoreVerdictBadge from "./ScoreVerdictBadge";

type Props = {
  prediction: PublicProfilePrediction | null;
  opened: boolean;
  onClose: () => void;
};

export default function PublicScoreBreakdownDrawer({ prediction, opened, onClose }: Props) {
  const score =
    prediction && prediction.status === "scored"
      ? {
          absolute_pct_error: prediction.absolute_pct_error ?? 0,
          prediction_horizon: prediction.prediction_horizon,
          direction_correct: prediction.direction_correct ?? undefined,
          score_verdict: prediction.score_verdict,
        }
      : null;
  const verdict = score
    ? verdictForScore({
        absolutePctError: score.absolute_pct_error,
        predictionHorizon: score.prediction_horizon,
        directionCorrect: score.direction_correct,
      }) ?? score.score_verdict
    : null;
  const verdictLabel = isScoreVerdict(verdict) ? VERDICT_LABELS[verdict] : "Scored";
  const directionHit = prediction?.direction_correct === 1;
  const directionCopy = !prediction ? "Pending" : directionHit ? "Direction hit" : "Direction miss";
  const xpAwarded = prediction?.xp_awarded ?? 0;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      title="Score breakdown"
      className="score-breakdown-drawer"
    >
      {prediction && score ? (
        <Stack gap="md">
          <div className="score-breakdown-hero">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text className="score-breakdown-eyebrow">
                  {prediction.ticker} {formatHorizon(prediction.prediction_horizon)}
                </Text>
                <Title order={2} className="score-breakdown-title">
                  {verdictLabel}
                </Title>
              </div>
              <ScoreVerdictBadge score={score} />
            </Group>
            <Text className="score-breakdown-xp">+{xpAwarded.toLocaleString()} XP</Text>
          </div>

          <div className="score-breakdown-grid">
            <BreakdownStat
              label="Predicted"
              value={prediction.predicted_close == null ? "Hidden" : formatCurrency(prediction.predicted_close)}
              detail={
                prediction.predicted_return == null ? undefined : formatSignedPercent(prediction.predicted_return)
              }
            />
            <BreakdownStat
              label="Actual"
              value={prediction.actual_close == null ? "-" : formatCurrency(prediction.actual_close)}
              detail={prediction.actual_return == null ? undefined : formatSignedPercent(prediction.actual_return)}
            />
            <BreakdownStat label="Percent error" value={formatPercent(prediction.absolute_pct_error, 2)} />
            <BreakdownStat
              label="Price error"
              value={prediction.absolute_error == null ? "-" : formatCurrency(prediction.absolute_error)}
            />
            <BreakdownStat label="Reference" value={formatCurrency(prediction.reference_close)} />
            <BreakdownStat label="Scored" value={formatDateTime(prediction.scored_at)} />
          </div>

          <Group gap="xs">
            <Badge variant="light" color={directionHit ? "green" : "red"}>
              {directionCopy}
            </Badge>
            <Badge variant="light" color="gray">
              Prediction date {formatDate(prediction.prediction_date)}
            </Badge>
            <Badge variant="light" color="gray">
              Matured {formatDate(prediction.target_date)}
            </Badge>
          </Group>

          <Text size="sm" className="score-breakdown-explanation">
            This prediction was {formatPercent(prediction.absolute_pct_error, 2)} away from the final
            close on a {formatHorizon(prediction.prediction_horizon)} horizon. The stock moved{" "}
            {directionName(prediction.actual_return)} and the prediction was{" "}
            {directionName(prediction.predicted_return)}, so this was a{" "}
            {directionHit ? "direction hit" : "direction miss"}. The final verdict combines
            percent error, horizon, and direction.{" "}
            <RulesLink section="verdicts" compact>Verdict rules</RulesLink>
          </Text>
        </Stack>
      ) : (
        <Text c="dimmed" size="sm">
          This prediction does not have a score breakdown yet.
        </Text>
      )}
    </Drawer>
  );
}

function BreakdownStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="score-breakdown-stat">
      <span className="score-breakdown-stat-label">{label}</span>
      <span className="score-breakdown-stat-value">{value}</span>
      {detail ? <span className="score-breakdown-stat-detail">{detail}</span> : null}
    </div>
  );
}

function directionName(value: number | null) {
  if (value == null || value === 0) {
    return "flat";
  }
  return value > 0 ? "up" : "down";
}
