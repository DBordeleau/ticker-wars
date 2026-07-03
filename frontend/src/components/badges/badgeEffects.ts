import type { BadgeDefinition } from "../../api/gamification";

// Visual effect families a badge can carry. Add a new value here, give it a
// `badge-token--fx-<name>` block in global.css (and, if it needs DOM particles
// like sparkle/flame do, render them in BadgeToken), then reference it below.
export type BadgeEffect = "glow" | "sparkle" | "holo" | "flame";

type BadgeLike = Pick<BadgeDefinition, "slug" | "rarity">;

// Per-badge VFX assignments. This is the single source of truth for which
// badges feel like trophies — extend it to make more badges exciting. Effects
// are additive: list every effect a badge should carry.
const EFFECTS_BY_SLUG: Record<string, BadgeEffect[]> = {
  champion: ["glow", "sparkle"],
  podium_finish: ["glow"],
  // Direction hot-streak badge — engulf it in flame.
  warm_hand: ["flame"],
  // Rare precision badge — give it an iridescent holographic foil.
  close_caller: ["holo"],
};

// Optional rarity-level fallback so top-tier badges can shine without a bespoke
// entry. A slug entry always wins over its rarity default. Empty for now; add a
// rarity here (e.g. legendary: ["holo"]) to give a whole tier blanket shine.
const EFFECTS_BY_RARITY: Partial<Record<BadgeDefinition["rarity"], BadgeEffect[]>> = {};

export function getBadgeEffects(badge: BadgeLike): BadgeEffect[] {
  const bySlug = EFFECTS_BY_SLUG[badge.slug];
  if (bySlug && bySlug.length > 0) {
    return bySlug;
  }
  return EFFECTS_BY_RARITY[badge.rarity] ?? [];
}

// Twinkle layout for the "sparkle" effect. Positions are relative to the badge
// pill (percentages can go negative to sparkle just outside the edges). Tweak
// or extend to change the pattern without touching component logic.
export const BADGE_SPARKLES = [
  { top: "-16%", left: "10%", size: 9, delay: 0 },
  { top: "58%", left: "-6%", size: 7, delay: 0.55 },
  { top: "-20%", left: "72%", size: 8, delay: 0.9 },
  { top: "64%", left: "86%", size: 6, delay: 1.35 },
  { top: "20%", left: "46%", size: 5, delay: 1.8 },
] as const;

// Flame tongues for the "flame" effect. `size` is the tongue width; height is
// derived in CSS. Tongues are spread along the top edge and flicker on stagger.
export const BADGE_FLAMES = [
  { left: "10%", size: 11, delay: 0 },
  { left: "33%", size: 15, delay: 0.18 },
  { left: "55%", size: 13, delay: 0.36 },
  { left: "77%", size: 10, delay: 0.12 },
] as const;
