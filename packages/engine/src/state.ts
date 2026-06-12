/**
 * The authoritative game state (Schema doc §2.3). A single serializable
 * object; the server is the only writer, clients never compute outcomes (P4).
 *
 * Static map data (adjacency, continents) lives in map.ts and is not
 * duplicated into state — the snapshot stays small and the rules stay data.
 */

import type { Action } from "./actions.js";
import type { Card, DeckState } from "./cards.js";
import type { GameEvent } from "./events.js";
import type { ContinentCode, TerritoryCode } from "./map.js";

export type GameMode = "live" | "async";

export type Phase = "reinforce" | "attack" | "fortify" | "gameOver";

export type PlayerColor = "red" | "blue" | "green" | "yellow" | "purple" | "black";

export type PlayerType = "human" | "ai";

/**
 * Game-level win objective (Schema: Game.objective). Domination is classic;
 * the others are selectable shorter objectives. First player to satisfy the
 * objective at their end-of-turn check wins.
 */
export type Objective =
  | { kind: "domination" }
  | { kind: "territories"; count: number }
  | { kind: "continents"; continents: readonly ContinentCode[] };

export interface PlayerState {
  playerId: string;
  displayName: string;
  color: PlayerColor;
  type: PlayerType;
  reinforcementsPending: number;
  cards: Card[];
  isEliminated: boolean;
  turnOrder: number;
}

export interface TerritoryOccupancy {
  owner: string;
  troops: number;
}

/** A capture awaiting the mandatory advance (move in >= dice rolled). */
export interface PendingAdvance {
  from: TerritoryCode;
  to: TerritoryCode;
  minArmies: number;
}

export interface LogEntry {
  seq: number;
  playerId: string;
  action: Action;
  /** Includes dice results, so any battle is replayable from the seed (P4). */
  events: GameEvent[];
}

export interface GameState {
  gameId: string;
  mode: GameMode;
  phase: Phase;
  currentTurnPlayer: string;
  turnNumber: number;
  /** Global counter driving card trade-in escalation (P1). */
  cardSetCount: number;
  /** Seeded, auditable RNG (P4): seed + draw count reproduce every roll. */
  rngSeed: number;
  rngDraws: number;
  objective: Objective;
  players: PlayerState[];
  territories: Record<TerritoryCode, TerritoryOccupancy>;
  deck: DeckState;
  pendingAdvance: PendingAdvance | null;
  /** Capturing at least one territory this turn earns one card at turn end. */
  capturedThisTurn: boolean;
  winner: string | null;
  log: LogEntry[];
}

/** State is plain JSON data; cloning keeps applyAction pure. */
export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
