import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchOwnUserPredictions, type UserPrediction } from "../api/userPredictions";
import { useAuth } from "../auth/AuthProvider";

export function useUserPredictions() {
  const { user } = useAuth();
  const [data, setData] = useState<UserPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) {
      setData([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setData(await fetchOwnUserPredictions(user.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load your predictions.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return useMemo(
    () => ({
      data,
      loading,
      error,
      refetch,
    }),
    [data, error, loading, refetch],
  );
}
