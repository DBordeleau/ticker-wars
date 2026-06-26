import { Alert, Button, Card, Group, Loader, Stack, Switch, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiCheck } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import { avatarSeedFromUsername, defaultAvatarOptions, normalizeAvatarOptions } from "../auth/avatar";
import { isUsernameAvailable, saveProfile } from "../auth/authApi";
import { useAuth } from "../auth/AuthProvider";
import type { AvatarOptions } from "../auth/types";
import AvatarEditor from "../components/users/AvatarEditor";
import SignInModal from "../components/users/SignInModal";

export default function Onboarding() {
  const { user, profile, loading, profileLoading, setProfile } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [displayUsername, setDisplayUsername] = useState(profile?.display_username ?? "");
  const [isPublic, setIsPublic] = useState(profile?.is_public ?? true);
  const [avatarOptions, setAvatarOptions] = useState<AvatarOptions>(
    normalizeAvatarOptions(profile?.avatar_options ?? defaultAvatarOptions),
  );
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

  useEffect(() => {
    if (profile) {
      setDisplayUsername(profile.display_username);
      setIsPublic(profile.is_public);
      setAvatarOptions(normalizeAvatarOptions(profile.avatar_options));
    }
  }, [profile]);

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

  const canSave = Boolean(user && !usernameError && usernameAvailability !== "checking");

  const handleSubmit = async () => {
    if (!user || usernameFormatError) {
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
      setProfile(nextProfile);
      notifications.show({
        color: "green",
        icon: <FiCheck />,
        title: "Profile saved",
        message: "Profile saved.",
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
            <Title order={1}>Create your profile</Title>
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
          <AvatarEditor seed={avatarSeed} value={avatarOptions} onChange={setAvatarOptions} />
          <Group justify="flex-end">
            <Button color="green" disabled={!canSave} loading={saving} onClick={() => void handleSubmit()}>
              Save profile
            </Button>
          </Group>
        </Stack>
      </Card>
    </main>
  );
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

