import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import "./aguiar.css";
import arnaLogo from "@/assets/arna-logo.png.asset.json";
import { arnaChat, type ArnaMemory, type ArnaChatMsg, type LoteContext } from "@/utils/arna-chat.functions";
import { useSession } from "@/lib/session";
import { useTrialReports, TRIAL_MAX_LOTES, TRIAL_MAX_ANIMAIS, TRIAL_MAX_RELATORIOS, isTrial } from "@/lib/trial-limits";
import { supabase } from "@/integrations/supabase/client";
import {
  listSubscribers,
  grantAccess,
  revokeAccess,
  getAdminStats,
  listAllUsers,
  setAdminRole,
  grantLifetime,
} from "@/lib/admin.functions";
import {
  exportLotePDF,
  exportLoteXLSX,
  exportPlantelPDF,
  exportPlantelXLSX,
  downloadBlob,
  shareBlob,
  printPDFBlob,
  slug,
  type ReportLote,
  type ReportContext,
} from "@/lib/plantel-report";
import {
  useLotesStore,
  setLotes,
  setEstoque,
  type Lote,
  type Vacina,
} from "@/lib/lotes-store";
import { SPECIES, SOON_SPECIES } from "@/lib/species";
import {
  useFinanceStore,
  setTransacoes,
  CATEGORIAS,
  type TxCategory,
} from "@/lib/finance-store";

export const Route = createFileRoute("/")({
  component: AguiarApp,
});

/* ============================================================
   AGUIAR NUTRIÇÃO ANIMAL — App único (calculadora + plantel + chat + conta)
   ============================================================ */

// AnimalKey vem do store (mantido como alias para não quebrar o restante do arquivo)
import type { AnimalKey as _AnimalKey } from "@/lib/lotes-store";
type AnimalKey = _AnimalKey;

type Phase = {
  id: string;
  label: string;
  // fórmula de referência em % (soma 100)
  formula: { milho: number; soja: number; nucleo: number; calcario: number };
  // consumo médio kg/animal/dia
  consumoDia: number;
  // produção estimada (para poedeiras: ovos/dia/ave; suínos: ganho kg/dia)
  producao?: number;
  producaoTipo?: "ovos" | "ganho";
};

const PHASES: Record<AnimalKey, Phase[]> = {
  poultry: [
    {
      id: "pre-inicial",
      label: "Pré-Inicial (0–2 sem)",
      formula: { milho: 58, soja: 35, nucleo: 5, calcario: 2 },
      consumoDia: 0.02,
    },
    {
      id: "inicial",
      label: "Inicial (2–6 sem)",
      formula: { milho: 60, soja: 33, nucleo: 5, calcario: 2 },
      consumoDia: 0.045,
    },
    {
      id: "crescimento",
      label: "Crescimento (6–14 sem)",
      formula: { milho: 63, soja: 28, nucleo: 5, calcario: 4 },
      consumoDia: 0.075,
    },
    {
      id: "pre-postura",
      label: "Pré-Postura (14–18 sem)",
      formula: { milho: 62, soja: 28, nucleo: 5, calcario: 5 },
      consumoDia: 0.09,
    },
    {
      id: "postura",
      label: "Postura (18+ sem)",
      formula: { milho: 60, soja: 25, nucleo: 5, calcario: 10 },
      consumoDia: 0.115,
      producao: 0.85,
      producaoTipo: "ovos",
    },
  ],
  swine: [
    {
      id: "creche",
      label: "Creche (7–30 kg)",
      formula: { milho: 63, soja: 32, nucleo: 5, calcario: 0 },
      consumoDia: 0.9,
      producao: 0.45,
      producaoTipo: "ganho",
    },
    {
      id: "crescimento",
      label: "Crescimento (30–70 kg)",
      formula: { milho: 69, soja: 27, nucleo: 4, calcario: 0 },
      consumoDia: 2.2,
      producao: 0.85,
      producaoTipo: "ganho",
    },
    {
      id: "terminacao",
      label: "Terminação (70–110 kg)",
      formula: { milho: 73, soja: 23, nucleo: 4, calcario: 0 },
      consumoDia: 3.0,
      producao: 0.95,
      producaoTipo: "ganho",
    },
    {
      id: "gestacao",
      label: "Gestação",
      formula: { milho: 68, soja: 27, nucleo: 5, calcario: 0 },
      consumoDia: 2.5,
    },
    {
      id: "lactacao",
      label: "Lactação",
      formula: { milho: 65, soja: 30, nucleo: 5, calcario: 0 },
      consumoDia: 5.5,
    },
  ],
};

const INGR_META = [
  { key: "milho", label: "Milho", swatch: "seg-milho" },
  { key: "soja", label: "Farelo de Soja", swatch: "seg-soja" },
  { key: "nucleo", label: "Núcleo", swatch: "seg-nucleo" },
  { key: "calcario", label: "Calcário", swatch: "seg-calcario" },
] as const;

// Suínos NÃO recebem farelo de ostra na formulação — essa fonte de cálcio é
// específica de poedeiras (casca do ovo). Para suínos usamos só calcário calcítico.
function calcarioLabel(animal: AnimalKey) {
  return animal === "poultry" ? "Calcário / Farelo de Ostra" : "Calcário Calcítico";
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR");
}
function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ============================================================ */

function AguiarApp() {
  const [tab, setTab] = useState<
    "inicio" | "calc" | "plantel" | "financeiro" | "sanitario" | "chat" | "conta"
  >("inicio");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem("arna_theme") as "light" | "dark") || "light";
  });
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("arna_theme", theme); } catch {}
  }, [theme]);
  const navigate = useNavigate();
  const session = useSession();

  useEffect(() => {
    if (!session.loading && !session.user) void navigate({ to: "/auth" });
  }, [session.loading, session.user, navigate]);

  if (session.loading) return <div className="wrap"><p style={{ padding: 24 }}>Carregando…</p></div>;
  if (!session.user) return null;
  if (!session.active) return <PaywallScreen />;

  const acctLabel = session.user.email?.split("@")[0] ?? "Conta";

  return (
    <div className="wrap">
      {/* MASTHEAD */}
      <header className="masthead">
        <div className="brand">
          <img src={arnaLogo.url} alt="ARNA — Nutrição Animal Inteligente" className="brand-logo" />
          <div>
            <h1>AGUIAR NUTRIÇÃO ANIMAL</h1>
            <div className="tag">CONSULTORIA RURAL</div>
          </div>
        </div>
        <div
          className="meta"
          style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="theme-toggle"
              aria-label="Alternar modo claro/escuro"
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button className="acct-badge" onClick={() => setTab("conta")}>
              <span className="dot" />
              {acctLabel}
            </button>
          </div>
          <div>Calculadora · Plantel · 1 kg a 100 t</div>
        </div>
      </header>

      <TrialBanner session={session} onGoToConta={() => setTab("conta")} />

      {/* TABS */}
      <nav className="tabs">
        <button
          className={`tab-btn ${tab === "inicio" ? "active" : ""}`}
          onClick={() => setTab("inicio")}
        >
          Início
        </button>
        <button
          className={`tab-btn ${tab === "calc" ? "active" : ""}`}
          onClick={() => setTab("calc")}
        >
          Calculadora
        </button>
        <button
          className={`tab-btn ${tab === "plantel" ? "active" : ""}`}
          onClick={() => setTab("plantel")}
        >
          Meu Plantel
        </button>
        <button
          className={`tab-btn ${tab === "financeiro" ? "active" : ""}`}
          onClick={() => setTab("financeiro")}
        >
          Financeiro
        </button>
        <button
          className={`tab-btn ${tab === "sanitario" ? "active" : ""}`}
          onClick={() => setTab("sanitario")}
        >
          Sanitário
        </button>
        <button
          className={`tab-btn ${tab === "chat" ? "active" : ""}`}
          onClick={() => setTab("chat")}
        >
          Consultor IA
        </button>
        <button
          className={`tab-btn ${tab === "conta" ? "active" : ""}`}
          onClick={() => setTab("conta")}
        >
          Conta / Assinatura
        </button>
      </nav>

      <section className={`panel ${tab === "inicio" ? "active" : ""}`}>
        <InicioPanel
          produtor={session.user.user_metadata?.full_name || acctLabel}
          onGoTo={setTab}
        />
      </section>
      <section className={`panel ${tab === "calc" ? "active" : ""}`}>
        <CalculadoraPanel />
      </section>
      <section className={`panel ${tab === "plantel" ? "active" : ""}`}>
        <PlantelPanel
          produtor={session.user.user_metadata?.full_name || acctLabel}
          email={session.user.email ?? undefined}
          session={session}
        />
      </section>
      <section className={`panel ${tab === "financeiro" ? "active" : ""}`}>
        <FinanceiroPanel />
      </section>
      <section className={`panel ${tab === "sanitario" ? "active" : ""}`}>
        <SanitarioPanel />
      </section>
      <section className={`panel ${tab === "chat" ? "active" : ""}`}>
        <ChatPanel />
      </section>
      <section className={`panel ${tab === "conta" ? "active" : ""}`}>
        <ContaPanel />
      </section>
    </div>
  );
}

/* ===================== TELA DE ASSINATURA (paywall) ===================== */

/* ===================== DASHBOARD (INÍCIO) ===================== */
type TabKey =
  | "inicio"
  | "calc"
  | "plantel"
  | "financeiro"
  | "sanitario"
  | "chat"
  | "conta";

type Alerta = {
  id: string;
  nivel: "info" | "warn" | "danger";
  titulo: string;
  detalhe: string;
  acao?: { label: string; onClick: () => void };
};

