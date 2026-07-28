import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import arnaLogo from "@/assets/arna-logo.png.asset.json";
import "./aguiar.css";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Entrar — Aguiar Nutrição Animal" },
      { name: "description", content: "Acesse sua conta ARNA para usar a calculadora, plantel e o consultor IA." },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setInfo("Cadastro criado. Verifique seu e-mail para confirmar, então entre.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        void navigate({ to: "/" });
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setErr("");
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if ("error" in res && res.error) {
      setErr(res.error instanceof Error ? res.error.message : String(res.error));
      return;
    }
    if ("redirected" in res && res.redirected) return;
    void navigate({ to: "/" });
  }

  return (
    <div className="wrap paywall-wrap">
      <div className="paywall-hero">
        <img src={arnaLogo.url} alt="ARNA" className="paywall-logo" />
      </div>
      <h1 className="paywall-title">AGUIAR NUTRIÇÃO ANIMAL</h1>
      <div className="tag paywall-tag">Consultoria Rural</div>

      <div className="box login-box" style={{ maxWidth: 420, margin: "24px auto" }}>
        <h4>{mode === "login" ? "Entrar" : "Criar conta"}</h4>
        <button className="btn" onClick={google} type="button" style={{ marginBottom: 12, background: "#fff", color: "#111", border: "1px solid #ccc" }}>
          Continuar com Google
        </button>
        <form onSubmit={submit}>
          <div className="field">
            <label>E-mail</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
          </div>
          <div className="field">
            <label>Senha</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && <p className="disclaimer warn">{err}</p>}
          {info && <p className="disclaimer">{info}</p>}
          <button className="btn" disabled={busy} type="submit">
            {busy ? "…" : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <p className="disclaimer" style={{ marginTop: 12 }}>
          {mode === "login" ? (
            <>Novo por aqui? <a href="#" onClick={(e) => { e.preventDefault(); setMode("signup"); }}>Criar conta</a></>
          ) : (
            <>Já tem conta? <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); }}>Entrar</a></>
          )}
          {" · "}
          <Link to="/">Voltar</Link>
        </p>
      </div>
    </div>
  );
}