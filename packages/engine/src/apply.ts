/**
 * The validate -> apply pipeline (Spec §5.2, P1/P4).
 *
 * applyAction is a pure function: it never mutates the input state, and with
 * the same state + action it always produces the same result — every dice
 * roll comes from the state's seeded RNG. The returned state carries the
 * appended log entry, so a snapshot can always be rebuilt by replaying.
 */

import type { Action } from "./actions.js";
import { drawCard, tradeValue } from "./cards.js";
import type { Card } from "./cards.js";
import type { DiceRoll } from "./combat.js";
import { resolveRoll } from "./combat.js";
import type { GameEvent } from "./events.js";
import type { TerritoryCode } from "./map.js";
import { computeReinforcements, nextAlivePlayer, objectiveMet, ownedCount } from "./rules.js";
import { createRng } from "./rng.js";
import type { Rng } from "./rng.js";
import { cloneState } from "./state.js";
import type { GameState, PlayerState } from "./state.js";
import { validateAction } from "./validate.js";
import type { ErrorCode } from "./validate.js";

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; code: ErrorCode; message: string };

export function applyAction(state: GameState, playerId: string, action: Action): ActionResult {
  const validation = validateAction(state, playerId, action);
  if (!validation.ok) return validation;

  // Clone everything except the log: log entries are append-only and never
  // mutated after creation, so structural sharing keeps applyAction pure
  // while avoiding an O(log length) copy on every action.
  const { log: previousLog, ...mutable } = state;
  const s: GameState = { ...cloneState({ ...mutable, log: [] }), log: previousLog };
  const events: GameEvent[] = [];
  const rng = createRng(s.rngSeed, s.rngDraws);
  const player = s.players.find((p) => p.playerId === playerId) as PlayerState;

  switch (action.type) {
    case "reinforce": {
      s.territories[action.territory].troops += action.armies;
      player.reinforcementsPending -= action.armies;
      events.push({
        type: "reinforced",
        playerId,
        territory: action.territory,
        armies: action.armies,
      });
      break;
    }

    case "tradeCards": {
      const traded = action.cardIds.map((id) => player.cards.find((c) => c.id === id) as Card);
      player.cards = player.cards.filter((c) => !action.cardIds.includes(c.id));
      s.deck.discardPile.push(...traded);
      s.cardSetCount += 1;
      const armies = tradeValue(s.cardSetCount);
      player.reinforcementsPending += armies;
      // Classic rule: the first traded card showing a territory you own puts
      // 2 extra armies directly on that territory.
      let bonusTerritory: TerritoryCode | null = null;
      for (const card of traded) {
        if (card.territory && s.territories[card.territory].owner === playerId) {
          bonusTerritory = card.territory;
          s.territories[card.territory].troops += 2;
          break;
        }
      }
      events.push({
        type: "cardsTraded",
        playerId,
        cardIds: [...action.cardIds],
        armies,
        bonusTerritory,
      });
      break;
    }

    case "attack": {
      const from = s.territories[action.from];
      const to = s.territories[action.to];
      const defenderId = to.owner;
      const rolls: DiceRoll[] = [];
      let captured = false;
      do {
        const roll = resolveRoll(rng, from.troops, to.troops);
        rolls.push(roll);
        from.troops -= roll.attackerLosses;
        to.troops -= roll.defenderLosses;
        if (to.troops === 0) {
          captured = true;
          break;
        }
      } while (action.mode === "fast" && from.troops >= 2);

      events.push({ type: "battle", from: action.from, to: action.to, rolls, captured });

      if (captured) {
        const lastRoll = rolls[rolls.length - 1] as DiceRoll;
        to.owner = playerId;
        s.capturedThisTurn = true;
        // On capture, move in at least as many armies as dice rolled (P1).
        s.pendingAdvance = {
          from: action.from,
          to: action.to,
          minArmies: lastRoll.attacker.length,
        };

        if (ownedCount(s, defenderId) === 0) {
          const defender = s.players.find((p) => p.playerId === defenderId) as PlayerState;
          defender.isEliminated = true;
          const cardsTransferred = defender.cards.length;
          player.cards.push(...defender.cards);
          defender.cards = [];
          events.push({
            type: "playerEliminated",
            playerId: defenderId,
            by: playerId,
            cardsTransferred,
          });
        }

        const alive = s.players.filter((p) => !p.isEliminated);
        if (alive.length === 1) {
          // Last opponent gone: resolve the advance and end the game.
          to.troops = from.troops - 1;
          from.troops = 1;
          s.pendingAdvance = null;
          s.winner = playerId;
          s.phase = "gameOver";
          events.push({ type: "gameOver", winner: playerId });
        }
      }
      break;
    }

    case "advance": {
      s.territories[action.from].troops -= action.armies;
      s.territories[action.to].troops += action.armies;
      s.pendingAdvance = null;
      events.push({ type: "advanced", from: action.from, to: action.to, armies: action.armies });
      break;
    }

    case "fortify": {
      s.territories[action.from].troops -= action.armies;
      s.territories[action.to].troops += action.armies;
      events.push({ type: "fortified", from: action.from, to: action.to, armies: action.armies });
      // One tactical move, then the turn ends (FSM: Fortify -> Check conditions).
      endTurn(s, events, rng);
      break;
    }

    case "endPhase": {
      if (s.phase === "reinforce") {
        s.phase = "attack";
        events.push({ type: "phaseChanged", phase: "attack" });
      } else if (s.phase === "attack") {
        s.phase = "fortify";
        events.push({ type: "phaseChanged", phase: "fortify" });
      } else {
        endTurn(s, events, rng);
      }
      break;
    }
  }

  s.rngDraws = rng.drawCount;
  s.log = [
    ...previousLog,
    {
      seq: previousLog.length,
      playerId,
      action,
      events: JSON.parse(JSON.stringify(events)) as GameEvent[],
    },
  ];
  return { ok: true, state: s, events };
}

/** FSM "check conditions": card award, win check, then pass the turn. */
function endTurn(s: GameState, events: GameEvent[], rng: Rng): void {
  const player = s.players.find((p) => p.playerId === s.currentTurnPlayer) as PlayerState;

  if (s.capturedThisTurn) {
    const card = drawCard(s.deck, rng);
    if (card) {
      player.cards.push(card);
      events.push({ type: "cardAwarded", playerId: player.playerId, cardId: card.id });
    }
  }

  if (objectiveMet(s, player.playerId)) {
    s.winner = player.playerId;
    s.phase = "gameOver";
    events.push({ type: "gameOver", winner: player.playerId });
    return;
  }

  s.capturedThisTurn = false;
  const next = nextAlivePlayer(s, player.playerId);
  s.currentTurnPlayer = next.playerId;
  s.turnNumber += 1;
  next.reinforcementsPending = computeReinforcements(s, next.playerId);
  s.phase = "reinforce";
  events.push({
    type: "turnStarted",
    playerId: next.playerId,
    turnNumber: s.turnNumber,
    reinforcements: next.reinforcementsPending,
  });
}
