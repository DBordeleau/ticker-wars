import { Badge, Drawer, Group, Stack, Text, Title } from "@mantine/core";
import { isScoreVerdict, verdictForScore, VERDICT_LABELS } from "../../api/gamification";
import type { UserPrediction } from "../../api/userPredictions";
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
  prediction: UserPrediction | null;
  opened: boolean;
  onClose: () => void;
};

export default function ScoreBreakdownDrawer({ prediction, opened, onClose }: Props) {
  const score = prediction?.score ?? null;
  const verdict = score
    ? verdictForScore({
        absolutePctError: score.absolute_pct_error,
        predictionHorizon: score.prediction_horizon,
        directionCorrect: score.direction_correct,
      }) ?? score.score_verdict
    : null;
  const verdictLabel = isScoreVerdict(verdict) ? VERDICT_LABELS[verdict] : "Scored";
  const directionHit = score?.direction_correct === 1;
  const directionCopy = !score ? "Pending" : directionHit ? "Direction hit" : "Direction miss";
  const xpAwarded = score?.xp_awarded ?? 0;

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
            <BreakdownStat label="Predicted" value={formatCurrency(prediction.predicted_close)} detail={formatSignedPercent(prediction.predicted_return)} />
            <BreakdownStat label="Actual" value={formatCurrency(score.actual_close)} detail={formatSignedPercent(score.actual_return)} />
            <BreakdownStat label="Percent error" value={formatPercent(score.absolute_pct_error, 2)} />
            <BreakdownStat label="Price error" value={formatCurrency(score.absolute_error)} />
            <BreakdownStat label="Reference" value={formatCurrency(prediction.reference_close)} detail={prediction.reference_source === "live_price" ? "Live reference" : "Daily close"} />
            <BreakdownStat label="Scored" value={formatDateTime(score.scored_at)} />
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

          {prediction.edit_count > 0 ? (
            <Text size="sm" c="dimmed">
              Edited {prediction.edit_count} time{prediction.edit_count === 1 ? "" : "s"}. The latest edit
              reset the prediction date, target date, reference price, and scoring context.
            </Text>
          ) : null}

          <Text size="sm" className="score-breakdown-explanation">
            You were {formatPercent(score.absolute_pct_error, 2)} away from the final close on a{" "}
            {formatHorizon(prediction.prediction_horizon)} horizon. The stock moved{" "}
            {directionName(score.actual_direction)} and you predicted{" "}
            {directionName(score.predicted_direction)}, so this was a{" "}
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

function directionName(value: number) {
  if (value > 0) {
    return "up";
  }
  if (value < 0) {
    return "down";
  }
  return "flat";
}
