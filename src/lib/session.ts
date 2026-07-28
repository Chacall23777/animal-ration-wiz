import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type SubscriptionRow = {
  status: string;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

export type SessionState = {
  loading: boolean;
  user: User | null;
  isAdmin: boolean;
  subscription: SubscriptionRow | null;
  active: boolean;
};

function isActive(sub: SubscriptionRow | null, isAdmin: boolean) {
  if (isAdmin) return true;
  if (!sub) return false;
  const okStatus = ["active", "trialing", "past_due"].includes(sub.status) || sub.status === "canceled";
  if (!okStatus) return false;
  if (!sub.current_period_end) return sub.status === "active" || sub.status === "trialing";
  return new Date(sub.current_period_end).getTime() > Date.now();
}

export function useSession(): SessionState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<SessionState>({
    loading: true,
    user: null,
    isAdmin: false,
    subscription: null,
    active: false,
  });

  async function load(user: User | null) {
    if (!user) {
      setState({ loading: false, user: null, isAdmin: false, subscription: null, active: false });
      return;
    }
    const [{ data: roleRows }, { data: subRow }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      supabase
        .from("subscriptions")
        .select("status, price_id, current_period_end, cancel_at_period_end")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const isAdmin = !!roleRows?.some((r: { role: string }) => r.role === "admin");
    const subscription = (subRow as SubscriptionRow | null) ?? null;
    setState({ loading: false, user, isAdmin, subscription, active: isActive(subscription, isAdmin) });
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) void load(data.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      void load(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { ...state, refresh: () => supabase.auth.getUser().then(({ data }) => load(data.user ?? null)) };
}