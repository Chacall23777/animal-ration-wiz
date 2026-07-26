import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@16?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ADMIN_EMAIL = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") ?? "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "Aguiar Nutrição Animal <onboarding@resend.dev>";

const MONTHLY_PRICE_ID = Deno.env.get("STRIPE_PRICE_ID_MONTHLY");
const ANNUAL_PRICE_ID = Deno.env.get("STRIPE_PRICE_ID_ANNUAL");

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
  } catch (err) {
    console.error("Falha ao enviar e-mail:", err);
  }
}

function planFromPriceId(priceId?: string) {
  if (priceId === ANNUAL_PRICE_ID) return "annual";
  if (priceId === MONTHLY_PRICE_ID) return "monthly";
  return undefined;
}

function planLabel(priceId?: string) {
  if (priceId === ANNUAL_PRICE_ID) return "Anual (R$ 480/ano)";
  if (priceId === MONTHLY_PRICE_ID) return "Mensal (R$ 50/mês)";
  return "Assinatura";
}

async function setValidUntilByCustomer(
  customerId: string,
  validUntil: Date | null,
  subscriptionId: string | null,
  plan?: string,
) {
  const update: Record<string, unknown> = {
    valid_until: validUntil ? validUntil.toISOString() : null,
    stripe_subscription_id: subscriptionId,
    updated_at: new Date().toISOString(),
  };
  if (plan) update.plan = plan;
  await supabaseAdmin.from("subscribers").update(update).eq("stripe_customer_id", customerId);
}

async function getSubscriberEmail(customerId: string) {
  const { data } = await supabaseAdmin
    .from("subscribers")
    .select("email")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.email as string | undefined;
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature ?? "",
      Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",
    );
  } catch (err) {
    return new Response(`Assinatura inválida: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.customer && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = subscription.items.data[0]?.price.id;
          const plan = planFromPriceId(priceId);

          await setValidUntilByCustomer(
            session.customer as string,
            new Date(subscription.current_period_end * 1000),
            subscription.id,
            plan,
          );

          const email = await getSubscriberEmail(session.customer as string);
          const label = planLabel(priceId);

          await sendEmail(
            email ?? "",
            "Bem-vindo(a) à Aguiar Nutrição Animal 🐷",
            `<h2>Assinatura confirmada!</h2><p>Seu plano <b>${label}</b> está ativo. Bom uso da calculadora, plantel e consultor IA.</p>`,
          );

          await sendEmail(
            ADMIN_EMAIL,
            "Nova assinatura confirmada",
            `<p>Novo cliente: <b>${email ?? session.customer}</b></p><p>Plano: <b>${label}</b></p>`,
          );
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer && invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const priceId = subscription.items.data[0]?.price.id;
          const plan = planFromPriceId(priceId);

          await setValidUntilByCustomer(
            invoice.customer as string,
            new Date(subscription.current_period_end * 1000),
            subscription.id,
            plan,
          );

          if (invoice.billing_reason === "subscription_cycle") {
            const email = await getSubscriberEmail(invoice.customer as string);
            await sendEmail(
              ADMIN_EMAIL,
              "Renovação de assinatura recebida",
              `<p>Cliente: <b>${email ?? invoice.customer}</b> renovou o plano.</p>`,
            );
          }
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const active = subscription.status === "active" || subscription.status === "trialing";
        const priceId = subscription.items.data[0]?.price.id;
        const plan = planFromPriceId(priceId);

        await setValidUntilByCustomer(
          subscription.customer as string,
          active ? new Date(subscription.current_period_end * 1000) : new Date(),
          subscription.id,
          plan,
        );
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        // Mantém acesso até o fim do período já pago (não corta na hora).
        await setValidUntilByCustomer(
          subscription.customer as string,
          new Date(subscription.current_period_end * 1000),
          null,
        );
        break;
      }
    }
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
