/**
 * Dice combat (P1: exact classic odds).
 *
 * Attacker rolls up to 3 dice (needs one more troop than dice); defender rolls
 * up to 2. Dice are compared highest vs highest; the defender wins ties.
 */

import type { Rng } from "./rng.js";

export interface DiceRoll {
  attacker: number[];
  defender: number[];
  attackerLosses: number;
  defenderLosses: number;
}

export function attackerDiceCount(attackerTroops: number): number {
  return Math.min(3, attackerTroops - 1);
}

export function defenderDiceCount(defenderTroops: number): number {
  return Math.min(2, defenderTroops);
}

/** Resolve one roll of a battle. Caller applies the losses to state. */
export function resolveRoll(rng: Rng, attackerTroops: number, defenderTroops: number): DiceRoll {
  const attacker = rng.rollDice(attackerDiceCount(attackerTroops));
  const defender = rng.rollDice(defenderDiceCount(defenderTroops));
  let attackerLosses = 0;
  let defenderLosses = 0;
  const pairs = Math.min(attacker.length, defender.length);
  for (let i = 0; i < pairs; i++) {
    // dice arrive sorted descending; defender wins ties (P1)
    if ((attacker[i] as number) > (defender[i] as number)) defenderLosses++;
    else attackerLosses++;
  }
  return { attacker, defender, attackerLosses, defenderLosses };
}
