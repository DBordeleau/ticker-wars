import { Text } from "@mantine/core";
import { VERDICT_LABELS, type ScoreVerdict } from "../../api/gamification";

type Props = {
  activeCount: number;
  settledCount: number;
  verdictCounts: Partial<Record<ScoreVerdict, number>>;
  variant?: "hover" | "profile";
};

const verdictOrder: ScoreVerdict[] = [
  "called_it",
  "close_call",
  "in_the_zone",
  "miss",
  "way_off",
  "not_even_close",
];

export default function UserVerdictBreakdown({
  activeCount,
  settledCount,
  verdictCounts,
  variant = "hover",
}: Props) {
  const totalVerdicts = verdictOrder.reduce((sum, verdict) => sum + (verdictCounts[verdict] ?? 0), 0);
  const visibleRows = verdictOrder
    .map((verdict) => ({
      verdict,
      count: verdictCounts[verdict] ?? 0,
      percent: totalVerdicts > 0 ? (verdictCounts[verdict] ?? 0) / totalVerdicts : 0,
    }))
    .filter((row) => row.count > 0);
  const totalPredictions = activeCount + settledCount;
  const activePercent = totalPredictions > 0 ? activeCount / totalPredictions : 0;
  const settledPercent = totalPredictions > 0 ? settledCount / totalPredictions : 0;
  const activeWidth = totalPredictions > 0 ? Math.max(5, activePercent * 100) : 50;
  const settledWidth = totalPredictions > 0 ? Math.max(5, settledPercent * 100) : 50;
  const predictionLabel = totalPredictions === 1 ? "Prediction" : "Predictions";

  return (
    <div className={`user-verdict-breakdown user-verdict-breakdown--${variant}`} aria-label="Prediction record summary">
      <div className="user-record-strip">
        <div className="user-record-copy">
          <strong>{totalPredictions.toLocaleString()}</strong>
          <span>{predictionLabel}</span>
        </div>
        <div className="user-record-bars" aria-hidden>
          <span className="user-record-bar user-record-bar--active" style={{ width: `${activeWidth}%` }} />
          <span className="user-record-bar user-record-bar--settled" style={{ width: `${settledWidth}%` }} />
        </div>
        <div className="user-record-counts">
          <span>
            <strong>{activeCount.toLocaleString()}</strong>
            active
          </span>
          <span>
            <strong>{settledCount.toLocaleString()}</strong>
            settled
          </span>
        </div>
      </div>

      {visibleRows.length > 0 ? (
        <div className="user-verdict-chart">
          <div className="user-verdict-stack" aria-hidden>
            {visibleRows.map((row) => (
              <span
                key={row.verdict}
                className={`user-verdict-stack-segment user-verdict-${row.verdict}`}
                style={{ width: `${Math.max(4, row.percent * 100)}%` }}
              />
            ))}
          </div>
          <div className="user-verdict-rows">
            {visibleRows.map((row) => (
              <div key={row.verdict} className="user-verdict-row">
                <span className={`user-verdict-dot user-verdict-${row.verdict}`} aria-hidden />
                <span className="user-verdict-name">{VERDICT_LABELS[row.verdict]}</span>
                <span className="user-verdict-value">
                  {row.count.toLocaleString()} <span>({Math.round(row.percent * 100)}%)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Text className="user-verdict-empty" size="xs">
          Verdicts appear after public predictions settle.
        </Text>
      )}
    </div>
  );
}
