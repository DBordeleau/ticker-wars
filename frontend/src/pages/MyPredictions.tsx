import { Alert, Badge, Button, Card, Group, Skeleton, Table, Text, Title } from "@mantine/core";
import { FiAlertTriangle, FiLogIn } from "react-icons/fi";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import AnimatedSection from "../components/layout/AnimatedSection";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";
import MagicHoverSurface from "../components/layout/MagicHoverSurface";
import SectionPanel from "../components/layout/SectionPanel";
import EntityHoverCard from "../components/cards/EntityHoverCard";
import TickerLogoMark from "../components/tickers/TickerLogoMark";
import UserPredictionButton from "../components/predictions/UserPredictionButton";
import SignInModal from "../components/users/SignInModal";
import { useDashboardData } from "../hooks/useDashboardData";
import { useUserPredictions } from "../hooks/useUserPredictions";
import {
  formatCurrency,
  formatDate,
  formatHorizon,
  formatSignedPercent,
} from "../utils/format";
import {
  isPredictionEditable,
  type UserPrediction,
  type UserPredictionScore,
} from "../api/userPredictions";

export default function MyPredictions() {
  const { user } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const predictions = useUserPredictions();
  const dashboard = useDashboardData();

  const tickerLogos = useMemo(
    () =>
      Object.fromEntries(dashboard.tickerAssets.map((asset) => [asset.ticker, asset.logo_data_url])),
    [dashboard.tickerAssets],
  );

  const rows = predictions.data;
  const activeRows = useMemo(
    () =>
      rows
        .filter((row) => row.status === "pending")
        .sort((a, b) => a.target_date.localeCompare(b.target_date)),
    [rows],
  );
  const settledRows = useMemo(
    () =>
      rows
        .filter((row) => row.status !== "pending")
        .sort(
          (a, b) =>
            (b.score?.scored_at ?? "").localeCompare(a.score?.scored_at ?? "") ||
            b.target_date.localeCompare(a.target_date),
        ),
    [rows],
  );

  const scoredRows = settledRows.filter((row) => row.score);
  const hitRate =
    scoredRows.length > 0
      ? scoredRows.filter((row) => row.score?.direction_correct === 1).length / scoredRows.length
      : null;

  const loading = predictions.loading || dashboard.loading;
  const showSummary = Boolean(user) && !loading && !predictions.error && rows.length > 0;

  return (
    <main className="dashboard-shell detail-page">
      <AnimatedSection delay={0}>
        <BackToDashboardButton />
      </AnimatedSection>
      <AnimatedSection delay={0.08}>
        <header className="predictions-header">
          <Text className="predictions-header-eyebrow">Prediction History</Text>
          <Title order={1} className="predictions-header-title">
            Your Predictions
          </Title>
          <Text className="predictions-header-lead">
            Track your active and settled calls across every horizon.
          </Text>
          {showSummary ? (
            <div className="predictions-summary">
              <SummaryStat value={String(activeRows.length)} label="Active" />
              <SummaryStat value={String(scoredRows.length)} label="Settled" />
              {hitRate != null ? (
                <SummaryStat value={`${Math.round(hitRate * 100)}%`} label="Directional" />
              ) : null}
            </div>
          ) : null}
          {!user ? (
            <Group mt="xs">
              <Button color="green" leftSection={<FiLogIn />} onClick={() => setSignInOpen(true)}>
                Sign in
              </Button>
            </Group>
          ) : null}
        </header>
      </AnimatedSection>
      {user ? (
        <PredictionsBody
          loading={loading}
          error={predictions.error}
          active={activeRows}
          settled={settledRows}
          latestPredictions={dashboard.latestPredictions}
          tickerLogos={tickerLogos}
          onChanged={predictions.refetch}
        />
      ) : null}
      <SignInModal opened={signInOpen} onClose={() => setSignInOpen(false)} />
    </main>
  );
}

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="predictions-summary-stat">
      <span className="predictions-summary-value">{value}</span>
      <span className="predictions-summary-label">{label}</span>
    </div>
  );
}

type BodyProps = {
  loading: boolean;
  error: string | null;
  active: UserPrediction[];
  settled: UserPrediction[];
  latestPredictions: ReturnType<typeof useDashboardData>["latestPredictions"];
  tickerLogos: Record<string, string | null>;
  onChanged: () => Promise<void>;
};

