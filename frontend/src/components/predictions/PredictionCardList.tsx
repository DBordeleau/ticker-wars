import { Badge, Group, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import type { LatestPrediction } from "../../api/dashboardData";
import { formatCurrency, formatSignedPercent } from "../../utils/format";

type Props = {
  rows: LatestPrediction[];
};

export default function PredictionCardList({ rows }: Props) {
  return (
    <div className="prediction-card-list">
      {rows.map((row) => (
        <article className="prediction-card" key={`${row.target_date}-${row.ticker}-${row.model_slug}`}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div className="prediction-card-copy">
              <Text component={Link} to={`/tickers/${row.ticker}`} fw={800} className="plain-link">
                {row.ticker}
              </Text>
              <Text component={Link} to={`/models/${row.model_slug}`} size="sm" c="dimmed" className="plain-link prediction-card-model">
                {row.model_name}
              </Text>
            </div>
            <Badge color={row.predicted_return >= 0 ? "green" : "red"}>
              {formatSignedPercent(row.predicted_return)}
            </Badge>
          </Group>
          <Group mt="sm" justify="space-between">
            <Text size="xs" c="dimmed">
              Predicted close
            </Text>
            <Text fw={700}>{formatCurrency(row.predicted_close)}</Text>
          </Group>
        </article>
      ))}
    </div>
  );
}
