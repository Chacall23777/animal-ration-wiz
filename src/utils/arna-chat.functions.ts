import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LoteContext = {
  id: string;
  nome: string;
  animal: string;      // "Aves" | "Suínos" | etc.
  fase: string;
  qtd: number;
  idadeDias: number;
  pesoAtualKg: number;
  consumoDiaKg: number;
  custoMesBRL: number;
  receitaMesBRL: number;
  vacinasPendentes: string[];
  observacoes?: string;
};

export type ArnaMemory = {
  species?: string;
  herdSize?: string;
  avgWeight?: string;
  objectives?: string;
  ingredients?: string;
  notes?: string;
  lotes?: LoteContext[];
  focusLoteId?: string;
};

export type ArnaChatMsg = { role: "user" | "assistant"; content: string };

type ChatInput = {
  messages: ArnaChatMsg[];
  memory?: ArnaMemory;
  pro?: boolean;
  clientId?: string;
};

type ChatResult = { reply: string } | { error: string; code?: number };

function memoryBlock(m?: ArnaMemory): string {
  if (!m) return "Nenhuma memória salva sobre o usuário ainda.";
  const rows: string[] = [];
  if (m.species) rows.push(`- Espécie(s) do produtor: ${m.species}`);
  if (m.herdSize) rows.push(`- Tamanho do plantel: ${m.herdSize}`);
  if (m.avgWeight) rows.push(`- Peso médio / fase: ${m.avgWeight}`);
  if (m.objectives) rows.push(`- Objetivos: ${m.objectives}`);
  if (m.ingredients) rows.push(`- Ingredientes disponíveis: ${m.ingredients}`);
  if (m.notes) rows.push(`- Notas: ${m.notes}`);
  return rows.length ? rows.join("\n") : "Nenhuma memória salva sobre o usuário ainda.";
}

function lotesBlock(m?: ArnaMemory): string {
  const lotes = m?.lotes ?? [];
  if (!lotes.length) return "Nenhum lote cadastrado no Plantel do produtor.";
  const focusId = m?.focusLoteId;
  const header = focusId
    ? "LOTES DO PRODUTOR (dado real do app; o produtor pediu foco no lote marcado com ▶):"
    : "LOTES DO PRODUTOR (dado real do app; use para respostas contextualizadas):";
  const rows = lotes.map((l) => {
    const mark = focusId && l.id === focusId ? "▶" : "•";
    const vac = l.vacinasPendentes.length
      ? ` | vacinas pendentes: ${l.vacinasPendentes.join(", ")}`
      : " | vacinas em dia";
    const obs = l.observacoes ? ` | obs: ${l.observacoes}` : "";
    return `${mark} ${l.nome} — ${l.animal}/${l.fase} · ${l.qtd} animais · ${l.idadeDias}d idade · peso ${l.pesoAtualKg.toFixed(2)}kg · consumo ${l.consumoDiaKg.toFixed(1)}kg/dia · custo R$${l.custoMesBRL.toFixed(0)}/mês · receita R$${l.receitaMesBRL.toFixed(0)}/mês${vac}${obs}`;
  });
  return [header, ...rows].join("\n");
}

function systemPrompt(memory: ArnaMemory | undefined, pro: boolean): string {
  return [
    "Você é o ARNA AI, consultor virtual da Aguiar Nutrição Animal.",
    "Você é especialista em nutrição animal, formulação de rações, exigências nutricionais (PB, EM, lisina, metionina, treonina, cálcio, fósforo, minerais, vitaminas), conversão alimentar, ganho de peso e bem-estar animal.",
    "Atende suínos, aves, bovinos de corte e leite, ovinos, caprinos, equinos e peixes.",
    "REGRAS OBRIGATÓRIAS:",
    "1. Antes de formular uma ração, confirme: espécie, fase/idade, peso, objetivo produtivo e ingredientes disponíveis. Faça as perguntas que faltarem.",
    "2. NUNCA sugira ingredientes incompatíveis com a espécie (ex.: calcário calcítico só quando tecnicamente recomendado — em suínos evite sugerir por padrão).",
    "3. NUNCA invente dados nutricionais. Se não tiver certeza, diga.",
    "4. Respeite limites mínimos e máximos das exigências nutricionais da categoria.",
    "5. Justifique tecnicamente cada recomendação.",
    "6. Responda sempre em português do Brasil, tom direto e prático para o produtor rural.",
    pro
      ? "MODO ESPECIALISTA (PRO): atue como Zootecnista/Nutricionista sênior. Analise o(s) lote(s) reais do produtor listados abaixo, cruzando idade, peso, consumo, custo, receita e vacinas pendentes. Estruture a resposta em: 1) Diagnóstico; 2) Nutrição (ração recomendada e ajustes); 3) Sanidade (vacinas / manejo); 4) Produtividade (metas e previsões); 5) Financeiro (impacto R$/mês); 6) Ações imediatas (3 a 5 bullets). Use os dados reais dos lotes — não invente números; se faltar dado, peça."
      : "Modo padrão: responda em linguagem acessível ao produtor, com passos práticos.",
    "",
    "MEMÓRIA DO USUÁRIO (use para personalizar as respostas; se algo faltar, pergunte):",
    memoryBlock(memory),
    "",
    lotesBlock(memory),
  ].join("\n");
}

