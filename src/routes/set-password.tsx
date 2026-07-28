import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import arnaLogo from "@/assets/arna-logo.png.asset.json";
import "./aguiar.css";

export const Route = createFileRoute("/set-password")({
  component: SetPasswordPage,
  head: () => ({
    meta: [
      { title: "Definir senha — ARNA" },
      { name: "description", content: "Defina sua senha e ative seu acesso vitalício ao ARNA." },
    ],
  }),
});

function SetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Ao chegar via magic link, o Supabase preenche a sessão automaticamente (detectSessionInUrl).
    let cancelled = false;
    async function boot() {
      // dá um instante para o SDK processar o hash da URL
      await new Promise((r) => setTimeout(r, 200));
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        setErr(
          "Link inválido ou expirado. Peça a um administrador para reenviar o convite (o link é válido por 30 minutos).",
        );
        setReady(true);
        return;
      }
      setEmail(data.user.email ?? null);
      setReady(true);
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setInfo("");
    if (password.length < 6) {
      setErr("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setErr("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setInfo("Senha definida! Redirecionando…");
      setTimeout(() => void navigate({ to: "/" }), 800);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap paywall-wrap">
      <div className="paywall-hero">
        <img src={arnaLogo.url} alt="ARNA" className="paywall-logo" />
      </div>
      <h1 className="paywall-title">DEFINIR SENHA</h1>
      <div className="tag paywall-tag">Ative seu acesso vitalício</div>

      <div className="box login-box" style={{ maxWidth: 440, margin: "24px auto" }}>
        {!ready ? (
          <p className="disclaimer">Validando convite…</p>
        ) : email ? (
          <>
            <p className="disclaimer" style={{ marginTop: 0 }}>
              Você foi convidado como <b>{email}</b>. Defina sua senha para entrar.
            </p>
            <form onSubmit={submit}>
              <div className="field">
                <label>Nova senha</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Confirmar senha</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {err && <p className="disclaimer warn">{err}</p>}
              {info && <p className="disclaimer">{info}</p>}
              <button className="btn" disabled={busy} type="submit">
                {busy ? "…" : "Definir senha e entrar"}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="disclaimer warn">{err || "Link inválido."}</p>
            <p className="disclaimer">
              <a href="/auth">← Ir para tela de login</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}