import { loadLivePriceSnapshot } from "../api/livePriceCache";
import type { LivePriceSnapshot } from "../api/livePrices";

export type LiveTickerPriceSnapshot = {
  data: LivePriceSnapshot | null;
  loading: boolean;
  error: string | null;
};

type SubscriberOptions = {
  poll: boolean;
  pollMs: number;
};

type Subscriber = SubscriberOptions & {
  listener: () => void;
};

const stores = new Map<string, LiveTickerPriceStore>();

class LiveTickerPriceStore {
  private state: LiveTickerPriceSnapshot = {
    data: null,
    loading: false,
    error: null,
  };
  private subscribers = new Map<symbol, Subscriber>();
  private intervalId: number | undefined;
  private inFlight: Promise<void> | null = null;
  private readonly handleVisibilityChange = () => {
    if (document.hidden) {
      this.updateTimer();
      return;
    }

    void this.load(true);
    this.updateTimer();
  };

  constructor(private readonly ticker: string) {}

  getSnapshot() {
    return this.state;
  }

  subscribe(listener: () => void, options: SubscriberOptions) {
    const subscriberId = Symbol(this.ticker);
    const wasEmpty = this.subscribers.size === 0;
    this.subscribers.set(subscriberId, { listener, ...options });

    if (wasEmpty) {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      void this.load(false);
    }

    this.updateTimer();

    return () => {
      this.subscribers.delete(subscriberId);
      this.updateTimer();

      if (this.subscribers.size === 0) {
        this.dispose();
        stores.delete(this.ticker);
      }
    };
  }

  refetch() {
    void this.load(true);
  }

  private setState(nextState: LiveTickerPriceSnapshot) {
    this.state = nextState;
    this.subscribers.forEach((subscriber) => subscriber.listener());
  }

  private load(force: boolean) {
    if (document.hidden && !force) {
      return this.inFlight ?? Promise.resolve();
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.setState({
      ...this.state,
      loading: true,
      error: null,
    });

    this.inFlight = loadLivePriceSnapshot(this.ticker, { force })
      .then((snapshot) => {
        this.setState({
          data: snapshot,
          loading: false,
          error: null,
        });
      })
      .catch((caught) => {
        this.setState({
          ...this.state,
          loading: false,
          error: caught instanceof Error ? caught.message : "Unable to load live price.",
        });
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  private updateTimer() {
    if (this.intervalId != null) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    if (this.subscribers.size === 0 || document.hidden) {
      return;
    }

    const pollingSubscribers = Array.from(this.subscribers.values()).filter(
      (subscriber) => subscriber.poll,
    );
    if (pollingSubscribers.length === 0) {
      return;
    }

    const pollMs = Math.max(
      1,
      Math.min(...pollingSubscribers.map((subscriber) => subscriber.pollMs)),
    );
    this.intervalId = window.setInterval(() => {
      void this.load(true);
    }, pollMs);
  }

  dispose() {
    if (this.intervalId != null) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }
}

export function getLiveTickerPriceStore(ticker: string) {
  const normalizedTicker = ticker.trim().toUpperCase();
  let store = stores.get(normalizedTicker);
  if (!store) {
    store = new LiveTickerPriceStore(normalizedTicker);
    stores.set(normalizedTicker, store);
  }
  return store;
}

export function __resetLiveTickerPriceStoresForTests() {
  stores.forEach((store) => store.dispose());
  stores.clear();
}
