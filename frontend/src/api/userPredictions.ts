import { supabase } from "./supabaseClient";
import type { LatestPrediction, MetricHorizon } from "./dashboardData";

export type UserPredictionStatus = "pending" | "scored" | "cancelled";
export type PredictionHorizon = Exclude<MetricHorizon, "all">;

export type UserPredictionScore = {
  prediction_id: string;
  user_id: string;
  ticker: string;
  prediction_date: string;
  target_date: string;
  prediction_horizon: PredictionHorizon;
  actual_close: number;
  actual_return: number;
  absolute_error: number;
  squared_error: number;
  absolute_pct_error: number;
  predicted_direction: number;
  actual_direction: number;
  direction_correct: number;
  scored_at: string;
};

export type UserPrediction = {
  prediction_id: string;
  user_id: string;
  ticker: string;
  prediction_date: string;
  target_date: string;
  prediction_horizon: PredictionHorizon;
  horizon_calendar_days: number;
  reference_close: number;
  predicted_close: number;
  predicted_return: number;
  status: UserPredictionStatus;
  edit_count: number;
  last_edited_at: string | null;
  created_at: string;
  updated_at: string;
  score?: UserPredictionScore | null;
};

export type PredictionTarget = {
  ticker: string;
  horizon: PredictionHorizon;
  predictionDate: string;
  targetDate: string;
  referenceClose: number;
  horizonCalendarDays: number;
};

export type UserPredictionInput = {
  userId: string;
  target: PredictionTarget;
  predictedClose: number;
};

const predictionColumns =
  "prediction_id,user_id,ticker,prediction_date,target_date,prediction_horizon,horizon_calendar_days,reference_close,predicted_close,predicted_return,status,edit_count,last_edited_at,created_at,updated_at";

export function getPredictionTargets(
  ticker: string,
  latestPredictions: LatestPrediction[],
): PredictionTarget[] {
  const byHorizon = new Map<PredictionHorizon, LatestPrediction & { prediction_horizon: PredictionHorizon }>();

  latestPredictions
    .filter((row) => row.ticker === ticker)
    .filter((row): row is LatestPrediction & { prediction_horizon: PredictionHorizon } =>
      isPredictionHorizon(row.prediction_horizon),
    )
    .sort((a, b) => {
      if (a.model_slug === "baseline") {
        return -1;
      }
      if (b.model_slug === "baseline") {
        return 1;
      }
      return a.model_name.localeCompare(b.model_name);
    })
    .forEach((row) => {
      if (!byHorizon.has(row.prediction_horizon)) {
        byHorizon.set(row.prediction_horizon, row);
      }
    });

  return Array.from(byHorizon.values()).map((row) => ({
    ticker: row.ticker,
    horizon: row.prediction_horizon,
    predictionDate: todayIsoDate(),
    targetDate: row.target_date,
    referenceClose: row.reference_close,
    horizonCalendarDays: daysBetween(todayIsoDate(), row.target_date),
  }));
}

export async function fetchOwnUserPredictions(userId: string): Promise<UserPrediction[]> {
  if (!supabase) {
    return [];
  }

  const [{ data: predictionData, error: predictionError }, { data: scoreData, error: scoreError }] =
    await Promise.all([
      supabase
        .from("user_predictions")
        .select(predictionColumns)
        .eq("user_id", userId)
        .order("prediction_date", { ascending: false }),
      supabase
        .from("user_prediction_scores")
        .select("*")
        .eq("user_id", userId)
        .order("scored_at", { ascending: false }),
    ]);

  if (predictionError) {
    throw predictionError;
  }
  if (scoreError) {
    throw scoreError;
  }

  const scoresByPredictionId = new Map(
    ((scoreData ?? []) as UserPredictionScore[]).map((score) => [score.prediction_id, score]),
  );

  return ((predictionData ?? []) as UserPrediction[]).map((prediction) => ({
    ...prediction,
    score: scoresByPredictionId.get(prediction.prediction_id) ?? null,
  }));
}

export async function findPendingPrediction(
  userId: string,
  ticker: string,
  horizon: Exclude<MetricHorizon, "all">,
): Promise<UserPrediction | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_predictions")
    .select(predictionColumns)
    .eq("user_id", userId)
    .eq("ticker", ticker)
    .eq("prediction_horizon", horizon)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as UserPrediction | null) ?? null;
}

export async function submitUserPrediction(input: UserPredictionInput): Promise<UserPrediction> {
  if (!supabase) {
    throw new Error("Supabase is not configured for this React build.");
  }

  const predictedReturn = input.predictedClose / input.target.referenceClose - 1;
  const row = {
    user_id: input.userId,
    ticker: input.target.ticker,
    prediction_date: input.target.predictionDate,
    target_date: input.target.targetDate,
    prediction_horizon: input.target.horizon,
    horizon_calendar_days: input.target.horizonCalendarDays,
    reference_close: input.target.referenceClose,
    predicted_close: input.predictedClose,
    predicted_return: predictedReturn,
    status: "pending",
  };

  const { data, error } = await supabase
    .from("user_predictions")
    .insert(row)
    .select(predictionColumns)
    .single();

  if (error) {
    throw error;
  }

  return data as UserPrediction;
}

export async function editUserPrediction(
  prediction: UserPrediction,
  input: UserPredictionInput,
): Promise<UserPrediction> {
  if (!supabase) {
    throw new Error("Supabase is not configured for this React build.");
  }

  const predictedReturn = input.predictedClose / input.target.referenceClose - 1;
  const { data, error } = await supabase
    .from("user_predictions")
    .update({
      prediction_date: input.target.predictionDate,
      target_date: input.target.targetDate,
      prediction_horizon: input.target.horizon,
      horizon_calendar_days: input.target.horizonCalendarDays,
      reference_close: input.target.referenceClose,
      predicted_close: input.predictedClose,
      predicted_return: predictedReturn,
      edit_count: prediction.edit_count + 1,
      last_edited_at: new Date().toISOString(),
    })
    .eq("prediction_id", prediction.prediction_id)
    .select(predictionColumns)
    .single();

  if (error) {
    throw error;
  }

  return data as UserPrediction;
}

export function isPredictionEditable(prediction: UserPrediction, now = new Date()) {
  if (prediction.status !== "pending") {
    return false;
  }

  const cutoff = parseDateOnly(prediction.target_date);
  cutoff.setDate(cutoff.getDate() - 7);
  return startOfLocalDay(now) < cutoff;
}

export function todayIsoDate() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function daysBetween(start: string, end: string) {
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isPredictionHorizon(value: MetricHorizon): value is PredictionHorizon {
  return value === "1w" || value === "1m" || value === "3m" || value === "1y";
}
