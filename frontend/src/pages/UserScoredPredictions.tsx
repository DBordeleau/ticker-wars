import { Alert, Badge, Button, Group, Loader, Table, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle } from "react-icons/fi";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  fetchPublicUserScoredPredictions,
  type PublicProfilePrediction,
  type PublicScoredPrediction,
} from "../api/publicProfiles";
import type { MetricHorizon, MetricWindow } from "../api/dashboardData";
import AnimatedSection from "../components/layout/AnimatedSection";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";
import DashboardFooter from "../components/layout/DashboardFooter";
import SectionPanel from "../components/layout/SectionPanel";
import EntityHoverCard from "../components/cards/EntityHoverCard";
import PublicScoreBreakdownDrawer from "../components/predictions/PublicScoreBreakdownDrawer";
import ScoreVerdictBadge from "../components/predictions/ScoreVerdictBadge";
import TickerLogoMark from "../components/tickers/TickerLogoMark";
import { useDashboardData } from "../hooks/useDashboardData";
import { formatCurrency, formatDate, formatHorizon, formatPercent, formatSignedPercent } from "../utils/format";

const pageSize = 50;

export default function UserScoredPredictions() {
  const { username = "" } = useParams();
  const [searchParams] = useSearchParams();
  const dashboard = useDashboardData();
  const window = parseWindow(searchParams.get("window"));
  const horizon = parseHorizon(searchParams.get("horizon"));
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<PublicScoredPrediction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPrediction, setSelectedPrediction] = useState<PublicProfilePrediction | null>(null);
  const tickerLogos = useMemo(
    () => Object.fromEntries(dashboard.tickerAssets.map((asset) => [asset.ticker, asset.logo_data_url])),
    [dashboard.tickerAssets],
  );

  useEffect(() => {
    setPage(0);
  }, [horizon, username, window]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchPublicUserScoredPredictions({
      username,
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
  }, [horizon, page, username, window]);

  const displayUsername = rows[0]?.display_username ?? username;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const shownStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const shownEnd = Math.min(totalCount, page * pageSize + rows.length);

  return (
    <main className="dashboard-shell detail-page">
      <AnimatedSection delay={0}>
        <BackToDashboardButton />
      </AnimatedSection>

      <AnimatedSection delay={0.08}>
        <header className="predictions-header">
          <Title order={1} className="predictions-header-title">
            {username} Scored Predictions
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
          subtitle="The exact public score rows included in this leaderboard count."
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
                <Table.ScrollContainer minWidth={860}>
                  <Table highlightOnHover verticalSpacing="sm" className="prediction-table user-predictions-table">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Ticker</Table.Th>
                        <Table.Th className="prediction-table-center">Horizon</Table.Th>
                        <Table.Th className="prediction-table-center">Predicted</Table.Th>
                        <Table.Th className="prediction-table-center">Actual</Table.Th>
                        <Table.Th className="prediction-table-center">Error</Table.Th>
                        <Table.Th className="prediction-table-center">Direction</Table.Th>
                        <Table.Th className="prediction-table-center">Verdict</Table.Th>
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
                          onClick={() => setSelectedPrediction(toPublicProfilePrediction(row))}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedPrediction(toPublicProfilePrediction(row));
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
                          <Table.Td className="prediction-table-center">
                            <ScoreVerdictBadge
                              score={{
                                absolute_pct_error: row.absolute_pct_error ?? 0,
                                prediction_horizon: row.prediction_horizon,
                                direction_correct: row.direction_correct ?? undefined,
                                score_verdict: row.score_verdict,
                              }}
                            />
                          </Table.Td>
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
                      onClick={() => setSelectedPrediction(toPublicProfilePrediction(row))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedPrediction(toPublicProfilePrediction(row));
                        }
                      }}
                    >
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <TickerCell ticker={row.ticker} logoUrl={tickerLogos[row.ticker]} card />
                        <Badge variant="light" color="green">{formatHorizon(row.prediction_horizon)}</Badge>
                      </Group>
                      <ScoreCardRow
                        label="Verdict"
                        value={
                          <ScoreVerdictBadge
                            score={{
                              absolute_pct_error: row.absolute_pct_error ?? 0,
                              prediction_horizon: row.prediction_horizon,
                              direction_correct: row.direction_correct ?? undefined,
                              score_verdict: row.score_verdict,
                            }}
                          />
                        }
                      />
                      <ScoreCardRow label="Predicted" value={<PriceReturn close={row.predicted_close} ret={row.predicted_return} inline />} />
                      <ScoreCardRow label="Actual" value={<PriceReturn close={row.actual_close} ret={row.actual_return} inline />} />
                      <ScoreCardRow label="Error" value={formatPercent(row.absolute_pct_error, 2)} />
                      <ScoreCardRow
                        label="Direction"
                        value={row.direction_correct === 1 ? "Hit" : "Miss"}
                      />
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

      <PublicScoreBreakdownDrawer
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

function toPublicProfilePrediction(row: PublicScoredPrediction): PublicProfilePrediction {
  return {
    prediction_id: row.prediction_id,
    user_id: row.user_id,
    section: "recent",
    display_order: 0,
    ticker: row.ticker,
    prediction_date: row.prediction_date,
    target_date: row.target_date,
    prediction_horizon: row.prediction_horizon,
    reference_close: row.reference_close,
    predicted_return: row.predicted_return,
    predicted_close: row.predicted_close,
    status: row.status,
    public_details_hidden: false,
    actual_close: row.actual_close,
    actual_return: row.actual_return,
    absolute_error: row.absolute_error,
    absolute_pct_error: row.absolute_pct_error,
    direction_correct: row.direction_correct,
    score_verdict: row.score_verdict,
    score_verdict_rank: row.score_verdict_rank,
    score_verdict_color: row.score_verdict_color,
    xp_awarded: row.xp_awarded,
    scored_at: row.scored_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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
