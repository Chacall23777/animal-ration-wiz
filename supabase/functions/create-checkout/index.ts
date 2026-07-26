import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@16?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICE_BY_PLAN: Record<string, string | undefined> = {
  monthly: Deno.env.get("STRIPE_PRICE_ID_MONTHLY"),
  annual: Deno.env.get("STRIPE_PRICE_ID_ANNUAL"),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Faltou o header Authorization");

    const { plan } = await req.json().catch(() => ({ plan: "monthly" }));
    const priceId = PRICE_BY_PLAN[plan] ?? PRICE_BY_PLAN["monthly"];
    if (!priceId) throw new Error(`Plano inválido ou price ID não configurado: ${plan}`);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData.user) throw new Error("Usuário não autenticado");
    const user = userData.user;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sub } = await supabaseAdmin
      .from("subscribers")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("id", user.id)
      .maybeSingle();

    if (sub?.stripe_subscription_id) {
      throw new Error("Você já tem uma assinatura ativa. Use a opção de troca de plano.");
    }

    let customerId = sub?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabaseAdmin
        .from("subscribers")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/?checkout=sucesso`,
      cancel_url: `${siteUrl}/?checkout=cancelado`,
      allow_promotion_codes: true,
      subscription_data: { metadata: { plan } },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
