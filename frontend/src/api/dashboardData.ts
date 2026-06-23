import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { fallbackDashboardData } from "./fallbackDashboardData";
import type { AvatarOptions } from "../auth/types";

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
  directional_accuracy: number | null;
  prediction_count: number;
  scored_count?: number;
  rank: number | null;
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
  predicted_return: number;
  predicted_close: number;
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

export type ModelMetricRow = {
  generated_at?: string;
  window: MetricWindow;
  evaluation_window?: MetricWindow;
  prediction_horizon: MetricHorizon;
  model_name: string;
  model_slug: string;
  mae: number | null;
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
  scored_count?: number;
  data_source: string;
  last_pipeline_status: string;
};

export type MetricWindow = LeaderboardRow["window"];
export type MetricHorizon = "1w" | "1m" | "3m" | "1y" | "all";

export type DashboardData = {
  leaderboard: LeaderboardRow[];
  userLeaderboard: UserLeaderboardRow[];
  modelMetrics: ModelMetricRow[];
  latestPredictions: LatestPrediction[];
  latestUserPredictions: LatestUserPrediction[];
  tickerHistory: TickerHistoryRow[];
  metadata: RunMetadata | null;
  hasSupabaseConfig: boolean;
};

const hiddenModelSlugs = new Set(["ridge", "ridge-regression", "lasso"]);

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  if (!supabase) {
    return fallbackDashboardData.leaderboard;
  }

  const { data, error } = await supabase
    .from("dashboard_model_leaderboard")
    .select("*")
    .order("evaluation_window")
    .order("prediction_horizon")
    .order("rank", { nullsFirst: false })
    .order("model_name");

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeLeaderboardRow).filter(isVisibleModelRow);
}

export async function fetchLatestPredictions(): Promise<LatestPrediction[]> {
  if (!supabase) {
    return fallbackDashboardData.latestPredictions;
  }

  const { data, error } = await supabase
    .from("dashboard_latest_predictions")
    .select("*")
    .order("ticker")
    .order("model_name");

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeLatestPredictionRow).filter(isVisibleModelRow);
}

export async function fetchUserLeaderboard(): Promise<UserLeaderboardRow[]> {
  if (!supabase) {
    return fallbackDashboardData.userLeaderboard;
  }

  const { data, error } = await supabase
    .from("dashboard_user_leaderboard")
    .select("*")
    .order("evaluation_window")
    .order("prediction_horizon")
    .order("rank", { nullsFirst: false })
    .order("username");

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeUserLeaderboardRow);
}

export async function fetchLatestUserPredictions(): Promise<LatestUserPrediction[]> {
  if (!supabase) {
    return fallbackDashboardData.latestUserPredictions;
  }

  const { data, error } = await supabase
    .from("dashboard_latest_user_predictions")
    .select("*")
    .order("ticker")
    .order("username");

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeLatestUserPredictionRow);
}

export async function fetchTickerHistory(ticker: string): Promise<TickerHistoryRow[]> {
  if (!supabase) {
    return fallbackDashboardData.tickerHistory.filter((row) => row.ticker === ticker);
  }

  const { data, error } = await supabase
    .from("dashboard_ticker_history")
    .select("*")
    .eq("ticker", ticker)
    .order("target_date")
    .order("model_name");

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeTickerHistoryRow).filter(isVisibleModelRow);
}

export async function fetchModelMetrics(): Promise<ModelMetricRow[]> {
  if (!supabase) {
    return fallbackDashboardData.modelMetrics;
  }

  const { data, error } = await supabase
    .from("dashboard_model_metrics")
    .select("*")
    .order("evaluation_window")
    .order("prediction_horizon")
    .order("model_name");

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeModelMetricRow).filter(isVisibleModelRow);
}

export async function fetchRunMetadata(): Promise<RunMetadata | null> {
  if (!supabase) {
    return fallbackDashboardData.metadata;
  }

  const { data, error } = await supabase
    .from("dashboard_run_metadata")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? normalizeRunMetadata(data) : null;
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [
    leaderboard,
    userLeaderboard,
    modelMetrics,
    latestPredictions,
    latestUserPredictions,
    metadata,
  ] = await Promise.all([
    fetchLeaderboard(),
    fetchUserLeaderboard(),
    fetchModelMetrics(),
    fetchLatestPredictions(),
    fetchLatestUserPredictions(),
    fetchRunMetadata(),
  ]);

  return {
    leaderboard,
    userLeaderboard,
    modelMetrics,
    latestPredictions,
    latestUserPredictions,
    tickerHistory: supabase ? [] : fallbackDashboardData.tickerHistory,
    metadata,
    hasSupabaseConfig: isSupabaseConfigured,
  };
}

function normalizeLeaderboardRow(row: Partial<LeaderboardRow>): LeaderboardRow {
  const window = row.window ?? row.evaluation_window ?? "all";
  const predictionCount = row.prediction_count ?? row.scored_count ?? 0;
  return {
    ...row,
    window,
    prediction_horizon: row.prediction_horizon ?? "1w",
    prediction_count: predictionCount,
    rmse: row.rmse ?? null,
    mape: row.mape ?? null,
    model_type: row.model_type ?? fallbackModelType(row.model_slug),
  } as LeaderboardRow;
}

