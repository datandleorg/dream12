-- Allow contest chatter inserts while match is upcoming (for testing) or live.

drop policy if exists "contest_chatter_messages_insert_member_live"
  on public.contest_chatter_messages;

create policy "contest_chatter_messages_insert_member_live_or_upcoming"
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
        and m.status in (
          'live'::public.match_status,
          'upcoming'::public.match_status
        )
    )
  );

comment on table public.contest_chatter_messages is
  'Paid contest entrants only; inserts allowed while match is upcoming (testing) or live.';
