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
  secondary_featured_badge_slug?: string | null;
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
    | "prediction_locked"
    | "prediction_maturing_soon"
    | "prediction_due_today"
    | "active_prediction_summary"
    | string;
  headline: string;
  body: string | null;
  source_prediction_id: string | null;
  source_badge_slug: string | null;
  xp_amount: number | null;
  metadata: Record<string, unknown>;
  seen_at: string | null;
  toast_seen_at?: string | null;
  digest_seen_at?: string | null;
  event_key?: string | null;
  priority?: number | null;
  action_path?: string | null;
  expires_at?: string | null;
  created_at: string;
};

export type EngagementSummary = {
  scoredCount: number;
  xpEarned: number;
  badgeCount: number;
  levelUpCount: number;
  lockCount: number;
  maturityCount: number;
  totalCount: number;
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
  in_the_zone: "green",
  miss: "orange",
  way_off: "orange",
  not_even_close: "red",
};

const VERDICT_BY_RANK: Record<number, ScoreVerdict> = {
  1: "called_it",
  2: "close_call",
  3: "in_the_zone",
  4: "miss",
  5: "way_off",
  6: "not_even_close",
};

export const VERDICT_THRESHOLDS_BY_HORIZON: Record<string, Array<number | null>> = {
  "1w": [0.005, 0.015, 0.03, 0.06, 0.12, null],
  "1m": [0.0075, 0.025, 0.05, 0.09, 0.18, null],
  "3m": [0.01, 0.03, 0.06, 0.12, 0.24, null],
  "1y": [0.015, 0.04, 0.08, 0.16, 0.32, null],
};

export function verdictForScore(input: {
  absolutePctError: number | null | undefined;
  predictionHorizon?: string | null;
  directionCorrect?: number | null;
}): ScoreVerdict | null {
  const { absolutePctError, directionCorrect, predictionHorizon } = input;
  if (absolutePctError == null || !Number.isFinite(absolutePctError)) {
    return null;
  }

  const horizon = predictionHorizon ?? "1m";
  const thresholds = VERDICT_THRESHOLDS_BY_HORIZON[horizon] ?? VERDICT_THRESHOLDS_BY_HORIZON["1m"];
  let rank = 6;

  for (let index = 0; index < thresholds.length; index += 1) {
    const maxError = thresholds[index];
    if (maxError == null || absolutePctError <= maxError) {
      rank = index + 1;
      break;
    }
  }

  if (directionCorrect != null && directionCorrect !== 1) {
    rank = Math.min(6, rank + 1);
    if (horizon === "1w") {
      rank = Math.max(rank, 4);
    }
  }

  return VERDICT_BY_RANK[rank] ?? "not_even_close";
}

export function verdictForAbsolutePctError(absolutePctError: number | null | undefined): ScoreVerdict | null {
  return verdictForScore({ absolutePctError });
}

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

export function titleForLevel(level: number) {
  if (level >= 50) return "Market Legend";
  if (level >= 40) return "Prediction Savant";
  if (level >= 30) return "Portfolio Oracle";
  if (level >= 20) return "Veteran Forecaster";
  if (level >= 15) return "Market Tactician";
  if (level >= 10) return "Signal Hunter";
  if (level >= 5) return "Market Scout";
  return "Rookie Forecaster";
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
    .select("user_id,total_xp,level,featured_badge_slug,secondary_featured_badge_slug,equipped_title,last_event_at")
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

export async function refreshPredictionTimingEvents(): Promise<number> {
  if (!supabase) {
    return 0;
  }

  const { data, error } = await supabase.rpc("refresh_user_prediction_timing_events");

  if (error) {
    throw error;
  }

  return typeof data === "number" ? data : 0;
}

export async function fetchToastEngagementEvents(userId: string): Promise<UserEngagementEvent[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_engagement_events")
    .select("*")
    .eq("user_id", userId)
    .is("toast_seen_at", null)
    .is("seen_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .in("event_type", ["prediction_scored", "badge_unlocked", "level_reached", "prediction_due_today"])
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(12);

  if (error) {
    throw error;
  }

  return (data ?? []) as UserEngagementEvent[];
}

export async function fetchDigestEngagementEvents(userId: string): Promise<UserEngagementEvent[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_engagement_events")
    .select("*")
    .eq("user_id", userId)
    .is("digest_seen_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  return (data ?? []) as UserEngagementEvent[];
}

export async function markToastEngagementEventsSeen(eventIds: string[]) {
  if (!supabase || eventIds.length === 0) {
    return;
  }

  const { error } = await supabase.rpc("mark_user_engagement_events_toast_seen", {
    p_event_ids: eventIds,
  });

  if (error) {
    throw error;
  }
}

export async function markDigestEngagementEventsSeen(eventIds: string[]) {
  if (!supabase || eventIds.length === 0) {
    return;
  }

  const { error } = await supabase.rpc("mark_user_engagement_events_digest_seen", {
    p_event_ids: eventIds,
  });

  if (error) {
    throw error;
  }
}

export function summarizeEngagementEvents(events: UserEngagementEvent[]): EngagementSummary {
  return events.reduce(
    (summary, event) => ({
      scoredCount: summary.scoredCount + (event.event_type === "prediction_scored" ? 1 : 0),
      xpEarned: summary.xpEarned + (event.xp_amount ?? 0),
      badgeCount: summary.badgeCount + (event.event_type === "badge_unlocked" ? 1 : 0),
      levelUpCount: summary.levelUpCount + (event.event_type === "level_reached" ? 1 : 0),
      lockCount: summary.lockCount + (event.event_type === "prediction_locked" ? 1 : 0),
      maturityCount:
        summary.maturityCount +
        (event.event_type === "prediction_maturing_soon" || event.event_type === "prediction_due_today" ? 1 : 0),
      totalCount: summary.totalCount + 1,
    }),
    {
      scoredCount: 0,
      xpEarned: 0,
      badgeCount: 0,
      levelUpCount: 0,
      lockCount: 0,
      maturityCount: 0,
      totalCount: 0,
    },
  );
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
    secondary_featured_badge_slug: null,
    equipped_title: null,
    last_event_at: null,
  };
}
