
# Plano — ARNAR como ERP Agro Inteligente

Escopo grande. Vou dividir em fases entregáveis, sem remover nada do que já existe (calculadora, plantel, financeiro, sanitário, IA, galeria, propriedades, relatórios PDF/Excel, PWA/TWA, Stripe trial→R$97 vitalício).

---

## Fase 1 — Controle de acesso rígido (login gated por banco)

**Objetivo:** Ninguém entra só por ter conta Google. Todo login consulta o banco.

- Nova tabela `access_control` (email, tipo: `super_admin` | `admin` | `lifetime` | `trial` | `blocked`, nome, criado_por, criado_em).
- Semear `rogeriopereira289@gmail.com` como `super_admin` permanente (nunca bloqueável, nunca cobrado — proteção no backend).
- Server function `resolveAccess(email)` chamada logo após o login (Google ou senha). Se não existir e não estiver em trial ativo → sign out imediato + tela "Email não autorizado. Deseja iniciar teste gratuito?".
- Tela `/auth` redesenhada: apenas dois botões — **Entrar** e **Quero testar o ARNAR**. Sem "Cadastrar-se".
- Reaproveita `pending_access` existente + fundir com nova lógica de tipos.

## Fase 2 — Liberação por Admin com link mágico de 30 min

- Admin/Super Admin informa **nome + email** → cria registro em `access_control` (lifetime) + `profiles` provisório + envia magic link Supabase (`type: invite`, expira 30 min).
- Usuário abre link → tela `/set-password` → define senha → acesso vitalício imediato.
- Bloqueio no backend: usuários criados por admin nunca entram em fluxo Stripe.

## Fase 3 — Trial com cartão obrigatório + notificações D-5/D-6/D-7

- Botão "Quero testar o ARNAR" → cria conta + Checkout Stripe com `trial_period_days: 7` (já existe `aguiar_vitalicio` R$97).
- Tela transparente: "Sem cobrança nos 7 dias. No 8º dia, cobrança única de R$97 = acesso vitalício. Cancele antes para não ser cobrado."
- Job diário (server route + pg_cron ou edge cron): envia email nos dias 5, 6, 7 do trial.
- Após pagamento confirmado: marca `lifetime` em `access_control` e trava novas cobranças (garantia server-side no webhook).
- Trial limits (10 animais / 2 lotes / 5 relatórios) já implementados — apenas reforçar UI.

## Fase 4 — Super Admin Panel expandido

- Aba "Sistema" (só super admin): estatísticas globais, todos os pagamentos, todos os lotes de todas as propriedades, todos os usuários, criar admins, backup export (JSON), auditoria completa.
- Proteção: `rogeriopereira289@gmail.com` — flag `is_protected` no backend impede qualquer UPDATE que remova admin/lifetime dele.

## Fase 5 — Biblioteca Inteligente

- Tabela `library_articles` (título, categoria: manejo/nutrição/sanidade/biosseguridade/produção, conteúdo markdown, autor, publicado_em).
- CRUD só para super admin. Leitura para todos os usuários ativos.
- Nova aba "Biblioteca" com cards, busca, filtros.

## Fase 6 — Modo offline inteligente + sync

- Service Worker já cacheia shell. Adicionar IndexedDB para lotes/financeiro/plantel.
- Fila de mutations offline → sync quando `navigator.onLine`.

## Fase 7 — Espécies escaláveis + polimento visual

- `species.ts` já existe para suínos/aves. Adicionar registry declarativo pronto para bovinos, ovinos, caprinos, equinos, peixes, camarões, abelhas, cães, gatos (parâmetros zerados, ativáveis).
- Refinar UI Nubank-style: microinterações, skeletons, dark mode consistente, tipografia mobile-first para usuário de 70 anos.

---

## Detalhes técnicos

- **Migrations Supabase:** `access_control`, `library_articles`, extensão `pending_access`, RLS + GRANTs.
- **Server functions:** `resolveAccess`, `inviteUserByAdmin`, `sendTrialReminder`, `library.*`, `superAdmin.exportBackup`.
- **Server route público:** `/api/public/cron/trial-reminders` protegido por header secret + agendado externamente.
- **Stripe webhook:** já processa `invoice.paid` — adicionar guard para não recobrar quem já é `lifetime`.
- **Frontend:** refazer `/auth`, adicionar `/set-password`, nova aba Biblioteca, expandir ContaPanel.

---

## Ordem de execução sugerida

Começo pela **Fase 1 + Fase 2** (base de segurança) — é o núcleo do que você pediu e destrava o resto. Depois avanço para 3, 4, 5, 6, 7 em turnos separados, cada um com preview verificável.

Confirma pra eu começar pela Fase 1+2, ou quer priorizar outra fase primeiro?