function PredictionsBody({
  loading,
  error,
  active,
  settled,
  latestPredictions,
  tickerLogos,
  onChanged,
}: BodyProps) {
  if (loading) {
    return (
      <AnimatedSection delay={0.16}>
        <MagicHoverSurface className="section-magic-surface">
          <Card className="section-panel">
            <Skeleton height={280} radius="sm" />
          </Card>
        </MagicHoverSurface>
      </AnimatedSection>
    );
  }

  if (error) {
    return (
      <AnimatedSection delay={0.16}>
        <Alert color="red" icon={<FiAlertTriangle />}>
          {error}
        </Alert>
      </AnimatedSection>
    );
  }

  if (active.length === 0 && settled.length === 0) {
    return (
      <AnimatedSection delay={0.16}>
        <MagicHoverSurface className="section-magic-surface">
          <Card className="section-panel">
            <Text c="dimmed" size="sm">
              Your predictions will appear here after you make one from a ticker row.
            </Text>
          </Card>
        </MagicHoverSurface>
      </AnimatedSection>
    );
  }

  return (
    <>
      {active.length > 0 ? (
        <AnimatedSection delay={0.16}>
          <SectionPanel
            className="my-predictions-panel"
            title="Active Predictions"
            subtitle="Open calls awaiting maturity. Editable until 7 days before they settle."
            action={<CountBadge count={active.length} label="open" />}
          >
            <ActivePredictionsTable
              rows={active}
              latestPredictions={latestPredictions}
              tickerLogos={tickerLogos}
              onChanged={onChanged}
            />
          </SectionPanel>
        </AnimatedSection>
      ) : null}
      {settled.length > 0 ? (
        <AnimatedSection delay={active.length > 0 ? 0.24 : 0.16}>
          <SectionPanel
            className="my-predictions-panel"
            title="Settled Predictions"
            subtitle="Matured calls scored against the realized close."
            action={<CountBadge count={settled.length} label="settled" />}
          >
            <SettledPredictionsTable rows={settled} tickerLogos={tickerLogos} />
          </SectionPanel>
        </AnimatedSection>
      ) : null}
    </>
  );
}

function CountBadge({ count, label }: { count: number; label: string }) {
  return (
    <Badge variant="light" color="green" className="prediction-count-badge">
      {count} {label}
    </Badge>
  );
}

type ActiveTableProps = {
  rows: UserPrediction[];
  latestPredictions: BodyProps["latestPredictions"];
  tickerLogos: Record<string, string | null>;
  onChanged: () => Promise<void>;
};

