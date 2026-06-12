import { describe, expect, it } from "vitest";
import { attackerDiceCount, defenderDiceCount, resolveRoll } from "../src/combat.js";
import { createRng } from "../src/rng.js";
import type { Rng } from "../src/rng.js";

/** Rng stub that returns scripted (pre-sorted) dice arrays. */
function scriptedRng(rolls: number[][]): Rng {
  let i = 0;
  return {
    next: () => 0,
    rollDie: () => 1,
    rollDice: () => rolls[i++] as number[],
    drawCount: 0,
  };
}

describe("dice counts (P1)", () => {
  it("attacker rolls min(3, troops - 1)", () => {
    expect(attackerDiceCount(2)).toBe(1);
    expect(attackerDiceCount(3)).toBe(2);
    expect(attackerDiceCount(4)).toBe(3);
    expect(attackerDiceCount(10)).toBe(3);
  });
  it("defender rolls min(2, troops)", () => {
    expect(defenderDiceCount(1)).toBe(1);
    expect(defenderDiceCount(2)).toBe(2);
    expect(defenderDiceCount(9)).toBe(2);
  });
});

describe("roll resolution (P1: defender wins ties)", () => {
  it("defender wins ties", () => {
    const roll = resolveRoll(
      scriptedRng([
        [6, 4],
        [6, 4],
      ]),
      3,
      2,
    );
    expect(roll.attackerLosses).toBe(2);
    expect(roll.defenderLosses).toBe(0);
  });

  it("compares highest vs highest, second vs second", () => {
    const roll = resolveRoll(
      scriptedRng([
        [6, 3, 2],
        [5, 4],
      ]),
      4,
      5,
    );
    expect(roll.defenderLosses).toBe(1); // 6 > 5
    expect(roll.attackerLosses).toBe(1); // 3 <= 4
  });

  it("only compares as many pairs as the smaller side rolled", () => {
    const roll = resolveRoll(scriptedRng([[6, 6, 6], [1]]), 10, 1);
    expect(roll.defenderLosses).toBe(1);
    expect(roll.attackerLosses).toBe(0);
  });
});

describe("combat odds match the standard Risk dice tables (Spec §6.1)", () => {
  // Exact single-roll probabilities from enumerating all dice outcomes.
  const N = 300_000;
  const TOLERANCE = 0.008; // ~9 standard errors at N=300k

  it("3 attackers vs 2 defenders", () => {
    const rng = createRng(20260612);
    const outcomes = { def2: 0, split: 0, att2: 0 };
    for (let i = 0; i < N; i++) {
      const roll = resolveRoll(rng, 10, 10);
      if (roll.defenderLosses === 2) outcomes.def2++;
      else if (roll.defenderLosses === 1) outcomes.split++;
      else outcomes.att2++;
    }
    expect(Math.abs(outcomes.def2 / N - 2890 / 7776)).toBeLessThan(TOLERANCE); // ≈ 0.3717
    expect(Math.abs(outcomes.split / N - 2611 / 7776)).toBeLessThan(TOLERANCE); // ≈ 0.3358
    expect(Math.abs(outcomes.att2 / N - 2275 / 7776)).toBeLessThan(TOLERANCE); // ≈ 0.2926
  });

  it("1 attacker vs 1 defender", () => {
    const rng = createRng(777);
    let attackerWins = 0;
    for (let i = 0; i < N; i++) {
      const roll = resolveRoll(rng, 2, 1);
      if (roll.defenderLosses === 1) attackerWins++;
    }
    expect(Math.abs(attackerWins / N - 15 / 36)).toBeLessThan(TOLERANCE); // ≈ 0.4167
  });

  it("2 attackers vs 2 defenders", () => {
    const rng = createRng(31337);
    const outcomes = { def2: 0, split: 0, att2: 0 };
    for (let i = 0; i < N; i++) {
      const roll = resolveRoll(rng, 3, 10);
      if (roll.defenderLosses === 2) outcomes.def2++;
      else if (roll.defenderLosses === 1) outcomes.split++;
      else outcomes.att2++;
    }
    expect(Math.abs(outcomes.def2 / N - 295 / 1296)).toBeLessThan(TOLERANCE); // ≈ 0.2276
    expect(Math.abs(outcomes.split / N - 420 / 1296)).toBeLessThan(TOLERANCE); // ≈ 0.3241
    expect(Math.abs(outcomes.att2 / N - 581 / 1296)).toBeLessThan(TOLERANCE); // ≈ 0.4483
  });
});
