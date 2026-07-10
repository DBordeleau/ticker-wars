import { formatHorizon } from "../../../utils/format";
import type { DirectionalAgreement, PredictionHorizon } from "./types";

export default function DirectionalAgreementBadge({
  agreement,
  horizon,
}: {
  agreement: DirectionalAgreement;
  horizon: PredictionHorizon;
}) {
  const dominant =
    agreement.total === 0
      ? "pending"
      : agreement.up > agreement.down && agreement.up > agreement.flat
        ? "up"
        : agreement.down > agreement.up && agreement.down > agreement.flat
          ? "down"
          : agreement.flat > agreement.up && agreement.flat > agreement.down
            ? "flat"
            : "mixed";

  return (
    <div className={`ticker-direction-badge ticker-direction-badge--${dominant}`}>
      <span className="ticker-direction-eyebrow">{formatHorizon(horizon)} model direction</span>
      {agreement.total === 0 ? (
        <span className="ticker-direction-empty">No non-benchmark calls yet</span>
      ) : (
        <span className="ticker-direction-counts">
          <strong>{agreement.up}</strong> up
          <span aria-hidden>/</span>
          <strong>{agreement.down}</strong> down
          {agreement.flat > 0 ? (
            <>
              <span aria-hidden>/</span>
              <strong>{agreement.flat}</strong> flat
            </>
          ) : null}
        </span>
      )}
    </div>
  );
}
