import { useEffect, useState } from "react";
import type { useSession } from "@/lib/session";

/* ============================================================
   Limites do modo TESTE (7 dias grátis):
   - Máx. 2 lotes cadastrados
   - Máx. 10 animais somados
   - Máx. 5 relatórios PDF/Excel/Print/Share exportados
   Administradores e usuários com acesso vitalício ficam livres.
   ============================================================ */

export const TRIAL_MAX_LOTES = 2;
export const TRIAL_MAX_ANIMAIS = 10;
export const TRIAL_MAX_RELATORIOS = 5;

const REPORTS_KEY = "arna_trial_reports_v1";

type Session = ReturnType<typeof useSession>;

export function isTrial(session: Session): boolean {
  if (session.isAdmin || session.lifetime) return false;
  const s = session.subscription;
  return !!(s && s.status === "trialing");
}

function readCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(REPORTS_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function writeCount(n: number) {
  try { localStorage.setItem(REPORTS_KEY, String(n)); } catch {}
}

export function useTrialReports(session: Session) {
  const trial = isTrial(session);
  const [count, setCount] = useState<number>(() => readCount());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === REPORTS_KEY) setCount(readCount());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function increment(): boolean {
    if (!trial) return true;
    const next = readCount() + 1;
    if (next > TRIAL_MAX_RELATORIOS) return false;
    writeCount(next);
    setCount(next);
    return true;
  }
  function canGenerate(): boolean {
    return !trial || readCount() < TRIAL_MAX_RELATORIOS;
  }

  return {
    trial,
    reportsUsed: count,
    reportsMax: TRIAL_MAX_RELATORIOS,
    canGenerate,
    increment,
  };
}