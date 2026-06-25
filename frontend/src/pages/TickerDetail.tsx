import { Badge, Card, Group, Skeleton, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { MetricHorizon } from "../api/dashboardData";
import type { DashboardView } from "../components/dashboard/DashboardViewToggle";
import TickerChart from "../components/charts/TickerChart";
import AnimatedSection from "../components/layout/AnimatedSection";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";
import DashboardFooter from "../components/layout/DashboardFooter";
import MagicHoverSurface from "../components/layout/MagicHoverSurface";
import TickerLeaderboard from "../components/leaderboard/TickerLeaderboard";
import SectionPanel from "../components/layout/SectionPanel";
import PredictionHorizonSelector from "../components/predictions/PredictionHorizonSelector";
import PredictionTable from "../components/predictions/PredictionTable";
import UserPredictionTable from "../components/predictions/UserPredictionTable";
import UserPredictionButton from "../components/predictions/UserPredictionButton";
import { useDashboardData } from "../hooks/useDashboardData";
import { useTickerCloseSnapshot } from "../hooks/useTickerCloseSnapshot";
import { useTickerHistory } from "../hooks/useTickerHistory";
import { useTickerProfile } from "../hooks/useTickerProfile";
import {
  formatCurrency,
  formatDate,
  formatSignedPercent,
} from "../utils/format";

export default function TickerDetail() {
  const { ticker = "" } = useParams();
  const [agreementHorizon, setAgreementHorizon] = useState<MetricHorizon>("all");
  const [latestPredictionsView, setLatestPredictionsView] = useState<DashboardView>("models");
  const [latestUserHorizon, setLatestUserHorizon] = useState<MetricHorizon>("all");
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const dashboard = useDashboardData();
  const tickerHistory = useTickerHistory(ticker);
  const tickerClose = useTickerCloseSnapshot(ticker);
  const tickerProfile = useTickerProfile(ticker);
  const tickerLogos = useMemo(
    () =>
      Object.fromEntries(
        dashboard.tickerAssets.map((asset) => [asset.ticker, asset.logo_data_url]),
      ),
    [dashboard.tickerAssets],
  );
  const predictions = dashboard.latestPredictions.filter((row) => row.ticker === ticker);
  const userPredictions = dashboard.latestUserPredictions.filter((row) => row.ticker === ticker);
  const directionalPredictions = predictions
    .filter((row) => row.model_slug !== "baseline")
    .filter((row) =>
      agreementHorizon === "all" ? true : row.prediction_horizon === agreementHorizon,
    );
  const positive = directionalPredictions.filter((row) => row.predicted_return > 0).length;
  const negative = directionalPredictions.filter((row) => row.predicted_return < 0).length;
  const flat = directionalPredictions.length - positive - negative;
  const firstPrediction = predictions.find((row) => row.model_slug !== "baseline") ?? predictions[0];
  const companyName = tickerProfile.data?.company_name ?? ticker;
  const industryLabel = tickerProfile.data?.industry ?? tickerProfile.data?.sector;
  const sectorLabel = tickerProfile.data?.sector;
  const showTickerBadge = companyName.toUpperCase() !== ticker.toUpperCase();
  const logoUrl = tickerProfile.data?.logo_data_url;
  const visibleLogoUrl = logoUrl && failedLogoUrl !== logoUrl ? logoUrl : null;
  const summary = tickerProfile.data?.business_summary;
  const canExpandSummary = Boolean(summary && summary.length > 180);
  const closeValue = tickerClose.data?.close ?? firstPrediction?.reference_close;
  const closeDate = tickerClose.data?.date ?? firstPrediction?.prediction_date;
  const closeChange = tickerClose.data?.change;
  const closeChangePercent = tickerClose.data?.change_percent;
  const closeMoveClass =
    closeChange == null ? "ticker-close-move-neutral" :
    closeChange > 0 ? "ticker-close-move-up" :
    closeChange < 0 ? "ticker-close-move-down" :
    "ticker-close-move-neutral";

  useEffect(() => {
    setFailedLogoUrl(null);
  }, [logoUrl]);

  useEffect(() => {
    setIsSummaryExpanded(false);
  }, [summary]);

  return (
    <main className="dashboard-shell detail-page">
      <AnimatedSection delay={0}>
        <BackToDashboardButton />
      </AnimatedSection>

      <AnimatedSection delay={0.08}>
        <MagicHoverSurface className="section-magic-surface">
          <Card className="model-hero">
            {dashboard.loading ? (
              <Skeleton height={140} radius="sm" />
            ) : (
              <>
                <Group justify="space-between" align="flex-start" gap="md">
                  <Stack gap="sm" className="ticker-hero-main">
                    <Group gap="md" align="flex-start" className="ticker-hero-identity">
                      {visibleLogoUrl ? (
                        <div className="ticker-logo-frame">
                          <img
                            src={visibleLogoUrl}
                            alt={`${ticker} logo (identification only, no affiliation)`}
                            className="ticker-logo-image"
                            loading="lazy"
                            onError={() => setFailedLogoUrl(visibleLogoUrl)}
                          />
                        </div>
                      ) : null}
                      <Stack gap="xs" className="ticker-hero-copy">
                        <Group gap="sm" align="center" className="ticker-identity">
                          <Title order={1}>{companyName}</Title>
                          {showTickerBadge ? (
                            <Badge variant="outline" color="gray" className="ticker-symbol-badge">
                              {ticker}
                            </Badge>
                          ) : null}
                          {industryLabel ? (
                            <Badge variant="light" color="green" className="ticker-industry-badge">
                              {industryLabel}
                            </Badge>
                          ) : null}
                        </Group>
                        {sectorLabel && sectorLabel !== industryLabel ? (
                          <Text size="sm" className="secondary-text ticker-sector-text">
                            {sectorLabel}
                          </Text>
                        ) : null}
                      </Stack>
                    </Group>
                    {summary ? (
                      <div className="ticker-company-summary-block">
                        <Text
                          size="sm"
                          className="ticker-company-summary"
                          lineClamp={isSummaryExpanded ? undefined : 2}
                        >
                          {summary}
                        </Text>
                        {canExpandSummary ? (
                          <UnstyledButton
                            className="ticker-summary-toggle"
                            onClick={() => setIsSummaryExpanded((current) => !current)}
                          >
                            {isSummaryExpanded ? "Show less" : "Read full description"}
                          </UnstyledButton>
                        ) : null}
                      </div>
                    ) : tickerProfile.loading ? (
                      <Skeleton height={36} maw={760} radius="sm" />
                    ) : null}
                  </Stack>
                  <UserPredictionButton
                    ticker={ticker}
                    latestPredictions={dashboard.latestPredictions}
                    onSaved={() => void dashboard.refetch()}
                  />
                </Group>
                <Group mt="md" gap="lg">
                  <div>
                    <Text c="dimmed" size="xs" fw={700}>
                      {formatDate(closeDate)} closing price
                    </Text>
                    <Group gap="xs" align="baseline">
                      <Text fw={850}>{formatCurrency(closeValue)}</Text>
                      {closeChange != null && closeChangePercent != null ? (
                        <Text size="sm" fw={800} className={closeMoveClass}>
                          {formatSignedCurrency(closeChange)} ({formatSignedPercent(closeChangePercent)})
                        </Text>
                      ) : tickerClose.loading ? (
                        <Skeleton width={92} height={16} radius="sm" />
                      ) : null}
                    </Group>
                  </div>
                </Group>
              </>
            )}
          </Card>
        </MagicHoverSurface>
      </AnimatedSection>

      <AnimatedSection delay={0.16}>
        <SectionPanel
          title="Directional Agreement"
          subtitle="How latest non-benchmark model predictions split for this ticker."
          action={
            <PredictionHorizonSelector
              value={agreementHorizon}
              onChange={setAgreementHorizon}
              label="Directional agreement horizon"
            />
          }
        >
          {directionalPredictions.length === 0 ? (
            <Text c="dimmed" size="sm">
              No non-benchmark predictions match this horizon yet.
            </Text>
          ) : (
            <Group gap="xl">
              <Text>
                <strong>{positive}</strong> up
              </Text>
              <Text>
                <strong>{negative}</strong> down
              </Text>
              <Text>
                <strong>{flat}</strong> flat
              </Text>
            </Group>
          )}
        </SectionPanel>
      </AnimatedSection>

      <AnimatedSection delay={0.24}>
        <TickerChart
          history={tickerHistory.data}
          predictions={dashboard.latestPredictions}
          selectedTicker={ticker}
          onTickerChange={() => undefined}
          loading={dashboard.loading || tickerHistory.loading}
          showTickerSelect={false}
        />
      </AnimatedSection>
      <AnimatedSection delay={0.32}>
        {latestPredictionsView === "models" ? (
          <PredictionTable
            rows={predictions}
            loading={dashboard.loading}
            view={latestPredictionsView}
            onViewChange={setLatestPredictionsView}
            showTickerFilter={false}
            onPredictionSaved={() => void dashboard.refetch()}
            tickerLogos={tickerLogos}
          />
        ) : (
          <UserPredictionTable
            rows={userPredictions}
            loading={dashboard.loading}
            view={latestPredictionsView}
            onViewChange={setLatestPredictionsView}
            horizon={latestUserHorizon}
            onHorizonChange={setLatestUserHorizon}
            title="Latest User Predictions"
            subtitle={`Public user predictions for ${ticker}. Private profiles are excluded.`}
            tickerLogos={tickerLogos}
          />
        )}
      </AnimatedSection>
      <AnimatedSection delay={0.4}>
        <TickerLeaderboard
          ticker={ticker}
          history={tickerHistory.data}
          userRows={dashboard.userTickerLeaderboard}
          loading={dashboard.loading || tickerHistory.loading}
        />
      </AnimatedSection>
      <AnimatedSection delay={0.48}>
        <DashboardFooter metadata={dashboard.metadata} loading={dashboard.loading} />
      </AnimatedSection>
    </main>
  );
}

function formatSignedCurrency(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}
