# Team build rules (Dream11-style)

This document mirrors the fantasy squad rules enforced in the app. **Source of truth for numeric constants** is [`src/lib/fantasy/rules.ts`](../src/lib/fantasy/rules.ts).

## Squad size

- Pick exactly **11** players for your fantasy XI.

## Credits

- Total credit value of all 11 players must be **≤ 100.0**.
- You choose how to spend credits within that cap.

## Franchise (team) limit

- You may pick **at most 7 players from a single real-world franchise** (e.g. Royal Challengers Bengaluru vs Sunrisers Hyderabad in the same match).
- The limit applies to the **full squad name** stored on each player row after sync (e.g. `"Royal Challengers Bengaluru"`), not only abbreviations in the UI.
- Constant: `MAX_PLAYERS_SAME_FRANCHISE` (**7**).

## Role composition (WK / BAT / AR / BOWL)

Counts are by fantasy role assigned at sync time from SportMonks `position_label` (see [`infer-role-from-position-label.ts`](../src/lib/sportmonks/infer-role-from-position-label.ts)).

| Role | Code | Minimum | Maximum |
|------|------|---------|---------|
| Wicket-keeper | WK | 1 | 8 |
| Batter | BAT | 3 | 6 |
| All-rounder | AR | 1 | 4 |
| Bowler | BOWL | 3 | 6 |

Defined in `ROLE_LIMITS` in `rules.ts`.

## When rules are enforced

| Stage | Mechanism |
|-------|-----------|
| **Squad picker (build)** | [`canAddPlayerToSquad`](../src/lib/fantasy/validate-squad.ts) blocks adds that would break credit cap, franchise cap, role **maximums**, or make it **impossible** to satisfy role **minimums** with the slots left. |
| **Captain / preview** | Squad size must be 11 before continuing. |
| **Save / join** | [`validateSquad`](../src/lib/fantasy/validate-squad.ts) runs full checks (including C/VC) before the server RPC. |

## Captain and vice-captain (post–XI pick)

- Both must be chosen from the 11 picked players.
- Must be two different players.
- Captain **2×** points, vice-captain **1.5×** (scoring logic is outside this doc).

## Lineup conflicts (SportMonks)

- Not a “pick rule” for eligibility: if official XI data is synced, players not in the announced XI may be flagged in the UI; swapping is allowed until the **team lock** deadline (1 minute before scheduled start, same as save RPC).

## Product note

Rule texts in the product (e.g. FlowHeader copy) should stay aligned with this file and `rules.ts` when marketing or legal wording changes.
