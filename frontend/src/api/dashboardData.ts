import { isSupabaseConfigured, supabase } from "./supabaseClient";
import {
  fallbackDashboardData,
  fallbackTickerCloseSnapshots,
  fallbackTickerProfiles,
} from "./fallbackDashboardData";
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
  userTickerLeaderboard: UserTickerLeaderboardRow[];
  modelMetrics: ModelMetricRow[];
  latestPredictions: LatestPrediction[];
  latestUserPredictions: LatestUserPrediction[];
  tickerAssets: TickerAsset[];
  tickerHistory: TickerHistoryRow[];
  metadata: RunMetadata | null;
  hasSupabaseConfig: boolean;
};

const hiddenModelSlugs = new Set(["ridge", "ridge-regression", "lasso"]);
const dashboardPageSize = 1000;
const dashboardRecentPredictionLimit = 2500;

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

  const rows: Partial<LatestPrediction>[] = [];
  let start = 0;

  while (rows.length < dashboardRecentPredictionLimit) {
    const end = Math.min(
      start + dashboardPageSize - 1,
      dashboardRecentPredictionLimit - 1,
    );
    const { data, error } = await supabase
      .from("dashboard_latest_predictions")
      .select("*")
      .order("prediction_date", { ascending: false })
      .order("target_date", { ascending: false })
      .order("ticker")
      .order("model_slug")
      .order("prediction_horizon")
      .range(start, end);

    if (error) {
      throw error;
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < dashboardPageSize) {
      break;
    }
    start += dashboardPageSize;
  }

  return rows.map(normalizeLatestPredictionRow).filter(isVisibleModelRow);
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

export async function fetchUserTickerLeaderboard(): Promise<UserTickerLeaderboardRow[]> {
  if (!supabase) {
    return fallbackDashboardData.userTickerLeaderboard;
  }

  const { data, error } = await supabase
    .from("dashboard_user_ticker_leaderboard")
    .select("*")
    .order("ticker")
    .order("evaluation_window")
    .order("prediction_horizon")
    .order("rank", { nullsFirst: false })
    .order("username");

  if (error) {
    if (error.code === "42P01" || error.message.includes("dashboard_user_ticker_leaderboard")) {
      return [];
    }
    throw error;
  }

  return (data ?? []).map(normalizeUserTickerLeaderboardRow);
}

export async function fetchLatestUserPredictions(): Promise<LatestUserPrediction[]> {
  if (!supabase) {
    return fallbackDashboardData.latestUserPredictions;
  }

  const rows: Partial<LatestUserPrediction>[] = [];
  let start = 0;

  while (rows.length < dashboardRecentPredictionLimit) {
    const end = Math.min(
      start + dashboardPageSize - 1,
      dashboardRecentPredictionLimit - 1,
    );
    const { data, error } = await supabase
      .from("dashboard_latest_user_predictions")
      .select("*")
      .order("prediction_date", { ascending: false })
      .order("target_date", { ascending: false })
      .order("ticker")
      .order("username")
      .range(start, end);

    if (error) {
      throw error;
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < dashboardPageSize) {
      break;
    }
    start += dashboardPageSize;
  }

  return rows.map(normalizeLatestUserPredictionRow);
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

export async function fetchTickerProfile(ticker: string): Promise<TickerProfile | null> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) {
    return null;
  }

  if (!supabase) {
    return fallbackTickerProfiles[normalizedTicker] ?? null;
  }

  const { data, error } = await supabase
    .from("fundamentals")
    .select("ticker,as_of_date,sector,industry,source,raw_json")
    .eq("ticker", normalizedTicker)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message.includes("fundamentals")) {
      return null;
    }
    throw error;
  }

  const { data: assetData, error: assetError } = await supabase
    .from("ticker_assets")
    .select("ticker,logo_data_url")
    .eq("ticker", normalizedTicker)
    .maybeSingle();

  if (assetError && assetError.code !== "42P01" && !assetError.message.includes("ticker_assets")) {
    throw assetError;
  }

  return data ? normalizeTickerProfileRow(data, assetData ?? null) : null;
}

