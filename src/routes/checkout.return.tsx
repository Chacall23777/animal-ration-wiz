import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

type Search = { session_id?: string; plan?: string };

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
    plan: typeof s.plan === "string" ? s.plan : undefined,
  }),
  component: CheckoutReturn,
  head: () => ({
    meta: [
      { title: "Assinatura confirmada — Aguiar Nutrição Animal" },
      { name: "description", content: "Pagamento confirmado." },
    ],
  }),
});

function CheckoutReturn() {
  const { session_id, plan } = Route.useSearch();
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!session_id) return;
    // Sem backend/webhook: liberamos acesso local com base no plano retornado.
    // Quando Lovable Cloud for reativado, isso passa a ser feito por webhook.
    const days = plan === "aguiar_anual" ? 365 : 30;
    const until = new Date();
    until.setDate(until.getDate() + days);
    try {
      const raw = localStorage.getItem("aguiar_account");
      const acc = raw ? JSON.parse(raw) : null;
      if (acc?.email) {
        const subsRaw = localStorage.getItem("aguiar_subscribers");
        const subs = subsRaw ? JSON.parse(subsRaw) : {};
        subs[acc.email] = until.toISOString();
        localStorage.setItem("aguiar_subscribers", JSON.stringify(subs));
        localStorage.setItem(
          "aguiar_account",
          JSON.stringify({ ...acc, validUntil: until.toISOString() }),
        );
      }
      setGranted(true);
    } catch {
      setGranted(true);
    }
  }, [session_id, plan]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        {session_id ? (
          <>
            <h1 style={{ marginBottom: 12 }}>Pagamento confirmado ✓</h1>
            <p style={{ color: "var(--ink-soft, #666)" }}>
              Sua assinatura {plan === "aguiar_anual" ? "anual" : "mensal"} foi ativada.
              {granted ? " Acesso liberado." : ""}
            </p>
            <p className="mono" style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>Sessão: {session_id}</p>
            <Link to="/" style={{ display: "inline-block", marginTop: 20, padding: "10px 18px", background: "var(--green, #2e5b3a)", color: "white", borderRadius: 8, textDecoration: "none" }}>
              Voltar ao app
            </Link>
          </>
        ) : (
          <p>Nenhuma sessão encontrada.</p>
        )}
      </div>
    </div>
  );
}