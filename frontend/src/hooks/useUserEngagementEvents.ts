import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDigestEngagementEvents,
  markDigestEngagementEventsSeen,
  refreshPredictionTimingEvents,
  summarizeEngagementEvents,
  type UserEngagementEvent,
} from "../api/gamification";
import { useAuth } from "../auth/AuthProvider";

export function useUserEngagementEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState<UserEngagementEvent[]>([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await refreshPredictionTimingEvents().catch(() => 0);
      setEvents(await fetchDigestEngagementEvents(user.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load return events.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const markSeen = useCallback(
    async (eventIds: string[]) => {
      if (!user || eventIds.length === 0) {
        return;
      }

      await markDigestEngagementEventsSeen(eventIds);
      setEvents((current) => current.filter((event) => !eventIds.includes(event.event_id)));
    },
    [user],
  );

  const markAllSeen = useCallback(async () => {
    await markSeen(events.map((event) => event.event_id));
  }, [events, markSeen]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const handler = () => void refetch();
    window.addEventListener("tickerwars:engagement-events-refresh", handler);
    return () => window.removeEventListener("tickerwars:engagement-events-refresh", handler);
  }, [refetch]);

  return useMemo(
    () => ({
      events,
      summary: summarizeEngagementEvents(events),
      loading,
      error,
      refetch,
      markSeen,
      markAllSeen,
    }),
    [error, events, loading, markAllSeen, markSeen, refetch],
  );
}
