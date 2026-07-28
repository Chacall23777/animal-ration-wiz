import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, createStripeClient, verifyWebhook } from "@/lib/stripe.server";

let _supabase: any = null;
function getSupabase(): any {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

function extractPriceLookup(item: any): string | null {
  return (
    item?.price?.lookup_key ||
    item?.price?.metadata?.lovable_external_id ||
    item?.price?.id ||
    null
  );
}

async function upsertSubscription(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;
  const item = subscription.items?.data?.[0];
  const priceId = extractPriceLookup(item);
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await getSupabase().from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: productId,
      price_id: priceId,
      status: subscription.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
}

async function grantLifetimeAccess(userId: string) {
  await getSupabase()
    .from("profiles")
    .update({ lifetime_access: true, lifetime_granted_at: new Date().toISOString() })
    .eq("id", userId);
}

async function handleInvoicePaid(invoice: any, env: StripeEnv) {
  // Lifetime trigger: first paid invoice on the vitalicio plan grants lifetime and cancels the sub.
  const subId = invoice.subscription;
  if (!subId) return;
  const stripe = createStripeClient(env);
  const subscription = await stripe.subscriptions.retrieve(subId);
  const userId = (subscription.metadata as any)?.userId;
  const isLifetime =
    (subscription.metadata as any)?.lifetime === "true" ||
    (subscription.metadata as any)?.plan === "aguiar_vitalicio";
  if (userId && isLifetime && invoice.amount_paid > 0) {
    await grantLifetimeAccess(userId);
    try {
      // Cancel at period end so the user retains a stripe record; lifetime_access flag governs UI.
      await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    } catch (e) {
      console.error("Failed to cancel lifetime subscription:", e);
    }
  }
  await upsertSubscription(subscription, env);
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const env: StripeEnv = rawEnv;
        try {
          const event = await verifyWebhook(request, env);
          switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
              await upsertSubscription(event.data.object, env);
              break;
            case "invoice.paid":
            case "invoice.payment_succeeded":
              await handleInvoicePaid(event.data.object, env);
              break;
            default:
              console.log("Unhandled event:", event.type);
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});