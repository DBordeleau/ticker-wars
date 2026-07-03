import { Badge, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { PublicProfilePrediction } from "../../api/publicProfiles";
import { formatCurrency, formatDate, formatHorizon, formatSignedPercent } from "../../utils/format";
import ScoreVerdictBadge from "./ScoreVerdictBadge";
import EntityHoverCard from "../cards/EntityHoverCard";
import TickerLogoMark from "../tickers/TickerLogoMark";
import PredictionPrivacyIndicator from "./PredictionPrivacyIndicator";

type Props = {
  prediction: PublicProfilePrediction;
  tickerLogos?: Record<string, string | null>;
  onScoreClick?: (prediction: PublicProfilePrediction) => void;
};

export default function PublicPredictionCard({ prediction, tickerLogos = {}, onScoreClick }: Props) {
  const hasPublicValue = !prediction.public_details_hidden && prediction.predicted_close != null;
  const logoUrl = tickerLogos[prediction.ticker];
  const canOpenScore = prediction.status === "scored" && Boolean(onScoreClick);

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
        <PredictionStat
          label={prediction.status === "scored" ? "Predicted" : "Call"}
          value={
            hasPublicValue ? (
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
            ) : (
              <PredictionPrivacyIndicator compact={false} />
            )
          }
        />
        {prediction.status === "scored" ? (
          <PredictionStat
            label="Actual"
            value={
              prediction.actual_close == null ? (
                "-"
              ) : (
                <span>
                  {formatCurrency(prediction.actual_close)}
                  {prediction.actual_return != null ? (
                    <span className="public-prediction-return">
                      {formatSignedPercent(prediction.actual_return)}
                    </span>
                  ) : null}
                </span>
              )
            }
          />
        ) : (
          <PredictionStat label="Matures" value={formatDate(prediction.target_date)} />
        )}
      </div>

      <Group justify="space-between" mt="sm">
        <Text size="xs" c="dimmed" fw={700}>
          Predicted {formatDate(prediction.prediction_date)}
        </Text>
        {prediction.status === "scored" ? (
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
        ) : null}
      </Group>
    </article>
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
