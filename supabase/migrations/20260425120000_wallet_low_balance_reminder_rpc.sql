-- Batch reminder for sustained low balance (cron). Complements tr_notify_wallet_low_balance,
-- which fires only when balance crosses from >= ₹50 to < ₹50 on wallet updates.

create or replace function public.wallet_low_balance_reminder_run(
  p_cooldown_hours int default 168,
  p_max_inserts int default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold numeric(12, 2) := 50;
  v_inserted int := 0;
  v_hours int;
  v_limit int;
begin
  v_hours := greatest(1, least(coalesce(p_cooldown_hours, 168), 24 * 30));
  v_limit := greatest(1, least(coalesce(p_max_inserts, 200), 500));

  insert into public.notifications (user_id, type, title, body, payload)
  select
    x.id,
    'wallet_low_balance',
    'Low wallet balance',
    format(
      'Your balance is ₹%s. Add funds so you can keep joining contests.',
      trim(to_char(round(x.wallet_balance, 2), 'FM999999990.00'))
    ),
    jsonb_build_object(
      'href', '/wallet',
      'balance_inr', round(x.wallet_balance, 2),
      'threshold_inr', v_threshold,
      'reminder', true
    )
  from (
    select p.id, p.wallet_balance
    from public.profiles p
    where p.is_active = true
      and p.wallet_balance < v_threshold
      and not exists (
        select 1
        from public.notifications n
        where n.user_id = p.id
          and n.type = 'wallet_low_balance'
          and n.created_at > timezone('utc', now()) - make_interval(hours => v_hours)
      )
    order by p.id
    limit v_limit
  ) x;

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'inserted', v_inserted,
    'threshold_inr', v_threshold,
    'cooldown_hours', v_hours,
    'max_inserts', v_limit
  );
end;
$$;

revoke all on function public.wallet_low_balance_reminder_run(int, int) from public;
grant execute on function public.wallet_low_balance_reminder_run(int, int) to service_role;

comment on function public.wallet_low_balance_reminder_run(int, int) is
  'Service/cron: insert wallet_low_balance for active profiles under ₹50 with no same-type notification in cooldown window. Default cooldown 7d, max 200 rows per call.';
