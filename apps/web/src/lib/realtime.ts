/**
 * Realtime updates (P2): after every applied action the server publishes a
 * tiny "something changed" signal on the game's Pusher channel. Clients then
 * refetch their own redacted view over the API — no game data (and certainly
 * nothing hidden) ever travels through the shared channel (P4).
 *
 * No-ops when Pusher env vars are absent (local dev, CI, polling fallback).
 */

import Pusher from "pusher";

export interface GameUpdateSignal {
  version: number;
  status: "active" | "finished";
  currentTurnPlayer: string | null;
  turnNumber: number | null;
}

let client: Pusher | null | undefined;

function getPusher(): Pusher | null {
  if (client !== undefined) return client;
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  client =
    PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET && PUSHER_CLUSTER
      ? new Pusher({
          appId: PUSHER_APP_ID,
          key: PUSHER_KEY,
          secret: PUSHER_SECRET,
          cluster: PUSHER_CLUSTER,
        })
      : null;
  return client;
}

export function gameChannel(gameId: string): string {
  return `game-${gameId}`;
}

export async function publishGameUpdate(gameId: string, signal: GameUpdateSignal): Promise<void> {
  const pusher = getPusher();
  if (!pusher) return;
  try {
    await pusher.trigger(gameChannel(gameId), "update", signal);
  } catch (error) {
    console.error("pusher publish failed", error);
  }
}
