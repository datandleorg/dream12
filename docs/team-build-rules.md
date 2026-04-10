# Team build rules

This document mirrors the fantasy squad rules enforced in the app. **Source of truth for numeric constants** is [`src/lib/fantasy/rules.ts`](../src/lib/fantasy/rules.ts).

## Squad size

- Pick exactly **11** players for your fantasy XI.

## Credits

- Total credit value of all 11 players must be **≤ 100.0**.
- You choose how to spend credits within that cap.

## Franchise (team) limit

- You may pick **at most 8 players from a single real-world franchise** (e.g. Royal Challengers Bengaluru vs Sunrisers Hyderabad in the same match).
- The limit applies to the **full squad name** stored on each player row after sync (e.g. `"Royal Challengers Bengaluru"`), not only abbreviations in the UI.
- Constant: `MAX_PLAYERS_SAME_FRANCHISE` (**8**).

## Roles (WK / BAT / AR / BOWL)

Fantasy role comes from sync (`position_label` → see [`infer-role-from-position-label.ts`](../src/lib/sportmonks/infer-role-from-position-label.ts)). It is used for **filtering and pitch layout** in the UI only; there is **no** enforced minimum or maximum count per role in the XI.

## When rules are enforced

| Stage | Mechanism |
|-------|-----------|
| **Squad picker (build)** | [`canAddPlayerToSquad`](../src/lib/fantasy/validate-squad.ts) blocks adds that would break squad size, credit cap, or franchise cap. |
| **Captain / preview** | Squad size must be 11 before continuing. |
| **Save / join** | [`validateSquad`](../src/lib/fantasy/validate-squad.ts) runs full checks (including C/VC, credits, franchise cap) before the server RPC. |

## Captain and vice-captain (post–XI pick)

- Both slots must be set from the 11 picked players (they may be the **same** player).
- Captain **2×** points, vice-captain **1.5×**. If one player is both, scoring uses the **captain** multiplier only (2×); see `applyCaptainMultipliers` in [`scoring.ts`](../src/lib/fantasy/scoring.ts).

## Lineup conflicts (SportMonks)

- Not a “pick rule” for eligibility: if official XI data is synced, players not in the announced XI may be flagged in the UI; swapping is allowed until the **team lock** deadline (1 minute before scheduled start, same as save RPC).

## Product note

Rule texts in the product (e.g. FlowHeader copy) should stay aligned with this file and `rules.ts` when marketing or legal wording changes.
