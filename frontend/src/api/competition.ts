import type { AvatarOptions } from "../auth/types";
import type { MetricHorizon, MetricWindow } from "./dashboardData";
import { supabase } from "./supabaseClient";

const defaultAvatarOptions: AvatarOptions = {
  eyebrowsVariant: "variant01",
  eyesVariant: "variant01",
  glassesVariant: "variant01",
  glassesProbability: 0,
  mouthVariant: "variant01",
  backgroundColor: "f2d3b1",
  scale: 1,
  rotate: 0,
};

export type LeaderboardMovementRow = {
  generated_at?: string;
  evaluation_window: MetricWindow;
  prediction_horizon: MetricHorizon;
  user_id: string;
  username: string;
  avatar_style: "adventurer-neutral";
  avatar_seed: string;
  avatar_options: AvatarOptions;
  current_rank: number | null;
  previous_rank: number | null;
  rank_delta: number | null;
  movement_label: "new" | "up" | "down" | "steady";
  mae: number | null;
  directional_accuracy: number | null;
  scored_count: number;
};

export type NearbyRivalRow = {
  generated_at?: string;
  evaluation_window: MetricWindow;
  prediction_horizon: MetricHorizon;
  user_id: string;
  relation: "catch" | "defend" | "podium";
  user_rank: number | null;
  rival_user_id: string;
  rival_username: string;
  rival_avatar_style: "adventurer-neutral";
  rival_avatar_seed: string;
  rival_avatar_options: AvatarOptions;
  rival_rank: number | null;
  rank_gap: number | null;
  mae_gap: number | null;
  scored_count_gap: number | null;
};

export type TickerSpecialtyRow = {
  generated_at?: string;
  user_id: string;
  username: string;
  avatar_style: "adventurer-neutral";
  avatar_seed: string;
  avatar_options: AvatarOptions;
  ticker: string;
  scored_count: number;
  directional_accuracy: number | null;
  average_absolute_pct_error: number | null;
  best_score_verdict: string | null;
  best_score_verdict_rank: number | null;
  called_it_count: number;
  close_call_or_better_count: number;
  ticker_rank: number | null;
};

export type ChallengeDefinition = {
  challenge_slug: string;
  name: string;
  description: string;
  challenge_type: string;
  target_count: number;
  xp_reward: number;
  badge_slug: string | null;
  sort_order: number;
};

export async function fetchLeaderboardMovement(
  evaluationWindow: MetricWindow = "all",
  horizon: MetricHorizon = "all",
): Promise<LeaderboardMovementRow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("dashboard_user_leaderboard_movement")
    .select("*")
    .eq("evaluation_window", evaluationWindow)
    .eq("prediction_horizon", horizon)
    .order("current_rank", { nullsFirst: false })
    .order("username");

  if (isMissingCompetitionTable(error)) return [];
  if (error) throw error;

  return (data ?? []).map(normalizeMovementRow);
}

export async function fetchNearbyRivals(
  userId: string,
  evaluationWindow: MetricWindow = "all",
  horizon: MetricHorizon = "all",
): Promise<NearbyRivalRow[]> {
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from("dashboard_user_nearby_rivals")
    .select("*")
    .eq("user_id", userId)
    .eq("evaluation_window", evaluationWindow)
    .eq("prediction_horizon", horizon)
    .order("relation");

  if (isMissingCompetitionTable(error)) return [];
  if (error) throw error;

  return (data ?? []).map(normalizeRivalRow);
}

export async function fetchTickerSpecialists(
  ticker: string,
  limit = 3,
): Promise<TickerSpecialtyRow[]> {
  if (!supabase || !ticker) return [];

  const { data, error } = await supabase
    .from("public_user_ticker_specialties")
    .select("*")
    .eq("ticker", ticker.toUpperCase())
    .order("ticker_rank", { nullsFirst: false })
    .limit(limit);

  if (isMissingCompetitionTable(error)) return [];
  if (error) throw error;

  return (data ?? []).map(normalizeSpecialtyRow);
}

