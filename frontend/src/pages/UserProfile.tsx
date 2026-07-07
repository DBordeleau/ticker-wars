import { Alert, Button, Group, Loader, Modal, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiCheck, FiTrash2, FiX } from "react-icons/fi";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  fetchPublicUserProfile,
  resolvePublicProfileVerdictCounts,
  type PublicProfilePrediction,
  type PublicUserBadge,
  type PublicUserProfileBundle,
} from "../api/publicProfiles";
import { fetchUserTickerSpecialties, type TickerSpecialtyRow } from "../api/competition";
import { resetDashboardCache } from "../api/dashboardStore";
import { dispatchProgressionRefresh, titleForLevel } from "../api/gamification";
import type { BadgeDefinition, ScoreVerdict } from "../api/gamification";
import { fetchOwnUserPredictions, type UserPrediction } from "../api/userPredictions";
import { useAuth } from "../auth/AuthProvider";
import { clearLocalAuthSession, deleteOwnAccount } from "../auth/authApi";
import type { UserProfile as OwnProfile } from "../auth/types";
import BadgeToken from "../components/badges/BadgeToken";
import TickerSpecialtyCard from "../components/competition/TickerSpecialtyCard";
import AnimatedSection from "../components/layout/AnimatedSection";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";
import DashboardFooter from "../components/layout/DashboardFooter";
import MagicHoverSurface from "../components/layout/MagicHoverSurface";
import PublicPredictionCard from "../components/predictions/PublicPredictionCard";
import PublicScoreBreakdownDrawer from "../components/predictions/PublicScoreBreakdownDrawer";
import UserIdentityBlock from "../components/users/UserIdentityBlock";
import UserVerdictBreakdown from "../components/users/UserVerdictBreakdown";
import { useDashboardData } from "../hooks/useDashboardData";
import { useTickerDisplayPrices } from "../hooks/useTickerDisplayPrices";
import { useUserProgression } from "../hooks/useUserProgression";

