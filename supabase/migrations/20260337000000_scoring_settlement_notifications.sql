-- Final scoring marker, prize settlement, in-app notifications

alter table public.matches
  add column if not exists scoring_finalized_at timestamptz;

comment on column public.matches.scoring_finalized_at is 'Set after final fantasy points recompute for completed matches (cron).';

alter table public.matches
  add column if not exists lineup_notified_at timestamptz;

comment on column public.matches.lineup_notified_at is 'Set when users were notified that playing XI is available (once per match).';

alter table public.contests
  add column if not exists prizes_settled_at timestamptz;

comment on column public.contests.prizes_settled_at is 'Set once contest winnings are credited (idempotent).';

create table if not exists public.contest_payouts (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  user_team_id uuid not null references public.user_teams (id) on delete cascade,
  rank int not null,
  amount_inr numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  unique (contest_id, user_team_id)
);

create index if not exists contest_payouts_contest_idx on public.contest_payouts (contest_id);
create index if not exists contest_payouts_user_idx on public.contest_payouts (user_id);

alter table public.contest_payouts enable row level security;

create policy "contest_payouts_select_own"
  on public.contest_payouts for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notifications (inserts via service role / security definer only)
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications_update_own_read"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

do $pub$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end
$pub$;

-- Mark single notification read (client)
create or replace function public.mark_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.notifications
  set read_at = coalesce(read_at, timezone('utc', now()))
  where id = p_id and user_id = auth.uid();
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

