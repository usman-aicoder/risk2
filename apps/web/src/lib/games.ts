/**
 * Game service: lobby lifecycle and the authoritative action pipeline (P4)
 *
 *   load snapshot -> engine validate/apply -> persist (optimistic
 *   concurrency on version) -> append action_log row
 *
 * The engine snapshot is the single source of truth; the conditional UPDATE
 * on `version` guarantees two concurrent submissions can never fork it.
 */

import type { Action, GameEvent, Objective, PlayerColor } from "@risk2/engine";
import { applyAction, createGame } from "@risk2/engine";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { actionLog, gamePlayers, games, users } from "@/db/schema";
import type { PlayerView } from "./redact";
import { redactState } from "./redact";

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
  | { gameId: string; status: "active" | "finished"; view: PlayerView };

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] as number) >>> 0;
}

export async function createLobby(
  userId: string,
  input: {
    mode: "live" | "async";
    maxPlayers: number;
    isPrivate: boolean;
    objective: Objective;
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
      updatedAt: new Date(),
    })
    .where(and(eq(games.id, gameId), eq(games.version, game.version)))
    .returning({ id: games.id });
  if (updated.length === 0) return fail(409, "CONFLICT", "The game changed; try again.");

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
  const state = result.state;

  const updated = await db
    .update(games)
    .set({
      snapshot: state,
      version: game.version + 1,
      currentTurnPlayer: state.currentTurnPlayer,
      turnNumber: state.turnNumber,
      status: state.phase === "gameOver" ? "finished" : "active",
      winner: state.winner,
      updatedAt: new Date(),
    })
    .where(and(eq(games.id, gameId), eq(games.version, game.version)))
    .returning({ id: games.id });
  if (updated.length === 0) {
    return fail(409, "VERSION_CONFLICT", "Another action was applied first; reload and retry.");
  }

  const entry = state.log[state.log.length - 1];
  if (entry) {
    await db.insert(actionLog).values({
      gameId,
      seq: entry.seq,
      playerId: entry.playerId,
      action: entry.action,
      events: entry.events,
    });
  }

  return {
    ok: true,
    data: { events: result.events, view: redactState(state, membership.playerId) },
  };
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
      view: redactState(game.snapshot, me?.playerId ?? null),
    },
  };
}
