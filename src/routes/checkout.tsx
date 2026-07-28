import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>(email);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        void navigate({ to: "/auth" });
        return;
      }
      setUserId(data.user.id);
      setUserEmail(data.user.email ?? email);
      setReady(true);
    });
  }, [navigate, email]);

  // Default to the lifetime plan. Legacy monthly/anual mantidos apenas para compatibilidade retroativa.
  const priceId =
    plan === "aguiar_anual" || plan === "aguiar_mensal" ? plan : "aguiar_vitalicio";
  const label =
    priceId === "aguiar_vitalicio"
      ? "Acesso vitalício — 7 dias grátis, depois R$ 97 (cobrança única)"
      : priceId === "aguiar_anual"
        ? "Anual — R$ 500/ano"
        : "Mensal — R$ 50/mês";
  const returnUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/checkout/return?plan=${priceId}&session_id={CHECKOUT_SESSION_ID}`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper, #f7f3ea)" }}>
      <PaymentTestModeBanner />
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Aguiar ARNA — {label}</h2>
          <Link to="/" style={{ color: "var(--ink-soft, #666)" }}>← Voltar</Link>
        </div>
        {priceId === "aguiar_vitalicio" && (
          <div style={{ padding: 12, marginBottom: 16, background: "#fff8e1", border: "1px solid #f0d97a", borderRadius: 8, fontSize: 14, lineHeight: 1.5 }}>
            <b>Como funciona:</b> você cadastra um cartão válido e ganha 7 dias grátis para testar o app.
            No 8º dia é feita uma <b>única cobrança de R$ 97,00</b> e seu acesso passa a ser <b>vitalício</b>,
            com todas as atualizações incluídas. Você pode cancelar durante o período gratuito sem custo.
          </div>
        )}
        {ready && userId ? (
          <StripeEmbeddedCheckout priceId={priceId} customerEmail={userEmail} userId={userId} returnUrl={returnUrl} />
        ) : (
          <p style={{ padding: 20 }}>Carregando…</p>
        )}
      </div>
    </div>
  );
}