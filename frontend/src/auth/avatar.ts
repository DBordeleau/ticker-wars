import type { AvatarOptions, UserProfile } from "./types";

export const defaultAvatarOptions: AvatarOptions = {
  eyebrowsVariant: "variant01",
  eyesVariant: "variant01",
  glassesVariant: "variant01",
  glassesProbability: 0,
  mouthVariant: "variant01",
  backgroundColor: "f2d3b1",
  scale: 1,
  rotate: 0,
};

export const avatarSkinColors = [
  "f2d3b1",
  "ecad80",
  "9e5622",
  "763900",
  "422828",
  "211414",
  "f8e4f8",
];

export function normalizeAvatarOptions(options?: Partial<AvatarOptions> | null): AvatarOptions {
  return {
    ...defaultAvatarOptions,
    ...(options ?? {}),
  };
}

export function avatarSeedFromUsername(username: string) {
  return username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-") || crypto.randomUUID();
}

export function buildDiceBearAvatarUrl(
  profileOrSeed: Pick<UserProfile, "avatar_seed" | "avatar_options"> | string,
  options?: Partial<AvatarOptions>,
) {
  const seed = typeof profileOrSeed === "string" ? profileOrSeed : profileOrSeed.avatar_seed;
  const avatarOptions = normalizeAvatarOptions(
    typeof profileOrSeed === "string" ? options : profileOrSeed.avatar_options,
  );
  const params = new URLSearchParams();
  const stableOptions: Record<string, string | number> = {
    backgroundColor: avatarOptions.backgroundColor,
    borderRadius: 50,
    eyebrowsProbability: 100,
    eyebrowsVariant: avatarOptions.eyebrowsVariant,
    eyesProbability: 100,
    eyesVariant: avatarOptions.eyesVariant,
    glassesProbability: avatarOptions.glassesProbability,
    glassesVariant: avatarOptions.glassesVariant,
    mouthProbability: 100,
    mouthVariant: avatarOptions.mouthVariant,
    rotate: avatarOptions.rotate,
    scale: avatarOptions.scale,
    seed,
  };

  Object.keys(stableOptions)
    .sort()
    .forEach((key) => params.set(key, String(stableOptions[key])));

  return `https://api.dicebear.com/10.x/adventurer-neutral/svg?${params.toString()}`;
}

// Variant counts for adventurer-neutral (mirrors the avatar editor's fallback
// metadata in AvatarEditor.tsx).
const adventurerNeutralVariantCounts = {
  eyebrows: 15,
  eyes: 26,
  glasses: 5,
  mouth: 30,
};

function variantName(index: number) {
  return `variant${String(index + 1).padStart(2, "0")}`;
}

// FNV-1a hash -> mulberry32 PRNG: deterministic pseudo-randomness from a string
// seed, so generated avatars are identical between visits (stable, cacheable URLs).
function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic avatar options derived from a seed, spanning the same space a
// user can pick in the editor: all variants, glasses 50/50, scale 0.8-1.6,
// rotate -20..20, and ANY background color (like the editor's custom color
// picker). Deterministic so the resulting DiceBear URLs are stable/cacheable.
export function avatarOptionsFromSeed(seed: string): AvatarOptions {
  const rand = mulberry32(hashSeed(seed));
  const pick = (count: number) => variantName(Math.floor(rand() * count));
  const scaleSteps = Math.round((1.6 - 0.8) / 0.05);
  const rotateSteps = 40; // -20..20, step 1

  return normalizeAvatarOptions({
    eyebrowsVariant: pick(adventurerNeutralVariantCounts.eyebrows),
    eyesVariant: pick(adventurerNeutralVariantCounts.eyes),
    glassesVariant: pick(adventurerNeutralVariantCounts.glasses),
    glassesProbability: rand() >= 0.5 ? 100 : 0,
    mouthVariant: pick(adventurerNeutralVariantCounts.mouth),
    backgroundColor: Math.floor(rand() * 0xffffff)
      .toString(16)
      .padStart(6, "0"),
    scale: Number((0.8 + Math.floor(rand() * (scaleSteps + 1)) * 0.05).toFixed(2)),
    rotate: -20 + Math.floor(rand() * (rotateSteps + 1)),
  });
}

