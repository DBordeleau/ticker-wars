import type { TickerAsset } from "../api/dashboardData";
import type { ModelInfo } from "./models";
import { isRemovedTicker } from "../api/tickerUniverse";

export type SearchKind = "ticker" | "model" | "user";

export type SiteSearchResult = {
  id: string;
  kind: SearchKind;
  primary: string;
  secondary: string;
  route: string;
  score: number;
  logoUrl?: string | null;
  modelType?: string;
  avatarSeed?: string;
  level?: number;
};

export function normalizeSearchQuery(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 64);
}

function compact(value: string) {
  return normalizeSearchQuery(value).toLowerCase().replace(/[-\s]+/g, "-");
}

function matchScore(query: string, canonical: string, label: string) {
  const q = compact(query);
  const key = compact(canonical);
  const text = compact(label);
  if (!q) return 0;
  if (key === q) return 100;
  if (text === q) return 95;
  if (key.startsWith(q)) return 80;
  if (text.startsWith(q) || text.split("-").some((word) => word.startsWith(q))) return 65;
  if (text.includes(q)) return 40;
  return 0;
}

export function searchLocalEntities(
  rawQuery: string,
  tickers: TickerAsset[],
  models: ModelInfo[],
): SiteSearchResult[] {
  const query = normalizeSearchQuery(rawQuery).replace(/^@/, "");
  if (!query) return [];
  const results: SiteSearchResult[] = [];
  tickers.forEach((ticker) => {
    if (isRemovedTicker(ticker.ticker)) return;
    const score = matchScore(query, ticker.ticker, ticker.company_name ?? "");
    if (score) results.push({
      id: `ticker-${ticker.ticker}`,
      kind: "ticker",
      primary: ticker.ticker,
      secondary: ticker.company_name ?? "Ticker",
      route: `/tickers/${ticker.ticker}`,
      logoUrl: ticker.logo_data_url,
      score: score + (/^[A-Z.]+$/.test(rawQuery.trim()) ? 5 : 0),
    });
  });
  models.forEach((model) => {
    const score = matchScore(query, model.slug, model.name);
    if (score) results.push({
      id: `model-${model.slug}`,
      kind: "model",
      primary: model.name,
      secondary: model.description,
      route: `/models/${model.slug}`,
      modelType: model.type,
      score,
    });
  });
  return results.sort((a, b) => b.score - a.score || a.primary.localeCompare(b.primary)).slice(0, 8);
}

export function mergeSearchResults(local: SiteSearchResult[], users: SiteSearchResult[]) {
  return [...local, ...users].sort((a, b) => b.score - a.score || a.primary.localeCompare(b.primary)).slice(0, 12);
}
