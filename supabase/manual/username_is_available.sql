-- Paste into Supabase Dashboard → SQL → New query, then Run.
-- Fixes: "Could not find the function public.username_is_available(p_username) in the schema cache"

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

notify pgrst, 'reload schema';

-- Normalize existing rows so checks match signup (lowercase usernames)
update public.profiles
set username = lower(trim(username))
where username is distinct from lower(trim(username));
