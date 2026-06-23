import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../api/supabaseClient";
import { fetchOwnProfile } from "./authApi";
import type { UserProfile } from "./types";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: UserProfile | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [profileLoading, setProfileLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  const user = session?.user ?? null;

  const refreshProfile = useCallback(async () => {
    if (!session?.user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    setError(null);
    try {
      setProfile(await fetchOwnProfile(session.user.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load user profile.");
    } finally {
      setProfileLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setProfileLoading(false);
      return undefined;
    }

    let isMounted = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!isMounted) {
        return;
      }
      if (sessionError) {
        setError(sessionError.message);
      }
      setSession(data.session ?? null);
      setLoading(false);
      if (!data.session) {
        setProfileLoading(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setProfileLoading(Boolean(nextSession));
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      loading,
      profileLoading,
      error,
      refreshProfile,
      setProfile,
    }),
    [error, loading, profile, profileLoading, refreshProfile, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return value;
}
