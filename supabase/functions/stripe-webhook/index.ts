import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@16?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function setValidUntilByCustomer(customerId: string, validUntil: Date | null, subscriptionId?: string) {
  await supabaseAdmin
    .from("subscribers")
    .update({
      valid_until: validUntil ? validUntil.toISOString() : null,
      stripe_subscription_id: subscriptionId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);
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
          await setValidUntilByCustomer(
            session.customer as string,
            new Date(subscription.current_period_end * 1000),
            subscription.id,
          );
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer && invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await setValidUntilByCustomer(
            invoice.customer as string,
            new Date(subscription.current_period_end * 1000),
            subscription.id,
          );
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const active = subscription.status === "active" || subscription.status === "trialing";
        await setValidUntilByCustomer(
          subscription.customer as string,
          active ? new Date(subscription.current_period_end * 1000) : new Date(),
          subscription.id,
        );
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
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
