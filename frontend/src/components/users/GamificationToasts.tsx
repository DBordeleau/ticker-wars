import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useRef } from "react";
import { FiAward, FiStar, FiTarget, FiTrendingUp } from "react-icons/fi";
import {
  dispatchProgressionRefresh,
  fetchToastEngagementEvents,
  markToastEngagementEventsSeen,
  type UserEngagementEvent,
} from "../../api/gamification";
import { useAuth } from "../../auth/AuthProvider";

export default function GamificationToasts() {
  const { user } = useAuth();
  const shownIds = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!user) {
      shownIds.current.clear();
      return;
    }

    const events = await fetchToastEngagementEvents(user.id).catch(() => []);
    const unseen = events.filter((event) => !shownIds.current.has(event.event_id));
    if (unseen.length === 0) {
      return;
    }

    unseen.forEach((event) => {
      shownIds.current.add(event.event_id);
      showEvent(event);
    });

    await markToastEngagementEventsSeen(unseen.map((event) => event.event_id)).catch(() => undefined);
    dispatchProgressionRefresh();
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener("tickerwars:engagement-events-refresh", handler);
    return () => window.removeEventListener("tickerwars:engagement-events-refresh", handler);
  }, [refresh]);

  return null;
}

function showEvent(event: UserEngagementEvent) {
  const { color, icon } = notificationStyle(event.event_type);
  notifications.show({
    color,
    icon,
    title: event.headline,
    message: event.body ?? xpMessage(event.xp_amount),
    className: `gamification-toast gamification-toast-${event.event_type}`,
  });
}

function notificationStyle(eventType: string) {
  if (eventType === "badge_unlocked") {
    return { color: "green", icon: <FiAward /> };
  }
  if (eventType === "level_reached") {
    return { color: "teal", icon: <FiStar /> };
  }
  if (eventType === "prediction_scored") {
    return { color: "green", icon: <FiTrendingUp /> };
  }
  return { color: "green", icon: <FiTarget /> };
}

function xpMessage(xpAmount: number | null) {
  return xpAmount && xpAmount > 0 ? `+${xpAmount} XP` : undefined;
}
