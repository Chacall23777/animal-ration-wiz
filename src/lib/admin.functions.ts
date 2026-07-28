import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, status, price_id, current_period_end, cancel_at_period_end")
      .order("current_period_end", { ascending: false });
    if (error) throw error;
    // Join profile emails.
    const ids = Array.from(new Set((data ?? []).map((r) => r.user_id))).filter(Boolean) as string[];
    let emails: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, email").in("id", ids);
      for (const p of profs ?? []) emails[p.id as string] = (p.email as string) ?? "";
    }
    return (data ?? []).map((r) => ({ ...r, email: emails[r.user_id as string] ?? r.user_id }));
  });

export const grantAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; days: number }) =>
    z.object({ email: z.string().email(), days: z.number().int().min(1).max(3650) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email.toLowerCase())
      .maybeSingle();
    if (pErr) throw pErr;
    if (!prof) throw new Error("Usuário ainda não cadastrado — peça para se cadastrar primeiro.");
    const until = new Date(Date.now() + data.days * 86400_000).toISOString();
    const manualId = `manual_${prof.id as string}`;
    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: prof.id as string,
        stripe_subscription_id: manualId,
        status: "active",
        price_id: "admin_grant",
        current_period_end: until,
        cancel_at_period_end: false,
        environment: "manual",
      },
      { onConflict: "stripe_subscription_id" },
    );
    if (error) throw error;
    return { ok: true, until };
  });

export const revokeAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string }) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email.toLowerCase())
      .maybeSingle();
    if (!prof) throw new Error("Usuário não encontrado.");
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: "canceled", current_period_end: new Date().toISOString() })
      .eq("user_id", prof.id as string);
    if (error) throw error;
    return { ok: true };
  });

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: totalUsers }, { data: subs }, { count: chatCount }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("subscriptions").select("status, price_id, current_period_end, environment"),
      supabaseAdmin.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "arna_chat"),
    ]);
    const now = Date.now();
    let active = 0;
    let manual = 0;
    let stripeActive = 0;
    let mrrCents = 0;
    for (const s of subs ?? []) {
      const end = s.current_period_end ? new Date(s.current_period_end).getTime() : null;
      const isLive = end === null || end > now;
      if (["active", "trialing"].includes(s.status as string) && isLive) {
        active++;
        if (s.environment === "manual") manual++;
        else {
          stripeActive++;
          if (s.price_id === "aguiar_mensal") mrrCents += 5000;
          else if (s.price_id === "aguiar_anual") mrrCents += Math.round(50000 / 12);
        }
      }
    }
    return {
      totalUsers: totalUsers ?? 0,
      activeSubscriptions: active,
      manualGrants: manual,
      stripeActive,
      mrrBRL: mrrCents / 100,
      chatInteractions: chatCount ?? 0,
    };
  });

export const finalizeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string; environment: "sandbox" | "live" }) => d)
  .handler(async ({ data, context }) => {
    const { createStripeClient } = await import("@/lib/stripe.server");
    const stripe = createStripeClient(data.environment);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId, {
      expand: ["subscription", "line_items.data.price"],
    });
    if (session.payment_status !== "paid" && session.status !== "complete") {
      throw new Error("Pagamento não confirmado.");
    }
    const sub = (typeof session.subscription === "string" ? null : session.subscription) as
      | (import("stripe").Stripe.Subscription & { current_period_end?: number })
      | null;
    const priceLookup =
      (session.line_items?.data?.[0]?.price as { lookup_key?: string } | undefined)?.lookup_key ?? null;
    const periodEnd = sub?.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : new Date(Date.now() + (priceLookup === "aguiar_anual" ? 365 : 30) * 86400_000).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const subscriptionKey = sub?.id ?? `checkout_${data.sessionId}`;
    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: context.userId,
        stripe_customer_id: (session.customer as string) ?? null,
        stripe_subscription_id: subscriptionKey,
        status: sub?.status ?? "active",
        price_id: priceLookup,
        current_period_end: periodEnd,
        cancel_at_period_end: sub?.cancel_at_period_end ?? false,
        environment: data.environment,
      },
      { onConflict: "stripe_subscription_id" },
    );
    if (error) throw error;
    return { ok: true, periodEnd };
  });