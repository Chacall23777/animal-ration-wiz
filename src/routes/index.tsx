import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import "./aguiar.css";

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
      formula: { milho: 62, soja: 32, nucleo: 5, calcario: 1 },
      consumoDia: 0.9,
      producao: 0.45,
      producaoTipo: "ganho",
    },
    {
      id: "crescimento",
      label: "Crescimento (30–70 kg)",
      formula: { milho: 68, soja: 27, nucleo: 4, calcario: 1 },
      consumoDia: 2.2,
      producao: 0.85,
      producaoTipo: "ganho",
    },
    {
      id: "terminacao",
      label: "Terminação (70–110 kg)",
      formula: { milho: 72, soja: 23, nucleo: 4, calcario: 1 },
      consumoDia: 3.0,
      producao: 0.95,
      producaoTipo: "ganho",
    },
    {
      id: "gestacao",
      label: "Gestação",
      formula: { milho: 65, soja: 27, nucleo: 5, calcario: 3 },
      consumoDia: 2.5,
    },
    {
      id: "lactacao",
      label: "Lactação",
      formula: { milho: 63, soja: 30, nucleo: 5, calcario: 2 },
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
  const [account, setAccount] = useState<{
    email: string;
    isAdmin: boolean;
    validUntil: Date;
  } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("aguiar_account");
      if (!raw) return null;
      const p = JSON.parse(raw);
      return { email: p.email, isAdmin: !!p.isAdmin, validUntil: new Date(p.validUntil) };
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (account) {
      localStorage.setItem(
        "aguiar_account",
        JSON.stringify({ ...account, validUntil: account.validUntil.toISOString() }),
      );
    } else {
      localStorage.removeItem("aguiar_account");
    }
  }, [account]);

  const acctActive = !!account && account.validUntil > new Date();
  const acctLabel = account ? account.email.split("@")[0] : "Visitante";

  // Enquanto a assinatura não está liberada, a tela principal mostra só a
  // logo + as ilustrações + o formulário de entrar/assinar. O restante do
  // app (calculadora, plantel, consultor IA) só aparece depois do pagamento
  // confirmado (ou de liberação manual pelo administrador).
  if (!acctActive) {
    return <PaywallScreen account={account} setAccount={setAccount} />;
  }

  return (
    <div className="wrap">
      {/* MASTHEAD */}
      <header className="masthead">
        <div className="brand">
          <img src="/logo.svg" alt="Aguiar Nutrição Animal" className="brand-logo" />
          <div>
            <h1>AGUIAR NUTRIÇÃO ANIMAL</h1>
            <div className="tag">Consultoria Rural · Rogério Aguiar</div>
          </div>
        </div>
        <div
          className="meta"
          style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}
        >
          <button className="acct-badge" onClick={() => setTab("conta")}>
            <span className={`dot ${acctActive ? "" : "off"}`} />
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
        <PlantelPanel />
      </section>
      <section className={`panel ${tab === "chat" ? "active" : ""}`}>
        <ChatPanel />
      </section>
      <section className={`panel ${tab === "conta" ? "active" : ""}`}>
        <ContaPanel account={account} setAccount={setAccount} />
      </section>
    </div>
  );
}

