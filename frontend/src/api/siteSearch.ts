import { supabase } from "./supabaseClient";
import type { SiteSearchResult } from "../utils/siteSearch";
import { normalizeSearchQuery } from "../utils/siteSearch";

type UserSearchRow = {
  username: string;
  display_username: string;
  avatar_seed: string;
  level: number;
  match_rank: number;
};

const TTL = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: SiteSearchResult[] }>();
const pending = new Map<string, Promise<SiteSearchResult[]>>();

export function searchPublicUsers(rawQuery: string): Promise<SiteSearchResult[]> {
  const query = normalizeSearchQuery(rawQuery).replace(/^@/, "").toLowerCase();
  if (!supabase || query.length < 2) return Promise.resolve([]);
  const cached = cache.get(query);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  const existing = pending.get(query);
  if (existing) return existing;

  const request = Promise.resolve(supabase.rpc("search_public_user_profiles", {
    search_query: query,
    result_limit: 5,
  })).then(({ data, error }) => {
    if (error) throw error;
    const value = ((data ?? []) as UserSearchRow[]).map((row) => ({
      id: `user-${row.username}`,
      kind: "user" as const,
      primary: row.display_username,
      secondary: `@${row.username} · Level ${row.level}`,
      route: `/users/${row.username}`,
      avatarSeed: row.avatar_seed,
      level: row.level,
      score: Number(row.match_rank ?? 0),
    }));
    cache.set(query, { expiresAt: Date.now() + TTL, value });
    if (cache.size > 50) cache.delete(cache.keys().next().value as string);
    return value;
  }).finally(() => pending.delete(query));
  pending.set(query, request);
  return request;
}

export function resetSiteSearchCache() {
  cache.clear();
  pending.clear();
}
