-- New users start with ₹0; they add funds via wallet top-up. Existing rows unchanged.

alter table public.profiles
  alter column wallet_balance set default 0;
