import type { PredictionHorizon } from "./types";

export const lineColors = ["#22c55e", "#60a5fa", "#f59e0b", "#a78bfa", "#ef4444", "#14b8a6"];
export const preferredDefaultModels = [
  "Baseline",
  "Linear Regression",
  "Random Forest",
  "TimesFM",
  "Chronos-2",
];
export const horizonOrder: PredictionHorizon[] = ["1w", "1m", "3m", "1y"];
export const horizonLookbackDays: Record<PredictionHorizon, number> = {
  "1w": 10,
  "1m": 35,
  "3m": 75,
  "1y": 180,
};
export const horizonForwardDays: Record<PredictionHorizon, number> = {
  "1w": 7,
  "1m": 31,
  "3m": 92,
  "1y": 366,
};
