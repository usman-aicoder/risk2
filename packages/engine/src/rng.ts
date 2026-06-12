/**
 * Seeded, auditable PRNG (P4: fair server).
 *
 * Every dice roll in a game derives from the game's rngSeed plus the count of
 * rolls already made, so any battle can be replayed exactly from the action
 * log. mulberry32 is deterministic across platforms (32-bit integer math).
 */

export interface Rng {
  /** Float in [0, 1), like Math.random(). */
  next(): number;
  /** Integer in [1, 6]. */
  rollDie(): number;
  /** `count` dice sorted descending, as Risk combat compares them. */
  rollDice(count: number): number[];
  /** Number of values drawn so far; persisted so replays can fast-forward. */
  readonly drawCount: number;
}

export function createRng(seed: number, skip = 0): Rng {
  let state = seed >>> 0;
  let drawCount = 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    drawCount++;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < skip; i++) next();
  drawCount = skip;

  return {
    next,
    rollDie: () => Math.floor(next() * 6) + 1,
    rollDice(count: number): number[] {
      const dice: number[] = [];
      for (let i = 0; i < count; i++) dice.push(this.rollDie());
      return dice.sort((a, b) => b - a);
    },
    get drawCount() {
      return drawCount;
    },
  };
}

/** Deterministic Fisher–Yates shuffle driven by the seeded RNG. */
export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items;
}
