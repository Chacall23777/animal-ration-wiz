import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useServerFn } from "@tanstack/react-start";
import { resolveAccess, registerTrial } from "@/lib/access.functions";
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
  // Sem cadastro público. Apenas: Entrar OU Iniciar teste gratuito (Stripe trial).
  const [screen, setScreen] = useState<"choice" | "login" | "trial" | "denied" | "forgot">("choice");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const resolve = useServerFn(resolveAccess);
  const trialSignup = useServerFn(registerTrial);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/" });
    });
  }, [navigate]);

  /** Após qualquer autenticação bem-sucedida, valida access_control. */
  async function gateAfterAuth(userEmail: string) {
    const res = await resolve({ data: { email: userEmail } });
    const type = res.access_type;
    if (!type || type === "blocked") {
      await supabase.auth.signOut();
      setScreen("denied");
      setErr("");
      return false;
    }
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setInfo("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const ok = await gateAfterAuth(email);
      if (ok) {
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
    // Popup mode retornou tokens. Valida o acesso pelo email.
    const { data: userData } = await supabase.auth.getUser();
    const em = userData.user?.email;
    if (!em) {
      await supabase.auth.signOut();
      setScreen("denied");
      return;
    }
    const ok = await gateAfterAuth(em);
    if (ok) void navigate({ to: "/" });
  }

  function goToTrial() {
    setErr("");
    setInfo("");
    setScreen("trial");
  }

  async function submitTrial(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setInfo("");
    setBusy(true);
    try {
      await trialSignup({ data: { email, password, full_name: fullName } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      void navigate({ to: "/checkout", search: { plan: "aguiar_vitalicio" } });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setInfo("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/set-password`,
      });
      if (error) throw error;
      setInfo("Enviamos um link para o seu e-mail. Verifique também a caixa de spam.");
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
      <h1 className="paywall-title">AGUIAR NUTRIÇÃO ANIMAL</h1>
      <div className="tag paywall-tag">Consultoria Rural</div>

      {screen === "choice" && (
        <div className="box login-box" style={{ maxWidth: 460, margin: "24px auto" }}>
          <h4 style={{ marginTop: 0 }}>Bem-vindo ao ARNA</h4>
          <p className="disclaimer" style={{ marginBottom: 16 }}>
            Escolha uma das opções abaixo. O acesso é individual — apenas emails autorizados podem entrar.
          </p>
          <button
            className="btn"
            onClick={() => setScreen("login")}
            type="button"
            style={{ marginBottom: 10, width: "100%" }}
          >
            Entrar
          </button>
          <button
            className="btn"
            onClick={goToTrial}
            type="button"
            style={{
              width: "100%",
              background: "linear-gradient(135deg,#d4a72c,#8f6d1f)",
              color: "#111",
              border: "1px solid #8f6d1f",
              fontWeight: 700,
            }}
          >
            Quero testar o ARNAR
          </button>
          <p className="disclaimer" style={{ marginTop: 12 }}>
            7 dias grátis. No 8º dia cobrança única de <b>R$ 97</b> = acesso vitalício. Cancele antes para não ser cobrado.
          </p>
          <p className="disclaimer" style={{ marginTop: 16 }}>
            <Link to="/">← Voltar</Link>
          </p>
        </div>
      )}

      {screen === "login" && (
        <div className="box login-box" style={{ maxWidth: 420, margin: "24px auto" }}>
          <h4>Entrar</h4>
          <button
            className="btn"
            onClick={google}
            type="button"
            style={{ marginBottom: 12, background: "#fff", color: "#111", border: "1px solid #ccc" }}
          >
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
              {busy ? "…" : "Entrar"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => {
              setErr("");
              setInfo("");
              setPassword("");
              setScreen("forgot");
            }}
            style={{
              marginTop: 14,
              width: "100%",
              background: "transparent",
              color: "#d4a72c",
              border: "1px solid #d4a72c",
              borderRadius: 8,
              padding: "10px 14px",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Esqueci minha senha
          </button>
          <p className="disclaimer" style={{ marginTop: 12 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setScreen("choice"); }}>← Voltar</a>
          </p>
        </div>
      )}

      {screen === "forgot" && (
        <div className="box login-box" style={{ maxWidth: 420, margin: "24px auto" }}>
          <h4>Redefinir senha</h4>
          <p className="disclaimer" style={{ marginBottom: 12 }}>
            Informe seu e-mail cadastrado. Enviaremos um link para você criar uma nova senha.
          </p>
          <form onSubmit={submitForgot}>
            <div className="field">
              <label>E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
              />
            </div>
            {err && <p className="disclaimer warn">{err}</p>}
            {info && <p className="disclaimer">{info}</p>}
            <button className="btn" disabled={busy} type="submit">
              {busy ? "…" : "Enviar link de redefinição"}
            </button>
          </form>
          <p className="disclaimer" style={{ marginTop: 12 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setErr(""); setInfo(""); setScreen("login"); }}>← Voltar para o login</a>
          </p>
        </div>
      )}

      {screen === "trial" && (
        <div className="box login-box" style={{ maxWidth: 460, margin: "24px auto" }}>
          <h4 style={{ marginTop: 0 }}>Quero testar o ARNAR</h4>
          <p className="disclaimer" style={{ marginBottom: 12 }}>
            Crie sua conta em 30 segundos. No próximo passo você cadastra o cartão para
            liberar os <b>7 dias grátis</b>. No 8º dia é feita uma <b>única cobrança de R$ 97</b>
            e seu acesso passa a ser <b>vitalício</b>. Cancele antes do 8º dia sem custo.
          </p>
          <form onSubmit={submitTrial}>
            <div className="field">
              <label>Nome completo</label>
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
            </div>
            <div className="field">
              <label>E-mail</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
            </div>
            <div className="field">
              <label>Senha</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mín. 6 caracteres" />
            </div>
            {err && <p className="disclaimer warn">{err}</p>}
            <button className="btn" disabled={busy} type="submit" style={{
              width: "100%",
              background: "linear-gradient(135deg,#d4a72c,#8f6d1f)",
              color: "#111",
              border: "1px solid #8f6d1f",
              fontWeight: 700,
            }}>
              {busy ? "…" : "Continuar para o cartão"}
            </button>
          </form>
          <p className="disclaimer" style={{ marginTop: 12 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setScreen("choice"); setErr(""); }}>← Voltar</a>
          </p>
        </div>
      )}
      {screen === "denied" && (
        <div className="box login-box" style={{ maxWidth: 460, margin: "24px auto" }}>
          <h4 style={{ marginTop: 0 }}>Email não autorizado</h4>
          <p className="disclaimer">
            Este email ainda não tem acesso ao ARNAR. Você pode iniciar o teste gratuito de 7 dias agora mesmo,
            ou pedir a um administrador para liberar seu acesso.
          </p>
          <button className="btn" onClick={goToTrial} type="button" style={{
            width: "100%",
            background: "linear-gradient(135deg,#d4a72c,#8f6d1f)",
            color: "#111",
            border: "1px solid #8f6d1f",
            fontWeight: 700,
            marginTop: 8,
          }}>
            Iniciar teste gratuito
          </button>
          <p className="disclaimer" style={{ marginTop: 12 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setScreen("choice"); setErr(""); }}>← Voltar</a>
          </p>
        </div>
      )}
    </div>
  );
}