export const arnaChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ChatInput) => {
    if (!Array.isArray(data?.messages) || data.messages.length === 0) {
      throw new Error("messages requerido");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<ChatResult> => {
    const { supabase, userId } = context;

    // Verificar assinatura ativa no servidor (não confiar na UI)
    const { data: allowed, error: subErr } = await supabase.rpc("has_active_subscription", {
      _user_id: userId,
    });
    if (subErr || !allowed) {
      return { error: "Assinatura ativa necessária para usar o ARNA AI.", code: 403 };
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { error: "LOVABLE_API_KEY não configurada." };

    const lastUser = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const startedAt = Date.now();

    const body = {
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: systemPrompt(data.memory, !!data.pro) },
        ...data.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        await logAudit({ userId, clientId: data.clientId, pro: !!data.pro, question: lastUser, status: "rate_limited", durationMs: Date.now() - startedAt });
        return { error: "Muitas requisições. Aguarde um instante e tente novamente.", code: 429 };
      }
      if (res.status === 402) {
        await logAudit({ userId, clientId: data.clientId, pro: !!data.pro, question: lastUser, status: "credits_exhausted", durationMs: Date.now() - startedAt });
        return { error: "Créditos de IA esgotados na workspace. Recarregue em Configurações → Planos e créditos.", code: 402 };
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        await logAudit({ userId, clientId: data.clientId, pro: !!data.pro, question: lastUser, status: `http_${res.status}`, errorSnippet: txt.slice(0, 200), durationMs: Date.now() - startedAt });
        return { error: `Falha na IA (${res.status}): ${txt.slice(0, 200)}` };
      }

      const json = await res.json();
      const reply: string = json?.choices?.[0]?.message?.content ?? "";
      if (!reply) {
        await logAudit({ userId, clientId: data.clientId, pro: !!data.pro, question: lastUser, status: "empty_reply", durationMs: Date.now() - startedAt });
        return { error: "Resposta vazia da IA." };
      }
      const usage = json?.usage;
      await logAudit({
        userId,
        clientId: data.clientId,
        pro: !!data.pro,
        question: lastUser,
        reply,
        memory: data.memory,
        status: "ok",
        durationMs: Date.now() - startedAt,
        model: body.model,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
      });
      return { reply };
    } catch (err) {
      await logAudit({ userId, clientId: data.clientId, pro: !!data.pro, question: lastUser, status: "exception", errorSnippet: err instanceof Error ? err.message : String(err), durationMs: Date.now() - startedAt });
      return { error: err instanceof Error ? err.message : "Erro desconhecido." };
    }
  });

async function logAudit(entry: {
  userId?: string;
  clientId?: string;
  pro: boolean;
  question: string;
  reply?: string;
  memory?: ArnaMemory;
  status: string;
  durationMs: number;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  errorSnippet?: string;
}): Promise<void> {
  try {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return;
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    await admin.from("audit_logs").insert({
      user_id: entry.userId ?? null,
      client_id: entry.clientId ?? null,
      action: "arna_chat",
      resource: entry.pro ? "arna_ai_pro" : "arna_ai",
      metadata: {
        status: entry.status,
        model: entry.model,
        pro: entry.pro,
        question: entry.question,
        reply: entry.reply,
        memory: entry.memory ?? null,
        prompt_tokens: entry.promptTokens ?? null,
        completion_tokens: entry.completionTokens ?? null,
        duration_ms: entry.durationMs,
        error: entry.errorSnippet ?? null,
      },
    });
  } catch (err) {
    console.error("[audit_logs] insert failed", err);
  }
}