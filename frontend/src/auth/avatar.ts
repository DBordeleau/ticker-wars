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

