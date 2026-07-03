const MARKET_TIME_ZONE = "America/New_York";
const LIVE_STALE_SECONDS = 75;
const CLOSED_STALE_MINUTES = 15;
const SPARK_MAX_SYMBOLS_PER_REQUEST = 20;
const DEFAULT_TICKERS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "AVGO",
  "TSLA",
  "AMD",
  "TSM",
  "ARM",
  "ORCL",
  "INTC",
  "SMCI",
  "IBM",
  "CRWD",
  "BRK-B",
  "JPM",
  "BAC",
  "V",
  "MA",
  "HOOD",
  "SOFI",
  "WMT",
  "COST",
  "NFLX",
  "DIS",
  "NKE",
  "UBER",
  "HIMS",
  "CAVA",
  "LLY",
  "ABBV",
  "XOM",
  "CRM",
  "SPY",
  "GME",
  "AMC",
  "RDDT",
  "RKLB",
  "ASTS",
  "LUNR",
  "RIVN",
  "LCID",
  "COIN",
  "MSTR",
  "PLTR",
  "MU",
  "OKLO",
  "APP",
];

type RefreshRequest = {
  force?: boolean;
  regularHoursOnly?: boolean;
  tickers?: string[] | string;
};

type SparkTickerResult = {
  timestamp?: number[];
  close?: Array<number | null>;
  symbol?: string;
  previousClose?: number;
  chartPreviousClose?: number;
  dataGranularity?: number;
  start?: number;
  end?: number;
};

type LivePriceSnapshotRow = {
  ticker: string;
  provider: string;
  provider_symbol: string;
  currency: string;
  market_state: "pre" | "regular" | "post" | "closed" | "unknown";
  price: number;
  previous_close: number | null;
  day_open: number | null;
  day_high: number | null;
  day_low: number | null;
  day_volume: number | null;
  change: number | null;
  change_percent: number | null;
  as_of: string;
  fetched_at: string;
  stale_after: string;
  provider_metadata: Record<string, unknown>;
};

type FetchEventRow = {
  provider: string;
  requested_tickers: string[];
  succeeded_tickers: string[];
  failed_tickers: string[];
  started_at: string;
  finished_at: string;
  duration_ms: number;
  error_message: string | null;
};

