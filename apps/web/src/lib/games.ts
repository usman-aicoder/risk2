/**
 * Game service: lobby lifecycle and the authoritative action pipeline (P4)
 *
 *   load snapshot -> engine validate/apply -> persist (optimistic
 *   concurrency on version) -> append action_log row -> publish realtime
 *   signal + notify the next player (P2)
 *
 * The engine snapshot is the single source of truth; the conditional UPDATE
 * on `version` guarantees two concurrent submissions can never fork it.
 */

import type {
  Action,
  BotDifficulty,
  GameEvent,
  GameState,
  Objective,
  PlayerColor,
} from "@risk2/engine";
import { applyAction, chooseBotAction, createGame } from "@risk2/engine";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/db";
import { actionLog, gamePlayers, games, users } from "@/db/schema";
import { notifyUser } from "./notify";
import { publishGameUpdate } from "./realtime";
import type { PlayerView } from "./redact";
import { redactState } from "./redact";
import { MAX_SKIP_ACTIONS, nextSkipAction } from "./skip";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

function fail(status: number, code: string, message: string): ServiceResult<never> {
  return { ok: false, status, code, message };
}

const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow", "purple", "black"];

export interface GameSummary {
  gameId: string;
  status: "lobby" | "active" | "finished";
  mode: "live" | "async";
  turnNumber: number | null;
  isYourTurn: boolean;
  winner: string | null;
  isPrivate: boolean;
  maxPlayers: number;
  turnDeadline: string | null;
  players: { playerId: string; displayName: string; color: string; type: "human" | "ai" }[];
  updatedAt: string;
}

export interface LobbyView {
  gameId: string;
  status: "lobby";
  mode: "live" | "async";
  maxPlayers: number;
  isPrivate: boolean;
  objective: Objective;
  createdBy: string;
  /** Only included for members. */
  inviteCode: string | null;
  players: { playerId: string; displayName: string; color: string; type: "human" | "ai" }[];
  youJoined: boolean;
  youAreCreator: boolean;
}

export type GameView =
  | LobbyView
  | {
      gameId: string;
      status: "active" | "finished";
      turnDeadline: string | null;
      view: PlayerView;
    };

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] as number) >>> 0;
}

/** Run side effects after the response when possible; never fail the action. */
function runAfter(effect: () => Promise<void>): void {
  const safe = () => effect().catch((error: unknown) => console.error("after-effect", error));
  try {
    after(safe);
  } catch {
    void safe();
  }
}

type GameRow = typeof games.$inferSelect;

function deadlineFor(
  row: Pick<GameRow, "mode" | "turnDurationHours">,
  state: GameState,
): Date | null {
  if (state.phase === "gameOver") return null;
  if (row.mode !== "async") return null; // live games use table timers (later)
  return new Date(Date.now() + row.turnDurationHours * 3600 * 1000);
}

/**
 * Persist an engine-applied action with optimistic concurrency and fire the
 * async-layer effects (realtime signal; notification when the turn moved to
 * a different human player).
 */
async function persistApplied(
  row: GameRow,
  previous: GameState,
  state: GameState,
): Promise<ServiceResult<{ turnChanged: boolean }>> {
  const db = getDb();
  const finished = state.phase === "gameOver";
  const turnChanged = state.currentTurnPlayer !== previous.currentTurnPlayer || finished;

  const updated = await db
    .update(games)
    .set({
      snapshot: state,
      version: row.version + 1,
      currentTurnPlayer: state.currentTurnPlayer,
      turnNumber: state.turnNumber,
      status: finished ? "finished" : "active",
      winner: state.winner,
      turnDeadline: turnChanged ? deadlineFor(row, state) : row.turnDeadline,
      updatedAt: new Date(),
    })
    .where(and(eq(games.id, row.id), eq(games.version, row.version)))
    .returning({ id: games.id });
  if (updated.length === 0) {
    return fail(409, "VERSION_CONFLICT", "Another action was applied first; reload and retry.");
  }

  const entry = state.log[state.log.length - 1];
  if (entry) {
    await db.insert(actionLog).values({
      gameId: row.id,
      seq: entry.seq,
      playerId: entry.playerId,
      action: entry.action,
      events: entry.events,
    });
  }

  runAfter(async () => {
    await publishGameUpdate(row.id, {
      version: row.version + 1,
      status: finished ? "finished" : "active",
      currentTurnPlayer: state.currentTurnPlayer,
      turnNumber: state.turnNumber,
    });
    if (turnChanged) await notifyAfterTurnChange(row.id, state, finished);
  });

  return { ok: true, data: { turnChanged } };
}

