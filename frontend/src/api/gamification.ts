import { supabase } from "./supabaseClient";

export type ScoreVerdict =
  | "called_it"
  | "close_call"
  | "in_the_zone"
  | "miss"
  | "way_off"
  | "not_even_close";

export type UserProgression = {
  user_id: string;
  total_xp: number;
  level: number;
  featured_badge_slug: string | null;
  equipped_title: string | null;
  last_event_at: string | null;
};

export type BadgeDefinition = {
  slug: string;
  name: string;
  description: string;
  family: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  icon_name: string;
  title_unlock: string | null;
  sort_order: number;
};

export type UserBadge = {
  user_id: string;
  badge_slug: string;
  unlocked_at: string;
  source_prediction_id: string | null;
  metadata: Record<string, unknown>;
  definition?: BadgeDefinition | null;
};

export type UserEngagementEvent = {
  event_id: string;
  user_id: string;
  event_type:
    | "prediction_submitted"
    | "prediction_scored"
    | "badge_unlocked"
    | "level_reached"
    | string;
  headline: string;
  body: string | null;
  source_prediction_id: string | null;
  source_badge_slug: string | null;
  xp_amount: number | null;
  metadata: Record<string, unknown>;
  seen_at: string | null;
  created_at: string;
};

export const LEVEL_THRESHOLDS = [
  0, 100, 260, 500, 850, 1300, 1850, 2500, 3250, 4000, 5000, 6200, 7600, 9200, 11000,
  12500, 14000, 15500, 17000, 18000, 20500, 23200, 26200, 29500, 33000, 36000, 39000,
  42000, 43500, 45000, 50000, 55500, 61500, 68000, 75000, 82000, 89500, 97500, 106000,
  115000, 120000, 123000, 126000, 129000, 132000, 134000, 136000, 138000, 139000, 140000,
];

export const VERDICT_LABELS: Record<ScoreVerdict, string> = {
  called_it: "Called it",
  close_call: "Close call",
  in_the_zone: "In the zone",
  miss: "Miss",
  way_off: "Way off",
  not_even_close: "Not even close",
};

export const VERDICT_COLORS: Record<ScoreVerdict, string> = {
  called_it: "yellow",
  close_call: "green",
  in_the_zone: "teal",
  miss: "yellow",
  way_off: "orange",
  not_even_close: "red",
};

export function levelProgress(totalXp: number) {
  const safeXp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  for (let index = 0; index < LEVEL_THRESHOLDS.length; index += 1) {
    if (safeXp >= LEVEL_THRESHOLDS[index]) {
      level = index + 1;
    }
  }

  const currentThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] ?? currentThreshold;
  const span = Math.max(1, nextThreshold - currentThreshold);
  const xpIntoLevel = Math.max(0, safeXp - currentThreshold);
  const progress = nextThreshold === currentThreshold ? 1 : Math.min(1, xpIntoLevel / span);

  return {
    level,
    currentThreshold,
    nextLevel: nextThreshold === currentThreshold ? level : level + 1,
    nextThreshold,
    xpIntoLevel,
    xpToNext: nextThreshold === currentThreshold ? 0 : Math.max(0, nextThreshold - safeXp),
    progress,
  };
}

export function dispatchProgressionRefresh() {
  window.dispatchEvent(new CustomEvent("tickerwars:progression-refresh"));
  window.dispatchEvent(new CustomEvent("tickerwars:engagement-events-refresh"));
}

export async function fetchOwnProgression(userId: string): Promise<UserProgression> {
  if (!supabase) {
    return emptyProgression(userId);
  }

  const { data, error } = await supabase
    .from("user_progression")
    .select("user_id,total_xp,level,featured_badge_slug,equipped_title,last_event_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as UserProgression | null) ?? emptyProgression(userId);
}

export async function fetchOwnBadges(userId: string): Promise<UserBadge[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_badges")
    .select(
      "user_id,badge_slug,unlocked_at,source_prediction_id,metadata,definition:badge_definitions(slug,name,description,family,rarity,icon_name,title_unlock,sort_order)",
    )
    .eq("user_id", userId)
    .order("unlocked_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<UserBadge & { definition?: BadgeDefinition | BadgeDefinition[] | null }>).map(
    (row) => ({
      ...row,
      definition: Array.isArray(row.definition) ? (row.definition[0] ?? null) : (row.definition ?? null),
    }),
  );
}

export async function fetchUnseenEngagementEvents(userId: string): Promise<UserEngagementEvent[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_engagement_events")
    .select("*")
    .eq("user_id", userId)
    .is("seen_at", null)
    .order("created_at", { ascending: true })
    .limit(12);

  if (error) {
    throw error;
  }

  return (data ?? []) as UserEngagementEvent[];
}

export async function markEngagementEventsSeen(eventIds: string[]) {
  if (!supabase || eventIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("user_engagement_events")
    .update({ seen_at: new Date().toISOString() })
    .in("event_id", eventIds);

  if (error) {
    throw error;
  }
}

export function isScoreVerdict(value: string | null | undefined): value is ScoreVerdict {
  return Boolean(value && value in VERDICT_LABELS);
}

function emptyProgression(userId: string): UserProgression {
  return {
    user_id: userId,
    total_xp: 0,
    level: 1,
    featured_badge_slug: null,
    equipped_title: null,
    last_event_at: null,
  };
}
