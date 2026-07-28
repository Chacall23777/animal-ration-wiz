import { createServerFn } from "@tanstack/react-start";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

type CheckoutSessionResult = { clientSecret: string } | { error: string };

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((data: {
    priceId: string;
    customerEmail?: string;
    userId?: string;
    returnUrl: string;
    environment: StripeEnv;
  }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(data.priceId)) throw new Error("Invalid priceId");
    return data;
  })
  .handler(async ({ data }): Promise<CheckoutSessionResult> => {
    try {
      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error("Price not found");
      const stripePrice = prices.data[0];
      const isRecurring = stripePrice.type === "recurring";
      const isLifetimeTrial = data.priceId === "aguiar_vitalicio";

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        ...(data.customerEmail && { customer_email: data.customerEmail }),
        ...(data.userId && {
          metadata: { userId: data.userId },
          ...(isRecurring && {
            subscription_data: {
              metadata: {
                userId: data.userId,
                ...(isLifetimeTrial && { plan: "aguiar_vitalicio", lifetime: "true" }),
              },
              ...(isLifetimeTrial && { trial_period_days: 7 }),
            },
          }),
        }),
        ...(isLifetimeTrial && { payment_method_collection: "always" as const }),
        ...(isLifetimeTrial && {
          custom_text: {
            submit: {
              message:
                "Cobrança única de R$ 97,00 após 7 dias grátis. Acesso vitalício — nenhuma renovação será cobrada.",
            },
          },
        }),
      });

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
