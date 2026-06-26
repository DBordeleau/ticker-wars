import { Badge, Button, Group, Skeleton, Table, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { FiArrowDown, FiArrowUp, FiChevronDown } from "react-icons/fi";
import { Link } from "react-router-dom";
import type { LatestPrediction, MetricHorizon } from "../../api/dashboardData";
import type { UserPrediction } from "../../api/userPredictions";
import type { DashboardView } from "../dashboard/DashboardViewToggle";
import DashboardViewToggle from "../dashboard/DashboardViewToggle";
import {
  formatCurrency,
  formatDate,
  formatHorizon,
} from "../../utils/format";
import MagicHoverSurface from "../layout/MagicHoverSurface";
import SectionPanel from "../layout/SectionPanel";
import EntityHoverCard from "../cards/EntityHoverCard";
import PredictionCardList from "./PredictionCardList";
import PredictionFilters from "./PredictionFilters";
import PredictionHorizonSelector from "./PredictionHorizonSelector";
import PredictionValue from "./PredictionValue";
import UserPredictionButton from "./UserPredictionButton";
import TickerLogoMark from "../tickers/TickerLogoMark";

type SortKey = "ticker" | "model" | "horizon" | "reference" | "close" | "target" | "prediction";

type Props = {
  rows: LatestPrediction[];
  loading: boolean;
  collapsible?: boolean;
  view?: DashboardView;
  onViewChange?: (view: DashboardView) => void;
  showTickerFilter?: boolean;
  embedded?: boolean;
  onPredictionSaved?: (prediction: UserPrediction) => void;
  tickerLogos?: Record<string, string | null>;
};

const predictionPreviewSize = 5;
const predictionPageSize = 25;

export default function PredictionTable({
  rows,
  loading,
  collapsible = false,
  view = "models",
  onViewChange,
  showTickerFilter = true,
  embedded = false,
  onPredictionSaved,
  tickerLogos = {},
}: Props) {
  const [tickerQuery, setTickerQuery] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("prediction");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [isPaged, setIsPaged] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isOpen, setIsOpen] = useState(true);
  const [horizon, setHorizon] = useState<MetricHorizon>("all");

  const predictionRows = useMemo(
    () => rows.filter((row) => row.model_slug !== "baseline"),
    [rows],
  );

  const modelOptions = useMemo(
    () => Array.from(new Set(predictionRows.map((row) => row.model_name))).sort(),
    [predictionRows],
  );

  const visibleRows = useMemo(() => {
    const query = tickerQuery.trim().toUpperCase();

    return predictionRows
      .filter((row) => (query ? row.ticker.includes(query) : true))
      .filter((row) => (model ? row.model_name === model : true))
      .filter((row) => (horizon === "all" ? true : row.prediction_horizon === horizon))
      .sort((a, b) => {
        const direction = sortDirection === "asc" ? 1 : -1;
        if (sortKey === "close") {
          return (a.predicted_return - b.predicted_return) * direction;
        }
        if (sortKey === "reference") {
          return (a.reference_close - b.reference_close) * direction;
        }
        if (sortKey === "model") {
          return a.model_name.localeCompare(b.model_name) * direction;
        }
        if (sortKey === "target") {
          return a.target_date.localeCompare(b.target_date) * direction;
        }
        if (sortKey === "prediction") {
          return a.prediction_date.localeCompare(b.prediction_date) * direction;
        }
        if (sortKey === "horizon") {
          return (horizonWeight(a.prediction_horizon) - horizonWeight(b.prediction_horizon)) * direction;
        }
        return a.ticker.localeCompare(b.ticker) * direction;
      });
  }, [horizon, model, predictionRows, sortDirection, sortKey, tickerQuery]);

  useEffect(() => {
    setIsPaged(false);
    setCurrentPage(0);
  }, [horizon, model, sortDirection, sortKey, tickerQuery]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, Math.max(0, Math.ceil(visibleRows.length / predictionPageSize) - 1)));
  }, [visibleRows.length]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / predictionPageSize));
  const pageStart = currentPage * predictionPageSize;
  const displayedRows = isPaged
    ? visibleRows.slice(pageStart, pageStart + predictionPageSize)
    : visibleRows.slice(0, predictionPreviewSize);
  const shownStart = visibleRows.length === 0 ? 0 : pageStart + 1;
  const shownEnd = isPaged ? Math.min(pageStart + predictionPageSize, visibleRows.length) : displayedRows.length;
  const hoverMotion = { scale: 1.014, y: -1 };
  const pressMotion = { scale: 0.972, y: 1 };
  const pressTransition = {
    type: "spring" as const,
    stiffness: 500,
    damping: 20,
    mass: 0.46,
  };

  const setSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const filters = (
    <Group className="prediction-controls" justify="flex-end" gap="sm">
      {onViewChange ? (
        <DashboardViewToggle value={view} onChange={onViewChange} label="Latest prediction view" />
      ) : null}
      <PredictionHorizonSelector value={horizon} onChange={setHorizon} />
      <PredictionFilters
        tickerQuery={tickerQuery}
        model={model}
        models={modelOptions}
        onTickerQueryChange={setTickerQuery}
        onModelChange={setModel}
        showTickerFilter={showTickerFilter}
      />
    </Group>
  );

  const predictions = loading ? (
    <Skeleton height={360} radius="sm" />
  ) : predictionRows.length === 0 ? (
    <Text c="dimmed" size="sm">
      Latest predictions will appear after the pipeline publishes dashboard rows.
    </Text>
  ) : visibleRows.length === 0 ? (
    <Text c="dimmed" size="sm">
      No latest predictions match this horizon and filter selection.
    </Text>
  ) : (
    <>
      <div className="desktop-table">
        <Table.ScrollContainer minWidth={900}>
          <Table highlightOnHover verticalSpacing="sm" className="prediction-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="prediction-row-action-header" aria-label="Predict action" />
                <SortableHeader
                  active={sortKey === "ticker"}
                  direction={sortDirection}
                  tooltip="The stock ticker this prediction is for."
                  onClick={() => setSort("ticker")}
                >
                  Ticker
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "model"}
                  direction={sortDirection}
                  tooltip="The model that made the prediction."
                  onClick={() => setSort("model")}
                >
                  Model
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "horizon"}
                  direction={sortDirection}
                  tooltip="How far ahead the model is predicting."
                  className="prediction-table-center"
                  onClick={() => setSort("horizon")}
                >
                  Horizon
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "reference"}
                  direction={sortDirection}
                  tooltip="The stock close used as the prediction's starting reference."
                  className="prediction-table-center"
                  onClick={() => setSort("reference")}
                >
                  Reference
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "close"}
                  direction={sortDirection}
                  tooltip="The predicted price, expected return, and 80% confidence interval. Sorting uses expected return."
                  className="prediction-table-center"
                  onClick={() => setSort("close")}
                >
                  Predicted
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "target"}
                  direction={sortDirection}
                  tooltip="The date when the prediction can be evaluated and scored."
                  className="prediction-table-center"
                  onClick={() => setSort("target")}
                >
                  Matures On
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "prediction"}
                  direction={sortDirection}
                  tooltip="The date the model made this prediction."
                  className="prediction-table-center"
                  onClick={() => setSort("prediction")}
                >
                  Predicted On
                </SortableHeader>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {displayedRows.map((row) => (
                <Table.Tr key={row.prediction_id}>
                  <Table.Td className="prediction-row-action-cell">
                    <UserPredictionButton
                      ticker={row.ticker}
                      latestPredictions={rows}
                      compact
                      onSaved={onPredictionSaved}
                    />
                  </Table.Td>
                  <Table.Td>
                    <EntityHoverCard kind="ticker" ticker={row.ticker} logoUrl={tickerLogos[row.ticker]}>
                      <Group gap="xs" wrap="nowrap" className="ticker-cell-link">
                        <TickerLogoMark ticker={row.ticker} logoUrl={tickerLogos[row.ticker]} />
                        <Text component={Link} to={`/tickers/${row.ticker}`} fw={800} className="plain-link">
                          {row.ticker}
                        </Text>
                      </Group>
                    </EntityHoverCard>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <EntityHoverCard kind="model" slug={row.model_slug} name={row.model_name}>
                        <Text component={Link} to={`/models/${row.model_slug}`} className="plain-link">
                          {row.model_name}
                        </Text>
                      </EntityHoverCard>
                    </Group>
                  </Table.Td>
                  <Table.Td className="prediction-table-center">
                    <Badge variant="light" color="green">
                      {formatHorizon(row.prediction_horizon)}
                    </Badge>
                  </Table.Td>
                  <Table.Td className="prediction-table-center">{formatCurrency(row.reference_close)}</Table.Td>
                  <Table.Td className="prediction-table-center">
                    <PredictionValue row={row} align="center" />
                  </Table.Td>
                  <Table.Td className="prediction-table-center">{formatDate(row.target_date)}</Table.Td>
                  <Table.Td className="prediction-table-center">{formatDate(row.prediction_date)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </div>
      <div className="mobile-cards">
        <PredictionCardList
          rows={displayedRows}
          latestPredictions={rows}
          onPredictionSaved={onPredictionSaved}
          tickerLogos={tickerLogos}
        />
      </div>
      {!isPaged && visibleRows.length > predictionPreviewSize ? (
        <Group justify="center">
          <motion.div
            className="spotlight-control-wrap prediction-action-control load-more-control"
            whileHover={hoverMotion}
            whileTap={pressMotion}
            transition={pressTransition}
          >
            <Button
              className="spotlight-control-button prediction-action-button"
              variant="subtle"
              color="green"
              onClick={() => {
                setIsPaged(true);
                setCurrentPage(0);
              }}
            >
              Load more predictions
            </Button>
          </motion.div>
          <Text size="sm" className="secondary-text">
            Showing {displayedRows.length} of {visibleRows.length}
          </Text>
        </Group>
      ) : isPaged && visibleRows.length > predictionPageSize ? (
        <Group justify="center" gap="sm" className="prediction-pagination">
          <motion.div
            className="spotlight-control-wrap prediction-action-control pagination-control"
            whileHover={currentPage === 0 ? undefined : hoverMotion}
            whileTap={currentPage === 0 ? undefined : pressMotion}
            transition={pressTransition}
          >
            <Button
              className="spotlight-control-button prediction-action-button"
              variant="subtle"
              color="green"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}
            >
              Previous
            </Button>
          </motion.div>
          <Text size="sm" className="secondary-text">
            Page {currentPage + 1} of {pageCount}
          </Text>
          <motion.div
            className="spotlight-control-wrap prediction-action-control pagination-control"
            whileHover={currentPage >= pageCount - 1 ? undefined : hoverMotion}
            whileTap={currentPage >= pageCount - 1 ? undefined : pressMotion}
            transition={pressTransition}
          >
            <Button
              className="spotlight-control-button prediction-action-button"
              variant="subtle"
              color="green"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setCurrentPage((page) => Math.min(pageCount - 1, page + 1))}
            >
              Next
            </Button>
          </motion.div>
          <Text size="sm" className="secondary-text prediction-pagination-count">
            Showing {shownStart}-{shownEnd} of {visibleRows.length}
          </Text>
        </Group>
      ) : isPaged && visibleRows.length > predictionPreviewSize ? (
        <Text ta="center" size="sm" mt="md" className="secondary-text">
          Showing all {visibleRows.length} matching predictions
        </Text>
      ) : null}
    </>
  );

  const panelContent = (
    <div className={embedded ? "latest-predictions-embedded-content" : undefined}>
      <Group className="collapsible-panel-topline" justify="space-between" align="flex-end" gap="md">
        <Text className="secondary-text">Targeted closes across tickers, models, and prediction horizons.</Text>
        {filters}
      </Group>
      {predictions}
    </div>
  );

  if (embedded) {
    return panelContent;
  }

  if (collapsible) {
    return (
      <MagicHoverSurface className="section-magic-surface">
        <section className="section-panel prediction-collapsible-panel">
          <button
            type="button"
            className="collapsible-trigger"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((current) => !current)}
          >
            <span className="section-title">Latest Predictions</span>
            <FiChevronDown className="collapsible-chevron" />
          </button>
          <motion.div
            initial={false}
            animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 180, damping: 25, mass: 0.85 }}
            className="collapsible-motion"
            style={{ pointerEvents: isOpen ? "auto" : "none" }}
          >
            <div className="collapsible-inner">
              {panelContent}
            </div>
          </motion.div>
        </section>
      </MagicHoverSurface>
    );
  }

  return (
    <SectionPanel
      title="Latest Predictions"
      subtitle="Targeted closes across tickers, models, and prediction horizons."
      action={filters}
    >
      {predictions}
    </SectionPanel>
  );
}

function horizonWeight(horizon: string) {
  if (horizon === "all") {
    return 0;
  }
  if (horizon === "1w") {
    return 1;
  }
  if (horizon === "1m") {
    return 2;
  }
  if (horizon === "3m") {
    return 3;
  }
  if (horizon === "1y") {
    return 4;
  }
  return 99;
}

type HeaderProps = {
  children: string;
  active: boolean;
  direction: "asc" | "desc";
  tooltip: string;
  className?: string;
  onClick: () => void;
};

function SortableHeader({
  children,
  active,
  direction,
  tooltip,
  className,
  onClick,
}: HeaderProps) {
  const Icon = direction === "asc" ? FiArrowUp : FiArrowDown;

  return (
    <Table.Th className={className}>
      <Tooltip label={tooltip} openDelay={250}>
        <UnstyledButton className="sort-button" onClick={onClick}>
          <span>{children}</span>
          {active ? <Icon /> : null}
        </UnstyledButton>
      </Tooltip>
    </Table.Th>
  );
}
