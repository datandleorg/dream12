-- Notify when wallet balance drops strictly below ₹50 after being at or above ₹50
-- (one alert per "dip below" until the user tops back up to ≥50).

create or replace function public.tr_notify_wallet_low_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold numeric(12, 2) := 50;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if new.wallet_balance is not distinct from old.wallet_balance then
    return new;
  end if;
  if new.wallet_balance >= v_threshold then
    return new;
  end if;
  if coalesce(old.wallet_balance, 0) < v_threshold then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    new.id,
    'wallet_low_balance',
    'Low wallet balance',
    format(
      'Your balance is ₹%s. Add funds so you can keep joining contests.',
      trim(to_char(round(new.wallet_balance, 2), 'FM999999990.00'))
    ),
    jsonb_build_object(
      'href', '/wallet',
      'balance_inr', round(new.wallet_balance, 2),
      'threshold_inr', v_threshold
    )
  );

  return new;
end;
$$;

drop trigger if exists profiles_wallet_low_balance_notify on public.profiles;
create trigger profiles_wallet_low_balance_notify
  after update of wallet_balance on public.profiles
  for each row
  execute function public.tr_notify_wallet_low_balance();

comment on function public.tr_notify_wallet_low_balance() is
  'After wallet_balance update: if new balance < ₹50 and old was >= ₹50, inserts wallet_low_balance notification.';
