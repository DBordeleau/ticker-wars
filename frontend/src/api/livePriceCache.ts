import { fetchLivePriceSnapshots, type LivePriceSnapshot } from "./livePrices";

type LiveSnapshotCacheEntry = {
  promise: Promise<LivePriceSnapshot | null>;
  expiresAt: number;
  inFlight: boolean;
};

const liveSnapshotCache = new Map<string, LiveSnapshotCacheEntry>();

export const liveSnapshotTtlMs = 45_000;

export function loadLivePriceSnapshot(
  ticker: string,
  options: { force?: boolean } = {},
): Promise<LivePriceSnapshot | null> {
  const key = ticker.trim().toUpperCase();
  if (!key) {
    return Promise.resolve(null);
  }

  return loadLivePriceSnapshots([key], options).then((snapshots) => snapshots[key] ?? null);
}

export function loadLivePriceSnapshots(
  tickers: string[],
  options: { force?: boolean } = {},
): Promise<Record<string, LivePriceSnapshot | null>> {
  const normalizedTickers = Array.from(
    new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean)),
  );
  if (normalizedTickers.length === 0) {
    return Promise.resolve({});
  }

  const now = Date.now();
  const snapshotPromises = new Map<string, Promise<LivePriceSnapshot | null>>();
  const missingTickers: string[] = [];

  for (const ticker of normalizedTickers) {
    const cached = liveSnapshotCache.get(ticker);
    if (cached?.inFlight || (!options.force && cached && cached.expiresAt > now)) {
      snapshotPromises.set(ticker, cached.promise);
    } else {
      missingTickers.push(ticker);
    }
  }

  if (missingTickers.length > 0) {
    const bulkPromise = fetchLivePriceSnapshots(missingTickers);
    for (const ticker of missingTickers) {
      const promise = bulkPromise
        .then((snapshots) => {
          const snapshot = snapshots[ticker] ?? null;
          liveSnapshotCache.set(ticker, {
            promise: Promise.resolve(snapshot),
            expiresAt: Date.now() + liveSnapshotTtlMs,
            inFlight: false,
          });
          return snapshot;
        })
        .catch((error) => {
          liveSnapshotCache.delete(ticker);
          throw error;
        });

      liveSnapshotCache.set(ticker, {
        promise,
        expiresAt: now + liveSnapshotTtlMs,
        inFlight: true,
      });
      snapshotPromises.set(ticker, promise);
    }
  }

  return Promise.all(
    normalizedTickers.map((ticker) =>
      (snapshotPromises.get(ticker) ?? Promise.resolve(null)).then(
        (snapshot) => [ticker, snapshot] as const,
      ),
    ),
  ).then((entries) => Object.fromEntries(entries));
}

export function __clearLivePriceCacheForTests() {
  liveSnapshotCache.clear();
}
