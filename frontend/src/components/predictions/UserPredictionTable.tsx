import { Badge, Group, Skeleton, Table, Text } from "@mantine/core";
import { motion } from "framer-motion";
import { useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import { Link } from "react-router-dom";
import type { LatestUserPrediction, MetricHorizon } from "../../api/dashboardData";
import type { DashboardView } from "../dashboard/DashboardViewToggle";
import DashboardViewToggle from "../dashboard/DashboardViewToggle";
import { formatCurrency, formatDate, formatHorizon, formatSignedPercent } from "../../utils/format";
import MagicHoverSurface from "../layout/MagicHoverSurface";
import SectionPanel from "../layout/SectionPanel";
import EntityHoverCard from "../cards/EntityHoverCard";
import AvatarImage from "../users/AvatarImage";
import TickerLogoMark from "../tickers/TickerLogoMark";
import PredictionHorizonSelector from "./PredictionHorizonSelector";

type Props = {
  rows: LatestUserPrediction[];
  loading: boolean;
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  horizon: MetricHorizon;
  onHorizonChange: (horizon: MetricHorizon) => void;
  title?: string;
  subtitle?: string;
  collapsible?: boolean;
  embedded?: boolean;
  tickerLogos?: Record<string, string | null>;
};

export default function UserPredictionTable({
  rows,
  loading,
  view,
  onViewChange,
  horizon,
  onHorizonChange,
  title = "Latest User Predictions",
  subtitle = "Public user predictions. Private profiles are excluded.",
  collapsible = false,
  embedded = false,
  tickerLogos = {},
}: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const visibleRows = rows
    .filter((row) => (horizon === "all" ? true : row.prediction_horizon === horizon))
    .sort(
      (a, b) =>
        b.prediction_date.localeCompare(a.prediction_date) ||
        b.target_date.localeCompare(a.target_date) ||
        a.ticker.localeCompare(b.ticker) ||
        a.username.localeCompare(b.username),
    );

  const controls = (
    <Group className="prediction-controls" justify="flex-end" gap="sm">
      <DashboardViewToggle value={view} onChange={onViewChange} label="Latest prediction view" />
      <PredictionHorizonSelector value={horizon} onChange={onHorizonChange} />
    </Group>
  );

  const predictions = (
    <>
      {loading ? (
        <Skeleton height={300} radius="sm" />
      ) : visibleRows.length === 0 ? (
        <Text c="dimmed" size="sm">
          No public user predictions match this horizon yet.
        </Text>
      ) : (
        <>
          <div className="desktop-table">
            <Table.ScrollContainer minWidth={860}>
              <Table highlightOnHover verticalSpacing="sm" className="prediction-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ticker</Table.Th>
                    <Table.Th>User</Table.Th>
                    <Table.Th className="prediction-table-center">Horizon</Table.Th>
                    <Table.Th className="prediction-table-center">Reference</Table.Th>
                    <Table.Th className="prediction-table-center">Predicted</Table.Th>
                    <Table.Th className="prediction-table-center">Matures On</Table.Th>
                    <Table.Th className="prediction-table-center">Predicted On</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {visibleRows.map((row) => (
                    <Table.Tr key={row.prediction_id}>
                      <Table.Td>
                        <EntityHoverCard kind="ticker" ticker={row.ticker} logoUrl={tickerLogos[row.ticker]}>
                          <Group gap="xs" wrap="nowrap" className="ticker-cell-link">
                            <TickerLogoMark ticker={row.ticker} logoUrl={tickerLogos[row.ticker]} />
                            <Text component={Link} to={`/tickers/${row.ticker}`} fw={800} className="plain-link">
                              {row.ticker}
                            </Text>
                          </Group>
                        </EntityHoverCard>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <AvatarImage
                            profile={{
                              display_username: row.username,
                              avatar_seed: row.avatar_seed,
                              avatar_options: row.avatar_options,
                            }}
                            size={34}
                          />
                          <Text fw={800}>{row.username}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td className="prediction-table-center">
                        <Badge variant="light" color="green">
                          {formatHorizon(row.prediction_horizon)}
                        </Badge>
                      </Table.Td>
                      <Table.Td className="prediction-table-center">{formatCurrency(row.reference_close)}</Table.Td>
                      <Table.Td className="prediction-table-center">
                        <Text fw={850}>{formatCurrency(row.predicted_close)}</Text>
                        <Text size="xs" className={row.predicted_return >= 0 ? "prediction-return-up" : "prediction-return-down"}>
                          {formatSignedPercent(row.predicted_return)}
                        </Text>
                      </Table.Td>
                      <Table.Td className="prediction-table-center">{formatDate(row.target_date)}</Table.Td>
                      <Table.Td className="prediction-table-center">{formatDate(row.prediction_date)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </div>
          <div className="mobile-cards">
            <div className="prediction-card-list">
              {visibleRows.map((row) => (
                <article className="prediction-card" key={row.prediction_id}>
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <div className="prediction-card-copy">
                      <Group gap="xs" wrap="nowrap" className="ticker-card-heading">
                        <TickerLogoMark ticker={row.ticker} logoUrl={tickerLogos[row.ticker]} />
                        <Text component={Link} to={`/tickers/${row.ticker}`} fw={800} className="plain-link">
                          {row.ticker}
                        </Text>
                      </Group>
                      <Group gap="xs">
                        <AvatarImage
                          profile={{
                            display_username: row.username,
                            avatar_seed: row.avatar_seed,
                            avatar_options: row.avatar_options,
                          }}
                          size={28}
                        />
                        <Text size="sm" fw={800}>
                          {row.username}
                        </Text>
                      </Group>
                    </div>
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
                    <Text fw={850}>{formatCurrency(row.predicted_close)}</Text>
                  </Group>
                  <Group mt={6} justify="space-between">
                    <Text size="xs" c="dimmed">
                      Matures on
                    </Text>
                    <Text size="sm">{formatDate(row.target_date)}</Text>
                  </Group>
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );

  const panelContent = (
    <div className={embedded ? "latest-predictions-embedded-content" : undefined}>
      <Group className="collapsible-panel-topline" justify="space-between" align="flex-end" gap="md">
        <Text className="secondary-text">{subtitle}</Text>
        {controls}
      </Group>
      {predictions}
    </div>
  );

  if (embedded) {
    return panelContent;
  }

  if (collapsible) {
    return (
      <MagicHoverSurface className="section-magic-surface">
        <section className="section-panel prediction-collapsible-panel">
          <button
            type="button"
            className="collapsible-trigger"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((current) => !current)}
          >
            <span className="section-title">{title}</span>
            <FiChevronDown className="collapsible-chevron" />
          </button>
          <motion.div
            initial={false}
            animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 180, damping: 25, mass: 0.85 }}
            className="collapsible-motion"
            style={{ pointerEvents: isOpen ? "auto" : "none" }}
          >
            <div className="collapsible-inner">
              {panelContent}
            </div>
          </motion.div>
        </section>
      </MagicHoverSurface>
    );
  }

  return (
    <SectionPanel
      title={title}
      subtitle={subtitle}
      action={controls}
    >
      {predictions}
    </SectionPanel>
  );
}
