/**
 * AI opponents (Spec §4.4): bots play the four strategy pillars from the
 * anchor document, scaled by difficulty.
 *
 *   Continent control   — pursue the continent we're closest to locking.
 *   Defensible borders  — value continents by border count (Australia 1,
 *                         South America 2 ... Asia 5+ is the trap).
 *   Stack discipline    — place everything on one frontier stack; attack
 *                         only with an advantage; fortify interior armies
 *                         to the front.
 *   Card tempo          — easy trades only when forced; hard waits for an
 *                         explosive value.
 *
 * chooseBotAction is pure and deterministic for a given state (its
 * tie-breaking RNG derives from the game seed and log length), and only
 * ever returns actions the engine will accept.
 */

import type { Action } from "../actions.js";
import { findTradeableSet, tradeValue } from "../cards.js";
import type { ContinentCode, TerritoryCode } from "../map.js";
import { ADJACENCY, CONTINENTS, CONTINENT_CODES, TERRITORY_CONTINENT } from "../map.js";
import { ownedTerritories } from "../rules.js";
import { createRng } from "../rng.js";
import type { Rng } from "../rng.js";
import type { GameState } from "../state.js";
import { FORCED_TRADE_HAND_SIZE } from "../validate.js";

export type BotDifficulty = "easy" | "medium" | "hard";

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ["easy", "medium", "hard"];

/** Borders to defend per continent (anchor doc §4 — lower is better). */
const DEFENSIBILITY: Record<ContinentCode, number> = {
  australia: 1,
  south_america: 2,
  africa: 3,
  north_america: 3,
  europe: 4,
  asia: 6,
};

interface TierConfig {
  /** Minimum troops on the source before considering an attack. */
  minAttackStack: number;
  /** Required troop advantage (attacker - defender) to engage. */
  minAdvantage: number;
  /** Attacks initiated per turn before stopping. */
  maxAttacksPerTurn: number;
  /** Whether to place reinforcements by score (vs randomly). */
  scoredPlacement: boolean;
  /** Whether to fortify interior stacks toward the frontier. */
  fortifies: boolean;
}

const TIERS: Record<BotDifficulty, TierConfig> = {
  easy: {
    minAttackStack: 2,
    minAdvantage: 0,
    maxAttacksPerTurn: 1,
    scoredPlacement: false,
    fortifies: false,
  },
  medium: {
    minAttackStack: 3,
    minAdvantage: 1,
    maxAttacksPerTurn: 4,
    scoredPlacement: true,
    fortifies: true,
  },
  hard: {
    minAttackStack: 3,
    minAdvantage: 2,
    maxAttacksPerTurn: 12,
    scoredPlacement: true,
    fortifies: true,
  },
};

function rngFor(state: GameState): Rng {
  return createRng((state.rngSeed ^ Math.imul(state.log.length + 1, 0x9e3779b1)) >>> 0);
}

function enemyNeighbors(state: GameState, playerId: string, code: TerritoryCode): TerritoryCode[] {
  return ADJACENCY[code].filter((n) => state.territories[n].owner !== playerId);
}

/** Owned territories that touch an enemy. */
function frontier(state: GameState, playerId: string): TerritoryCode[] {
  return ownedTerritories(state, playerId).filter(
    (code) => enemyNeighbors(state, playerId, code).length > 0,
  );
}

/**
 * Continent control + defensible borders: chase the continent with the best
 * mix of progress, bonus, and defensibility that we don't fully own yet.
 */
export function targetContinent(state: GameState, playerId: string): ContinentCode {
  let best: ContinentCode = "australia";
  let bestScore = -Infinity;
  for (const code of CONTINENT_CODES) {
    const continent = CONTINENTS[code];
    const owned = continent.territories.filter(
      (t) => state.territories[t].owner === playerId,
    ).length;
    if (owned === continent.territories.length) continue; // already locked
    const fraction = owned / continent.territories.length;
    const score =
      fraction * 6 + continent.bonus / continent.territories.length - DEFENSIBILITY[code];
    if (score > bestScore) {
      bestScore = score;
      best = code;
    }
  }
  return best;
}

function placementScore(
  state: GameState,
  playerId: string,
  code: TerritoryCode,
  target: ContinentCode,
): number {
  const enemies = enemyNeighbors(state, playerId, code);
  let score = enemies.length * 0.5; // frontier pressure
  if (TERRITORY_CONTINENT[code] === target) score += 4;
  // chokepoint into the target continent
  score += enemies.filter((e) => TERRITORY_CONTINENT[e] === target).length * 2;
  score += state.territories[code].troops * 0.1; // grow the big stack
  return score;
}

/** Would capturing `code` complete its continent for the player? */
function completesContinent(state: GameState, playerId: string, code: TerritoryCode): boolean {
  const continent = TERRITORY_CONTINENT[code];
  return CONTINENTS[continent].territories.every(
    (t) => t === code || state.territories[t].owner === playerId,
  );
}

/** Attacks already launched since this player's turn began. */
function attacksThisTurn(state: GameState, playerId: string): number {
  let count = 0;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const entry = state.log[i];
    if (!entry) break;
    if (entry.events.some((e) => e.type === "turnStarted" && e.playerId === playerId)) break;
    if (entry.playerId === playerId && entry.action.type === "attack") count++;
  }
  return count;
}

