import { Badge, Drawer, Group, Stack, Text, Title } from "@mantine/core";
import type { PublicModelScoredPrediction } from "../../api/modelScores";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatHorizon,
  formatMetric,
  formatPercent,
  formatPredictionRange,
  formatSignedPercent,
} from "../../utils/format";

type Props = {
  prediction: PublicModelScoredPrediction | null;
  opened: boolean;
  onClose: () => void;
};

export default function ModelScoreBreakdownDrawer({ prediction, opened, onClose }: Props) {
  const directionHit = prediction?.direction_correct === 1;
  const directionCopy = !prediction ? "Pending" : directionHit ? "Direction hit" : "Direction miss";
  const intervalCopy =
    prediction?.interval_hit == null
      ? "Interval pending"
      : prediction.interval_hit
        ? "Interval hit"
        : "Interval miss";

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      title="Score breakdown"
      className="score-breakdown-drawer"
    >
      {prediction ? (
        <Stack gap="md">
          <div className="score-breakdown-hero">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text className="score-breakdown-eyebrow">
                  {prediction.ticker} {formatHorizon(prediction.prediction_horizon)}
                </Text>
                <Title order={2} className="score-breakdown-title">
                  {prediction.model_name}
                </Title>
              </div>
              <Badge variant="light" color={directionHit ? "green" : "red"}>
                {directionCopy}
              </Badge>
            </Group>
            <Text className="score-breakdown-xp">
              {formatPercent(prediction.absolute_pct_error, 2)} error
            </Text>
          </div>

          <div className="score-breakdown-grid">
            <BreakdownStat
              label="Predicted"
              value={formatCurrency(prediction.predicted_close)}
              detail={formatSignedPercent(prediction.predicted_return)}
            />
            <BreakdownStat
              label="Actual"
              value={formatCurrency(prediction.actual_close)}
              detail={formatSignedPercent(prediction.actual_return)}
            />
            <BreakdownStat label="Percent error" value={formatPercent(prediction.absolute_pct_error, 2)} />
            <BreakdownStat label="Price error" value={formatCurrency(prediction.absolute_error)} />
            <BreakdownStat label="Reference" value={formatCurrency(prediction.reference_close)} />
            <BreakdownStat label="Scored" value={formatDateTime(prediction.scored_at)} />
            <BreakdownStat label="Winkler" value={formatMetric(prediction.winkler_score)} />
            <BreakdownStat
              label="Interval"
              value={intervalCopy}
              detail={
                prediction.predicted_close_lower == null || prediction.predicted_close_upper == null
                  ? undefined
                  : formatPredictionRange(
                      prediction.predicted_close_lower,
                      prediction.predicted_close_upper,
                      prediction.interval_level,
                    )
              }
            />
          </div>

          <Group gap="xs">
            <Badge variant="light" color={directionHit ? "green" : "red"}>
              {directionCopy}
            </Badge>
            <Badge variant="light" color={prediction.interval_hit ? "green" : "gray"}>
              {intervalCopy}
            </Badge>
            <Badge variant="light" color="gray">
              Prediction date {formatDate(prediction.prediction_date)}
            </Badge>
            <Badge variant="light" color="gray">
              Matured {formatDate(prediction.target_date)}
            </Badge>
          </Group>

          <Text size="sm" className="score-breakdown-explanation">
            This model prediction was {formatPercent(prediction.absolute_pct_error, 2)} away from the final
            close on a {formatHorizon(prediction.prediction_horizon)} horizon. The stock moved{" "}
            {directionName(prediction.actual_direction)} and the model predicted{" "}
            {directionName(prediction.predicted_direction)}, so this was a{" "}
            {directionHit ? "direction hit" : "direction miss"}. Winkler score reflects the interval quality
            when a prediction range is available.
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
