-- Tabela de assinaturas do Aguiar Nutrição Animal
create table if not exists public.subscribers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  valid_until timestamptz,               -- null = nunca assinou
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscribers enable row level security;

create policy "select own subscription"
  on public.subscribers for select
  using (auth.uid() = id);

create policy "insert own subscription"
  on public.subscribers for insert
  with check (auth.uid() = id);

create policy "admin select all"
  on public.subscribers for select
  using (
    exists (select 1 from public.subscribers s where s.id = auth.uid() and s.is_admin = true)
  );

create policy "admin update all"
  on public.subscribers for update
  using (
    exists (select 1 from public.subscribers s where s.id = auth.uid() and s.is_admin = true)
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.subscribers (id, email, is_admin, valid_until)
  values (
    new.id,
    new.email,
    (select count(*) from public.subscribers) = 0,
    now() + interval '7 days'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
