import { Badge, Group, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import type { LatestPrediction } from "../../api/dashboardData";
import type { UserPrediction } from "../../api/userPredictions";
import {
  formatCurrency,
  formatDate,
  formatHorizon,
} from "../../utils/format";
import TickerLogoMark from "../tickers/TickerLogoMark";
import PredictionValue from "./PredictionValue";
import UserPredictionButton from "./UserPredictionButton";

type Props = {
  rows: LatestPrediction[];
  latestPredictions?: LatestPrediction[];
  onPredictionSaved?: (prediction: UserPrediction) => void;
  tickerLogos?: Record<string, string | null>;
  // On a single-model page (ModelDetail) every card is the same model, so the
  // model name is redundant noise; hide it to keep the card compact.
  hideModel?: boolean;
};

export default function PredictionCardList({
  rows,
  latestPredictions = rows,
  onPredictionSaved,
  tickerLogos = {},
  hideModel = false,
}: Props) {
  return (
    <div className="prediction-card-list">
      {rows.map((row) => (
        <article className="prediction-card" key={row.prediction_id}>
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
            <div className="prediction-card-copy">
              <Group gap="xs" wrap="nowrap" className="ticker-card-heading">
                <TickerLogoMark ticker={row.ticker} logoUrl={tickerLogos[row.ticker]} />
                <Text component={Link} to={`/tickers/${row.ticker}`} fw={800} className="plain-link">
                  {row.ticker}
                </Text>
                <Badge variant="light" color="green">
                  {formatHorizon(row.prediction_horizon)}
                </Badge>
              </Group>
              {hideModel ? null : (
                <Text
                  component={Link}
                  to={`/models/${row.model_slug}`}
                  size="sm"
                  c="dimmed"
                  className="plain-link prediction-card-model"
                >
                  {row.model_name}
                </Text>
              )}
            </div>
            <UserPredictionButton
              ticker={row.ticker}
              latestPredictions={latestPredictions}
              compact
              onSaved={onPredictionSaved}
            />
          </Group>
          <div className="prediction-card-stats">
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Reference
              </Text>
              <Text size="sm" fw={800}>{formatCurrency(row.reference_close)}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Predicted
              </Text>
              <PredictionValue row={row} align="right" />
            </Group>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Matures on
              </Text>
              <Text size="sm">{formatDate(row.target_date)}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Predicted on
              </Text>
              <Text size="sm">{formatDate(row.prediction_date)}</Text>
            </Group>
          </div>
        </article>
      ))}
    </div>
  );
}
