import { describe, expect, it } from "vitest";
import { createRng } from "../src/rng.js";

describe("createRng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("replays from a draw offset (action-log fast-forward)", () => {
    const full = createRng(99);
    for (let i = 0; i < 50; i++) full.next();
    const replayed = createRng(99, 50);
    for (let i = 0; i < 20; i++) {
      expect(replayed.next()).toBe(full.next());
    }
  });

  it("tracks drawCount across all draw methods", () => {
    const rng = createRng(7);
    rng.next();
    rng.rollDie();
    rng.rollDice(3);
    expect(rng.drawCount).toBe(5);
  });

  it("rolls dice in [1, 6], sorted descending", () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const dice = rng.rollDice(3);
      expect(dice).toHaveLength(3);
      for (const d of dice) {
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(6);
      }
      expect([...dice].sort((a, b) => b - a)).toEqual(dice);
    }
  });

  it("distributes die faces roughly uniformly", () => {
    const rng = createRng(2026);
    const counts = new Map<number, number>();
    const n = 60_000;
    for (let i = 0; i < n; i++) {
      const face = rng.rollDie();
      counts.set(face, (counts.get(face) ?? 0) + 1);
    }
    for (let face = 1; face <= 6; face++) {
      const freq = (counts.get(face) ?? 0) / n;
      // expected 1/6 ≈ 0.1667; allow ±2% absolute
      expect(freq).toBeGreaterThan(0.1467);
      expect(freq).toBeLessThan(0.1867);
    }
  });
});
