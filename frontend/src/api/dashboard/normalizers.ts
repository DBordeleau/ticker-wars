import { fallbackTickerProfiles } from "../fallbackDashboardData";
import { isRemovedTicker } from "../tickerUniverse";
import { hiddenModelSlugs } from "./constants";
import type {
  DashboardData,
  LatestPrediction,
  LatestUserPrediction,
  LeaderboardRow,
  ModelMetricRow,
  RunMetadata,
  TickerAsset,
  TickerCloseSnapshot,
  TickerHistoryRow,
  TickerProfile,
  UserLeaderboardRow,
  UserTickerLeaderboardRow,
} from "./types";

export function normalizeDashboardBundle(payload: unknown, hasSupabaseConfig: boolean): DashboardData {
  const bundle = isRecord(payload) ? payload : {};
  const metadataPayload = bundle.metadata;
  const metadata = isRecord(metadataPayload)
    ? normalizeRunMetadata(metadataPayload as Partial<RunMetadata>)
    : null;

  return {
    leaderboard: asArray<Partial<LeaderboardRow>>(bundle.leaderboard)
      .map(normalizeLeaderboardRow)
      .filter(isVisibleModelRow),
    userLeaderboard: asArray<Partial<UserLeaderboardRow>>(bundle.userLeaderboard).map(
      normalizeUserLeaderboardRow,
    ),
    userTickerLeaderboard: asArray<Partial<UserTickerLeaderboardRow>>(
      bundle.userTickerLeaderboard,
    )
      .map(normalizeUserTickerLeaderboardRow)
      .filter((row) => !isRemovedTicker(row.ticker)),
    modelMetrics: asArray<Partial<ModelMetricRow>>(bundle.modelMetrics)
      .map(normalizeModelMetricRow)
      .filter(isVisibleModelRow),
    latestPredictions: asArray<Partial<LatestPrediction>>(bundle.latestPredictions)
      .map(normalizeLatestPredictionRow)
      .filter((row) => !isRemovedTicker(row.ticker))
      .filter(isVisibleModelRow),
    latestUserPredictions: asArray<Partial<LatestUserPrediction>>(bundle.latestUserPredictions)
      .map(normalizeLatestUserPredictionRow)
      .filter((row) => !isRemovedTicker(row.ticker)),
    tickerAssets: asArray<Partial<TickerAsset>>(bundle.tickerAssets)
      .map(normalizeTickerAssetRow)
      .filter((row) => !isRemovedTicker(row.ticker)),
    tickerHistory: [],
    metadata,
    hasSupabaseConfig,
  };
}

export function normalizeLeaderboardRow(row: Partial<LeaderboardRow>): LeaderboardRow {
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

export function normalizeUserTickerLeaderboardRow(
  row: Partial<UserTickerLeaderboardRow>,
): UserTickerLeaderboardRow {
  return {
    ...normalizeUserLeaderboardRow(row),
    ticker: row.ticker ?? "",
  };
}

export function normalizeUserLeaderboardRow(row: Partial<UserLeaderboardRow>): UserLeaderboardRow {
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
    mape: row.mape ?? null,
    directional_accuracy: row.directional_accuracy ?? null,
    prediction_count: predictionCount,
    rank: row.rank ?? null,
  };
}

export function normalizeLatestPredictionRow(row: Partial<LatestPrediction>): LatestPrediction {
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

export function normalizeLatestUserPredictionRow(
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
    predicted_return: row.predicted_return ?? null,
    predicted_close: row.predicted_close ?? null,
    hide_details_until_scored: Boolean(row.hide_details_until_scored),
  };
}

export function normalizeTickerHistoryRow(row: Partial<TickerHistoryRow>): TickerHistoryRow {
  return {
    ...row,
    prediction_date: row.prediction_date ?? "",
    target_date: row.target_date ?? row.date ?? "",
    prediction_horizon: row.prediction_horizon ?? "1w",
    date: row.date ?? row.target_date ?? "",
    model_slug: row.model_slug ?? fallbackModelSlug(row.model_name),
  } as TickerHistoryRow;
}

export function normalizeTickerAssetRow(row: Partial<TickerAsset>): TickerAsset {
  return {
    ticker: cleanString(row.ticker) ?? "",
    logo_data_url: cleanDataUrl(row.logo_data_url),
  };
}

export function normalizeTickerProfileRow(
  row: Record<string, unknown>,
  assetRow: Record<string, unknown> | null = null,
): TickerProfile {
  return {
    ticker: cleanString(row.ticker) ?? "",
    company_name:
      cleanString(row.long_name) ??
      cleanString(row.short_name) ??
      cleanString(row.display_name) ??
      null,
    logo_data_url: cleanDataUrl(assetRow?.logo_data_url),
    sector: cleanString(row.sector) ?? null,
    industry: cleanString(row.industry) ?? null,
    business_summary: cleanString(row.business_summary) ?? null,
    as_of_date: cleanString(row.as_of_date),
    source: cleanString(row.source),
  };
}

export function isMissingFundamentalsProfileColumnError(error: { code?: string; message: string }): boolean {
  const message = error.message.toLowerCase();
  return (
    error.code === "42703" ||
    ["long_name", "short_name", "display_name", "business_summary"].some((column) =>
      message.includes(column),
    )
  );
}

export function withFallbackTickerProfile(profile: TickerProfile): TickerProfile {
  const fallback = fallbackTickerProfiles[profile.ticker];
  if (!fallback) {
    return profile;
  }

  return {
    ...profile,
    company_name: profile.company_name ?? fallback.company_name,
    sector: profile.sector ?? fallback.sector,
    industry: profile.industry ?? fallback.industry,
    business_summary: profile.business_summary ?? fallback.business_summary,
  };
}

export function normalizeTickerCloseSnapshot(rows: Record<string, unknown>[]): TickerCloseSnapshot | null {
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

export function normalizeModelMetricRow(row: Partial<ModelMetricRow>): ModelMetricRow {
  const window = row.window ?? row.evaluation_window ?? "all";
  const predictionCount = row.prediction_count ?? row.scored_count ?? 0;
  return {
    ...row,
    window,
    prediction_horizon: row.prediction_horizon ?? "1w",
    model_name: row.model_name ?? "",
    model_slug: row.model_slug ?? fallbackModelSlug(row.model_name),
    mae: row.mae ?? null,
    mape: row.mape ?? null,
    directional_accuracy: row.directional_accuracy ?? null,
    prediction_count: predictionCount,
  };
}

export function normalizeRunMetadata(row: Partial<RunMetadata>): RunMetadata {
  return {
    ...row,
    next_target_date: row.next_target_date ?? row.latest_prediction_date ?? null,
  } as RunMetadata;
}

export function isVisibleModelRow(row: { model_slug?: string }) {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function cleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  return text || null;
}

export function cleanDataUrl(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) {
    return null;
  }
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(text) ? text : null;
}

export function cleanNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function fallbackModelSlug(modelName?: string) {
  return modelName?.toLowerCase().replace(/\s+/g, "-") ?? "";
}
