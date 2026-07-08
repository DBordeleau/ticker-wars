import { __clearLivePriceCacheForTests, loadLivePriceSnapshot, loadLivePriceSnapshots } from "./livePriceCache";
import { fetchLivePriceSnapshots, type LivePriceSnapshot } from "./livePrices";

jest.mock("./livePrices", () => ({
  fetchLivePriceSnapshots: jest.fn(),
}));

const mockedFetchLivePriceSnapshots = fetchLivePriceSnapshots as jest.MockedFunction<
  typeof fetchLivePriceSnapshots
>;

function snapshot(ticker: string, price: number): LivePriceSnapshot {
  return {
    ticker,
    provider: "test",
    provider_symbol: ticker,
    currency: "USD",
    market_state: "regular",
    price,
    previous_close: price - 1,
    day_open: null,
    day_high: null,
    day_low: null,
    day_volume: null,
    change: 1,
    change_percent: 0.01,
    as_of: "2026-07-07T15:00:00Z",
    fetched_at: "2026-07-07T15:00:00Z",
    stale_after: "2026-07-07T15:01:00Z",
    provider_metadata: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("livePriceCache", () => {
  beforeEach(() => {
    __clearLivePriceCacheForTests();
    mockedFetchLivePriceSnapshots.mockReset();
  });

  it("coalesces concurrent forced single-ticker loads", async () => {
    const aapl = snapshot("AAPL", 210);
    const request = deferred<Record<string, LivePriceSnapshot | null>>();
    mockedFetchLivePriceSnapshots.mockReturnValueOnce(request.promise);

    const first = loadLivePriceSnapshot("aapl", { force: true });
    const second = loadLivePriceSnapshot("AAPL", { force: true });

    expect(mockedFetchLivePriceSnapshots).toHaveBeenCalledTimes(1);
    expect(mockedFetchLivePriceSnapshots).toHaveBeenCalledWith(["AAPL"]);

    request.resolve({ AAPL: aapl });
    await expect(first).resolves.toBe(aapl);
    await expect(second).resolves.toBe(aapl);
  });

  it("reuses overlapping in-flight tickers while fetching only missing bulk tickers", async () => {
    const aapl = snapshot("AAPL", 210);
    const msft = snapshot("MSFT", 420);
    const goog = snapshot("GOOG", 190);
    const firstRequest = deferred<Record<string, LivePriceSnapshot | null>>();
    const secondRequest = deferred<Record<string, LivePriceSnapshot | null>>();
    mockedFetchLivePriceSnapshots
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const first = loadLivePriceSnapshots(["AAPL", "MSFT"]);
    const second = loadLivePriceSnapshots(["MSFT", "GOOG"]);

    expect(mockedFetchLivePriceSnapshots).toHaveBeenCalledTimes(2);
    expect(mockedFetchLivePriceSnapshots).toHaveBeenNthCalledWith(1, ["AAPL", "MSFT"]);
    expect(mockedFetchLivePriceSnapshots).toHaveBeenNthCalledWith(2, ["GOOG"]);

    firstRequest.resolve({ AAPL: aapl, MSFT: msft });
    secondRequest.resolve({ GOOG: goog });

    await expect(first).resolves.toEqual({ AAPL: aapl, MSFT: msft });
    await expect(second).resolves.toEqual({ MSFT: msft, GOOG: goog });
  });

  it("serves fresh bulk-populated values to single-ticker callers", async () => {
    const aapl = snapshot("AAPL", 210);
    mockedFetchLivePriceSnapshots.mockResolvedValueOnce({ AAPL: aapl });

    await expect(loadLivePriceSnapshots(["AAPL"])).resolves.toEqual({ AAPL: aapl });
    await expect(loadLivePriceSnapshot("aapl")).resolves.toBe(aapl);

    expect(mockedFetchLivePriceSnapshots).toHaveBeenCalledTimes(1);
  });
});
