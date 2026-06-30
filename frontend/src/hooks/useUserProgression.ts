import { useCallback, useEffect, useState } from "react";
import { fetchOwnBadges, fetchOwnProgression, type UserBadge, type UserProgression } from "../api/gamification";
import { useAuth } from "../auth/AuthProvider";

type ProgressionState = {
  progression: UserProgression | null;
  badges: UserBadge[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useUserProgression(): ProgressionState {
  const { user } = useAuth();
  const [progression, setProgression] = useState<UserProgression | null>(null);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) {
      setProgression(null);
      setBadges([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextProgression, nextBadges] = await Promise.all([
        fetchOwnProgression(user.id),
        fetchOwnBadges(user.id),
      ]);
      setProgression(nextProgression);
      setBadges(nextBadges);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load progression.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const refresh = () => void refetch();
    window.addEventListener("tickerwars:progression-refresh", refresh);
    return () => window.removeEventListener("tickerwars:progression-refresh", refresh);
  }, [refetch]);

  return { progression, badges, loading, error, refetch };
}
