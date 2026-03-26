This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment variables

Copy `.env.example` to `.env.local` and fill in values.

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service role (admin checks, Razorpay wallet finalize, cron) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Client + server | Razorpay key id for Checkout (safe to expose) |
| `RAZORPAY_KEY_ID` | Server only (optional) | Same as public key id if you prefer not to duplicate env names on the server |
| `RAZORPAY_KEY_SECRET` | Server only | Razorpay secret for orders API and signature verification — **never** put this in client code |
| `SPORTMONKS_API_TOKEN` | Server only | [Cricket API v2.0](https://docs.sportmonks.com/v2/cricket-api/our-api/fixtures/get-all-fixtures) — required for match sync |
| `SPORTMONKS_LEAGUE_ID` | Server only (optional) | `filter[league_id]` when importing fixtures |
| `SPORTMONKS_SEASON_ID` | Server only (optional) | `filter[season_id]` for a specific season |
| `SPORTMONKS_UPCOMING_DAYS` | Server only (optional) | Length of `filter[starts_between]` window (UTC); default `45`, max `90` |
| `SPORTMONKS_BASE_URL` | Server only (optional) | Override API base (default `https://cricket.sportmonks.com/api/v2.0`) |
| `CRON_SECRET` | Server only | Bearer token for `GET /api/cron/sync` and other cron routes |

Match import uses **`filter[starts_between]`** (rolling window), optional **`filter[league_id]`** / **`filter[season_id]`** (Cricket API v2.0 style from the [fixtures docs](https://docs.sportmonks.com/v2/cricket-api/our-api/fixtures/get-all-fixtures)), **`include=localteam,visitorteam,league`**, **`sort=starting_at`**, and paginates up to 10 pages. Trigger sync manually: `curl -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/sync"`.

**IPL (and other leagues):** SportMonks’ walkthrough [IPL 2026: Live Score Coverage & API Demo](https://www.sportmonks.com/blogs/ipl-2026-season-opener-live-score-coverage-api-demo/) recommends (1) `GET /leagues`, find **Indian Premier League**, read **`id`** (league) and **`season_id`**; (2) pull fixtures for that season. In this app, set **`SPORTMONKS_LEAGUE_ID`** to the IPL league id and **`SPORTMONKS_SEASON_ID`** to that `season_id` so sync targets the right tournament. The blog uses example query style `filters=seasonId:…` in places; our client uses documented **`filter[season_id]`** query keys—same intent. For matchday live data, their flow uses **`GET /livescores`** with rich **`include`** (runs, batting, bowling, lineup, toss, venue); that matches how [`/api/cron/live-scores`](src/app/api/cron/live-scores/route.ts) is oriented, which you can extend with more includes per the blog.

For production (e.g. Vercel), set the same variables as encrypted secrets. Use [Razorpay test mode](https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/#test-mode) keys locally.

### Login over ngrok (or any non-localhost URL)

If sign-in works on `localhost` but **not** through a tunnel (e.g. `https://….ngrok-free.dev`), Supabase is almost always blocking that origin until you allow it.

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, add your app’s public base URL with a wildcard path, for example:
   - `https://joesph-nonalliterative-nelida.ngrok-free.dev/**`
   - or, if supported by your project, a pattern such as `https://*.ngrok-free.dev/**` so new tunnel hostnames keep working.
3. Set **Site URL** to that same base URL while you are testing through the tunnel (e.g. `https://joesph-nonalliterative-nelida.ngrok-free.dev`). You can switch it back to production when you are done.
4. Save, wait a few seconds, then try logging in again in a **private/incognito** window (avoids stale cookies from `localhost`).

**Note:** Free ngrok hostnames change when you restart the tunnel; each new hostname must be added to **Redirect URLs** (or use an [ngrok reserved domain](https://ngrok.com/docs/guides/how-to-set-up-a-custom-domain/)). Cookies set on `localhost` are not sent to your ngrok domain—always use the tunnel URL end-to-end when testing.

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
