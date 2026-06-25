import { Badge, Card, Group, Skeleton, Table, Text, Title } from "@mantine/core";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import type { MetricHorizon } from "../api/dashboardData";
import WarrenBuffbotPanel from "../components/buffbot/WarrenBuffbotPanel";
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
            {dashboard.loading ? (
              <Skeleton height={160} radius="sm" />
            ) : (
              <>
                <Group gap="xs" mb="sm">
                  <Badge color={modelTypeColor(info.type)}>{info.type}</Badge>
                </Group>
                <Title order={1} c="green">
                  {info.name}
                </Title>
                <Text mt="sm" className="model-description">
                  {info.description}
                </Text>
              </>
            )}
          </Card>
        </MagicHoverSurface>
      </AnimatedSection>

      <AnimatedSection delay={modelSlug === "warren-buffbot" ? 0.24 : 0.16}>
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

      <AnimatedSection delay={modelSlug === "warren-buffbot" ? 0.32 : 0.24}>
        <PredictionTable
          rows={latestForModel}
          loading={dashboard.loading}
          onPredictionSaved={() => void dashboard.refetch()}
          tickerLogos={tickerLogos}
        />
      </AnimatedSection>

      <AnimatedSection delay={modelSlug === "warren-buffbot" ? 0.4 : 0.32}>
        <DashboardFooter metadata={dashboard.metadata} loading={dashboard.loading} />
      </AnimatedSection>
    </main>
  );
}
