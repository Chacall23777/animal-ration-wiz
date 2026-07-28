
Vou entregar isto em **4 fatias**, cada uma um turno. Cada fatia é utilizável sozinha e o app continua funcionando entre elas.

---

## Fatia 1 — Banco + upload de fotos + perfil do produtor

**Objetivo:** dar base de dados e storage para tudo que vem depois.

Banco (uma migration):
- `properties` (id, owner_id → auth.users, name, city, state, country, description, whatsapp, instagram, photo_url, logo_url, is_default, timestamps). RLS: dono lê/escreve as suas; admin lê tudo.
- `property_photos` (id, property_id, lote_id nullable, url, category enum: `propriedade|lote|animais|galpao|aviario|pocilga`, caption, created_at). RLS por dono da propriedade.
- Adicionar `avatar_url`, `whatsapp`, `instagram` em `profiles`.
- GRANTs para `authenticated` + `service_role` na ordem correta.

Storage:
- Buckets públicos `avatars`, `property-photos`, `property-logos` via `supabase--storage_create_bucket`.
- Policies em `storage.objects`: leitura pública; upload/update/delete só pelo dono (path prefixado por `auth.uid()`).

Frontend:
- `src/lib/properties-store.ts` — hook `useProperties()` que carrega/cria/edita/deleta propriedades do banco (React Query).
- Componente `PropertyOnboarding`: modal exibido no primeiro login (ou quando `properties` estiver vazia) pedindo foto do produtor, nome completo, nome da propriedade, cidade, estado, país, whatsapp/instagram (opcionais). Salva em `profiles` + cria primeira `properties`.
- `useActiveProperty()` guarda em `localStorage` a propriedade selecionada; header ganha seletor "Fazenda Santa Luzia ▾" com opção "Nova propriedade".

**Não muda ainda:** relatórios, lotes por propriedade (usam a propriedade ativa mas ainda em localStorage), dashboard.

---

## Fatia 2 — Lotes ligados a propriedade + dashboard por propriedade

- Adicionar `property_id` nos objetos `Lote` e `MovimentoFinanceiro`. Migração dos dados atuais em localStorage para a propriedade default do usuário (feito no client no primeiro carregamento pós-fatia).
- Filtrar Plantel, Financeiro, Sanitário e Início pela propriedade ativa.
- Redesenhar `InicioPanel` no estilo Nubank/Notion com cards:
  Fazenda ativa · aves totais · suínos totais · lotes · produção do mês · consumo total · previsão de consumo · vacinas pendentes · alertas · relatórios rápidos · lucro estimado · produção total.
- Animações suaves (framer-motion já pode ser usado com CSS transitions), barras de progresso, ícones do lucide-react (já disponível).

---

## Fatia 3 — Galeria de fotos + Minha Conta expandida

- `PropertyGallery`: grid organizado por categoria (Propriedade / Lotes / Animais / Galpão / Aviário / Pocilga), upload direto para storage, preview em lightbox.
- `MinhaContaPanel` reformulado com as seções pedidas: Alterar foto · Alterar senha · Alterar e-mail · Minhas propriedades · Minhas exportações · Minhas vacinas · Meus relatórios · Meus lotes · Configurações. Cada uma abre um subpainel navegável.
- "Minhas propriedades" permite CRUD completo (editar/excluir/definir padrão, adicionar logo e foto).
- Alterar senha via `supabase.auth.updateUser`, e-mail idem.

---

## Fatia 4 — Relatórios ricos (PDF + Excel) usando propriedade + fotos

- `plantel-report.ts` passa a receber `property` + `producer` + `photos` opcionais.
- **PDF** (jspdf): cabeçalho com logo ARNAR à esquerda, logo da propriedade à direita, foto da propriedade em faixa opcional, bloco produtor (nome, whatsapp, instagram, cidade/estado), bloco propriedade, tabela do lote (qtd, peso, consumo diário/mensal, ganho de peso, previsão, vacinas), lucro estimado, gráficos inteligentes (barras de consumo por dia, pizza de custos), QR code apontando para a página do lote, data de emissão, rodapé "ARNAR — Aguiar Nutrição Animal".
- **Excel** (xlsx): abas *Resumo*, *Lote*, *Consumo*, *Vacinas*, *Financeiro*, *Histórico*, *Observações* — todas com produtor/propriedade no topo, gráficos nativos onde possível.
- Relatórios do dashboard puxam automaticamente a propriedade ativa.

---

## Aparência (aplicada em todas as fatias)

- Continuar no design system atual (verde/dourado ARNA, dark mode já implementado).
- Cards arredondados, sombra leve, ícones lucide, tipografia atual.
- Sem telas poluídas: cada painel abre em stack navigation, um assunto por tela no mobile.

---

## Notas técnicas

- Nada de Edge Function nova; tudo via `createServerFn` + RLS. Uploads direto do cliente com o Supabase client autenticado.
- Fotos armazenadas em `avatars/<uid>/...`, `property-photos/<uid>/<property_id>/...`, `property-logos/<uid>/<property_id>/...` para que a policy de storage possa validar por prefixo.
- Fatias 2–4 dependem da fatia 1 (banco + storage). Vou parar após cada fatia para você validar antes da próxima.

**Confirma para eu começar pela Fatia 1?**
