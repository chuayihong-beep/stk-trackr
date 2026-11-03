import { createClient } from '@supabase/supabase-js';

// Public values: the publishable key only works through Row Level Security.
// Env vars override them for local development (.env.local).
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://vewqmxhweysgtkieahij.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_YSbKNXHg0xtlOxU84g1kWA_72QPrzbr';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