export async function fetchTickerAssets(): Promise<TickerAsset[]> {
  if (!supabase) {
    return fallbackDashboardData.tickerAssets;
  }

  const { data, error } = await supabase
    .from("ticker_assets")
    .select("ticker,logo_data_url")
    .order("ticker");

  if (error) {
    if (error.code === "42P01" || error.message.includes("ticker_assets")) {
      return [];
    }
    throw error;
  }

  return (data ?? []).map(normalizeTickerAssetRow);
}

export async function fetchTickerCloseSnapshot(ticker: string): Promise<TickerCloseSnapshot | null> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) {
    return null;
  }

  if (!supabase) {
    return fallbackTickerCloseSnapshots[normalizedTicker] ?? null;
  }

  const { data, error } = await supabase
    .from("prices")
    .select("ticker,date,close")
    .eq("ticker", normalizedTicker)
    .order("date", { ascending: false })
    .limit(2);

  if (error) {
    if (error.code === "42P01" || error.message.includes("prices")) {
      return null;
    }
    throw error;
  }

  return normalizeTickerCloseSnapshot(data ?? []);
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
    userTickerLeaderboard,
    modelMetrics,
    latestPredictions,
    latestUserPredictions,
    tickerAssets,
    metadata,
  ] = await Promise.all([
    fetchLeaderboard(),
    fetchUserLeaderboard(),
    fetchUserTickerLeaderboard(),
    fetchModelMetrics(),
    fetchLatestPredictions(),
    fetchLatestUserPredictions(),
    fetchTickerAssets(),
    fetchRunMetadata(),
  ]);

  return {
    leaderboard,
    userLeaderboard,
    userTickerLeaderboard,
    modelMetrics,
    latestPredictions,
    latestUserPredictions,
    tickerAssets,
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

function normalizeUserTickerLeaderboardRow(
  row: Partial<UserTickerLeaderboardRow>,
): UserTickerLeaderboardRow {
  return {
    ...normalizeUserLeaderboardRow(row),
    ticker: row.ticker ?? "",
  };
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

function normalizeTickerAssetRow(row: Partial<TickerAsset>): TickerAsset {
  return {
    ticker: cleanString(row.ticker) ?? "",
    logo_data_url: cleanDataUrl(row.logo_data_url),
  };
}

function normalizeTickerProfileRow(
  row: Record<string, unknown>,
  assetRow: Record<string, unknown> | null = null,
): TickerProfile {
  const raw = isRecord(row.raw_json) ? row.raw_json : {};
  return {
    ticker: cleanString(row.ticker) ?? "",
    company_name:
      cleanString(raw.longName) ??
      cleanString(raw.shortName) ??
      cleanString(raw.displayName) ??
      null,
    logo_data_url: cleanDataUrl(assetRow?.logo_data_url),
    sector: cleanString(row.sector) ?? cleanString(raw.sector) ?? null,
    industry: cleanString(row.industry) ?? cleanString(raw.industry) ?? null,
    business_summary: cleanString(raw.longBusinessSummary) ?? null,
    as_of_date: cleanString(row.as_of_date),
    source: cleanString(row.source),
  };
}

function normalizeTickerCloseSnapshot(rows: Record<string, unknown>[]): TickerCloseSnapshot | null {
  const latest = rows[0];
  if (!latest) {
    return null;
  }

  const close = cleanNumber(latest.close);
  if (close == null) {
    return null;
  }

  const previous = rows[1];
  const previousClose = previous ? cleanNumber(previous.close) : null;
  const change = previousClose == null ? null : close - previousClose;
  const changePercent = previousClose == null || previousClose === 0 ? null : close / previousClose - 1;

  return {
    ticker: cleanString(latest.ticker) ?? "",
    date: cleanString(latest.date) ?? "",
    close,
    previous_date: previous ? cleanString(previous.date) : null,
    previous_close: previousClose,
    change,
    change_percent: changePercent,
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  return text || null;
}

function cleanDataUrl(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) {
    return null;
  }
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(text) ? text : null;
}

function cleanNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function fallbackModelSlug(modelName?: string) {
  return modelName?.toLowerCase().replace(/\s+/g, "-") ?? "";
}
