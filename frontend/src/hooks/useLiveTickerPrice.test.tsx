import { act, render, waitFor } from "@testing-library/react";
import { useLiveTickerPrice } from "./useLiveTickerPrice";
import { __resetLiveTickerPriceStoresForTests } from "./liveTickerPriceStore";
import { loadLivePriceSnapshot } from "../api/livePriceCache";
import type { LivePriceSnapshot } from "../api/livePrices";

jest.mock("../api/livePriceCache", () => ({
  loadLivePriceSnapshot: jest.fn(),
}));

const mockedLoadLivePriceSnapshot = loadLivePriceSnapshot as jest.MockedFunction<
  typeof loadLivePriceSnapshot
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

function PriceSubscribers() {
  const first = useLiveTickerPrice("aapl", { poll: true, pollMs: 60_000 });
  const second = useLiveTickerPrice("AAPL", { poll: true, pollMs: 60_000 });

  return (
    <div>
      <span data-testid="first-price">{first.data?.price ?? ""}</span>
      <span data-testid="second-price">{second.data?.price ?? ""}</span>
    </div>
  );
}

describe("useLiveTickerPrice", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetLiveTickerPriceStoresForTests();
    mockedLoadLivePriceSnapshot.mockReset();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shares one live request and polling timer for subscribers to the same ticker", async () => {
    mockedLoadLivePriceSnapshot
      .mockResolvedValueOnce(snapshot("AAPL", 210))
      .mockResolvedValueOnce(snapshot("AAPL", 211));

    const view = render(<PriceSubscribers />);

    await waitFor(() => {
      expect(view.getByTestId("first-price")).toHaveTextContent("210");
      expect(view.getByTestId("second-price")).toHaveTextContent("210");
    });
    expect(mockedLoadLivePriceSnapshot).toHaveBeenCalledTimes(1);
    expect(mockedLoadLivePriceSnapshot).toHaveBeenNthCalledWith(1, "AAPL", { force: false });

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    await waitFor(() => {
      expect(view.getByTestId("first-price")).toHaveTextContent("211");
      expect(view.getByTestId("second-price")).toHaveTextContent("211");
    });
    expect(mockedLoadLivePriceSnapshot).toHaveBeenCalledTimes(2);
    expect(mockedLoadLivePriceSnapshot).toHaveBeenNthCalledWith(2, "AAPL", { force: true });

    view.unmount();
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(mockedLoadLivePriceSnapshot).toHaveBeenCalledTimes(2);
  });
});
