# Security model & review (Phase 6)

Risk II Online is an authoritative-server game (principle P4): the server is
the only writer of game state, clients submit intents, and the engine decides
outcomes. This document records the security boundaries and the Phase 6 audit.

## Authentication

All state-changing API routes call `requireUser()` and return **401** when there
is no session:

| Route                    | Method       | Auth                                                       |
| ------------------------ | ------------ | ---------------------------------------------------------- |
| `/api/games`             | GET, POST    | required                                                   |
| `/api/games/:id`         | GET          | optional (public spectate; private games gated, see below) |
| `/api/games/:id/actions` | POST         | required                                                   |
| `/api/games/:id/join`    | POST         | required                                                   |
| `/api/games/:id/start`   | POST         | required                                                   |
| `/api/games/:id/ai`      | POST, DELETE | required                                                   |
| `/api/push/subscribe`    | POST, DELETE | required                                                   |
| `/api/cron/deadlines`    | GET          | `CRON_SECRET` bearer token                                 |

Sessions are database-backed (Auth.js + Drizzle adapter); `session.user.id` is
the trusted identity used for every authorization check.

## Authorization

Authentication is not enough — each action checks that the caller may perform it:

- **Turn & phase (engine, P1/P4).** `validateAction` rejects any action that is
  out of turn, out of phase, or illegal, with a typed code surfaced as **422**.
  A client cannot act on another player's turn even with a valid session.
- **Membership.** `performAction` verifies the user is a player in the game
  (`NOT_IN_GAME`, 403) and maps the session user to their engine player id —
  a client cannot submit moves as a different player.
- **Creator-only operations.** Starting a game and adding/removing AI require
  `game.createdBy === userId` (`NOT_CREATOR`, 403).
- **Private games.** `getGameView` returns **403** for non-members of a private
  game; invite codes are required to join (`INVITE_REQUIRED`).

## Confidentiality (hidden information)

`redactState` is applied to every state leaving the server (tested in
`apps/web/test/redact.test.ts`):

- The **RNG seed and draw count are never serialized** to clients — exposing
  them would let a player predict every future dice roll.
- The **draw pile** (order and faces) is never sent; only its count.
- **Opponents' hands** are reduced to a count; only the viewer sees their own
  cards. The `cardAwarded` event hides which card a capture earned from
  everyone but the recipient.
- The board, discard pile, and battle log are public (as in tabletop Risk).

Realtime fan-out (Pusher) carries only a "state changed" signal with version /
turn metadata; clients then refetch their own redacted view. No game data —
and nothing hidden — crosses the shared channel.

## Input validation

Every request body is parsed with zod **strict objects** (unknown keys
rejected) before reaching the engine (`apps/web/src/lib/validation.ts`,
tested in `validation.test.ts`). Territory codes, army counts, objectives, and
player counts are bounds-checked; the engine then re-validates against the
actual rules. Numeric army inputs are clamped to integer ranges, preventing
negative or fractional placement.

## Integrity & concurrency

- **Optimistic concurrency.** Every applied action persists with
  `UPDATE … WHERE version = expected`; a losing concurrent write gets **409**
  (`VERSION_CONFLICT`) instead of forking the game state.
- **Append-only log.** Each action is recorded with a unique `(game_id, seq)`
  constraint; the dice results are stored, so every battle is replayable from
  the seed (verified at scale in `packages/engine/test/simulation.test.ts`).
- **Auto-skip safety.** Deadline auto-skips flow through the same
  validate/apply pipeline as human moves, so they can never produce an illegal
  state.

## Known limitations / follow-ups

- **Rate limiting** is not yet applied to the action endpoint. The optimistic
  concurrency check bounds state damage, but a per-user/IP limiter (e.g. via
  Upstash) is recommended before a public launch.
- **Live-mode reconnection/spectator auth** is minimal; live games currently
  reuse the async authorization model.
- AI turn execution and notifications run via `after()`; failures are logged,
  not retried. A durable queue (QStash) would harden long bot chains.
