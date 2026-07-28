import { useEffect, useSyncExternalStore } from "react";

/* ============================================================
   Store compartilhado de lotes/estoque — sincroniza Plantel + Início
   ============================================================ */

export type AnimalKey = "poultry" | "swine";

export type Vacina = {
  id: string;
  nome: string;
  diaIdeal: number;
  aplicadaEm?: string;
};

export type Lote = {
  id: string;
  nome: string;
  animal: AnimalKey;
  phaseId: string;
  qtd: number;
  dataEntrada: string; // ISO
  pesoInicial: number;
  pesoAlvo: number;
  mortalidadePct: number;
  precoVenda: number;
  vacinas: Vacina[];
};

export type EstoqueRacao = { kg: number; precoKg: number };

const LOTES_KEY = "arna_lotes_v1";
const ESTOQUE_KEY = "arna_estoque_racao_v1";

let scope: string | null = null;
// IMPORTANTE: sem uma propriedade ativa (scope) não existe chave válida.
// Antes isso caía numa chave global (sem sufixo) compartilhada por QUALQUER
// conta no mesmo navegador — era isso que fazia um usuário novo enxergar os
// lotes de outra conta. Agora, sem escopo, não lê nem grava em disco.
function lotesKey(): string | null { return scope ? `${LOTES_KEY}::${scope}` : null; }
function estoqueKey(): string | null { return scope ? `${ESTOQUE_KEY}::${scope}` : null; }

type State = { lotes: Lote[]; estoque: EstoqueRacao };
const listeners = new Set<() => void>();

let state: State = { lotes: [], estoque: { kg: 0, precoKg: 1.6 } };
let initialized = false;

function readLS<T>(k: string | null, fallback: T): T {
  if (typeof window === "undefined" || !k) return fallback;
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS<T>(k: string | null, v: T) {
  if (!k) return; // sem propriedade ativa: não persiste (evita vazar/misturar dados entre contas)
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}
function emit() {
  for (const l of listeners) l();
}
function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  state = {
    lotes: readLS<Lote[]>(lotesKey(), []),
    estoque: readLS<EstoqueRacao>(estoqueKey(), { kg: 0, precoKg: 1.6 }),
  };
  initialized = true;
  window.addEventListener("storage", (e) => {
    if (lotesKey() && e.key === lotesKey()) {
      state = { ...state, lotes: readLS<Lote[]>(lotesKey(), []) };
      emit();
    } else if (estoqueKey() && e.key === estoqueKey()) {
      state = {
        ...state,
        estoque: readLS<EstoqueRacao>(estoqueKey(), { kg: 0, precoKg: 1.6 }),
      };
      emit();
    }
  });
}

export function setLotesScope(newScope: string | null) {
  if (scope === newScope) return;
  scope = newScope;
  if (typeof window === "undefined") { initialized = false; return; }
  state = {
    lotes: readLS<Lote[]>(lotesKey(), []),
    estoque: readLS<EstoqueRacao>(estoqueKey(), { kg: 0, precoKg: 1.6 }),
  };
  initialized = true;
  emit();
}

export function setLotes(next: Lote[] | ((prev: Lote[]) => Lote[])) {
  ensureInit();
  const value = typeof next === "function" ? (next as (p: Lote[]) => Lote[])(state.lotes) : next;
  state = { ...state, lotes: value };
  writeLS(lotesKey(), value);
  emit();
}

export function setEstoque(next: EstoqueRacao | ((p: EstoqueRacao) => EstoqueRacao)) {
  ensureInit();
  const value = typeof next === "function" ? (next as (p: EstoqueRacao) => EstoqueRacao)(state.estoque) : next;
  state = { ...state, estoque: value };
  writeLS(estoqueKey(), value);
  emit();
}

function subscribe(cb: () => void) {
  ensureInit();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  ensureInit();
  return state;
}
function getServerSnapshot(): State {
  return { lotes: [], estoque: { kg: 0, precoKg: 1.6 } };
}

export function useLotesStore(): State {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // trigger init on client mount even if snapshot was server default
  useEffect(() => {
    ensureInit();
  }, []);
  return s;
}
