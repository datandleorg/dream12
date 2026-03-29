-- PostgREST "schema cache" may not expose RPCs when typmod (numeric(12,2)) disagrees with
-- grant signature (uuid, numeric, text). Recreate with plain numeric + explicit grants.

do $$
declare
  f text;
begin
  for f in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_adjust_wallet_balance'
  loop
    execute 'drop function if exists ' || f;
  end loop;
end $$;

create or replace function public.admin_adjust_wallet_balance(
  p_user_id uuid,
  p_delta_inr numeric,
  p_reason text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  v_new_bal numeric(12, 2);
begin
  select is_admin into v_admin from public.profiles where id = auth.uid();
  if v_admin is not true then
    raise exception 'not authorized';
  end if;
  if p_delta_inr is null or p_delta_inr = 0 then
    raise exception 'invalid delta';
  end if;

  update public.profiles
  set wallet_balance = wallet_balance + p_delta_inr
  where id = p_user_id
  returning wallet_balance into v_new_bal;

  if not found then
    raise exception 'profile not found';
  end if;
  if v_new_bal < 0 then
    raise exception 'wallet balance would be negative';
  end if;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'wallet.adjusted',
    'profile',
    p_user_id::text,
    jsonb_build_object('delta_inr', p_delta_inr, 'new_balance', v_new_bal, 'reason', p_reason)
  );

  return v_new_bal;
end;
$$;

revoke all on function public.admin_adjust_wallet_balance(uuid, numeric, text) from public;
grant execute on function public.admin_adjust_wallet_balance(uuid, numeric, text) to authenticated;
grant execute on function public.admin_adjust_wallet_balance(uuid, numeric, text) to service_role;
