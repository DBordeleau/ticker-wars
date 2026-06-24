import { Alert, Button, Modal, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { FaDiscord, FaGithub, FaGoogle } from "react-icons/fa";
import { FiAlertTriangle, FiX } from "react-icons/fi";
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
  className: string;
}> = [
  { provider: "google", label: "Continue with Google", icon: <FaGoogle />, className: "auth-provider-google" },
  { provider: "discord", label: "Continue with Discord", icon: <FaDiscord />, className: "auth-provider-discord" },
  { provider: "github", label: "Continue with GitHub", icon: <FaGithub />, className: "auth-provider-github" },
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
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      className="auth-modal"
      withCloseButton={false}
      padding={0}
      radius="sm"
      overlayProps={{ backgroundOpacity: 0.5, blur: 8 }}
      transitionProps={{ transition: "pop", duration: 180 }}
    >
      <button type="button" className="auth-modal-close" aria-label="Close sign in modal" onClick={onClose}>
        <FiX />
      </button>
      <Stack gap="md" className="auth-modal-body">
        <Text className="auth-modal-label">Sign in to make predictions and compete with others!</Text>
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
        <Stack gap="sm">
          {providers.map((item) => (
            <Button
              key={item.provider}
              variant="filled"
              leftSection={item.icon}
              className={`auth-provider-button ${item.className}`}
              disabled={!isSupabaseConfigured}
              loading={loadingProvider === item.provider}
              onClick={() => void handleSignIn(item.provider)}
            >
              {item.label}
            </Button>
          ))}
        </Stack>
      </Stack>
    </Modal>
  );
}
