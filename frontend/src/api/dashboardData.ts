import { isSupabaseConfigured, supabase } from "./supabaseClient";

export type LeaderboardRow = {
  generated_at?: string;
  window: "7d" | "30d" | "90d" | "all";
  model_name: string;
  model_slug: string;
  mae: number | null;
  rmse: number | null;
  mape?: number | null;
  directional_accuracy: number | null;
  prediction_count: number;
  rank: number | null;
  is_toy_model?: boolean;
};

export type LatestPrediction = {
  generated_at?: string;
  target_date: string;
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
  ticker_count: number;
  model_count: number;
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

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("dashboard_model_leaderboard")
    .select("*")
    .order("window")
    .order("rank", { nullsFirst: false })
    .order("model_name");

  if (error) {
    throw error;
  }

  return data ?? [];
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

  return data ?? [];
}

export async function fetchTickerHistory(ticker: string): Promise<TickerHistoryRow[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("dashboard_ticker_history")
    .select("*")
    .eq("ticker", ticker)
    .order("date")
    .order("model_name");

  if (error) {
    throw error;
  }

  return data ?? [];
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

  return data;
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
