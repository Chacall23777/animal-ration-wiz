import { useEffect, useSyncExternalStore } from "react";

export type TxKind = "receita" | "despesa";
export type TxCategory =
  | "racao"
  | "vacina"
  | "medicamento"
  | "mao_de_obra"
  | "energia"
  | "manutencao"
  | "venda_animais"
  | "venda_ovos"
  | "outros";

export type Transacao = {
  id: string;
  data: string; // ISO YYYY-MM-DD
  kind: TxKind;
  categoria: TxCategory;
  descricao: string;
  valor: number;
  loteId?: string;
};

export const CATEGORIAS: Record<TxCategory, { label: string; kind: TxKind }> = {
  racao: { label: "Ração", kind: "despesa" },
  vacina: { label: "Vacinas", kind: "despesa" },
  medicamento: { label: "Medicamentos", kind: "despesa" },
  mao_de_obra: { label: "Mão de obra", kind: "despesa" },
  energia: { label: "Energia/água", kind: "despesa" },
  manutencao: { label: "Manutenção", kind: "despesa" },
  venda_animais: { label: "Venda de animais", kind: "receita" },
  venda_ovos: { label: "Venda de ovos", kind: "receita" },
  outros: { label: "Outros", kind: "despesa" },
};

const KEY = "arna_finance_v1";
const listeners = new Set<() => void>();
let state: Transacao[] = [];
let initialized = false;

function read(): Transacao[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(v: Transacao[]) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} }
function emit() { for (const l of listeners) l(); }
function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  state = read();
  initialized = true;
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) { state = read(); emit(); }
  });
}

export function setTransacoes(next: Transacao[] | ((p: Transacao[]) => Transacao[])) {
  ensureInit();
  const value = typeof next === "function" ? (next as (p: Transacao[]) => Transacao[])(state) : next;
  state = value;
  write(value);
  emit();
}

function subscribe(cb: () => void) { ensureInit(); listeners.add(cb); return () => listeners.delete(cb); }
function snap() { ensureInit(); return state; }
function serverSnap(): Transacao[] { return []; }

export function useFinanceStore(): Transacao[] {
  const s = useSyncExternalStore(subscribe, snap, serverSnap);
  useEffect(() => { ensureInit(); }, []);
  return s;
}