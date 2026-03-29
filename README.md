This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment variables

Copy `.env.example` to `.env.local` and fill in values.

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | **service_role** key from Supabase → Settings → API (not anon). Required for `/admin/users` (list/create via Auth Admin API), wallet overrides, and cron. **never** in client code — add to Vercel/host secrets and redeploy after changing. |
| `NEXT_PUBLIC_COMPANY_UPI_VPA` | Client + server | Company UPI ID for wallet pay-in intents (e.g. `merchant@paytm`) |
| `NEXT_PUBLIC_COMPANY_UPI_PAYEE_NAME` | Client (optional) | Display name in UPI intent |
| `NEXT_PUBLIC_UPI_MERCHANT_CATEGORY_CODE` | Client (optional) | Used only when `NEXT_PUBLIC_UPI_FULL_LINK_PARAMS=true` — real merchant MCC |
| `NEXT_PUBLIC_UPI_FULL_LINK_PARAMS` | Client (optional) | If `true`, adds `tr` (+ optional `tn`, `mc`) — **merchant/intent-style**; can trigger **stricter bank limits** than manual P2P. Default is **minimal** link (`pa`,`pn`,`am`,`cu` only). |
| `NEXT_PUBLIC_UPI_USER_ENTERS_AMOUNT` | Client (optional) | If `true`, omits `am` from the link so the user types the amount in GPay/PhonePe (closest to fully manual send). |

**Wallet UPI links:** Built with `%20` for spaces (not `+`). **Default = minimal** to reduce “exceeded limit for this type of payment” vs manual UPI send (banks often apply lower caps to intent/merchant-style links that include `tr` / `mc`).
| `SPORTMONKS_API_TOKEN` | Server only | [Cricket API v2.0](https://docs.sportmonks.com/v2/cricket-api/our-api/fixtures/get-all-fixtures) — required for match sync |
| `SPORTMONKS_LEAGUE_ID` | Server only (optional) | `filter[league_id]` when importing fixtures |
| `SPORTMONKS_SEASON_ID` | Server only (optional) | `filter[season_id]` for a specific season |
| `SPORTMONKS_UPCOMING_DAYS` | Server only (optional) | Length of `filter[starts_between]` window (UTC); default `45`, max `90` |
| `SPORTMONKS_BASE_URL` | Server only (optional) | Override API base (default `https://cricket.sportmonks.com/api/v2.0`) |
| `CRON_SECRET` | Server only | Bearer token for `GET /api/cron/sync` and other cron routes |

Match import uses **`filter[starts_between]`** (rolling window), optional **`filter[league_id]`** / **`filter[season_id]`** (Cricket API v2.0 style from the [fixtures docs](https://docs.sportmonks.com/v2/cricket-api/our-api/fixtures/get-all-fixtures)), **`include=localteam,visitorteam,league`**, **`sort=starting_at`**, and paginates up to 10 pages. Trigger sync manually: `curl -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/sync"`.

**Data pipeline and scoring:** See [docs/sportmonks-data-collection-and-scoring.md](docs/sportmonks-data-collection-and-scoring.md) for SportMonks `include` strings, cron routes, DB columns (`fixture_scoreboard_raw`, balls snapshot, lineup throttle), and how stats map to fantasy points (complements [docs/dream11-t20-scoring.md](docs/dream11-t20-scoring.md)). Admins can trigger the same live sync as the minute cron via `POST /api/admin/sync-match` (session cookie + `is_admin`), optional JSON body `{ "matchId": <fixture id> }`.

**IPL (and other leagues):** SportMonks’ walkthrough [IPL 2026: Live Score Coverage & API Demo](https://www.sportmonks.com/blogs/ipl-2026-season-opener-live-score-coverage-api-demo/) recommends (1) `GET /leagues`, find **Indian Premier League**, read **`id`** (league) and **`season_id`**; (2) pull fixtures for that season. In this app, set **`SPORTMONKS_LEAGUE_ID`** to the IPL league id and **`SPORTMONKS_SEASON_ID`** to that `season_id` so sync targets the right tournament. The blog uses example query style `filters=seasonId:…` in places; our client uses documented **`filter[season_id]`** query keys—same intent. For matchday live data, their flow uses **`GET /livescores`** with rich **`include`** (runs, batting, bowling, lineup, toss, venue); that matches how [`/api/cron/live-match-tick`](src/app/api/cron/live-match-tick/route.ts) is oriented, which you can extend with more includes per the blog.

For production (e.g. Vercel), set the same variables as encrypted secrets. Wallet top-ups use manual UPI pay-in requests approved in the admin console.

### Login over ngrok (or any non-localhost URL)

If sign-in works on `localhost` but **not** through a tunnel (e.g. `https://….ngrok-free.dev`), Supabase is almost always blocking that origin until you allow it.

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, add your app’s public base URL with a wildcard path, for example:
   - `https://joesph-nonalliterative-nelida.ngrok-free.dev/**`
   - or, if supported by your project, a pattern such as `https://*.ngrok-free.dev/**` so new tunnel hostnames keep working.
3. Set **Site URL** to that same base URL while you are testing through the tunnel (e.g. `https://joesph-nonalliterative-nelida.ngrok-free.dev`). You can switch it back to production when you are done.
4. Save, wait a few seconds, then try logging in again in a **private/incognito** window (avoids stale cookies from `localhost`).

**Note:** Free ngrok hostnames change when you restart the tunnel; each new hostname must be added to **Redirect URLs** (or use an [ngrok reserved domain](https://ngrok.com/docs/guides/how-to-set-up-a-custom-domain/)). Cookies set on `localhost` are not sent to your ngrok domain—always use the tunnel URL end-to-end when testing.

### Database reset and mock contest seeds

- **Wipe everything** (auth users, profiles, matches, contests, SportMonks reference tables): run [`supabase/scripts/flush-all-data.sql`](supabase/scripts/flush-all-data.sql) in the SQL Editor (service role / postgres).
- **Mock squad only:** [`supabase/scripts/seed-minimal-players-for-match.sql`](supabase/scripts/seed-minimal-players-for-match.sql) — 22 players for a `matches.id`.
- **Mock users + contest** for a fixture: [`seed-mock-users-contest-for-match.sql`](supabase/scripts/seed-mock-users-contest-for-match.sql) (edit `v_match`) or [`seed-mock-contest-69518.sql`](supabase/scripts/seed-mock-contest-69518.sql). If there are **0** players for that match, the script **inserts 22 mock players** automatically (`v_auto_seed_players`, default `true`). Password: `Dream12Mock!Seed`.
- **Verify completed-match scoring**: [`supabase/scripts/verify-completed-match-scoring.sql`](supabase/scripts/verify-completed-match-scoring.sql) (commented queries + settlement notes).
- **Login “Database error querying schema”** (mock users): usually a missing `public.profiles` row. Run [`supabase/scripts/repair-mock-user-profiles.sql`](supabase/scripts/repair-mock-user-profiles.sql), then in Dashboard → **Project Settings → API** click **Reload** schema if needed. Re-seed scripts now upsert profiles explicitly.

### Supabase: “create_user_contest … not in schema cache”

Your remote DB is missing migration [`20260331000000_user_create_contest.sql`](supabase/migrations/20260331000000_user_create_contest.sql). Run the same SQL in **Supabase → SQL Editor** (copy from that file, or from [`supabase/scripts/apply-user-contest-migration.sql`](supabase/scripts/apply-user-contest-migration.sql)), then **reload the API schema** under Project Settings → API if the error persists.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
