import { Alert, Badge, Button, Card, Group, Skeleton, Table, Text, Title } from "@mantine/core";
import { FiAlertTriangle, FiLogIn } from "react-icons/fi";
import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import AnimatedSection from "../components/layout/AnimatedSection";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";
import MagicHoverSurface from "../components/layout/MagicHoverSurface";
import UserPredictionButton from "../components/predictions/UserPredictionButton";
import SignInModal from "../components/users/SignInModal";
import { useDashboardData } from "../hooks/useDashboardData";
import { useUserPredictions } from "../hooks/useUserPredictions";
import {
  formatCurrency,
  formatDate,
  formatHorizon,
  formatMetric,
  formatPercent,
} from "../utils/format";
import { isPredictionEditable, type UserPrediction } from "../api/userPredictions";

export default function MyPredictions() {
  const { user } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const predictions = useUserPredictions();
  const dashboard = useDashboardData();

  return (
    <main className="dashboard-shell detail-page">
      <AnimatedSection delay={0}>
        <BackToDashboardButton />
      </AnimatedSection>
      <AnimatedSection delay={0.08}>
        <MagicHoverSurface className="section-magic-surface">
          <Card className="model-hero">
            <Text className="eyebrow">Human predictions</Text>
            <Title order={1}>My Predictions</Title>
            <Text mt="sm" className="model-description">
              Track your active and scored predictions across every horizon.
            </Text>
            {!user ? (
              <Group mt="md">
                <Button color="green" leftSection={<FiLogIn />} onClick={() => setSignInOpen(true)}>
                  Sign in
                </Button>
              </Group>
            ) : null}
          </Card>
        </MagicHoverSurface>
      </AnimatedSection>
      {user ? (
        <AnimatedSection delay={0.16}>
          <UserPredictionsTable
            rows={predictions.data}
            loading={predictions.loading || dashboard.loading}
            error={predictions.error}
            latestPredictions={dashboard.latestPredictions}
            onChanged={predictions.refetch}
          />
        </AnimatedSection>
      ) : null}
      <SignInModal opened={signInOpen} onClose={() => setSignInOpen(false)} />
    </main>
  );
}

type TableProps = {
  rows: UserPrediction[];
  loading: boolean;
  error: string | null;
  latestPredictions: ReturnType<typeof useDashboardData>["latestPredictions"];
  onChanged: () => Promise<void>;
};

function UserPredictionsTable({
  rows,
  loading,
  error,
  latestPredictions,
  onChanged,
}: TableProps) {
  const sortedRows = [...rows].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "pending" ? -1 : 1;
    }
    return b.prediction_date.localeCompare(a.prediction_date);
  });

  if (loading) {
    return (
      <Card className="section-panel">
        <Skeleton height={260} radius="sm" />
      </Card>
    );
  }

  if (error) {
    return (
      <Alert color="red" icon={<FiAlertTriangle />}>
        {error}
      </Alert>
    );
  }

  if (sortedRows.length === 0) {
    return (
      <Card className="section-panel">
        <Text c="dimmed" size="sm">
          Your predictions will appear here after you make one from a ticker row.
        </Text>
      </Card>
    );
  }

  return (
    <Card className="section-panel">
      <Table.ScrollContainer minWidth={980}>
        <Table highlightOnHover verticalSpacing="sm" className="user-predictions-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ticker</Table.Th>
              <Table.Th>Horizon</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Predicted</Table.Th>
              <Table.Th>Reference</Table.Th>
              <Table.Th>Matures On</Table.Th>
              <Table.Th>Predicted On</Table.Th>
              <Table.Th>Actual</Table.Th>
              <Table.Th>Error</Table.Th>
              <Table.Th>Directional</Table.Th>
              <Table.Th>Edit</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sortedRows.map((row) => {
              const editable = isPredictionEditable(row);
              return (
                <Table.Tr key={row.prediction_id}>
                  <Table.Td>
                    <Text fw={800}>{row.ticker}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="green">
                      {formatHorizon(row.prediction_horizon)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={row.status === "pending" ? "yellow" : "green"} variant="light">
                      {row.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{formatCurrency(row.predicted_close)}</Table.Td>
                  <Table.Td>{formatCurrency(row.reference_close)}</Table.Td>
                  <Table.Td>{formatDate(row.target_date)}</Table.Td>
                  <Table.Td>{formatDate(row.prediction_date)}</Table.Td>
                  <Table.Td>{formatCurrency(row.score?.actual_close)}</Table.Td>
                  <Table.Td>{formatMetric(row.score?.absolute_error, 2)}</Table.Td>
                  <Table.Td>{formatPercent(row.score?.direction_correct)}</Table.Td>
                  <Table.Td>
                    {editable ? (
                      <UserPredictionButton
                        ticker={row.ticker}
                        latestPredictions={latestPredictions}
                        existingPrediction={row}
                        compact
                        onSaved={() => void onChanged()}
                      />
                    ) : (
                      <Text size="sm" c="dimmed">
                        Locked
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}
