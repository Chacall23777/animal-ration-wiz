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

    const { plan } = await req.json();
    const newPriceId = PRICE_BY_PLAN[plan];
    if (!newPriceId) throw new Error(`Plano inválido: ${plan}`);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData.user) throw new Error("Usuário não autenticado");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: sub } = await supabaseAdmin
      .from("subscribers")
      .select("stripe_subscription_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!sub?.stripe_subscription_id) throw new Error("Você ainda não tem uma assinatura ativa.");

    const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const currentItem = subscription.items.data[0];

    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: currentItem.id, price: newPriceId }],
      proration_behavior: "create_prorations",
      billing_cycle_anchor: "now",
    });

    await supabaseAdmin
      .from("subscribers")
      .update({ plan, updated_at: new Date().toISOString() })
      .eq("id", userData.user.id);

    return new Response(JSON.stringify({ status: updated.status, plan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