async function notifyAfterTurnChange(
  gameId: string,
  state: GameState,
  finished: boolean,
): Promise<void> {
  const db = getDb();
  const members = await db.query.gamePlayers.findMany({
    where: eq(gamePlayers.gameId, gameId),
  });
  const label = `Game ${gameId.slice(0, 8)}`;

  if (finished) {
    const winnerName =
      state.players.find((p) => p.playerId === state.winner)?.displayName ?? "Someone";
    await Promise.all(
      members
        .filter((m) => m.userId !== null)
        .map((m) =>
          notifyUser({
            userId: m.userId as string,
            gameId,
            gameLabel: label,
            title: "Game over — Risk II Online",
            body: `${winnerName} won the game.`,
          }),
        ),
    );
    return;
  }

  const next = members.find((m) => m.playerId === state.currentTurnPlayer);
  if (!next?.userId) return; // AI or unknown — nothing to notify
  await notifyUser({
    userId: next.userId,
    gameId,
    gameLabel: label,
    title: "Your turn — Risk II Online",
    body: `It's your move (turn ${state.turnNumber}). You have time — async games wait for you.`,
  });
}

export async function createLobby(
  userId: string,
  input: {
    mode: "live" | "async";
    maxPlayers: number;
    isPrivate: boolean;
    objective: Objective;
    turnDurationHours: number;
  },
): Promise<ServiceResult<{ gameId: string; inviteCode: string }>> {
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return fail(401, "UNKNOWN_USER", "Sign in first.");

  const [game] = await db
    .insert(games)
    .values({
      createdBy: userId,
      mode: input.mode,
      maxPlayers: input.maxPlayers,
      isPrivate: input.isPrivate,
      objective: input.objective,
      turnDurationHours: input.turnDurationHours,
    })
    .returning({ id: games.id, inviteCode: games.inviteCode });
  if (!game) return fail(500, "DB_ERROR", "Could not create the game.");

  await db.insert(gamePlayers).values({
    gameId: game.id,
    userId,
    playerId: userId,
    displayName: user.name ?? user.email ?? "Player 1",
    color: COLORS[0] as PlayerColor,
    type: "human",
    turnOrder: 0,
  });

  return { ok: true, data: { gameId: game.id, inviteCode: game.inviteCode } };
}

const BOT_NAMES = [
  "General Patches",
  "Marshal Byte",
  "Colonel Crash",
  "Major Loop",
  "Captain Stack",
];

