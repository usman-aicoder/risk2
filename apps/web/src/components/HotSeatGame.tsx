"use client";

/**
 * Hot-seat play: the full engine runs in the browser, the device is passed
 * around, and each player sees their own redacted view. Seats can be humans
 * or AI bots (Spec §4.4) — bots play automatically with a short delay.
 */

import type { Action, BotDifficulty, GameState, PlayerColor } from "@risk2/engine";
import { applyAction, chooseBotAction, createGame } from "@risk2/engine";
import { useEffect, useRef, useState } from "react";
import { PLAYER_COLOR_HEX } from "@/lib/mapLayout";
import { redactState } from "@/lib/redact";
import type { ActResult } from "./GameClient";
import { GameClient } from "./GameClient";

const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow", "purple", "black"];

type SeatKind = "human" | BotDifficulty;

interface Seat {
  name: string;
  kind: SeatKind;
}

export interface HotSeatGameProps {
  /** Preset seats + seed for the tutorial; omit for the normal setup form. */
  preset?: { seats: Seat[]; seed: number };
  banner?: (state: GameState) => React.ReactNode;
}

export function HotSeatGame({ preset, banner }: HotSeatGameProps) {
  const [seats, setSeats] = useState<Seat[]>(
    preset?.seats ?? [
      { name: "Player 1", kind: "human" },
      { name: "Player 2", kind: "human" },
    ],
  );
  const [state, setState] = useState<GameState | null>(null);
  // Sequential submissions (e.g. several staged placements) must each apply
  // to the latest state, not a stale closure.
  const stateRef = useRef<GameState | null>(null);
  const difficulties = useRef<Map<string, BotDifficulty>>(new Map());

  const setGame = (next: GameState | null) => {
    stateRef.current = next;
    setState(next);
  };

  const start = (config: Seat[], seed: number) => {
    difficulties.current = new Map(
      config.map((seat, i) => [`p${i}`, seat.kind === "human" ? "easy" : seat.kind]),
    );
    setGame(
      createGame({
        gameId: "hotseat",
        mode: "live",
        rngSeed: seed,
        players: config.map((seat, i) => ({
          id: `p${i}`,
          name: seat.name.trim() || `Player ${i + 1}`,
          color: COLORS[i] as PlayerColor,
          type: seat.kind === "human" ? "human" : "ai",
        })),
      }),
    );
  };

  const presetStarted = useRef(false);
  useEffect(() => {
    if (preset && !presetStarted.current) {
      presetStarted.current = true;
      start(preset.seats, preset.seed);
    }
  });

  // Bots take their turns automatically, one action at a time.
  useEffect(() => {
    if (!state || state.phase === "gameOver") return;
    const current = state.players.find((p) => p.playerId === state.currentTurnPlayer);
    if (current?.type !== "ai") return;
    const timer = setTimeout(() => {
      const latest = stateRef.current;
      if (!latest || latest.phase === "gameOver") return;
      const difficulty = difficulties.current.get(latest.currentTurnPlayer) ?? "medium";
      const action = chooseBotAction(latest, latest.currentTurnPlayer, difficulty);
      const result = applyAction(latest, latest.currentTurnPlayer, action);
      if (result.ok) setGame(result.state);
    }, 450);
    return () => clearTimeout(timer);
  }, [state]);

  if (!state) {
    if (preset) return null; // starting via effect
    return (
      <main className="page">
        <h1>Hot-seat game</h1>
        <p className="muted">
          2–6 players on one device — humans pass it around; bots play themselves.
        </p>
        <div className="panel">
          {seats.map((seat, i) => (
            <div className="row" key={i} style={{ marginBottom: 8 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  background: PLAYER_COLOR_HEX[COLORS[i] as string],
                }}
              />
              <input
                value={seat.name}
                onChange={(e) =>
                  setSeats((all) =>
                    all.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)),
                  )
                }
              />
              <select
                value={seat.kind}
                onChange={(e) =>
                  setSeats((all) =>
                    all.map((s, j) => (j === i ? { ...s, kind: e.target.value as SeatKind } : s)),
                  )
                }
              >
                <option value="human">Human</option>
                <option value="easy">Easy bot</option>
                <option value="medium">Medium bot</option>
                <option value="hard">Hard bot</option>
              </select>
              {seats.length > 2 && i === seats.length - 1 ? (
                <button onClick={() => setSeats((all) => all.slice(0, -1))}>Remove</button>
              ) : null}
            </div>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <button
              disabled={seats.length >= 6}
              onClick={() =>
                setSeats((all) => [...all, { name: `Player ${all.length + 1}`, kind: "medium" }])
              }
            >
              + Add player
            </button>
            <button
              className="primary"
              disabled={!seats.some((s) => s.kind === "human")}
              onClick={() => start(seats, Math.floor(Math.random() * 0xffffffff) >>> 0)}
            >
              Start game
            </button>
          </div>
        </div>
        <p>
          <a href="/">← Back</a>
        </p>
      </main>
    );
  }

  const current = state.players.find((p) => p.playerId === state.currentTurnPlayer);
  const currentIsBot = current?.type === "ai";
  // Bots get no controls: spectate while they think.
  const view = redactState(state, currentIsBot ? null : state.currentTurnPlayer);

  const onAction = (action: Action): Promise<ActResult> => {
    const latest = stateRef.current ?? state;
    const result = applyAction(latest, latest.currentTurnPlayer, action);
    if (!result.ok) {
      return Promise.resolve({ ok: false, error: result.message });
    }
    setGame(result.state);
    return Promise.resolve({ ok: true, events: result.events });
  };

  return (
    <GameClient
      view={view}
      onAction={onAction}
      onRestart={() => setGame(null)}
      banner={
        banner?.(state) ?? (
          <div
            className="hud-banner"
            style={{ borderLeft: `6px solid ${PLAYER_COLOR_HEX[current?.color ?? "black"]}` }}
          >
            {currentIsBot
              ? `🤖 ${current?.displayName} is thinking…`
              : `${current?.displayName}'s turn — pass the device!`}
          </div>
        )
      }
    />
  );
}
