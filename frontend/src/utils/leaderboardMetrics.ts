import type { LeaderboardRow, UserLeaderboardRow } from "../api/dashboardData";
import { formatPercent } from "./format";

export type LeaderboardMetricRow = LeaderboardRow | UserLeaderboardRow;

export function getAveragePctError(row: LeaderboardMetricRow): number | null {
  return row.mape ?? null;
}

export function formatAveragePctError(row: LeaderboardMetricRow, digits = 2): string {
  return formatPercent(getAveragePctError(row), digits);
}

export function compareLeaderboardAverageError(
  a: LeaderboardMetricRow,
  b: LeaderboardMetricRow,
): number {
  const aError = getAveragePctError(a);
  const bError = getAveragePctError(b);

  if (aError == null && bError == null) {
    return 0;
  }
  if (aError == null) {
    return 1;
  }
  if (bError == null) {
    return -1;
  }

  return aError - bError;
}
