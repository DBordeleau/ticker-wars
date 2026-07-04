type DeleteAccountRequest = {
  confirmationUsername?: string;
};

type AuthUser = {
  id?: string;
  email?: string;
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_username: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const accessToken = readBearerToken(request);
  if (!accessToken) {
    return jsonResponse({ error: "You must be signed in to delete your account." }, 401);
  }

  try {
    const requestBody = await readRequestBody(request);
    const user = await fetchAuthenticatedUser(accessToken);
    if (!user.id) {
      return jsonResponse({ error: "Unable to verify the signed-in user." }, 401);
    }

    const profile = await fetchProfile(user.id);
    validateUsernameConfirmation(requestBody.confirmationUsername, profile);

    const deletionCounts = await deleteAppData(user.id);
    await deleteAuthUser(user.id);

    console.log("Deleted user account", {
      user_id: user.id,
      deletion_counts: deletionCounts,
    });

    return jsonResponse({
      success: true,
      user_id: user.id,
      deletion_counts: deletionCounts,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to delete account.";
    if (status >= 500) {
      console.error("Account deletion failed:", message);
    }
    return jsonResponse({ error: message }, status);
  }
});

async function fetchAuthenticatedUser(accessToken: string): Promise<AuthUser> {
  const response = await supabaseFetch("/auth/v1/user", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new HttpError("Your session expired. Please sign in again before deleting your account.", 401);
  }
  if (!response.ok) {
    throw new Error(`Supabase Auth user lookup failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.json() as AuthUser;
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const response = await supabaseFetch(
    `/rest/v1/user_profiles?select=user_id,username,display_username&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error(`Profile lookup failed with HTTP ${response.status}: ${await response.text()}`);
  }

  const rows = await response.json() as ProfileRow[];
  return rows[0] ?? null;
}

function validateUsernameConfirmation(confirmationUsername: string | undefined, profile: ProfileRow | null) {
  if (!profile) {
    return;
  }

  const confirmation = (confirmationUsername ?? "").trim().toLowerCase();
  const username = (profile.username ?? "").trim().toLowerCase();
  const displayUsername = (profile.display_username ?? "").trim().toLowerCase();
  if (!confirmation || (confirmation !== username && confirmation !== displayUsername)) {
    throw new HttpError("Type your username exactly before deleting your account.", 400);
  }
}

async function deleteAppData(userId: string): Promise<Record<string, number>> {
  const response = await supabaseFetch("/rest/v1/rpc/delete_user_account_data", {
    method: "POST",
    body: JSON.stringify({ target_user_id: userId }),
  });

  if (!response.ok) {
    throw new Error(`Database cleanup failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.json() as Record<string, number>;
}

async function deleteAuthUser(userId: string) {
  const response = await supabaseFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });

  if (response.status === 404) {
    return;
  }
  if (!response.ok) {
    throw new Error(`Auth user deletion failed with HTTP ${response.status}: ${await response.text()}`);
  }
}

async function supabaseFetch(path: string, init: RequestInit) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be available to the Edge Function.");
  }

  return fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      ...jsonHeaders,
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(init.headers ?? {}),
    },
  });
}

async function readRequestBody(request: Request): Promise<DeleteAccountRequest> {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function readBearerToken(request: Request) {
  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
