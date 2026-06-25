import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType, ReactNode } from "react";
import { FiChevronDown } from "react-icons/fi";
import type { MetricHorizon, MetricWindow } from "../api/dashboardData";
import type { DashboardView } from "../components/dashboard/DashboardViewToggle";
import TickerChart from "../components/charts/TickerChart";
import AnimatedSection from "../components/layout/AnimatedSection";
import DashboardFooter from "../components/layout/DashboardFooter";
import DashboardHeader from "../components/layout/DashboardHeader";
import DashboardShell from "../components/layout/DashboardShell";
import MagicHoverSurface from "../components/layout/MagicHoverSurface";
import LeaderboardChart from "../components/leaderboard/LeaderboardChart";
import LeaderboardTable from "../components/leaderboard/LeaderboardTable";
import MetricStrip from "../components/metrics/MetricStrip";
import PredictionTable from "../components/predictions/PredictionTable";
import UserPredictionTable from "../components/predictions/UserPredictionTable";
import { useDashboardData } from "../hooks/useDashboardData";

const MotionPresence = AnimatePresence as unknown as ComponentType<{
  children: ReactNode;
  initial?: boolean;
  mode?: "sync" | "popLayout" | "wait";
}>;

export default function Dashboard() {
  const window: MetricWindow = "all";
  const [horizon, setHorizon] = useState<MetricHorizon>("all");
  const [leaderboardView, setLeaderboardView] = useState<DashboardView>("models");
  const [latestPredictionsView, setLatestPredictionsView] = useState<DashboardView>("models");
  const [latestUserHorizon, setLatestUserHorizon] = useState<MetricHorizon>("all");
  const [latestPredictionsOpen, setLatestPredictionsOpen] = useState(true);
  const dashboard = useDashboardData();
  const tickerLogos = useMemo(
    () =>
      Object.fromEntries(
        dashboard.tickerAssets.map((asset) => [asset.ticker, asset.logo_data_url]),
      ),
    [dashboard.tickerAssets],
  );

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
          userLeaderboard={dashboard.userLeaderboard}
          view={leaderboardView}
          window={window}
          horizon={horizon}
          loading={dashboard.loading}
        />
      </AnimatedSection>
      <AnimatedSection delay={0.16}>
        <LeaderboardTable
          rows={dashboard.leaderboard}
          userRows={dashboard.userLeaderboard}
          view={leaderboardView}
          onViewChange={setLeaderboardView}
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
              userRows={dashboard.userLeaderboard}
              view={leaderboardView}
              window={window}
              horizon={horizon}
              loading={dashboard.loading}
            />
          </AnimatedSection>
        </div>
      </div>
      <AnimatedSection delay={0.36}>
        <MagicHoverSurface className="section-magic-surface">
          <section className="section-panel prediction-collapsible-panel">
            <button
              type="button"
              className="collapsible-trigger"
              aria-expanded={latestPredictionsOpen}
              onClick={() => setLatestPredictionsOpen((current) => !current)}
            >
              <span className="section-title">Latest Predictions</span>
              <FiChevronDown className="collapsible-chevron" />
            </button>
            <motion.div
              initial={false}
              animate={{ height: latestPredictionsOpen ? "auto" : 0, opacity: latestPredictionsOpen ? 1 : 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 25, mass: 0.85 }}
              className="collapsible-motion"
              style={{ pointerEvents: latestPredictionsOpen ? "auto" : "none" }}
            >
              <div className="collapsible-inner latest-predictions-panel-body">
                <MotionPresence mode="wait" initial={false}>
                  <motion.div
                    key={latestPredictionsView}
                    layout
                    className="latest-predictions-view-motion"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    {latestPredictionsView === "models" ? (
                      <PredictionTable
                        rows={dashboard.latestPredictions}
                        loading={dashboard.loading}
                        view={latestPredictionsView}
                        onViewChange={setLatestPredictionsView}
                        onPredictionSaved={() => void dashboard.refetch()}
                        tickerLogos={tickerLogos}
                        embedded
                      />
                    ) : (
                      <UserPredictionTable
                        rows={dashboard.latestUserPredictions}
                        loading={dashboard.loading}
                        view={latestPredictionsView}
                        onViewChange={setLatestPredictionsView}
                        horizon={latestUserHorizon}
                        onHorizonChange={setLatestUserHorizon}
                        tickerLogos={tickerLogos}
                        embedded
                      />
                    )}
                  </motion.div>
                </MotionPresence>
              </div>
            </motion.div>
          </section>
        </MagicHoverSurface>
      </AnimatedSection>
      <AnimatedSection delay={0.42}>
        <DashboardFooter metadata={dashboard.metadata} loading={dashboard.loading} />
      </AnimatedSection>
    </DashboardShell>
  );
}
