import { Group, Select, Text } from "@mantine/core";
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
import { resolveTickerDisplayPrice } from "../../api/livePrices";
import { useLiveTickerPrice } from "../../hooks/useLiveTickerPrice";
import { useTickerCloseSnapshot } from "../../hooks/useTickerCloseSnapshot";
import { useTickerPriceSeries } from "../../hooks/useTickerPriceSeries";
import { formatTickerSearchLabel } from "../../utils/tickerSearch";
import SectionPanel from "../layout/SectionPanel";
import PredictionHorizonSelector from "../predictions/PredictionHorizonSelector";
import ChartTooltip, { type ChartTooltipItem } from "./ChartTooltip";
import ModelToggleGroup from "./ModelToggleGroup";
import ChartLoadingState from "./tickerChart/ChartLoadingState";
import DirectionalAgreementBadge from "./tickerChart/DirectionalAgreementBadge";
import FilteredLegend from "./tickerChart/FilteredLegend";
import { lineColors, preferredDefaultModels } from "./tickerChart/constants";
import {
  buildChartResult,
  isBuffbot,
  latestPredictionsThroughHorizon,
  modelDirectionalAgreement,
  withPreferredDefaults,
  withTooltipRanges,
} from "./tickerChart/data";
import { renderActualActiveDot, renderActualDot, renderForecastDot } from "./tickerChart/dots";
import { formatAxisDate, formatTooltipDate, formatYAxisPrice } from "./tickerChart/format";
import type {
  ChartHoverState,
  ChartRow,
  PredictionHorizon,
  TickerChartProps,
} from "./tickerChart/types";

export default function TickerChart({
  history,
  predictions,
  selectedTicker,
  onTickerChange,
  loading,
  tickerCompanyNames = emptyTickerCompanyNames,
  showTickerSelect = true,
  showDirectionalAgreement = false,
}: TickerChartProps) {
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
  const tickerOptions = useMemo(
    () =>
      tickers.map((ticker) => ({
        value: ticker,
        label: formatTickerSearchLabel(ticker, tickerCompanyNames),
      })),
    [tickerCompanyNames, tickers],
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
  const directionalAgreement = useMemo(
    () => modelDirectionalAgreement(predictions, normalizedTicker, selectedHorizon),
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
              data={tickerOptions}
              value={selectedTicker}
              onChange={onTickerChange}
              placeholder="Select ticker"
              searchable
              aria-label="Select ticker for chart by symbol or company name"
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
            {showDirectionalAgreement ? (
              <DirectionalAgreementBadge agreement={directionalAgreement} horizon={selectedHorizon} />
            ) : null}
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

const emptyTickerCompanyNames = new Map<string, string>();
