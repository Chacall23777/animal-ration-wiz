import { createFileRoute } from "@tanstack/react-router";
import { createStripeClient } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/public/probe-price")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = (new URL(request.url).searchParams.get("env") as "sandbox" | "live") || "sandbox";
        const stripe = createStripeClient(env);
        const prices = await stripe.prices.list({ lookup_keys: ["aguiar_vitalicio"], limit: 5 });
        return Response.json(
          prices.data.map((p) => ({
            id: p.id,
            product: p.product,
            unit_amount: p.unit_amount,
            recurring: p.recurring,
            active: p.active,
          })),
        );
      },
    },
  },
});