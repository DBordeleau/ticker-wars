export const REMOVED_TICKERS = new Set(["QQQ"]);

export function isRemovedTicker(ticker: string | null | undefined) {
  return REMOVED_TICKERS.has((ticker ?? "").trim().toUpperCase());
}
