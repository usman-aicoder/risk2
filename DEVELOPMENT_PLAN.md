# Risk II Online — Development Plan

**Source documents:** Game Design & Strategy v1.0 (anchor, principles P1–P4) ·
Design & Functional Specification v2.0 · Schema & State Machine v2.0
**Target hosting:** Vercel · **Source control:** GitHub (`usman-aicoder/risk2`)

---

## 1. What we are building (requirements summary)

A faithful 1:1 online remake of Risk II for casual players, governed by four principles:

| # | Principle | What it means for the build |
|---|-----------|------------------------------|
| P1 | Rules are sacred | Pure, deterministic TypeScript rules engine; 42 territories, 6 continents, exact dice odds, card escalation — exhaustively tested, never modified |
| P2 | Async-first | Persistent games, take-your-turn-and-get-notified loop, "your games" dashboard, turn deadlines with auto-skip; optional live mode |
| P3 | Progressive depth | Tutorial, legal-move highlighting, hints, fast-resolve combat, undo-within-phase |
| P4 | Fair server | Authoritative server, seeded auditable RNG, server-side validation, replayable append-only action log |

Core game spec (P1, must match exactly):
- **Map:** 42 territories, 6 continents, static symmetric adjacency graph with canonical sea bridges. Bonuses: Australia +2, S. America +2, Africa +3, Europe +5, N. America +5, Asia +7.
- **Turn:** Reinforce → Attack → Fortify. Reinforcements = `max(3, floor(territories/3))` + continent bonuses + card trade-in.
- **Combat:** up to 3 attacker dice vs 2 defender dice, highest-vs-highest, defender wins ties. On capture, move in ≥ dice rolled. Capture during turn → award one card.
- **Cards:** infantry/cavalry/artillery + wild; matching sets traded for escalating armies driven by a global `cardSetCount`; trading only in reinforce phase.
- **Win:** world domination or selectable mission objective; elimination at 0 territories; eliminator inherits cards.
- **Players:** 2–6, human or AI; classic turn-based (simultaneous mode optional/later).

---

## 2. Architecture — adapted for Vercel

The spec recommends Node + WebSockets + BullMQ + Docker. Vercel is serverless: no
long-lived WebSocket servers, no resident BullMQ workers. Because the product is
**async-first (P2)**, this is an easy adaptation rather than a compromise:

| Spec recommendation | Vercel-native replacement | Notes |
|---|---|---|
| NestJS/Fastify server | **Next.js 15 (App Router) API routes / server actions** | One deployable, one language |
| React + Vite client | **Next.js React frontend** (same app) | SSR for dashboard/lobby |
| PostgreSQL + JSONB snapshot | **Neon Postgres** (Vercel marketplace) + Drizzle ORM | JSONB `GameState` snapshot + append-only `action_log`, exactly as the schema doc defines |
| Redis (cache/pub-sub/queue) | **Upstash Redis** (serverless, HTTP-based) | Sessions, matchmaking, rate limits |
| BullMQ job queue | **Upstash QStash + Vercel Cron** | Turn-notification fan-out, turn-deadline auto-skip sweeps |
| Socket.IO / ws | **Pusher Channels (or Ably)** for push diffs; SSE/polling fallback | Server publishes authoritative diffs after each action; clients only render (P4) |
| Push + email notifications | **Web Push (VAPID) + Resend email** | The P2 "your turn" loop |
| OAuth + magic link | **Auth.js (NextAuth v5)** — Google OAuth + email magic link | Low-friction sign-in (P3) |
| Docker hosting | **Vercel** | Git-push deploys, preview deployments per PR |

**Non-negotiables preserved:** the rules engine stays a pure, I/O-free TypeScript
package; the server remains the single writer of game state; every dice roll comes
from a seeded RNG recorded in the action log; clients submit intents and never
compute outcomes.

### Repository layout (monorepo, pnpm workspaces)

