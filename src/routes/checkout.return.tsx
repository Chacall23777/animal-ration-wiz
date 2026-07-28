import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { finalizeCheckout } from "@/lib/admin.functions";
import { getStripeEnvironment } from "@/lib/stripe";

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
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!session_id) return;
    finalizeCheckout({ data: { sessionId: session_id, environment: getStripeEnvironment() } })
      .then(() => setGranted(true))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [session_id, plan]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        {session_id ? (
          <>
            <h1 style={{ marginBottom: 12 }}>Tudo certo ✓</h1>
            <p style={{ color: "var(--ink-soft, #666)" }}>
              {plan === "aguiar_vitalicio"
                ? "Seus 7 dias gratuitos começaram. No 8º dia faremos uma única cobrança de R$ 97 e seu acesso passa a ser vitalício."
                : plan === "aguiar_anual"
                  ? "Sua assinatura anual foi ativada."
                  : "Sua assinatura mensal foi ativada."}
              {granted ? " Acesso liberado." : err ? "" : " Confirmando…"}
            </p>
            {err && <p style={{ color: "crimson", fontSize: 13 }}>Erro ao registrar: {err}</p>}
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