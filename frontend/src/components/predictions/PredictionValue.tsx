import { Text } from "@mantine/core";
import type { LatestPrediction } from "../../api/dashboardData";
import { formatCurrency, formatSignedPercent } from "../../utils/format";

type Props = {
  row: LatestPrediction;
  align?: "left" | "center" | "right";
};

export default function PredictionValue({ row, align = "left" }: Props) {
  return (
    <div className={`prediction-value prediction-value-${align}`}>
      <Text className="prediction-price">
        {formatCurrency(row.predicted_close)}{" "}
        <span
          className={
            row.predicted_return >= 0
              ? "prediction-return prediction-return-up"
              : "prediction-return prediction-return-down"
          }
        >
          ({formatSignedPercent(row.predicted_return)})
        </span>
      </Text>
      {row.predicted_close_lower != null && row.predicted_close_upper != null ? (
        <Text size="xs" className="prediction-ci-line">
          80% CI:{" "}
          <span className="prediction-ci-low">
            {formatCurrency(row.predicted_close_lower)}
          </span>
          <span className="prediction-ci-separator">-</span>
          <span className="prediction-ci-high">
            {formatCurrency(row.predicted_close_upper)}
          </span>
        </Text>
      ) : null}
    </div>
  );
}
