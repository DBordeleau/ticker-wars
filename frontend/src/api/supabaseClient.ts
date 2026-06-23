import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabasePublishableKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY;
const configuredSiteUrl = process.env.REACT_APP_SITE_URL;

export const siteUrl = (configuredSiteUrl || "https://tickerwars.vercel.app").replace(/\/+$/, "");

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : null;
