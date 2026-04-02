-- Web Push subscription storage (VAPID); one row per browser endpoint.
-- Runs after profiles is_active / requester_is_active (20260404120000).

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'Browser PushSubscription endpoints per user; server sends via web-push + VAPID.';

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  with check (
    user_id = auth.uid()
    and public.requester_is_active()
  );

create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  using (user_id = auth.uid() and public.requester_is_active())
  with check (user_id = auth.uid() and public.requester_is_active());

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (user_id = auth.uid() and public.requester_is_active());

-- RLS blocks updating another user’s row on ON CONFLICT; definer upsert reassigns endpoint to current user.
create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.requester_is_active() then
    raise exception 'inactive account';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, updated_at)
  values (
    auth.uid(),
    p_endpoint,
    p_p256dh,
    p_auth,
    nullif(trim(p_user_agent), ''),
    now()
  )
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    updated_at = now();
end;
$$;

revoke all on function public.upsert_push_subscription(text, text, text, text) from public;
grant execute on function public.upsert_push_subscription(text, text, text, text) to authenticated;

comment on function public.upsert_push_subscription(text, text, text, text) is
  'Insert or replace push subscription for auth.uid(); moves global endpoint to this user on conflict.';
