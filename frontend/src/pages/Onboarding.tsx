import { Alert, Button, Card, Group, Loader, Select, SimpleGrid, Stack, Switch, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiCheck } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import { updateOwnFeaturedBadges } from "../api/publicProfiles";
import { dispatchProgressionRefresh, type BadgeDefinition, type UserBadge } from "../api/gamification";
import { avatarSeedFromUsername, defaultAvatarOptions, normalizeAvatarOptions } from "../auth/avatar";
import { isUsernameAvailable, saveProfile } from "../auth/authApi";
import { useAuth } from "../auth/AuthProvider";
import type { AvatarOptions } from "../auth/types";
import BadgeToken from "../components/badges/BadgeToken";
import { useUserProgression } from "../hooks/useUserProgression";
import AvatarEditor from "../components/users/AvatarEditor";
import SignInModal from "../components/users/SignInModal";
import { formatDate, formatHorizon } from "../utils/format";

type BadgeSelectOption = {
  value: string;
  label: string;
  badge: BadgeDefinition;
  unlockedAt: string;
  unlockContext: string;
};

export default function Onboarding() {
  const { user, profile, loading, profileLoading, setProfile } = useAuth();
  const progression = useUserProgression();
  const [signInOpen, setSignInOpen] = useState(false);
  const [displayUsername, setDisplayUsername] = useState(profile?.display_username ?? "");
  const [isPublic, setIsPublic] = useState(profile?.is_public ?? true);
  const [avatarOptions, setAvatarOptions] = useState<AvatarOptions>(
    normalizeAvatarOptions(profile?.avatar_options ?? defaultAvatarOptions),
  );
  const [nextPrimaryBadge, setNextPrimaryBadge] = useState<string | null>(null);
  const [nextSecondaryBadge, setNextSecondaryBadge] = useState<string | null>(null);
  const [usernameAvailability, setUsernameAvailability] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [usernameCheckError, setUsernameCheckError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const userId = user?.id;
  const usernameFormatError = getUsernameError(displayUsername);
  const normalizedUsername = displayUsername.trim().toLowerCase();
  const isExistingUsername = normalizedUsername === (profile?.username ?? "").toLowerCase();
  const usernameError =
    usernameFormatError ??
    (usernameAvailability === "taken" ? "That username is already taken." : null) ??
    usernameCheckError;
  const avatarSeed = useMemo(
    () => profile?.avatar_seed ?? avatarSeedFromUsername(displayUsername || userId || "ticker-wars"),
    [displayUsername, profile?.avatar_seed, userId],
  );
  const badgeOptions = useMemo(
    () =>
      progression.badges
        .filter((badge): badge is UserBadge & { definition: BadgeDefinition } => Boolean(badge.definition))
        .map((badge) => ({
          value: badge.badge_slug,
          label: badge.definition.name,
          badge: badge.definition,
          unlockedAt: badge.unlocked_at,
          unlockContext: badgeUnlockContext(badge),
        }))
        .sort((a, b) => {
          const sortOrder = a.badge.sort_order - b.badge.sort_order;
          if (sortOrder !== 0) {
            return sortOrder;
          }
          return a.label.localeCompare(b.label);
        }),
    [progression.badges],
  );
  const badgesBySlug = useMemo(
    () => new Map(badgeOptions.map((option) => [option.value, option])),
    [badgeOptions],
  );
  const selectedPrimaryBadge = nextPrimaryBadge ? badgesBySlug.get(nextPrimaryBadge) : null;
  const selectedSecondaryBadge = nextSecondaryBadge ? badgesBySlug.get(nextSecondaryBadge) : null;
  const duplicateBadgeSelection =
    Boolean(nextPrimaryBadge && nextSecondaryBadge) && nextPrimaryBadge === nextSecondaryBadge;

  useEffect(() => {
    if (profile) {
      setDisplayUsername(profile.display_username);
      setIsPublic(profile.is_public);
      setAvatarOptions(normalizeAvatarOptions(profile.avatar_options));
    }
  }, [profile]);

  useEffect(() => {
    if (progression.progression) {
      setNextPrimaryBadge(progression.progression.featured_badge_slug);
      setNextSecondaryBadge(progression.progression.secondary_featured_badge_slug ?? null);
    }
  }, [progression.progression]);

  useEffect(() => {
    if (!userId || usernameFormatError) {
      setUsernameAvailability("idle");
      setUsernameCheckError(null);
      return;
    }

    if (isExistingUsername) {
      setUsernameAvailability("available");
      setUsernameCheckError(null);
      return;
    }

    let isCurrent = true;
    setUsernameAvailability("checking");
    setUsernameCheckError(null);

    const timeout = window.setTimeout(() => {
      isUsernameAvailable(displayUsername, userId)
        .then((available) => {
          if (isCurrent) {
            setUsernameAvailability(available ? "available" : "taken");
          }
        })
        .catch(() => {
          if (isCurrent) {
            setUsernameAvailability("idle");
            setUsernameCheckError("Could not verify username availability. Try again.");
          }
        });
    }, 350);

    return () => {
      isCurrent = false;
      window.clearTimeout(timeout);
    };
  }, [displayUsername, isExistingUsername, userId, usernameFormatError]);

  const canSave = Boolean(
    user &&
    !usernameError &&
    usernameAvailability !== "checking" &&
    !duplicateBadgeSelection,
  );

  const handleCancel = () => {
    // Discard any unsaved edits so reopening the editor shows the saved avatar.
    if (profile) {
      setDisplayUsername(profile.display_username);
      setIsPublic(profile.is_public);
      setAvatarOptions(normalizeAvatarOptions(profile.avatar_options));
      setNextPrimaryBadge(progression.progression?.featured_badge_slug ?? null);
      setNextSecondaryBadge(progression.progression?.secondary_featured_badge_slug ?? null);
    } else {
      setDisplayUsername("");
      setIsPublic(true);
      setAvatarOptions(normalizeAvatarOptions(defaultAvatarOptions));
      setNextPrimaryBadge(null);
      setNextSecondaryBadge(null);
    }
    const nextPath = (location.state as { from?: string } | null)?.from ?? "/dashboard";
    navigate(nextPath === "/onboarding" ? "/dashboard" : nextPath);
  };

  const handleSubmit = async () => {
    if (!user || usernameFormatError || duplicateBadgeSelection) {
      if (duplicateBadgeSelection) {
        notifications.show({
          color: "yellow",
          icon: <FiAlertTriangle />,
          title: "Choose two different badges",
          message: "Your primary and secondary featured badges need to be different.",
        });
      }
      return;
    }

    setSaving(true);
    try {
      const available = isExistingUsername || (await isUsernameAvailable(displayUsername, user.id));
      if (!available) {
        setUsernameAvailability("taken");
        return;
      }

      const nextProfile = await saveProfile({
        userId: user.id,
        displayUsername,
        isPublic,
        avatarSeed,
        avatarOptions,
      });
      await updateOwnFeaturedBadges({
        primaryBadgeSlug: nextPrimaryBadge,
        secondaryBadgeSlug: nextSecondaryBadge,
      });
      setProfile(nextProfile);
      await progression.refetch();
      dispatchProgressionRefresh();
      notifications.show({
        color: "green",
        icon: <FiCheck />,
        title: "Profile saved",
        message: "Profile and loadout saved.",
      });
      const nextPath = (location.state as { from?: string } | null)?.from ?? "/dashboard";
      navigate(nextPath === "/onboarding" ? "/dashboard" : nextPath, { replace: true });
    } catch (caught) {
      notifications.show({
        color: "red",
        icon: <FiAlertTriangle />,
        title: "Profile could not be saved",
        message: caught instanceof Error ? caught.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || profileLoading) {
    return (
      <main className="dashboard-shell detail-page">
        <Card className="model-hero">
          <Text fw={800}>Loading profile</Text>
        </Card>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="dashboard-shell detail-page">
        <Card className="model-hero onboarding-card">
          <Stack gap="md">
            <Title order={1}>Create your contender</Title>
            <Text className="model-description">Sign in with a social account to start your profile.</Text>
            <Group>
              <Button color="green" onClick={() => setSignInOpen(true)}>
                Sign in
              </Button>
            </Group>
          </Stack>
        </Card>
        <SignInModal opened={signInOpen} onClose={() => setSignInOpen(false)} />
      </main>
    );
  }

  return (
    <main className="dashboard-shell detail-page">
      <Card className="model-hero onboarding-card">
        <Stack gap="lg">
          <div>
            <Title order={1}>{profile ? "Edit profile" : "Create your profile"}</Title>
          </div>
          <TextInput
            label="Username"
            value={displayUsername}
            error={usernameError}
            rightSection={usernameAvailability === "checking" ? <Loader size="xs" /> : null}
            description={
              usernameAvailability === "available" && !isExistingUsername ? "Username is available." : undefined
            }
            maxLength={24}
            onChange={(event) => setDisplayUsername(event.currentTarget.value)}
          />
          <Switch
            checked={isPublic}
            onChange={(event) => setIsPublic(event.currentTarget.checked)}
            label="I want my profile to be publicly visible and appear on the live leaderboard."
            color="green"
          />
          {!isPublic ? (
            <Alert color="yellow" icon={<FiAlertTriangle />}>
              Private profiles stay out of leaderboards and latest user predictions.
            </Alert>
          ) : null}
          <section className="profile-loadout-editor">
            <div>
              <Title order={2}>Featured Badges</Title>
              {progression.loading ? (
                <Group gap="sm">
                  <Loader size="sm" color="green" />
                  <Text size="sm" c="dimmed">Loading badges...</Text>
                </Group>
              ) : badgeOptions.length === 0 ? (
                <Text size="sm" c="dimmed">Unlocked badges will appear here once you earn them.</Text>
              ) : (
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  <Select
                    label="Primary featured badge"
                    value={nextPrimaryBadge}
                    clearable
                    data={badgeOptions}
                    searchable
                    maxDropdownHeight={420}
                    comboboxProps={{ withinPortal: true }}
                    nothingFoundMessage="No unlocked badges match that search."
                    renderOption={({ option, checked }) => (
                      <BadgeSelectOptionRow option={option as BadgeSelectOption} checked={checked} />
                    )}
                    error={duplicateBadgeSelection ? "Choose a different badge." : null}
                    onChange={setNextPrimaryBadge}
                  />
                  <Select
                    label="Secondary featured badge"
                    value={nextSecondaryBadge}
                    clearable
                    data={badgeOptions}
                    searchable
                    maxDropdownHeight={420}
                    comboboxProps={{ withinPortal: true }}
                    nothingFoundMessage="No unlocked badges match that search."
                    renderOption={({ option, checked }) => (
                      <BadgeSelectOptionRow option={option as BadgeSelectOption} checked={checked} />
                    )}
                    error={duplicateBadgeSelection ? "Choose a different badge." : null}
                    onChange={setNextSecondaryBadge}
                  />
                </SimpleGrid>
              )}
              {selectedPrimaryBadge || selectedSecondaryBadge ? (
                <div className="badge-loadout-preview" aria-label="Selected featured badges">
                  {selectedPrimaryBadge ? <SelectedBadgePreview label="Primary" option={selectedPrimaryBadge} /> : null}
                  {selectedSecondaryBadge ? (
                    <SelectedBadgePreview label="Secondary" option={selectedSecondaryBadge} />
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
          <AvatarEditor seed={avatarSeed} value={avatarOptions} onChange={setAvatarOptions} />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" disabled={saving} onClick={handleCancel}>
              Cancel
            </Button>
            <Button color="green" disabled={!canSave} loading={saving} onClick={() => void handleSubmit()}>
              Save profile
            </Button>
          </Group>
        </Stack>
      </Card>
    </main>
  );
}

function BadgeSelectOptionRow({ option, checked }: { option: BadgeSelectOption; checked?: boolean }) {
  return (
    <div className="badge-select-option">
      <BadgeToken badge={option.badge} compact className="badge-select-option-token" />
      <div className="badge-select-option-copy">
        <Group gap={6} wrap="nowrap">
          <Text className="badge-select-option-title">{option.label}</Text>
          <span className={`badge-select-option-rarity badge-select-option-rarity--${option.badge.rarity}`}>
            {option.badge.rarity}
          </span>
        </Group>
        <Text className="badge-select-option-detail">{option.unlockContext}</Text>
        <Text className="badge-select-option-unlocked">Earned {formatDate(option.unlockedAt)}</Text>
      </div>
      {checked ? (
        <span className="badge-select-option-check" aria-hidden>
          <FiCheck />
        </span>
      ) : null}
    </div>
  );
}

function SelectedBadgePreview({ label, option }: { label: string; option: BadgeSelectOption }) {
  return (
    <div className="badge-loadout-preview-item">
      <Text className="badge-loadout-preview-label">{label}</Text>
      <BadgeToken badge={option.badge} />
    </div>
  );
}

function badgeUnlockContext(badge: UserBadge & { definition: BadgeDefinition }) {
  const triggerText = triggerUnlockText(badge);
  if (triggerText) {
    return triggerText;
  }

  const metadataText = metadataUnlockText(badge.metadata);
  if (metadataText) {
    return metadataText;
  }

  if (badge.definition.description) {
    return badge.definition.description;
  }

  if (badge.source_prediction_id) {
    return "Unlocked from a scored prediction.";
  }

  return "Unlocked through prediction activity.";
}

function triggerUnlockText(badge: UserBadge & { definition: BadgeDefinition }) {
  const metadata = badge.metadata ?? {};
  const trigger = stringMetadata(metadata, "trigger");
  const rank = numberMetadata(metadata, "rank");
  const horizon = stringMetadata(metadata, "prediction_horizon");
  const evaluationWindow = stringMetadata(metadata, "evaluation_window");
  const boardContext = leaderboardContext(rank, horizon, evaluationWindow);

  if (trigger === "leaderboard_champion") {
    return `Finished first${boardContext}.`;
  }
  if (trigger === "leaderboard_podium") {
    return `Finished ${rank ? ordinal(rank) : "top three"}${boardContext}.`;
  }
  if (trigger === "leaderboard_rank") {
    return `Appeared on a public leaderboard${boardContext}.`;
  }
  if (trigger === "prediction_submitted") {
    return "Made your first prediction after progression launched.";
  }

  const closeOrBetterCount = numberMetadata(metadata, "close_or_better_count");
  if (closeOrBetterCount) {
    return `Earned ${closeOrBetterCount.toLocaleString()} Close call or better verdicts.`;
  }

  const distinctTickers = numberMetadata(metadata, "distinct_tickers");
  if (distinctTickers) {
    return `Made predictions on ${distinctTickers.toLocaleString()} different tickers.`;
  }

  const activeHorizons = numberMetadata(metadata, "active_horizons");
  if (activeHorizons) {
    return `Held active predictions across ${activeHorizons.toLocaleString()} horizons at once.`;
  }

  const directionHits = numberMetadata(metadata, "direction_hits");
  if (directionHits) {
    return `Hit the correct direction on ${directionHits.toLocaleString()} newly scored predictions in a row.`;
  }

  const scoreVerdict = stringMetadata(metadata, "score_verdict");
  if (scoreVerdict === "called_it") {
    return "Earned a Called it verdict on a scored prediction.";
  }

  const scoredHorizon = stringMetadata(metadata, "horizon");
  if (scoredHorizon) {
    return `Scored a ${formatHorizon(scoredHorizon)} prediction.`;
  }

  return null;
}

function metadataUnlockText(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) {
    return null;
  }

  for (const key of ["unlock_reason", "reason", "headline", "description", "label"]) {
    const value = stringMetadata(metadata, key);
    if (value && looksLikeDisplayText(value)) {
      return value;
    }
  }

  return null;
}

function leaderboardContext(rank: number | null, horizon: string | null, evaluationWindow: string | null) {
  const parts = [
    rank ? `ranked ${ordinal(rank)}` : null,
    horizon ? `${formatHorizon(horizon)} horizon` : null,
    evaluationWindow ? `${formatEvaluationWindow(evaluationWindow)} window` : null,
  ].filter(Boolean);

  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function ordinal(value: number) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) {
    return `${value}th`;
  }
  const suffix = value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

function formatEvaluationWindow(value: string) {
  if (value === "7d") return "7D";
  if (value === "30d") return "30D";
  if (value === "90d") return "90D";
  if (value === "all") return "All-time";
  return value.toUpperCase();
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function looksLikeDisplayText(value: string) {
  return /[\s.,!?-]/.test(value) && !/^[a-z0-9_]+$/i.test(value);
}

function getUsernameError(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Choose a username.";
  }
  if (!/^[A-Za-z0-9_-]{3,24}$/.test(trimmed)) {
    return "Use 3-24 letters, numbers, underscores, or hyphens.";
  }
  return null;
}
