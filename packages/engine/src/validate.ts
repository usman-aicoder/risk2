/**
 * Server-side action validation (P4): every action is checked against the
 * current phase, the acting player, and the exact rules before any state
 * changes. Illegal, out-of-phase, and out-of-turn actions are rejected with
 * typed error codes the API layer can map to 4xx responses.
 */

import type { Action } from "./actions.js";
import { isValidSet } from "./cards.js";
import { isAdjacent, isTerritoryCode } from "./map.js";
import { areConnected } from "./rules.js";
import type { GameState } from "./state.js";

export type ErrorCode =
  | "GAME_OVER"
  | "UNKNOWN_PLAYER"
  | "PLAYER_ELIMINATED"
  | "NOT_YOUR_TURN"
  | "WRONG_PHASE"
  | "INVALID_TERRITORY"
  | "NOT_OWNER"
  | "TARGET_NOT_ENEMY"
  | "NOT_ADJACENT"
  | "NOT_CONNECTED"
  | "SAME_TERRITORY"
  | "INSUFFICIENT_TROOPS"
  | "INVALID_ARMIES"
  | "PENDING_ADVANCE"
  | "NO_PENDING_ADVANCE"
  | "ADVANCE_MISMATCH"
  | "CARDS_NOT_HELD"
  | "INVALID_SET"
  | "MUST_TRADE"
  | "MUST_PLACE_ALL";

export type ValidationResult = { ok: true } | { ok: false; code: ErrorCode; message: string };

const ok: ValidationResult = { ok: true };

function err(code: ErrorCode, message: string): ValidationResult {
  return { ok: false, code, message };
}

/** Cards in hand at or above this count force a trade before the attack phase. */
export const FORCED_TRADE_HAND_SIZE = 5;

export function validateAction(
  state: GameState,
  playerId: string,
  action: Action,
): ValidationResult {
  if (state.phase === "gameOver") return err("GAME_OVER", "The game is over.");
  const player = state.players.find((p) => p.playerId === playerId);
  if (!player) return err("UNKNOWN_PLAYER", `No player ${playerId} in this game.`);
  if (player.isEliminated) return err("PLAYER_ELIMINATED", "You have been eliminated.");
  if (state.currentTurnPlayer !== playerId) return err("NOT_YOUR_TURN", "It is not your turn.");

  switch (action.type) {
    case "reinforce": {
      if (state.phase !== "reinforce")
        return err("WRONG_PHASE", "Reinforce only in the reinforce phase.");
      if (!isTerritoryCode(action.territory)) return err("INVALID_TERRITORY", "Unknown territory.");
      if (state.territories[action.territory].owner !== playerId) {
        return err("NOT_OWNER", "You can only reinforce your own territories.");
      }
      if (
        !Number.isInteger(action.armies) ||
        action.armies < 1 ||
        action.armies > player.reinforcementsPending
      ) {
        return err("INVALID_ARMIES", `Place between 1 and ${player.reinforcementsPending} armies.`);
      }
      return ok;
    }

    case "tradeCards": {
      if (state.phase !== "reinforce")
        return err("WRONG_PHASE", "Trade cards only in the reinforce phase.");
      if (action.cardIds.length !== 3 || new Set(action.cardIds).size !== 3) {
        return err("INVALID_SET", "A set is exactly 3 distinct cards.");
      }
      const cards = action.cardIds.map((id) => player.cards.find((c) => c.id === id));
      if (cards.some((c) => c === undefined)) {
        return err("CARDS_NOT_HELD", "You do not hold all of those cards.");
      }
      if (!isValidSet(cards.map((c) => c as NonNullable<typeof c>))) {
        return err("INVALID_SET", "Three of a kind, one of each, or any set with a wild.");
      }
      return ok;
    }

    case "attack": {
      if (state.phase !== "attack") return err("WRONG_PHASE", "Attack only in the attack phase.");
      if (state.pendingAdvance)
        return err("PENDING_ADVANCE", "Advance into the captured territory first.");
      if (!isTerritoryCode(action.from) || !isTerritoryCode(action.to)) {
        return err("INVALID_TERRITORY", "Unknown territory.");
      }
      if (state.territories[action.from].owner !== playerId) {
        return err("NOT_OWNER", "You can only attack from your own territory.");
      }
      if (state.territories[action.to].owner === playerId) {
        return err("TARGET_NOT_ENEMY", "You cannot attack your own territory.");
      }
      if (!isAdjacent(action.from, action.to)) {
        return err("NOT_ADJACENT", "Those territories are not adjacent.");
      }
      if (state.territories[action.from].troops < 2) {
        return err("INSUFFICIENT_TROOPS", "Attacking needs at least 2 troops.");
      }
      return ok;
    }

    case "advance": {
      if (state.phase !== "attack") return err("WRONG_PHASE", "Advance only in the attack phase.");
      const pending = state.pendingAdvance;
      if (!pending) return err("NO_PENDING_ADVANCE", "There is no capture to advance into.");
      if (pending.from !== action.from || pending.to !== action.to) {
        return err("ADVANCE_MISMATCH", "Advance must match the pending capture.");
      }
      const max = state.territories[action.from].troops - 1;
      if (
        !Number.isInteger(action.armies) ||
        action.armies < pending.minArmies ||
        action.armies > max
      ) {
        return err("INVALID_ARMIES", `Advance between ${pending.minArmies} and ${max} armies.`);
      }
      return ok;
    }

    case "fortify": {
      if (state.phase !== "fortify")
        return err("WRONG_PHASE", "Fortify only in the fortify phase.");
      if (!isTerritoryCode(action.from) || !isTerritoryCode(action.to)) {
        return err("INVALID_TERRITORY", "Unknown territory.");
      }
      if (action.from === action.to)
        return err("SAME_TERRITORY", "Pick two different territories.");
      if (state.territories[action.from].owner !== playerId) {
        return err("NOT_OWNER", "You can only fortify from your own territory.");
      }
      if (state.territories[action.to].owner !== playerId) {
        return err("NOT_OWNER", "You can only fortify into your own territory.");
      }
      const max = state.territories[action.from].troops - 1;
      if (!Number.isInteger(action.armies) || action.armies < 1 || action.armies > max) {
        return err("INVALID_ARMIES", `Move between 1 and ${max} armies, leaving 1 behind.`);
      }
      if (!areConnected(state, playerId, action.from, action.to)) {
        return err("NOT_CONNECTED", "Territories must be connected through your own territory.");
      }
      return ok;
    }

    case "endPhase": {
      if (state.phase === "reinforce") {
        // 5+ cards always contain a valid set (pigeonhole over 3 designs +
        // wilds), so the forced trade can never deadlock.
        if (player.cards.length >= FORCED_TRADE_HAND_SIZE) {
          return err("MUST_TRADE", "You hold 5 or more cards and must trade a set first.");
        }
        if (player.reinforcementsPending > 0) {
          return err("MUST_PLACE_ALL", "Place all reinforcements before attacking.");
        }
        return ok;
      }
      if (state.phase === "attack") {
        if (state.pendingAdvance)
          return err("PENDING_ADVANCE", "Advance into the captured territory first.");
        return ok;
      }
      return ok; // fortify -> end of turn
    }
  }
}