function normalizeUserLeaderboardRow(row: Partial<UserLeaderboardRow>): UserLeaderboardRow {
  const window = row.window ?? row.evaluation_window ?? "all";
  const predictionCount = row.prediction_count ?? row.scored_count ?? 0;
  return {
    ...row,
    window,
    prediction_horizon: row.prediction_horizon ?? "1w",
    user_id: row.user_id ?? "",
    username: row.username ?? "",
    avatar_style: "adventurer-neutral",
    avatar_seed: row.avatar_seed ?? row.user_id ?? row.username ?? "",
    avatar_options: row.avatar_options ?? {
      eyebrowsVariant: "variant01",
      eyesVariant: "variant01",
      glassesVariant: "variant01",
      glassesProbability: 0,
      mouthVariant: "variant01",
      backgroundColor: "f2d3b1",
      scale: 1,
      rotate: 0,
    },
    mae: row.mae ?? null,
    directional_accuracy: row.directional_accuracy ?? null,
    prediction_count: predictionCount,
    rank: row.rank ?? null,
  };
}

function normalizeLatestPredictionRow(row: Partial<LatestPrediction>): LatestPrediction {
  return {
    ...row,
    prediction_id: row.prediction_id ?? "",
    prediction_date: row.prediction_date ?? "",
    target_date: row.target_date ?? "",
    prediction_horizon: row.prediction_horizon ?? "1w",
    ticker: row.ticker ?? "",
    model_name: row.model_name ?? "",
    model_slug: row.model_slug ?? fallbackModelSlug(row.model_name),
    reference_close: row.reference_close ?? 0,
    predicted_return: row.predicted_return ?? 0,
    predicted_close: row.predicted_close ?? 0,
  };
}

function normalizeLatestUserPredictionRow(
  row: Partial<LatestUserPrediction>,
): LatestUserPrediction {
  return {
    ...row,
    prediction_id: row.prediction_id ?? "",
    user_id: row.user_id ?? "",
    username: row.username ?? "",
    avatar_style: "adventurer-neutral",
    avatar_seed: row.avatar_seed ?? row.user_id ?? row.username ?? "",
    avatar_options: row.avatar_options ?? {
      eyebrowsVariant: "variant01",
      eyesVariant: "variant01",
      glassesVariant: "variant01",
      glassesProbability: 0,
      mouthVariant: "variant01",
      backgroundColor: "f2d3b1",
      scale: 1,
      rotate: 0,
    },
    prediction_date: row.prediction_date ?? "",
    target_date: row.target_date ?? "",
    prediction_horizon: row.prediction_horizon ?? "1w",
    ticker: row.ticker ?? "",
    reference_close: row.reference_close ?? 0,
    predicted_return: row.predicted_return ?? 0,
    predicted_close: row.predicted_close ?? 0,
  };
}

function normalizeTickerHistoryRow(row: Partial<TickerHistoryRow>): TickerHistoryRow {
  return {
    ...row,
    prediction_date: row.prediction_date ?? "",
    target_date: row.target_date ?? row.date ?? "",
    prediction_horizon: row.prediction_horizon ?? "1w",
    date: row.date ?? row.target_date ?? "",
    model_slug: row.model_slug ?? fallbackModelSlug(row.model_name),
  } as TickerHistoryRow;
}

function normalizeModelMetricRow(row: Partial<ModelMetricRow>): ModelMetricRow {
  const window = row.window ?? row.evaluation_window ?? "all";
  const predictionCount = row.prediction_count ?? row.scored_count ?? 0;
  return {
    ...row,
    window,
    prediction_horizon: row.prediction_horizon ?? "1w",
    model_name: row.model_name ?? "",
    model_slug: row.model_slug ?? fallbackModelSlug(row.model_name),
    mae: row.mae ?? null,
    directional_accuracy: row.directional_accuracy ?? null,
    prediction_count: predictionCount,
  };
}

function normalizeRunMetadata(row: Partial<RunMetadata>): RunMetadata {
  return {
    ...row,
    next_target_date: row.next_target_date ?? row.latest_prediction_date ?? null,
  } as RunMetadata;
}

function isVisibleModelRow(row: { model_slug?: string }) {
  return !hiddenModelSlugs.has(row.model_slug ?? "");
}

function fallbackModelType(modelSlug?: string) {
  if (modelSlug === "baseline") {
    return "Benchmark";
  }
  if (modelSlug === "warren-buffbot") {
    return "Toy LLM";
  }
  if (modelSlug === "timesfm" || modelSlug === "chronos-2") {
    return "Time Series";
  }
  return "Classic ML";
}

function fallbackModelSlug(modelName?: string) {
  return modelName?.toLowerCase().replace(/\s+/g, "-") ?? "";
}
