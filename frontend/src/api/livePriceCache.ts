import { fetchLivePriceSnapshot, type LivePriceSnapshot } from "./livePrices";

const liveSnapshotCache = new Map<
  string,
  { promise: Promise<LivePriceSnapshot | null>; expiresAt: number }
>();

const liveSnapshotTtlMs = 45_000;

export function loadLivePriceSnapshot(
  ticker: string,
  options: { force?: boolean } = {},
): Promise<LivePriceSnapshot | null> {
  const key = ticker.trim().toUpperCase();
  if (!key) {
    return Promise.resolve(null);
  }

  const now = Date.now();
  const cached = liveSnapshotCache.get(key);
  if (!options.force && cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = fetchLivePriceSnapshot(key).catch((error) => {
    liveSnapshotCache.delete(key);
    throw error;
  });

  liveSnapshotCache.set(key, {
    promise,
    expiresAt: now + liveSnapshotTtlMs,
  });

  return promise;
}
