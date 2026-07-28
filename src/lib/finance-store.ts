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
let scope: string | null = null;
// Sem propriedade ativa não há chave válida — antes caía numa chave global
// compartilhada entre contas no mesmo navegador, vazando dados financeiros.
function key(): string | null { return scope ? `${KEY}::${scope}` : null; }
const listeners = new Set<() => void>();
let state: Transacao[] = [];
let initialized = false;

function read(): Transacao[] {
  const k = key();
  if (typeof window === "undefined" || !k) return [];
  try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; }
}
function write(v: Transacao[]) {
  const k = key();
  if (!k) return; // sem propriedade ativa: não persiste
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}
function emit() { for (const l of listeners) l(); }
function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  state = read();
  initialized = true;
  window.addEventListener("storage", (e) => {
    if (key() && e.key === key()) { state = read(); emit(); }
  });
}

export function setFinanceScope(newScope: string | null) {
  if (scope === newScope) return;
  scope = newScope;
  if (typeof window === "undefined") { initialized = false; return; }
  state = read();
  initialized = true;
  emit();
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