```
risk2/
├── packages/
│   └── engine/            # PURE rules engine — no I/O, no framework imports (P1)
│       ├── src/map.ts         # 42 territories, adjacency, continents (typed static data)
│       ├── src/state.ts       # GameState types (mirrors Schema doc §2.3)
│       ├── src/fsm.ts         # phase state machine (Schema doc §3)
│       ├── src/actions.ts     # Action union (Spec doc §5.2)
│       ├── src/validate.ts    # validate(action, state)
│       ├── src/apply.ts       # apply(action, state) -> {state', events}
│       ├── src/combat.ts      # seeded dice resolution (single + fast)
│       ├── src/cards.ts       # sets, escalation, inheritance
│       ├── src/rng.ts         # seeded auditable PRNG
│       └── src/ai/            # bot heuristics (strategy pillars)
├── apps/
│   └── web/               # Next.js app: UI + API routes + auth + realtime + jobs
└── e2e/                   # Playwright end-to-end tests
```

---

## 3. Development phases

Build order follows the spec's dev-task list: **deterministic core first, shell second.**

### Phase 0 — Project scaffolding & tooling (≈ half a day)

Set up monorepo, CI, and quality gates before any game code.

- pnpm workspace, TypeScript strict mode, ESLint + Prettier, Vitest config
- GitHub Actions CI: typecheck + lint + unit tests on every push/PR
- Branch protection on `main`; feature-branch → PR workflow

**Install:**
```bash
npm i -g pnpm
pnpm init
pnpm add -D typescript vitest @vitest/coverage-v8 eslint prettier \
  eslint-config-prettier typescript-eslint
```

**Done when:** `pnpm test` / `pnpm lint` / `pnpm typecheck` run green in CI on a pushed branch.

---

### Phase 1 — Map data + pure rules engine (P1) — *the heart of the project*

Spec dev tasks 1–3. Zero I/O, zero dependencies beyond TypeScript — this package
must run identically on server, client (for legal-move highlighting), and tests.

1. **Map data:** 42 territories, adjacency lists, 6 continents with bonuses as typed constants.
2. **Seeded RNG:** small deterministic PRNG (e.g. mulberry32/xoshiro); every roll derivable from `rngSeed` + roll index (P4 replay).
3. **GameState types** exactly per Schema doc §2.3 (`phase`, `currentTurnPlayer`, `cardSetCount`, `rngSeed`, territories, deck, log).
4. **Phase FSM:** turn-begins → reinforce → attack (battle sub-loop) → fortify → check-conditions → next-turn / game-over.
5. **validate → apply pipeline** for the six actions (`reinforce`, `tradeCards`, `attack`, `advance`, `fortify`, `endPhase`); illegal/out-of-phase/out-of-turn actions rejected with typed errors.
6. **Combat:** single-roll and fast-resolve ("attack until") modes; capture flow; card award on first capture of the turn.
7. **Cards & elimination:** set matching, escalating trade values via global counter, card inheritance on elimination.
8. **Win conditions:** world domination + mission objectives.

**Install:** nothing new (Vitest from Phase 0).

**Testing (this phase is test-heavy by design):**
- Unit tests for every rule path (reinforcement math, adjacency symmetry, phase legality, card escalation table).
- **Statistical combat tests:** simulate ≥1M dice battles and assert win probabilities match standard Risk odds tables within tolerance — the spec's literal definition of "faithful" (§6.1).
- **Replay test:** replaying an action log + seed reproduces the identical final state bit-for-bit.
- Property-based tests (fast-check): random legal action sequences never corrupt invariants (troops > 0, 42 territories always owned, deck conservation).

```bash
pnpm add -D fast-check
```

**Done when:** adjacency is symmetric, bonuses match source values, odds within tolerance, every battle replayable from its seed. *(Acceptance criteria from Spec §6.1.)*

---

### Phase 2 — Persistence, auth, and authoritative API (P4)

Spec dev tasks 4–5. Next.js app with the server as single source of truth.

