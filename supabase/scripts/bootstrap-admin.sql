-- Promote an existing Auth user to admin (profiles.is_admin = true).
--
-- Preconditions: the user has signed up or been created in Authentication so rows exist in
-- auth.users and public.profiles (trigger creates profile on signup).
--
-- 1. Edit the email in the WHERE clause if needed.
-- 2. Run in Supabase SQL Editor (postgres / service role).

update public.profiles p
set is_admin = true
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('asaravanan248@gmail.com');

-- Verify:
-- select u.email, p.username, p.is_admin
-- from public.profiles p
-- join auth.users u on u.id = p.id
-- where lower(u.email) = lower('asaravanan248@gmail.com');
