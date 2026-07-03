import { Group, SegmentedControl, Skeleton, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { useMemo, useState } from "react";
import { FiSearch, FiTrendingDown, FiTrendingUp } from "react-icons/fi";
import { Link } from "react-router-dom";
import type {
  LatestPrediction,
  LatestUserPrediction,
  MetricHorizon,
} from "../api/dashboardData";
import AnimatedSection from "../components/layout/AnimatedSection";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";
import DashboardFooter from "../components/layout/DashboardFooter";
import MagicHoverSurface from "../components/layout/MagicHoverSurface";
import EntityHoverCard from "../components/cards/EntityHoverCard";
import TickerLogoMark from "../components/tickers/TickerLogoMark";
import UserPredictionButton from "../components/predictions/UserPredictionButton";
import PredictionHorizonSelector from "../components/predictions/PredictionHorizonSelector";
import { useDashboardData } from "../hooks/useDashboardData";
import { useTickerPriceChanges } from "../hooks/useTickerPriceChanges";
import { formatSignedPercent } from "../utils/format";

type SortKey = "ticker" | "model" | "user" | "price";

type TickerUniverseRow = {
  ticker: string;
  logoUrl: string | null;
  close: number | null;
  priceChange: number | null;
  modelConsensus: number | null;
  userConsensus: number | null;
};

export default function TickerUniverse() {
  const dashboard = useDashboardData();
  const priceChanges = useTickerPriceChanges();
  const [query, setQuery] = useState("");
  const [horizon, setHorizon] = useState<MetricHorizon>("1m");
  const [sort, setSort] = useState<SortKey>("ticker");

  const { latestPredictions, latestUserPredictions, tickerAssets, loading } = dashboard;

  // One row per ticker in the predictable universe. The selected horizon scopes
  // the model and user consensus leans; the daily change is the last full session
  // price move (independent of horizon).
  const rows = useMemo<TickerUniverseRow[]>(() => {
    const logoByTicker = new Map(tickerAssets.map((asset) => [asset.ticker, asset.logo_data_url]));
    const byTicker = new Map<string, LatestPrediction[]>();
    for (const prediction of latestPredictions) {
      const existing = byTicker.get(prediction.ticker);
      if (existing) {
        existing.push(prediction);
      } else {
        byTicker.set(prediction.ticker, [prediction]);
      }
    }

    const userByTicker = new Map<string, LatestUserPrediction[]>();
    for (const prediction of latestUserPredictions) {
      const existing = userByTicker.get(prediction.ticker);
      if (existing) {
        existing.push(prediction);
      } else {
        userByTicker.set(prediction.ticker, [prediction]);
      }
    }

    const inHorizon = (rowHorizon: MetricHorizon) =>
      horizon === "all" ? true : rowHorizon === horizon;

    return Array.from(byTicker.entries()).map(([ticker, predictions]) => {
      const scopedModels = predictions.filter(
        (prediction) => prediction.model_slug !== "baseline" && inHorizon(prediction.prediction_horizon),
      );
      const scopedUsers = (userByTicker.get(ticker) ?? []).filter((prediction) =>
        inHorizon(prediction.prediction_horizon),
      );

      const snapshot = priceChanges.data[ticker];
      const priceChange = horizon === "all" ? null : snapshot?.changes[horizon] ?? null;

      return {
        ticker,
        logoUrl: logoByTicker.get(ticker) ?? null,
        close: snapshot?.close ?? predictions[0]?.reference_close ?? null,
        priceChange,
        modelConsensus: averageReturn(scopedModels),
        userConsensus: averageReturn(scopedUsers),
      };
    });
  }, [latestPredictions, latestUserPredictions, tickerAssets, horizon, priceChanges.data]);

  const visibleRows = useMemo(() => {
    const search = query.trim().toUpperCase();
    return rows
      .filter((row) => (search ? row.ticker.includes(search) : true))
      .sort((a, b) => {
        if (sort === "ticker") {
          return a.ticker.localeCompare(b.ticker);
        }
        if (sort === "price") {
          return compareDesc(a.priceChange, b.priceChange) || a.ticker.localeCompare(b.ticker);
        }
        const key = sort === "model" ? "modelConsensus" : "userConsensus";
        return compareDesc(a[key], b[key]) || a.ticker.localeCompare(b.ticker);
      });
  }, [rows, query, sort]);

  const countLabel = loading
    ? "Loading tickers"
    : `${visibleRows.length} ${visibleRows.length === 1 ? "ticker" : "tickers"}`;
  const movementLabel = horizonMovementLabel(horizon);
  const movementTooltip = `Price change over the ${horizonPeriodPhrase(horizon)}.`;

  return (
    <main className="dashboard-shell">
      <AnimatedSection delay={0}>
        <BackToDashboardButton />
      </AnimatedSection>
      <AnimatedSection delay={0.08}>
        <header className="predictions-header">
          <Text className="predictions-header-eyebrow">All Tickers</Text>
          <Title order={1} className="predictions-header-title">
            Make a Prediction
          </Title>
          <Text className="predictions-header-lead">
            Make a prediction on any of the following securities.
          </Text>
        </header>
      </AnimatedSection>

      <AnimatedSection delay={0.16}>
        <div className="ticker-universe-controls">
          <div className="ticker-universe-controls-lead">
            <TextInput
              className="ticker-universe-search"
              leftSection={<FiSearch />}
              placeholder="Search ticker"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              aria-label="Search tickers by symbol"
            />
            <Text className="ticker-universe-count">{countLabel}</Text>
          </div>
          <div className="ticker-universe-control-group">
            <PredictionHorizonSelector
              value={horizon}
              onChange={setHorizon}
              label="Consensus horizon"
              includeAll={false}
            />
            <SortSelector value={sort} onChange={setSort} />
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection delay={0.22}>
        {loading ? (
          <div className="ticker-universe-grid">
            {Array.from({ length: 9 }).map((_, index) => (
              <Skeleton key={index} height={196} radius="sm" />
            ))}
          </div>
        ) : visibleRows.length === 0 ? (
          <MagicHoverSurface className="section-magic-surface">
            <div className="section-panel">
              <Text c="dimmed" size="sm">
                No tickers match your search yet.
              </Text>
            </div>
          </MagicHoverSurface>
        ) : (
          <div className="ticker-universe-grid">
            {visibleRows.map((row) => (
              <TickerCard
                key={row.ticker}
                row={row}
                latestPredictions={latestPredictions}
                movementLabel={movementLabel}
                movementTooltip={movementTooltip}
                onSaved={() => void dashboard.refetch()}
              />
            ))}
          </div>
        )}
      </AnimatedSection>

      <AnimatedSection delay={0.3}>
        <DashboardFooter metadata={dashboard.metadata} loading={loading} />
      </AnimatedSection>
    </main>
  );
}

function TickerCard({
  row,
  latestPredictions,
  movementLabel,
  movementTooltip,
  onSaved,
}: {
  row: TickerUniverseRow;
  latestPredictions: LatestPrediction[];
  movementLabel: string;
  movementTooltip: string;
  onSaved: () => void;
}) {
  return (
    <MagicHoverSurface className="ticker-universe-magic">
      <article className="ticker-universe-card">
        <div className="ticker-universe-card-head">
          <EntityHoverCard kind="ticker" ticker={row.ticker} logoUrl={row.logoUrl}>
            <Group gap="xs" wrap="nowrap" className="ticker-universe-identity">
              <TickerLogoMark ticker={row.ticker} logoUrl={row.logoUrl} size="md" />
              <Text
                component={Link}
                to={`/tickers/${row.ticker}`}
                className="ticker-universe-symbol plain-link"
              >
                {row.ticker}
              </Text>
            </Group>
          </EntityHoverCard>
          <div className="ticker-universe-move-block">
            <Tooltip label={movementTooltip} openDelay={250}>
              <span className="ticker-universe-move-label">{movementLabel}</span>
            </Tooltip>
            <span className={`ticker-universe-daily ${moveClass(row.priceChange)}`}>
              <MoveArrow value={row.priceChange} />
              {row.priceChange == null ? "—" : formatSignedPercent(row.priceChange)}
            </span>
          </div>
        </div>

        <div className="ticker-universe-stats">
          <ConsensusStat
            label="Model lean"
            tooltip="Average predicted return across models for the selected horizon."
            value={row.modelConsensus}
          />
          <ConsensusStat
            label="User lean"
            tooltip="Average predicted return across users for the selected horizon."
            value={row.userConsensus}
          />
        </div>

        <div className="ticker-universe-card-action">
          <UserPredictionButton
            ticker={row.ticker}
            latestPredictions={latestPredictions}
            compact
            onSaved={onSaved}
          />
        </div>
      </article>
    </MagicHoverSurface>
  );
}

function ConsensusStat({
  label,
  tooltip,
  value,
}: {
  label: string;
  tooltip: string;
  value: number | null;
}) {
  return (
    <div className="ticker-universe-stat">
      <Tooltip label={tooltip} openDelay={250}>
        <span className="ticker-universe-stat-label">{label}</span>
      </Tooltip>
      <span className={`ticker-universe-stat-value ${moveClass(value)}`}>
        {value == null ? "—" : formatSignedPercent(value)}
      </span>
    </div>
  );
}

function horizonMovementLabel(horizon: MetricHorizon): string {
  switch (horizon) {
    case "1w":
      return "Past week";
    case "1m":
      return "Past month";
    case "3m":
      return "Past 3 months";
    case "1y":
      return "Past year";
    default:
      return "Recent move";
  }
}

function horizonPeriodPhrase(horizon: MetricHorizon): string {
  switch (horizon) {
    case "1w":
      return "past week";
    case "1m":
      return "past month";
    case "3m":
      return "past 3 months";
    case "1y":
      return "past year";
    default:
      return "recent period";
  }
}

function MoveArrow({ value }: { value: number | null }) {
  if (value == null || value === 0) {
    return null;
  }
  return value > 0 ? <FiTrendingUp aria-hidden /> : <FiTrendingDown aria-hidden />;
}

function SortSelector({ value, onChange }: { value: SortKey; onChange: (value: SortKey) => void }) {
  const options: { value: SortKey; label: string; tooltip: string }[] = [
    { value: "ticker", label: "A–Z", tooltip: "Sort tickers alphabetically." },
    { value: "model", label: "Models", tooltip: "Sort by the most bullish model consensus." },
    { value: "user", label: "Users", tooltip: "Sort by the most bullish user consensus." },
    { value: "price", label: "Price", tooltip: "Sort by price change for the selected horizon, biggest gainers first." },
  ];

  return (
    <div className="horizon-selector-wrap ticker-universe-segment" aria-label="Sort tickers">
      <SegmentedControl
        className="horizon-selector"
        value={value}
        onChange={(next) => onChange(next as SortKey)}
        data={options.map((option) => ({
          value: option.value,
          label: (
            <Tooltip label={option.tooltip} openDelay={250}>
              <span className="horizon-selector-label">{option.label}</span>
            </Tooltip>
          ),
        }))}
      />
    </div>
  );
}

function averageReturn(predictions: { predicted_return: number | null }[]): number | null {
  const visiblePredictions = predictions.filter(
    (prediction): prediction is { predicted_return: number } => prediction.predicted_return != null,
  );
  if (visiblePredictions.length === 0) {
    return null;
  }
  return visiblePredictions.reduce((sum, prediction) => sum + prediction.predicted_return, 0) / visiblePredictions.length;
}

// Descending order with nulls sorted to the end regardless of direction.
function compareDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function moveClass(value: number | null): string {
  if (value == null || value === 0) {
    return "ticker-universe-move-flat";
  }
  return value > 0 ? "prediction-return-up" : "prediction-return-down";
}