1. **Next.js app** in `apps/web`, wired to the engine package.
2. **Drizzle schema** mirroring the Schema doc: `games` (JSONB snapshot + metadata columns), `players`, `action_log` (append-only, stores dice results), `cards/deck` inside the snapshot, `users`, `game_invites`.
3. **Auth.js:** Google OAuth + email magic link (via Resend).
4. **Action endpoint** (`POST /api/games/[id]/actions`): load state → engine `validate` → `apply` → persist snapshot + append log entry (single transaction) → publish diff. Optimistic-concurrency check on `turn_number`/version so double-submits can't fork state.
5. **Read endpoints:** game state (redacted per viewer — opponents' cards hidden), action log, "your games" list.

**Install:**
```bash
pnpm add next react react-dom drizzle-orm @neondatabase/serverless zod \
  next-auth@beta resend
pnpm add -D drizzle-kit @types/react @types/react-dom
```

**Done when:** clients never compute outcomes; an illegal or out-of-turn action gets a 4xx from the server; any battle replayable from its logged seed.

---### Phase 3 — Game client UI (P3)

Spec dev task 7. The playable board.

1. **SVG map** of the 42 territories (painted-map style, re-skinnable since adjacency is data); pinch-zoom and pan.
2. Legible troop stacks, ownership colors, continent-control highlighting.
3. Phase HUD: reinforcement placement, attack picker with dice results, fortify move, end-phase.
4. **Legal-move highlighting** — runs the engine's `validate` client-side (same package, P1 shared types).
5. Fast-resolve combat button; **undo-within-phase** (client-staged actions committed at phase end); activity feed rendered from the action log.
6. Lobby: create/join, public/private, invite links, mode/objective/player-count, add AI opponents.

**Install:**
```bash
pnpm add zustand @tanstack/react-query tailwindcss framer-motion
pnpm add -D @testing-library/react @testing-library/jest-dom jsdom
```

**Done when:** a new player can take a full reinforce→attack→fortify turn without reading the rules (Spec task 7 criterion). Hot-seat (same browser) games fully playable.

---

### Phase 4 — Async layer: notifications, deadlines, dashboard (P2) — *the key casual lever*

Spec dev task 6.

1. **Realtime diffs:** Pusher Channels publish after every applied action; clients subscribe per game. Polling fallback.
2. **Turn notifications:** on turn change, enqueue via QStash → Web Push + Resend email ("It's your turn in *Game X*").
3. **"Your games" dashboard:** all active games, whose turn, deadline countdowns.
4. **Turn deadlines with auto-skip:** Vercel Cron sweep (e.g. every 10 min) finds expired turns, applies a server-generated skip/auto-end action through the same engine pipeline (logged like any action, P4).
5. Live mode (optional, same plumbing): per-turn timer, presence/spectators via Pusher presence channels, reconnection by re-fetching snapshot + diff replay.

**Install:**
```bash
pnpm add pusher pusher-js @upstash/qstash @upstash/redis web-push
pnpm add -D @types/web-push
```

**Done when:** player is notified on turn change; games persist across days; expired turns auto-skip.

---

### Phase 5 — Onboarding & AI opponents (P1, P3)

Spec dev tasks 8–9.

1. **Interactive tutorial:** scripted one-turn walkthrough on a fixed-seed game; returning players skip.
2. Contextual "what can I do now?" hints + one-tap rules reference.
3. **AI bots** in the engine package, implementing the four strategy pillars with difficulty tiers:
   - *Continent control* — pursue/lock continents (Australia/S. America first).
   - *Defensible borders* — value territory by border count; avoid the Asia trap.
   - *Stack discipline* — mass at chokepoints, don't spread thin.
   - *Card tempo* — time explosive trade-in turns.
   Difficulty scales heuristic weights + lookahead. Bots run server-side after a human turn (or via QStash for bot-vs-bot chains).
4. Match-end screen: summary, stats, one-tap rematch.

**Install:** nothing new.

**Done when:** a first-timer completes one turn unaided; bots observably pursue continents and defensible borders by difficulty tier.

---

### Phase 6 — End-to-end testing & hardening

1. **Playwright e2e:** sign-in → create lobby → invite/add bot → full game to victory (small 2-player map seed); async flow (turn handoff between two browser contexts); tutorial flow; undo; fast-resolve.
2. **Full-game simulation tests:** engine-level bot-vs-bot games run to completion thousands of times in CI — no crashes, no invariant violations, games terminate.
3. Load sanity: concurrent action submissions to one game (optimistic-concurrency holds).
4. Security pass: authz on every endpoint (only `currentTurnPlayer` can act), redaction of hidden info, rate limiting via Upstash.

**Install:**
```bash
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

**Done when:** CI runs unit + statistical + property + simulation + e2e suites green; acceptance checklist from Spec §6.1 fully passes.

---

### Phase 7 — Vercel deployment & launch

1. Connect the GitHub repo to a Vercel project (root: `apps/web`).
2. Provision via Vercel Marketplace: **Neon Postgres**, **Upstash Redis/QStash**; create **Pusher** and **Resend** accounts; generate VAPID keys.
3. Environment variables (Vercel dashboard): `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET`, `RESEND_API_KEY`, `PUSHER_*`, `QSTASH_*`, `VAPID_*`.
4. `vercel.json`: cron schedule for deadline sweeps; function durations for fast-resolve/bot turns.
5. Drizzle migrations run in CI/deploy step (`drizzle-kit migrate`).
6. Pipeline: **every PR → Vercel preview deployment** (test a real game on the preview URL); **merge to `main` → production**.

**Done when:** a full async multi-day game between two real accounts completes on the production URL with notifications working.

---

## 4. Consolidated dependency list

| Purpose | Packages |
|---|---|
| Tooling | `pnpm`, `typescript`, `eslint`, `prettier`, `typescript-eslint` |
| Engine (runtime) | *none — pure TS by design (P1)* |
| Testing | `vitest`, `@vitest/coverage-v8`, `fast-check`, `@testing-library/react`, `jsdom`, `@playwright/test` |
| Web framework | `next`, `react`, `react-dom` |
| Data | `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `zod` |
| Auth | `next-auth@beta` (Auth.js v5) |
| Async/realtime (P2) | `pusher`, `pusher-js`, `@upstash/qstash`, `@upstash/redis`, `web-push`, `resend` |
| UI | `tailwindcss`, `zustand`, `@tanstack/react-query`, `framer-motion` |

**External services to provision:** Vercel, Neon (Postgres), Upstash (Redis + QStash), Pusher, Resend, Google OAuth credentials.

---

## 5. Testing strategy (cross-phase summary)

| Level | What | When |
|---|---|---|
| Unit (Vitest) | Every engine rule path; map data integrity (symmetric adjacency, bonus values) | Phase 1 onward, every CI run |
| Statistical | ≥1M simulated battles vs standard Risk odds tables within tolerance | Phase 1, nightly + release CI |
| Property-based (fast-check) | Random legal action sequences preserve invariants | Phase 1 onward |
| Replay | Seed + action log reproduces exact state (P4 acceptance) | Phase 1 onward |
| Simulation | Thousands of full bot-vs-bot games terminate cleanly | Phase 5–6 |
| Component (Testing Library) | Map interactions, phase HUD, legal-move highlights | Phase 3 onward |
| E2E (Playwright) | Sign-in → lobby → full game → victory; async handoff; tutorial | Phase 6, on PRs |
| Manual | Preview-deployment playtests per PR | Phase 7 onward |

## 6. Git & deployment workflow

- Development happens on feature branches (current: `claude/dreamy-dijkstra-kfb9ap`) merged to `main` via PR.
- CI (GitHub Actions) gates every PR: typecheck, lint, unit/property/statistical tests; e2e on PRs once Phase 6 lands.
- Vercel builds a **preview deployment per PR** for manual playtesting; merging to `main` deploys production.
- Conventional, descriptive commit messages; the engine package never merges with failing rule tests (P1 is non-negotiable).

## 7. Suggested timeline

| Phase | Effort |
|---|---|
| 0 — Scaffolding | 0.5 day |
| 1 — Rules engine | 4–6 days |
| 2 — Persistence + API | 3–4 days |
| 3 — Client UI | 5–7 days |
| 4 — Async layer | 3–4 days |
| 5 — Onboarding + AI | 4–5 days |
| 6 — E2E & hardening | 3 days |
| 7 — Deploy & launch | 1–2 days |
| **Total** | **~4–5 weeks** of focused development |
