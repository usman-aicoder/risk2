/**
 * Database schema (Schema doc §2, P4).
 *
 * The `game.snapshot` JSONB column holds the full engine GameState — the
 * single source of truth, written only by the server. `action_log` is a
 * queryable projection of the engine's append-only log (the snapshot embeds
 * the same log, so the snapshot alone can rebuild any game).
 *
 * user/account/session/verificationToken follow the Auth.js Drizzle adapter
 * shape.
 */

import type { Action, GameEvent, GameState, Objective } from "@risk2/engine";
import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ---------------------------------------------------------------------------
// Auth.js tables
// ---------------------------------------------------------------------------

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

// ---------------------------------------------------------------------------
// Game tables (Schema doc §2)
// ---------------------------------------------------------------------------

export type GameStatus = "lobby" | "active" | "finished";

export const games = pgTable(
  "game",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    status: text("status", { enum: ["lobby", "active", "finished"] })
      .notNull()
      .default("lobby"),
    mode: text("mode", { enum: ["live", "async"] })
      .notNull()
      .default("async"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    maxPlayers: integer("max_players").notNull().default(6),
    isPrivate: boolean("is_private").notNull().default(false),
    inviteCode: text("invite_code")
      .notNull()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "").slice(0, 10)),
    objective: jsonb("objective").$type<Objective>().notNull(),
    /** Seeded, auditable RNG (P4); set when the game starts. */
    rngSeed: integer("rng_seed"),
    /** Authoritative engine state; null while the game is in the lobby. */
    snapshot: jsonb("snapshot").$type<GameState>(),
    /** Optimistic-concurrency version; bumped on every applied action. */
    version: integer("version").notNull().default(0),
    // Denormalized from the snapshot for dashboard queries (P2).
    currentTurnPlayer: text("current_turn_player"),
    turnNumber: integer("turn_number"),
    winner: text("winner"),
    /** Async games: hours each player has to act before auto-skip (P2). */
    turnDurationHours: integer("turn_duration_hours").notNull().default(48),
    /** When the current turn auto-skips; null in lobby/finished games. */
    turnDeadline: timestamp("turn_deadline", { mode: "date" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("game_invite_code").on(table.inviteCode)],
);

export const gamePlayers = pgTable(
  "game_player",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** Null for AI players. */
    userId: text("user_id").references(() => users.id),
    /** Engine player id (equals userId for humans). */
    playerId: text("player_id").notNull(),
    displayName: text("display_name").notNull(),
    color: text("color", { enum: ["red", "blue", "green", "yellow", "purple", "black"] }).notNull(),
    type: text("type", { enum: ["human", "ai"] })
      .notNull()
      .default("human"),
    /** Bot tier; null for humans. */
    aiDifficulty: text("ai_difficulty", { enum: ["easy", "medium", "hard"] }),
    turnOrder: integer("turn_order").notNull(),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("game_player_engine_id").on(table.gameId, table.playerId),
    uniqueIndex("game_player_user").on(table.gameId, table.userId),
  ],
);

export const actionLog = pgTable(
  "action_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    playerId: text("player_id").notNull(),
    action: jsonb("action").$type<Action>().notNull(),
    /** Includes dice results — every battle replayable from the seed (P4). */
    events: jsonb("events").$type<GameEvent[]>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("action_log_game_seq").on(table.gameId, table.seq)],
);

/** Web Push subscriptions for the "your turn" loop (P2). */
export const pushSubscriptions = pgTable(
  "push_subscription",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("push_subscription_endpoint").on(table.endpoint)],
);

export const gamesRelations = relations(games, ({ many }) => ({
  players: many(gamePlayers),
}));

export const gamePlayersRelations = relations(gamePlayers, ({ one }) => ({
  game: one(games, { fields: [gamePlayers.gameId], references: [games.id] }),
}));
