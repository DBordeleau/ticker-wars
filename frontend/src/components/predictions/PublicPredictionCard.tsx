import { Badge, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TickerDisplayPrice } from "../../api/livePrices";
import type { PublicProfilePrediction } from "../../api/publicProfiles";
import { formatCurrency, formatDate, formatHorizon, formatPercent, formatSignedPercent } from "../../utils/format";
import ScoreVerdictBadge from "./ScoreVerdictBadge";
import EntityHoverCard from "../cards/EntityHoverCard";
import TickerLogoMark from "../tickers/TickerLogoMark";
import PredictionPrivacyIndicator from "./PredictionPrivacyIndicator";
import { buildTrackingSnapshot } from "./predictionPresentation";

type Props = {
  prediction: PublicProfilePrediction;
  tickerLogos?: Record<string, string | null>;
  displayPrice?: TickerDisplayPrice | null;
  onScoreClick?: (prediction: PublicProfilePrediction) => void;
};

export default function PublicPredictionCard({ prediction, tickerLogos = {}, displayPrice, onScoreClick }: Props) {
  const logoUrl = tickerLogos[prediction.ticker];
  const canOpenScore = prediction.status === "scored" && Boolean(onScoreClick);
  const tracking = buildTrackingSnapshot(prediction, displayPrice);
  const directionHit = prediction.direction_correct === 1;

  const openScore = () => {
    if (canOpenScore) {
      onScoreClick?.(prediction);
    }
  };

  return (
    <article
      className={`public-prediction-card${canOpenScore ? " public-prediction-card--clickable" : ""}`}
      role={canOpenScore ? "button" : undefined}
      tabIndex={canOpenScore ? 0 : undefined}
      onClick={openScore}
      onKeyDown={(event) => {
        if (!canOpenScore) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openScore();
        }
      }}
      aria-label={canOpenScore ? `Open score breakdown for ${prediction.ticker}` : undefined}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <EntityHoverCard kind="ticker" ticker={prediction.ticker} logoUrl={logoUrl}>
          <Group
            gap="xs"
            wrap="nowrap"
            onClick={(event) => event.stopPropagation()}
          >
            <TickerLogoMark ticker={prediction.ticker} logoUrl={logoUrl} />
            <Text component={Link} to={`/tickers/${prediction.ticker}`} fw={850} className="plain-link">
              {prediction.ticker}
            </Text>
          </Group>
        </EntityHoverCard>
        <Badge variant="light" color="green">
          {formatHorizon(prediction.prediction_horizon)}
        </Badge>
      </Group>

      <div className="public-prediction-stats">
        <PredictionStat label="Reference" value={formatCurrency(prediction.reference_close)} />
        <PredictionStat label="Predicted" value={<PredictedValue prediction={prediction} />} />
        {prediction.status === "scored" ? (
          <>
            <PredictionStat label="Actual" value={<ActualValue prediction={prediction} />} />
            <PredictionStat
              label="Final error"
              value={prediction.absolute_pct_error == null ? "-" : formatPercent(prediction.absolute_pct_error, 2)}
            />
          </>
        ) : (
          <>
            <PredictionStat
              label={tracking?.priceLabel ?? "Current"}
              value={
                tracking ? (
                  <span>
                    {formatCurrency(tracking.currentPrice)}
                    <span className="public-prediction-return">
                      {formatSignedPercent(tracking.currentReturn)}
                    </span>
                  </span>
                ) : (
                  "Pending"
                )
              }
            />
            <PredictionStat label="Tracking" value={tracking?.detail ?? "Pending"} />
          </>
        )}
      </div>

      <Group justify="space-between" mt="sm">
        <Text size="xs" c="dimmed" fw={700}>
          Predicted {formatDate(prediction.prediction_date)}
        </Text>
        {prediction.status === "scored" ? (
          <Group gap={6} wrap="nowrap">
            <Badge variant="light" color={directionHit ? "green" : "red"}>
              {directionHit ? "Direction hit" : "Direction miss"}
            </Badge>
            <ScoreVerdictBadge
              score={{
                absolute_pct_error: prediction.absolute_pct_error ?? 0,
                prediction_horizon: prediction.prediction_horizon,
                direction_correct: prediction.direction_correct ?? undefined,
                score_verdict: prediction.score_verdict,
              }}
              onClick={
                canOpenScore
                  ? () => {
                      openScore();
                    }
                  : undefined
              }
            />
          </Group>
        ) : tracking ? (
          <Badge variant="light" color={tracking.tone}>
            {tracking.label}
          </Badge>
        ) : null}
      </Group>
    </article>
  );
}

function PredictedValue({ prediction }: { prediction: PublicProfilePrediction }) {
  const hasPublicValue = !prediction.public_details_hidden && prediction.predicted_close != null;
  if (!hasPublicValue) {
    return <PredictionPrivacyIndicator compact={false} />;
  }
  return (
    <span>
      {formatCurrency(prediction.predicted_close)}
      {prediction.predicted_return != null ? (
        <span
          className={
            prediction.predicted_return >= 0
              ? "prediction-return-up public-prediction-return"
              : "prediction-return-down public-prediction-return"
          }
        >
          {formatSignedPercent(prediction.predicted_return)}
        </span>
      ) : null}
    </span>
  );
}

function ActualValue({ prediction }: { prediction: PublicProfilePrediction }) {
  if (prediction.actual_close == null) {
    return <span>-</span>;
  }
  return (
    <span>
      {formatCurrency(prediction.actual_close)}
      {prediction.actual_return != null ? (
        <span className="public-prediction-return">
          {formatSignedPercent(prediction.actual_return)}
        </span>
      ) : null}
    </span>
  );
}

function PredictionStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={800}>
        {label}
      </Text>
      <Text fw={850} component="div">
        {value}
      </Text>
    </div>
  );
}
