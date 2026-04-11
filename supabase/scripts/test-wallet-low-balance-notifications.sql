-- Test wallet low-balance behavior (migrations 20260424120000 + 20260425120000).
--
-- Covers:
--   1) Trigger profiles_wallet_low_balance_notify — row only when crossing from >= ₹50 to < ₹50.
--   2) RPC wallet_low_balance_reminder_run — reminder row with payload.reminder = true (cooldown logic).
--
-- Safe mode: entire script wrapped in BEGIN / ROLLBACK so no lasting wallet or notification changes.
--
-- Setup: set v_user_id to a real profiles.id (your test account). The user must exist and stay is_active.

begin;

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- TODO: replace
  n0 bigint;
  n1 bigint;
  n2 bigint;
  n3 bigint;
  r jsonb;
begin
  if v_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Set v_user_id to a real profiles.id';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_user_id) then
    raise exception 'profiles row not found for %', v_user_id;
  end if;

  -- Baseline count of low-balance notifications for this user (any time).
  select count(*) into n0
  from public.notifications
  where user_id = v_user_id and type = 'wallet_low_balance';

  -- A) Cross below threshold → should fire trigger (100 → 40).
  update public.profiles set wallet_balance = 100 where id = v_user_id;
  update public.profiles set wallet_balance = 40 where id = v_user_id;

  select count(*) into n1
  from public.notifications
  where user_id = v_user_id and type = 'wallet_low_balance';

  if n1 <> n0 + 1 then
    raise exception 'TEST A FAILED: expected exactly one new wallet_low_balance row (got % before, % after)', n0, n1;
  end if;
  raise notice 'TEST A OK: trigger fired (100 → 40). notifications: % → %', n0, n1;

  -- B) Still below 50, decrease again → should NOT fire (40 → 35).
  update public.profiles set wallet_balance = 35 where id = v_user_id;

  select count(*) into n2
  from public.notifications
  where user_id = v_user_id and type = 'wallet_low_balance';

  if n2 <> n1 then
    raise exception 'TEST B FAILED: expected no extra row when staying below 50 (was %, now %)', n1, n2;
  end if;
  raise notice 'TEST B OK: no duplicate while still under 50 (count=%).', n2;

  -- C) Top up then cross again → should fire again (35 → 60 → 45).
  update public.profiles set wallet_balance = 60 where id = v_user_id;
  update public.profiles set wallet_balance = 45 where id = v_user_id;

  select count(*) into n3
  from public.notifications
  where user_id = v_user_id and type = 'wallet_low_balance';

  if n3 <> n2 + 1 then
    raise exception 'TEST C FAILED: expected another row after 60 → 45 (count was %, now %)', n2, n3;
  end if;
  raise notice 'TEST C OK: second crossing fired (count=%).', n3;

  -- D) A trigger row should not set payload.reminder (cron sets true).
  if not exists (
    select 1
    from public.notifications n
    where n.user_id = v_user_id
      and n.type = 'wallet_low_balance'
      and n.body like '%₹45%'
      and (n.payload->>'reminder') is null
  ) then
    raise notice 'TEST D WARN: no trigger row with ₹45 and payload.reminder absent.';
  else
    raise notice 'TEST D OK: trigger-style row (no reminder flag) present.';
  end if;
end $$;

-- Reminder RPC: asserts only **this user** gains a row (RPC may insert for other profiles too on shared DB).
do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- same as above
  r jsonb;
  n_before bigint;
  n_after bigint;
  n_second bigint;
begin
  if v_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Set v_user_id to a real profiles.id';
  end if;

  update public.profiles set wallet_balance = 25 where id = v_user_id;
  delete from public.notifications
  where user_id = v_user_id
    and type = 'wallet_low_balance';

  select count(*) into n_before
  from public.notifications
  where user_id = v_user_id and type = 'wallet_low_balance';

  if n_before <> 0 then
    raise exception 'TEST E setup: expected 0 rows for user after delete, got %', n_before;
  end if;

  r := public.wallet_low_balance_reminder_run(1, 500);

  select count(*) into n_after
  from public.notifications
  where user_id = v_user_id and type = 'wallet_low_balance';

  if n_after < 1 then
    raise exception 'TEST E FAILED: expected this user to get >=1 reminder row (before=%, after=%, rpc=%)', n_before, n_after, r;
  end if;

  if not exists (
    select 1
    from public.notifications
    where user_id = v_user_id
      and type = 'wallet_low_balance'
      and (payload->>'reminder') = 'true'
  ) then
    raise exception 'TEST E FAILED: reminder row missing payload.reminder = true';
  end if;

  raise notice 'TEST E OK: user gained reminder row(s). rpc summary: %', r;

  -- F) Immediate rerun: same user should not get another row (1h cooldown).
  r := public.wallet_low_balance_reminder_run(1, 500);

  select count(*) into n_second
  from public.notifications
  where user_id = v_user_id and type = 'wallet_low_balance';

  if n_second <> n_after then
    raise exception 'TEST F FAILED: cooldown should not add another row for this user (was %, now %)', n_after, n_second;
  end if;

  raise notice 'TEST F OK: user row count stable after rerun (%). rpc=%', n_second, r;
end $$;

rollback;

-- After ROLLBACK, database is unchanged. Re-run with COMMIT only if you intentionally want to keep test data.

-- ---------------------------------------------------------------------------
-- Push vs email allowlist (TypeScript change, not SQL): from repo root run:
--   npx vitest run src/lib/email/notification-email.test.ts -t shouldSendPushForNotificationType
-- ---------------------------------------------------------------------------
