import type { LatestPrediction, MetricHorizon, TickerHistoryRow } from "../../../api/dashboardData";
import { resolveTickerDisplayPrice, type LivePriceSnapshot } from "../../../api/livePrices";
import type { ChartTooltipItem } from "../ChartTooltip";
import {
  horizonForwardDays,
  horizonLookbackDays,
  horizonOrder,
  preferredDefaultModels,
} from "./constants";
import { chartTimestamp, dateTimestamp } from "./format";
import type {
  AxisDomain,
  ChartResult,
  ChartRow,
  DirectionalAgreement,
  PredictionHorizon,
} from "./types";

export function modelDirectionalAgreement(
  predictions: LatestPrediction[],
  ticker: string,
  horizon: PredictionHorizon,
): DirectionalAgreement {
  const latestByModel = new Map<string, LatestPrediction>();
  predictions
    .filter(
      (row): row is LatestPrediction & { prediction_horizon: PredictionHorizon } =>
        row.ticker === ticker &&
        row.model_slug !== "baseline" &&
        row.prediction_horizon === horizon,
    )
    .forEach((row) => {
      const key = row.model_slug || row.model_name;
      const current = latestByModel.get(key);
      if (!current || predictionSortValue(row) > predictionSortValue(current)) {
        latestByModel.set(key, row);
      }
    });

  const rows = Array.from(latestByModel.values());
  const up = rows.filter((row) => row.predicted_return > 0).length;
  const down = rows.filter((row) => row.predicted_return < 0).length;
  return {
    total: rows.length,
    up,
    down,
    flat: rows.length - up - down,
  };
}

export function buildChartResult({
  daily,
  displayPrice,
  liveSnapshot,
  predictions,
  selectedHorizon,
  fallbackHistory,
}: {
  daily: { date: string; close: number }[];
  displayPrice: ReturnType<typeof resolveTickerDisplayPrice>;
  liveSnapshot: LivePriceSnapshot | null;
  predictions: LatestPrediction[];
  selectedHorizon: PredictionHorizon;
  fallbackHistory: TickerHistoryRow[];
}): ChartResult {
  const rows = new Map<string, ChartRow>();
  const latestActualTs = latestActualTimestamp(daily, displayPrice);
  const lookbackStart = latestActualTs - horizonLookbackDays[selectedHorizon] * 86_400_000;
  const latestDailyTimestamp = Math.max(
    ...daily.map((point) => dateTimestamp(point.date)).filter(Number.isFinite),
  );

  daily.forEach((point) => {
    const timestamp = dateTimestamp(point.date);
    if (timestamp < lookbackStart) {
      return;
    }
    rows.set(point.date, {
      x: point.date,
      timestamp,
      kind: timestamp === latestDailyTimestamp ? "close" : "history",
      actual: point.close,
    });
  });

  const previousClosePoint = previousClosePointFromLive(liveSnapshot);
  if (previousClosePoint) {
    const timestamp = dateTimestamp(previousClosePoint.date);
    if (timestamp >= lookbackStart && !rows.has(previousClosePoint.date)) {
      rows.set(previousClosePoint.date, {
        x: previousClosePoint.date,
        timestamp,
        kind: "close",
        actual: previousClosePoint.close,
      });
    }
  }

  if (displayPrice) {
    const timestamp = chartTimestamp(displayPrice.asOf);
    const x = displayPrice.source === "close" ? displayPrice.asOf : displayPrice.asOf;
    rows.set(x, {
      x,
      timestamp: Number.isFinite(timestamp) ? timestamp : latestActualTs,
      kind: "current",
      actual: displayPrice.price,
    });
  }

  if (rows.size === 0 && fallbackHistory.length > 0) {
    fallbackHistory.forEach((row) => {
      if (row.actual_close == null) {
        return;
      }
      rows.set(row.target_date, {
        x: row.target_date,
        timestamp: dateTimestamp(row.target_date),
        kind: "close",
        actual: row.actual_close,
      });
    });
  }

  const currentRow = latestActualRow(rows);
  const modelNames = Array.from(new Set(predictions.map((row) => row.model_name)));
  predictions
    .forEach((prediction) => {
      const key = prediction.model_name;
      if (currentRow) {
        currentRow[key] = currentRow.actual;
        currentRow.metadata = {
          tooltipHiddenKeys: [
            ...(currentRow.metadata?.tooltipHiddenKeys ?? []),
            key,
            rangeKey(key),
          ],
        };
        if (
          prediction.predicted_close_lower != null &&
          prediction.predicted_close_upper != null &&
          currentRow.actual != null
        ) {
          currentRow[rangeKey(key)] = [currentRow.actual, currentRow.actual];
        }
      }

      const forecastRow = rows.get(prediction.target_date) ?? {
        x: prediction.target_date,
        timestamp: dateTimestamp(prediction.target_date),
        kind: "forecast" as const,
        actual: null,
      };
      forecastRow.kind = forecastRow.kind === "current" ? "current" : "forecast";
      forecastRow[key] = prediction.predicted_close;
      if (prediction.predicted_close_lower != null && prediction.predicted_close_upper != null) {
        forecastRow[rangeKey(key)] = [
          prediction.predicted_close_lower,
          prediction.predicted_close_upper,
        ];
      }
      rows.set(prediction.target_date, forecastRow);
    });

  const domain = chartTimeDomain({
    rows: Array.from(rows.values()),
    currentTimestamp: currentRow?.timestamp ?? latestActualTs,
    selectedHorizon,
    lookbackStart,
  });
  const sortedRows = withLeftEdgeActualRow(
    Array.from(rows.values()).sort((a, b) => a.timestamp - b.timestamp),
    domain[0],
  );
  return {
    rows: sortedRows,
    domain,
    yDomain: chartPriceDomain(sortedRows, modelNames),
    currentTimestamp: currentRow?.timestamp ?? null,
  };
}

