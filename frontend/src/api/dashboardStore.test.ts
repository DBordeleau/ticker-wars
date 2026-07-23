import type { DashboardData } from "./dashboardData";
import {
  ensureDashboard,
  getDashboardState,
  refreshDashboard,
  resetDashboardCache,
} from "./dashboardStore";
import { fetchDashboardData, fetchDashboardVersion } from "./dashboardData";
import {
  readDashboardDataCache,
  writeDashboardDataCache,
} from "./dashboardPersistentCache";

jest.mock("./dashboardData", () => ({
  fetchDashboardData: jest.fn(),
  fetchDashboardVersion: jest.fn(),
}));

jest.mock("./dashboardPersistentCache", () => ({
  clearDashboardPersistentCache: jest.fn(),
  readDashboardDataCache: jest.fn(),
  writeDashboardDataCache: jest.fn(),
}));

jest.mock("./supabaseClient", () => ({
  isSupabaseConfigured: true,
}));

const mockedFetchDashboardData = fetchDashboardData as jest.MockedFunction<
  typeof fetchDashboardData
>;
const mockedFetchDashboardVersion = fetchDashboardVersion as jest.MockedFunction<
  typeof fetchDashboardVersion
>;
const mockedReadDashboardDataCache = readDashboardDataCache as jest.MockedFunction<
  typeof readDashboardDataCache
>;
const mockedWriteDashboardDataCache = writeDashboardDataCache as jest.MockedFunction<
  typeof writeDashboardDataCache
>;

function dashboard(version: string, ticker: string): DashboardData {
  return {
    leaderboard: [],
    userLeaderboard: [],
    userTickerLeaderboard: [],
    modelMetrics: [],
    latestPredictions: [],
    latestUserPredictions: [],
    tickerAssets: [{ ticker, logo_data_url: null }],
    tickerHistory: [],
    metadata: {
      generated_at: version,
      latest_price_date: "2026-07-22",
      next_target_date: "2026-07-23",
      ticker_count: 1,
      model_count: 1,
      data_source: "test",
      last_pipeline_status: "success",
    },
    hasSupabaseConfig: true,
  };
}

describe("dashboardStore persistent cache", () => {
  beforeEach(() => {
    resetDashboardCache();
    jest.clearAllMocks();
  });

  it("uses a version-matched persistent response without downloading the summary", async () => {
    const cached = dashboard("2026-07-23T01:00:00Z", "AAPL");
    mockedReadDashboardDataCache.mockResolvedValue(cached);
    mockedFetchDashboardVersion.mockResolvedValue("2026-07-23T01:00:00+00:00");

    await ensureDashboard();

    expect(getDashboardState()).toMatchObject({ data: cached, loading: false, error: null });
    expect(mockedFetchDashboardVersion).toHaveBeenCalledTimes(1);
    expect(mockedFetchDashboardData).not.toHaveBeenCalled();
  });

  it("replaces and persists the cached response when the version changes", async () => {
    const cached = dashboard("2026-07-22T01:00:00Z", "AAPL");
    const fresh = dashboard("2026-07-23T01:00:00Z", "MSFT");
    mockedReadDashboardDataCache.mockResolvedValue(cached);
    mockedFetchDashboardVersion.mockResolvedValue(fresh.metadata?.generated_at ?? null);
    mockedFetchDashboardData.mockResolvedValue(fresh);

    await ensureDashboard();

    expect(getDashboardState()).toMatchObject({ data: fresh, loading: false, error: null });
    expect(mockedFetchDashboardData).toHaveBeenCalledTimes(1);
    expect(mockedWriteDashboardDataCache).toHaveBeenCalledWith(fresh);
  });

  it("keeps cached data usable when the background version check fails", async () => {
    const cached = dashboard("2026-07-23T01:00:00Z", "AAPL");
    mockedReadDashboardDataCache.mockResolvedValue(cached);
    mockedFetchDashboardVersion.mockRejectedValue(new Error("offline"));

    await ensureDashboard();

    expect(getDashboardState()).toMatchObject({ data: cached, loading: false, error: null });
    expect(mockedFetchDashboardData).not.toHaveBeenCalled();
  });

  it("forces and persists a full download on manual refresh", async () => {
    const fresh = dashboard("2026-07-23T01:00:00Z", "MSFT");
    mockedFetchDashboardData.mockResolvedValue(fresh);

    await refreshDashboard();

    expect(getDashboardState()).toMatchObject({ data: fresh, loading: false, error: null });
    expect(mockedFetchDashboardData).toHaveBeenCalledTimes(1);
    expect(mockedWriteDashboardDataCache).toHaveBeenCalledWith(fresh);
  });
});
