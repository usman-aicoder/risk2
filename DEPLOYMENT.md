# Deploying Risk II Online to Vercel

The app is a pnpm monorepo; Vercel builds `apps/web` (Next.js). Database
migrations run automatically during the build whenever `DATABASE_URL` is set.

## What works with how much configuration

| Configuration                          | What you get                                                                |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Nothing at all                          | Landing page, `/tutorial`, `/play` hot-seat vs bots (engine runs in-browser) |
| `DATABASE_URL` + `AUTH_SECRET` + Google | Sign-in, online async games, AI opponents, deadlines + auto-skip (5s polling) |
| + Pusher                                | Instant realtime updates instead of polling                                  |
| + Resend                                | Magic-link sign-in + "your turn" emails                                      |
| + VAPID keys                            | Browser push notifications                                                   |

Everything degrades gracefully — missing services never break gameplay.

## Step 1 — Get the code onto your production branch

Vercel deploys production from `main` by default. Either merge the working
branch `claude/dreamy-dijkstra-kfb9ap` into `main` (open a PR or fast-forward),
or set the Vercel project's **Production Branch** to
`claude/dreamy-dijkstra-kfb9ap` (Project → Settings → Git).

## Step 2 — Create the Vercel project

1. [vercel.com/new](https://vercel.com/new) → **Import** `usman-aicoder/risk2`.
2. **Root Directory: `apps/web`** ← the one setting you must change.
3. Framework preset: **Next.js** (auto-detected). Leave build/install
   commands at their defaults (Vercel detects pnpm from the lockfile and
   installs from the repo root).
4. Don't deploy yet — add environment variables first (below).

## Step 3 — Database (required for online play)

Vercel dashboard → your project → **Storage** → **Create database** →
**Neon Postgres** → connect to the project. This injects `DATABASE_URL`
automatically. (Alternatively: create a database at neon.tech and add
`DATABASE_URL` manually.)

Migrations in `apps/web/drizzle/` apply automatically on the next build.
To run them manually instead:

```bash
cd apps/web && DATABASE_URL="postgres://…" pnpm db:migrate
```

## Step 4 — Auth (required for online play)

| Variable             | How to get it                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `AUTH_SECRET`        | `openssl rand -base64 32`                                                                                           |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth client (Web). Authorized redirect URI: `https://<your-domain>/api/auth/callback/google` |

Auth.js trusts the Vercel host automatically; no `AUTH_URL` needed.

## Step 5 — Optional services

| Service | Variables | Notes |
| ------- | --------- | ----- |
| **Pusher Channels** (realtime) | `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`, `NEXT_PUBLIC_PUSHER_KEY` (= key), `NEXT_PUBLIC_PUSHER_CLUSTER` (= cluster) | Create a Channels app at pusher.com. `NEXT_PUBLIC_*` are baked in at build time — set them before deploying. |
| **Resend** (email) | `AUTH_RESEND_KEY`, `EMAIL_FROM` | `EMAIL_FROM` must be a verified sender, e.g. `Risk II <play@yourdomain.com>` (or `onboarding@resend.dev` for testing). Enables magic-link sign-in too. |
| **Web Push** | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npx web-push generate-vapid-keys`. Subject is `mailto:you@example.com`. |
| **Cron protection** | `CRON_SECRET` | Any random string. Vercel Cron sends it automatically as `Authorization: Bearer …`. The deadline sweep (`apps/web/vercel.json`) runs once daily — Vercel's **Hobby plan only allows daily cron**. Expired turns are also auto-skipped opportunistically whenever someone opens the game, so deadlines stay responsive without a Pro plan. (On Pro you can tighten the schedule, e.g. `*/10 * * * *`.) |
| **Links in notifications** | `APP_URL` | `https://<your-domain>` |

Set variables for **Production and Preview** so PR preview deployments are playable.

## Step 6 — Deploy & verify

Push (or click **Deploy**). Then walk this checklist on the live URL:

1. `/` loads; `/tutorial` plays a full guided turn (works even with zero env vars).
2. Sign in with Google.
3. Create a lobby → add an AI opponent → Start game.
4. Take a full turn; the AI replies within a few seconds.
5. Second browser/account: join via the invite link and play a turn each way.
6. `GET /api/cron/deadlines` with header `Authorization: Bearer <CRON_SECRET>`
   returns `{"checked":0,"skipped":[]}`-style JSON.
7. If Pusher is configured: actions in one browser appear in the other without reloading.

## Ongoing workflow

- Every PR gets a **preview deployment** (own URL, same env) — playtest there.
- Merges to the production branch deploy production automatically.
- CI (GitHub Actions) gates every push: format, lint, typecheck, 105 tests, build.
