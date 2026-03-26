-- Avoid duplicate username on signup when email local-part collides
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_uname text;
  uname text;
  n int := 0;
begin
  base_uname := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    nullif(trim(split_part(new.email, '@', 1)), ''),
    'user'
  );
  uname := base_uname;
  while exists (select 1 from public.profiles where username = uname) loop
    n := n + 1;
    uname := base_uname || '_' || n::text;
  end loop;

  insert into public.profiles (id, username)
  values (new.id, uname)
  on conflict (id) do nothing;

  return new;
end;
$$;
