import { Avatar } from "@mantine/core";
import { buildDiceBearAvatarUrl } from "../../auth/avatar";
import type { AvatarOptions, UserProfile } from "../../auth/types";

type Props = {
  profile?: Pick<UserProfile, "avatar_seed" | "avatar_options" | "display_username"> | null;
  seed?: string;
  options?: Partial<AvatarOptions>;
  size?: number | string;
  className?: string;
};

export default function AvatarImage({ profile, seed, options, size = 48, className }: Props) {
  const src = profile
    ? buildDiceBearAvatarUrl(profile)
    : buildDiceBearAvatarUrl(seed ?? "ticker-wars", options);
  const alt = profile?.display_username ? `${profile.display_username} avatar` : "User avatar";

  return <Avatar src={src} alt={alt} size={size} radius="xl" className={className} />;
}