function InicioPanel({
  produtor,
  onGoTo,
}: {
  produtor: string;
  onGoTo: (t: TabKey) => void;
}) {
  const { lotes, estoque } = useLotesStore();
  const [saco, setSaco] = useState(25);

  const hoje = new Date();

  const linhas = useMemo(() => {
    return lotes.map((l) => {
      const phase = PHASES[l.animal].find((p) => p.id === l.phaseId) ?? PHASES[l.animal][0];
      const idadeDias = Math.max(0, daysBetween(new Date(l.dataEntrada), hoje));
      const qtdAtual = Math.max(0, Math.round(l.qtd * (1 - l.mortalidadePct / 100)));
      const consumoDia = phase.consumoDia * qtdAtual;
      // ganho médio esperado
      const ganhoDiaExp =
        l.animal === "swine" && phase.producaoTipo === "ganho" && phase.producao
          ? phase.producao
          : l.animal === "poultry"
            ? (l.pesoAlvo - l.pesoInicial) / 140
            : 0;
      let pesoAtual = l.pesoInicial;
      if (ganhoDiaExp > 0) {
        pesoAtual = Math.min(l.pesoAlvo, l.pesoInicial + ganhoDiaExp * idadeDias);
      }
      const diasRestantes =
        ganhoDiaExp > 0
          ? Math.max(0, Math.ceil((l.pesoAlvo - pesoAtual) / ganhoDiaExp))
          : 0;
      const custoMes = consumoDia * 30 * estoque.precoKg;
      const receitaMes =
        l.animal === "poultry" && phase.producaoTipo === "ovos" && phase.producao
          ? ((phase.producao * qtdAtual) / 12) * 30 * l.precoVenda
          : l.animal === "swine" && phase.producaoTipo === "ganho" && phase.producao
            ? phase.producao * qtdAtual * 30 * l.precoVenda
            : 0;
      // próxima vacina
      const entradaMs = new Date(l.dataEntrada).getTime();
      const proxVac = [...l.vacinas]
        .filter((v) => !v.aplicadaEm)
        .map((v) => ({ ...v, data: new Date(entradaMs + v.diaIdeal * 86_400_000) }))
        .sort((a, b) => a.data.getTime() - b.data.getTime())[0];
      return {
        lote: l,
        phase,
        idadeDias,
        qtdAtual,
        pesoAtual,
        consumoDia,
        diasRestantes,
        custoMes,
        receitaMes,
        proxVac,
      };
    });
  }, [lotes, estoque.precoKg]);

  const totais = useMemo(() => {
    return linhas.reduce(
      (a, l) => ({
        animais: a.animais + l.qtdAtual,
        consumoDia: a.consumoDia + l.consumoDia,
        custoMes: a.custoMes + l.custoMes,
        receitaMes: a.receitaMes + l.receitaMes,
      }),
      { animais: 0, consumoDia: 0, custoMes: 0, receitaMes: 0 },
    );
  }, [linhas]);

  const consumoMes = totais.consumoDia * 30;
  const consumoAno = totais.consumoDia * 365;
  const lucroMes = totais.receitaMes - totais.custoMes;

  // ============= Alertas Inteligentes =============
  const alertas: Alerta[] = useMemo(() => {
    const arr: Alerta[] = [];

    // Onboarding
    if (lotes.length === 0) {
      arr.push({
        id: "onboarding",
        nivel: "info",
        titulo: "Bem-vindo ao ARNA!",
        detalhe: "Cadastre seu primeiro lote para receber cálculos automáticos, alertas e relatórios.",
        acao: { label: "Adicionar lote", onClick: () => onGoTo("plantel") },
      });
    }

    // Estoque de ração
    if (totais.consumoDia > 0 && estoque.kg > 0) {
      const diasEstoque = Math.floor(estoque.kg / totais.consumoDia);
      if (diasEstoque <= 3) {
        arr.push({
          id: "racao-critica",
          nivel: "danger",
          titulo: "ATENÇÃO! Seus animais irão ficar sem ração em " + diasEstoque + " dias.",
          detalhe: `Estoque atual: ${estoque.kg.toFixed(0)} kg · Consumo diário: ${totais.consumoDia.toFixed(1)} kg. Compre ração o quanto antes.`,
        });
      } else if (diasEstoque <= 7) {
        const faltamKg = Math.ceil(totais.consumoDia * 30 - estoque.kg);
        arr.push({
          id: "racao-baixa",
          nivel: "warn",
          titulo: `Você precisará comprar mais ${faltamKg.toLocaleString("pt-BR")} kg de ração em ${diasEstoque} dias.`,
          detalhe: `Isso garante 30 dias de operação para seu plantel atual.`,
        });
      }
    } else if (totais.consumoDia > 0 && estoque.kg === 0) {
      arr.push({
        id: "racao-sem-registro",
        nivel: "info",
        titulo: "Informe seu estoque de ração",
        detalhe: "Registre quantos kg de ração você tem hoje e o ARNA calcula quando você precisará repor.",
      });
    }

    // Vacinas próximas
    for (const l of linhas) {
      if (!l.proxVac) continue;
      const diasAte = Math.ceil((l.proxVac.data.getTime() - hoje.getTime()) / 86_400_000);
      if (diasAte <= 0 && diasAte > -3) {
        arr.push({
          id: `vac-hoje-${l.lote.id}`,
          nivel: "danger",
          titulo: `Aplique HOJE: ${l.proxVac.nome} · Lote ${l.lote.nome}`,
          detalhe: `Data ideal: ${l.proxVac.data.toLocaleDateString("pt-BR")}.`,
        });
      } else if (diasAte > 0 && diasAte <= 5) {
        arr.push({
          id: `vac-${l.lote.id}`,
          nivel: "warn",
          titulo: `A vacina ${l.proxVac.nome} deverá ser aplicada em ${diasAte} dia${diasAte === 1 ? "" : "s"} · Lote ${l.lote.nome}`,
          detalhe: `Data prevista: ${l.proxVac.data.toLocaleDateString("pt-BR")}.`,
        });
      }
    }

    // Fim de ciclo próximo
    for (const l of linhas) {
      if (l.diasRestantes > 0 && l.diasRestantes <= 10) {
        arr.push({
          id: `ciclo-${l.lote.id}`,
          nivel: "info",
          titulo: `Lote ${l.lote.nome}: peso ideal em ${l.diasRestantes} dia${l.diasRestantes === 1 ? "" : "s"}`,
          detalhe: `Peso estimado hoje: ${l.pesoAtual.toFixed(2)} kg · Peso alvo: ${l.lote.pesoAlvo.toFixed(2)} kg.`,
        });
      }
    }

    return arr;
  }, [lotes, linhas, totais.consumoDia, estoque.kg, hoje.getTime()]);

  // ============= "Comprar Ração" =============
  const compraSugerida = useMemo(() => {
    // Sugestão: cobrir 30 dias descontando o que já tem em estoque
    const alvoKg = Math.ceil(totais.consumoDia * 30);
    const kgFalta = Math.max(0, alvoKg - estoque.kg);
    const sacos = Math.ceil(kgFalta / saco);
    const valor = kgFalta * estoque.precoKg;
    return { alvoKg, kgFalta, sacos, valor };
  }, [totais.consumoDia, estoque.kg, estoque.precoKg, saco]);

  return (
    <>
      <div className="box hero-box">
        <div className="hero-flex">
          <div>
            <div className="hero-eyebrow">Olá, {produtor.split(" ")[0]}</div>
            <h4 className="hero-title">Seu plantel em um só lugar</h4>
            <div className="sub">
              Dashboard inteligente com consumo, custos, vacinas, lucro estimado e alertas em tempo real.
            </div>
          </div>
          <div className="hero-cta">
            <button className="btn" onClick={() => onGoTo("plantel")}>Meu Plantel</button>
            <button className="btn ghost" onClick={() => onGoTo("chat")}>Consultor IA</button>
          </div>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="alerts-stack">
          {alertas.map((a) => (
            <div key={a.id} className={`alert alert-${a.nivel} animate-fade-in`}>
              <div className="alert-icon" aria-hidden>
                {a.nivel === "danger" ? "⚠️" : a.nivel === "warn" ? "⏰" : "💡"}
              </div>
              <div className="alert-body">
                <div className="alert-title">{a.titulo}</div>
                <div className="alert-detail">{a.detalhe}</div>
              </div>
              {a.acao && (
                <button className="btn small" onClick={a.acao.onClick}>
                  {a.acao.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi-card kpi-primary">
          <div className="kpi-lbl">Animais no plantel</div>
          <div className="kpi-val">{totais.animais.toLocaleString("pt-BR")}</div>
          <div className="kpi-sub">{lotes.length} lote{lotes.length === 1 ? "" : "s"} ativo{lotes.length === 1 ? "" : "s"}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">Ração hoje</div>
          <div className="kpi-val">{totais.consumoDia.toFixed(1)} <span className="kpi-unit">kg</span></div>
          <div className="kpi-sub">{consumoMes.toFixed(0)} kg/mês · {consumoAno.toFixed(0)} kg/ano</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">Custo/mês</div>
          <div className="kpi-val">{brl(totais.custoMes)}</div>
          <div className="kpi-sub">Ração a {brl(estoque.precoKg)}/kg</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">Lucro estimado/mês</div>
          <div className={`kpi-val ${lucroMes >= 0 ? "profit-pos" : "profit-neg"}`}>{brl(lucroMes)}</div>
          <div className="kpi-sub">Receita {brl(totais.receitaMes)}</div>
        </div>
      </div>

      <div className="box">
        <h4>Estoque de ração</h4>
        <div className="sub">Registre seu estoque atual e o preço médio pago por kg. Usamos isso para calcular alertas e custo.</div>
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="field">
            <label>Estoque atual (kg)</label>
            <input
              type="number"
              min={0}
              value={estoque.kg}
              onChange={(e) => setEstoque({ ...estoque, kg: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="field">
            <label>Preço médio (R$/kg)</label>
            <input
              type="number"
              step={0.01}
              min={0}
              value={estoque.precoKg}
              onChange={(e) => setEstoque({ ...estoque, precoKg: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="field">
            <label>Tamanho do saco (kg)</label>
            <input
              type="number"
              min={1}
              value={saco}
              onChange={(e) => setSaco(parseFloat(e.target.value) || 25)}
            />
          </div>
        </div>

        {totais.consumoDia > 0 && (
          <div className="buy-card">
            <div>
              <div className="buy-eyebrow">Comprar Ração</div>
              <div className="buy-title">
                Você precisará de <b>{compraSugerida.kgFalta.toLocaleString("pt-BR")} kg</b> ({compraSugerida.sacos} sacos de {saco} kg) para 30 dias.
              </div>
              <div className="buy-sub">
                Valor estimado <b>{brl(compraSugerida.valor)}</b> · com base no preço médio informado.
              </div>
            </div>
            <button
              className="btn"
              onClick={() => alert("Em breve: integração com parceiros comerciais para compra direta.")}
            >
              Comprar
            </button>
          </div>
        )}
      </div>

      {linhas.length > 0 && (
        <div className="box">
          <h4>Seus lotes</h4>
          <div className="dash-lote-list">
            {linhas.map((l) => (
              <button
                key={l.lote.id}
                className={`dash-lote sel-${l.lote.animal === "poultry" ? "poultry" : "swine"}`}
                onClick={() => onGoTo("plantel")}
              >
                <div className="dash-lote-head">
                  <span className={`tag-pill ${l.lote.animal === "poultry" ? "poultry" : "swine"}`}>
                    {l.lote.animal === "poultry" ? "Aves" : "Suínos"}
                  </span>
                  <strong>{l.lote.nome}</strong>
                </div>
                <div className="dash-lote-grid">
                  <div><span>Animais</span><b>{l.qtdAtual}</b></div>
                  <div><span>Idade</span><b>{l.idadeDias}d</b></div>
                  <div><span>Peso</span><b>{l.pesoAtual.toFixed(2)}kg</b></div>
                  <div><span>Ração/dia</span><b>{l.consumoDia.toFixed(1)}kg</b></div>
                  <div><span>Custo/mês</span><b>{brl(l.custoMes)}</b></div>
                  <div><span>Próx. vacina</span><b>{l.proxVac ? l.proxVac.nome : "—"}</b></div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="box">
        <h4>Espécies disponíveis</h4>
        <div className="sub">O ARNA já opera com suínos e aves. Novas espécies chegam em breve — seu produtor não precisa mudar de app.</div>
        <div className="species-grid">
          {SPECIES.map((sp) => (
            <div
              key={sp.key}
              className={`species-chip ${sp.available ? "on" : "off"}`}
              title={sp.categories.join(" · ")}
            >
              <div className="species-emoji" aria-hidden>{sp.emoji}</div>
              <div className="species-name">{sp.label}</div>
              <div className="species-sub">
                {sp.available ? sp.categories.slice(0, 3).join(" · ") : (sp.soon || "Em breve")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PaywallScreen() {
  return _PaywallScreenReal();
}

/* ===================== FINANCEIRO ===================== */
function FinanceiroPanel() {
  // dynamic imports live at top; require them via require-style is not needed since store is already imported below via useMemo
  const { lotes } = useLotesStore();
  const txs = useFinanceStore();
  const [kind, setKind] = useState<"receita" | "despesa">("despesa");
  const [categoria, setCategoria] = useState<TxCategory>("racao");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState<number>(0);
  const [data, setData] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [loteId, setLoteId] = useState<string>("");
  const [mesRef, setMesRef] = useState<string>(() => new Date().toISOString().slice(0, 7));

  // Ajusta categoria conforme tipo
  useEffect(() => {
    const validas = (Object.keys(CATEGORIAS) as TxCategory[]).filter((k) => CATEGORIAS[k].kind === kind);
    if (!validas.includes(categoria)) setCategoria(validas[0]);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  function add() {
    if (!descricao.trim() || !valor) return alert("Preencha descrição e valor.");
    setTransacoes((prev) => [
      {
        id: `tx-${Date.now()}`,
        data,
        kind,
        categoria,
        descricao: descricao.trim(),
        valor: Math.abs(valor),
        loteId: loteId || undefined,
      },
      ...prev,
    ]);
    setDescricao("");
    setValor(0);
  }
  function remover(id: string) {
    setTransacoes((prev) => prev.filter((t) => t.id !== id));
  }

  const doMes = useMemo(() => txs.filter((t) => t.data.startsWith(mesRef)), [txs, mesRef]);
  const totMes = useMemo(() => {
    const r = doMes.filter((t) => t.kind === "receita").reduce((a, t) => a + t.valor, 0);
    const d = doMes.filter((t) => t.kind === "despesa").reduce((a, t) => a + t.valor, 0);
    return { receita: r, despesa: d, lucro: r - d };
  }, [doMes]);

  // agrupar por categoria (despesas do mês)
  const porCategoria = useMemo(() => {
    const map = new Map<TxCategory, number>();
    for (const t of doMes.filter((t) => t.kind === "despesa")) {
      map.set(t.categoria, (map.get(t.categoria) || 0) + t.valor);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [doMes]);

  // últimos 6 meses
  const serieMeses = useMemo(() => {
    const now = new Date();
    const arr: { mes: string; label: string; receita: number; despesa: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" });
      const rec = txs.filter((t) => t.data.startsWith(key) && t.kind === "receita").reduce((a, t) => a + t.valor, 0);
      const des = txs.filter((t) => t.data.startsWith(key) && t.kind === "despesa").reduce((a, t) => a + t.valor, 0);
      arr.push({ mes: key, label, receita: rec, despesa: des });
    }
    return arr;
  }, [txs]);

  const maxSerie = Math.max(1, ...serieMeses.map((m) => Math.max(m.receita, m.despesa)));

  const catOptions = (Object.keys(CATEGORIAS) as TxCategory[]).filter((k) => CATEGORIAS[k].kind === kind);

  return (
    <>
      <div className="box hero-box">
        <div className="hero-flex">
          <div>
            <div className="hero-eyebrow">Financeiro</div>
            <h4 className="hero-title">Controle receitas e despesas do seu plantel</h4>
            <div className="sub">Categorize entradas e saídas, veja o lucro do mês e a evolução dos últimos 6 meses.</div>
          </div>
          <div className="hero-cta">
            <input
              type="month"
              value={mesRef}
              onChange={(e) => setMesRef(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }}
            />
          </div>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="kpi-card">
          <div className="kpi-lbl">Receita do mês</div>
          <div className="kpi-val profit-pos">{brl(totMes.receita)}</div>
          <div className="kpi-sub">{doMes.filter((t) => t.kind === "receita").length} lançamentos</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">Despesas do mês</div>
          <div className="kpi-val profit-neg">{brl(totMes.despesa)}</div>
          <div className="kpi-sub">{doMes.filter((t) => t.kind === "despesa").length} lançamentos</div>
        </div>
        <div className="kpi-card kpi-primary">
          <div className="kpi-lbl">Lucro do mês</div>
          <div className={`kpi-val ${totMes.lucro >= 0 ? "profit-pos" : "profit-neg"}`}>{brl(totMes.lucro)}</div>
          <div className="kpi-sub">Margem {totMes.receita ? ((totMes.lucro / totMes.receita) * 100).toFixed(1) : "0"}%</div>
        </div>
      </div>

      <div className="box">
        <h4>Últimos 6 meses</h4>
        <div className="sub">Barras verdes = receitas · Barras vermelhas = despesas</div>
        <div className="chart6">
          {serieMeses.map((m) => (
            <div key={m.mes} className="chart6-col">
              <div className="chart6-bars">
                <div
                  className="chart6-bar rec"
                  style={{ height: `${(m.receita / maxSerie) * 100}%` }}
                  title={`Receita ${brl(m.receita)}`}
                />
                <div
                  className="chart6-bar des"
                  style={{ height: `${(m.despesa / maxSerie) * 100}%` }}
                  title={`Despesa ${brl(m.despesa)}`}
                />
              </div>
              <div className="chart6-lbl">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="box">
        <h4>Novo lançamento</h4>
        <div className="sub">Categorias de despesa (ração, vacinas, mão de obra…) e receita (venda de animais, ovos…).</div>
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="field">
            <label>Tipo</label>
            <div className="unit-toggle" style={{ display: "inline-flex" }}>
              <button className={kind === "despesa" ? "active" : ""} onClick={() => setKind("despesa")}>Despesa</button>
              <button className={kind === "receita" ? "active" : ""} onClick={() => setKind("receita")}>Receita</button>
            </div>
          </div>
          <div className="field">
            <label>Categoria</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as TxCategory)}>
              {catOptions.map((k) => (
                <option key={k} value={k}>{CATEGORIAS[k].label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Descrição</label>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: 10 sacos ração 25kg" />
          </div>
          <div className="field">
            <label>Valor (R$)</label>
            <input type="number" min={0} step={0.01} value={valor} onChange={(e) => setValor(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="field">
            <label>Lote (opcional)</label>
            <select value={loteId} onChange={(e) => setLoteId(e.target.value)}>
              <option value="">— sem lote —</option>
              {lotes.map((l) => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn" onClick={add}>Adicionar</button>
        </div>
      </div>

      {porCategoria.length > 0 && (
        <div className="box">
          <h4>Despesas por categoria · {mesRef}</h4>
          <div className="cat-list">
            {porCategoria.map(([k, v]) => (
              <div key={k} className="cat-row">
                <div className="cat-name">{CATEGORIAS[k].label}</div>
                <div className="cat-bar">
                  <div className="cat-bar-fill" style={{ width: `${(v / totMes.despesa) * 100}%` }} />
                </div>
                <div className="cat-val">{brl(v)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="box">
        <h4>Lançamentos · {mesRef}</h4>
        {doMes.length === 0 && <div className="sub">Nenhum lançamento neste mês.</div>}
        {doMes.length > 0 && (
          <div className="tx-list">
            {doMes.map((t) => {
              const lote = t.loteId ? lotes.find((l) => l.id === t.loteId)?.nome : null;
              return (
                <div key={t.id} className={`tx-row tx-${t.kind}`}>
                  <div className="tx-date">{new Date(t.data + "T00:00:00").toLocaleDateString("pt-BR")}</div>
                  <div className="tx-body">
                    <div className="tx-title">{t.descricao}</div>
                    <div className="tx-meta">
                      {CATEGORIAS[t.categoria].label}
                      {lote ? ` · ${lote}` : ""}
                    </div>
                  </div>
                  <div className={`tx-val ${t.kind === "receita" ? "profit-pos" : "profit-neg"}`}>
                    {t.kind === "receita" ? "+" : "-"} {brl(t.valor)}
                  </div>
                  <button className="btn small ghost" onClick={() => remover(t.id)} title="Remover">×</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* ===================== SANITÁRIO (calendário de vacinas) ===================== */
function SanitarioPanel() {
  const { lotes } = useLotesStore();
  const hoje = new Date();

  type Evento = {
    id: string;
    loteId: string;
    loteNome: string;
    animal: AnimalKey;
    nome: string;
    data: Date;
    aplicada: boolean;
    diasAte: number;
  };

  const eventos: Evento[] = useMemo(() => {
    const arr: Evento[] = [];
    for (const l of lotes) {
      const entrada = new Date(l.dataEntrada).getTime();
      for (const v of l.vacinas) {
        const data = new Date(entrada + v.diaIdeal * 86_400_000);
        const diasAte = Math.ceil((data.getTime() - hoje.getTime()) / 86_400_000);
        arr.push({
          id: `${l.id}-${v.id}`,
          loteId: l.id,
          loteNome: l.nome,
          animal: l.animal,
          nome: v.nome,
          data,
          aplicada: !!v.aplicadaEm,
          diasAte,
        });
      }
    }
    return arr.sort((a, b) => a.data.getTime() - b.data.getTime());
  }, [lotes, hoje.getTime()]);

  const atrasadas = eventos.filter((e) => !e.aplicada && e.diasAte < 0);
  const hojeE = eventos.filter((e) => !e.aplicada && e.diasAte === 0);
  const proximas = eventos.filter((e) => !e.aplicada && e.diasAte > 0 && e.diasAte <= 30);
  const futuras = eventos.filter((e) => !e.aplicada && e.diasAte > 30);
  const feitas = eventos.filter((e) => e.aplicada);

  function toggleAplicada(loteId: string, vacId: string, aplicar: boolean) {
    setLotes((prev) =>
      prev.map((l) =>
        l.id !== loteId
          ? l
          : {
              ...l,
              vacinas: l.vacinas.map((v) =>
                v.id !== vacId ? v : { ...v, aplicadaEm: aplicar ? new Date().toISOString() : undefined },
              ),
            },
      ),
    );
  }

  function renderGrupo(titulo: string, lista: Evento[], className: string) {
    if (lista.length === 0) return null;
    return (
      <div className="box">
        <h4>{titulo} <span className="cnt-pill">{lista.length}</span></h4>
        <div className="san-list">
          {lista.map((e) => (
            <div key={e.id} className={`san-item ${className}`}>
              <div className="san-date">
                <div className="san-day">{e.data.getDate()}</div>
                <div className="san-mon">{e.data.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</div>
              </div>
              <div className="san-body">
                <div className="san-title">{e.nome}</div>
                <div className="san-meta">
                  <span className={`tag-pill ${e.animal === "poultry" ? "poultry" : "swine"}`}>
                    {e.animal === "poultry" ? "Aves" : "Suínos"}
                  </span>
                  {e.loteNome} · {e.aplicada
                    ? "aplicada"
                    : e.diasAte === 0
                      ? "aplicar hoje"
                      : e.diasAte < 0
                        ? `atrasada há ${Math.abs(e.diasAte)}d`
                        : `em ${e.diasAte} dia${e.diasAte === 1 ? "" : "s"}`}
                </div>
              </div>
              <button
                className="btn small ghost"
                onClick={() => toggleAplicada(e.loteId, e.id.split("-").slice(1).join("-"), !e.aplicada)}
              >
                {e.aplicada ? "Desmarcar" : "Marcar aplicada"}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="box hero-box">
        <div className="hero-flex">
          <div>
            <div className="hero-eyebrow">Calendário sanitário</div>
            <h4 className="hero-title">Vacinas e manejo do plantel em um só lugar</h4>
            <div className="sub">
              As datas são calculadas a partir da entrada de cada lote no cronograma padrão de vacinas. Marque como aplicada quando concluir.
            </div>
          </div>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi-card kpi-primary">
          <div className="kpi-lbl">Aplicar hoje</div>
          <div className="kpi-val">{hojeE.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">Atrasadas</div>
          <div className={`kpi-val ${atrasadas.length ? "profit-neg" : ""}`}>{atrasadas.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">Próximos 30 dias</div>
          <div className="kpi-val">{proximas.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">Aplicadas</div>
          <div className="kpi-val profit-pos">{feitas.length}</div>
        </div>
      </div>

      {lotes.length === 0 && (
        <div className="box">
          <div className="sub">Cadastre lotes no Meu Plantel para gerar o calendário sanitário automaticamente.</div>
        </div>
      )}

      {renderGrupo("Atrasadas", atrasadas, "danger")}
      {renderGrupo("Aplicar hoje", hojeE, "danger")}
      {renderGrupo("Próximos 30 dias", proximas, "warn")}
      {renderGrupo("Futuras", futuras, "info")}
      {renderGrupo("Já aplicadas", feitas, "done")}
    </>
  );
}

function _PaywallScreenReal() {
  return (
    <div className="wrap paywall-wrap">
      <div className="paywall-hero">
        <img src={arnaLogo.url} alt="ARNA — Nutrição Animal Inteligente" className="paywall-logo" />
      </div>
      <h1 className="paywall-title">AGUIAR NUTRIÇÃO ANIMAL</h1>
      <div className="tag paywall-tag">Consultoria Rural</div>
      <p className="paywall-copy">
        Calculadora de ração, gestão de plantel e consultor IA para avicultura e suinocultura. Entre
        com sua conta ou assine para liberar o app completo.
      </p>
      <ContaPanel />
    </div>
  );
}

/* ===================== CALCULADORA ===================== */
function CalculadoraPanel() {
  const [animal, setAnimal] = useState<AnimalKey>("poultry");
  const [phaseId, setPhaseId] = useState<string>(PHASES.poultry[2].id);
  const [qtyKg, setQtyKg] = useState<number>(500);
  const [unit, setUnit] = useState<"kg" | "t">("kg");
  const [history, setHistory] = useState<{ label: string; qty: number; when: string }[]>([]);
  const [saveName, setSaveName] = useState("");

  const phases = PHASES[animal];
  const phase = phases.find((p) => p.id === phaseId) ?? phases[0];

  const displayQty = unit === "kg" ? qtyKg : qtyKg / 1000;

  const rows = INGR_META
    .filter((m) => !(animal === "swine" && m.key === "calcario"))
    .map((m) => {
      const pct = phase.formula[m.key];
      const label = m.key === "calcario" ? calcarioLabel(animal) : m.label;
      return { ...m, label, pct, kg: (qtyKg * pct) / 100 };
    });

  return (
    <>
      <div className="section-label">1. Tipo de criação</div>
      <div className="animal-row">
        <div
          className={`animal-card sel-poultry ${animal === "poultry" ? "active" : ""}`}
          onClick={() => {
            setAnimal("poultry");
            setPhaseId(PHASES.poultry[2].id);
          }}
        >
          <div className="eyebrow">Avicultura</div>
          <h3>Frango de Postura</h3>
          <p>Poedeiras — da fase pré-inicial até a postura</p>
        </div>
        <div
          className={`animal-card sel-swine ${animal === "swine" ? "active" : ""}`}
          onClick={() => {
            setAnimal("swine");
            setPhaseId(PHASES.swine[0].id);
          }}
        >
          <div className="eyebrow">Suinocultura</div>
          <h3>Suínos</h3>
          <p>Da creche à terminação, gestação e lactação</p>
        </div>
      </div>

      <div className="section-label">2. Fase</div>
      <div className="phase-row">
        {phases.map((p) => (
          <button
            key={p.id}
            className={`phase-chip ${phaseId === p.id ? "active" : ""}`}
            onClick={() => setPhaseId(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="section-label">3. Quantidade total de ração</div>
      <div className="qty-box">
        <input
          type="number"
          value={displayQty}
          min={unit === "kg" ? 1 : 0.001}
          max={unit === "kg" ? 100000 : 100}
          step={unit === "kg" ? 1 : 0.01}
          onChange={(e) => {
            const v = parseFloat(e.target.value) || 0;
            setQtyKg(unit === "kg" ? v : v * 1000);
          }}
        />
        <div className="unit-toggle">
          <button className={unit === "kg" ? "active" : ""} onClick={() => setUnit("kg")}>
            kg
          </button>
          <button className={unit === "t" ? "active" : ""} onClick={() => setUnit("t")}>
            toneladas
          </button>
        </div>
        <input
          type="range"
          min={1}
          max={100000}
          value={qtyKg}
          onChange={(e) => setQtyKg(parseFloat(e.target.value))}
        />
        <div className="qty-hint">Arraste para ajustar (1 kg – 100.000 kg / 100 t)</div>
      </div>

      {/* TICKET */}
      <div className="ticket">
        <div className={`stamp ${animal === "poultry" ? "poultry" : ""}`}>
          {phase.label.split(" ")[0].toUpperCase()}
        </div>
        <h4>{animal === "poultry" ? "Frango de Postura" : "Suínos"}</h4>
        <div className="sub">
          {phase.label} · {qtyKg.toLocaleString("pt-BR")} kg
        </div>
        <div className="stack-bar">
          {rows.map((r) => (
            <div key={r.key} className={`stack-seg ${r.swatch}`} style={{ width: `${r.pct}%` }} />
          ))}
        </div>
        <div className="ingr-list">
          {rows.map((r) => (
            <div key={r.key} className="ingr-row">
              <div className="ingr-name">
                <span className={`swatch ${r.swatch}`} />
                {r.label}
              </div>
              <div className="ingr-pct">{r.pct}%</div>
              <div className="ingr-kg">
                {r.kg.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg
              </div>
            </div>
          ))}
          <div className="ingr-total">
            <div className="ingr-name">Total</div>
            <div className="ingr-kg">{qtyKg.toLocaleString("pt-BR")} kg</div>
          </div>
        </div>

        <div className="save-row">
          <input
            placeholder="Nome (ex.: Lote galpão 2)"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
          />
          <button
            className="btn"
            onClick={() => {
              const label = saveName.trim() || `${phase.label}`;
              setHistory((h) => [
                { label, qty: qtyKg, when: new Date().toLocaleTimeString("pt-BR") },
                ...h,
              ]);
              setSaveName("");
            }}
          >
            Salvar no histórico
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <div className="history box">
          <h4>Histórico desta sessão</h4>
          {history.map((h, i) => (
            <div key={i} className="hist-item">
              <span>
                <b>{h.label}</b> · {h.qty.toLocaleString("pt-BR")} kg
              </span>
              <span>{h.when}</span>
            </div>
          ))}
        </div>
      )}

      <p className="disclaimer">
        * Fórmulas de referência{" "}
        {animal === "poultry"
          ? "(milho, farelo de soja, núcleo e calcário/farelo de ostra — fonte extra de cálcio para casca do ovo na fase de postura)"
          : "(milho, farelo de soja e núcleo — o cálcio já vem no núcleo mineral do suíno; farelo de ostra e calcário não fazem parte da formulação)"}
        . Ajustes finos variam por linhagem, peso e desempenho — valide com um zootecnista ou médico
        veterinário antes de usar em escala.
      </p>
    </>
  );
}

/* ===================== PLANTEL ===================== */
// Tipos Lote/Vacina agora vêm de "@/lib/lotes-store" para ficarem compartilhados
// com o Dashboard (Início). Não redefinir aqui.

const VACINAS_PADRAO: Record<AnimalKey, { nome: string; diaIdeal: number }[]> = {
  poultry: [
    { nome: "Marek", diaIdeal: 1 },
    { nome: "Gumboro", diaIdeal: 14 },
    { nome: "Bouba Aviária", diaIdeal: 35 },
    { nome: "Newcastle", diaIdeal: 60 },
    { nome: "Reforço Newcastle", diaIdeal: 120 },
  ],
  swine: [
    { nome: "Ferro dextrano", diaIdeal: 3 },
    { nome: "Micoplasma (1ª dose)", diaIdeal: 21 },
    { nome: "Circovírus", diaIdeal: 28 },
    { nome: "Peste Suína Clássica", diaIdeal: 60 },
  ],
};

// LOTES_KEY / loadLotes / saveLotes migrados para "@/lib/lotes-store"

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function PlantelPanel({
  produtor = "",
  email,
  session,
}: {
  produtor?: string;
  email?: string;
  session: ReturnType<typeof useSession>;
}) {
  const [precos, setPrecos] = useState({ milho: 1.4, soja: 2.2, nucleo: 8.5, calcario: 0.6 });
  const [animal, setAnimal] = useState<AnimalKey>("poultry");
  const [phaseId, setPhaseId] = useState(PHASES.poultry[4].id);
  const [qtd, setQtd] = useState(100);
  const [preco, setPreco] = useState(12);
  const [nome, setNome] = useState("Lote 1");
  const [dataEntrada, setDataEntrada] = useState(() => new Date().toISOString().slice(0, 10));
  const [pesoInicial, setPesoInicial] = useState(0.05);
  const [pesoAlvo, setPesoAlvo] = useState(1.8);
  const [mortalidadePct, setMortalidadePct] = useState(3);
  const { lotes } = useLotesStore();
  const trialR = useTrialReports(session);
  const trial = trialR.trial;
  const trialAnimaisAtuais = lotes.reduce((acc, l) => acc + (l.qtd || 0), 0);
  const trialAnimaisRestantes = Math.max(0, TRIAL_MAX_ANIMAIS - trialAnimaisAtuais);

  const phases = PHASES[animal];

  function custoRacaoPorKg(phase: Phase) {
    const f = phase.formula;
    return (
      (f.milho * precos.milho +
        f.soja * precos.soja +
        f.nucleo * precos.nucleo +
        f.calcario * precos.calcario) /
      100
    );
  }

  const hoje = new Date();

  const linhas = lotes.map((l) => {
    const phase = PHASES[l.animal].find((p) => p.id === l.phaseId) ?? PHASES[l.animal][0];
    const phaseList = PHASES[l.animal];
    const phaseIdx = phaseList.findIndex((p) => p.id === phase.id);
    const proximaFase = phaseList[phaseIdx + 1] ?? null;

    const idadeDias = Math.max(0, daysBetween(new Date(l.dataEntrada), hoje));
    const qtdAtual = Math.max(0, Math.round(l.qtd * (1 - l.mortalidadePct / 100)));

    // Peso estimado do animal hoje
    let pesoAtual = l.pesoInicial;
    let ganhoMedioDia = phase.producaoTipo === "ganho" && phase.producao ? phase.producao : 0;
    if (l.animal === "swine" && ganhoMedioDia > 0) {
      pesoAtual = Math.min(l.pesoAlvo, l.pesoInicial + ganhoMedioDia * idadeDias);
    } else if (l.animal === "poultry") {
      // curva simples: pintainha 0,05kg → 1,8kg em ~140 dias
      const ganhoAve = (l.pesoAlvo - l.pesoInicial) / 140;
      pesoAtual = Math.min(l.pesoAlvo, l.pesoInicial + ganhoAve * idadeDias);
      ganhoMedioDia = ganhoAve;
    }

    // Consumo (usa quantidade viva atual)
    const consumoDia = phase.consumoDia * qtdAtual;
    const consumoSemana = consumoDia * 7;
    const consumoMes = consumoDia * 30;
    const consumoAno = consumoDia * 365;

    // Dias e ração até o peso alvo (suínos) ou até 80 semanas de postura (aves)
    let diasRestantes = 0;
    if (l.animal === "swine" && ganhoMedioDia > 0) {
      diasRestantes = Math.max(0, Math.ceil((l.pesoAlvo - pesoAtual) / ganhoMedioDia));
    } else if (l.animal === "poultry") {
      // ciclo de referência 560 dias (~80 sem) para postura, 42 dias para corte
      const ciclo = phase.producaoTipo === "ovos" ? 560 : 42;
      diasRestantes = Math.max(0, ciclo - idadeDias);
    }
    const racaoTotalCiclo = consumoDia * (idadeDias + diasRestantes);

    // Custo mensal / receita
    const custoMes = consumoMes * custoRacaoPorKg(phase);
    let receitaMes = 0;
    let producaoLabel = "—";
    let previsaoProdutiva = "—";
    if (phase.producaoTipo === "ovos" && phase.producao) {
      const ovosDia = phase.producao * qtdAtual;
      receitaMes = ((ovosDia * 30) / 12) * l.precoVenda;
      producaoLabel = `${ovosDia.toFixed(0)} ovos/dia · ${Math.round(ovosDia * 30)} ovos/mês`;
      previsaoProdutiva = `${Math.round(ovosDia * diasRestantes)} ovos até fim do ciclo`;
    } else if (phase.producaoTipo === "ganho" && phase.producao) {
      const ganhoDia = phase.producao * qtdAtual;
      receitaMes = ganhoDia * 30 * l.precoVenda;
      producaoLabel = `${ganhoDia.toFixed(1)} kg/dia · ${(ganhoDia * 30).toFixed(0)} kg/mês`;
      previsaoProdutiva = `${(l.pesoAlvo * qtdAtual).toFixed(0)} kg vivo total (abate)`;
    }

    // Próxima vacina
    const entradaMs = new Date(l.dataEntrada).getTime();
    const proxVac = [...l.vacinas]
      .filter((v) => !v.aplicadaEm)
      .map((v) => ({ ...v, data: new Date(entradaMs + v.diaIdeal * 86_400_000) }))
      .sort((a, b) => a.data.getTime() - b.data.getTime())[0];

    return {
      lote: l, phase, proximaFase, idadeDias, qtdAtual, pesoAtual,
      consumoDia, consumoSemana, consumoMes, consumoAno,
      diasRestantes, racaoTotalCiclo, custoMes, receitaMes,
      producaoLabel, previsaoProdutiva, proxVac,
      lucro: receitaMes - custoMes,
    };
  });

  const tot = linhas.reduce(
    (a, l) => ({
      custo: a.custo + l.custoMes,
      receita: a.receita + l.receitaMes,
      lucro: a.lucro + l.lucro,
      animais: a.animais + l.qtdAtual,
      consumoMes: a.consumoMes + l.consumoMes,
    }),
    { custo: 0, receita: 0, lucro: 0, animais: 0, consumoMes: 0 },
  );

  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  function toReport(l: (typeof linhas)[number]): ReportLote {
    return {
      id: l.lote.id,
      nome: l.lote.nome,
      animal: l.lote.animal,
      fase: l.phase.label,
      proximaFase: l.proximaFase ? l.proximaFase.label : "Ciclo final",
      dataEntrada: l.lote.dataEntrada,
      qtdInicial: l.lote.qtd,
      qtdAtual: l.qtdAtual,
      idadeDias: l.idadeDias,
      pesoInicial: l.lote.pesoInicial,
      pesoAtual: l.pesoAtual,
      pesoAlvo: l.lote.pesoAlvo,
      ganhoLabel:
        l.phase.producaoTipo === "ganho" && l.phase.producao
          ? `${l.phase.producao.toFixed(2)} kg/dia/animal`
          : l.lote.animal === "poultry"
            ? `${((l.lote.pesoAlvo - l.lote.pesoInicial) / 140 * 1000).toFixed(0)} g/dia`
            : "—",
      mortalidadePct: l.lote.mortalidadePct,
      consumoDia: l.consumoDia,
      consumoSemana: l.consumoSemana,
      consumoMes: l.consumoMes,
      consumoAno: l.consumoAno,
      racaoTotalCiclo: l.racaoTotalCiclo,
      diasRestantes: l.diasRestantes,
      producaoLabel: l.producaoLabel,
      previsaoProdutiva: l.previsaoProdutiva,
      custoMes: l.custoMes,
      receitaMes: l.receitaMes,
      lucroMes: l.lucro,
      proximaVacina: l.proxVac
        ? `${l.proxVac.nome} · ${fmtDate(l.proxVac.data)}`
        : "Todas aplicadas",
      vacinas: l.lote.vacinas.map((v) => ({
        nome: v.nome,
        diaIdeal: v.diaIdeal,
        aplicadaEm: v.aplicadaEm,
        dataPrevista: new Date(
          new Date(l.lote.dataEntrada).getTime() + v.diaIdeal * 86_400_000,
        ).toISOString(),
      })),
    };
  }

  function ctx(): ReportContext {
    return {
      produtor: produtor || (email ? email.split("@")[0] : "Produtor ARNA"),
      email,
      logoUrl: arnaLogo.url,
      observacoes: obs,
    };
  }

  async function loteAction(
    l: (typeof linhas)[number],
    kind: "pdf" | "xlsx" | "share" | "print",
  ) {
    if (trial && !trialR.increment()) {
      alert(`Modo TESTE: limite de ${TRIAL_MAX_RELATORIOS} relatórios atingido. Assine (R$ 97, vitalício) para gerar relatórios ilimitados.`);
      return;
    }
    const key = `${l.lote.id}:${kind}`;
    setBusy(key);
    try {
      const r = toReport(l);
      const c = ctx();
      const base = `arna-lote-${slug(l.lote.nome)}`;
      if (kind === "xlsx") {
        downloadBlob(exportLoteXLSX(r, c), `${base}.xlsx`);
      } else {
        const blob = await exportLotePDF(r, c);
        if (kind === "pdf") downloadBlob(blob, `${base}.pdf`);
        else if (kind === "print") printPDFBlob(blob);
        else await shareBlob(blob, `${base}.pdf`, `Relatório do lote ${l.lote.nome}`);
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível gerar o relatório.");
    } finally {
      setBusy(null);
    }
  }

  async function plantelAction(kind: "pdf" | "xlsx" | "share" | "print") {
    if (trial && !trialR.increment()) {
      alert(`Modo TESTE: limite de ${TRIAL_MAX_RELATORIOS} relatórios atingido. Assine (R$ 97, vitalício) para gerar relatórios ilimitados.`);
      return;
    }
    const key = `plantel:${kind}`;
    setBusy(key);
    try {
      const rs = linhas.map(toReport);
      const c = ctx();
      const base = `arna-plantel-${new Date().toISOString().slice(0, 10)}`;
      if (kind === "xlsx") {
        downloadBlob(exportPlantelXLSX(rs, c), `${base}.xlsx`);
      } else {
        const blob = await exportPlantelPDF(rs, c);
        if (kind === "pdf") downloadBlob(blob, `${base}.pdf`);
        else if (kind === "print") printPDFBlob(blob);
        else await shareBlob(blob, `${base}.pdf`, "Relatório do plantel");
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível gerar o relatório.");
    } finally {
      setBusy(null);
    }
  }

  function addLote() {
    if (trial) {
      if (lotes.length >= TRIAL_MAX_LOTES) {
        alert(`Modo TESTE: máximo de ${TRIAL_MAX_LOTES} lotes. Assine (R$ 97, vitalício) para cadastrar lotes ilimitados.`);
        return;
      }
      if (trialAnimaisAtuais + qtd > TRIAL_MAX_ANIMAIS) {
        alert(`Modo TESTE: máximo de ${TRIAL_MAX_ANIMAIS} animais somados (você já tem ${trialAnimaisAtuais}). Reduza a quantidade ou assine para acesso ilimitado.`);
        return;
      }
    }
    const vacinas: Vacina[] = VACINAS_PADRAO[animal].map((v, i) => ({
      id: `v_${i}_${Math.random().toString(36).slice(2, 6)}`,
      nome: v.nome,
      diaIdeal: v.diaIdeal,
    }));
    setLotes((l) => [
      ...l,
      {
        id: Math.random().toString(36).slice(2),
        nome: nome || `Lote ${l.length + 1}`,
        animal, phaseId, qtd,
        dataEntrada, pesoInicial, pesoAlvo,
        mortalidadePct, precoVenda: preco, vacinas,
      },
    ]);
  }

  function toggleVacina(loteId: string, vacId: string) {
    setLotes((ls) => ls.map((l) => l.id !== loteId ? l : {
      ...l,
      vacinas: l.vacinas.map((v) => v.id !== vacId ? v : {
        ...v,
        aplicadaEm: v.aplicadaEm ? undefined : new Date().toISOString().slice(0, 10),
      }),
    }));
  }

  function avancarFase(loteId: string) {
    setLotes((ls) => ls.map((l) => {
      if (l.id !== loteId) return l;
      const list = PHASES[l.animal];
      const idx = list.findIndex((p) => p.id === l.phaseId);
      const nxt = list[idx + 1];
      return nxt ? { ...l, phaseId: nxt.id } : l;
    }));
  }

  return (
    <>
      <div className="box">
        <h4>Preço dos insumos</h4>
        <div className="sub">
          Usado para calcular o custo por kg de ração de cada fórmula automaticamente
        </div>
        <div className="price-grid">
          {(["milho", "soja", "nucleo", "calcario"] as const)
            .filter((k) => !(animal === "swine" && k === "calcario"))
            .map((k) => (
            <div className="field" key={k}>
              <label>
                {k === "milho"
                  ? "Milho"
                  : k === "soja"
                    ? "Farelo de Soja"
                    : k === "nucleo"
                      ? "Núcleo"
                      : calcarioLabel(animal)}{" "}
                (R$/kg)
              </label>
              <input
                type="number"
                step={0.01}
                value={precos[k]}
                onChange={(e) => setPrecos({ ...precos, [k]: parseFloat(e.target.value) || 0 })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="box">
        <h4>Adicionar lote ao plantel</h4>
        <div className="sub">
          Cadastre quantos lotes quiser — todos os indicadores (idade, peso, consumo, vacinas,
          previsão produtiva e custos) são calculados automaticamente
        </div>
        {trial && (
          <div
            style={{
              margin: "10px 0 12px",
              padding: "10px 12px",
              borderRadius: 10,
              background: "linear-gradient(90deg,#fff3e0,#ffe0b2)",
              color: "#5d3a00",
              fontSize: 12,
              lineHeight: 1.45,
              border: "1px solid #ffcc80",
            }}
          >
            <b>Modo TESTE (7 dias grátis) —</b> limites:
            <span style={{ marginLeft: 6 }}>
              lotes {lotes.length}/{TRIAL_MAX_LOTES} · animais {trialAnimaisAtuais}/{TRIAL_MAX_ANIMAIS} · relatórios {trialR.reportsUsed}/{trialR.reportsMax}
            </span>
            <div style={{ opacity: 0.85, marginTop: 4 }}>
              Após o 8º dia, R$ 97 (única cobrança) libera acesso <b>vitalício</b> e ilimitado.
            </div>
          </div>
        )}
        <div className="form-grid">
          <div className="field">
            <label>Nome do lote</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Galpão 2" />
          </div>
          <div className="field">
            <label>Animal</label>
            <select
              value={animal}
              onChange={(e) => {
                const a = e.target.value as AnimalKey;
                setAnimal(a);
                setPhaseId(PHASES[a][0].id);
                setPesoInicial(a === "poultry" ? 0.05 : 7);
                setPesoAlvo(a === "poultry" ? 1.8 : 110);
              }}
            >
              <option value="poultry">Frango de Postura</option>
              <option value="swine">Suínos</option>
            </select>
          </div>
          <div className="field">
            <label>Fase</label>
            <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Quantidade de animais</label>
            <input
              type="number"
              min={1}
              value={qtd}
              onChange={(e) => setQtd(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>Data de entrada</label>
            <input type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} />
          </div>
          <div className="field">
            <label>Peso inicial (kg/animal)</label>
            <input type="number" step={0.01} value={pesoInicial}
              onChange={(e) => setPesoInicial(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>Peso alvo (kg/animal)</label>
            <input type="number" step={0.1} value={pesoAlvo}
              onChange={(e) => setPesoAlvo(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>Mortalidade média (%)</label>
            <input type="number" step={0.1} value={mortalidadePct}
              onChange={(e) => setMortalidadePct(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>
              {animal === "poultry" ? "Preço dúzia de ovos (R$)" : "Preço kg vivo (R$)"}
            </label>
            <input
              type="number"
              step={0.01}
              value={preco}
              onChange={(e) => setPreco(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn" onClick={addLote}>Adicionar ao plantel</button>
        </div>
      </div>

      <div className="box">
        <h4>Plantel atual</h4>
        <div className="sub">
          Idade, peso, consumo (diário/semanal/mensal/anual), vacinas, previsão produtiva e
          resultado financeiro — tudo calculado automaticamente
        </div>
        {lotes.length === 0 ? (
          <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Nenhum lote adicionado ainda.
          </p>
        ) : (
          <>
            <div className="lote-cards">
              {linhas.map((l) => (
                <div key={l.lote.id} className="lote-card">
                  <div className="lote-head">
                    <div>
                      <span className={`tag-pill ${l.lote.animal === "poultry" ? "poultry" : "swine"}`}>
                        {l.lote.animal === "poultry" ? "Aves" : "Suínos"}
                      </span>{" "}
                      <strong>{l.lote.nome}</strong> · {l.phase.label}
                    </div>
                    <button
                      className="btn danger small"
                      onClick={() => setLotes((ls) => ls.filter((x) => x.id !== l.lote.id))}
                    >Remover</button>
                  </div>

                  <div className="lote-grid">
                    <div><span>Animais vivos</span><b>{l.qtdAtual} / {l.lote.qtd}</b></div>
                    <div><span>Idade</span><b>{l.idadeDias} dias</b></div>
                    <div><span>Peso atual (est.)</span><b>{l.pesoAtual.toFixed(2)} kg</b></div>
                    <div><span>Peso final previsto</span><b>{l.lote.pesoAlvo.toFixed(2)} kg</b></div>
                    <div><span>Ganho de peso</span><b>
                      {l.phase.producaoTipo === "ganho" && l.phase.producao
                        ? `${l.phase.producao.toFixed(2)} kg/dia/animal`
                        : l.lote.animal === "poultry"
                          ? `${((l.lote.pesoAlvo - l.lote.pesoInicial) / 140 * 1000).toFixed(0)} g/dia`
                          : "—"}
                    </b></div>
                    <div><span>Mortalidade média</span><b>{l.lote.mortalidadePct.toFixed(1)}%</b></div>
                    <div><span>Produção</span><b>{l.producaoLabel}</b></div>
                    <div><span>Previsão produtiva</span><b>{l.previsaoProdutiva}</b></div>
                    <div><span>Consumo diário</span><b>{l.consumoDia.toFixed(1)} kg</b></div>
                    <div><span>Consumo semanal</span><b>{l.consumoSemana.toFixed(0)} kg</b></div>
                    <div><span>Consumo mensal</span><b>{l.consumoMes.toFixed(0)} kg</b></div>
                    <div><span>Consumo anual</span><b>{l.consumoAno.toFixed(0)} kg</b></div>
                    <div><span>Ração total do ciclo</span><b>{l.racaoTotalCiclo.toFixed(0)} kg</b></div>
                    <div><span>Dias restantes ciclo</span><b>{l.diasRestantes} dias</b></div>
                    <div><span>Custo ração/mês</span><b>{brl(l.custoMes)}</b></div>
                    <div><span>Receita/mês</span><b>{brl(l.receitaMes)}</b></div>
                    <div><span>Lucro/mês</span>
                      <b className={l.lucro >= 0 ? "profit-pos" : "profit-neg"}>{brl(l.lucro)}</b>
                    </div>
                    <div><span>Próxima fase</span><b>
                      {l.proximaFase ? l.proximaFase.label : "Ciclo final"}
                    </b></div>
                    <div><span>Próxima vacina</span><b>
                      {l.proxVac
                        ? `${l.proxVac.nome} · ${fmtDate(l.proxVac.data)}`
                        : "Todas aplicadas"}
                    </b></div>
                  </div>

                  <div className="lote-actions">
                    {l.proximaFase && (
                      <button className="btn small" onClick={() => avancarFase(l.lote.id)}>
                        Avançar para: {l.proximaFase.label}
                      </button>
                    )}
                    <button
                      className="btn ghost small"
                      disabled={busy === `${l.lote.id}:pdf`}
                      onClick={() => loteAction(l, "pdf")}
                    >
                      {busy === `${l.lote.id}:pdf` ? "Gerando…" : "PDF"}
                    </button>
                    <button
                      className="btn ghost small"
                      disabled={busy === `${l.lote.id}:xlsx`}
                      onClick={() => loteAction(l, "xlsx")}
                    >
                      Excel
                    </button>
                    <button
                      className="btn ghost small"
                      disabled={busy === `${l.lote.id}:share`}
                      onClick={() => loteAction(l, "share")}
                    >
                      Compartilhar
                    </button>
                    <button
                      className="btn ghost small"
                      disabled={busy === `${l.lote.id}:print`}
                      onClick={() => loteAction(l, "print")}
                    >
                      Imprimir
                    </button>
                  </div>

                  <details className="lote-vacinas">
                    <summary>Calendário de vacinas ({l.lote.vacinas.filter((v) => v.aplicadaEm).length}/{l.lote.vacinas.length})</summary>
                    <ul>
                      {l.lote.vacinas.map((v) => {
                        const dataPrev = new Date(new Date(l.lote.dataEntrada).getTime() + v.diaIdeal * 86_400_000);
                        return (
                          <li key={v.id}>
                            <label>
                              <input type="checkbox" checked={!!v.aplicadaEm}
                                onChange={() => toggleVacina(l.lote.id, v.id)} />
                              <span>{v.nome}</span>
                              <em>· ideal: {fmtDate(dataPrev)} (dia {v.diaIdeal})</em>
                              {v.aplicadaEm && <b> ✓ aplicada {fmtDate(new Date(v.aplicadaEm))}</b>}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </div>
              ))}
            </div>

            <div className="summary-grid">
              <div className="summary-card">
                <div className="lbl">Animais vivos</div>
                <div className="val">{tot.animais}</div>
              </div>
              <div className="summary-card">
                <div className="lbl">Ração/mês (plantel)</div>
                <div className="val">{tot.consumoMes.toFixed(0)} kg</div>
              </div>
              <div className="summary-card">
                <div className="lbl">Custo ração/mês</div>
                <div className="val">{brl(tot.custo)}</div>
              </div>
              <div className="summary-card">
                <div className="lbl">Receita/mês</div>
                <div className="val">{brl(tot.receita)}</div>
              </div>
              <div className="summary-card">
                <div className="lbl">Lucro/mês</div>
                <div
                  className="val"
                  style={{ color: tot.lucro >= 0 ? "var(--good)" : "var(--bad)" }}
                >
                  {brl(tot.lucro)}
                </div>
              </div>
            </div>

            <div className="box" style={{ marginTop: 18, background: "var(--surface)" }}>
              <h4>Relatórios profissionais</h4>
              <div className="sub">
                PDF e Excel com logo, dados do produtor, indicadores por lote, calendário de
                vacinas, gráficos, QR Code e observações
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Observações (opcional — entram no relatório)</label>
                <input
                  type="text"
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Ex.: lote monitorado após reajuste da ração pré-inicial"
                />
              </div>
              <div className="save-row" style={{ marginTop: 0 }}>
                <button
                  className="btn"
                  disabled={busy === "plantel:pdf"}
                  onClick={() => plantelAction("pdf")}
                >
                  {busy === "plantel:pdf" ? "Gerando PDF…" : "Exportar PDF do plantel"}
                </button>
                <button
                  className="btn ghost"
                  disabled={busy === "plantel:xlsx"}
                  onClick={() => plantelAction("xlsx")}
                >
                  Exportar Excel
                </button>
                <button
                  className="btn ghost"
                  disabled={busy === "plantel:share"}
                  onClick={() => plantelAction("share")}
                >
                  Compartilhar
                </button>
                <button
                  className="btn ghost"
                  disabled={busy === "plantel:print"}
                  onClick={() => plantelAction("print")}
                >
                  Imprimir
                </button>
              </div>
            </div>
          </>
        )}
        <p className="disclaimer">
          * Ganho de peso, consumo/animal/dia e taxa de postura são médias de referência de mercado
          — variam por linhagem, genética, ambiência e manejo. Use como estimativa e ajuste com o
          acompanhamento real da sua granja/plantel.
        </p>
      </div>
    </>
  );
}

/* ===================== CHAT ===================== */
type Msg = { who: "user" | "ai" | "system-note"; text: string };

const SUGGESTIONS = [
  "Como reduzir mortalidade em pintainhas?",
  "Sinais de deficiência de cálcio em poedeiras",
  "Ração para terminação de suínos: cuidados",
];

const MEMORY_KEY = "arna_memory_v1";
const HISTORY_KEY = "arna_history_v1";
const CLIENT_ID_KEY = "arna_client_id_v1";

function getClientId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `c_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch { return ""; }
}

function loadMemory(): ArnaMemory {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}"); } catch { return {}; }
}
function saveMemory(m: ArnaMemory) {
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(m)); } catch {}
}
function loadHistory(): Msg[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveHistory(m: Msg[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(m.slice(-40))); } catch {}
}
const LOTE_NOTES_KEY = "arna_lote_notes_v1";
function loadLoteNotes(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(LOTE_NOTES_KEY) || "{}"); } catch { return {}; }
}
function saveLoteNotes(n: Record<string, string>) {
  try { localStorage.setItem(LOTE_NOTES_KEY, JSON.stringify(n)); } catch {}
}

function ChatPanel() {
  const session = useSession();
  const initialMsgs: Msg[] = [
    {
      who: "system-note",
      text: "Sou o ARNA AI — consultor virtual em nutrição animal. Me conte espécie, plantel e objetivo, e eu ajudo com formulação, manejo e cálculos. Sua memória fica salva neste dispositivo.",
    },
  ];
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    const h = loadHistory();
    return h.length ? h : initialMsgs;
  });
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [pro, setPro] = useState(false);
  const [memory, setMemory] = useState<ArnaMemory>(() => loadMemory());
  const [showMem, setShowMem] = useState(false);
  const [focusLoteId, setFocusLoteId] = useState<string>("");
  const [loteNotes, setLoteNotes] = useState<Record<string, string>>(() => loadLoteNotes());
  const bodyRef = useRef<HTMLDivElement>(null);
  const { lotes, estoque } = useLotesStore();

  const hojeChat = new Date();
  const loteContexts: LoteContext[] = useMemo(() => {
    return lotes.map((l) => {
      const phase = PHASES[l.animal].find((p) => p.id === l.phaseId) ?? PHASES[l.animal][0];
      const idadeDias = Math.max(0, daysBetween(new Date(l.dataEntrada), hojeChat));
      const qtdAtual = Math.max(0, Math.round(l.qtd * (1 - l.mortalidadePct / 100)));
      const consumoDia = phase.consumoDia * qtdAtual;
      const ganhoDiaExp =
        l.animal === "swine" && phase.producaoTipo === "ganho" && phase.producao
          ? phase.producao
          : l.animal === "poultry"
            ? (l.pesoAlvo - l.pesoInicial) / 140
            : 0;
      const pesoAtual = ganhoDiaExp > 0
        ? Math.min(l.pesoAlvo, l.pesoInicial + ganhoDiaExp * idadeDias)
        : l.pesoInicial;
      const custoMes = consumoDia * 30 * estoque.precoKg;
      const receitaMes =
        l.animal === "poultry" && phase.producaoTipo === "ovos" && phase.producao
          ? ((phase.producao * qtdAtual) / 12) * 30 * l.precoVenda
          : l.animal === "swine" && phase.producaoTipo === "ganho" && phase.producao
            ? phase.producao * qtdAtual * 30 * l.precoVenda
            : 0;
      const entradaMs = new Date(l.dataEntrada).getTime();
      const vacinasPendentes = l.vacinas
        .filter((v) => !v.aplicadaEm)
        .map((v) => {
          const data = new Date(entradaMs + v.diaIdeal * 86_400_000);
          return `${v.nome} (dia ${v.diaIdeal}, ${data.toLocaleDateString("pt-BR")})`;
        });
      return {
        id: l.id,
        nome: l.nome,
        animal: l.animal === "poultry" ? "Aves" : "Suínos",
        fase: phase.label,
        qtd: qtdAtual,
        idadeDias,
        pesoAtualKg: pesoAtual,
        consumoDiaKg: consumoDia,
        custoMesBRL: custoMes,
        receitaMesBRL: receitaMes,
        vacinasPendentes,
        observacoes: loteNotes[l.id]?.trim() || undefined,
      };
    });
  }, [lotes, estoque.precoKg, loteNotes]);

  useEffect(() => { saveLoteNotes(loteNotes); }, [loteNotes]);
  useEffect(() => {
    if (focusLoteId && !lotes.find((l) => l.id === focusLoteId)) setFocusLoteId("");
  }, [lotes, focusLoteId]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  useEffect(() => { saveHistory(msgs); }, [msgs]);
  useEffect(() => { saveMemory(memory); }, [memory]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || typing) return;
    const next: Msg[] = [...msgs, { who: "user", text: q }];
    setMsgs(next);
    setInput("");
    setTyping(true);

    const history: ArnaChatMsg[] = next
      .filter((m) => m.who === "user" || m.who === "ai")
      .map((m) => ({ role: m.who === "user" ? "user" : "assistant", content: m.text }));

    const memoryPayload: ArnaMemory = {
      ...memory,
      lotes: loteContexts,
      focusLoteId: focusLoteId || undefined,
      userName:
        memory.userName ||
        (session.user?.user_metadata?.full_name as string | undefined) ||
        (session.user?.email ? session.user.email.split("@")[0] : undefined),
      userEmail: session.user?.email ?? undefined,
    };

    try {
      const res = await arnaChat({ data: { messages: history, memory: memoryPayload, pro, clientId: getClientId() } });
      if ("error" in res) {
        setMsgs((m) => [...m, { who: "system-note", text: `⚠ ${res.error}` }]);
      } else {
        setMsgs((m) => [...m, { who: "ai", text: res.reply }]);
      }
    } catch (err) {
      setMsgs((m) => [...m, { who: "system-note", text: `⚠ ${err instanceof Error ? err.message : "Erro ao consultar a IA."}` }]);
    } finally {
      setTyping(false);
    }
  }

  function clearChat() {
    setMsgs(initialMsgs);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  }

  return (
    <div className="chat-wrap">
      <div className="chat-head">
        <div>
          <h4>ARNA AI {pro && <span style={{ color: "var(--gold, #c89b3c)" }}>PRO</span>}</h4>
          <span>
            {pro ? "modo Especialista — analisando lotes reais" : "consultor virtual em nutrição animal"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button className="btn" type="button" onClick={() => setPro((v) => !v)} style={{ padding: "6px 10px", fontSize: 12 }}>
            {pro ? "Modo padrão" : "Modo Especialista"}
          </button>
          <button className="btn" type="button" onClick={() => setShowMem((v) => !v)} style={{ padding: "6px 10px", fontSize: 12 }}>
            {showMem ? "Fechar memória" : "Memória"}
          </button>
          <button className="btn" type="button" onClick={clearChat} style={{ padding: "6px 10px", fontSize: 12 }}>
            Limpar
          </button>
        </div>
      </div>
      {showMem && (
        <MemoryEditor memory={memory} onChange={setMemory} />
      )}
      {loteContexts.length > 0 && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(0,0,0,.08)", borderBottom: "1px solid rgba(0,0,0,.08)", background: "rgba(0,0,0,.02)", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--ink-soft, #666)" }}>Foco:</span>
          <select
            value={focusLoteId}
            onChange={(e) => setFocusLoteId(e.target.value)}
            style={{ padding: "4px 8px", fontSize: 12, borderRadius: 6, border: "1px solid rgba(0,0,0,.15)" }}
          >
            <option value="">Todos os lotes ({loteContexts.length})</option>
            {loteContexts.map((l) => (
              <option key={l.id} value={l.id}>{l.nome} — {l.animal}/{l.fase}</option>
            ))}
          </select>
          {focusLoteId && (
            <>
              <button
                type="button"
                className="btn"
                disabled={typing}
                onClick={() => {
                  const l = loteContexts.find((x) => x.id === focusLoteId);
                  if (!l) return;
                  send(`Faça uma análise completa do lote "${l.nome}" (${l.animal}/${l.fase}): diagnóstico, nutrição, sanidade, produtividade, financeiro e ações imediatas.`);
                }}
                style={{ padding: "4px 10px", fontSize: 12 }}
              >
                Analisar este lote
              </button>
              <input
                type="text"
                placeholder="Nota deste lote (memória privada)"
                value={loteNotes[focusLoteId] ?? ""}
                onChange={(e) => setLoteNotes((n) => ({ ...n, [focusLoteId]: e.target.value }))}
                style={{ flex: 1, minWidth: 180, padding: "4px 8px", fontSize: 12, borderRadius: 6, border: "1px solid rgba(0,0,0,.15)" }}
              />
            </>
          )}
        </div>
      )}
      <div className="chat-body" ref={bodyRef}>
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.who}`}>
            {m.text}
          </div>
        ))}
        {typing && (
          <div className="msg ai">
            <div className="typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>
      <div className="chat-suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="sugg-chip" onClick={() => send(s)} disabled={typing}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          placeholder="Pergunte ao ARNA AI..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={typing}
        />
        <button className="btn" type="submit" disabled={typing}>
          {typing ? "..." : "Enviar"}
        </button>
      </form>
      <p className="disclaimer warn" style={{ padding: "0 16px 14px" }}>
        * Este consultor oferece orientação geral. Não substitui a avaliação presencial de um médico
        veterinário, especialmente em casos de doença, mortalidade elevada ou uso de medicamentos.
      </p>
    </div>
  );
}

function MemoryEditor({ memory, onChange }: { memory: ArnaMemory; onChange: (m: ArnaMemory) => void }) {
  const [m, setM] = useState<ArnaMemory>(memory);
  useEffect(() => { setM(memory); }, [memory]);
  type StringKey = "species" | "herdSize" | "avgWeight" | "objectives" | "ingredients" | "notes";
  const field = (k: StringKey, label: string, placeholder: string) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      <span style={{ color: "var(--ink-soft, #666)" }}>{label}</span>
      <input
        value={m[k] ?? ""}
        placeholder={placeholder}
        onChange={(e) => setM({ ...m, [k]: e.target.value })}
        style={{ padding: "6px 8px", border: "1px solid rgba(0,0,0,.15)", borderRadius: 6 }}
      />
    </label>
  );
  return (
    <div style={{ padding: 12, borderTop: "1px solid rgba(0,0,0,.08)", background: "rgba(0,0,0,.02)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {field("species", "Espécie(s)", "Ex.: suínos, poedeiras")}
      {field("herdSize", "Tamanho do plantel", "Ex.: 250 animais")}
      {field("avgWeight", "Peso médio / fase", "Ex.: 60 kg, terminação")}
      {field("objectives", "Objetivos", "Ex.: reduzir custo, ganho de peso")}
      {field("ingredients", "Ingredientes disponíveis", "Ex.: milho, farelo de soja")}
      {field("notes", "Notas", "Preferências, restrições...")}
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={() => { onChange({}); setM({}); }} style={{ padding: "6px 10px", fontSize: 12 }}>
          Apagar memória
        </button>
        <button type="button" className="btn" onClick={() => onChange(m)} style={{ padding: "6px 10px", fontSize: 12 }}>
          Salvar
        </button>
      </div>
    </div>
  );
}

/* ===================== CONTA ===================== */
function ContaPanel() {
  const session = useSession();
  const user = session.user;
  const [grantEmail, setGrantEmail] = useState("");
  const [grantDays, setGrantDays] = useState(30);
  const [subscribers, setSubscribers] = useState<Array<{ email: string; status: string; current_period_end: string | null; price_id: string | null }>>([]);
  const [adminErr, setAdminErr] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [stats, setStats] = useState<{
    totalUsers: number;
    activeSubscriptions: number;
    manualGrants: number;
    stripeActive: number;
    mrrBRL: number;
    chatInteractions: number;
  } | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{
    id: string; email: string; full_name: string | null; created_at: string;
    lifetime: boolean; isAdmin: boolean; subStatus: string | null;
    priceId: string | null; periodEnd: string | null; environment: string | null;
    trialing: boolean; trialDaysLeft: number | null;
  }>>([]);
  const [userFilter, setUserFilter] = useState<"all" | "trial" | "paid" | "admin" | "blocked">("all");
  const [inviteAdminEmail, setInviteAdminEmail] = useState("");

  async function loadSubs() {
    try {
      const [rows, s, users] = await Promise.all([listSubscribers(), getAdminStats(), listAllUsers()]);
      setSubscribers(rows as typeof subscribers);
      setStats(s);
      setAllUsers(users as typeof allUsers);
    } catch (e) {
      setAdminErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (session.isAdmin) void loadSubs();
  }, [session.isAdmin]);

  async function doGrant() {
    if (!grantEmail) return;
    setAdminBusy(true);
    setAdminErr("");
    try {
      await grantAccess({ data: { email: grantEmail.trim().toLowerCase(), days: grantDays } });
      setGrantEmail("");
      await loadSubs();
    } catch (e) {
      setAdminErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdminBusy(false);
    }
  }

  async function doRevoke(email: string) {
    if (!confirm(`Revogar acesso de ${email}?`)) return;
    setAdminBusy(true);
    setAdminErr("");
    try {
      await revokeAccess({ data: { email } });
      await loadSubs();
    } catch (e) {
      setAdminErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdminBusy(false);
    }
  }

  async function doToggleAdmin(email: string, makeAdmin: boolean) {
    const verb = makeAdmin ? "Conceder admin a" : "Remover admin de";
    if (!confirm(`${verb} ${email}?`)) return;
    setAdminBusy(true); setAdminErr("");
    try { await setAdminRole({ data: { email, makeAdmin } }); await loadSubs(); }
    catch (e) { setAdminErr(e instanceof Error ? e.message : String(e)); }
    finally { setAdminBusy(false); }
  }

  async function doToggleLifetime(email: string, enable: boolean) {
    const verb = enable ? "Conceder acesso vitalício a" : "Remover acesso vitalício de";
    if (!confirm(`${verb} ${email}?`)) return;
    setAdminBusy(true); setAdminErr("");
    try { await grantLifetime({ data: { email, enable } }); await loadSubs(); }
    catch (e) { setAdminErr(e instanceof Error ? e.message : String(e)); }
    finally { setAdminBusy(false); }
  }

  async function doInviteAdmin() {
    if (!inviteAdminEmail) return;
    setAdminBusy(true); setAdminErr("");
    try {
      await setAdminRole({ data: { email: inviteAdminEmail.trim().toLowerCase(), makeAdmin: true } });
      setInviteAdminEmail("");
      await loadSubs();
    } catch (e) { setAdminErr(e instanceof Error ? e.message : String(e)); }
    finally { setAdminBusy(false); }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  if (!user) {
    return (
      <div className="box login-box">
        <h4>Entrar</h4>
        <p className="disclaimer">Você precisa entrar para acessar o app.</p>
        <Link className="btn" to="/auth" style={{ textDecoration: "none", display: "inline-block" }}>
          Ir para tela de entrada
        </Link>
      </div>
    );
  }

  const sub = session.subscription;
  const ativo = session.active;
  const validUntil = sub?.current_period_end ? new Date(sub.current_period_end) : null;

  return (
    <>
      <div className="box">
        <h4>Minha assinatura</h4>
        <div className="status-row"><span>Usuário</span><b>{user.email}</b></div>
        <div className="status-row">
          <span>Status</span>
          <b style={{ color: ativo ? "var(--good)" : "var(--bad)" }}>
            {session.isAdmin
              ? "Admin (vitalício)"
              : session.lifetime
                ? "Vitalício ✓"
                : ativo
                  ? "Ativa"
                  : "Sem assinatura"}
          </b>
        </div>
        {validUntil && (
          <div className="status-row"><span>Válida até</span><b>{fmtDate(validUntil)}</b></div>
        )}
        {!session.isAdmin && !session.lifetime && (
          <div className="plan-card">
            <div style={{ padding: 16, border: "2px solid var(--green, #2e5b3a)", borderRadius: 12, position: "relative", textAlign: "center" }}>
              <span style={{ position: "absolute", top: -10, right: 12, background: "var(--gold, #b58a3a)", color: "white", fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>Pagamento único</span>
              <div style={{ fontSize: 13, color: "var(--ink-soft, #666)", marginBottom: 6 }}>7 dias grátis, depois</div>
              <div className="plan-price" style={{ fontSize: 32 }}>R$ 97 <span style={{ fontSize: 14 }}>uma única vez</span></div>
              <p style={{ margin: "8px 0 14px", fontSize: 13, lineHeight: 1.45 }}>
                Acesso <b>vitalício</b> ao ARNA — calculadora, plantel, consultor IA e todas as atualizações futuras.
                Cobrança automática de R$ 97 no 8º dia caso não cancele.
              </p>
              <Link to="/checkout" search={{ plan: "aguiar_vitalicio", email: user.email }} className="btn" style={{ display: "inline-block", textDecoration: "none" }}>
                Começar 7 dias grátis
              </Link>
            </div>
          </div>
        )}
        {session.lifetime && !session.isAdmin && (
          <div style={{ marginTop: 8, padding: 10, background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 8, fontSize: 13, textAlign: "center" }}>
            🎉 Você tem <b>acesso vitalício</b> ao ARNA. Todas as atualizações futuras estão incluídas.
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={signOut}>Sair</button>
        </div>
      </div>

      {session.isAdmin && (
        <div className="box">
          <h4>Painel do proprietário</h4>
          {stats && (
            <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginBottom: 12 }}>
              <StatCard label="Usuários" value={stats.totalUsers} />
              <StatCard label="Assinaturas ativas" value={stats.activeSubscriptions} />
              <StatCard label="Pagas (Stripe)" value={stats.stripeActive} />
              <StatCard label="Cortesias" value={stats.manualGrants} />
              <StatCard label="MRR estimado" value={brl(stats.mrrBRL)} />
              <StatCard label="Consultas IA" value={stats.chatInteractions} />
            </div>
          )}
          <div className="sub">Libere acesso manualmente para um usuário já cadastrado (cortesia, pagamento externo, teste).</div>
          <div className="form-grid admin-grant-grid">
            <div className="field">
              <label>E-mail do usuário</label>
              <input value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="usuario@email.com" />
            </div>
            <div className="field">
              <label>Dias de acesso</label>
              <select value={grantDays} onChange={(e) => setGrantDays(parseInt(e.target.value) || 30)}>
                <option value={30}>30 dias</option>
                <option value={90}>90 dias</option>
                <option value={180}>180 dias</option>
                <option value={365}>365 dias</option>
              </select>
            </div>
            <div className="field" style={{ alignSelf: "end" }}>
              <button className="btn" onClick={doGrant} disabled={adminBusy}>{adminBusy ? "…" : "Liberar acesso"}</button>
            </div>
          </div>
          {adminErr && <p className="disclaimer warn">{adminErr}</p>}

          <div style={{ marginTop: 16, borderTop: "1px solid var(--line,#ddd)", paddingTop: 12 }}>
            <h5 style={{ margin: "0 0 8px" }}>Convidar administrador</h5>
            <div className="form-grid admin-grant-grid">
              <div className="field">
                <label>E-mail (usuário já cadastrado)</label>
                <input value={inviteAdminEmail} onChange={(e) => setInviteAdminEmail(e.target.value)} placeholder="admin@email.com" />
              </div>
              <div className="field" style={{ alignSelf: "end" }}>
                <button className="btn" onClick={doInviteAdmin} disabled={adminBusy}>{adminBusy ? "…" : "Conceder admin"}</button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <h5 style={{ margin: 0 }}>Todos os usuários ({allUsers.length})</h5>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([
                  ["all", "Todos"],
                  ["trial", "Em teste"],
                  ["paid", "Pagantes"],
                  ["admin", "Admins"],
                  ["blocked", "Sem acesso"],
                ] as const).map(([k, l]) => (
                  <button
                    key={k}
                    className={`btn ghost`}
                    onClick={() => setUserFilter(k)}
                    style={{
                      padding: "3px 10px",
                      fontSize: 11,
                      background: userFilter === k ? "var(--green,#2e5b3a)" : undefined,
                      color: userFilter === k ? "#fff" : undefined,
                      border: userFilter === k ? "1px solid var(--green,#2e5b3a)" : undefined,
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="admin-list" style={{ marginTop: 8 }}>
              {allUsers
                .filter((u) => {
                  const now = Date.now();
                  const active = u.isAdmin || u.lifetime || (u.subStatus && ["active","trialing","past_due"].includes(u.subStatus) && (!u.periodEnd || new Date(u.periodEnd).getTime() > now));
                  if (userFilter === "trial") return u.trialing;
                  if (userFilter === "admin") return u.isAdmin;
                  if (userFilter === "paid") return !u.isAdmin && (u.lifetime || (u.subStatus === "active" && u.priceId && u.priceId !== "admin_grant"));
                  if (userFilter === "blocked") return !active;
                  return true;
                })
                .map((u) => {
                  const badge = u.isAdmin
                    ? { label: "ADMIN", color: "#7b1fa2" }
                    : u.lifetime
                      ? { label: "VITALÍCIO", color: "#2e7d32" }
                      : u.trialing
                        ? { label: `TESTE · ${u.trialDaysLeft}d`, color: u.trialDaysLeft != null && u.trialDaysLeft <= 3 ? "#c62828" : "#1565c0" }
                        : u.subStatus === "active"
                          ? { label: "ATIVO", color: "#2e7d32" }
                          : u.subStatus === "canceled"
                            ? { label: "CANCELADO", color: "#757575" }
                            : { label: "SEM ACESSO", color: "#c62828" };
                  return (
                    <div key={u.id} className="admin-row" style={{ flexWrap: "wrap", gap: 6 }}>
                      <span style={{ flex: 1, minWidth: 180 }}>
                        {u.email}
                        {u.full_name && <span style={{ color: "var(--ink-soft,#666)", marginLeft: 6, fontSize: 11 }}>({u.full_name})</span>}
                        <span
                          style={{
                            marginLeft: 8, fontSize: 10, padding: "2px 6px", borderRadius: 4,
                            background: badge.color, color: "#fff", fontWeight: 700, letterSpacing: 0.3,
                          }}
                        >{badge.label}</span>
                        <span className="mono" style={{ marginLeft: 6, fontSize: 10, color: "var(--ink-soft,#666)" }}>
                          {u.periodEnd ? `até ${fmtDate(new Date(u.periodEnd))}` : ""}
                        </span>
                      </span>
                      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {!u.lifetime ? (
                          <button className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} disabled={adminBusy} onClick={() => doToggleLifetime(u.email, true)}>+ Vitalício</button>
                        ) : (
                          <button className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} disabled={adminBusy} onClick={() => doToggleLifetime(u.email, false)}>− Vitalício</button>
                        )}
                        {!u.isAdmin ? (
                          <button className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} disabled={adminBusy} onClick={() => doToggleAdmin(u.email, true)}>+ Admin</button>
                        ) : (
                          <button className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} disabled={adminBusy} onClick={() => doToggleAdmin(u.email, false)}>− Admin</button>
                        )}
                        <button className="btn ghost" style={{ padding: "2px 8px", fontSize: 11, color: "#c62828" }} disabled={adminBusy} onClick={() => doRevoke(u.email)}>Bloquear</button>
                      </span>
                    </div>
                  );
                })}
              {allUsers.length === 0 && (
                <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>Nenhum usuário cadastrado ainda.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: 10, border: "1px solid var(--line, #ddd)", borderRadius: 8, background: "var(--paper, #fff)" }}>
      <div style={{ fontSize: 11, color: "var(--ink-soft, #666)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/* ===================== TRIAL BANNER (dias 5/6/7) ===================== */
function TrialBanner({
  session,
  onGoToConta,
}: {
  session: ReturnType<typeof useSession>;
  onGoToConta: () => void;
}) {
  if (session.isAdmin || session.lifetime) return null;
  const sub = session.subscription;
  if (!sub || sub.status !== "trialing" || !sub.current_period_end) return null;
  const end = new Date(sub.current_period_end).getTime();
  const diff = end - Date.now();
  if (diff <= 0) return null;
  const daysLeft = Math.ceil(diff / 86400000);
  if (daysLeft > 7) return null;

  const urgent = daysLeft <= 3;
  const bg = urgent ? "linear-gradient(90deg,#c62828,#e65100)" : "linear-gradient(90deg,#2e7d32,#1565c0)";
  const emoji = urgent ? "⚠️" : "🎁";
  const titulo = urgent
    ? daysLeft === 1
      ? "Último dia do teste grátis"
      : `Faltam ${daysLeft} dias do seu teste grátis`
    : `Você está no teste grátis — ${daysLeft} dias restantes`;
  const detalhe = urgent
    ? "A cobrança única de R$ 97 (acesso vitalício) será feita automaticamente ao fim do período. Cancele antes se não quiser continuar."
    : "Aproveite todos os recursos. No 8º dia, R$ 97 (uma única vez) para acesso vitalício.";

  return (
    <div
      role="status"
      style={{
        margin: "10px 0 4px",
        padding: "12px 14px",
        borderRadius: 12,
        background: bg,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        boxShadow: "0 4px 14px rgba(0,0,0,.12)",
      }}
    >
      <span style={{ fontSize: 22 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{titulo}</div>
        <div style={{ fontSize: 12, opacity: 0.95, marginTop: 2 }}>{detalhe}</div>
      </div>
      <button
        className="btn"
        onClick={onGoToConta}
        style={{ background: "#fff", color: "#111", border: 0, fontWeight: 700 }}
      >
        Gerenciar assinatura
      </button>
    </div>
  );
}

