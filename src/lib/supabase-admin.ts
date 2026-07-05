import { createClient } from '@supabase/supabase-js';

// ⚠️ CHỈ import file này trong code chạy ở server (API routes, server components,
// server actions). service_role_key bỏ qua RLS — không bao giờ để lộ ra browser.
export function getSupabaseAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