export async function addAiPlayer(
  userId: string,
  gameId: string,
  difficulty: BotDifficulty,
): Promise<ServiceResult<{ playerId: string }>> {
  const db = getDb();
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { players: true },
  });
  if (!game) return fail(404, "GAME_NOT_FOUND", "No such game.");
  if (game.createdBy !== userId) return fail(403, "NOT_CREATOR", "Only the creator can add AI.");
  if (game.status !== "lobby") return fail(409, "GAME_STARTED", "This game has already started.");
  if (game.players.length >= game.maxPlayers) return fail(409, "GAME_FULL", "This game is full.");

  const taken = new Set(game.players.map((p) => p.color));
  const color = COLORS.find((c) => !taken.has(c)) as PlayerColor;
  const botCount = game.players.filter((p) => p.type === "ai").length;
  const playerId = `ai_${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(gamePlayers).values({
    gameId,
    userId: null,
    playerId,
    displayName: `${BOT_NAMES[botCount % BOT_NAMES.length] as string} (${difficulty})`,
    color,
    type: "ai",
    aiDifficulty: difficulty,
    turnOrder: game.players.length,
  });
  return { ok: true, data: { playerId } };
}

export async function removeAiPlayer(
  userId: string,
  gameId: string,
  playerId: string,
): Promise<ServiceResult<{ removed: true }>> {
  const db = getDb();
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { players: true },
  });
  if (!game) return fail(404, "GAME_NOT_FOUND", "No such game.");
  if (game.createdBy !== userId) return fail(403, "NOT_CREATOR", "Only the creator can remove AI.");
  if (game.status !== "lobby") return fail(409, "GAME_STARTED", "This game has already started.");
  const bot = game.players.find((p) => p.playerId === playerId && p.type === "ai");
  if (!bot) return fail(404, "NOT_A_BOT", "No such AI player in this lobby.");

  await db.delete(gamePlayers).where(eq(gamePlayers.id, bot.id));
  // Compact turn order so seating stays contiguous.
  const remaining = game.players
    .filter((p) => p.id !== bot.id)
    .sort((a, b) => a.turnOrder - b.turnOrder);
  for (let i = 0; i < remaining.length; i++) {
    const row = remaining[i];
    if (row && row.turnOrder !== i) {
      await db.update(gamePlayers).set({ turnOrder: i }).where(eq(gamePlayers.id, row.id));
    }
  }
  return { ok: true, data: { removed: true } };
}

/**
 * Play AI turns server-side until a human is up or the game ends (Spec §4.4).
 * Each bot action flows through the same engine validate/apply + persist
 * pipeline as human moves — logged, replayable, fair (P4).
 */
export async function runAiTurns(gameId: string): Promise<void> {
  const db = getDb();
  for (let step = 0; step < 400; step++) {
    const game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
      with: { players: true },
    });
    if (!game || game.status !== "active" || !game.snapshot) return;
    const current = game.players.find((p) => p.playerId === game.snapshot?.currentTurnPlayer);
    if (!current || current.type !== "ai") return;

    const action = chooseBotAction(
      game.snapshot,
      current.playerId,
      current.aiDifficulty ?? "medium",
    );
    const result = applyAction(game.snapshot, current.playerId, action);
    if (!result.ok) {
      console.error(`AI proposed illegal action in ${gameId}: ${result.code}`);
      return;
    }
    const persisted = await persistApplied(game, game.snapshot, result.state);
    if (!persisted.ok) return; // concurrent write — the other writer continues
  }
  console.error(`AI turn runner hit its bound in ${gameId}`);
}

export async function joinGame(
  userId: string,
  gameId: string,
  inviteCode?: string,
): Promise<ServiceResult<{ gameId: string }>> {
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return fail(401, "UNKNOWN_USER", "Sign in first.");

  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { players: true },
  });
  if (!game) return fail(404, "GAME_NOT_FOUND", "No such game.");
  if (game.status !== "lobby") return fail(409, "GAME_STARTED", "This game has already started.");
  if (game.players.some((p) => p.userId === userId)) {
    return { ok: true, data: { gameId } }; // already in — idempotent
  }
  if (game.isPrivate && game.inviteCode !== inviteCode) {
    return fail(403, "INVITE_REQUIRED", "This is a private game; a valid invite link is required.");
  }
  if (game.players.length >= game.maxPlayers) {
    return fail(409, "GAME_FULL", "This game is full.");
  }

  const taken = new Set(game.players.map((p) => p.color));
  const color = COLORS.find((c) => !taken.has(c)) as PlayerColor;
  await db.insert(gamePlayers).values({
    gameId,
    userId,
    playerId: userId,
    displayName: user.name ?? user.email ?? `Player ${game.players.length + 1}`,
    color,
    type: "human",
    turnOrder: game.players.length,
  });

  return { ok: true, data: { gameId } };
}

export async function startGame(
  userId: string,
  gameId: string,
): Promise<ServiceResult<{ gameId: string }>> {
  const db = getDb();
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { players: true },
  });
  if (!game) return fail(404, "GAME_NOT_FOUND", "No such game.");
  if (game.createdBy !== userId) return fail(403, "NOT_CREATOR", "Only the creator can start.");
  if (game.status !== "lobby") return fail(409, "GAME_STARTED", "This game has already started.");
  if (game.players.length < 2) {
    return fail(409, "NOT_ENOUGH_PLAYERS", "Risk needs at least 2 players.");
  }

  const seed = randomSeed();
  const ordered = [...game.players].sort((a, b) => a.turnOrder - b.turnOrder);
  const state = createGame({
    gameId,
    mode: game.mode,
    rngSeed: seed,
    objective: game.objective,
    players: ordered.map((p) => ({
      id: p.playerId,
      name: p.displayName,
      color: p.color,
      type: p.type,
    })),
  });

  const updated = await db
    .update(games)
    .set({
      status: "active",
      rngSeed: seed,
      snapshot: state,
      version: game.version + 1,
      currentTurnPlayer: state.currentTurnPlayer,
      turnNumber: state.turnNumber,
      turnDeadline: deadlineFor(game, state),
      updatedAt: new Date(),
    })
    .where(and(eq(games.id, gameId), eq(games.version, game.version)))
    .returning({ id: games.id });
  if (updated.length === 0) return fail(409, "CONFLICT", "The game changed; try again.");

  runAfter(async () => {
    await publishGameUpdate(gameId, {
      version: game.version + 1,
      status: "active",
      currentTurnPlayer: state.currentTurnPlayer,
      turnNumber: state.turnNumber,
    });
    await notifyAfterTurnChange(gameId, state, false);
    await runAiTurns(gameId);
  });

  return { ok: true, data: { gameId } };
}

export async function performAction(
  userId: string,
  gameId: string,
  action: Action,
): Promise<ServiceResult<{ events: GameEvent[]; view: PlayerView }>> {
  const db = getDb();
  const game = await db.query.games.findFirst({ where: eq(games.id, gameId) });
  if (!game) return fail(404, "GAME_NOT_FOUND", "No such game.");
  if (game.status !== "active" || !game.snapshot) {
    return fail(409, "GAME_NOT_ACTIVE", "This game is not in progress.");
  }

  const membership = await db.query.gamePlayers.findFirst({
    where: and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)),
  });
  if (!membership) return fail(403, "NOT_IN_GAME", "You are not a player in this game.");

  // The engine enforces phase, turn, and rules (P1/P4).
  const result = applyAction(game.snapshot, membership.playerId, action);
  if (!result.ok) return fail(422, result.code, result.message);

  const persisted = await persistApplied(game, game.snapshot, result.state);
  if (!persisted.ok) return persisted;

  // If the turn moved on to a bot, let it play after the response (P2).
  if (persisted.data.turnChanged) runAfter(() => runAiTurns(gameId));

  return {
    ok: true,
    data: { events: result.events, view: redactState(result.state, membership.playerId) },
  };
}

/**
 * Deadline sweep (P2): auto-skip every active async game whose turn clock
 * expired. Called by Vercel Cron. Each skipped turn is a sequence of neutral
 * engine actions (see lib/skip.ts) persisted exactly like player moves.
 */
export async function sweepExpiredTurns(
  now = new Date(),
): Promise<ServiceResult<{ checked: number; skipped: string[] }>> {
  const db = getDb();
  const expired = await db.query.games.findMany({
    where: and(
      eq(games.status, "active"),
      eq(games.mode, "async"),
      isNotNull(games.turnDeadline),
      lt(games.turnDeadline, now),
    ),
    columns: { id: true },
    limit: 25,
  });

  const skipped: string[] = [];
  for (const { id } of expired) {
    const result = await autoSkipTurn(id);
    if (result.ok) skipped.push(id);
  }
  return { ok: true, data: { checked: expired.length, skipped } };
}

/** Skip the current player's turn in one game via neutral engine actions. */
export async function autoSkipTurn(gameId: string): Promise<ServiceResult<{ actions: number }>> {
  const db = getDb();
  for (let step = 0; step < MAX_SKIP_ACTIONS; step++) {
    const game = await db.query.games.findFirst({ where: eq(games.id, gameId) });
    if (!game || game.status !== "active" || !game.snapshot) {
      return step > 0
        ? { ok: true, data: { actions: step } }
        : fail(409, "GAME_NOT_ACTIVE", "Not active.");
    }
    // The player may have acted between cron firing and now.
    if (game.turnDeadline && game.turnDeadline.getTime() > Date.now()) {
      return { ok: true, data: { actions: step } };
    }

    const action = nextSkipAction(game.snapshot);
    if (!action) return { ok: true, data: { actions: step } };

    const result = applyAction(game.snapshot, game.snapshot.currentTurnPlayer, action);
    if (!result.ok)
      return fail(500, result.code, `auto-skip produced an illegal action: ${result.message}`);

    const persisted = await persistApplied(game, game.snapshot, result.state);
    if (!persisted.ok) return persisted;
    if (persisted.data.turnChanged) {
      runAfter(() => runAiTurns(gameId)); // the next seat may be a bot
      return { ok: true, data: { actions: step + 1 } };
    }
  }
  return fail(500, "SKIP_OVERRUN", "Auto-skip did not finish the turn in bounds.");
}

export async function listMyGames(userId: string): Promise<ServiceResult<GameSummary[]>> {
  const db = getDb();
  const memberships = await db.query.gamePlayers.findMany({
    where: eq(gamePlayers.userId, userId),
    with: { game: { with: { players: true } } },
  });

  const summaries = memberships
    .map(({ game, playerId }): GameSummary => {
      return {
        gameId: game.id,
        status: game.status,
        mode: game.mode,
        turnNumber: game.turnNumber,
        isYourTurn: game.status === "active" && game.currentTurnPlayer === playerId,
        winner: game.winner,
        isPrivate: game.isPrivate,
        maxPlayers: game.maxPlayers,
        turnDeadline: game.turnDeadline?.toISOString() ?? null,
        players: game.players
          .sort((a, b) => a.turnOrder - b.turnOrder)
          .map((p) => ({
            playerId: p.playerId,
            displayName: p.displayName,
            color: p.color,
            type: p.type,
          })),
        updatedAt: game.updatedAt.toISOString(),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return { ok: true, data: summaries };
}

export async function getGameView(
  userId: string | null,
  gameId: string,
): Promise<ServiceResult<GameView>> {
  const db = getDb();
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { players: true },
  });
  if (!game) return fail(404, "GAME_NOT_FOUND", "No such game.");

  const me = userId ? (game.players.find((p) => p.userId === userId) ?? null) : null;
  if (game.isPrivate && !me) {
    return fail(403, "PRIVATE_GAME", "This game is private.");
  }

  if (game.status === "lobby") {
    return {
      ok: true,
      data: {
        gameId: game.id,
        status: "lobby",
        mode: game.mode,
        maxPlayers: game.maxPlayers,
        isPrivate: game.isPrivate,
        objective: game.objective,
        createdBy: game.createdBy,
        inviteCode: me ? game.inviteCode : null,
        players: game.players
          .sort((a, b) => a.turnOrder - b.turnOrder)
          .map((p) => ({
            playerId: p.playerId,
            displayName: p.displayName,
            color: p.color,
            type: p.type,
          })),
        youJoined: me !== null,
        youAreCreator: userId === game.createdBy,
      },
    };
  }

  if (!game.snapshot) return fail(500, "MISSING_SNAPSHOT", "Game state is missing.");
  return {
    ok: true,
    data: {
      gameId: game.id,
      status: game.status,
      turnDeadline: game.turnDeadline?.toISOString() ?? null,
      view: redactState(game.snapshot, me?.playerId ?? null),
    },
  };
}
