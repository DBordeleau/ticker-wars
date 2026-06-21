import { Badge, Button, Group, Skeleton, Table, Text, UnstyledButton } from "@mantine/core";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { FiArrowDown, FiArrowUp, FiChevronDown } from "react-icons/fi";
import { Link } from "react-router-dom";
import type { LatestPrediction } from "../../api/dashboardData";
import { formatCurrency, formatDate, formatSignedPercent } from "../../utils/format";
import SectionPanel from "../layout/SectionPanel";
import PredictionCardList from "./PredictionCardList";
import PredictionFilters from "./PredictionFilters";

type SortKey = "ticker" | "model" | "return" | "close" | "target";

type Props = {
  rows: LatestPrediction[];
  loading: boolean;
  collapsible?: boolean;
};

const predictionPreviewSize = 5;
const predictionPageSize = 25;

export default function PredictionTable({ rows, loading, collapsible = false }: Props) {
  const [tickerQuery, setTickerQuery] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("target");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [isPaged, setIsPaged] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isOpen, setIsOpen] = useState(true);

  const modelOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.model_name))).sort(),
    [rows],
  );

  const visibleRows = useMemo(() => {
    const query = tickerQuery.trim().toUpperCase();

    return rows
      .filter((row) => (query ? row.ticker.includes(query) : true))
      .filter((row) => (model ? row.model_name === model : true))
      .sort((a, b) => {
        const direction = sortDirection === "asc" ? 1 : -1;
        if (sortKey === "return") {
          return (a.predicted_return - b.predicted_return) * direction;
        }
        if (sortKey === "close") {
          return (a.predicted_close - b.predicted_close) * direction;
        }
        if (sortKey === "model") {
          return a.model_name.localeCompare(b.model_name) * direction;
        }
        if (sortKey === "target") {
          return a.target_date.localeCompare(b.target_date) * direction;
        }
        return a.ticker.localeCompare(b.ticker) * direction;
      });
  }, [model, rows, sortDirection, sortKey, tickerQuery]);

  useEffect(() => {
    setIsPaged(false);
    setCurrentPage(0);
  }, [model, sortDirection, sortKey, tickerQuery]);

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

  const setSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const filters = (
    <PredictionFilters
      tickerQuery={tickerQuery}
      model={model}
      models={modelOptions}
      onTickerQueryChange={setTickerQuery}
      onModelChange={setModel}
    />
  );

  const predictions = loading ? (
    <Skeleton height={360} radius="sm" />
  ) : rows.length === 0 ? (
    <Text c="dimmed" size="sm">
      Latest predictions will appear after the pipeline publishes dashboard rows.
    </Text>
  ) : (
    <>
      <div className="desktop-table">
        <Table.ScrollContainer minWidth={700}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <SortableHeader active={sortKey === "ticker"} direction={sortDirection} onClick={() => setSort("ticker")}>
                  Ticker
                </SortableHeader>
                <SortableHeader active={sortKey === "model"} direction={sortDirection} onClick={() => setSort("model")}>
                  Model
                </SortableHeader>
                <SortableHeader active={sortKey === "return"} direction={sortDirection} onClick={() => setSort("return")}>
                  Return
                </SortableHeader>
                <Table.Th>Reference</Table.Th>
                <SortableHeader active={sortKey === "close"} direction={sortDirection} onClick={() => setSort("close")}>
                  Predicted
                </SortableHeader>
                <SortableHeader active={sortKey === "target"} direction={sortDirection} onClick={() => setSort("target")}>
                  Target
                </SortableHeader>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {displayedRows.map((row) => (
                <Table.Tr key={`${row.target_date}-${row.ticker}-${row.model_slug}`}>
                  <Table.Td>
                    <Text component={Link} to={`/tickers/${row.ticker}`} fw={800} className="plain-link">
                      {row.ticker}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Text component={Link} to={`/models/${row.model_slug}`} className="plain-link">
                        {row.model_name}
                      </Text>
                      {row.model_slug === "baseline" ? <Badge color="gray">Baseline</Badge> : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text c={row.predicted_return >= 0 ? "green.5" : "red.5"} fw={700}>
                      {formatSignedPercent(row.predicted_return)}
                    </Text>
                  </Table.Td>
                  <Table.Td>{formatCurrency(row.reference_close)}</Table.Td>
                  <Table.Td>{formatCurrency(row.predicted_close)}</Table.Td>
                  <Table.Td>{formatDate(row.target_date)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </div>
      <div className="mobile-cards">
        <PredictionCardList rows={displayedRows} />
      </div>
      {!isPaged && visibleRows.length > predictionPreviewSize ? (
        <Group justify="center">
          <Button
            variant="light"
            color="green"
            onClick={() => {
              setIsPaged(true);
              setCurrentPage(0);
            }}
          >
            Load more predictions
          </Button>
          <Text size="sm" className="secondary-text">
            Showing {displayedRows.length} of {visibleRows.length}
          </Text>
        </Group>
      ) : isPaged && visibleRows.length > predictionPageSize ? (
        <Group justify="center" gap="sm" className="prediction-pagination">
          <Button
            variant="light"
            color="green"
            disabled={currentPage === 0}
            onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}
          >
            Previous
          </Button>
          <Text size="sm" className="secondary-text">
            Page {currentPage + 1} of {pageCount}
          </Text>
          <Button
            variant="light"
            color="green"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setCurrentPage((page) => Math.min(pageCount - 1, page + 1))}
          >
            Next
          </Button>
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

  if (collapsible) {
    return (
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
            <Group className="collapsible-panel-topline" justify="space-between" align="flex-end" gap="md">
              <Text className="secondary-text">Targeted next-day closes across tickers and models.</Text>
              {filters}
            </Group>
            {predictions}
          </div>
        </motion.div>
      </section>
    );
  }

  return (
    <SectionPanel
      title="Latest Predictions"
      subtitle="Targeted next-day closes across tickers and models."
      action={filters}
    >
      {predictions}
    </SectionPanel>
  );
}

type HeaderProps = {
  children: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
};

function SortableHeader({ children, active, direction, onClick }: HeaderProps) {
  const Icon = direction === "asc" ? FiArrowUp : FiArrowDown;

  return (
    <Table.Th>
      <UnstyledButton className="sort-button" onClick={onClick}>
        <span>{children}</span>
        {active ? <Icon /> : null}
      </UnstyledButton>
    </Table.Th>
  );
}
