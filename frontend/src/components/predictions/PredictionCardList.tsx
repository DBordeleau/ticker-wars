import { Badge, Group, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import type { LatestPrediction } from "../../api/dashboardData";
import {
  formatCurrency,
  formatDate,
  formatHorizon,
} from "../../utils/format";
import PredictionValue from "./PredictionValue";
import UserPredictionButton from "./UserPredictionButton";

type Props = {
  rows: LatestPrediction[];
};

export default function PredictionCardList({ rows }: Props) {
  return (
    <div className="prediction-card-list">
      {rows.map((row) => (
        <article className="prediction-card" key={row.prediction_id}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div className="prediction-card-copy">
              <Text component={Link} to={`/tickers/${row.ticker}`} fw={800} className="plain-link">
                {row.ticker}
              </Text>
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
            <UserPredictionButton ticker={row.ticker} latestPredictions={rows} compact />
          </Group>
        </article>
      ))}
    </div>
  );
}