export async function fetchUserTickerSpecialties(userId: string): Promise<TickerSpecialtyRow[]> {
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from("public_user_ticker_specialties")
    .select("*")
    .eq("user_id", userId)
    .order("ticker_rank", { nullsFirst: false })
    .order("ticker")
    .limit(6);

  if (isMissingCompetitionTable(error)) return [];
  if (error) throw error;

  return (data ?? []).map(normalizeSpecialtyRow);
}

export async function fetchChallengeDefinitions(): Promise<ChallengeDefinition[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("challenge_definitions")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (isMissingCompetitionTable(error)) return [];
  if (error) throw error;

  return (data ?? []).map((row) => ({
    challenge_slug: row.challenge_slug ?? "",
    name: row.name ?? "",
    description: row.description ?? "",
    challenge_type: row.challenge_type ?? "",
    target_count: row.target_count ?? 1,
    xp_reward: row.xp_reward ?? 0,
    badge_slug: row.badge_slug ?? null,
    sort_order: row.sort_order ?? 100,
  }));
}

function normalizeMovementRow(row: Partial<LeaderboardMovementRow>): LeaderboardMovementRow {
  return {
    generated_at: row.generated_at,
    evaluation_window: row.evaluation_window ?? "all",
    prediction_horizon: row.prediction_horizon ?? "all",
    user_id: row.user_id ?? "",
    username: row.username ?? "",
    avatar_style: "adventurer-neutral",
    avatar_seed: row.avatar_seed ?? row.user_id ?? row.username ?? "",
    avatar_options: row.avatar_options ?? defaultAvatarOptions,
    current_rank: row.current_rank ?? null,
    previous_rank: row.previous_rank ?? null,
    rank_delta: row.rank_delta ?? null,
    movement_label: row.movement_label ?? "steady",
    mae: row.mae ?? null,
    directional_accuracy: row.directional_accuracy ?? null,
    scored_count: row.scored_count ?? 0,
  };
}

function normalizeRivalRow(row: Partial<NearbyRivalRow>): NearbyRivalRow {
  return {
    generated_at: row.generated_at,
    evaluation_window: row.evaluation_window ?? "all",
    prediction_horizon: row.prediction_horizon ?? "all",
    user_id: row.user_id ?? "",
    relation: row.relation ?? "catch",
    user_rank: row.user_rank ?? null,
    rival_user_id: row.rival_user_id ?? "",
    rival_username: row.rival_username ?? "",
    rival_avatar_style: "adventurer-neutral",
    rival_avatar_seed: row.rival_avatar_seed ?? row.rival_user_id ?? row.rival_username ?? "",
    rival_avatar_options: row.rival_avatar_options ?? defaultAvatarOptions,
    rival_rank: row.rival_rank ?? null,
    rank_gap: row.rank_gap ?? null,
    mae_gap: row.mae_gap ?? null,
    scored_count_gap: row.scored_count_gap ?? null,
  };
}

function normalizeSpecialtyRow(row: Partial<TickerSpecialtyRow>): TickerSpecialtyRow {
  return {
    generated_at: row.generated_at,
    user_id: row.user_id ?? "",
    username: row.username ?? "",
    avatar_style: "adventurer-neutral",
    avatar_seed: row.avatar_seed ?? row.user_id ?? row.username ?? "",
    avatar_options: row.avatar_options ?? defaultAvatarOptions,
    ticker: row.ticker ?? "",
    scored_count: row.scored_count ?? 0,
    directional_accuracy: row.directional_accuracy ?? null,
    average_absolute_pct_error: row.average_absolute_pct_error ?? null,
    best_score_verdict: row.best_score_verdict ?? null,
    best_score_verdict_rank: row.best_score_verdict_rank ?? null,
    called_it_count: row.called_it_count ?? 0,
    close_call_or_better_count: row.close_call_or_better_count ?? 0,
    ticker_rank: row.ticker_rank ?? null,
  };
}

function isMissingCompetitionTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /dashboard_user_leaderboard_movement|dashboard_user_nearby_rivals|public_user_ticker_specialties|challenge_definitions/.test(error.message ?? "");
}
