import { Group, Select, Skeleton, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { LatestPrediction, TickerHistoryRow } from "../../api/dashboardData";
import SectionPanel from "../layout/SectionPanel";
import ChartTooltip from "./ChartTooltip";
import type { ChartTooltipItem } from "./ChartTooltip";
import ModelToggleGroup from "./ModelToggleGroup";

type Props = {
  history: TickerHistoryRow[];
  predictions: LatestPrediction[];
  selectedTicker: string | null;
  onTickerChange: (ticker: string | null) => void;
  loading: boolean;
};

const lineColors = ["#22c55e", "#60a5fa", "#f59e0b", "#a78bfa", "#ef4444", "#14b8a6"];

type ChartHoverState = {
  isTooltipActive?: boolean;
  activeLabel?: string | number;
  activePayload?: ChartTooltipItem[];
};

function formatChartDate(value: string | number, includeYear: boolean) {
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) {
    return String(value);
  }

  return includeYear ? `${year}/${month}/${day}` : `${month}/${day}`;
}

export default function TickerChart({
  history,
  predictions,
  selectedTicker,
  onTickerChange,
  loading,
}: Props) {
  const tickers = useMemo(
    () => Array.from(new Set(predictions.map((row) => row.ticker))).sort(),
    [predictions],
  );
  const models = useMemo(
    () => Array.from(new Set(history.map((row) => row.model_name))).sort(),
    [history],
  );
  const [visibleModels, setVisibleModels] = useState<string[]>([]);
  const [tooltip, setTooltip] = useState<{ label: string; payload: ChartTooltipItem[] } | null>(null);

  useEffect(() => {
    if (models.length === 0) {
      setVisibleModels([]);
      return;
    }

    setVisibleModels((current) => {
      const retained = current.filter((model) => models.includes(model));
      if (retained.length > 0) {
        return retained;
      }

      const baseline = models.find((model) => model.toLowerCase().includes("baseline"));
      return baseline ? [baseline, ...models.filter((model) => model !== baseline).slice(0, 2)] : models.slice(0, 3);
    });
  }, [models]);

  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, string | number | null>>();

    history.forEach((row) => {
      const current = byDate.get(row.date) ?? { date: row.date, actual: row.actual_close };
      current.actual = row.actual_close;
      current[row.model_name] = row.predicted_close;
      byDate.set(row.date, current);
    });

    return Array.from(byDate.values());
  }, [history]);

  const hasDuplicateMonthDay = useMemo(() => {
    const seen = new Set<string>();

    return chartData.some((row) => {
      const [, month, day] = String(row.date).split("-");
      const monthDay = `${month}/${day}`;
      if (seen.has(monthDay)) {
        return true;
      }

      seen.add(monthDay);
      return false;
    });
  }, [chartData]);

  const handleChartMouseMove = (state: unknown) => {
    const chartState = state as ChartHoverState;
    if (!chartState.isTooltipActive || !chartState.activePayload?.length || chartState.activeLabel == null) {
      setTooltip(null);
      return;
    }

    setTooltip({
      label: formatChartDate(chartState.activeLabel, true),
      payload: chartState.activePayload,
    });
  };

  return (
    <SectionPanel
      title="Actual vs Predicted"
      subtitle="Select a ticker and compare model prediction lines against actual closes."
      action={
        <Select
          data={tickers}
          value={selectedTicker}
          onChange={onTickerChange}
          placeholder="Select ticker"
          searchable
          aria-label="Select ticker for chart"
        />
      }
      className="chart-panel"
    >
      {loading ? (
        <ChartLoadingState />
      ) : !selectedTicker ? (
        <Text c="dimmed" size="sm">
          Select a ticker once predictions are available.
        </Text>
      ) : chartData.length === 0 ? (
        <Text c="dimmed" size="sm">
          Chart history for {selectedTicker} will appear after scored dashboard history is published.
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
            <ResponsiveContainer width="100%" height={360}>
              <LineChart
                data={chartData}
                margin={{ top: 34, right: 18, bottom: 12, left: 6 }}
                onMouseMove={handleChartMouseMove}
                onMouseLeave={() => setTooltip(null)}
              >
                <CartesianGrid stroke="rgba(255, 255, 255, 0.08)" />
                <XAxis
                  dataKey="date"
                  stroke="#b8c6bf"
                  tickLine={true}
                  axisLine={true}
                  minTickGap={28}
                  tickFormatter={(value) => formatChartDate(value, hasDuplicateMonthDay)}
                />
                <YAxis
                  stroke="#b8c6bf"
                  tickLine={true}
                  axisLine={true}
                  width={64}
                  domain={["auto", "auto"]}
                />
                <Legend
                  verticalAlign="top"
                  align="center"
                  iconType="plainline"
                  wrapperStyle={{ paddingBottom: 12 }}
                  formatter={(value) => <span className="chart-legend-label">{value}</span>}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Actual close"
                  stroke="#f4f7f5"
                  strokeWidth={3}
                  dot={false}
                  connectNulls
                />
                {visibleModels.map((model, index) => (
                  <Line
                    key={model}
                    type="monotone"
                    dataKey={model}
                    name={model}
                    stroke={lineColors[index % lineColors.length]}
                    strokeWidth={model.toLowerCase().includes("baseline") ? 2 : 2.4}
                    strokeDasharray={model.toLowerCase().includes("baseline") ? "5 5" : undefined}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </SectionPanel>
  );
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
