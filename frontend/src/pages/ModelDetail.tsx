import { Badge, Card, Group, Skeleton, Table, Text, Title } from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType, ReactNode } from "react";
import { useMemo } from "react";
import { FiArrowUpRight } from "react-icons/fi";
import { useParams } from "react-router-dom";
import type { MetricHorizon } from "../api/dashboardData";
import WarrenBuffbotPanel from "../components/buffbot/WarrenBuffbotPanel";
import RulesLink from "../components/help/RulesLink";
import AnimatedSection from "../components/layout/AnimatedSection";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";
import DashboardFooter from "../components/layout/DashboardFooter";
import MagicHoverSurface from "../components/layout/MagicHoverSurface";
import SectionPanel from "../components/layout/SectionPanel";
import PredictionTable from "../components/predictions/PredictionTable";
import { useDashboardData } from "../hooks/useDashboardData";
import { formatHorizon, formatMetric, formatPercent } from "../utils/format";
import { getModelInfo, modelTypeColor } from "../utils/models";

const horizonOrder: Record<MetricHorizon, number> = {
  all: 0,
  "1w": 1,
  "1m": 2,
  "3m": 3,
  "1y": 4,
};

const MotionPresence = AnimatePresence as unknown as ComponentType<{
  children: ReactNode;
  initial?: boolean;
  mode?: "sync" | "popLayout" | "wait";
}>;

const heroContainerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
  exit: { opacity: 0, y: -12, transition: { duration: 0.16, ease: "easeIn" } },
};

const heroItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 200, damping: 22, mass: 0.7 },
  },
};

