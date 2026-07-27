import { createFileRoute, Link } from "@tanstack/react-router";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

type Search = { plan?: string; email?: string };

export const Route = createFileRoute("/checkout")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    plan: typeof s.plan === "string" ? s.plan : undefined,
    email: typeof s.email === "string" ? s.email : undefined,
  }),
  component: CheckoutPage,
  head: () => ({
    meta: [
      { title: "Assinar — Aguiar Nutrição Animal" },
      { name: "description", content: "Finalize sua assinatura da Aguiar Nutrição Animal." },
    ],
  }),
});

function CheckoutPage() {
  const { plan, email } = Route.useSearch();
  const priceId = plan === "aguiar_anual" ? "aguiar_anual" : "aguiar_mensal";
  const label = priceId === "aguiar_anual" ? "Anual — R$ 500/ano" : "Mensal — R$ 50/mês";
  const returnUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/checkout/return?plan=${priceId}&session_id={CHECKOUT_SESSION_ID}`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper, #f7f3ea)" }}>
      <PaymentTestModeBanner />
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Assinar Aguiar — {label}</h2>
          <Link to="/" style={{ color: "var(--ink-soft, #666)" }}>← Voltar</Link>
        </div>
        <StripeEmbeddedCheckout priceId={priceId} customerEmail={email} returnUrl={returnUrl} />
      </div>
    </div>
  );
}