# Risk II Online

A faithful online remake of Risk II — classic turn-based, async-first, for casual
board-game fans. See [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) for the full
phased plan and architecture.

## Workspace

| Path              | What                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| `packages/engine` | Pure, deterministic rules engine — no I/O (P1)                             |
| `apps/web`        | Next.js app: authoritative API, Drizzle/Neon persistence, Auth.js (P2, P4) |

## Getting started

```bash
pnpm install
pnpm test        # unit tests (Vitest)
pnpm typecheck   # strict TypeScript
pnpm lint        # ESLint
pnpm format      # Prettier
```

CI runs format check, lint, typecheck, and tests on every push to `main` and every PR.
