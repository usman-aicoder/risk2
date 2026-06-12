/**
 * Derived rule computations (P1): reinforcement math, continent control,
 * fortify connectivity, win objectives, and turn rotation.
 */

import type { ContinentCode, TerritoryCode } from "./map.js";
import { ADJACENCY, CONTINENTS, CONTINENT_CODES, TERRITORY_CODES } from "./map.js";
import type { GameState, PlayerState } from "./state.js";

export function ownedTerritories(state: GameState, playerId: string): TerritoryCode[] {
  return TERRITORY_CODES.filter((code) => state.territories[code].owner === playerId);
}

export function ownedCount(state: GameState, playerId: string): number {
  let count = 0;
  for (const code of TERRITORY_CODES) {
    if (state.territories[code].owner === playerId) count++;
  }
  return count;
}

export function controlsContinent(
  state: GameState,
  playerId: string,
  continent: ContinentCode,
): boolean {
  return CONTINENTS[continent].territories.every(
    (code) => state.territories[code].owner === playerId,
  );
}

/** Reinforcements = max(3, floor(territories / 3)) + continent bonuses (P1). */
export function computeReinforcements(state: GameState, playerId: string): number {
  const territories = ownedCount(state, playerId);
  let armies = Math.max(3, Math.floor(territories / 3));
  for (const continent of CONTINENT_CODES) {
    if (controlsContinent(state, playerId, continent)) {
      armies += CONTINENTS[continent].bonus;
    }
  }
  return armies;
}

/**
 * Fortify moves between *connected* friendly territories: a path of the
 * player's own territories must link `from` to `to`.
 */
export function areConnected(
  state: GameState,
  playerId: string,
  from: TerritoryCode,
  to: TerritoryCode,
): boolean {
  if (state.territories[from].owner !== playerId || state.territories[to].owner !== playerId) {
    return false;
  }
  const visited = new Set<TerritoryCode>([from]);
  const queue: TerritoryCode[] = [from];
  while (queue.length > 0) {
    const current = queue.shift() as TerritoryCode;
    if (current === to) return true;
    for (const neighbor of ADJACENCY[current]) {
      if (!visited.has(neighbor) && state.territories[neighbor].owner === playerId) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return false;
}

export function objectiveMet(state: GameState, playerId: string): boolean {
  const objective = state.objective;
  switch (objective.kind) {
    case "domination":
      return ownedCount(state, playerId) === TERRITORY_CODES.length;
    case "territories":
      return ownedCount(state, playerId) >= objective.count;
    case "continents":
      return objective.continents.every((c) => controlsContinent(state, playerId, c));
  }
}

/** Next non-eliminated player in turn order after `afterId`. */
export function nextAlivePlayer(state: GameState, afterId: string): PlayerState {
  const ordered = [...state.players].sort((a, b) => a.turnOrder - b.turnOrder);
  const index = ordered.findIndex((p) => p.playerId === afterId);
  for (let i = 1; i <= ordered.length; i++) {
    const candidate = ordered[(index + i) % ordered.length] as PlayerState;
    if (!candidate.isEliminated) return candidate;
  }
  throw new Error("no alive players");
}