const jsonHeaders = {
  "Content-Type": "application/json",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: jsonHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const startedAt = new Date();
  const requestBody = await readRequestBody(request);
  const regularHoursOnly = requestBody.regularHoursOnly ?? true;
  const force = requestBody.force ?? false;
  const tickers = normalizeTickers(requestBody.tickers);
  if (tickers.length === 0) {
    return jsonResponse({ error: "At least one ticker is required." }, 400);
  }

  if (regularHoursOnly && !force && !isRegularMarketTime(startedAt)) {
    return jsonResponse({
      status: "skipped",
      reason: "Regular market hours are not active.",
      requested_tickers: tickers.length,
      fetched_at: startedAt.toISOString(),
    });
  }

  try {
    const result = await refreshLivePrices(tickers, startedAt);
    return jsonResponse({
      status: result.errorMessage ? "partial" : "ok",
      requested_tickers: tickers.length,
      snapshots_written: result.snapshotCount,
      succeeded_tickers: result.succeededTickers,
      failed_tickers: result.failedTickers,
      error_message: result.errorMessage,
      duration_ms: result.durationMs,
      fetched_at: startedAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Unknown refresh error.";
    console.error("Live price refresh failed:", message);
    await insertFetchEvent({
      provider: "yahoo_spark",
      requested_tickers: tickers,
      succeeded_tickers: [],
      failed_tickers: tickers,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      error_message: message,
    });
    return jsonResponse({ status: "error", error: message }, 500);
  }
});

async function refreshLivePrices(tickers: string[], startedAt: Date) {
  const sparkRows = await fetchSparkRows(tickers);
  const fetchedAt = new Date();
  const snapshots: LivePriceSnapshotRow[] = [];
  const failedTickers: string[] = [];

  for (const ticker of tickers) {
    const sparkRow = sparkRows[ticker];
    if (!sparkRow) {
      failedTickers.push(ticker);
      continue;
    }

    const snapshot = buildSnapshotRow(ticker, sparkRow, fetchedAt);
    if (!snapshot) {
      failedTickers.push(ticker);
      continue;
    }
    snapshots.push(snapshot);
  }

  let snapshotCount = 0;
  if (snapshots.length > 0) {
    snapshotCount = await upsertSnapshots(snapshots);
  }

  const succeededTickers = snapshots.map((row) => row.ticker).sort();
  const errorMessage = failedTickers.length > 0
    ? `No current spark data returned for ${failedTickers.length} ticker(s).`
    : null;

  await insertFetchEvent({
    provider: "yahoo_spark",
    requested_tickers: tickers,
    succeeded_tickers: succeededTickers,
    failed_tickers: failedTickers.sort(),
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    error_message: errorMessage,
  });

  return {
    snapshotCount,
    succeededTickers,
    failedTickers: failedTickers.sort(),
    errorMessage,
    durationMs: Date.now() - startedAt.getTime(),
  };
}

async function fetchSparkRows(tickers: string[]) {
  const rows: Record<string, SparkTickerResult> = {};
  for (
    let start = 0;
    start < tickers.length;
    start += SPARK_MAX_SYMBOLS_PER_REQUEST
  ) {
    Object.assign(
      rows,
      await fetchSparkRowsChunk(
        tickers.slice(start, start + SPARK_MAX_SYMBOLS_PER_REQUEST),
      ),
    );
  }
  return rows;
}

async function fetchSparkRowsChunk(tickers: string[]) {
  const endpoint = new URL("https://query1.finance.yahoo.com/v8/finance/spark");
  endpoint.searchParams.set("symbols", tickers.join(","));
  endpoint.searchParams.set("range", "1d");
  endpoint.searchParams.set("interval", "1m");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        "User-Agent": "next-day-price-live-refresh/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Yahoo Spark request failed with HTTP ${response.status}: ${await response
          .text()}`,
      );
    }
    return (await response.json()) as Record<string, SparkTickerResult>;
  } finally {
    clearTimeout(timeout);
  }
}

function buildSnapshotRow(
  ticker: string,
  sparkRow: SparkTickerResult,
  fetchedAt: Date,
): LivePriceSnapshotRow | null {
  const latest = findLatestClose(sparkRow);
  if (!latest) {
    return null;
  }

  const closeValues = (sparkRow.close ?? []).filter(isFiniteNumber);
  const previousClose = cleanNumber(
    sparkRow.previousClose ?? sparkRow.chartPreviousClose,
  );
  const marketState = snapshotMarketState(fetchedAt, latest.asOf);
  const staleAfter = new Date(
    fetchedAt.getTime() +
      (marketState === "regular"
        ? LIVE_STALE_SECONDS * 1000
        : CLOSED_STALE_MINUTES * 60000),
  );
  const change = previousClose == null ? null : latest.price - previousClose;
  const changePercent = previousClose == null || previousClose === 0
    ? null
    : latest.price / previousClose - 1;

  return {
    ticker,
    provider: "yahoo_spark",
    provider_symbol: ticker,
    currency: "USD",
    market_state: marketState,
    price: latest.price,
    previous_close: previousClose,
    day_open: closeValues[0] ?? null,
    day_high: closeValues.length > 0 ? Math.max(...closeValues) : null,
    day_low: closeValues.length > 0 ? Math.min(...closeValues) : null,
    day_volume: null,
    change,
    change_percent: changePercent,
    as_of: latest.asOf.toISOString(),
    fetched_at: fetchedAt.toISOString(),
    stale_after: staleAfter.toISOString(),
    provider_metadata: {
      endpoint: "spark",
      range: "1d",
      interval: "1m",
      point_count: closeValues.length,
      data_granularity: sparkRow.dataGranularity ?? null,
      source: "supabase_edge_function",
      timestamp_inferred: false,
    },
  };
}

function findLatestClose(row: SparkTickerResult) {
  const timestamps = row.timestamp ?? [];
  const closes = row.close ?? [];
  for (let index = closes.length - 1; index >= 0; index -= 1) {
    const price = cleanNumber(closes[index]);
    const timestamp = timestamps[index];
    if (
      price != null && typeof timestamp === "number" &&
      Number.isFinite(timestamp)
    ) {
      return {
        price,
        asOf: new Date(timestamp * 1000),
      };
    }
  }
  return null;
}

async function upsertSnapshots(rows: LivePriceSnapshotRow[]) {
  const response = await supabaseFetch(
    "/rest/v1/live_price_snapshots?on_conflict=ticker",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Supabase snapshot upsert failed with HTTP ${response.status}: ${await response
        .text()}`,
    );
  }
  return rows.length;
}

