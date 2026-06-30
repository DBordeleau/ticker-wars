import { Alert, Button, Group, Loader, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiCheck } from "react-icons/fi";
import { Navigate, useParams } from "react-router-dom";
import { fetchPublicUserProfile, updateOwnFeaturedBadges, type PublicProfilePrediction, type PublicUserBadge, type PublicUserProfileBundle } from "../api/publicProfiles";
import { dispatchProgressionRefresh, levelProgress, titleForLevel } from "../api/gamification";
import type { BadgeDefinition } from "../api/gamification";
import { fetchOwnUserPredictions, type UserPrediction } from "../api/userPredictions";
import { useAuth } from "../auth/AuthProvider";
import type { UserProfile as OwnProfile } from "../auth/types";
import BadgeToken from "../components/badges/BadgeToken";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";
import DashboardFooter from "../components/layout/DashboardFooter";
import PublicPredictionCard from "../components/predictions/PublicPredictionCard";
import UserIdentityBlock from "../components/users/UserIdentityBlock";
import { useUserProgression } from "../hooks/useUserProgression";
import { formatPercent } from "../utils/format";

export default function UserProfile() {
  const { username = "" } = useParams();
  const { user, profile } = useAuth();
  const progression = useUserProgression();
  const [bundle, setBundle] = useState<PublicUserProfileBundle | null>(null);
  const [ownPredictions, setOwnPredictions] = useState<UserPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const normalizedUsername = username.trim().toLowerCase();
  const isOwner = Boolean(profile && profile.username.toLowerCase() === normalizedUsername);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchPublicUserProfile(normalizedUsername)
      .then((nextBundle) => {
        if (active) setBundle(nextBundle);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load profile.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [normalizedUsername]);

  useEffect(() => {
    let active = true;
    if (!user || !isOwner) {
      setOwnPredictions([]);
      return undefined;
    }

    fetchOwnUserPredictions(user.id)
      .then((predictions) => {
        if (active) setOwnPredictions(predictions);
      })
      .catch(() => {
        if (active) setOwnPredictions([]);
      });

    return () => {
      active = false;
    };
  }, [isOwner, user]);

  const ownerBundle = useMemo(() => {
    if (!isOwner || !profile || !progression.progression) {
      return null;
    }
    return buildOwnerBundle(profile, progression.progression, progression.badges, ownPredictions);
  }, [isOwner, ownPredictions, profile, progression.badges, progression.progression]);

  const visibleBundle = bundle ?? ownerBundle;

  if (loading && !visibleBundle) {
    return (
      <main className="dashboard-shell profile-page">
        <BackToDashboardButton />
        <Stack align="center" py={80}>
          <Loader color="green" />
          <Text c="dimmed">Loading profile...</Text>
        </Stack>
      </main>
    );
  }

  if (error) {
    return (
      <main className="dashboard-shell profile-page">
        <BackToDashboardButton />
        <Alert color="red" icon={<FiAlertTriangle />}>{error}</Alert>
      </main>
    );
  }

  if (!visibleBundle) {
    return (
      <main className="dashboard-shell profile-page">
        <BackToDashboardButton />
        <Alert color="yellow" icon={<FiAlertTriangle />}>
          This profile is private or unavailable.
        </Alert>
      </main>
    );
  }

  const activePredictions = visibleBundle.predictions.filter((prediction) => prediction.section === "active");
  const recentPredictions = visibleBundle.predictions.filter((prediction) => prediction.section === "recent");
  const featuredBadges = getFeaturedBadges(visibleBundle.badges);

  return (
    <main className="dashboard-shell profile-page">
      <BackToDashboardButton />
      <section className="profile-hero">
        <UserIdentityBlock
          displayUsername={visibleBundle.profile.display_username}
          username={visibleBundle.profile.username}
          avatarSeed={visibleBundle.profile.avatar_seed}
          avatarOptions={visibleBundle.profile.avatar_options}
          level={visibleBundle.profile.level}
          displayTitle={titleForLevel(visibleBundle.profile.level)}
          featuredBadges={featuredBadges}
          size={74}
        />
        <ProfileStats bundle={visibleBundle} />
      </section>

      {isOwner ? (
        <ProfileIdentityControls
          badges={visibleBundle.badges}
          primaryBadgeSlug={visibleBundle.profile.featured_badge_slug}
          secondaryBadgeSlug={visibleBundle.profile.secondary_featured_badge_slug ?? null}
          onSaved={() => {
            dispatchProgressionRefresh();
            void fetchPublicUserProfile(normalizedUsername).then(setBundle);
          }}
        />
      ) : null}

      <section className="profile-section">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={2}>Badges</Title>
            <Text c="dimmed" size="sm">Unlocked achievements and titles.</Text>
          </div>
          <Text size="sm" fw={800}>{visibleBundle.badges.length.toLocaleString()} total</Text>
        </Group>
        {visibleBundle.badges.length === 0 ? (
          <Text c="dimmed" size="sm">No badges unlocked yet.</Text>
        ) : (
          <div className="profile-badge-shelf">
            {visibleBundle.badges.map((badge) => (
              <BadgeToken key={badge.badge_slug} badge={badge} featured={badge.is_featured} />
            ))}
          </div>
        )}
      </section>

      <section className="profile-section">
        <Title order={2}>On Deck</Title>
        <Text c="dimmed" size="sm">Active predictions, sorted by what matures soonest.</Text>
        {activePredictions.length === 0 ? (
          <Text c="dimmed" size="sm">No active public predictions.</Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            {activePredictions.map((prediction) => (
              <PublicPredictionCard key={prediction.prediction_id} prediction={prediction} />
            ))}
          </SimpleGrid>
        )}
      </section>

      <section className="profile-section">
        <Title order={2}>Recently Scored</Title>
        <Text c="dimmed" size="sm">Settled calls with score verdicts shown once available.</Text>
        {recentPredictions.length === 0 ? (
          <Text c="dimmed" size="sm">No scored predictions yet.</Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            {recentPredictions.map((prediction) => (
              <PublicPredictionCard key={prediction.prediction_id} prediction={prediction} />
            ))}
          </SimpleGrid>
        )}
      </section>

      <DashboardFooter metadata={null} loading={false} />
    </main>
  );
}

export function MyProfileRedirect() {
  const { profile, profileLoading } = useAuth();
  if (profileLoading) {
    return null;
  }
  if (!profile) {
    return <Navigate to="/onboarding" replace />;
  }
  return <Navigate to={`/users/${profile.username}`} replace />;
}

function ProfileStats({ bundle }: { bundle: PublicUserProfileBundle }) {
  const progress = levelProgress(bundle.profile.total_xp);

  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm" className="profile-stats">
      <ProfileStat label="XP" value={bundle.profile.total_xp.toLocaleString()} detail={`${progress.xpToNext.toLocaleString()} to next`} />
      <ProfileStat label="Scored" value={bundle.profile.scored_count.toLocaleString()} detail={`${bundle.profile.active_prediction_count} active`} />
      <ProfileStat label="Directional" value={formatPercent(bundle.profile.directional_accuracy)} detail="Hit rate" />
      <ProfileStat label="Called It" value={bundle.profile.called_it_count.toLocaleString()} detail={`${bundle.profile.close_call_or_better_count} close+`} />
    </SimpleGrid>
  );
}

function ProfileStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="profile-stat">
      <Text size="xs" c="dimmed" tt="uppercase" fw={800}>{label}</Text>
      <Text fw={900}>{value}</Text>
      <Text size="xs" c="dimmed">{detail}</Text>
    </div>
  );
}

function ProfileIdentityControls({
  badges,
  primaryBadgeSlug,
  secondaryBadgeSlug,
  onSaved,
}: {
  badges: PublicUserBadge[];
  primaryBadgeSlug: string | null;
  secondaryBadgeSlug: string | null;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [nextPrimary, setNextPrimary] = useState(primaryBadgeSlug);
  const [nextSecondary, setNextSecondary] = useState(secondaryBadgeSlug);
  const badgeOptions = badges.map((badge) => ({ value: badge.badge_slug, label: badge.name }));

  useEffect(() => {
    setNextPrimary(primaryBadgeSlug);
    setNextSecondary(secondaryBadgeSlug);
  }, [primaryBadgeSlug, secondaryBadgeSlug]);

  const handleSave = async () => {
    if (nextPrimary && nextSecondary && nextPrimary === nextSecondary) {
      notifications.show({
        color: "yellow",
        icon: <FiAlertTriangle />,
        title: "Choose two different badges",
        message: "Your primary and secondary featured badges need to be different.",
      });
      return;
    }

    setSaving(true);
    try {
      await updateOwnFeaturedBadges({ primaryBadgeSlug: nextPrimary, secondaryBadgeSlug: nextSecondary });
      notifications.show({
        color: "green",
        icon: <FiCheck />,
        title: "Profile updated",
        message: "Your featured badges are live.",
      });
      onSaved();
    } catch (caught) {
      notifications.show({
        color: "red",
        icon: <FiAlertTriangle />,
        title: "Unable to update profile",
        message: caught instanceof Error ? caught.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="profile-section profile-owner-controls">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Profile Loadout</Title>
          <Text c="dimmed" size="sm">Pick the badges people see first. Your title comes from your level.</Text>
        </div>
        <Button color="green" loading={saving} onClick={() => void handleSave()}>
          Save
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Select
          label="Primary featured badge"
          value={nextPrimary}
          clearable
          data={badgeOptions}
          onChange={setNextPrimary}
        />
        <Select
          label="Secondary featured badge"
          value={nextSecondary}
          clearable
          data={badgeOptions}
          onChange={setNextSecondary}
        />
      </SimpleGrid>
    </section>
  );
}

function buildOwnerBundle(
  profile: OwnProfile,
  progression: { level: number; total_xp: number; featured_badge_slug: string | null; secondary_featured_badge_slug?: string | null; equipped_title: string | null },
  badges: { badge_slug: string; unlocked_at: string; metadata: Record<string, unknown>; definition?: BadgeDefinition | null }[],
  predictions: UserPrediction[],
): PublicUserProfileBundle {
  const publicBadges: PublicUserBadge[] = badges
    .filter((badge): badge is typeof badge & { definition: BadgeDefinition } => Boolean(badge.definition))
    .map((badge) => ({
      ...badge.definition,
      user_id: profile.user_id,
      badge_slug: badge.badge_slug,
      unlocked_at: badge.unlocked_at,
      is_featured:
        badge.badge_slug === progression.featured_badge_slug ||
        badge.badge_slug === progression.secondary_featured_badge_slug,
      featured_slot:
        badge.badge_slug === progression.featured_badge_slug
          ? 1
          : badge.badge_slug === progression.secondary_featured_badge_slug
            ? 2
            : null,
      metadata: badge.metadata,
    }));
  const activePredictions = predictions
    .filter((prediction) => prediction.status === "pending")
    .sort((a, b) => a.target_date.localeCompare(b.target_date))
    .slice(0, 8);
  const recentPredictions = predictions
    .filter((prediction) => prediction.status === "scored")
    .sort((a, b) => (b.score?.scored_at ?? "").localeCompare(a.score?.scored_at ?? ""))
    .slice(0, 20);
  const scored = predictions.filter((prediction) => prediction.score);
  const calledItCount = scored.filter((prediction) => prediction.score?.score_verdict === "called_it").length;
  const closeOrBetterCount = scored.filter((prediction) =>
    prediction.score?.score_verdict === "called_it" || prediction.score?.score_verdict === "close_call",
  ).length;
  const directionalAccuracy =
    scored.length === 0
      ? null
      : scored.reduce((sum, prediction) => sum + (prediction.score?.direction_correct ?? 0), 0) / scored.length;

  return {
    profile: {
      user_id: profile.user_id,
      username: profile.username,
      display_username: profile.display_username,
      avatar_style: profile.avatar_style,
      avatar_seed: profile.avatar_seed,
      avatar_options: profile.avatar_options,
      level: progression.level,
      total_xp: progression.total_xp,
      featured_badge_slug: progression.featured_badge_slug,
      featured_badge_name: publicBadges.find((badge) => badge.featured_slot === 1)?.name ?? null,
      featured_badge_rarity: publicBadges.find((badge) => badge.featured_slot === 1)?.rarity ?? null,
      featured_badge_icon_name: publicBadges.find((badge) => badge.featured_slot === 1)?.icon_name ?? null,
      secondary_featured_badge_slug: progression.secondary_featured_badge_slug ?? null,
      secondary_featured_badge_name: publicBadges.find((badge) => badge.featured_slot === 2)?.name ?? null,
      secondary_featured_badge_rarity: publicBadges.find((badge) => badge.featured_slot === 2)?.rarity ?? null,
      secondary_featured_badge_icon_name: publicBadges.find((badge) => badge.featured_slot === 2)?.icon_name ?? null,
      equipped_title: null,
      badge_count: publicBadges.length,
      scored_count: scored.length,
      active_prediction_count: activePredictions.length,
      called_it_count: calledItCount,
      close_call_or_better_count: closeOrBetterCount,
      directional_accuracy: directionalAccuracy,
      average_absolute_pct_error:
        scored.length === 0
          ? null
          : scored.reduce((sum, prediction) => sum + (prediction.score?.absolute_pct_error ?? 0), 0) / scored.length,
      signature_ticker: null,
      best_score_verdict: null,
      best_score_verdict_rank: null,
      last_prediction_at: predictions[0]?.prediction_date ?? null,
      last_scored_at: scored[0]?.score?.scored_at ?? null,
      updated_at: new Date().toISOString(),
    },
    badges: publicBadges,
    predictions: [
      ...activePredictions.map((prediction, index) => convertOwnPrediction(prediction, "active", index + 1)),
      ...recentPredictions.map((prediction, index) => convertOwnPrediction(prediction, "recent", index + 1)),
    ],
  };
}

function getFeaturedBadges(badges: PublicUserBadge[]) {
  const slottedBadges = badges
    .filter((badge) => badge.featured_slot === 1 || badge.featured_slot === 2)
    .sort((a, b) => (a.featured_slot ?? 99) - (b.featured_slot ?? 99));

  if (slottedBadges.length > 0) {
    return slottedBadges;
  }

  const legacyFeatured = badges.filter((badge) => badge.is_featured);
  return legacyFeatured.length > 0 ? legacyFeatured.slice(0, 2) : badges.slice(0, 2);
}

function convertOwnPrediction(
  prediction: UserPrediction,
  section: "active" | "recent",
  displayOrder: number,
): PublicProfilePrediction {
  const hidden = prediction.status === "pending" && prediction.hide_details_until_scored;
  return {
    prediction_id: prediction.prediction_id,
    user_id: prediction.user_id,
    section,
    display_order: displayOrder,
    ticker: prediction.ticker,
    prediction_date: prediction.prediction_date,
    target_date: prediction.target_date,
    prediction_horizon: prediction.prediction_horizon,
    reference_close: prediction.reference_close,
    predicted_return: hidden ? null : prediction.predicted_return,
    predicted_close: hidden ? null : prediction.predicted_close,
    status: prediction.status,
    public_details_hidden: hidden,
    actual_close: prediction.score?.actual_close ?? null,
    actual_return: prediction.score?.actual_return ?? null,
    absolute_error: prediction.score?.absolute_error ?? null,
    absolute_pct_error: prediction.score?.absolute_pct_error ?? null,
    direction_correct: prediction.score?.direction_correct ?? null,
    score_verdict: prediction.score?.score_verdict ?? null,
    score_verdict_rank: prediction.score?.score_verdict_rank ?? null,
    score_verdict_color: prediction.score?.score_verdict_color ?? null,
    xp_awarded: prediction.score?.xp_awarded ?? null,
    scored_at: prediction.score?.scored_at ?? null,
    created_at: prediction.created_at,
    updated_at: prediction.updated_at,
  };
}
