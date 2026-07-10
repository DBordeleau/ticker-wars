export const hiddenModelSlugs = new Set(["ridge", "ridge-regression", "lasso"]);
export const dashboardPageSize = 1000;
export const dashboardRecentPredictionLimit = 5000;
export const dashboardSnapshotMaxAgeMs = 96 * 60 * 60 * 1000;
export const dashboardSnapshotBaseUrl = process.env.REACT_APP_DASHBOARD_SNAPSHOT_BASE_URL?.replace(
  /\/+$/,
  "",
);

export const dashboardSnapshotFiles = {
  latestPredictions: "latest_predictions.json",
  leaderboard: "model_leaderboard.json",
  userLeaderboard: "user_leaderboard.json",
  userTickerLeaderboard: "user_ticker_leaderboard.json",
  latestUserPredictions: "latest_user_predictions.json",
  modelMetrics: "model_metrics.json",
  metadata: "run_metadata.json",
  tickerAssets: "ticker_assets.json",
} as const;

