import type { LatestPrediction, MetricHorizon, TickerHistoryRow } from "../../../api/dashboardData";
import type { TickerCompanyNames } from "../../../utils/tickerSearch";
import type { ChartTooltipItem } from "../ChartTooltip";

export type PredictionHorizon = Exclude<MetricHorizon, "all">;

export type TickerChartProps = {
  history: TickerHistoryRow[];
  predictions: LatestPrediction[];
  selectedTicker: string | null;
  onTickerChange: (ticker: string | null) => void;
  loading: boolean;
  tickerCompanyNames?: TickerCompanyNames;
  showTickerSelect?: boolean;
  showDirectionalAgreement?: boolean;
};

export type ChartRowMetadata = {
  tooltipHiddenKeys?: string[];
};

export type ChartRow = {
  x: string;
  timestamp: number;
  kind: "edge" | "history" | "close" | "current" | "forecast";
  actual: number | null;
  metadata?: ChartRowMetadata;
  [key: string]: string | number | [number, number] | ChartRowMetadata | null | undefined;
};

export type ChartHoverState = {
  isTooltipActive?: boolean;
  activeLabel?: string | number;
  activePayload?: ChartTooltipItem[];
};

export type AxisDomain = [number | "auto", number | "auto"];

export type ChartResult = {
  rows: ChartRow[];
  domain: [number, number];
  yDomain: AxisDomain;
  currentTimestamp: number | null;
};

export type DirectionalAgreement = {
  total: number;
  up: number;
  down: number;
  flat: number;
};
