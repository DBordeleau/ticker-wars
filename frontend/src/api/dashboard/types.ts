import type { AvatarOptions } from "../../auth/types";

export type LeaderboardRow = {
  generated_at?: string;
  window: "7d" | "30d" | "90d" | "all";
  evaluation_window?: "7d" | "30d" | "90d" | "all";
  prediction_horizon: MetricHorizon;
  model_name: string;
  model_slug: string;
  mae: number | null;
  rmse?: number | null;
  mape?: number | null;
  directional_accuracy: number | null;
  prediction_count: number;
  scored_count?: number;
  winkler_score?: number | null;
  rank: number | null;
  is_toy_model?: boolean;
  model_type?: string;
};

export type UserLeaderboardRow = {
  generated_at?: string;
  window: "7d" | "30d" | "90d" | "all";
  evaluation_window?: "7d" | "30d" | "90d" | "all";
  prediction_horizon: MetricHorizon;
  user_id: string;
  username: string;
  avatar_style: "adventurer-neutral";
  avatar_seed: string;
  avatar_options: AvatarOptions;
  mae: number | null;
  mape?: number | null;
  directional_accuracy: number | null;
  prediction_count: number;
  scored_count?: number;
  rank: number | null;
};

export type UserTickerLeaderboardRow = UserLeaderboardRow & {
  ticker: string;
};

export type LatestPrediction = {
  generated_at?: string;
  prediction_id: string;
  prediction_date: string;
  target_date: string;
  prediction_horizon: MetricHorizon;
  ticker: string;
  model_name: string;
  model_slug: string;
  reference_close: number;
  predicted_return: number;
  predicted_close: number;
  predicted_close_lower?: number | null;
  predicted_close_upper?: number | null;
  interval_level?: number | null;
  winkler_score?: number | null;
  reasoning_summary?: string | null;
  model_metadata?: Record<string, unknown> | null;
};

export type LatestUserPrediction = {
  generated_at?: string;
  prediction_id: string;
  user_id: string;
  username: string;
  avatar_style: "adventurer-neutral";
  avatar_seed: string;
  avatar_options: AvatarOptions;
  prediction_date: string;
  target_date: string;
  prediction_horizon: MetricHorizon;
  ticker: string;
  reference_close: number;
  predicted_return: number | null;
  predicted_close: number | null;
  hide_details_until_scored?: boolean;
};

export type TickerHistoryRow = {
  generated_at?: string;
  ticker: string;
  date: string;
  prediction_id?: string;
  prediction_date: string;
  target_date: string;
  prediction_horizon: MetricHorizon;
  actual_close: number | null;
  model_name: string;
  model_slug: string;
  predicted_close: number;
  predicted_close_lower?: number | null;
  predicted_close_upper?: number | null;
  interval_level?: number | null;
  predicted_return: number;
  actual_return: number | null;
  winkler_score?: number | null;
  reasoning_summary: string | null;
};

export type TickerProfile = {
  ticker: string;
  company_name: string | null;
  logo_data_url: string | null;
  sector: string | null;
  industry: string | null;
  business_summary: string | null;
  as_of_date?: string | null;
  source?: string | null;
};

export type TickerCloseSnapshot = {
  ticker: string;
  date: string;
  close: number;
  previous_date: string | null;
  previous_close: number | null;
  change: number | null;
  change_percent: number | null;
};

export type TickerAsset = {
  ticker: string;
  logo_data_url: string | null;
};

export type ModelMetricRow = {
  generated_at?: string;
  window: MetricWindow;
  evaluation_window?: MetricWindow;
  prediction_horizon: MetricHorizon;
  model_name: string;
  model_slug: string;
  mae: number | null;
  mape?: number | null;
  directional_accuracy: number | null;
  winkler_score?: number | null;
  prediction_count: number;
  scored_count?: number;
};

export type RunMetadata = {
  generated_at: string;
  latest_price_date: string | null;
  next_target_date: string | null;
  latest_prediction_date?: string | null;
  ticker_count: number;
  model_count: number;
  prediction_count?: number;
  user_prediction_count?: number;
  scored_count?: number;
  data_source: string;
  last_pipeline_status: string;
};

export type MetricWindow = LeaderboardRow["window"];
export type MetricHorizon = "1w" | "1m" | "3m" | "1y" | "all";

export type DashboardData = {
  leaderboard: LeaderboardRow[];
  userLeaderboard: UserLeaderboardRow[];
  userTickerLeaderboard: UserTickerLeaderboardRow[];
  modelMetrics: ModelMetricRow[];
  latestPredictions: LatestPrediction[];
  latestUserPredictions: LatestUserPrediction[];
  tickerAssets: TickerAsset[];
  tickerHistory: TickerHistoryRow[];
  metadata: RunMetadata | null;
  hasSupabaseConfig: boolean;
};