/* ===================== TELA DE ASSINATURA (paywall) ===================== */
function PaywallScreen({
  account,
  setAccount,
}: {
  account: { email: string; isAdmin: boolean; validUntil: Date } | null;
  setAccount: (a: { email: string; isAdmin: boolean; validUntil: Date } | null) => void;
}) {
  return (
    <div className="wrap paywall-wrap">
      <div className="paywall-hero">
        <img src="/logo.svg" alt="Aguiar Nutrição Animal" className="paywall-logo" />
      </div>
      <h1 className="paywall-title">AGUIAR NUTRIÇÃO ANIMAL</h1>
      <div className="tag paywall-tag">Consultoria Rural · Rogério Aguiar</div>
      <p className="paywall-copy">
        Calculadora de ração, gestão de plantel e consultor IA para avicultura e suinocultura. Entre
        com sua conta ou assine para liberar o app completo.
      </p>
      <ContaPanel account={account} setAccount={setAccount} />
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

  const rows = INGR_META.map((m) => {
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
        * Fórmulas de referência (milho, farelo de soja, núcleo e{" "}
        {animal === "poultry"
          ? " calcário/farelo de ostra — fonte extra de cálcio para casca do ovo na fase de postura"
          : " calcário calcítico — sem farelo de ostra, que não é indicado para a formulação de suínos"}
        ). Ajustes finos variam por linhagem, peso e desempenho — valide com um zootecnista ou
        médico veterinário antes de usar em escala.
      </p>
    </>
  );
}

/* ===================== PLANTEL ===================== */
type Lote = {
  id: string;
  animal: AnimalKey;
  phaseId: string;
  qtd: number;
  precoVenda: number; // dúzia de ovos (poultry) ou kg vivo (swine)
};

function PlantelPanel() {
  const [precos, setPrecos] = useState({ milho: 1.4, soja: 2.2, nucleo: 8.5, calcario: 0.6 });
  const [animal, setAnimal] = useState<AnimalKey>("poultry");
  const [phaseId, setPhaseId] = useState(PHASES.poultry[4].id);
  const [qtd, setQtd] = useState(100);
  const [preco, setPreco] = useState(12);
  const [lotes, setLotes] = useState<Lote[]>([]);

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

  const linhas = lotes.map((l) => {
    const phase = PHASES[l.animal].find((p) => p.id === l.phaseId)!;
    const consumoDia = phase.consumoDia * l.qtd; // kg/dia
    const consumoMes = consumoDia * 30;
    const custoMes = consumoMes * custoRacaoPorKg(phase);
    let receitaMes = 0;
    let producaoLabel = "—";
    if (phase.producaoTipo === "ovos" && phase.producao) {
      // Média de ovos/dia calculada com base na quantidade de aves informada pelo usuário.
      const ovosDia = phase.producao * l.qtd;
      const duziasMes = (ovosDia * 30) / 12;
      receitaMes = duziasMes * l.precoVenda;
      producaoLabel = `${ovosDia.toFixed(0)} ovos/dia (média) · ${Math.round(ovosDia * 30)} ovos/mês`;
    } else if (phase.producaoTipo === "ganho" && phase.producao) {
      // Ganho de peso — específico de suínos: total do lote/dia e por animal/dia.
      const ganhoKgDiaLote = phase.producao * l.qtd;
      const ganhoKgMes = ganhoKgDiaLote * 30;
      receitaMes = ganhoKgMes * l.precoVenda;
      producaoLabel = `${ganhoKgDiaLote.toFixed(1)} kg/dia (lote) · ${phase.producao.toFixed(2)} kg/dia/animal · ${ganhoKgMes.toFixed(0)} kg/mês`;
    }
    return {
      lote: l,
      phase,
      consumoDia,
      consumoMes,
      custoMes,
      receitaMes,
      producaoLabel,
      lucro: receitaMes - custoMes,
    };
  });

  const tot = linhas.reduce(
    (a, l) => ({
      custo: a.custo + l.custoMes,
      receita: a.receita + l.receitaMes,
      lucro: a.lucro + l.lucro,
      animais: a.animais + l.lote.qtd,
    }),
    { custo: 0, receita: 0, lucro: 0, animais: 0 },
  );

  return (
    <>
      <div className="box">
        <h4>Preço dos insumos</h4>
        <div className="sub">
          Usado para calcular o custo por kg de ração de cada fórmula automaticamente
        </div>
        <div className="price-grid">
          {(["milho", "soja", "nucleo", "calcario"] as const).map((k) => (
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
          Informe quantos animais você tem em cada fase e o preço de venda para calcular consumo,
          produção, custo e lucro
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Animal</label>
            <select
              value={animal}
              onChange={(e) => {
                const a = e.target.value as AnimalKey;
                setAnimal(a);
                setPhaseId(PHASES[a][0].id);
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
          <button
            className="btn"
            onClick={() => {
              setLotes((l) => [
                ...l,
                {
                  id: Math.random().toString(36).slice(2),
                  animal,
                  phaseId,
                  qtd,
                  precoVenda: preco,
                },
              ]);
            }}
          >
            Adicionar ao plantel
          </button>
        </div>
      </div>

      <div className="box">
        <h4>Plantel atual</h4>
        <div className="sub">Consumo, produção e resultado financeiro estimados por lote</div>
        {lotes.length === 0 ? (
          <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Nenhum lote adicionado ainda.
          </p>
        ) : (
          <>
            <table className="plantel">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Qtd.</th>
                  <th>Consumo/dia</th>
                  <th>Consumo/mês</th>
                  <th>Produção</th>
                  <th>Custo ração/mês</th>
                  <th>Receita/mês</th>
                  <th>Lucro/mês</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.lote.id}>
                    <td>
                      <span
                        className={`tag-pill ${l.lote.animal === "poultry" ? "poultry" : "swine"}`}
                      >
                        {l.lote.animal === "poultry" ? "Aves" : "Suínos"}
                      </span>{" "}
                      {l.phase.label}
                    </td>
                    <td className="mono">{l.lote.qtd}</td>
                    <td className="mono">{l.consumoDia.toFixed(1)} kg</td>
                    <td className="mono">{l.consumoMes.toFixed(0)} kg</td>
                    <td className="mono">{l.producaoLabel}</td>
                    <td className="mono">{brl(l.custoMes)}</td>
                    <td className="mono">{brl(l.receitaMes)}</td>
                    <td className={`mono ${l.lucro >= 0 ? "profit-pos" : "profit-neg"}`}>
                      {brl(l.lucro)}
                    </td>
                    <td>
                      <button
                        className="btn danger small"
                        onClick={() => setLotes((ls) => ls.filter((x) => x.id !== l.lote.id))}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="summary-grid">
              <div className="summary-card">
                <div className="lbl">Animais</div>
                <div className="val">{tot.animais}</div>
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

function mockAnswer(q: string): string {
  const s = q.toLowerCase();
  if (s.includes("mortalidade") || s.includes("pintainha")) {
    return "Para reduzir mortalidade em pintainhas:\n• Temperatura inicial 32–34 °C, reduzindo 2–3 °C por semana.\n• Água limpa e ração pré-inicial disponível nas primeiras 24 h.\n• Densidade máxima 25–30 aves/m² na primeira semana.\n• Vacinação (Marek, Gumboro, Newcastle) conforme calendário regional.\n\nSe a mortalidade passar de 2% na 1ª semana, procure um veterinário.";
  }
  if (s.includes("cálcio") || s.includes("calcio") || s.includes("casca")) {
    return "Deficiência de cálcio em poedeiras:\n• Ovos com casca fina, quebradiça ou deformada.\n• Queda na postura e ovos sem casca.\n• Aves com pernas fracas, dificuldade de locomoção.\n\nCorreção: elevar cálcio da ração para 3,8–4,2% na fase de postura, oferecer calcário calcítico grosso à parte no final da tarde.";
  }
  if (s.includes("terminação") || s.includes("terminacao") || s.includes("suín")) {
    return "Terminação de suínos (70–110 kg):\n• Proteína bruta 15–16%, lisina 0,85%.\n• Milho e farelo de soja como base, núcleo específico de terminação.\n• Evitar excesso proteico (custo alto + gordura abdominal).\n• Água fresca à vontade — consumo dobra em relação à ração.\n\nConversão alimentar esperada: 2,8–3,2 kg ração/kg ganho.";
  }
  return "Boa pergunta! Como consultor de nutrição, recomendo detalhar: qual espécie, fase e sintoma/objetivo específico? Assim consigo orientar dosagens de ração, manejo e sinais de alerta. (Este consultor é um protótipo — para casos clínicos, procure um MV.)";
}

function ChatPanel() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      who: "system-note",
      text: "Converse com o consultor sobre nutrição e manejo de postura e suínos.",
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    setMsgs((m) => [...m, { who: "user", text: q }]);
    setInput("");
    setTyping(true);
    setTimeout(
      () => {
        setMsgs((m) => [...m, { who: "ai", text: mockAnswer(q) }]);
        setTyping(false);
      },
      700 + Math.random() * 600,
    );
  }

  return (
    <div className="chat-wrap">
      <div className="chat-head">
        <h4>Consultor IA — Postura & Suínos</h4>
        <span>especialista em nutrição e manejo</span>
      </div>
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
          <button key={s} className="sugg-chip" onClick={() => send(s)}>
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
          placeholder="Pergunte ao consultor..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn" type="submit">
          Enviar
        </button>
      </form>
      <p className="disclaimer warn" style={{ padding: "0 16px 14px" }}>
        * Este consultor oferece orientação geral. Não substitui a avaliação presencial de um médico
        veterinário, especialmente em casos de doença, mortalidade elevada ou uso de medicamentos.
      </p>
    </div>
  );
}

/* ===================== CONTA ===================== */
function ContaPanel({
  account,
  setAccount,
}: {
  account: { email: string; isAdmin: boolean; validUntil: Date } | null;
  setAccount: (a: { email: string; isAdmin: boolean; validUntil: Date } | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [subscribers, setSubscribers] = useState<Record<string, Date>>({});
  // Credenciais (usuário/senha) criadas manualmente pelo administrador.
  const [creds, setCreds] = useState<Record<string, string>>({});
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("aguiar_creds");
      if (raw) setCreds(JSON.parse(raw));
    } catch {
      /* ignora leitura inválida do localStorage */
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("aguiar_creds", JSON.stringify(creds));
  }, [creds]);
  // Persist subscribers so the /checkout/return page can extend access after Stripe redirects back.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("aguiar_subscribers");
      if (raw) {
        const parsed: Record<string, string> = JSON.parse(raw);
        const map: Record<string, Date> = {};
        for (const [k, v] of Object.entries(parsed)) map[k] = new Date(v);
        setSubscribers(map);
      }
    } catch {
      /* ignora leitura inválida do localStorage */
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(subscribers)) out[k] = v.toISOString();
    localStorage.setItem("aguiar_subscribers", JSON.stringify(out));
    // If the current account's validity was extended (e.g. by /checkout/return), sync it.
    if (
      account &&
      subscribers[account.email] &&
      subscribers[account.email].getTime() !== account.validUntil.getTime()
    ) {
      setAccount({ ...account, validUntil: subscribers[account.email] });
    }
  }, [subscribers]);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantPassword, setGrantPassword] = useState("");
  const [grantDays, setGrantDays] = useState(30);

  function login() {
    if (!email || !password) return;
    // Se o admin cadastrou uma senha manualmente para este e-mail, ela precisa bater.
    if (creds[email] && creds[email] !== password) {
      setLoginError("E-mail ou senha incorretos.");
      return;
    }
    setLoginError("");
    const isAdmin =
      email.toLowerCase().endsWith("@aguiar.com") || email.toLowerCase().includes("admin");
    const validUntil = subscribers[email] ?? addDays(isAdmin ? 3650 : 7);
    setSubscribers({ ...subscribers, [email]: validUntil });
    setAccount({ email, isAdmin, validUntil });
  }

  function adminGrant() {
    if (!grantEmail) return;
    setSubscribers({ ...subscribers, [grantEmail]: addDays(grantDays) });
    if (grantPassword.trim()) {
      setCreds({ ...creds, [grantEmail]: grantPassword.trim() });
    }
    setGrantEmail("");
    setGrantPassword("");
  }

  if (!account) {
    return (
      <div className="box login-box">
        <h4>Entrar</h4>
        <div className="sub">Acesso por assinatura — R$ 50/mês</div>
        <div className="field">
          <label>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com"
          />
        </div>
        <div className="field">
          <label>Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
          />
        </div>
        {loginError && <p className="disclaimer warn">{loginError}</p>}
        <button className="btn" onClick={login}>
          Entrar
        </button>
        <p className="disclaimer">
          Já é assinante e recebeu usuário/senha do administrador? Use-os aqui para entrar. Se ainda
          não tem acesso, cadastre um e-mail e senha para começar o teste gratuito, ou assine um dos
          planos abaixo depois de entrar.
        </p>
      </div>
    );
  }

  const ativo = account.validUntil > new Date();

  return (
    <>
      <div className="box">
        <h4>Minha assinatura</h4>
        <div className="status-row">
          <span>Usuário</span>
          <b>{account.email}</b>
        </div>
        <div className="status-row">
          <span>Status</span>
          <b style={{ color: ativo ? "var(--good)" : "var(--bad)" }}>
            {ativo ? "Ativa" : "Expirada"}
          </b>
        </div>
        <div className="status-row">
          <span>Válida até</span>
          <b>{fmtDate(account.validUntil)}</b>
        </div>
        <div className="plan-card">
          <div className="plan-grid">
            <div style={{ padding: 12, border: "1px solid var(--line, #ddd)", borderRadius: 8 }}>
              <div className="plan-price">
                R$ 50 <span>/ mês</span>
              </div>
              <p style={{ margin: "6px 0 12px", fontSize: 13 }}>
                Cobrança mensal, cancele quando quiser.
              </p>
              <Link
                to="/checkout"
                search={{ plan: "aguiar_mensal", email: account.email }}
                className="btn"
                style={{ display: "inline-block", textDecoration: "none" }}
              >
                Assinar mensal
              </Link>
            </div>
            <div
              style={{
                padding: 12,
                border: "2px solid var(--green, #2e5b3a)",
                borderRadius: 8,
                position: "relative",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: -10,
                  right: 10,
                  background: "var(--green, #2e5b3a)",
                  color: "white",
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 4,
                }}
              >
                -17%
              </span>
              <div className="plan-price">
                R$ 500 <span>/ ano</span>
              </div>
              <p style={{ margin: "6px 0 12px", fontSize: 13 }}>Equivale a 2 meses grátis.</p>
              <Link
                to="/checkout"
                search={{ plan: "aguiar_anual", email: account.email }}
                className="btn"
                style={{ display: "inline-block", textDecoration: "none" }}
              >
                Assinar anual
              </Link>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={() => setAccount(null)}>
            Sair
          </button>
        </div>
      </div>

      {account.isAdmin && (
        <div className="box">
          <h4>Painel do administrador</h4>
          <div className="sub">
            Crie o usuário e a senha de um cliente e libere o acesso manualmente, sem precisar de
            cobrança pelo Stripe (ex.: pagamento combinado por fora, cortesia, período de teste).
          </div>
          <div className="form-grid admin-grant-grid">
            <div className="field">
              <label>E-mail do usuário</label>
              <input
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder="usuario@email.com"
              />
            </div>
            <div className="field">
              <label>Senha (opcional)</label>
              <input
                value={grantPassword}
                onChange={(e) => setGrantPassword(e.target.value)}
                placeholder="defina uma senha"
              />
            </div>
            <div className="field">
              <label>Dias de acesso</label>
              <input
                type="number"
                value={grantDays}
                onChange={(e) => setGrantDays(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="field" style={{ alignSelf: "end" }}>
              <button className="btn" onClick={adminGrant}>
                Liberar acesso
              </button>
            </div>
          </div>
          <div className="admin-list">
            {Object.entries(subscribers).length === 0 ? (
              <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                Nenhum usuário liberado ainda.
              </p>
            ) : (
              Object.entries(subscribers).map(([e, d]) => (
                <div key={e} className="admin-row">
                  <span>
                    {e}
                    {creds[e] && (
                      <span
                        className="mono"
                        style={{ fontSize: 10, color: "var(--ink-soft)", marginLeft: 6 }}
                      >
                        · login criado
                      </span>
                    )}
                  </span>
                  <span className="mono">até {fmtDate(d)}</span>
                </div>
              ))
            )}
          </div>
          <p className="disclaimer">
            Painel de demonstração (dados guardados neste navegador). Em produção, isso deve gravar
            em um backend real (ex.: Supabase, já com tabela de assinantes preparada em{" "}
            <code>supabase/migrations</code>), com a senha protegida por hash no servidor.
          </p>
        </div>
      )}
    </>
  );
}
