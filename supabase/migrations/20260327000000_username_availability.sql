-- Case-insensitive username check for signup (callable by anon before auth)
create or replace function public.username_is_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1
    from public.profiles
    where lower(username) = lower(trim(p_username))
      and length(trim(p_username)) > 0
  );
$$;

grant execute on function public.username_is_available(text) to anon, authenticated;

-- Refresh PostgREST so /rest/v1/rpc/username_is_available appears (fixes "schema cache" errors)
notify pgrst, 'reload schema';

-- Store usernames lowercase; resolve collisions case-insensitively
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_uname text;
  uname text;
  n int := 0;
begin
  base_uname := lower(trim(coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    nullif(trim(split_part(new.email, '@', 1)), ''),
    'user'
  )));

  if base_uname = '' then
    base_uname := 'user';
  end if;

  uname := base_uname;
  while exists (select 1 from public.profiles where lower(username) = uname) loop
    n := n + 1;
    uname := base_uname || '_' || n::text;
  end loop;

  insert into public.profiles (id, username)
  values (new.id, uname)
  on conflict (id) do nothing;

  return new;
end;
$$;
