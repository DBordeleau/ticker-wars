import { Alert, Badge, Button, Group, Loader, Table, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle } from "react-icons/fi";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { MetricHorizon, MetricWindow } from "../api/dashboardData";
import { fetchPublicModelScoredPredictions, type PublicModelScoredPrediction } from "../api/modelScores";
import EntityHoverCard from "../components/cards/EntityHoverCard";
import AnimatedSection from "../components/layout/AnimatedSection";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";
import DashboardFooter from "../components/layout/DashboardFooter";
import SectionPanel from "../components/layout/SectionPanel";
import ModelScoreBreakdownDrawer from "../components/predictions/ModelScoreBreakdownDrawer";
import TickerLogoMark from "../components/tickers/TickerLogoMark";
import { useDashboardData } from "../hooks/useDashboardData";
import {
  formatCurrency,
  formatDate,
  formatHorizon,
  formatMetric,
  formatPercent,
  formatPredictionRange,
  formatSignedPercent,
} from "../utils/format";
import { getModelInfo } from "../utils/models";

const pageSize = 50;

export default function ModelScoredPredictions() {
  const { modelSlug = "" } = useParams();
  const [searchParams] = useSearchParams();
  const dashboard = useDashboardData();
  const window = parseWindow(searchParams.get("window"));
  const horizon = parseHorizon(searchParams.get("horizon"));
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<PublicModelScoredPrediction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPrediction, setSelectedPrediction] = useState<PublicModelScoredPrediction | null>(null);
  const tickerLogos = useMemo(
    () => Object.fromEntries(dashboard.tickerAssets.map((asset) => [asset.ticker, asset.logo_data_url])),
    [dashboard.tickerAssets],
  );
  const modelName =
    rows[0]?.model_name ??
    dashboard.leaderboard.find((row) => row.model_slug === modelSlug)?.model_name ??
    dashboard.latestPredictions.find((row) => row.model_slug === modelSlug)?.model_name;
  const modelInfo = getModelInfo(modelSlug, modelName);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const shownStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const shownEnd = Math.min(totalCount, page * pageSize + rows.length);

  useEffect(() => {
    setPage(0);
  }, [horizon, modelSlug, window]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchPublicModelScoredPredictions({
      modelSlug,
      evaluationWindow: window,
      horizon,
      limit: pageSize,
      offset: page * pageSize,
    })
      .then((result) => {
        if (!active) {
          return;
        }
        setRows(result.rows);
        setTotalCount(result.totalCount);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load scored predictions.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [horizon, modelSlug, page, window]);

  return (
    <main className="dashboard-shell detail-page">
      <AnimatedSection delay={0}>
        <BackToDashboardButton />
      </AnimatedSection>

      <AnimatedSection delay={0.08}>
        <header className="predictions-header">
          <Title order={1} className="predictions-header-title">
            {modelInfo.name} Scored Predictions
          </Title>
          <Text className="predictions-header-lead">
            Leaderboard set for {formatHorizon(horizon)} predictions.
          </Text>
          <Group gap="xs">
            <Badge variant="light" color="green">{formatWindow(window)}</Badge>
            <Badge variant="light" color="green">{formatHorizon(horizon)}</Badge>
            <Badge variant="light" color="gray">{totalCount.toLocaleString()} scored</Badge>
          </Group>
        </header>
      </AnimatedSection>

      <AnimatedSection delay={0.16}>
        <SectionPanel
          className="my-predictions-panel"
          title="Scored Predictions"
          subtitle="The exact model score rows included in this leaderboard count."
        >
          {loading ? (
            <Group justify="center" py="xl">
              <Loader color="green" />
            </Group>
          ) : error ? (
            <Alert color="red" icon={<FiAlertTriangle />}>{error}</Alert>
          ) : rows.length === 0 ? (
            <Text c="dimmed" size="sm">No scored predictions were found for this leaderboard set.</Text>
          ) : (
            <>
              <div className="desktop-table">
                <Table.ScrollContainer minWidth={960}>
                  <Table highlightOnHover verticalSpacing="sm" className="prediction-table user-predictions-table">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Ticker</Table.Th>
                        <Table.Th className="prediction-table-center">Horizon</Table.Th>
                        <Table.Th className="prediction-table-center">Predicted</Table.Th>
                        <Table.Th className="prediction-table-center">Actual</Table.Th>
                        <Table.Th className="prediction-table-center">Error</Table.Th>
                        <Table.Th className="prediction-table-center">Direction</Table.Th>
                        <Table.Th className="prediction-table-center">Winkler</Table.Th>
                        <Table.Th className="prediction-table-center">Matured On</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {rows.map((row) => (
                        <Table.Tr
                          key={row.prediction_id}
                          className="settled-prediction-row"
                          tabIndex={0}
                          aria-label={`Open score breakdown for ${row.ticker}`}
                          onClick={() => setSelectedPrediction(row)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedPrediction(row);
                            }
                          }}
                        >
                          <Table.Td>
                            <TickerCell ticker={row.ticker} logoUrl={tickerLogos[row.ticker]} />
                          </Table.Td>
                          <Table.Td className="prediction-table-center">
                            <Badge variant="light" color="green">{formatHorizon(row.prediction_horizon)}</Badge>
                          </Table.Td>
                          <Table.Td className="prediction-table-center">
                            <PriceReturn close={row.predicted_close} ret={row.predicted_return} />
                            {row.predicted_close_lower != null && row.predicted_close_upper != null ? (
                              <Text size="xs" c="dimmed">
                                {formatPredictionRange(row.predicted_close_lower, row.predicted_close_upper, row.interval_level)}
                              </Text>
                            ) : null}
                          </Table.Td>
                          <Table.Td className="prediction-table-center">
                            <PriceReturn close={row.actual_close} ret={row.actual_return} />
                          </Table.Td>
                          <Table.Td className="prediction-table-center">{formatPercent(row.absolute_pct_error, 2)}</Table.Td>
                          <Table.Td className="prediction-table-center">
                            <Badge variant="light" color={row.direction_correct === 1 ? "green" : "red"}>
                              {row.direction_correct === 1 ? "Hit" : "Miss"}
                            </Badge>
                          </Table.Td>
                          <Table.Td className="prediction-table-center">{formatMetric(row.winkler_score)}</Table.Td>
                          <Table.Td className="prediction-table-center">{formatDate(row.target_date)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </div>
              <div className="mobile-cards">
                <div className="prediction-card-list">
                  {rows.map((row) => (
                    <article
                      className="prediction-card settled-prediction-card"
                      key={`card-${row.prediction_id}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open score breakdown for ${row.ticker}`}
                      onClick={() => setSelectedPrediction(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedPrediction(row);
                        }
                      }}
                    >
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <TickerCell ticker={row.ticker} logoUrl={tickerLogos[row.ticker]} card />
                        <Badge variant="light" color="green">{formatHorizon(row.prediction_horizon)}</Badge>
                      </Group>
                      <ScoreCardRow label="Predicted" value={<PriceReturn close={row.predicted_close} ret={row.predicted_return} inline />} />
                      <ScoreCardRow label="Actual" value={<PriceReturn close={row.actual_close} ret={row.actual_return} inline />} />
                      <ScoreCardRow label="Error" value={formatPercent(row.absolute_pct_error, 2)} />
                      <ScoreCardRow label="Direction" value={row.direction_correct === 1 ? "Hit" : "Miss"} />
                      <ScoreCardRow label="Winkler" value={formatMetric(row.winkler_score)} />
                      <ScoreCardRow label="Matured on" value={formatDate(row.target_date)} />
                    </article>
                  ))}
                </div>
              </div>
              {totalCount > pageSize ? (
                <Group justify="center" gap="sm" className="prediction-pagination">
                  <Button variant="subtle" color="green" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
                    Previous
                  </Button>
                  <Text size="sm" className="secondary-text">
                    Showing {shownStart}-{shownEnd} of {totalCount.toLocaleString()}
                  </Text>
                  <Button variant="subtle" color="green" disabled={page >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>
                    Next
                  </Button>
                </Group>
              ) : null}
            </>
          )}
        </SectionPanel>
      </AnimatedSection>

      <ModelScoreBreakdownDrawer
        prediction={selectedPrediction}
        opened={Boolean(selectedPrediction)}
        onClose={() => setSelectedPrediction(null)}
      />

      <AnimatedSection delay={0.24}>
        <DashboardFooter metadata={dashboard.metadata} loading={dashboard.loading} />
      </AnimatedSection>
    </main>
  );
}

function TickerCell({
  ticker,
  logoUrl,
  card = false,
}: {
  ticker: string;
  logoUrl: string | null | undefined;
  card?: boolean;
}) {
  const link = (
    <Group
      gap="xs"
      wrap="nowrap"
      className={card ? "ticker-card-heading" : "ticker-cell-link"}
      onClick={(event) => event.stopPropagation()}
    >
      <TickerLogoMark ticker={ticker} logoUrl={logoUrl} />
      <Text component={Link} to={`/tickers/${ticker}`} fw={800} className="plain-link">
        {ticker}
      </Text>
    </Group>
  );

  if (card) {
    return link;
  }

  return (
    <EntityHoverCard kind="ticker" ticker={ticker} logoUrl={logoUrl}>
      {link}
    </EntityHoverCard>
  );
}

function PriceReturn({
  close,
  ret,
  inline = false,
}: {
  close: number | null | undefined;
  ret: number | null | undefined;
  inline?: boolean;
}) {
  if (close == null) {
    return <Text size="sm" c="dimmed">-</Text>;
  }
  const returnClass = (ret ?? 0) >= 0 ? "prediction-return-up" : "prediction-return-down";
  if (inline) {
    return (
      <span className="prediction-inline-value">
        <Text component="span" fw={850}>{formatCurrency(close)}</Text>{" "}
        {ret != null ? <Text component="span" size="xs" className={returnClass}>{formatSignedPercent(ret)}</Text> : null}
      </span>
    );
  }
  return (
    <>
      <Text fw={850}>{formatCurrency(close)}</Text>
      {ret != null ? <Text size="xs" className={returnClass}>{formatSignedPercent(ret)}</Text> : null}
    </>
  );
}

function ScoreCardRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Group mt={6} justify="space-between">
      <Text size="xs" c="dimmed">{label}</Text>
      <Text component="div" size="sm" fw={800}>{value}</Text>
    </Group>
  );
}

function parseWindow(value: string | null): MetricWindow {
  return value === "7d" || value === "30d" || value === "90d" || value === "all" ? value : "all";
}

function parseHorizon(value: string | null): MetricHorizon {
  return value === "1w" || value === "1m" || value === "3m" || value === "1y" || value === "all" ? value : "all";
}

function formatWindow(value: MetricWindow) {
  if (value === "all") {
    return "All-time";
  }
  return value.toUpperCase();
}
