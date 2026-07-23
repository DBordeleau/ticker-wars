import { isSupabaseConfigured, supabase } from "../supabaseClient";
import { fallbackDashboardData } from "../fallbackDashboardData";
import {
  dashboardSnapshotBaseUrl,
  dashboardSnapshotFiles,
  dashboardSnapshotMaxAgeMs,
} from "./constants";
import {
  fetchLatestPredictions,
  fetchLatestUserPredictions,
  fetchLeaderboard,
  fetchModelMetrics,
  fetchRunMetadata,
  fetchTickerAssets,
  fetchUserLeaderboard,
  fetchUserTickerLeaderboard,
} from "./queries";
import { isRecord, normalizeDashboardBundle, normalizeRunMetadata, normalizeTickerAssetRow } from "./normalizers";
import type {
  DashboardData,
  LatestPrediction,
  LatestUserPrediction,
  LeaderboardRow,
  ModelMetricRow,
  RunMetadata,
  TickerAsset,
  UserLeaderboardRow,
  UserTickerLeaderboardRow,
} from "./types";

export async function fetchDashboardData(): Promise<DashboardData> {
  const snapshotData = await fetchDashboardSnapshotData();
  if (snapshotData) {
    return snapshotData;
  }

  const rpcData = await fetchDashboardBundleFromRpc();
  if (rpcData) {
    return rpcData;
  }

  return fetchDashboardDataFromTables();
}

async function fetchDashboardDataFromTables(): Promise<DashboardData> {
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

async function fetchDashboardSnapshotData(): Promise<DashboardData | null> {
  if (!dashboardSnapshotBaseUrl) {
    return null;
  }

  try {
    const [
      latestPredictions,
      leaderboard,
      userLeaderboard,
      userTickerLeaderboard,
      latestUserPredictions,
      modelMetrics,
      metadataRows,
      tickerAssets,
    ] = await Promise.all([
      fetchSnapshotArray<Partial<LatestPrediction>>(dashboardSnapshotFiles.latestPredictions),
      fetchSnapshotArray<Partial<LeaderboardRow>>(dashboardSnapshotFiles.leaderboard),
      fetchSnapshotArray<Partial<UserLeaderboardRow>>(dashboardSnapshotFiles.userLeaderboard),
      fetchSnapshotArray<Partial<UserTickerLeaderboardRow>>(
        dashboardSnapshotFiles.userTickerLeaderboard,
      ),
      fetchSnapshotArray<Partial<LatestUserPrediction>>(dashboardSnapshotFiles.latestUserPredictions),
      fetchSnapshotArray<Partial<ModelMetricRow>>(dashboardSnapshotFiles.modelMetrics),
      fetchSnapshotArray<Partial<RunMetadata>>(dashboardSnapshotFiles.metadata),
      fetchOptionalSnapshotArray<Partial<TickerAsset>>(dashboardSnapshotFiles.tickerAssets),
    ]);
    const metadata = metadataRows[0] ? normalizeRunMetadata(metadataRows[0]) : null;
    if (!isFreshDashboardSnapshot(metadata)) {
      return null;
    }
    const resolvedTickerAssets = await withTickerAssetCompanyFallback(tickerAssets);

    return normalizeDashboardBundle(
      {
        leaderboard,
        userLeaderboard,
        userTickerLeaderboard,
        modelMetrics,
        latestPredictions,
        latestUserPredictions,
        tickerAssets: resolvedTickerAssets,
        metadata,
      },
      isSupabaseConfigured,
    );
  } catch {
    return null;
  }
}

async function fetchDashboardBundleFromRpc(): Promise<DashboardData | null> {
  if (!supabase) {
    return null;
  }

  let { data, error } = await supabase.rpc("get_public_dashboard_summary");
  if (error && (error.code === "42883" || error.message.includes("get_public_dashboard_summary"))) {
    ({ data, error } = await supabase.rpc("get_public_dashboard_bundle"));
  }
  if (error || !isRecord(data)) {
    return null;
  }

  const dashboardData = normalizeDashboardBundle(data, isSupabaseConfigured);
  if (dashboardData.tickerAssets.length === 0 || !hasTickerAssetCompanyNames(dashboardData.tickerAssets)) {
    dashboardData.tickerAssets = mergeTickerAssets(
      dashboardData.tickerAssets,
      await fetchSnapshotTickerAssetsFallback(),
    );
  }
  return dashboardData;
}

async function fetchSnapshotArray<T>(filename: string): Promise<T[]> {
  const response = await fetch(`${dashboardSnapshotBaseUrl}/${filename}`);
  if (!response.ok) {
    throw new Error(`Dashboard snapshot ${filename} returned ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error(`Dashboard snapshot ${filename} is not an array`);
  }
  return payload as T[];
}

async function fetchOptionalSnapshotArray<T>(filename: string): Promise<T[] | null> {
  try {
    return await fetchSnapshotArray<T>(filename);
  } catch {
    return null;
  }
}

async function fetchSnapshotTickerAssetsFallback(): Promise<TickerAsset[]> {
  if (!supabase) {
    return fallbackDashboardData.tickerAssets;
  }
  try {
    return await fetchTickerAssets();
  } catch {
    return [];
  }
}

async function withTickerAssetCompanyFallback(
  tickerAssets: Partial<TickerAsset>[] | null,
): Promise<Partial<TickerAsset>[]> {
  if (tickerAssets && hasTickerAssetCompanyNames(tickerAssets)) {
    return tickerAssets;
  }
  return mergeTickerAssets(tickerAssets ?? [], await fetchSnapshotTickerAssetsFallback());
}

function hasTickerAssetCompanyNames(tickerAssets: Partial<TickerAsset>[]): boolean {
  return tickerAssets.some((asset) => typeof asset.company_name === "string" && asset.company_name.trim());
}

function mergeTickerAssets(
  primary: Partial<TickerAsset>[],
  fallback: Partial<TickerAsset>[],
): TickerAsset[] {
  if (primary.length === 0) {
    return fallback.map(normalizeTickerAssetRow).filter((asset) => asset.ticker);
  }
  const fallbackByTicker = new Map(
    fallback.map((asset) => [asset.ticker?.trim().toUpperCase(), asset]),
  );
  const merged: Partial<TickerAsset>[] = primary.map((asset) => {
    const fallbackAsset = fallbackByTicker.get(asset.ticker?.trim().toUpperCase());
    return {
      ...asset,
      company_name: asset.company_name ?? fallbackAsset?.company_name ?? null,
      logo_data_url: asset.logo_data_url ?? fallbackAsset?.logo_data_url ?? null,
    };
  });
  const primaryTickers = new Set(primary.map((asset) => asset.ticker?.trim().toUpperCase()));
  fallback.forEach((asset) => {
    const ticker = asset.ticker?.trim().toUpperCase();
    if (ticker && !primaryTickers.has(ticker)) {
      merged.push(asset);
    }
  });
  return merged.map(normalizeTickerAssetRow).filter((asset) => asset.ticker);
}

function isFreshDashboardSnapshot(metadata: RunMetadata | null): boolean {
  if (!metadata?.generated_at) {
    return false;
  }
  const generatedAt = Date.parse(metadata.generated_at);
  return Number.isFinite(generatedAt) && Date.now() - generatedAt <= dashboardSnapshotMaxAgeMs;
}

