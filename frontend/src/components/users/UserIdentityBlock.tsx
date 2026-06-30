import { Group, Text } from "@mantine/core";
import type { AvatarOptions } from "../../auth/types";
import AvatarImage from "./AvatarImage";
import BadgeToken from "../badges/BadgeToken";

type FeaturedBadge = {
  slug: string;
  name: string;
  description: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  icon_name: string;
  title_unlock?: string | null;
};

type Props = {
  displayUsername: string;
  username?: string;
  avatarSeed: string;
  avatarOptions: AvatarOptions;
  level?: number;
  displayTitle?: string | null;
  featuredBadge?: FeaturedBadge | null;
  featuredBadges?: FeaturedBadge[];
  size?: number;
  compact?: boolean;
  badgePresentation?: "compact" | "full" | "none";
};

export default function UserIdentityBlock({
  displayUsername,
  username,
  avatarSeed,
  avatarOptions,
  level,
  displayTitle,
  featuredBadge,
  featuredBadges,
  size = 44,
  compact = false,
  badgePresentation = "compact",
}: Props) {
  const badges = featuredBadges ?? (featuredBadge ? [featuredBadge] : []);

  return (
    <Group gap="sm" wrap="nowrap" className="user-identity-block">
      <AvatarImage
        profile={{
          display_username: displayUsername,
          avatar_seed: avatarSeed,
          avatar_options: avatarOptions,
        }}
        size={size}
      />
      <div className="user-identity-copy">
        <Group gap="xs" wrap="nowrap">
          <Text fw={850} className="user-identity-name">
            {displayUsername}
          </Text>
          {level ? <span className="user-identity-level">Lvl {level}</span> : null}
        </Group>
        {compact ? null : (
          <>
            <Group gap="xs" wrap="nowrap" className="user-identity-meta">
              {displayTitle ? <span>{displayTitle}</span> : username ? <span>@{username}</span> : null}
              {badgePresentation === "compact"
                ? badges.map((badge) => <BadgeToken key={badge.slug} badge={badge} compact featured />)
                : null}
            </Group>
            {badges.length > 0 && badgePresentation === "full" ? (
              <div className="user-identity-featured-badge">
                {badges.map((badge) => (
                  <BadgeToken key={badge.slug} badge={badge} featured />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </Group>
  );
}
