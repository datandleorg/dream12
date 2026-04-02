-- Season leaderboard: drop Bayesian / buffer / reliability; keep totals and simple average only.

drop function if exists public.season_leaderboard(bigint, int, int);

create function public.season_leaderboard(p_season_id bigint)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  contests_played bigint,
  contests_in_window bigint,
  total_points numeric,
  simple_avg numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with window_matches as (
    select m.id
    from public.matches m
    where m.season_id = p_season_id
      and m.status = 'completed'
      and m.scoring_finalized_at is not null
  ),
  window_contests as (
    select c.id as contest_id
    from public.contests c
    where c.match_id in (select wm.id from window_matches wm)
  ),
  cic as (
    select count(*)::bigint as n from window_contests
  ),
  user_stats as (
    select
      ut.user_id,
      count(*)::bigint as contests_played,
      sum(ut.total_points) as total_points
    from public.user_teams ut
    where ut.contest_id in (select wc.contest_id from window_contests wc)
    group by ut.user_id
  ),
  with_avg as (
    select
      us.user_id,
      us.contests_played,
      us.total_points,
      (us.total_points / nullif(us.contests_played, 0))::numeric as simple_avg
    from user_stats us
    where us.contests_played >= 1
  )
  select
    wa.user_id,
    coalesce(pu.username, ''::text) as username,
    pu.avatar_url,
    wa.contests_played,
    c.n as contests_in_window,
    wa.total_points,
    wa.simple_avg
  from with_avg wa
  cross join cic c
  left join public.profile_usernames pu on pu.id = wa.user_id
  order by wa.total_points desc, wa.contests_played desc, wa.user_id asc;
$$;

comment on function public.season_leaderboard(bigint) is
  'Aggregates user_teams points across contests in a season whose matches are completed and scoring-finalized; total points and per-contest average only.';

grant execute on function public.season_leaderboard(bigint) to authenticated;

notify pgrst, 'reload schema';