function pickRandom<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng.next() * items.length)] as T;
}

export function chooseBotAction(
  state: GameState,
  playerId: string,
  difficulty: BotDifficulty,
): Action {
  const tier = TIERS[difficulty];
  const rng = rngFor(state);
  const player = state.players.find((p) => p.playerId === playerId);
  if (!player) throw new Error(`unknown bot player ${playerId}`);
  const target = targetContinent(state, playerId);

  // Mandatory advance after a capture: keep the stack mobile — take
  // everything forward unless the source is still a frontier, then split.
  if (state.pendingAdvance) {
    const { from, to, minArmies } = state.pendingAdvance;
    const max = state.territories[from].troops - 1;
    const fromIsFrontier = enemyNeighbors(state, playerId, from).length > 0;
    const armies = fromIsFrontier ? Math.min(max, Math.max(minArmies, Math.ceil(max * 0.6))) : max;
    return { type: "advance", from, to, armies };
  }

  if (state.phase === "reinforce") {
    // Card tempo: forced at 5; medium trades on sight; hard waits until the
    // set is worth an explosive turn.
    const set = findTradeableSet(player.cards);
    if (set) {
      const forced = player.cards.length >= FORCED_TRADE_HAND_SIZE;
      const value = tradeValue(state.cardSetCount + 1);
      const wants = difficulty === "medium" ? true : difficulty === "hard" ? value >= 8 : false;
      if (forced || wants) return { type: "tradeCards", cardIds: set.map((c) => c.id) };
    }

    if (player.reinforcementsPending > 0) {
      const front = frontier(state, playerId);
      const candidates = front.length > 0 ? front : ownedTerritories(state, playerId);
      const territory = tier.scoredPlacement
        ? candidates.reduce((best, code) =>
            placementScore(state, playerId, code, target) >
            placementScore(state, playerId, best, target)
              ? code
              : best,
          )
        : pickRandom(candidates, rng);
      // Stack discipline: everything on one stack.
      return { type: "reinforce", territory, armies: player.reinforcementsPending };
    }
    return { type: "endPhase" };
  }

  if (state.phase === "attack") {
    if (attacksThisTurn(state, playerId) >= tier.maxAttacksPerTurn) return { type: "endPhase" };

    interface Candidate {
      from: TerritoryCode;
      to: TerritoryCode;
      score: number;
    }
    const candidates: Candidate[] = [];
    for (const from of frontier(state, playerId)) {
      const troops = state.territories[from].troops;
      if (troops < tier.minAttackStack) continue;
      for (const to of enemyNeighbors(state, playerId, from)) {
        const advantage = troops - state.territories[to].troops;
        const completing = completesContinent(state, playerId, to);
        if (advantage < tier.minAdvantage && !(completing && advantage >= 1)) continue;
        let score = advantage;
        if (TERRITORY_CONTINENT[to] === target) score += 3;
        if (completing) score += 5;
        score -= state.territories[to].troops * 0.2;
        candidates.push({ from, to, score });
      }
    }
    if (candidates.length === 0) return { type: "endPhase" };
    if (difficulty === "easy" && rng.next() < 0.4) return { type: "endPhase" };
    const pickFrom =
      difficulty === "easy"
        ? pickRandom(candidates, rng)
        : candidates.reduce((a, b) => (b.score > a.score ? b : a));
    return { type: "attack", from: pickFrom.from, to: pickFrom.to, mode: "fast" };
  }

  // Fortify: move an idle interior stack to the most valuable connected
  // frontier territory (one tactical move, then the turn ends).
  if (tier.fortifies) {
    const interior = ownedTerritories(state, playerId).filter(
      (code) =>
        state.territories[code].troops > 1 && enemyNeighbors(state, playerId, code).length === 0,
    );
    if (interior.length > 0) {
      const source = interior.reduce((a, b) =>
        state.territories[b].troops > state.territories[a].troops ? b : a,
      );
      const destination = reachableFrontier(state, playerId, source, target);
      if (destination) {
        return {
          type: "fortify",
          from: source,
          to: destination,
          armies: state.territories[source].troops - 1,
        };
      }
    }
  }
  return { type: "endPhase" };
}

/** Best frontier territory connected to `from` through owned territory. */
function reachableFrontier(
  state: GameState,
  playerId: string,
  from: TerritoryCode,
  target: ContinentCode,
): TerritoryCode | null {
  const visited = new Set<TerritoryCode>([from]);
  const queue: TerritoryCode[] = [from];
  const reachable: TerritoryCode[] = [];
  while (queue.length > 0) {
    const current = queue.shift() as TerritoryCode;
    for (const neighbor of ADJACENCY[current]) {
      if (visited.has(neighbor) || state.territories[neighbor].owner !== playerId) continue;
      visited.add(neighbor);
      queue.push(neighbor);
      if (enemyNeighbors(state, playerId, neighbor).length > 0) reachable.push(neighbor);
    }
  }
  if (reachable.length === 0) return null;
  return reachable.reduce((a, b) =>
    placementScore(state, playerId, b, target) > placementScore(state, playerId, a, target) ? b : a,
  );
}
