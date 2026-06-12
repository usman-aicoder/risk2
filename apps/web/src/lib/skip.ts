/**
 * Turn-deadline auto-skip policy (P2): when an async player's clock runs
 * out, the server plays a minimal, neutral turn for them — through the same
 * engine validate/apply pipeline as any human action, so skips are logged,
 * replayable, and can never break the rules (P4).
 *
 * Policy: resolve any mandatory advance with the minimum armies; trade only
 * if forced (5+ cards); place all reinforcements on the player's strongest
 * territory; never attack; never fortify.
 */

import type { Action, GameState } from "@risk2/engine";
import { FORCED_TRADE_HAND_SIZE, findTradeableSet, ownedTerritories } from "@risk2/engine";

export function nextSkipAction(state: GameState): Action | null {
  if (state.phase === "gameOver") return null;

  if (state.pendingAdvance) {
    const { from, to, minArmies } = state.pendingAdvance;
    return { type: "advance", from, to, armies: minArmies };
  }

  const player = state.players.find((p) => p.playerId === state.currentTurnPlayer);
  if (!player) return null;

  if (state.phase === "reinforce") {
    if (player.cards.length >= FORCED_TRADE_HAND_SIZE) {
      const set = findTradeableSet(player.cards);
      if (set) return { type: "tradeCards", cardIds: set.map((c) => c.id) };
    }
    if (player.reinforcementsPending > 0) {
      const owned = ownedTerritories(state, player.playerId);
      const strongest = owned.reduce((best, code) =>
        state.territories[code].troops > state.territories[best].troops ? code : best,
      );
      return { type: "reinforce", territory: strongest, armies: player.reinforcementsPending };
    }
  }

  return { type: "endPhase" };
}

/** Safety bound: a skipped turn never needs more steps than this. */
export const MAX_SKIP_ACTIONS = 12;