-- Server/cron: create notification (service role bypasses RLS on insert)
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or p_type is null or length(trim(p_type)) = 0 then
    raise exception 'invalid notification';
  end if;
  insert into public.notifications (user_id, type, title, body, payload)
  values (
    p_user_id,
    trim(p_type),
    coalesce(nullif(trim(p_title), ''), 'Update'),
    coalesce(nullif(trim(p_body), ''), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_notification(uuid, text, text, text, jsonb) from public;
grant execute on function public.create_notification(uuid, text, text, text, jsonb) to service_role;

-- Prize per rank from prize_breakup slabs (amount split equally within each slab)
create or replace function public.prize_amount_for_rank(p_breakup jsonb, p_rank int)
returns numeric
language sql
immutable
as $$
  select coalesce(
    (
      select round((elem->>'amount')::numeric / greatest(1, (elem->>'rank_to')::int - (elem->>'rank_from')::int + 1), 2)
      from jsonb_array_elements(p_breakup) elem
      where p_rank >= (elem->>'rank_from')::int
        and p_rank <= (elem->>'rank_to')::int
      limit 1
    ),
    0::numeric
  );
$$;

-- Idempotent settlement for one contest
create or replace function public.settle_contest_prizes(p_contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id bigint;
  v_breakup jsonb;
  v_settled timestamptz;
  v_rank int := 0;
  rec record;
  v_amt numeric(12, 2);
  v_paid int := 0;
begin
  select c.match_id, c.prize_breakup, c.prizes_settled_at
  into v_match_id, v_breakup, v_settled
  from public.contests c
  where c.id = p_contest_id
  for update;

  if not found then
    raise exception 'contest not found';
  end if;

  if v_settled is not null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_settled');
  end if;

  if not exists (
    select 1 from public.matches m
    where m.id = v_match_id
      and m.status = 'completed'
      and m.scoring_finalized_at is not null
  ) then
    return jsonb_build_object('ok', false, 'skipped', true, 'reason', 'match_not_ready');
  end if;

  if v_breakup is null or jsonb_typeof(v_breakup) <> 'array' then
    v_rank := 0;
    for rec in
      select ut.user_id, ut.id as team_id
      from public.user_teams ut
      where ut.contest_id = p_contest_id
      order by ut.total_points desc, ut.created_at asc, ut.id asc
    loop
      v_rank := v_rank + 1;
      perform public.create_notification(
        rec.user_id,
        'match_result',
        'Contest closed',
        format('Final standings are in. You finished rank %s.', v_rank),
        jsonb_build_object(
          'contest_id', p_contest_id,
          'match_id', v_match_id,
          'rank', v_rank,
          'amount_inr', 0,
          'href', format('/contests/%s', p_contest_id)
        )
      );
    end loop;
    update public.contests set prizes_settled_at = timezone('utc', now()) where id = p_contest_id;
    return jsonb_build_object('ok', true, 'payouts', 0, 'note', 'no_prize_breakup');
  end if;

  for rec in
    select ut.id as team_id, ut.user_id, ut.total_points, ut.created_at
    from public.user_teams ut
    where ut.contest_id = p_contest_id
    order by ut.total_points desc, ut.created_at asc, ut.id asc
  loop
    v_rank := v_rank + 1;
    v_amt := public.prize_amount_for_rank(v_breakup, v_rank);
    if v_amt > 0 then
      insert into public.contest_payouts (contest_id, user_id, user_team_id, rank, amount_inr)
      values (p_contest_id, rec.user_id, rec.team_id, v_rank, v_amt);

      update public.profiles
      set wallet_balance = wallet_balance + v_amt
      where id = rec.user_id;

      perform public.create_notification(
        rec.user_id,
        'match_result',
        'Contest winnings',
        format('You won ₹%s (rank %s).', v_amt::text, v_rank),
        jsonb_build_object(
          'contest_id', p_contest_id,
          'match_id', v_match_id,
          'rank', v_rank,
          'amount_inr', v_amt,
          'href', format('/contests/%s', p_contest_id)
        )
      );
      v_paid := v_paid + 1;
    else
      perform public.create_notification(
        rec.user_id,
        'match_result',
        'Contest finished',
        format('Your contest ended. You placed rank %s.', v_rank),
        jsonb_build_object(
          'contest_id', p_contest_id,
          'match_id', v_match_id,
          'rank', v_rank,
          'amount_inr', 0,
          'href', format('/contests/%s', p_contest_id)
        )
      );
    end if;
  end loop;

  update public.contests
  set prizes_settled_at = timezone('utc', now())
  where id = p_contest_id;

  return jsonb_build_object('ok', true, 'payouts', v_paid, 'participants', v_rank);
end;
$$;

revoke all on function public.settle_contest_prizes(uuid) from public;
grant execute on function public.settle_contest_prizes(uuid) to service_role;

-- Wallet top-up (Razorpay) → notification
create or replace function public.tr_notify_wallet_razorpay()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'razorpay' and new.status = 'approved' and new.amount > 0 then
    insert into public.notifications (user_id, type, title, body, payload)
    values (
      new.user_id,
      'wallet_credit',
      'Wallet credited',
      format('₹%s added to your wallet.', trim(to_char(new.amount, 'FM999999999990.00'))),
      jsonb_build_object('amount_inr', new.amount, 'href', '/wallet')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_notify_wallet_razorpay on public.transactions;
create trigger transactions_notify_wallet_razorpay
  after insert on public.transactions
  for each row
  execute function public.tr_notify_wallet_razorpay();

-- Joined a contest (first team save)
create or replace function public.tr_notify_contest_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select coalesce(nullif(trim(c.name), ''), 'Contest') into v_name
  from public.contests c where c.id = new.contest_id;

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    new.user_id,
    'contest_joined',
    'Joined contest',
    format('You joined %s.', v_name),
    jsonb_build_object(
      'contest_id', new.contest_id,
      'match_id', new.match_id,
      'href', format('/matches/%s/contests/%s/squad', new.match_id, new.contest_id)
    )
  );
  return new;
end;
$$;

drop trigger if exists user_teams_notify_joined on public.user_teams;
create trigger user_teams_notify_joined
  after insert on public.user_teams
  for each row
  execute function public.tr_notify_contest_joined();

-- User-created contest
create or replace function public.tr_notify_contest_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.notifications (user_id, type, title, body, payload)
    values (
      new.created_by,
      'contest_created',
      'Contest created',
      coalesce(nullif(trim(new.name), ''), 'Your contest') || ' is live.',
      jsonb_build_object(
        'contest_id', new.id,
        'match_id', new.match_id,
        'href', format('/matches/%s', new.match_id)
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists contests_notify_created on public.contests;
create trigger contests_notify_created
  after insert on public.contests
  for each row
  execute function public.tr_notify_contest_created();

notify pgrst, 'reload schema';
