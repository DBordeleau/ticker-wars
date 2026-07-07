import type { MetricHorizon, MetricWindow } from "./dashboardData";
import { supabase } from "./supabaseClient";

export type PublicModelScoredPrediction = {
  prediction_id: string;
  ticker: string;
  prediction_date: string;
  target_date: string;
  prediction_horizon: Exclude<MetricHorizon, "all">;
  model_name: string;
  model_slug: string;
  reference_close: number;
  predicted_return: number;
  predicted_close: number;
  predicted_close_lower: number | null;
  predicted_close_upper: number | null;
  interval_level: number | null;
  actual_close: number;
  actual_return: number;
  absolute_error: number;
  absolute_pct_error: number;
  predicted_direction: number;
  actual_direction: number;
  direction_correct: number;
  interval_hit: boolean | null;
  interval_width: number | null;
  interval_width_pct: number | null;
  winkler_score: number | null;
  scored_at: string;
  total_count: number;
};

export async function fetchPublicModelScoredPredictions(input: {
  modelSlug: string;
  evaluationWindow: MetricWindow;
  horizon: MetricHorizon;
  limit?: number;
  offset?: number;
}): Promise<{ rows: PublicModelScoredPrediction[]; totalCount: number }> {
  if (!supabase) {
    return { rows: [], totalCount: 0 };
  }

  const { data, error } = await supabase.rpc("get_public_model_scored_predictions", {
    p_model_slug: input.modelSlug.trim(),
    p_evaluation_window: input.evaluationWindow,
    p_prediction_horizon: input.horizon,
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
  });

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as PublicModelScoredPrediction[]).map((row) => ({
    ...row,
    total_count: Number(row.total_count ?? 0),
  }));

  return {
    rows,
    totalCount: rows[0]?.total_count ?? 0,
  };
}
