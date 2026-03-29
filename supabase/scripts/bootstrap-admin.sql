-- Promote an existing Auth user to admin (profiles.is_admin = true).
--
-- 1. Supabase Dashboard → Authentication → Users → Add user (or sign up once in the app).
-- 2. Replace the email below with that user's email.
-- 3. Run in SQL Editor (or psql).

update public.profiles p
set is_admin = true
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('admin@example.com');

-- Verify:
-- select u.email, p.username, p.is_admin from public.profiles p join auth.users u on u.id = p.id;
