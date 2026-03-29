# Dream11-style T20 fantasy scoring (reference)

This document describes the **T20** fantasy point rules used as the product reference for Dream12. Implementation status is summarized at the end.

## Captain and vice-captain

| Role | Multiplier |
|------|------------|
| Captain (C) | 2× |
| Vice-captain (VC) | 1.5× |

**Dream12 behavior:** The multiplier applies to each player’s **full** match total for that player: **performance points** (batting, bowling, fielding, milestones, rate modifiers) **plus** the **+4 starting XI** bonus when applicable. Substitutes / impact players who were not in the announced XI do not get the +4; they still earn performance points only, then C/VC applies to that subtotal.

## Starting XI

| Event | Points |
|-------|--------|
| Player in announced starting XI | +4 |

Does not apply to substitutes who enter later without having been in the starting XI.

## 1. Batting

| Event | Points | Notes |
|-------|--------|--------|
| Every run scored | +1 | Includes all runs off the bat and running. |
| Boundary bonus (4s) | +1 | Stacks with run points (a four = 4 + 1 = 5). |
| Six bonus (6s) | +2 | Stacks with run points (a six = 6 + 2 = 8). |
| 30-run milestone | +4 | Superseded by higher milestones below. |
| Half-century (50+) | +8 | Overrides the 30-run bonus only. |
| Century (100+) | +16 | Overrides the 50-run bonus. |
| Duck (dismissed for 0) | −2 | Batsmen, wicket-keepers, and all-rounders only; bowlers are not penalized. |

### Strike rate (T20)

Applies only if the player has faced **at least 10 balls**.

| Strike rate (runs per 100 balls) | Points |
|----------------------------------|--------|
| > 170 | +6 |
| > 150 and ≤ 170 | +4 |
| ≥ 130 and ≤ 150 | +2 |
| ≥ 60 and ≤ 70 | −2 |
| ≥ 50 and < 60 | −4 |
| < 50 | −6 |

Bands between 70 and 130 are neutral (0).

## 2. Bowling

| Event | Points | Notes |
|-------|--------|--------|
| Wicket (excluding run-outs) | +25 | |
| Bowled / LBW bonus | +8 | Stacks with wicket points (e.g. bowled = 25 + 8 = 33). |
| 3-wicket haul | +4 | Superseded by higher haul bonuses. |
| 4-wicket haul | +8 | Overrides 3-wicket bonus. |
| 5-wicket haul | +16 | Overrides 4-wicket bonus. |
| Maiden over | +12 | Over with zero runs off bat (and typically no wides/no-balls counted as runs). |

Haul bonuses use the player’s **non–run-out** wicket count only.

### Economy rate (T20)

Applies only if the player has bowled **at least 2 complete overs** (`oversBowled ≥ 2` in normalized stats).

| Economy (runs per over) | Points |
|-------------------------|--------|
| < 5 | +6 |
| ≥ 5 and < 6 | +4 |
| ≥ 6 and < 7 | +2 |
| ≥ 10 and < 11 | −2 |
| ≥ 11 and ≤ 12 | −4 |
| > 12 | −6 |

Economy between 7 (inclusive) and 10 (exclusive) is neutral (0).

## 3. Fielding

| Event | Points | Notes |
|-------|--------|--------|
| Catch | +8 | Includes caught & bowled. |
| 3-catch bonus | +4 | Once per player in the match when they take **3 or more** catches. |
| Stumping | +12 | Wicket-keeper. |
| Run out (direct hit) | +12 | Fielder hits the stumps. |
| Run out (indirect) | +6 | Per credited involvement (thrower + breaker of stumps each +6). |

## Implementation (Dream12 codebase)

Enforced in [`src/lib/fantasy/scoring.ts`](../src/lib/fantasy/scoring.ts) (`pointsForPlayer`) and [`src/lib/live-scoring.ts`](../src/lib/live-scoring.ts) (`aggregateTeamPoints` adds starting XI using `players.in_playing_xi`).

| Rule | Status |
|------|--------|
| Batting runs / fours / sixes / duck | Implemented |
| Batting milestones 30 / 50 / 100 | Implemented |
| Strike rate bands (10+ balls) | Implemented |
| Wickets excl. run-outs, bowled/LBW +8 | Implemented — requires `wickets` = non-run-out wickets and `bowledLbwDismissals` ≤ that count |
| Wicket haul bonuses 3/4/5 | Implemented |
| Maiden +12 | Implemented |
| Economy bands (2+ overs) | Implemented |
| Catches / stumping / 3-catch bonus | Implemented |
| Run out direct / indirect | Implemented — `runOutDirect`, `runOutIndirect`; legacy `runOuts` treated as indirect (+6 each) if new fields absent |
| Starting XI +4 | Implemented in `aggregateTeamPoints` |
| Captain / vice multipliers on full player total (perf + XI) | Implemented |

### SportMonks / live feed gaps

[`src/lib/extract-live-stats-by-player.ts`](../src/lib/extract-live-stats-by-player.ts) best-effort maps nested JSON. Fields that are **often missing** from generic traversals default to **0**:

- `bowledLbwDismissals` — needs explicit dismissal-type breakdown from the provider.
- Split run-out credit (`runOutDirect` vs `runOutIndirect`) — often not distinguishable; use `runOuts` for legacy +6-per-involvement behavior.

When finalizing scores from the API, totals may be approximate until the feed exposes these breakdowns.

## Mock contest (match 69518)

- SQL seed: [`supabase/scripts/seed-mock-contest-69518.sql`](../supabase/scripts/seed-mock-contest-69518.sql) — 24 users, one platform contest, varied XIs.
- Stats fixture: [`fixtures/mock-live-stats-69518.json`](../fixtures/mock-live-stats-69518.json) — 22 per-player stat rows (aligned with this doc).
- Apply points: `pnpm mock:apply-points` (loads `.env.local`, uses `aggregateTeamPoints` + service role).
- Then mark the match completed with `scoring_finalized_at` set and run `settle_contest_prizes` (see header comments in the SQL file).