export default function ModelDetail() {
  const { modelSlug = "" } = useParams();
  const dashboard = useDashboardData();
  const tickerLogos = useMemo(
    () =>
      Object.fromEntries(
        dashboard.tickerAssets.map((asset) => [asset.ticker, asset.logo_data_url]),
      ),
    [dashboard.tickerAssets],
  );
  const latestForModel = dashboard.latestPredictions.filter((row) => row.model_slug === modelSlug);
  const horizonMetricsForModel = dashboard.leaderboard
    .filter((row) => row.model_slug === modelSlug && row.window === "all")
    .sort((a, b) => horizonOrder[a.prediction_horizon] - horizonOrder[b.prediction_horizon]);
  const modelName = latestForModel[0]?.model_name ?? horizonMetricsForModel[0]?.model_name;
  const info = getModelInfo(modelSlug, modelName);
  const latestBuffbot = modelSlug === "warren-buffbot" ? latestForModel[0] : undefined;

  return (
    <main className="dashboard-shell detail-page">
      <AnimatedSection delay={0}>
        <BackToDashboardButton />
      </AnimatedSection>

      {modelSlug === "warren-buffbot" ? (
        <AnimatedSection delay={0.08}>
          <WarrenBuffbotPanel latestPrediction={latestBuffbot} />
        </AnimatedSection>
      ) : null}

      <AnimatedSection delay={modelSlug === "warren-buffbot" ? 0.16 : 0.08}>
        <MagicHoverSurface className="section-magic-surface">
          <Card className="model-hero">
            <MotionPresence mode="wait">
              {dashboard.loading ? (
                <motion.div
                  key="model-hero-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <Skeleton height={26} width="34%" radius="sm" mb="md" />
                  <Skeleton height={40} width="58%" radius="sm" mb="md" />
                  <Skeleton height={88} radius="sm" />
                </motion.div>
              ) : (
                <motion.div
                  key={`model-hero-${info.slug}`}
                  className="model-hero-content"
                  variants={heroContainerVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <motion.div variants={heroItemVariants}>
                    <Group gap="xs" mb="sm">
                      <Badge color={modelTypeColor(info.type)}>{info.type}</Badge>
                    </Group>
                  </motion.div>
                  <motion.div variants={heroItemVariants}>
                    <Title order={1} c="green">
                      {info.name}
                    </Title>
                  </motion.div>
                  <motion.div variants={heroItemVariants}>
                    <Text mt="sm" className="model-description">
                      {info.description}
                    </Text>
                  </motion.div>
                  {info.learnMore ? (
                    <motion.div variants={heroItemVariants}>
                      <div className="spotlight-control-wrap model-learn-more-wrap">
                        <a
                          className="spotlight-control-button model-learn-more"
                          href={info.learnMore}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="model-learn-more-label">Learn more</span>
                          <FiArrowUpRight className="model-learn-more-icon" aria-hidden />
                        </a>
                      </div>
                    </motion.div>
                  ) : null}
                </motion.div>
              )}
            </MotionPresence>
          </Card>
        </MagicHoverSurface>
      </AnimatedSection>

      <AnimatedSection delay={modelSlug === "warren-buffbot" ? 0.24 : 0.16}>
        <SectionPanel
          title="Model Limits"
          subtitle="What this model can and cannot know."
          action={<RulesLink section="models" compact>Model rules</RulesLink>}
        >
          <Text size="sm" c="dimmed">
            {modelLimitCopy(info.type)}
          </Text>
        </SectionPanel>
      </AnimatedSection>

      <AnimatedSection delay={modelSlug === "warren-buffbot" ? 0.32 : 0.24}>
        <SectionPanel title="Metrics By Horizon" subtitle="Same model across prediction horizons.">
          {dashboard.loading ? (
            <Skeleton height={180} radius="sm" />
          ) : horizonMetricsForModel.length === 0 ? (
            <Text c="dimmed" size="sm">
              This model does not have scored leaderboard rows yet.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={520}>
              <Table verticalSpacing="sm" className="model-metrics-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Horizon</Table.Th>
                    <Table.Th className="model-metrics-center">Rank</Table.Th>
                    <Table.Th className="model-metrics-center">MAE</Table.Th>
                    <Table.Th className="model-metrics-center">Directional</Table.Th>
                    <Table.Th className="model-metrics-center">Winkler</Table.Th>
                    <Table.Th className="model-metrics-center score-column">Scored</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {horizonMetricsForModel.map((row) => (
                    <Table.Tr key={row.prediction_horizon}>
                      <Table.Td>{formatHorizon(row.prediction_horizon)}</Table.Td>
                      <Table.Td className="model-metrics-center">{row.rank ? `#${row.rank}` : "Pending"}</Table.Td>
                      <Table.Td className="model-metrics-center">{formatMetric(row.mae)}</Table.Td>
                      <Table.Td className="model-metrics-center">{formatPercent(row.directional_accuracy)}</Table.Td>
                      <Table.Td className="model-metrics-center">{formatMetric(row.winkler_score)}</Table.Td>
                      <Table.Td className="model-metrics-center score-column">{row.prediction_count.toLocaleString()}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </SectionPanel>
      </AnimatedSection>

      <AnimatedSection delay={modelSlug === "warren-buffbot" ? 0.4 : 0.32}>
        <PredictionTable
          rows={latestForModel}
          loading={dashboard.loading}
          onPredictionSaved={() => void dashboard.refetch()}
          tickerLogos={tickerLogos}
        />
      </AnimatedSection>

      <AnimatedSection delay={modelSlug === "warren-buffbot" ? 0.48 : 0.4}>
        <DashboardFooter metadata={dashboard.metadata} loading={dashboard.loading} />
      </AnimatedSection>
    </main>
  );
}

function modelLimitCopy(type: string) {
  if (type === "Toy (LLM)") {
    return "This is a toy LLM personality model. It reasons over the structured context the pipeline provides, but it should not be treated as an investment adviser and does not reliably know breaking news or current events.";
  }
  if (type === "Benchmark") {
    return "The benchmark is intentionally simple: it assumes price stays near the reference close. It is useful as a comparison point, not as a claim about where the market should go.";
  }
  return "This model uses structured market data available to the pipeline. It does not read breaking news or current events unless those signals are already represented in its inputs. Ranges and predictions are not guarantees.";
}
