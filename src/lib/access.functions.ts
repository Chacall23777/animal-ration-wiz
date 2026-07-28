import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Resolve o tipo de acesso de um email consultando public.access_control.
 * Retorna null se o email não estiver autorizado.
 * Público (não requer auth) — usado no fluxo de login antes de conceder sessão.
 */
export const resolveAccess = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) =>
    z.object({ email: z.string().email() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const email = data.email.toLowerCase();
    const { data: row } = await admin
      .from("access_control")
      .select("access_type, full_name")
      .ilike("email", email)
      .maybeSingle();
    return {
      access_type: (row?.access_type as string | undefined) ?? null,
      full_name: (row?.full_name as string | undefined) ?? null,
    };
  });

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

/**
 * Admin libera um novo usuário informando nome + email.
 * Cria registro em access_control (lifetime) e envia magic link de convite (expira 30 min por padrão do Supabase Auth).
 */
export const inviteUserByAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; full_name: string; access_type?: "lifetime" | "admin" }) =>
    z
      .object({
        email: z.string().email(),
        full_name: z.string().trim().min(1).max(120),
        access_type: z.enum(["lifetime", "admin"]).default("lifetime"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Upsert access_control
    const { error: acErr } = await supabaseAdmin
      .from("access_control")
      .upsert(
        {
          email,
          full_name: data.full_name,
          access_type: data.access_type,
          invited_by: context.userId,
          activated_at: null,
        },
        { onConflict: "email" },
      );
    if (acErr) throw acErr;

    // Enviar invite (magic link para definir senha). Redireciona para /set-password.
    const origin = process.env.APP_URL || "https://arnanutricaoanimal.store";
    const { data: invited, error: invErr } = await (supabaseAdmin as any).auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${origin}/set-password`,
        data: { full_name: data.full_name },
      },
    );
    if (invErr) {
      // Se o usuário já existe, envia link de recuperação para trocar senha
      const { error: linkErr } = await (supabaseAdmin as any).auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${origin}/set-password` },
      });
      if (linkErr) throw linkErr;
      return { ok: true, mode: "recovery" as const };
    }
    return { ok: true, mode: "invite" as const, userId: invited?.user?.id ?? null };
  });

/** Lista todos os registros de access_control (admin). */
export const listAccessControl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("access_control")
      .select("id, email, full_name, access_type, is_protected, activated_at, invited_by, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

/** Muda o tipo de acesso de um email. Super admin protegido é intocável. */
export const setAccessType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; access_type: "admin" | "lifetime" | "trial" | "blocked" }) =>
    z
      .object({
        email: z.string().email(),
        access_type: z.enum(["admin", "lifetime", "trial", "blocked"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const { error } = await supabaseAdmin
      .from("access_control")
      .update({ access_type: data.access_type })
      .ilike("email", email);
    if (error) throw error;
    return { ok: true };
  });