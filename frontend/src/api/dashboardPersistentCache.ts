import type { DashboardData, TickerHistoryRow } from "./dashboardData";

const databaseName = "ticker-wars-dashboard";
const databaseVersion = 1;
const storeName = "responses";
const cacheSchemaVersion = 1;
const dashboardCacheKey = "dashboard-summary";

export const dashboardPersistentCacheMaxAgeMs = 96 * 60 * 60 * 1000;
export const tickerHistoryPersistentCacheMaxAgeMs = 24 * 60 * 60 * 1000;

type CacheRecord<T> = {
  key: string;
  schemaVersion: number;
  savedAt: number;
  dashboardVersion: string | null;
  value: T;
};

function openCacheDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(databaseName, databaseVersion);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readRecord<T>(key: string): Promise<CacheRecord<T> | null> {
  const database = await openCacheDatabase();
  if (!database) {
    return null;
  }

  return new Promise((resolve) => {
    let request: IDBRequest;
    try {
      request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
    } catch {
      database.close();
      resolve(null);
      return;
    }

    request.onsuccess = () => {
      database.close();
      resolve(isCacheRecord<T>(request.result) ? request.result : null);
    };
    request.onerror = () => {
      database.close();
      resolve(null);
    };
  });
}

async function writeRecord<T>(record: CacheRecord<T>): Promise<void> {
  const database = await openCacheDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(record);
    } catch {
      database.close();
      resolve();
      return;
    }

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      resolve();
    };
    transaction.onabort = () => {
      database.close();
      resolve();
    };
  });
}

export async function readDashboardDataCache(): Promise<DashboardData | null> {
  const record = await readRecord<DashboardData>(dashboardCacheKey);
  if (
    !record ||
    !isWithinMaxAge(record.savedAt, dashboardPersistentCacheMaxAgeMs) ||
    !isDashboardData(record.value)
  ) {
    return null;
  }
  return record.value;
}

export function writeDashboardDataCache(data: DashboardData): Promise<void> {
  return writeRecord({
    key: dashboardCacheKey,
    schemaVersion: cacheSchemaVersion,
    savedAt: Date.now(),
    dashboardVersion: data.metadata?.generated_at ?? null,
    value: data,
  });
}

export async function readTickerHistoryCache(
  ticker: string,
  dashboardVersion: string | null,
): Promise<TickerHistoryRow[] | null> {
  const key = tickerHistoryCacheKey(ticker);
  const record = await readRecord<TickerHistoryRow[]>(key);
  if (
    !record ||
    !Array.isArray(record.value) ||
    !isWithinMaxAge(record.savedAt, tickerHistoryPersistentCacheMaxAgeMs)
  ) {
    return null;
  }
  if (dashboardVersion && record.dashboardVersion !== dashboardVersion) {
    return null;
  }
  return record.value;
}

export function writeTickerHistoryCache(
  ticker: string,
  dashboardVersion: string | null,
  history: TickerHistoryRow[],
): Promise<void> {
  return writeRecord({
    key: tickerHistoryCacheKey(ticker),
    schemaVersion: cacheSchemaVersion,
    savedAt: Date.now(),
    dashboardVersion,
    value: history,
  });
}

export async function clearDashboardPersistentCache(): Promise<void> {
  const database = await openCacheDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).clear();
    } catch {
      database.close();
      resolve();
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      resolve();
    };
    transaction.onabort = () => {
      database.close();
      resolve();
    };
  });
}

function tickerHistoryCacheKey(ticker: string): string {
  return `ticker-history:${ticker.trim().toUpperCase()}`;
}

function isCacheRecord<T>(value: unknown): value is CacheRecord<T> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<CacheRecord<T>>;
  return (
    record.schemaVersion === cacheSchemaVersion &&
    typeof record.key === "string" &&
    typeof record.savedAt === "number" &&
    (typeof record.dashboardVersion === "string" || record.dashboardVersion === null) &&
    "value" in record
  );
}

function isWithinMaxAge(savedAt: number, maxAgeMs: number): boolean {
  const age = Date.now() - savedAt;
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
}

function isDashboardData(value: unknown): value is DashboardData {
  if (!value || typeof value !== "object") {
    return false;
  }
  const data = value as Partial<DashboardData>;
  return (
    Array.isArray(data.leaderboard) &&
    Array.isArray(data.userLeaderboard) &&
    Array.isArray(data.userTickerLeaderboard) &&
    Array.isArray(data.modelMetrics) &&
    Array.isArray(data.latestPredictions) &&
    Array.isArray(data.latestUserPredictions) &&
    Array.isArray(data.tickerAssets) &&
    Array.isArray(data.tickerHistory) &&
    (data.metadata === null || typeof data.metadata === "object")
  );
}
