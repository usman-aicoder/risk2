/**
 * API payload validation (P4): requests are parsed with zod before they reach
 * the engine; the engine then re-validates everything against the rules
 * (unknown territory codes, phase, actor, amounts).
 */

import type { Action } from "@risk2/engine";
import { CONTINENT_CODES } from "@risk2/engine";
import { z } from "zod";

const territory = z.string().min(1).max(64);
const armies = z.number().int().min(1).max(10_000);

export const actionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("reinforce"), territory, armies }),
  z.strictObject({ type: z.literal("tradeCards"), cardIds: z.array(z.string().max(64)).length(3) }),
  z.strictObject({
    type: z.literal("attack"),
    from: territory,
    to: territory,
    mode: z.enum(["single", "fast"]),
  }),
  z.strictObject({ type: z.literal("advance"), from: territory, to: territory, armies }),
  z.strictObject({ type: z.literal("fortify"), from: territory, to: territory, armies }),
  z.strictObject({ type: z.literal("endPhase") }),
]);

export function parseAction(input: unknown): Action | null {
  const result = actionSchema.safeParse(input);
  // Territory strings are narrowed to real codes by the engine's validator.
  return result.success ? (result.data as Action) : null;
}

export const objectiveSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("domination") }),
  z.strictObject({ kind: z.literal("territories"), count: z.number().int().min(10).max(42) }),
  z.strictObject({
    kind: z.literal("continents"),
    continents: z.array(z.enum(CONTINENT_CODES)).min(1).max(6),
  }),
]);

export const createGameSchema = z.object({
  mode: z.enum(["live", "async"]).default("async"),
  maxPlayers: z.number().int().min(2).max(6).default(6),
  isPrivate: z.boolean().default(false),
  objective: objectiveSchema.default({ kind: "domination" }),
  /** Async turn clock before auto-skip (P2); 1 hour to 1 week. */
  turnDurationHours: z.number().int().min(1).max(168).default(48),
});

export const joinGameSchema = z.object({
  inviteCode: z.string().min(1).max(32).optional(),
});

export const addAiSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
});

export const removeAiSchema = z.object({
  playerId: z.string().min(1).max(64),
});

export type CreateGameInput = z.infer<typeof createGameSchema>;
