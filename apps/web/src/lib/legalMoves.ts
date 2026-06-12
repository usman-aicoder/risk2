/**
 * Legal-move highlighting (P3) computed with the engine's own validator, so
 * the UI can never disagree with the server about what is allowed. The
 * redacted PlayerView is lifted into a GameState that is exact for everything
 * validation reads about the viewer (hidden opponent data is irrelevant to
 * the viewer's own legality checks).
 */

import type { Action, GameState, PlayerColor, TerritoryCode } from "@risk2/engine";
import { ADJACENCY, TERRITORY_CODES, validateAction } from "@risk2/engine";
import type { PlayerView } from "./redact";

export function viewToValidationState(view: PlayerView): GameState {
  return {
    gameId: view.gameId,
    mode: view.mode,
    phase: view.phase,
    currentTurnPlayer: view.currentTurnPlayer,
    turnNumber: view.turnNumber,
    cardSetCount: view.cardSetCount,
    rngSeed: 0,
    rngDraws: 0,
    objective: view.objective,
    players: view.players.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      color: p.color as PlayerColor,
      type: p.type,
      reinforcementsPending: p.reinforcementsPending,
      cards: p.cards ?? [],
      isEliminated: p.isEliminated,
      turnOrder: p.turnOrder,
    })),
    territories: view.territories,
    deck: { drawPile: [], discardPile: view.discardPile },
    pendingAdvance: view.pendingAdvance,
    capturedThisTurn: view.capturedThisTurn,
    winner: view.winner,
    log: [],
  };
}

function legal(state: GameState, playerId: string, action: Action): boolean {
  return validateAction(state, playerId, action).ok;
}

/** Territories where the viewer may place reinforcements right now. */
export function reinforceTargets(state: GameState, playerId: string): Set<TerritoryCode> {
  const out = new Set<TerritoryCode>();
  for (const code of TERRITORY_CODES) {
    if (legal(state, playerId, { type: "reinforce", territory: code, armies: 1 })) out.add(code);
  }
  return out;
}

/** Territories the viewer can launch an attack from. */
export function attackSources(state: GameState, playerId: string): Set<TerritoryCode> {
  const out = new Set<TerritoryCode>();
  for (const code of TERRITORY_CODES) {
    for (const neighbor of ADJACENCY[code]) {
      if (legal(state, playerId, { type: "attack", from: code, to: neighbor, mode: "single" })) {
        out.add(code);
        break;
      }
    }
  }
  return out;
}

/** Enemy territories attackable from `from`. */
export function attackTargets(
  state: GameState,
  playerId: string,
  from: TerritoryCode,
): Set<TerritoryCode> {
  const out = new Set<TerritoryCode>();
  for (const neighbor of ADJACENCY[from]) {
    if (legal(state, playerId, { type: "attack", from, to: neighbor, mode: "single" })) {
      out.add(neighbor);
    }
  }
  return out;
}

/** Territories the viewer can fortify from (>= 2 troops, a connected friend). */
export function fortifySources(state: GameState, playerId: string): Set<TerritoryCode> {
  const out = new Set<TerritoryCode>();
  for (const code of TERRITORY_CODES) {
    if (state.territories[code].owner !== playerId || state.territories[code].troops < 2) continue;
    for (const other of TERRITORY_CODES) {
      if (other === code) continue;
      if (legal(state, playerId, { type: "fortify", from: code, to: other, armies: 1 })) {
        out.add(code);
        break;
      }
    }
  }
  return out;
}

/** Friendly connected destinations for a fortify from `from`. */
export function fortifyTargets(
  state: GameState,
  playerId: string,
  from: TerritoryCode,
): Set<TerritoryCode> {
  const out = new Set<TerritoryCode>();
  for (const other of TERRITORY_CODES) {
    if (other === from) continue;
    if (legal(state, playerId, { type: "fortify", from, to: other, armies: 1 })) out.add(other);
  }
  return out;
}
