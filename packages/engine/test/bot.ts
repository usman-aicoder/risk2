/**
 * Deterministic random-legal-move bot used by property and replay tests.
 * It only proposes legal actions; every applyAction must therefore succeed,
 * and invariants are asserted after each step.
 */

import { applyAction } from "../src/apply.js";
import type { Action } from "../src/actions.js";
import { isValidSet } from "../src/cards.js";
import type { Card } from "../src/cards.js";
import { ADJACENCY, TERRITORY_CODES } from "../src/map.js";
import { ownedTerritories } from "../src/rules.js";
import { createRng } from "../src/rng.js";
import type { Rng } from "../src/rng.js";
import { createGame } from "../src/setup.js";
import type { GameConfig } from "../src/setup.js";
import type { GameState } from "../src/state.js";
import { FORCED_TRADE_HAND_SIZE } from "../src/validate.js";

export function simConfig(seed: number, playerCount = 3): GameConfig {
  const colors = ["red", "blue", "green", "yellow", "purple", "black"] as const;
  return {
    gameId: `sim_${seed}`,
    mode: "async",
    rngSeed: seed,
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `P${i}`,
      name: `Bot ${i}`,
      color: colors[i] as (typeof colors)[number],
      type: "ai" as const,
    })),
  };
}

function findValidSet(cards: readonly Card[]): Card[] | null {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      for (let k = j + 1; k < cards.length; k++) {
        const set = [cards[i] as Card, cards[j] as Card, cards[k] as Card];
        if (isValidSet(set)) return set;
      }
    }
  }
  return null;
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng.next() * items.length)] as T;
}

export function pickBotAction(s: GameState, rng: Rng): Action {
  const playerId = s.currentTurnPlayer;
  const player = s.players.find((p) => p.playerId === playerId);
  if (!player) throw new Error("current player missing");

  if (s.pendingAdvance) {
    const { from, to, minArmies } = s.pendingAdvance;
    const max = s.territories[from].troops - 1;
    const armies = minArmies + Math.floor(rng.next() * (max - minArmies + 1));
    return { type: "advance", from, to, armies };
  }

  if (s.phase === "reinforce") {
    if (player.cards.length >= FORCED_TRADE_HAND_SIZE) {
      const set = findValidSet(player.cards);
      if (!set) throw new Error("5+ cards must always contain a valid set");
      return { type: "tradeCards", cardIds: set.map((c) => c.id) };
    }
    if (player.reinforcementsPending > 0) {
      const territory = pick(ownedTerritories(s, playerId), rng);
      return { type: "reinforce", territory, armies: player.reinforcementsPending };
    }
    return { type: "endPhase" };
  }

  if (s.phase === "attack") {
    const candidates: {
      from: (typeof TERRITORY_CODES)[number];
      to: (typeof TERRITORY_CODES)[number];
    }[] = [];
    for (const from of ownedTerritories(s, playerId)) {
      if (s.territories[from].troops < 2) continue;
      for (const to of ADJACENCY[from]) {
        if (s.territories[to].owner !== playerId) candidates.push({ from, to });
      }
    }
    if (candidates.length > 0 && rng.next() < 0.8) {
      const { from, to } = pick(candidates, rng);
      return { type: "attack", from, to, mode: rng.next() < 0.7 ? "fast" : "single" };
    }
    return { type: "endPhase" };
  }

  return { type: "endPhase" }; // fortify: bots skip the tactical move
}

export function assertInvariants(s: GameState): void {
  const playerIds = new Set(s.players.map((p) => p.playerId));
  const ownedBy = new Map<string, number>();
  for (const code of TERRITORY_CODES) {
    const t = s.territories[code];
    if (!playerIds.has(t.owner)) throw new Error(`territory ${code} owned by unknown ${t.owner}`);
    ownedBy.set(t.owner, (ownedBy.get(t.owner) ?? 0) + 1);
    const isPendingTarget = s.pendingAdvance?.to === code;
    if (t.troops < 1 && !isPendingTarget) {
      throw new Error(`territory ${code} has ${t.troops} troops`);
    }
  }

  let cardTotal = s.deck.drawPile.length + s.deck.discardPile.length;
  for (const p of s.players) {
    cardTotal += p.cards.length;
    if (p.reinforcementsPending < 0) throw new Error(`negative reinforcements for ${p.playerId}`);
    const owned = ownedBy.get(p.playerId) ?? 0;
    if (p.isEliminated && owned !== 0) {
      throw new Error(`eliminated ${p.playerId} still owns ${owned} territories`);
    }
    if (!p.isEliminated && owned === 0) {
      throw new Error(`${p.playerId} owns nothing but is not eliminated`);
    }
  }
  if (cardTotal !== 44) throw new Error(`card conservation broken: ${cardTotal} cards`);

  if (s.winner !== null && s.phase !== "gameOver") throw new Error("winner set but game not over");
  if (s.phase === "gameOver" && s.winner === null) throw new Error("game over without a winner");
}

export function runBotGame(
  seed: number,
  maxActions: number,
  playerCount = 3,
): { state: GameState; actionsApplied: number } {
  const config = simConfig(seed, playerCount);
  let state = createGame(config);
  assertInvariants(state);
  const botRng = createRng((seed ^ 0x9e3779b9) >>> 0);
  let applied = 0;
  while (state.phase !== "gameOver" && applied < maxActions) {
    const action = pickBotAction(state, botRng);
    const result = applyAction(state, state.currentTurnPlayer, action);
    if (!result.ok) {
      throw new Error(`bot proposed an illegal action (${result.code}): ${JSON.stringify(action)}`);
    }
    state = result.state;
    assertInvariants(state);
    applied++;
  }
  return { state, actionsApplied: applied };
}
