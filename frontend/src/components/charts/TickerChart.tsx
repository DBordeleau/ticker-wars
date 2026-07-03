import { Group, Select, Skeleton, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LatestPrediction, MetricHorizon, TickerHistoryRow } from "../../api/dashboardData";
import { resolveTickerDisplayPrice, type LivePriceSnapshot } from "../../api/livePrices";
import { useLiveTickerPrice } from "../../hooks/useLiveTickerPrice";
import { useTickerCloseSnapshot } from "../../hooks/useTickerCloseSnapshot";
import { useTickerPriceSeries } from "../../hooks/useTickerPriceSeries";
import SectionPanel from "../layout/SectionPanel";
import PredictionHorizonSelector from "../predictions/PredictionHorizonSelector";
import ChartTooltip from "./ChartTooltip";
import type { ChartTooltipItem } from "./ChartTooltip";
import ModelToggleGroup from "./ModelToggleGroup";

type PredictionHorizon = Exclude<MetricHorizon, "all">;

type Props = {
  history: TickerHistoryRow[];
  predictions: LatestPrediction[];
  selectedTicker: string | null;
  onTickerChange: (ticker: string | null) => void;
  loading: boolean;
  showTickerSelect?: boolean;
};

const lineColors = ["#22c55e", "#60a5fa", "#f59e0b", "#a78bfa", "#ef4444", "#14b8a6"];
const preferredDefaultModels = [
  "Baseline",
  "Linear Regression",
  "Random Forest",
  "TimesFM",
  "Chronos-2",
];
const horizonOrder: PredictionHorizon[] = ["1w", "1m", "3m", "1y"];
const horizonLookbackDays: Record<PredictionHorizon, number> = {
  "1w": 10,
  "1m": 35,
  "3m": 75,
  "1y": 180,
};
const horizonForwardDays: Record<PredictionHorizon, number> = {
  "1w": 7,
  "1m": 31,
  "3m": 92,
  "1y": 366,
};

type ChartRowMetadata = {
  tooltipHiddenKeys?: string[];
};

type ChartRow = {
  x: string;
  timestamp: number;
  kind: "edge" | "history" | "close" | "current" | "forecast";
  actual: number | null;
  metadata?: ChartRowMetadata;
  [key: string]: string | number | [number, number] | ChartRowMetadata | null | undefined;
};

type ChartHoverState = {
  isTooltipActive?: boolean;
  activeLabel?: string | number;
  activePayload?: ChartTooltipItem[];
};

type AxisDomain = [number | "auto", number | "auto"];

type ChartResult = {
  rows: ChartRow[];
  domain: [number, number];
  yDomain: AxisDomain;
  currentTimestamp: number | null;
};

