import { isSupabaseConfigured, supabase } from "./supabaseClient";

export type LeaderboardRow = {
  generated_at?: string;
  window: "7d" | "30d" | "90d" | "all";
  evaluation_window?: "7d" | "30d" | "90d" | "all";
  prediction_horizon?: "1w" | "1m" | "3m" | "1y";
  model_name: string;
  model_slug: string;
  mae: number | null;
  rmse: number | null;
  mape?: number | null;
  directional_accuracy: number | null;
  prediction_count: number;
  scored_count?: number;
  winkler_score?: number | null;
  rank: number | null;
  is_toy_model?: boolean;
  model_type?: string;
};

export type LatestPrediction = {
  generated_at?: string;
  prediction_id?: string;
  prediction_date?: string;
  target_date: string;
  prediction_horizon?: string;
  ticker: string;
  model_name: string;
  model_slug: string;
  reference_close: number;
  predicted_return: number;
  predicted_close: number;
  reasoning_summary?: string | null;
  model_metadata?: Record<string, unknown> | null;
};

export type TickerHistoryRow = {
  generated_at?: string;
  ticker: string;
  date: string;
  prediction_date?: string;
  target_date?: string;
  prediction_horizon?: string;
  actual_close: number | null;
  model_name: string;
  model_slug: string;
  predicted_close: number;
  predicted_return: number;
  actual_return: number | null;
  reasoning_summary: string | null;
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

export type DashboardData = {
  leaderboard: LeaderboardRow[];
  latestPredictions: LatestPrediction[];
  tickerHistory: TickerHistoryRow[];
  metadata: RunMetadata | null;
  hasSupabaseConfig: boolean;
};

const hiddenModelSlugs = new Set(["ridge", "ridge-regression", "lasso"]);

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("dashboard_model_leaderboard")
    .select("*")
    .eq("prediction_horizon", "1w")
    .order("evaluation_window")
    .order("rank", { nullsFirst: false })
    .order("model_name");

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeLeaderboardRow).filter(isVisibleModelRow);
}

export async function fetchLatestPredictions(): Promise<LatestPrediction[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("dashboard_latest_predictions")
    .select("*")
    .order("ticker")
    .order("model_name");

  if (error) {
    throw error;
  }

  return (data ?? []).filter(isVisibleModelRow);
}

export async function fetchTickerHistory(ticker: string): Promise<TickerHistoryRow[]> {
  if (!supabase) {
    return [];
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

export async function fetchRunMetadata(): Promise<RunMetadata | null> {
  if (!supabase) {
    return null;
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
  const [leaderboard, latestPredictions, metadata] = await Promise.all([
    fetchLeaderboard(),
    fetchLatestPredictions(),
    fetchRunMetadata(),
  ]);

  return {
    leaderboard,
    latestPredictions,
    tickerHistory: [],
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
    prediction_count: predictionCount,
    rmse: row.rmse ?? null,
    mape: row.mape ?? null,
    model_type: row.model_type ?? fallbackModelType(row.model_slug),
  } as LeaderboardRow;
}

function normalizeTickerHistoryRow(row: Partial<TickerHistoryRow>): TickerHistoryRow {
  return {
    ...row,
    date: row.date ?? row.target_date ?? "",
  } as TickerHistoryRow;
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