async function insertFetchEvent(row: FetchEventRow) {
  try {
    const response = await supabaseFetch("/rest/v1/live_price_fetch_events", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!response.ok) {
      console.warn(
        "Live price fetch event insert failed:",
        response.status,
        await response.text(),
      );
    }
  } catch (error) {
    console.warn("Live price fetch event insert failed:", error);
  }
}

async function supabaseFetch(path: string, init: RequestInit) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be available to the Edge Function.",
    );
  }

  return fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      ...jsonHeaders,
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(init.headers ?? {}),
    },
  });
}

async function readRequestBody(request: Request): Promise<RefreshRequest> {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeTickers(value: RefreshRequest["tickers"]) {
  const configured = Deno.env.get("LIVE_PRICE_TICKERS");
  const rawTickers = Array.isArray(value)
    ? value
    : typeof value === "string"
    ? value.split(",")
    : configured
    ? configured.split(",")
    : DEFAULT_TICKERS;

  return Array.from(
    new Set(
      rawTickers
        .map((ticker) => ticker.trim().toUpperCase())
        .filter((ticker) => /^[A-Z0-9.-]+$/.test(ticker)),
    ),
  );
}

function snapshotMarketState(fetchedAt: Date, latestBarAt: Date) {
  const marketState = marketStateAt(fetchedAt);
  if (marketState !== "regular") {
    return marketState;
  }

  if (easternDateKey(fetchedAt) !== easternDateKey(latestBarAt)) {
    return "closed";
  }
  return "regular";
}

function isRegularMarketTime(value: Date) {
  return marketStateAt(value) === "regular";
}

function marketStateAt(value: Date): LivePriceSnapshotRow["market_state"] {
  const parts = easternParts(value);
  if (!isNyseTradingDay(parts.year, parts.month, parts.day)) {
    return "closed";
  }

  if (parts.totalMinutes >= 9 * 60 + 30 && parts.totalMinutes < 16 * 60) {
    return "regular";
  }
  if (parts.totalMinutes >= 4 * 60 && parts.totalMinutes < 9 * 60 + 30) {
    return "pre";
  }
  if (parts.totalMinutes >= 16 * 60 && parts.totalMinutes < 20 * 60) {
    return "post";
  }
  return "closed";
}

function easternParts(value: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(value);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const hour = read("hour");
  const normalizedHour = hour === 24 ? 0 : hour;
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    totalMinutes: normalizedHour * 60 + read("minute"),
  };
}

function easternDateKey(value: Date) {
  const parts = easternParts(value);
  return dateKey(parts.year, parts.month, parts.day);
}

function isNyseTradingDay(year: number, month: number, day: number) {
  if (
    !Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)
  ) {
    return false;
  }

  const weekday = isoWeekday(year, month, day);
  if (weekday >= 6) {
    return false;
  }

  const current = dateKey(year, month, day);
  return !nyseHolidays(year).has(current);
}

function nyseHolidays(year: number) {
  return new Set([
    observedFixedHoliday(year, 1, 1),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    addDays(easterSunday(year), -2),
    lastWeekday(year, 5, 1),
    observedFixedHoliday(year, 6, 19),
    observedFixedHoliday(year, 7, 4),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observedFixedHoliday(year, 12, 25),
  ]);
}

function observedFixedHoliday(year: number, month: number, day: number) {
  const weekday = isoWeekday(year, month, day);
  if (weekday === 6) {
    return addDays(dateKey(year, month, day), -1);
  }
  if (weekday === 7) {
    return addDays(dateKey(year, month, day), 1);
  }
  return dateKey(year, month, day);
}

function nthWeekday(
  year: number,
  month: number,
  isoDow: number,
  occurrence: number,
) {
  const firstDow = isoWeekday(year, month, 1);
  const offset = (isoDow - firstDow + 7) % 7;
  return dateKey(year, month, 1 + offset + (occurrence - 1) * 7);
}

function lastWeekday(year: number, month: number, isoDow: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = isoWeekday(year, month, lastDay);
  const offset = (lastDow - isoDow + 7) % 7;
  return dateKey(year, month, lastDay - offset);
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const correction = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * correction) / 451);
  const easterMonth = Math.floor((h + correction - 7 * m + 114) / 31);
  const easterDay = ((h + correction - 7 * m + 114) % 31) + 1;
  return dateKey(year, easterMonth, easterDay);
}

function isoWeekday(year: number, month: number, day: number) {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return dateKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${
    String(day).padStart(2, "0")
  }`;
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}
