import { Alert, Button, Loader, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { FiAlertTriangle } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import { useAuth } from "../auth/AuthProvider";
import AnimatedSection from "../components/layout/AnimatedSection";

export default function AuthCallback() {
  const { loading, profile, profileLoading, user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [callbackProcessed, setCallbackProcessed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let isCurrent = true;

    async function completeCallback() {
      if (!supabase) {
        setError("Supabase is not configured for this React build.");
        return;
      }

      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        } else {
          const { error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            throw sessionError;
          }
        }

        if (isCurrent) {
          setCallbackProcessed(true);
          window.history.replaceState({}, document.title, "/auth/callback");
        }
      } catch (caught) {
        if (isCurrent) {
          setError(caught instanceof Error ? caught.message : "Unable to complete sign in.");
        }
      }
    }

    void completeCallback();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!callbackProcessed || loading || profileLoading || !user) {
      return;
    }

    navigate(profile ? "/" : "/onboarding", {
      replace: true,
      state: profile ? undefined : { from: "/" },
    });
  }, [callbackProcessed, loading, navigate, profile, profileLoading, user]);

  return (
    <main className="dashboard-shell detail-page auth-callback-page">
      <AnimatedSection delay={0}>
        <div className="section-panel auth-callback-panel">
          {error ? (
            <Alert color="red" icon={<FiAlertTriangle />} title="Sign in could not be completed">
              <div className="error-alert-content">
                <span>{error}</span>
                <Button variant="light" color="red" size="xs" onClick={() => navigate("/", { replace: true })}>
                  Return home
                </Button>
              </div>
            </Alert>
          ) : (
            <>
              <Loader color="green" />
              <Text fw={800}>Completing sign in</Text>
            </>
          )}
        </div>
      </AnimatedSection>
    </main>
  );
}

