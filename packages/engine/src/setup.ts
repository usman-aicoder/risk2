/**
 * Game creation: deal territories, place starting armies, build the deck.
 * Fully deterministic from the game's rngSeed (P4), so setup itself is
 * auditable and replayable.
 */

import { buildDeck } from "./cards.js";
import { TERRITORY_CODES } from "./map.js";
import type { TerritoryCode } from "./map.js";
import { computeReinforcements } from "./rules.js";
import { createRng, shuffleInPlace } from "./rng.js";
import type {
  GameMode,
  GameState,
  Objective,
  PlayerColor,
  PlayerState,
  PlayerType,
  TerritoryOccupancy,
} from "./state.js";

export interface PlayerConfig {
  id: string;
  name: string;
  color: PlayerColor;
  type: PlayerType;
}

export interface GameConfig {
  gameId: string;
  mode: GameMode;
  rngSeed: number;
  players: PlayerConfig[];
  objective?: Objective;
}

/** Classic starting army counts by player count (P1). */
export const STARTING_ARMIES: Record<number, number> = {
  2: 40,
  3: 35,
  4: 30,
  5: 25,
  6: 20,
};

export function createGame(config: GameConfig): GameState {
  const n = config.players.length;
  if (n < 2 || n > 6) throw new Error("Risk is played with 2-6 players.");
  if (new Set(config.players.map((p) => p.id)).size !== n) {
    throw new Error("Player ids must be unique.");
  }
  if (new Set(config.players.map((p) => p.color)).size !== n) {
    throw new Error("Player colors must be unique.");
  }

  const rng = createRng(config.rngSeed);
  const startingArmies = STARTING_ARMIES[n] as number;

  // Deal territories round-robin from a shuffled deck of codes; every
  // territory starts with 1 army.
  const dealt = shuffleInPlace([...TERRITORY_CODES], rng);
  const territories = {} as Record<TerritoryCode, TerritoryOccupancy>;
  const ownedBy = new Map<string, TerritoryCode[]>(config.players.map((p) => [p.id, []]));
  dealt.forEach((code, i) => {
    const owner = (config.players[i % n] as PlayerConfig).id;
    territories[code] = { owner, troops: 1 };
    (ownedBy.get(owner) as TerritoryCode[]).push(code);
  });

  // Auto-place each player's remaining armies on their own territories,
  // one army at a time cycling through players (seeded, deterministic).
  const remaining = new Map<string, number>(
    config.players.map((p) => [
      p.id,
      startingArmies - (ownedBy.get(p.id) as TerritoryCode[]).length,
    ]),
  );
  let anyLeft = true;
  while (anyLeft) {
    anyLeft = false;
    for (const p of config.players) {
      const left = remaining.get(p.id) as number;
      if (left <= 0) continue;
      const owned = ownedBy.get(p.id) as TerritoryCode[];
      const target = owned[Math.floor(rng.next() * owned.length)] as TerritoryCode;
      territories[target].troops += 1;
      remaining.set(p.id, left - 1);
      anyLeft = anyLeft || left - 1 > 0;
    }
  }

  const players: PlayerState[] = config.players.map((p, i) => ({
    playerId: p.id,
    displayName: p.name,
    color: p.color,
    type: p.type,
    reinforcementsPending: 0,
    cards: [],
    isEliminated: false,
    turnOrder: i,
  }));

  const drawPile = shuffleInPlace(buildDeck(), rng);

  const state: GameState = {
    gameId: config.gameId,
    mode: config.mode,
    phase: "reinforce",
    currentTurnPlayer: (players[0] as PlayerState).playerId,
    turnNumber: 1,
    cardSetCount: 0,
    rngSeed: config.rngSeed,
    rngDraws: rng.drawCount,
    objective: config.objective ?? { kind: "domination" },
    players,
    territories,
    deck: { drawPile, discardPile: [] },
    pendingAdvance: null,
    capturedThisTurn: false,
    winner: null,
    log: [],
  };

  (players[0] as PlayerState).reinforcementsPending = computeReinforcements(
    state,
    (players[0] as PlayerState).playerId,
  );
  return state;
}
