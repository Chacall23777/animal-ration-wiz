alter table public.subscribers
  add column if not exists plan text not null default 'monthly'
  check (plan in ('monthly', 'annual'));
