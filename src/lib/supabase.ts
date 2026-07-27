import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL as string | undefined;

const supabaseAnonKey =
  import.meta.env
    .VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase = createClient(
  supabaseUrl ?? "",
  supabaseAnonKey ?? "",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

export type SubscriberRow = {
  id: string;
  email: string;
  is_admin: boolean;
  valid_until: string | null;
};
