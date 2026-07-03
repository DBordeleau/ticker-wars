import type { UserPrediction } from "../../api/userPredictions";

export type OnDeckStatus = "due_today" | "locked" | "maturing_soon" | "long_progress" | "next";

export type OnDeckItem = {
  prediction: UserPrediction;
  status: OnDeckStatus;
  daysUntil: number;
  elapsedDays: number;
  totalDays: number;
  progress: number;
  priority: number;
};

export function buildOnDeckItems(predictions: UserPrediction[], now = new Date()): OnDeckItem[] {
  const today = startOfLocalDay(now);

  return predictions
    .filter((prediction) => prediction.status === "pending")
    .map((prediction) => {
      const predictionDate = parseDateOnly(prediction.prediction_date);
      const targetDate = parseDateOnly(prediction.target_date);
      const daysUntil = Math.round((targetDate.getTime() - today.getTime()) / 86_400_000);
      const totalDays = Math.max(
        1,
        prediction.horizon_calendar_days ||
          Math.round((targetDate.getTime() - predictionDate.getTime()) / 86_400_000),
      );
      const elapsedDays = Math.min(totalDays, Math.max(0, totalDays - daysUntil));
      const progress = Math.min(1, Math.max(0, elapsedDays / totalDays));
      const locked = today >= addDays(targetDate, -7);
      const longHorizon = prediction.prediction_horizon === "3m" || prediction.prediction_horizon === "1y";
      const status: OnDeckStatus =
        daysUntil <= 0
          ? "due_today"
          : locked
            ? "locked"
            : daysUntil <= 7
              ? "maturing_soon"
              : longHorizon
                ? "long_progress"
                : "next";

      return {
        prediction,
        status,
        daysUntil,
        elapsedDays,
        totalDays,
        progress,
        priority: statusPriority(status, daysUntil),
      };
    })
    .sort((a, b) => a.priority - b.priority || a.daysUntil - b.daysUntil || a.prediction.ticker.localeCompare(b.prediction.ticker));
}

function statusPriority(status: OnDeckStatus, daysUntil: number) {
  if (status === "due_today") return 0;
  if (status === "locked") return 10 + Math.max(0, daysUntil);
  if (status === "maturing_soon") return 25 + Math.max(0, daysUntil);
  if (status === "long_progress") return 60 + Math.max(0, daysUntil);
  return 90 + Math.max(0, daysUntil);
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}
