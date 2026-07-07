import type { PublicProfilePrediction } from "../../api/publicProfiles";
import type { TickerDisplayPrice } from "../../api/livePrices";
import type { UserPredictionScore } from "../../api/userPredictions";
import { formatCurrency, formatPercent, formatSignedPercent } from "../../utils/format";

export type TrackablePrediction = Pick<
  PublicProfilePrediction,
  | "reference_close"
  | "predicted_close"
  | "predicted_return"
  | "public_details_hidden"
  | "actual_close"
  | "actual_return"
  | "absolute_error"
  | "absolute_pct_error"
  | "direction_correct"
  | "score_verdict"
  | "prediction_horizon"
> & {
  score?: UserPredictionScore | null;
};

export type TrackingSnapshot = {
  currentPrice: number;
  currentReturn: number;
  distanceToPrediction: number | null;
  directionAligned: boolean | null;
  label: string;
  tone: "green" | "red" | "yellow" | "gray";
  detail: string;
  priceLabel: string;
};

export function buildTrackingSnapshot(
  prediction: TrackablePrediction,
  displayPrice: TickerDisplayPrice | null | undefined,
): TrackingSnapshot | null {
  if (!displayPrice || prediction.reference_close <= 0) {
    return null;
  }

  const currentReturn = displayPrice.price / prediction.reference_close - 1;
  const predictedReturn = prediction.predicted_return;
  const predictedClose = prediction.predicted_close;
  const hidden = prediction.public_details_hidden || predictedClose == null || predictedReturn == null;

  if (hidden) {
    return {
      currentPrice: displayPrice.price,
      currentReturn,
      distanceToPrediction: null,
      directionAligned: null,
      label: "Tracking hidden",
      tone: "gray",
      detail: `${formatSignedPercent(currentReturn)} from reference`,
      priceLabel: displayPrice.label,
    };
  }

  const predictedDirection = direction(predictedReturn);
  const currentDirection = direction(currentReturn);
  const directionAligned =
    predictedDirection === 0 ? currentDirection === 0 : currentDirection === predictedDirection;
  const distanceToPrediction = predictedClose === 0 ? null : Math.abs(displayPrice.price - predictedClose) / predictedClose;
  const nearCall = distanceToPrediction != null && distanceToPrediction <= 0.01;
  const label = nearCall
    ? "Near call"
    : directionAligned
      ? "Direction tracking"
      : "Needs reversal";
  const tone = nearCall ? "yellow" : directionAligned ? "green" : "red";
  const detail =
    distanceToPrediction == null
      ? `${formatSignedPercent(currentReturn)} from reference`
      : `${formatPercent(distanceToPrediction, 2)}`;

  return {
    currentPrice: displayPrice.price,
    currentReturn,
    distanceToPrediction,
    directionAligned,
    label,
    tone,
    detail,
    priceLabel: displayPrice.label,
  };
}

export function formatPriceWithReturn(close: number | null | undefined, ret: number | null | undefined) {
  if (close == null) {
    return "Pending";
  }
  if (ret == null) {
    return formatCurrency(close);
  }
  return `${formatCurrency(close)} ${formatSignedPercent(ret)}`;
}

function direction(value: number) {
  if (value > 0) {
    return 1;
  }
  if (value < 0) {
    return -1;
  }
  return 0;
}
