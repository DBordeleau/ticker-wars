import { supabase } from "./supabaseClient";
import type { AvatarOptions } from "../auth/types";
import type { BadgeDefinition, ScoreVerdict, UserProgression } from "./gamification";
import type { PredictionHorizon, UserPredictionStatus } from "./userPredictions";

export type PublicUserProfile = {
  user_id: string;
  username: string;
  display_username: string;
  avatar_style: "adventurer-neutral";
  avatar_seed: string;
  avatar_options: AvatarOptions;
  level: number;
  total_xp: number;
  featured_badge_slug: string | null;
  featured_badge_name: string | null;
  featured_badge_rarity: BadgeDefinition["rarity"] | null;
  featured_badge_icon_name: string | null;
  secondary_featured_badge_slug?: string | null;
  secondary_featured_badge_name?: string | null;
  secondary_featured_badge_rarity?: BadgeDefinition["rarity"] | null;
  secondary_featured_badge_icon_name?: string | null;
  equipped_title: string | null;
  badge_count: number;
  scored_count: number;
  active_prediction_count: number;
  called_it_count: number;
  close_call_or_better_count: number;
  verdict_counts?: Partial<Record<ScoreVerdict, number>>;
  directional_accuracy: number | null;
  average_absolute_pct_error: number | null;
  signature_ticker: string | null;
  best_score_verdict: ScoreVerdict | null;
  best_score_verdict_rank: number | null;
  last_prediction_at: string | null;
  last_scored_at: string | null;
  updated_at: string;
};

export type PublicUserBadge = BadgeDefinition & {
  user_id: string;
  badge_slug: string;
  unlocked_at: string;
  is_featured: boolean;
  featured_slot?: number | null;
  metadata: Record<string, unknown>;
};

export type PublicProfilePrediction = {
  prediction_id: string;
  user_id: string;
  section: "active" | "recent";
  display_order: number;
  ticker: string;
  prediction_date: string;
  target_date: string;
  prediction_horizon: PredictionHorizon;
  reference_close: number;
  predicted_return: number | null;
  predicted_close: number | null;
  status: UserPredictionStatus;
  public_details_hidden: boolean;
  actual_close: number | null;
  actual_return: number | null;
  absolute_error: number | null;
  absolute_pct_error: number | null;
  direction_correct: number | null;
  score_verdict: ScoreVerdict | null;
  score_verdict_rank: number | null;
  score_verdict_color: string | null;
  xp_awarded: number | null;
  scored_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicUserProfileBundle = {
  profile: PublicUserProfile;
  badges: PublicUserBadge[];
  predictions: PublicProfilePrediction[];
};

export async function fetchPublicUserProfile(username: string): Promise<PublicUserProfileBundle | null> {
  if (!supabase) {
    return null;
  }

  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) {
    return null;
  }

  const { data: profileData, error: profileError } = await supabase
    .from("public_user_profiles")
    .select("*")
    .eq("username", normalizedUsername)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }
  if (!profileData) {
    return null;
  }

  const profile = profileData as PublicUserProfile;
  const [{ data: badgeData, error: badgeError }, { data: predictionData, error: predictionError }] =
    await Promise.all([
      supabase
        .from("public_user_badges")
        .select("*")
        .eq("user_id", profile.user_id)
        .order("is_featured", { ascending: false })
        .order("featured_slot", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("unlocked_at", { ascending: false }),
      supabase
        .from("public_user_profile_predictions")
        .select("*")
        .eq("user_id", profile.user_id)
        .order("section", { ascending: true })
        .order("display_order", { ascending: true }),
    ]);

  if (badgeError) {
    throw badgeError;
  }
  if (predictionError) {
    throw predictionError;
  }

  return {
    profile,
    badges: ((badgeData ?? []) as PublicUserBadge[]).map(normalizePublicBadge),
    predictions: (predictionData ?? []) as PublicProfilePrediction[],
  };
}

export async function updateOwnFeaturedBadges(input: {
  primaryBadgeSlug: string | null;
  secondaryBadgeSlug: string | null;
}): Promise<UserProgression> {
  if (!supabase) {
    throw new Error("Supabase is not configured for this React build.");
  }

  const { data, error } = await supabase.rpc("update_user_featured_badges", {
    p_primary_badge_slug: input.primaryBadgeSlug,
    p_secondary_badge_slug: input.secondaryBadgeSlug,
  });

  if (error) {
    throw error;
  }

  return data as UserProgression;
}

function normalizePublicBadge(row: PublicUserBadge): PublicUserBadge {
  return {
    ...row,
    slug: row.badge_slug,
  };
}
