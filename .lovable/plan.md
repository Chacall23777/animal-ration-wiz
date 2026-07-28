## Fatia 1 — Auth Supabase real + banco (profiles/subscriptions/roles)

Substituo o login mock (localStorage) por autenticação real do Lovable Cloud com **email+senha** e **Google**, migro o estado de assinatura para o banco com RLS, e configuro `rogeriopereira289@gmail.com` como **admin vitalício** automaticamente no primeiro login.

Fatias seguintes (não incluídas aqui — cada uma vira um turno próprio):
- Painel do proprietário `/admin` (usuários, assinaturas, receita, audit logs).
- Corrigir Stripe: webhook gravando na tabela `subscriptions` + gate real por assinatura ativa.
- Deep-links do checkout, portal do cliente, cancelamento.

### O que muda no banco (uma migration)

- `app_role` enum: `admin`, `user`.
- `profiles` (`id` = `auth.users.id`, `email`, `full_name`) — RLS: cada um lê/edita o próprio; admin lê tudo.
- `user_roles` (`user_id`, `role`) — RLS: cada um lê seus papéis; admin lê tudo. Nunca gravável pelo cliente.
- `subscriptions` (`user_id`, `stripe_customer_id`, `stripe_subscription_id`, `price_id`, `status`, `current_period_end`, `cancel_at_period_end`, `environment`) — RLS: cada um lê a própria; admin lê tudo. Escrita só via `service_role` (webhook).
- Função `public.has_role(uuid, app_role)` SECURITY DEFINER (evita recursão em RLS).
- Função `public.has_active_subscription(uuid)` — retorna `true` se o usuário é admin OU tem `subscriptions.status` em (`active`, `trialing`) OU `canceled` com `current_period_end > now()`.
- Trigger `on_auth_user_created`: cria linha em `profiles`, adiciona role `user`, e se `email = 'rogeriopereira289@gmail.com'` adiciona também role `admin` (vitalício, sem depender de assinatura).

### Auth

- Habilito Google via `configure_social_auth` (email continua ativo).
- Nova rota pública `/auth`: tabs entrar/criar conta (email+senha) + botão "Entrar com Google" (via `lovable.auth.signInWithOAuth`).
- Root: um único `onAuthStateChange` filtrando `SIGNED_IN` / `SIGNED_OUT` / `USER_UPDATED` para invalidar router+queries.

### App (`src/routes/index.tsx`)

- Removo o `account` em `localStorage`.
- Hook `useSession()` + `useSubscription()` (React Query, chave por `user.id` e `environment` do Stripe).
- Paywall aparece quando: sem sessão **ou** sem assinatura ativa (admin passa sempre).
- `ContaPanel` mostra email real, botão "Sair" (limpa cache, `signOut`, navega para `/auth`).
- Botão "Assinar" continua indo para `/checkout` (webhook real na próxima fatia — hoje o retorno ainda libera localmente, mas o gate real já é o banco).

### O que **não** muda nesta fatia

- Regras de negócio do calculador, plantel e chat ARNA AI seguem iguais.
- Não crio ainda painel `/admin` nem webhook do Stripe (próximas fatias).
- Não mexo em `src/integrations/supabase/*` (arquivos gerenciados).

### Detalhes técnicos

- Migration única com `CREATE TABLE` → `GRANT` → `ENABLE RLS` → `CREATE POLICY` na ordem obrigatória. Sem grant `anon` (tudo é escopo `auth.uid()`).
- Sem novo Edge Function: dados sensíveis chegam via cliente Supabase autenticado (RLS filtra).
- `start.ts` já registra `attachSupabaseAuth` — nada a mexer.
- Google OAuth `redirect_uri = window.location.origin` (rota pública), depois redireciono para `/` após `getSession()` confirmar.

Aprova para eu executar?