function withLeftEdgeActualRow(rows: ChartRow[], domainStart: number): ChartRow[] {
  const firstActualRow = rows.find((row) => row.actual != null && row.kind !== "forecast");
  if (!firstActualRow || firstActualRow.timestamp <= domainStart) {
    return rows;
  }

  return [
    {
      x: "visible-start",
      timestamp: domainStart,
      kind: "edge",
      actual: firstActualRow.actual,
    },
    ...rows,
  ];
}

function chartTimeDomain({
  rows,
  currentTimestamp,
  selectedHorizon,
  lookbackStart,
}: {
  rows: ChartRow[];
  currentTimestamp: number;
  selectedHorizon: PredictionHorizon;
  lookbackStart: number;
}): [number, number] {
  const dayMs = 86_400_000;
  const forecastTimestamps = rows
    .filter((row) => row.kind === "forecast")
    .map((row) => row.timestamp)
    .filter(Number.isFinite);
  const forwardMs = horizonForwardDays[selectedHorizon] * dayMs;
  const forecastEnd = Math.max(currentTimestamp + forwardMs, ...forecastTimestamps);
  const rightPadding = Math.max(forwardMs * 0.1, dayMs * 2);
  const leftPadding = Math.min(dayMs * 3, Math.max(0, currentTimestamp - lookbackStart) * 0.03);
  const start = lookbackStart - leftPadding;
  const end = forecastEnd + rightPadding;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return [Date.now() - horizonLookbackDays[selectedHorizon] * dayMs, Date.now() + forwardMs];
  }

  return [start, end];
}

