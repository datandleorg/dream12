-- Fix login error "Database error querying schema" when mock SQL users exist in auth.users
-- but have no row in public.profiles (handle_new_user trigger did not run or failed).
--
-- Safe to re-run: only inserts missing profiles; updates wallet for rows that already exist
-- if you want to force 10000 balance, adjust the DO block.
--
-- Run in Supabase SQL Editor as postgres / service role.

begin;

insert into public.profiles (id, username, wallet_balance)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'username'), ''),
    split_part(u.email, '@', 1)
  ),
  10000.00
from auth.users u
where u.email like 'mock\_%@dream12.test' escape '\'
  and not exists (select 1 from public.profiles p where p.id = u.id);

commit;

-- Verify one user:
-- select u.email, p.id, p.username from auth.users u
-- left join public.profiles p on p.id = u.id
-- where u.email = 'mock_69518_u001@dream12.test';
