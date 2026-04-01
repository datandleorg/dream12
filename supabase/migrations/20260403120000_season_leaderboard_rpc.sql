-- Season-scoped overall leaderboard (finalized matches only) + efficiency metrics.

create index if not exists matches_season_scoring_finalized_idx
  on public.matches (season_id)
  where status = 'completed' and scoring_finalized_at is not null;

create or replace function public.season_leaderboard(
  p_season_id bigint,
  p_min_games int default 10,
  p_bayesian_m int default 5
)
returns table (
  user_id uuid,
  username text,
  contests_played bigint,
  contests_in_window bigint,
  total_points numeric,
  simple_avg numeric,
  bayesian_score numeric,
  buffer_score numeric,
  reliability_score numeric
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
  ),
  global_mean as (
    select coalesce(avg(wa.simple_avg), 0)::numeric as c
    from with_avg wa
  )
  select
    wa.user_id,
    coalesce(pu.username, ''::text) as username,
    wa.contests_played,
    c.n as contests_in_window,
    wa.total_points,
    wa.simple_avg,
    (
      (wa.contests_played::numeric * wa.simple_avg + p_bayesian_m::numeric * gm.c)
      / nullif(wa.contests_played + p_bayesian_m, 0)
    )::numeric as bayesian_score,
    (wa.total_points / greatest(wa.contests_played::numeric, p_min_games::numeric))::numeric as buffer_score,
    (
      wa.simple_avg * (wa.contests_played::numeric / nullif(c.n, 0)::numeric)
    )::numeric as reliability_score
  from with_avg wa
  cross join cic c
  cross join global_mean gm
  left join public.profile_usernames pu on pu.id = wa.user_id
  order by wa.total_points desc, wa.contests_played desc, wa.user_id asc;
$$;

comment on function public.season_leaderboard(bigint, int, int) is
  'Aggregates user_teams points across contests in a season whose matches are completed and scoring-finalized; includes total, simple avg, Bayesian avg, min-games buffer, and reliability scores.';

grant execute on function public.season_leaderboard(bigint, int, int) to authenticated;

notify pgrst, 'reload schema';
