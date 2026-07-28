import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

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
    const email = data.email.toLowerCase();
    let { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!prof) {
      // E-mail ainda não tem conta: pré-aprovamos. Quando o usuário se cadastrar
      // pelo /auth com esse e-mail, o trigger handle_new_user aplica o acesso.
      const { error: pendErr } = await supabaseAdmin.from("pending_access").upsert(
        {
          email,
          days: data.days,
          lifetime: false,
          granted_by: context.userId,
          used_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" },
      );
      if (pendErr) throw pendErr;
      return { ok: true, pending: true, until: new Date(Date.now() + data.days * 86400_000).toISOString() };
    }
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
    return { ok: true, pending: false, until };
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
          else if (s.price_id === "aguiar_vitalicio") mrrCents += 9700; // conta como receita única no mês
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
/* ============= Fase 3: Super Admin expandido ============= */

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profs }, { data: roles }, { data: subs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, lifetime_access, created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("subscriptions").select("user_id, status, price_id, current_period_end, environment, created_at").order("created_at", { ascending: false }),
    ]);
    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = roleMap.get(r.user_id as string) ?? [];
      arr.push(r.role as string);
      roleMap.set(r.user_id as string, arr);
    }
    const subMap = new Map<string, any>();
    for (const s of subs ?? []) {
      if (!subMap.has(s.user_id as string)) subMap.set(s.user_id as string, s);
    }
    const now = Date.now();
    return (profs ?? []).map((p: any) => {
      const sub = subMap.get(p.id);
      const end = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : null;
      const trialing = sub?.status === "trialing" && end && end > now;
      const daysLeft = trialing && end ? Math.ceil((end - now) / 86400000) : null;
      return {
        id: p.id as string,
        email: p.email as string,
        full_name: (p.full_name as string) ?? null,
        created_at: p.created_at as string,
        lifetime: !!p.lifetime_access,
        isAdmin: (roleMap.get(p.id) ?? []).includes("admin"),
        subStatus: sub?.status ?? null,
        priceId: sub?.price_id ?? null,
        periodEnd: sub?.current_period_end ?? null,
        environment: sub?.environment ?? null,
        trialing: !!trialing,
        trialDaysLeft: daysLeft,
      };
    });
  });

export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; makeAdmin: boolean }) =>
    z.object({ email: z.string().email(), makeAdmin: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("id, email").eq("email", data.email.toLowerCase()).maybeSingle();
    if (!prof) throw new Error("Usuário não encontrado. Peça para se cadastrar primeiro.");
    if (data.makeAdmin) {
      const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: prof.id as string, role: "admin" });
      if (error && !`${error.message}`.includes("duplicate")) throw error;
    } else {
      // Não permitir remover o próprio admin ou o dono vitalício
      if ((prof.email as string)?.toLowerCase() === "rogeriopereira289@gmail.com") {
        throw new Error("Não é possível remover o administrador vitalício.");
      }
      const { error } = await supabaseAdmin
        .from("user_roles").delete().eq("user_id", prof.id as string).eq("role", "admin");
      if (error) throw error;
    }
    return { ok: true };
  });

export const grantLifetime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; enable: boolean }) =>
    z.object({ email: z.string().email(), enable: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("id").eq("email", data.email.toLowerCase()).maybeSingle();
    if (!prof) throw new Error("Usuário não encontrado.");
    const { error } = await supabaseAdmin.from("profiles").update({
      lifetime_access: data.enable,
      lifetime_granted_at: data.enable ? new Date().toISOString() : null,
    }).eq("id", prof.id as string);
    if (error) throw error;
    return { ok: true };
  });
