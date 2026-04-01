-- Mirrored with Auth ban for admin activate/deactivate; RLS blocks mutations when inactive.

alter table public.profiles
  add column if not exists is_active boolean not null default true;

create or replace function public.requester_is_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.is_active from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.requester_is_active() from public;
grant execute on function public.requester_is_active() to authenticated;

comment on function public.requester_is_active() is
  'True when the JWT user has profiles.is_active; used in RLS to block writes for deactivated accounts.';

alter policy "profiles_update_own_username" on public.profiles
  with check (
    auth.uid() = id
    and wallet_balance = (select p.wallet_balance from public.profiles p where p.id = auth.uid())
    and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid())
    and is_active = (select p.is_active from public.profiles p where p.id = auth.uid())
  );

alter policy "user_teams_insert_own" on public.user_teams
  with check (user_id = auth.uid() and public.requester_is_active());

alter policy "user_teams_update_own" on public.user_teams
  using (user_id = auth.uid() and public.requester_is_active())
  with check (user_id = auth.uid() and public.requester_is_active());

alter policy "user_teams_delete_own" on public.user_teams
  using (user_id = auth.uid() and public.requester_is_active());

alter policy "roster_insert_own_team" on public.team_roster
  with check (
    exists (
      select 1 from public.user_teams ut
      where ut.id = team_id and ut.user_id = auth.uid()
    )
    and public.requester_is_active()
  );

alter policy "roster_delete_own_team" on public.team_roster
  using (
    exists (
      select 1 from public.user_teams ut
      where ut.id = team_id and ut.user_id = auth.uid()
    )
    and public.requester_is_active()
  );

alter policy "transactions_insert_own" on public.transactions
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and public.requester_is_active()
  );

alter policy "notifications_update_own_read" on public.notifications
  using (user_id = auth.uid() and public.requester_is_active())
  with check (user_id = auth.uid() and public.requester_is_active());

alter policy "pay_in_requests_insert_own_pending" on public.pay_in_requests
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and public.requester_is_active()
  );

alter policy "pay_out_requests_insert_own_pending" on public.pay_out_requests
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and public.requester_is_active()
  );
