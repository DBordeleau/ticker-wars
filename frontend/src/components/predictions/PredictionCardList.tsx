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
};

export default function PredictionCardList({
  rows,
  latestPredictions = rows,
  onPredictionSaved,
  tickerLogos = {},
}: Props) {
  return (
    <div className="prediction-card-list">
      {rows.map((row) => (
        <article className="prediction-card" key={row.prediction_id}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div className="prediction-card-copy">
              <Group gap="xs" wrap="nowrap" className="ticker-card-heading">
                <TickerLogoMark ticker={row.ticker} logoUrl={tickerLogos[row.ticker]} />
                <Text component={Link} to={`/tickers/${row.ticker}`} fw={800} className="plain-link">
                  {row.ticker}
                </Text>
              </Group>
              <Text component={Link} to={`/models/${row.model_slug}`} size="sm" c="dimmed" className="plain-link prediction-card-model">
                {row.model_name}
              </Text>
            </div>
            <Badge variant="light" color="green">
              {formatHorizon(row.prediction_horizon)}
            </Badge>
          </Group>
          <Group mt="sm" justify="space-between">
            <Text size="xs" c="dimmed">
              Reference
            </Text>
            <Text size="sm" fw={800}>{formatCurrency(row.reference_close)}</Text>
          </Group>
          <Group mt={6} justify="space-between">
            <Text size="xs" c="dimmed">
              Predicted
            </Text>
            <PredictionValue row={row} align="right" />
          </Group>
          <Group mt={6} justify="space-between">
            <Text size="xs" c="dimmed">
              Matures on
            </Text>
            <Text size="sm">{formatDate(row.target_date)}</Text>
          </Group>
          <Group mt={6} justify="space-between">
            <Text size="xs" c="dimmed">
              Predicted on
            </Text>
            <Text size="sm">{formatDate(row.prediction_date)}</Text>
          </Group>
          <Group mt="sm" justify="flex-end">
            <UserPredictionButton
              ticker={row.ticker}
              latestPredictions={latestPredictions}
              compact
              onSaved={onPredictionSaved}
            />
          </Group>
        </article>
      ))}
    </div>
  );
}
