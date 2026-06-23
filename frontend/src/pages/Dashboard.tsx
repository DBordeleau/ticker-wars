import { useState } from "react";
import type { MetricHorizon, MetricWindow } from "../api/dashboardData";
import TickerChart from "../components/charts/TickerChart";
import AnimatedSection from "../components/layout/AnimatedSection";
import DashboardFooter from "../components/layout/DashboardFooter";
import DashboardHeader from "../components/layout/DashboardHeader";
import DashboardShell from "../components/layout/DashboardShell";
import LeaderboardChart from "../components/leaderboard/LeaderboardChart";
import LeaderboardTable from "../components/leaderboard/LeaderboardTable";
import MetricStrip from "../components/metrics/MetricStrip";
import PredictionTable from "../components/predictions/PredictionTable";
import { useDashboardData } from "../hooks/useDashboardData";

export default function Dashboard() {
  const window: MetricWindow = "all";
  const [horizon, setHorizon] = useState<MetricHorizon>("all");
  const dashboard = useDashboardData();

  return (
    <DashboardShell
      error={dashboard.error}
      hasSupabaseConfig={dashboard.hasSupabaseConfig}
      onRetry={dashboard.refetch}
    >
      <AnimatedSection delay={0}>
        <DashboardHeader />
      </AnimatedSection>
      <AnimatedSection delay={0.08}>
        <MetricStrip
          leaderboard={dashboard.leaderboard}
          window={window}
          horizon={horizon}
          loading={dashboard.loading}
        />
      </AnimatedSection>
      <AnimatedSection delay={0.16}>
        <LeaderboardTable
          rows={dashboard.leaderboard}
          window={window}
          horizon={horizon}
          onHorizonChange={setHorizon}
          loading={dashboard.loading}
        />
      </AnimatedSection>
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <AnimatedSection delay={0.24}>
            <TickerChart
              history={dashboard.tickerHistory}
              predictions={dashboard.latestPredictions}
              selectedTicker={dashboard.selectedTicker}
              onTickerChange={dashboard.setSelectedTicker}
              loading={dashboard.historyLoading || dashboard.loading}
            />
          </AnimatedSection>
        </div>
        <div className="dashboard-secondary">
          <AnimatedSection delay={0.3}>
            <LeaderboardChart
              rows={dashboard.leaderboard}
              window={window}
              horizon={horizon}
              loading={dashboard.loading}
            />
          </AnimatedSection>
        </div>
      </div>
      <AnimatedSection delay={0.36}>
        <PredictionTable rows={dashboard.latestPredictions} loading={dashboard.loading} collapsible />
      </AnimatedSection>
      <AnimatedSection delay={0.42}>
        <DashboardFooter metadata={dashboard.metadata} loading={dashboard.loading} />
      </AnimatedSection>
    </DashboardShell>
  );
}
