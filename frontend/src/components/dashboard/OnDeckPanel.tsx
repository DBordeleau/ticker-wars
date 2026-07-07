import { Badge, Button, Group, Skeleton, Text } from "@mantine/core";
import { FiArrowRight, FiTarget } from "react-icons/fi";
import { Link } from "react-router-dom";
import type { TickerDisplayPrice } from "../../api/livePrices";
import { useUserPredictions } from "../../hooks/useUserPredictions";
import { useTickerDisplayPrices } from "../../hooks/useTickerDisplayPrices";
import { formatCurrency, formatDate, formatHorizon, formatSignedPercent } from "../../utils/format";
import SectionPanel from "../layout/SectionPanel";
import { buildTrackingSnapshot } from "../predictions/predictionPresentation";
import TickerLogoMark from "../tickers/TickerLogoMark";
import { buildOnDeckItems, type OnDeckItem } from "./onDeck";

type Props = {
  tickerLogos: Record<string, string | null>;
};

export default function OnDeckPanel({ tickerLogos }: Props) {
  const predictions = useUserPredictions();
  const items = buildOnDeckItems(predictions.data);
  const visibleItems = items.slice(0, 5);
  const tickerPrices = useTickerDisplayPrices(visibleItems.map((item) => item.prediction.ticker));

  if (predictions.loading) {
    return (
      <SectionPanel className="on-deck-panel" title="On the Horizon">
        <Skeleton height={140} radius="sm" />
      </SectionPanel>
    );
  }

  if (predictions.error) {
    return null;
  }

  return (
    <SectionPanel
      className="on-deck-panel"
      title="On the Horizon"
      subtitle={items.length > 0 ? onDeckSubtitle(items) : "No active predictions waiting to mature."}
      action={
        <Link to="/me/predictions" className="dashboard-inline-cta">
          My predictions
          <FiArrowRight aria-hidden />
        </Link>
      }
    >
      {visibleItems.length > 0 ? (
        <div className="on-deck-grid">
          {visibleItems.map((item) => (
            <OnDeckCard
              key={item.prediction.prediction_id}
              item={item}
              logoUrl={tickerLogos[item.prediction.ticker]}
              displayPrice={tickerPrices.prices[item.prediction.ticker]}
            />
          ))}
        </div>
      ) : (
        <div className="on-deck-empty">
          <span className="on-deck-empty-icon">
            <FiTarget aria-hidden />
          </span>
          <div>
            <Text fw={900}>No active predictions on the horizon</Text>
            <Text size="sm" c="dimmed">
              Make a prediction to start building a return loop.
            </Text>
          </div>
          <Button component={Link} to="/tickers" size="xs" color="green" variant="light">
            Pick a ticker
          </Button>
        </div>
      )}
    </SectionPanel>
  );
}

function OnDeckCard({
  item,
  logoUrl,
  displayPrice,
}: {
  item: OnDeckItem;
  logoUrl?: string | null;
  displayPrice?: TickerDisplayPrice | null;
}) {
  const prediction = item.prediction;
  const status = statusCopy(item);
  const tracking = buildTrackingSnapshot(
    {
      ...prediction,
      public_details_hidden: false,
      actual_close: null,
      actual_return: null,
      absolute_error: null,
      absolute_pct_error: null,
      direction_correct: null,
      score_verdict: null,
    },
    displayPrice,
  );

  return (
    <Link
      to={`/me/predictions?highlight=${prediction.prediction_id}`}
      className={`on-deck-card on-deck-${item.status}`}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <TickerLogoMark ticker={prediction.ticker} logoUrl={logoUrl} />
          <div>
            <Text className="on-deck-ticker">{prediction.ticker}</Text>
            <Text className="on-deck-date">{formatDate(prediction.target_date)}</Text>
          </div>
        </Group>
        <Badge variant="light" color={status.color}>
          {status.label}
        </Badge>
      </Group>
      <div className="on-deck-price-row">
        <div>
          <Text className="on-deck-price-label">{tracking?.priceLabel ?? "Current price"}</Text>
          <Text className="on-deck-price">{tracking ? formatCurrency(tracking.currentPrice) : "Pending"}</Text>
        </div>
        <Badge variant="light" color={tracking?.tone ?? "gray"} className="on-deck-tracking-badge">
          {tracking?.label ?? "Awaiting price"}
        </Badge>
      </div>
      <div className="on-deck-tracking-grid">
        <div>
          <span>Now</span>
          <strong>{tracking ? formatSignedPercent(tracking.currentReturn) : "Pending"}</strong>
        </div>
        <div>
          <span>Call</span>
          <strong>{formatSignedPercent(prediction.predicted_return)}</strong>
        </div>
        <div>
          <span>Gap</span>
          <strong>{tracking?.detail ?? "Pending"}</strong>
        </div>
      </div>
      <div className="on-deck-progress">
        <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
      </div>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text className="on-deck-meta">
          {formatHorizon(prediction.prediction_horizon)} prediction
        </Text>
        <Text className="on-deck-meta">
          {item.elapsedDays} days in, {Math.max(0, item.daysUntil)} to go
        </Text>
      </Group>
    </Link>
  );
}

function onDeckSubtitle(items: OnDeckItem[]) {
  const urgent = items.filter((item) => item.status === "due_today" || item.status === "locked").length;
  const soon = items.filter((item) => item.status === "maturing_soon").length;
  if (urgent > 0) {
    return `${urgent} prediction${urgent === 1 ? "" : "s"} locked or due today.`;
  }
  if (soon > 0) {
    return `${soon} prediction${soon === 1 ? "" : "s"} mature within a week.`;
  }
  return `${items.length} active prediction${items.length === 1 ? "" : "s"} building toward maturity.`;
}

function statusCopy(item: OnDeckItem): { label: string; color: string } {
  if (item.status === "due_today") {
    return { label: "Due today", color: "yellow" };
  }
  if (item.status === "locked") {
    return { label: "Locked", color: "orange" };
  }
  if (item.status === "maturing_soon") {
    return {
      label: `${item.daysUntil}d left`,
      color: "green",
    };
  }
  if (item.status === "long_progress") {
    return { label: "In progress", color: "teal" };
  }
  return { label: "Active", color: "gray" };
}
