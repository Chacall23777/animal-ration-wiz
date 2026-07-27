create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public

as $$

begin

insert into public.subscribers
(id,email,is_admin,valid_until)

values(

new.id,
new.email,
(select count(*) from public.subscribers)=0,
null

)

on conflict(id)
do nothing;

return new;

end;

$$;
