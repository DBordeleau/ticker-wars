import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { FaDiscord, FaGithub, FaGoogle } from "react-icons/fa";
import { FiAlertTriangle } from "react-icons/fi";
import { isSupabaseConfigured } from "../../api/supabaseClient";
import { signInWithProvider } from "../../auth/authApi";
import type { AuthProviderName } from "../../auth/types";

type Props = {
  opened: boolean;
  onClose: () => void;
};

const providers: Array<{
  provider: AuthProviderName;
  label: string;
  icon: ReactNode;
}> = [
  { provider: "google", label: "Continue with Google", icon: <FaGoogle /> },
  { provider: "discord", label: "Continue with Discord", icon: <FaDiscord /> },
  { provider: "github", label: "Continue with GitHub", icon: <FaGithub /> },
];

export default function SignInModal({ opened, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<AuthProviderName | null>(null);

  const handleSignIn = async (provider: AuthProviderName) => {
    setError(null);
    setLoadingProvider(provider);
    try {
      await signInWithProvider(provider);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start sign in.");
      setLoadingProvider(null);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Sign in" centered className="auth-modal">
      <Stack gap="md">
        {!isSupabaseConfigured ? (
          <Alert color="yellow" icon={<FiAlertTriangle />}>
            Supabase auth is not configured for this build.
          </Alert>
        ) : null}
        {error ? (
          <Alert color="red" icon={<FiAlertTriangle />}>
            {error}
          </Alert>
        ) : null}
        <Text size="sm" className="secondary-text">
          Join the human side of Ticker Wars with a social account.
        </Text>
        <Stack gap="sm">
          {providers.map((item) => (
            <Button
              key={item.provider}
              variant="light"
              color="green"
              leftSection={item.icon}
              disabled={!isSupabaseConfigured}
              loading={loadingProvider === item.provider}
              onClick={() => void handleSignIn(item.provider)}
            >
              {item.label}
            </Button>
          ))}
        </Stack>
        <Group justify="center">
          <Text size="xs" c="dimmed">
            No email passwords. No magic links.
          </Text>
        </Group>
      </Stack>
    </Modal>
  );
}
