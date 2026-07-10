import type { TickerAsset } from "../api/dashboardData";

export type TickerCompanyNames = Map<string, string>;

export function buildTickerCompanyNameMap(tickerAssets: Pick<TickerAsset, "ticker" | "company_name">[]): TickerCompanyNames {
  const names = new Map<string, string>();
  tickerAssets.forEach((asset) => {
    const ticker = normalizeTicker(asset.ticker);
    const companyName = asset.company_name?.trim();
    if (ticker && companyName) {
      names.set(ticker, companyName);
    }
  });
  return names;
}

export function tickerMatchesSearch(
  ticker: string,
  query: string,
  companyNames: TickerCompanyNames,
): boolean {
  const needle = normalizeSearch(query);
  if (!needle) {
    return true;
  }

  const normalizedTicker = normalizeTicker(ticker);
  const companyName = normalizeSearch(companyNames.get(normalizedTicker) ?? "");
  return normalizedTicker.includes(needle) || companyName.includes(needle);
}

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeSearch(value: string): string {
  return value.trim().toUpperCase();
}