function ActivePredictionsTable({ rows, latestPredictions, tickerLogos, onChanged }: ActiveTableProps) {
  return (
    <>
      <div className="desktop-table">
        <Table.ScrollContainer minWidth={820}>
          <Table
            highlightOnHover
            verticalSpacing="sm"
            className="prediction-table user-predictions-table"
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="prediction-row-action-header" aria-label="Edit action" />
                <Table.Th>Ticker</Table.Th>
                <Table.Th className="prediction-table-center">Horizon</Table.Th>
                <Table.Th className="prediction-table-center">Reference</Table.Th>
                <Table.Th className="prediction-table-center">Predicted</Table.Th>
                <Table.Th className="prediction-table-center">Matures On</Table.Th>
                <Table.Th className="prediction-table-center">Predicted On</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.prediction_id}>
                  <Table.Td className="prediction-row-action-cell">
                    {isPredictionEditable(row) ? (
                      <UserPredictionButton
                        ticker={row.ticker}
                        latestPredictions={latestPredictions}
                        existingPrediction={row}
                        compact
                        onSaved={() => void onChanged()}
                      />
                    ) : (
                      <Badge variant="light" color="gray" className="prediction-locked-badge">
                        Locked
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <TickerCell ticker={row.ticker} logoUrl={tickerLogos[row.ticker]} />
                  </Table.Td>
                  <Table.Td className="prediction-table-center">
                    <Badge variant="light" color="green">
                      {formatHorizon(row.prediction_horizon)}
                    </Badge>
                  </Table.Td>
                  <Table.Td className="prediction-table-center">
                    {formatCurrency(row.reference_close)}
                  </Table.Td>
                  <Table.Td className="prediction-table-center">
                    <PriceReturn close={row.predicted_close} ret={row.predicted_return} />
                  </Table.Td>
                  <Table.Td className="prediction-table-center">{formatDate(row.target_date)}</Table.Td>
                  <Table.Td className="prediction-table-center">
                    {formatDate(row.prediction_date)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </div>
      <div className="mobile-cards">
        <div className="prediction-card-list">
          {rows.map((row) => (
            <article className="prediction-card" key={row.prediction_id}>
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <TickerCell ticker={row.ticker} logoUrl={tickerLogos[row.ticker]} card />
                <Badge variant="light" color="green">
                  {formatHorizon(row.prediction_horizon)}
                </Badge>
              </Group>
              <Group mt="sm" justify="space-between">
                <Text size="xs" c="dimmed">
                  Reference
                </Text>
                <Text fw={800}>{formatCurrency(row.reference_close)}</Text>
              </Group>
              <Group mt={6} justify="space-between">
                <Text size="xs" c="dimmed">
                  Predicted
                </Text>
                <PriceReturn close={row.predicted_close} ret={row.predicted_return} inline />
              </Group>
              <Group mt={6} justify="space-between">
                <Text size="xs" c="dimmed">
                  Matures on
                </Text>
                <Text size="sm">{formatDate(row.target_date)}</Text>
              </Group>
              <div className="prediction-card-action">
                {isPredictionEditable(row) ? (
                  <UserPredictionButton
                    ticker={row.ticker}
                    latestPredictions={latestPredictions}
                    existingPrediction={row}
                    compact
                    onSaved={() => void onChanged()}
                  />
                ) : (
                  <Badge variant="light" color="gray" className="prediction-locked-badge">
                    Locked
                  </Badge>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}

type SettledTableProps = {
  rows: UserPrediction[];
  tickerLogos: Record<string, string | null>;
};

function SettledPredictionsTable({ rows, tickerLogos }: SettledTableProps) {
  return (
    <>
      <div className="desktop-table">
        <Table.ScrollContainer minWidth={820}>
          <Table
            highlightOnHover
            verticalSpacing="sm"
            className="prediction-table user-predictions-table"
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Ticker</Table.Th>
                <Table.Th className="prediction-table-center">Horizon</Table.Th>
                <Table.Th className="prediction-table-center">Predicted</Table.Th>
                <Table.Th className="prediction-table-center">Actual</Table.Th>
                <Table.Th className="prediction-table-center">Error</Table.Th>
                <Table.Th className="prediction-table-center">Direction</Table.Th>
                <Table.Th className="prediction-table-center">Matured On</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.prediction_id}>
                  <Table.Td>
                    <TickerCell ticker={row.ticker} logoUrl={tickerLogos[row.ticker]} />
                  </Table.Td>
                  <Table.Td className="prediction-table-center">
                    <Badge variant="light" color="green">
                      {formatHorizon(row.prediction_horizon)}
                    </Badge>
                  </Table.Td>
                  <Table.Td className="prediction-table-center">
                    <PriceReturn close={row.predicted_close} ret={row.predicted_return} />
                  </Table.Td>
                  <Table.Td className="prediction-table-center">
                    <ActualValue score={row.score} />
                  </Table.Td>
                  <Table.Td className="prediction-table-center">
                    {row.score ? formatCurrency(row.score.absolute_error) : "—"}
                  </Table.Td>
                  <Table.Td className="prediction-table-center">
                    <DirectionBadge score={row.score} />
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
            <article className="prediction-card" key={row.prediction_id}>
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <TickerCell ticker={row.ticker} logoUrl={tickerLogos[row.ticker]} card />
                <Group gap={6} wrap="nowrap">
                  <Badge variant="light" color="green">
                    {formatHorizon(row.prediction_horizon)}
                  </Badge>
                  <DirectionBadge score={row.score} />
                </Group>
              </Group>
              <Group mt="sm" justify="space-between">
                <Text size="xs" c="dimmed">
                  Predicted
                </Text>
                <PriceReturn close={row.predicted_close} ret={row.predicted_return} inline />
              </Group>
              <Group mt={6} justify="space-between">
                <Text size="xs" c="dimmed">
                  Actual
                </Text>
                <ActualValue score={row.score} inline />
              </Group>
              <Group mt={6} justify="space-between">
                <Text size="xs" c="dimmed">
                  Error
                </Text>
                <Text size="sm">{row.score ? formatCurrency(row.score.absolute_error) : "—"}</Text>
              </Group>
              <Group mt={6} justify="space-between">
                <Text size="xs" c="dimmed">
                  Matured on
                </Text>
                <Text size="sm">{formatDate(row.target_date)}</Text>
              </Group>
            </article>
          ))}
        </div>
      </div>
    </>
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
    <Group gap="xs" wrap="nowrap" className={card ? "ticker-card-heading" : "ticker-cell-link"}>
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
  close: number;
  ret: number;
  inline?: boolean;
}) {
  const returnClass = ret >= 0 ? "prediction-return-up" : "prediction-return-down";
  if (inline) {
    return (
      <span className="prediction-inline-value">
        <Text component="span" fw={850}>
          {formatCurrency(close)}
        </Text>{" "}
        <Text component="span" size="xs" className={returnClass}>
          {formatSignedPercent(ret)}
        </Text>
      </span>
    );
  }
  return (
    <>
      <Text fw={850}>{formatCurrency(close)}</Text>
      <Text size="xs" className={returnClass}>
        {formatSignedPercent(ret)}
      </Text>
    </>
  );
}

function ActualValue({
  score,
  inline = false,
}: {
  score: UserPredictionScore | null | undefined;
  inline?: boolean;
}) {
  if (!score) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }
  return <PriceReturn close={score.actual_close} ret={score.actual_return} inline={inline} />;
}

function DirectionBadge({ score }: { score: UserPredictionScore | null | undefined }) {
  if (!score) {
    return (
      <Badge variant="light" color="gray">
        —
      </Badge>
    );
  }
  const correct = score.direction_correct === 1;
  return (
    <Badge variant="light" color={correct ? "green" : "red"}>
      {correct ? "Correct" : "Miss"}
    </Badge>
  );
}
