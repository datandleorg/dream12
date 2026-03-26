-- Leaderboard: expose id + username only (no wallet).
create or replace view public.profile_usernames
with (security_invoker = false) as
  select id, username from public.profiles;

grant select on public.profile_usernames to anon, authenticated;