function chartPriceDomain(rows: ChartRow[], visibleModels: string[]): AxisDomain {
  const values: number[] = [];
  rows.forEach((row) => {
    if (typeof row.actual === "number" && Number.isFinite(row.actual)) {
      values.push(row.actual);
    }
    visibleModels.forEach((model) => {
      const value = row[model];
      if (typeof value === "number" && Number.isFinite(value)) {
        values.push(value);
      }
    });
  });

  if (values.length === 0) {
    return ["auto", "auto"];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = (min + max) / 2;
  const spread = Math.max(max - min, Math.abs(mid) * 0.004, 1);
  const padding = Math.max(spread * 0.22, Math.abs(mid) * 0.0025, 0.5);
  return [min - padding, max + padding];
}

export function withTooltipRanges(
  payload: ChartTooltipItem[],
  hoveredRow: ChartRow | undefined,
  hiddenKeys: Set<string>,
): ChartTooltipItem[] {
  if (!hoveredRow) {
    return payload;
  }

  return payload.flatMap((item) => {
    const name = String(item.name ?? item.dataKey ?? "");
    const rangeDataKey = rangeKey(name);
    const rangeValue = hoveredRow[rangeDataKey];
    if (
      name === "Actual price" ||
      name.endsWith(" 80% range") ||
      hiddenKeys.has(rangeDataKey) ||
      !Array.isArray(rangeValue)
    ) {
      return [item];
    }

    return [
      item,
      {
        dataKey: rangeDataKey,
        name: `${name} 80% range`,
        value: rangeValue,
        color: item.color,
        stroke: item.stroke,
      },
    ];
  });
}

export function latestPredictionsThroughHorizon(
  predictions: LatestPrediction[],
  ticker: string,
  horizon: PredictionHorizon,
) {
  const byModelAndHorizon = new Map<string, LatestPrediction>();
  const maxRank = horizonRank(horizon);
  predictions
    .filter(
      (row): row is LatestPrediction & { prediction_horizon: PredictionHorizon } =>
        row.ticker === ticker &&
        isPredictionHorizon(row.prediction_horizon) &&
        horizonRank(row.prediction_horizon) <= maxRank,
    )
    .forEach((row) => {
      const key = `${row.model_name}|${row.prediction_horizon}`;
      const current = byModelAndHorizon.get(key);
      if (!current || predictionSortValue(row) > predictionSortValue(current)) {
        byModelAndHorizon.set(key, row);
      }
    });
  return Array.from(byModelAndHorizon.values()).sort(
    (a, b) =>
      dateTimestamp(a.target_date) - dateTimestamp(b.target_date) ||
      horizonRank(a.prediction_horizon as PredictionHorizon) -
        horizonRank(b.prediction_horizon as PredictionHorizon) ||
      a.model_name.localeCompare(b.model_name),
  );
}

function isPredictionHorizon(value: MetricHorizon): value is PredictionHorizon {
  return value !== "all";
}

function horizonRank(horizon: PredictionHorizon) {
  return horizonOrder.indexOf(horizon);
}

function predictionSortValue(row: LatestPrediction) {
  return `${row.prediction_date}|${row.target_date}`;
}

function latestActualTimestamp(
  daily: { date: string; close: number }[],
  displayPrice: ReturnType<typeof resolveTickerDisplayPrice>,
) {
  const values = [
    ...daily.map((row) => dateTimestamp(row.date)),
    displayPrice ? Date.parse(displayPrice.asOf) : NaN,
  ].filter(Number.isFinite);
  return values.length > 0 ? Math.max(...values) : Date.now();
}

function previousClosePointFromLive(live: LivePriceSnapshot | null): { date: string; close: number } | null {
  if (!live || live.previous_close == null || !Number.isFinite(live.previous_close)) {
    return null;
  }

  const currentMarketDate = marketDateFromTimestamp(live.as_of);
  if (!currentMarketDate) {
    return null;
  }

  return {
    date: previousWeekdayIsoDate(currentMarketDate),
    close: live.previous_close,
  };
}

function marketDateFromTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function previousWeekdayIsoDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  do {
    date.setUTCDate(date.getUTCDate() - 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);

  return date.toISOString().slice(0, 10);
}

function latestActualRow(rows: Map<string, ChartRow>) {
  return Array.from(rows.values())
    .filter((row) => row.actual != null)
    .sort((a, b) => b.timestamp - a.timestamp)[0];
}

export function withPreferredDefaults(current: string[], models: string[]) {
  const selected = new Set(current);
  preferredDefaultModels.forEach((model) => {
    if (models.includes(model)) {
      selected.add(model);
    }
  });

  return Array.from(selected).filter((model) => models.includes(model));
}

export function isBuffbot(model: string) {
  return model.toLowerCase().includes("buffbot");
}

export function rangeKey(model: string) {
  return `${model} 80% range`;
}
