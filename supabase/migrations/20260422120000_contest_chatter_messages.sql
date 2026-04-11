-- Contest-scoped chatter: text + voice metadata; posting only while match is live (RLS).

create table public.contest_chatter_messages (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('text', 'voice')),
  body text,
  audio_url text,
  audio_duration_seconds smallint,
  created_at timestamptz not null default now(),
  constraint contest_chatter_voice_shape check (
    (kind = 'text' and body is not null and length(trim(body)) > 0 and audio_url is null)
    or (kind = 'voice' and audio_url is not null and audio_duration_seconds is not null)
  )
);

create index contest_chatter_messages_contest_created_idx
  on public.contest_chatter_messages (contest_id, created_at desc);

alter table public.contest_chatter_messages enable row level security;

create policy "contest_chatter_messages_select_member"
  on public.contest_chatter_messages for select to authenticated
  using (
    exists (
      select 1 from public.user_teams ut
      where ut.contest_id = contest_chatter_messages.contest_id
        and ut.user_id = auth.uid()
        and ut.entry_fee_paid_at is not null
    )
  );

create policy "contest_chatter_messages_insert_member_live"
  on public.contest_chatter_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.user_teams ut
      where ut.contest_id = contest_chatter_messages.contest_id
        and ut.user_id = auth.uid()
        and ut.entry_fee_paid_at is not null
    )
    and exists (
      select 1 from public.contests c
      join public.matches m on m.id = c.match_id
      where c.id = contest_chatter_messages.contest_id
        and m.status = 'live'::public.match_status
    )
  );

create policy "contest_chatter_messages_delete_own"
  on public.contest_chatter_messages for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.contest_chatter_messages to authenticated;

comment on table public.contest_chatter_messages is 'Paid contest entrants only; inserts allowed only while match status is live.';

do $pub$
begin
  alter publication supabase_realtime add table public.contest_chatter_messages;
exception
  when duplicate_object then null;
end
$pub$;

-- notify pgrst, 'reload schema';
