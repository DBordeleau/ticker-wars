import { Badge, Button, Group, Text } from "@mantine/core";
import { FiAward, FiCheckCircle, FiClock, FiLock, FiStar, FiTarget, FiTrendingUp } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { isScoreVerdict, VERDICT_LABELS, type UserEngagementEvent } from "../../api/gamification";
import { formatDate, formatHorizon, formatPercent } from "../../utils/format";

type Props = {
  event: UserEngagementEvent;
  onAction?: (event: UserEngagementEvent) => Promise<void> | void;
};

export default function EngagementEventCard({ event, onAction }: Props) {
  const navigate = useNavigate();
  const meta = event.metadata ?? {};
  const ticker = typeof meta.ticker === "string" ? meta.ticker : null;
  const horizon = typeof meta.prediction_horizon === "string" ? meta.prediction_horizon : null;
  const verdict = typeof meta.score_verdict === "string" && isScoreVerdict(meta.score_verdict)
    ? VERDICT_LABELS[meta.score_verdict]
    : null;
  const actionPath = event.action_path || fallbackActionPath(event);
  const Icon = eventIcon(event.event_type);

  const handleAction = async () => {
    await onAction?.(event);
    if (actionPath) {
      navigate(actionPath);
    }
  };

  return (
    <article className={`engagement-event-card engagement-event-${event.event_type}`}>
      <span className="engagement-event-icon">
        <Icon aria-hidden />
      </span>
      <div className="engagement-event-copy">
        <Group gap={6} wrap="wrap">
          {ticker ? <Badge variant="light" color="green">{ticker}</Badge> : null}
          {horizon ? <Badge variant="light" color="teal">{formatHorizon(horizon)}</Badge> : null}
          {verdict ? <Badge variant="light" color="yellow">{verdict}</Badge> : null}
          {event.xp_amount && event.xp_amount > 0 ? (
            <Badge variant="light" color="yellow">+{event.xp_amount.toLocaleString()} XP</Badge>
          ) : null}
        </Group>
        <Text className="engagement-event-title">{event.headline}</Text>
        {event.body ? <Text className="engagement-event-body">{event.body}</Text> : null}
        <Text className="engagement-event-meta">{eventMeta(event)}</Text>
      </div>
      {actionPath ? (
        <Button size="xs" variant="subtle" color="green" onClick={() => void handleAction()}>
          View
        </Button>
      ) : null}
    </article>
  );
}

function eventIcon(eventType: string) {
  if (eventType === "badge_unlocked") return FiAward;
  if (eventType === "level_reached") return FiStar;
  if (eventType === "prediction_scored") return FiTrendingUp;
  if (eventType === "prediction_locked") return FiLock;
  if (eventType === "prediction_maturing_soon" || eventType === "prediction_due_today") return FiClock;
  if (eventType === "prediction_submitted") return FiTarget;
  return FiCheckCircle;
}

function fallbackActionPath(event: UserEngagementEvent) {
  if (event.source_prediction_id) {
    return `/me/predictions?highlight=${event.source_prediction_id}`;
  }
  return null;
}

function eventMeta(event: UserEngagementEvent) {
  const meta = event.metadata ?? {};
  if (typeof meta.absolute_pct_error === "number") {
    return `${formatPercent(meta.absolute_pct_error, 2)} error`;
  }
  if (typeof meta.target_date === "string") {
    return `Matures ${formatDate(meta.target_date)}`;
  }
  return formatDate(event.created_at);
}
