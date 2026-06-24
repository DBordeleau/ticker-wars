import { Card, Group, Skeleton, Text, Title } from "@mantine/core";
import { useState } from "react";
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
import { useTickerHistory } from "../hooks/useTickerHistory";
import {
  formatCurrency,
  formatDate,
} from "../utils/format";

export default function TickerDetail() {
  const { ticker = "" } = useParams();
  const [agreementHorizon, setAgreementHorizon] = useState<MetricHorizon>("all");
  const [latestPredictionsView, setLatestPredictionsView] = useState<DashboardView>("models");
  const [latestUserHorizon, setLatestUserHorizon] = useState<MetricHorizon>("all");
  const dashboard = useDashboardData();
  const tickerHistory = useTickerHistory(ticker);
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
                <Text className="eyebrow">Ticker Detail</Text>
                <Group justify="space-between" align="center" gap="md">
                  <Title order={1}>{ticker}</Title>
                  <UserPredictionButton ticker={ticker} latestPredictions={dashboard.latestPredictions} />
                </Group>
                <Group mt="md" gap="lg">
                  <div>
                    <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
                      Reference close
                    </Text>
                    <Text fw={800}>{formatCurrency(firstPrediction?.reference_close)}</Text>
                  </div>
                  <div>
                    <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
                      Target date
                    </Text>
                    <Text fw={800}>{formatDate(firstPrediction?.target_date)}</Text>
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
