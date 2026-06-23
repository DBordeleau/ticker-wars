import { Badge, Card, Group, Skeleton, Table, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useParams } from "react-router-dom";
import type { MetricHorizon, TickerHistoryRow } from "../api/dashboardData";
import TickerChart from "../components/charts/TickerChart";
import AnimatedSection from "../components/layout/AnimatedSection";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";
import DashboardFooter from "../components/layout/DashboardFooter";
import SectionPanel from "../components/layout/SectionPanel";
import PredictionHorizonSelector from "../components/predictions/PredictionHorizonSelector";
import PredictionTable from "../components/predictions/PredictionTable";
import UserPredictionButton from "../components/predictions/UserPredictionButton";
import { useDashboardData } from "../hooks/useDashboardData";
import { useTickerHistory } from "../hooks/useTickerHistory";
import {
  formatCurrency,
  formatDate,
  formatHorizon,
  formatMetric,
  formatPredictionRange,
} from "../utils/format";

export default function TickerDetail() {
  const { ticker = "" } = useParams();
  const [agreementHorizon, setAgreementHorizon] = useState<MetricHorizon>("all");
  const dashboard = useDashboardData();
  const tickerHistory = useTickerHistory(ticker);
  const predictions = dashboard.latestPredictions.filter((row) => row.ticker === ticker);
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
        />
      </AnimatedSection>
      <AnimatedSection delay={0.32}>
        <PredictionTable rows={predictions} loading={dashboard.loading} />
      </AnimatedSection>
      <AnimatedSection delay={0.4}>
        <TickerHistoryTable
          rows={tickerHistory.data}
          loading={tickerHistory.loading}
          error={tickerHistory.error}
        />
      </AnimatedSection>
      <AnimatedSection delay={0.48}>
        <DashboardFooter metadata={dashboard.metadata} loading={dashboard.loading} />
      </AnimatedSection>
    </main>
  );
}

type HistoryProps = {
  rows: TickerHistoryRow[];
  loading: boolean;
  error: string | null;
};

function TickerHistoryTable({ rows, loading, error }: HistoryProps) {
  const sortedRows = [...rows].sort((a, b) => b.target_date.localeCompare(a.target_date));

  return (
    <SectionPanel
      title="Prediction History"
      subtitle="Matured predictions and scored outcomes for this ticker."
    >
      {loading ? (
        <Skeleton height={220} radius="sm" />
      ) : error ? (
        <Text c="red.4" size="sm">
          {error}
        </Text>
      ) : sortedRows.length === 0 ? (
        <Text c="dimmed" size="sm">
          Scored prediction history will appear after target dates mature.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={880}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Target</Table.Th>
                <Table.Th>Prediction Date</Table.Th>
                <Table.Th>Horizon</Table.Th>
                <Table.Th>Model</Table.Th>
                <Table.Th>Predicted</Table.Th>
                <Table.Th>Actual</Table.Th>
                <Table.Th>80% Range</Table.Th>
                <Table.Th>Winkler</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortedRows.map((row) => (
                <Table.Tr key={row.prediction_id ?? `${row.target_date}-${row.model_slug}`}>
                  <Table.Td>{formatDate(row.target_date)}</Table.Td>
                  <Table.Td>{formatDate(row.prediction_date)}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="green">
                      {formatHorizon(row.prediction_horizon)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{row.model_name}</Table.Td>
                  <Table.Td>{formatCurrency(row.predicted_close)}</Table.Td>
                  <Table.Td>{formatCurrency(row.actual_close)}</Table.Td>
                  <Table.Td>
                    {formatPredictionRange(
                      row.predicted_close_lower,
                      row.predicted_close_upper,
                      row.interval_level,
                    )}
                  </Table.Td>
                  <Table.Td>{formatMetric(row.winkler_score)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </SectionPanel>
  );
}
