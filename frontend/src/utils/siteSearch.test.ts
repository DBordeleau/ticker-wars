import { searchableModels } from "./models";
import { normalizeSearchQuery, searchLocalEntities } from "./siteSearch";

const tickers = [
  { ticker: "AAPL", company_name: "Apple Inc.", logo_data_url: null },
  { ticker: "MSFT", company_name: "Microsoft Corporation", logo_data_url: null },
  { ticker: "QQQ", company_name: "Invesco QQQ Trust", logo_data_url: null },
];

test("normalizes whitespace and caps search input", () => {
  expect(normalizeSearchQuery("  Chronos   2  ")).toBe("Chronos 2");
  expect(normalizeSearchQuery("x".repeat(80))).toHaveLength(64);
});

test("ranks an exact ticker first and never exposes removed tickers", () => {
  const apple = searchLocalEntities("AAPL", tickers, searchableModels);
  expect(apple[0]).toMatchObject({ kind: "ticker", route: "/tickers/AAPL" });
  expect(searchLocalEntities("QQQ", tickers, searchableModels)).toEqual([]);
});

test("matches company names", () => {
  expect(searchLocalEntities("Micro", tickers, searchableModels)[0]).toMatchObject({
    kind: "ticker",
    route: "/tickers/MSFT",
  });
});

test("matches hyphenated model names with spaces", () => {
  expect(searchLocalEntities("Chronos 2", [], searchableModels)[0]).toMatchObject({
    kind: "model",
    route: "/models/chronos-2",
  });
});
