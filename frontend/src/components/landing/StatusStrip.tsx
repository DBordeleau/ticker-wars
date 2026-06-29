import { useCountUp } from "../../hooks/useCountUp";
import type { RunMetadata } from "../../api/dashboardData";
import MagicHoverSurface from "../layout/MagicHoverSurface";

type Props = {
  metadata: RunMetadata | null;
  modelCount: number;
  modelPredictionCount: number;
  userPredictionCount: number;
};

function hoursAgoLabel(iso?: string | null): string {
  if (!iso) return "recently";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const hours = Math.floor((Date.now() - then) / 3_600_000);
  if (hours <= 0) return "less than an hour ago";
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export default function StatusStrip({
  metadata,
  modelCount,
  modelPredictionCount,
  userPredictionCount,
}: Props) {
  const models = useCountUp(modelCount);
  const modelPredictions = useCountUp(modelPredictionCount);
  const userPredictions = useCountUp(userPredictionCount);

  return (
    <MagicHoverSurface className="status-strip-surface">
      <div className="status-strip">
        <span className="status-strip-item status-strip-live">
          <span className="status-strip-dot" aria-hidden />
          Last updated: {hoursAgoLabel(metadata?.generated_at)}
        </span>
        <span className="status-strip-sep" aria-hidden />
        <span className="status-strip-item">
          <strong>{models.toLocaleString()}</strong> models online
        </span>
        <span className="status-strip-sep" aria-hidden />
        <span className="status-strip-item">
          <strong>{modelPredictions.toLocaleString()}</strong> model predictions
        </span>
        <span className="status-strip-sep" aria-hidden />
        <span className="status-strip-item">
          <strong>{userPredictions.toLocaleString()}</strong> user predictions
        </span>
        <span className="status-strip-sep" aria-hidden />
        <span className="status-strip-note">
          Models train and make predictions every trading day ~7:30&nbsp;PM&nbsp;ET.
        </span>
      </div>
    </MagicHoverSurface>
  );
}