export default function UserProfile() {
  const { username = "" } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const dashboard = useDashboardData();
  const progression = useUserProgression();
  const [bundle, setBundle] = useState<PublicUserProfileBundle | null>(null);
  const [ownPredictions, setOwnPredictions] = useState<UserPrediction[]>([]);
  const [tickerSpecialties, setTickerSpecialties] = useState<TickerSpecialtyRow[]>([]);
  const [selectedScore, setSelectedScore] = useState<PublicProfilePrediction | null>(null);
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

  useEffect(() => {
    let active = true;
    if (!visibleBundle?.profile.user_id) {
      setTickerSpecialties([]);
      return undefined;
    }

    fetchUserTickerSpecialties(visibleBundle.profile.user_id)
      .then((rows) => {
        if (active) setTickerSpecialties(rows);
      })
      .catch(() => {
        if (active) setTickerSpecialties([]);
      });

    return () => {
      active = false;
    };
  }, [visibleBundle?.profile.user_id]);

  const profilePredictions = visibleBundle?.predictions ?? [];
  const activePredictions = profilePredictions.filter((prediction) => prediction.section === "active");
  const recentPredictions = profilePredictions.filter((prediction) => prediction.section === "recent");
  const latestPredictions = visibleBundle?.latestPredictions ?? [];
  const displayPriceTickers = [
    ...activePredictions.map((prediction) => prediction.ticker),
    ...latestPredictions.filter((prediction) => prediction.status === "pending").map((prediction) => prediction.ticker),
  ];
  const displayPrices = useTickerDisplayPrices(displayPriceTickers, { enabled: displayPriceTickers.length > 0 });

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

  const featuredBadges = getFeaturedBadges(visibleBundle.badges);
  const tickerLogos = Object.fromEntries(
    dashboard.tickerAssets.map((asset) => [asset.ticker, asset.logo_data_url]),
  );

  return (
    <main className="dashboard-shell profile-page">
      <BackToDashboardButton />
      <AnimatedSection delay={0}>
        <MagicHoverSurface className="section-magic-surface">
          <section className="section-panel profile-hero">
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
            <UserVerdictBreakdown
              activeCount={visibleBundle.profile.active_prediction_count}
              settledCount={visibleBundle.profile.scored_count}
              verdictCounts={resolvePublicProfileVerdictCounts(visibleBundle)}
              variant="profile"
            />
          </section>
        </MagicHoverSurface>
      </AnimatedSection>

      <AnimatedSection delay={isOwner ? 0.16 : 0.08}>
        <MagicHoverSurface className="section-magic-surface">
          <section className="section-panel profile-section">
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
        </MagicHoverSurface>
      </AnimatedSection>

      {tickerSpecialties.length > 0 ? (
        <AnimatedSection delay={isOwner ? 0.24 : 0.16}>
          <MagicHoverSurface className="section-magic-surface">
            <section className="section-panel profile-section">
              <Title order={2}>Ticker Specialties</Title>
              <Text c="dimmed" size="sm">Tickers where this profile has enough scored predictions to stand out.</Text>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                {tickerSpecialties.map((specialty) => (
                  <TickerSpecialtyCard key={specialty.ticker} specialty={specialty} mode="user" />
                ))}
              </SimpleGrid>
            </section>
          </MagicHoverSurface>
        </AnimatedSection>
      ) : null}

      <AnimatedSection delay={tickerSpecialties.length > 0 ? (isOwner ? 0.32 : 0.24) : (isOwner ? 0.24 : 0.16)}>
        <MagicHoverSurface className="section-magic-surface">
          <section className="section-panel profile-section">
            <Title order={2}>On the Horizon</Title>
            <Text c="dimmed" size="sm">Active predictions, sorted by what matures soonest.</Text>
            {activePredictions.length === 0 ? (
              <Text c="dimmed" size="sm">No active public predictions.</Text>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                {activePredictions.map((prediction) => (
                  <PublicPredictionCard
                    key={prediction.prediction_id}
                    prediction={prediction}
                    tickerLogos={tickerLogos}
                    displayPrice={displayPrices.prices[prediction.ticker]}
                  />
                ))}
              </SimpleGrid>
            )}
          </section>
        </MagicHoverSurface>
      </AnimatedSection>

      {latestPredictions.length > 0 ? (
        <AnimatedSection delay={tickerSpecialties.length > 0 ? (isOwner ? 0.4 : 0.32) : (isOwner ? 0.32 : 0.24)}>
          <MagicHoverSurface className="section-magic-surface">
            <section className="section-panel profile-section">
              <Group justify="space-between" align="flex-end">
                <div>
                  <Title order={2}>Latest Predictions</Title>
                  <Text c="dimmed" size="sm">This profile's most recent public calls.</Text>
                </div>
                <Text size="sm" fw={800}>{latestPredictions.length.toLocaleString()} recent</Text>
              </Group>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                {latestPredictions.slice(0, 8).map((prediction) => (
                  <PublicPredictionCard
                    key={`latest-${prediction.prediction_id}`}
                    prediction={prediction}
                    tickerLogos={tickerLogos}
                    displayPrice={displayPrices.prices[prediction.ticker]}
                    onScoreClick={setSelectedScore}
                  />
                ))}
              </SimpleGrid>
            </section>
          </MagicHoverSurface>
        </AnimatedSection>
      ) : null}

      <AnimatedSection delay={tickerSpecialties.length > 0 ? (isOwner ? 0.4 : 0.32) : (isOwner ? 0.32 : 0.24)}>
        <MagicHoverSurface className="section-magic-surface">
          <section className="section-panel profile-section">
            <Title order={2}>Recently Scored</Title>
            <Text c="dimmed" size="sm">Settled predictions with score verdicts shown once available.</Text>
            {recentPredictions.length === 0 ? (
              <Text c="dimmed" size="sm">No scored predictions yet.</Text>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                {recentPredictions.map((prediction) => (
                  <PublicPredictionCard
                    key={prediction.prediction_id}
                    prediction={prediction}
                    tickerLogos={tickerLogos}
                    onScoreClick={setSelectedScore}
                  />
                ))}
              </SimpleGrid>
            )}
          </section>
        </MagicHoverSurface>
      </AnimatedSection>

      <PublicScoreBreakdownDrawer
        prediction={selectedScore}
        opened={Boolean(selectedScore)}
        onClose={() => setSelectedScore(null)}
      />
      {isOwner ? (
        <AnimatedSection delay={tickerSpecialties.length > 0 ? 0.48 : 0.4}>
          <DeleteAccountControl
            profile={profile}
            onDeleted={() => navigate("/", { replace: true })}
          />
        </AnimatedSection>
      ) : null}
      <AnimatedSection delay={tickerSpecialties.length > 0 ? (isOwner ? 0.56 : 0.4) : (isOwner ? 0.48 : 0.32)}>
        <DashboardFooter metadata={dashboard.metadata} loading={dashboard.loading} />
      </AnimatedSection>
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

function DeleteAccountControl({
  profile,
  onDeleted,
}: {
  profile: OwnProfile | null;
  onDeleted: () => void;
}) {
  const { setProfile } = useAuth();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const expectedUsername = profile?.display_username ?? profile?.username ?? "";
  const deleteEnabled =
    Boolean(expectedUsername) && deleteConfirmation.trim().toLowerCase() === expectedUsername.trim().toLowerCase();

  const handleDelete = async () => {
    if (!deleteEnabled) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteOwnAccount(deleteConfirmation);
      resetDashboardCache();
      dispatchProgressionRefresh();
      setProfile(null);
      await clearLocalAuthSession().catch(() => undefined);
      notifications.show({
        color: "green",
        icon: <FiCheck />,
        title: "Account deleted",
        message: "Your profile, predictions, progression, and sign-in account were removed.",
      });
      onDeleted();
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "Unable to delete your account. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const closeModal = () => {
    if (deleting) {
      return;
    }
    setDeleteModalOpen(false);
    setDeleteError(null);
    setDeleteConfirmation("");
  };

  return (
    <>
      <div className="profile-delete-account-row">
        <Button
          color="red"
          variant="subtle"
          leftSection={<FiTrash2 />}
          className="profile-delete-account-button"
          onClick={() => setDeleteModalOpen(true)}
        >
          Delete account
        </Button>
      </div>

      <Modal
        opened={deleteModalOpen}
        onClose={closeModal}
        centered
        className="auth-modal delete-account-modal"
        withCloseButton={false}
        padding={0}
        radius="sm"
        overlayProps={{ backgroundOpacity: 0.5, blur: 8 }}
        transitionProps={{ transition: "pop", duration: 180 }}
      >
        <MagicHoverSurface className="auth-modal-surface delete-account-surface">
          <button type="button" className="auth-modal-close" aria-label="Close delete account modal" onClick={closeModal}>
            <FiX />
          </button>
          <Stack gap="md" className="delete-account-modal-body">
            <div className="delete-account-modal-heading">
              <span className="delete-account-icon" aria-hidden>
                <FiTrash2 />
              </span>
              <div>
                <Title order={2}>Delete account</Title>
                <Text>
                  This permanently removes your Ticker Wars account and all user-owned data.
                </Text>
              </div>
            </div>
            <div className="delete-account-impact">
              <FiAlertTriangle aria-hidden />
              <Text>
                Your profile, avatar settings, predictions, scores, XP, badges, streaks, public profile,
                leaderboard rows, ticker specialties, and sign-in account will be deleted.
              </Text>
            </div>
            <Text className="delete-account-confirm-copy">
              Type <strong>{expectedUsername}</strong> to confirm.
            </Text>
            <TextInput
              label="Username"
              value={deleteConfirmation}
              disabled={deleting}
              className="delete-account-confirm-input"
              onChange={(event) => setDeleteConfirmation(event.currentTarget.value)}
            />
            {deleteError ? (
              <div className="delete-account-error" role="alert">
                <FiAlertTriangle aria-hidden />
                <span>{deleteError}</span>
              </div>
            ) : null}
            <Group justify="flex-end" className="delete-account-modal-actions">
              <Button variant="subtle" disabled={deleting} onClick={closeModal}>
                Cancel
              </Button>
              <Button color="red" loading={deleting} disabled={!deleteEnabled} onClick={() => void handleDelete()}>
                Delete my account
              </Button>
            </Group>
          </Stack>
        </MagicHoverSurface>
      </Modal>
    </>
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
  const verdictCounts = scored.reduce<Partial<Record<ScoreVerdict, number>>>((counts, prediction) => {
    const verdict = prediction.score?.score_verdict;
    if (!verdict) {
      return counts;
    }
    counts[verdict] = (counts[verdict] ?? 0) + 1;
    return counts;
  }, {});
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
      verdict_counts: verdictCounts,
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
    latestPredictions: predictions
      .filter((prediction) => prediction.status !== "cancelled")
      .sort(
        (a, b) =>
          b.prediction_date.localeCompare(a.prediction_date) ||
          b.created_at.localeCompare(a.created_at) ||
          b.target_date.localeCompare(a.target_date),
      )
      .slice(0, 20)
      .map((prediction, index) =>
        convertOwnPrediction(prediction, prediction.status === "pending" ? "active" : "recent", index + 1),
      ),
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
