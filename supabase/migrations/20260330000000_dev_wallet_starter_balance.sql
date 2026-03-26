-- Dev / QA: starter wallet balance for join-flow testing. Adjust or remove before production.

alter table public.profiles
  alter column wallet_balance set default 1000;

-- Existing users who still have 0 get a one-time top-up (does not reduce higher balances).
update public.profiles
set wallet_balance = 1000
where wallet_balance = 0;

notify pgrst, 'reload schema';
