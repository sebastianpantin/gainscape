import { createClient } from '@supabase/supabase-js';

const sameOriginSupabaseProxy = `${window.location.origin}/sb`;

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? sameOriginSupabaseProxy,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