export default function TickerChart({
  history,
  predictions,
  selectedTicker,
  onTickerChange,
  loading,
  showTickerSelect = true,
}: Props) {
  const normalizedTicker = selectedTicker?.trim().toUpperCase() ?? "";
  // Phones get a shorter plot, a slimmer Y axis, tighter margins, and fewer X
  // ticks so the line has room to breathe instead of reading as a squished
  // portrait column. Desktop keeps its original sizing.
  const isCompact = useMediaQuery("(max-width: 767px)");
  const chartHeight = isCompact ? 430 : 590;
  const yAxisWidth = isCompact ? 42 : 64;
  const xAxisMinTickGap = isCompact ? 46 : 28;
  // Only override tick styling on phones; desktop keeps Recharts' defaults.
  const axisTick = isCompact ? { fontSize: 11 } : undefined;
  const chartMargin = isCompact
    ? { top: 28, right: 8, bottom: 10, left: 0 }
    : { top: 34, right: 18, bottom: 12, left: 6 };
  const tickers = useMemo(
    () => Array.from(new Set(predictions.map((row) => row.ticker))).sort(),
    [predictions],
  );
  const [selectedHorizon, setSelectedHorizon] = useState<PredictionHorizon>("1w");
  const priceSeries = useTickerPriceSeries(normalizedTicker);
  const livePrice = useLiveTickerPrice(normalizedTicker, {
    enabled: Boolean(normalizedTicker),
    poll: true,
  });
  const closeSnapshot = useTickerCloseSnapshot(normalizedTicker);
  const displayPrice = resolveTickerDisplayPrice(livePrice.data, closeSnapshot.data);

  const chartPredictions = useMemo(
    () => latestPredictionsThroughHorizon(predictions, normalizedTicker, selectedHorizon),
    [normalizedTicker, predictions, selectedHorizon],
  );
  const models = useMemo(
    () => Array.from(new Set(chartPredictions.map((row) => row.model_name))).sort(),
    [chartPredictions],
  );
  const [visibleModels, setVisibleModels] = useState<string[]>([]);
  const [tooltip, setTooltip] = useState<{
    label: string;
    payload: ChartTooltipItem[];
    timestamp: number;
  } | null>(null);

  useEffect(() => {
    if (models.length === 0) {
      setVisibleModels([]);
      return;
    }

    setVisibleModels((current) => {
      const retained = current.filter((model) => models.includes(model));
      if (retained.length > 0) {
        return withPreferredDefaults(retained, models);
      }

      const defaults = preferredDefaultModels.filter((model) => models.includes(model));
      if (defaults.length > 0) {
        return defaults;
      }

      return models.filter((model) => !isBuffbot(model)).slice(0, 3);
    });
  }, [models]);

  const chartResult = useMemo(
    () =>
      buildChartResult({
        daily: priceSeries.daily,
        displayPrice,
        liveSnapshot: livePrice.data,
        predictions: chartPredictions,
        selectedHorizon,
        fallbackHistory: history.filter((row) => row.ticker === normalizedTicker),
      }),
    [
      displayPrice,
      history,
      chartPredictions,
      normalizedTicker,
      priceSeries.daily,
      selectedHorizon,
    ],
  );
  const chartData = chartResult.rows;
  const currentTimestamp = chartResult.currentTimestamp;
  const chartLoading = loading || priceSeries.loading;

  const handleChartMouseMove = (state: unknown) => {
    const chartState = state as ChartHoverState;
    if (!chartState.isTooltipActive || !chartState.activePayload?.length || chartState.activeLabel == null) {
      setTooltip(null);
      return;
    }

    const hoveredRow = (chartState.activePayload[0] as ChartTooltipItem & { payload?: ChartRow }).payload;
    if (hoveredRow?.kind === "edge") {
      setTooltip(null);
      return;
    }

    const hiddenKeys = new Set(hoveredRow?.metadata?.tooltipHiddenKeys ?? []);
    const payload = chartState.activePayload.filter(
      (item) => item.value != null && !hiddenKeys.has(String(item.dataKey)),
    );
    if (!payload.length) {
      setTooltip(null);
      return;
    }

    setTooltip({
      label: formatTooltipDate(hoveredRow?.x ?? chartState.activeLabel),
      payload: withTooltipRanges(payload, hoveredRow, hiddenKeys),
      timestamp: hoveredRow?.timestamp ?? Number(chartState.activeLabel),
    });
  };

  return (
    <SectionPanel
      title="Price History & Forecast"
      subtitle={
        showTickerSelect
          ? "Select a ticker, inspect recent price history, and compare model forecasts."
          : `Inspect recent ${normalizedTicker} price history and compare model forecasts.`
      }
      action={
        <Group gap="sm" justify="flex-end" className="ticker-chart-actions">
          <PredictionHorizonSelector
            value={selectedHorizon}
            onChange={(value) => setSelectedHorizon(value as PredictionHorizon)}
            label="Ticker chart horizon"
            includeAll={false}
          />
          {showTickerSelect ? (
            <Select
              data={tickers}
              value={selectedTicker}
              onChange={onTickerChange}
              placeholder="Select ticker"
              searchable
              aria-label="Select ticker for chart"
            />
          ) : null}
        </Group>
      }
      className="chart-panel"
    >
      {chartLoading ? (
        <ChartLoadingState />
      ) : !selectedTicker ? (
        <Text c="dimmed" size="sm">
          Select a ticker once predictions are available.
        </Text>
      ) : chartData.length === 0 ? (
        <Text c="dimmed" size="sm">
          Price history for {selectedTicker} will appear once price data is published.
        </Text>
      ) : (
        <>
          <ModelToggleGroup models={models} visibleModels={visibleModels} onChange={setVisibleModels} />
          <div className="chart-box ticker-chart-box">
            {tooltip ? (
              <div className="chart-static-tooltip">
                <ChartTooltip label={tooltip.label} payload={tooltip.payload} />
              </div>
            ) : null}
            <ResponsiveContainer width="100%" height={chartHeight}>
              <ComposedChart
                data={chartData}
                margin={chartMargin}
                onMouseMove={handleChartMouseMove}
                onMouseLeave={() => setTooltip(null)}
              >
                <CartesianGrid stroke="rgba(255, 255, 255, 0.08)" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={chartResult.domain}
                  stroke="#b8c6bf"
                  tick={axisTick}
                  tickLine={true}
                  axisLine={true}
                  minTickGap={xAxisMinTickGap}
                  tickFormatter={(value) => formatAxisDate(value)}
                />
                <YAxis
                  stroke="#b8c6bf"
                  tick={axisTick}
                  tickLine={true}
                  axisLine={true}
                  width={yAxisWidth}
                  domain={chartResult.yDomain}
                  allowDataOverflow
                  tickFormatter={(value) => formatYAxisPrice(value)}
                />
                <Legend
                  verticalAlign="top"
                  align="center"
                  wrapperStyle={{ paddingBottom: 12 }}
                  content={<FilteredLegend />}
                />
                <Tooltip
                  content={() => null}
                  cursor={false}
                  isAnimationActive={false}
                />
                {currentTimestamp ? (
                  <ReferenceLine
                    x={currentTimestamp}
                    stroke="rgba(244, 247, 245, 0.52)"
                    strokeDasharray="3 5"
                    ifOverflow="extendDomain"
                  />
                ) : null}
                {tooltip ? (
                  <ReferenceLine
                    x={tooltip.timestamp}
                    stroke="rgba(244, 247, 245, 0.78)"
                    strokeWidth={1.5}
                    ifOverflow="extendDomain"
                  />
                ) : null}
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Actual price"
                  stroke="#f4f7f5"
                  strokeWidth={3}
                  dot={renderActualDot}
                  activeDot={renderActualActiveDot}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {visibleModels.map((model, index) => (
                  <Line
                    key={model}
                    type="monotone"
                    dataKey={model}
                    name={model}
                    stroke={lineColors[index % lineColors.length]}
                    strokeWidth={model.toLowerCase().includes("baseline") ? 2 : 2.4}
                    strokeDasharray={model.toLowerCase().includes("baseline") ? "5 5" : "6 5"}
                    dot={renderForecastDot(model, lineColors[index % lineColors.length])}
                    activeDot={{ r: 5, stroke: lineColors[index % lineColors.length], strokeWidth: 2 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </SectionPanel>
  );
}

function buildChartResult({
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

function withTooltipRanges(
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

function latestPredictionsThroughHorizon(
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

function dateTimestamp(value: string) {
  return Date.parse(`${value}T16:00:00Z`);
}

function chartTimestamp(value: string) {
  return isIsoDateOnly(value) ? dateTimestamp(value) : Date.parse(value);
}

function formatAxisDate(value: string | number) {
  const date = parseChartDate(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function formatYAxisPrice(value: string | number) {
  const price = Number(value);
  if (!Number.isFinite(price)) {
    return String(value);
  }
  return `$${Math.round(price).toLocaleString("en-US")}`;
}

function formatTooltipDate(value: string | number) {
  const text = String(value);
  const date = parseChartDate(value);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  const hasTime = typeof value === "number" || text.includes("T");
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function parseChartDate(value: string | number) {
  if (typeof value === "number") {
    return new Date(value);
  }

  if (isIsoDateOnly(value)) {
    return new Date(`${value}T16:00:00Z`);
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return new Date(numericValue);
  }

  return new Date(value);
}

function isIsoDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function withPreferredDefaults(current: string[], models: string[]) {
  const selected = new Set(current);
  preferredDefaultModels.forEach((model) => {
    if (models.includes(model)) {
      selected.add(model);
    }
  });

  return Array.from(selected).filter((model) => models.includes(model));
}

function isBuffbot(model: string) {
  return model.toLowerCase().includes("buffbot");
}

function rangeKey(model: string) {
  return `${model} 80% range`;
}

type LegendEntry = {
  value?: string | number;
  color?: string;
};

function FilteredLegend({ payload }: { payload?: LegendEntry[] }) {
  const entries = (payload ?? []).filter(
    (entry) => !String(entry.value ?? "").includes("80% range"),
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="chart-custom-legend">
      {entries.map((entry) => (
        <span className="chart-custom-legend-item" key={String(entry.value)}>
          <span
            className="chart-custom-legend-line"
            style={{ backgroundColor: entry.color ?? "#f4f7f5" }}
            aria-hidden
          />
          <span className="chart-legend-label">{entry.value}</span>
        </span>
      ))}
    </div>
  );
}

function renderActualDot(props: unknown) {
  const dot = props as { cx?: number; cy?: number; payload?: ChartRow };
  if (dot.cx == null || dot.cy == null || !dot.payload) {
    return <g />;
  }
  if (dot.payload.kind === "history") {
    return (
      <circle
        cx={dot.cx}
        cy={dot.cy}
        r={2.5}
        fill="#f4f7f5"
        stroke="#06110b"
        strokeWidth={1.4}
        opacity={0.58}
      />
    );
  }
  if (dot.payload.kind === "close") {
    return <circle cx={dot.cx} cy={dot.cy} r={2.8} fill="#f4f7f5" opacity={0.72} />;
  }
  if (dot.payload.kind === "current") {
    return (
      <circle
        cx={dot.cx}
        cy={dot.cy}
        r={5}
        fill="#f4f7f5"
        stroke="#22c55e"
        strokeWidth={2.4}
      />
    );
  }
  return <g />;
}

function renderActualActiveDot(props: unknown) {
  const dot = props as { cx?: number; cy?: number; payload?: ChartRow };
  if (dot.cx == null || dot.cy == null || !dot.payload) {
    return <g />;
  }
  if (dot.payload.kind === "edge" || dot.payload.kind === "forecast") {
    return <g />;
  }
  return (
    <circle
      cx={dot.cx}
      cy={dot.cy}
      r={5.5}
      fill="#f4f7f5"
      stroke={dot.payload.kind === "current" ? "#22c55e" : "#06110b"}
      strokeWidth={2.4}
    />
  );
}

function renderForecastDot(model: string, color: string) {
  return (props: unknown) => {
    const dot = props as { cx?: number; cy?: number; payload?: ChartRow };
    if (dot.cx == null || dot.cy == null || dot.payload?.kind !== "forecast") {
      return <g />;
    }
    if (dot.payload[model] == null) {
      return <g />;
    }
    return <circle cx={dot.cx} cy={dot.cy} r={4.8} fill={color} stroke="#06110b" strokeWidth={2} />;
  };
}

function ChartLoadingState() {
  return (
    <div className="chart-loading-state" aria-label="Loading ticker chart">
      <div className="chart-toggle-skeletons">
        {[0, 1, 2, 3, 4].map((item) => (
          <Skeleton key={item} height={40} radius="sm" />
        ))}
      </div>
      <div className="chart-box ticker-chart-box chart-skeleton-box">
        <Skeleton height={360} radius="sm" />
        <div className="chart-skeleton-line chart-skeleton-line-primary" />
        <div className="chart-skeleton-line chart-skeleton-line-secondary" />
        <div className="chart-skeleton-line chart-skeleton-line-tertiary" />
      </div>
      <Group gap="md" mt="xs">
        <Skeleton width={150} height={16} radius="sm" />
        <Skeleton width={210} height={16} radius="sm" />
      </Group>
    </div>
  );
}
