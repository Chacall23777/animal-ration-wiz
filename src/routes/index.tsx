import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import "./aguiar.css";
import arnaLogo from "@/assets/arna-logo.png.asset.json";
import { arnaChat, type ArnaMemory, type ArnaChatMsg } from "@/utils/arna-chat.functions";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { listSubscribers, grantAccess, revokeAccess, getAdminStats } from "@/lib/admin.functions";
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

export const Route = createFileRoute("/")({
  component: AguiarApp,
});

/* ============================================================
   AGUIAR NUTRIÇÃO ANIMAL — App único (calculadora + plantel + chat + conta)
   ============================================================ */

type AnimalKey = "poultry" | "swine";

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
  const [tab, setTab] = useState<"calc" | "plantel" | "chat" | "conta">("calc");
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
          <button className="acct-badge" onClick={() => setTab("conta")}>
            <span className="dot" />
            {acctLabel}
          </button>
          <div>Calculadora · Plantel · 1 kg a 100 t</div>
        </div>
      </header>

      {/* TABS */}
      <nav className="tabs">
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

      <section className={`panel ${tab === "calc" ? "active" : ""}`}>
        <CalculadoraPanel />
      </section>
      <section className={`panel ${tab === "plantel" ? "active" : ""}`}>
        <PlantelPanel
          produtor={session.user.user_metadata?.full_name || acctLabel}
          email={session.user.email ?? undefined}
        />
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
function PaywallScreen() {
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
type Vacina = { id: string; nome: string; diaIdeal: number; aplicadaEm?: string };
type Lote = {
  id: string;
  nome: string;
  animal: AnimalKey;
  phaseId: string;
  qtd: number;
  dataEntrada: string; // ISO
  pesoInicial: number; // kg / animal
  pesoAlvo: number; // kg / animal (final desejado)
  mortalidadePct: number; // % média esperada do ciclo
  precoVenda: number; // dúzia de ovos (poultry) ou kg vivo (swine)
  vacinas: Vacina[];
};

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

const LOTES_KEY = "arna_lotes_v1";
function loadLotes(): Lote[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LOTES_KEY) || "[]"); } catch { return []; }
}
function saveLotes(l: Lote[]) {
  try { localStorage.setItem(LOTES_KEY, JSON.stringify(l)); } catch {}
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function PlantelPanel() {
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
  const [lotes, setLotes] = useState<Lote[]>([]);

  useEffect(() => { setLotes(loadLotes()); }, []);
  useEffect(() => { saveLotes(lotes); }, [lotes]);

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

  function addLote() {
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

function ChatPanel() {
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
  const bodyRef = useRef<HTMLDivElement>(null);

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

    try {
      const res = await arnaChat({ data: { messages: history, memory, pro, clientId: getClientId() } });
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
          <span>consultor virtual em nutrição animal</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button className="btn" type="button" onClick={() => setPro((v) => !v)} style={{ padding: "6px 10px", fontSize: 12 }}>
            {pro ? "Modo padrão" : "Modo PRO"}
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
  const field = (k: keyof ArnaMemory, label: string, placeholder: string) => (
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

  async function loadSubs() {
    try {
      const [rows, s] = await Promise.all([listSubscribers(), getAdminStats()]);
      setSubscribers(rows as typeof subscribers);
      setStats(s);
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
          <div className="admin-list">
            {subscribers.length === 0 ? (
              <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>Nenhum assinante ainda.</p>
            ) : (
              subscribers.map((s) => (
                <div key={s.email} className="admin-row">
                  <span>{s.email} <span className="mono" style={{ fontSize: 10, color: "var(--ink-soft)", marginLeft: 6 }}>· {s.status}{s.price_id ? ` · ${s.price_id}` : ""}</span></span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="mono">{s.current_period_end ? `até ${fmtDate(new Date(s.current_period_end))}` : "—"}</span>
                    <button className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => doRevoke(s.email)} disabled={adminBusy}>Revogar</button>
                  </span>
                </div>
              ))
            )}
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

