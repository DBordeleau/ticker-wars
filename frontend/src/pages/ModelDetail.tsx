import { Badge, Card, Group, Skeleton, Table, Text, Title } from "@mantine/core";
import { useParams } from "react-router-dom";
import WarrenBuffbotPanel from "../components/buffbot/WarrenBuffbotPanel";
import AnimatedSection from "../components/layout/AnimatedSection";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";
import DashboardFooter from "../components/layout/DashboardFooter";
import SectionPanel from "../components/layout/SectionPanel";
import PredictionTable from "../components/predictions/PredictionTable";
import { useDashboardData } from "../hooks/useDashboardData";
import { formatMetric, formatPercent } from "../utils/format";
import { getModelInfo, modelTypeColor } from "../utils/models";

const windowLabels = {
  "7d": "1W",
  "30d": "1M",
  "90d": "3M",
  all: "ALL",
};

const windowOrder = {
  "7d": 0,
  "30d": 1,
  "90d": 2,
  all: 3,
};

export default function ModelDetail() {
  const { modelSlug = "" } = useParams();
  const dashboard = useDashboardData();
  const latestForModel = dashboard.latestPredictions.filter((row) => row.model_slug === modelSlug);
  const leaderboardForModel = dashboard.leaderboard
    .filter((row) => row.model_slug === modelSlug)
    .sort((a, b) => windowOrder[a.window] - windowOrder[b.window]);
  const modelName = latestForModel[0]?.model_name ?? leaderboardForModel[0]?.model_name;
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
      </AnimatedSection>

      <AnimatedSection delay={modelSlug === "warren-buffbot" ? 0.24 : 0.16}>
        <SectionPanel title="Metrics By Window" subtitle="Same model across scoring windows.">
          {dashboard.loading ? (
            <Skeleton height={180} radius="sm" />
          ) : leaderboardForModel.length === 0 ? (
            <Text c="dimmed" size="sm">
              This model does not have scored leaderboard rows yet.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={420}>
              <Table verticalSpacing="sm" className="model-metrics-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Window</Table.Th>
                    <Table.Th>Rank</Table.Th>
                    <Table.Th>MAE</Table.Th>
                    <Table.Th>RMSE</Table.Th>
                    <Table.Th>MAPE</Table.Th>
                    <Table.Th>Directional</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {leaderboardForModel.map((row) => (
                    <Table.Tr key={row.window}>
                      <Table.Td>{windowLabels[row.window]}</Table.Td>
                      <Table.Td>{row.rank ? `#${row.rank}` : "Pending"}</Table.Td>
                      <Table.Td>{formatMetric(row.mae)}</Table.Td>
                      <Table.Td>{formatMetric(row.rmse)}</Table.Td>
                      <Table.Td>{formatPercent(row.mape)}</Table.Td>
                      <Table.Td>{formatPercent(row.directional_accuracy)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </SectionPanel>
      </AnimatedSection>

      <AnimatedSection delay={modelSlug === "warren-buffbot" ? 0.32 : 0.24}>
        <PredictionTable rows={latestForModel} loading={dashboard.loading} />
      </AnimatedSection>

      <AnimatedSection delay={modelSlug === "warren-buffbot" ? 0.4 : 0.32}>
        <DashboardFooter metadata={dashboard.metadata} loading={dashboard.loading} />
      </AnimatedSection>
    </main>
  );
}
