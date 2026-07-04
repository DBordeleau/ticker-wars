import type { Provider } from "@supabase/supabase-js";
import { siteUrl, supabase } from "../api/supabaseClient";
import type { AuthProviderName, ProfileInput, UserProfile } from "./types";

export async function signInWithProvider(provider: AuthProviderName) {
  if (!supabase) {
    throw new Error("Supabase is not configured for this React build.");
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    throw error;
  }
}

export async function signOut() {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

export async function clearLocalAuthSession() {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    throw error;
  }
}

export async function deleteOwnAccount(confirmationUsername: string): Promise<Record<string, number>> {
  if (!supabase) {
    throw new Error("Supabase is not configured for this React build.");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("You must be signed in to delete your account.");
  }

  const { data, error } = await supabase.functions.invoke("delete-user-account", {
    body: { confirmationUsername },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw await readableFunctionError(error);
  }

  return ((data as { deletion_counts?: Record<string, number> } | null)?.deletion_counts ?? {});
}

async function readableFunctionError(error: Error): Promise<Error> {
  const context = (error as Error & { context?: Response }).context;
  if (!context) {
    return error;
  }

  try {
    const data = await context.clone().json() as { error?: string };
    if (data.error) {
      return new Error(data.error);
    }
  } catch {
    return error;
  }

  return error;
}

export async function fetchOwnProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? normalizeProfile(data as Partial<UserProfile>) : null;
}

export async function isUsernameAvailable(displayUsername: string, userId: string): Promise<boolean> {
  if (!supabase) {
    throw new Error("Supabase is not configured for this React build.");
  }

  const username = displayUsername.trim().toLowerCase();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("username", username)
    .neq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return !data;
}

export async function saveProfile(input: ProfileInput): Promise<UserProfile> {
  if (!supabase) {
    throw new Error("Supabase is not configured for this React build.");
  }

  const displayUsername = input.displayUsername.trim();
  const row = {
    user_id: input.userId,
    username: displayUsername.toLowerCase(),
    display_username: displayUsername,
    is_public: input.isPublic,
    avatar_style: "adventurer-neutral",
    avatar_seed: input.avatarSeed,
    avatar_options: input.avatarOptions,
    onboarding_completed_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    if ("code" in error && error.code === "23505") {
      throw new Error("That username is already taken.");
    }
    throw error;
  }

  return normalizeProfile(data as Partial<UserProfile>);
}

function normalizeProfile(row: Partial<UserProfile>): UserProfile {
  return {
    user_id: row.user_id ?? "",
    username: row.username ?? row.display_username?.toLowerCase() ?? "",
    display_username: row.display_username ?? row.username ?? "",
    is_public: row.is_public ?? true,
    avatar_style: "adventurer-neutral",
    avatar_seed: row.avatar_seed ?? row.user_id ?? "",
    avatar_options: row.avatar_options ?? {
      eyebrowsVariant: "variant01",
      eyesVariant: "variant01",
      glassesVariant: "variant01",
      glassesProbability: 0,
      mouthVariant: "variant01",
      backgroundColor: "f2d3b1",
      scale: 1,
      rotate: 0,
    },
    note: row.note ?? null,
    note_moderation_status: row.note_moderation_status ?? "unreviewed",
    onboarding_completed_at: row.onboarding_completed_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

