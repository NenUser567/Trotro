import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const ROUTE_ID = import.meta.env.VITE_ROUTE_ID;
export const ADMIN_API_BASE = import.meta.env.VITE_ADMIN_API_BASE;