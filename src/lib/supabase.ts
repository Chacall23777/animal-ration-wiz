import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[Aguiar] Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY " +
      "no .env (veja SETUP_ASSINATURA.md) para habilitar login e assinatura reais.",
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");

export type Subscriber = {
  id: string;
  email: string;
  is_admin: boolean;
  valid_until: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};
