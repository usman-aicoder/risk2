/**
 * Events emitted by applying an action — the source for activity feeds,
 * authoritative client diffs, and the replayable log (P4).
 */

import type { DiceRoll } from "./combat.js";
import type { TerritoryCode } from "./map.js";

export type GameEvent =
  | { type: "reinforced"; playerId: string; territory: TerritoryCode; armies: number }
  | {
      type: "cardsTraded";
      playerId: string;
      cardIds: string[];
      armies: number;
      bonusTerritory: TerritoryCode | null;
    }
  | {
      type: "battle";
      from: TerritoryCode;
      to: TerritoryCode;
      rolls: DiceRoll[];
      captured: boolean;
    }
  | { type: "advanced"; from: TerritoryCode; to: TerritoryCode; armies: number }
  | { type: "fortified"; from: TerritoryCode; to: TerritoryCode; armies: number }
  | { type: "cardAwarded"; playerId: string; cardId: string }
  | { type: "playerEliminated"; playerId: string; by: string; cardsTransferred: number }
  | { type: "phaseChanged"; phase: "attack" | "fortify" }
  | { type: "turnStarted"; playerId: string; turnNumber: number; reinforcements: number }
  | { type: "gameOver"; winner: string };
