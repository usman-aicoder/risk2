"use client";

/**
 * Hot-seat play: the full engine runs in the browser, the device is passed
 * around, and each player sees their own redacted view. No account or
 * network needed — also the quickest way to playtest the rules end to end.
 */

import type { Action, GameState, PlayerColor } from "@risk2/engine";
import { applyAction, createGame } from "@risk2/engine";
import { useRef, useState } from "react";
import { PLAYER_COLOR_HEX } from "@/lib/mapLayout";
import { redactState } from "@/lib/redact";
import type { ActResult } from "./GameClient";
import { GameClient } from "./GameClient";

const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow", "purple", "black"];

export function HotSeatGame() {
  const [names, setNames] = useState<string[]>(["Player 1", "Player 2"]);
  const [state, setState] = useState<GameState | null>(null);
  // Sequentially submitted actions (e.g. confirming several staged
  // placements) must each apply to the latest state, not a stale closure.
  const stateRef = useRef<GameState | null>(null);

  const setGame = (next: GameState | null) => {
    stateRef.current = next;
    setState(next);
  };

  const start = () => {
    const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    setGame(
      createGame({
        gameId: "hotseat",
        mode: "live",
        rngSeed: seed,
        players: names.map((name, i) => ({
          id: `p${i}`,
          name: name.trim() || `Player ${i + 1}`,
          color: COLORS[i] as PlayerColor,
          type: "human",
        })),
      }),
    );
  };

  if (!state) {
    return (
      <main className="page">
        <h1>Hot-seat game</h1>
        <p className="muted">2–6 players on one device. Pass it around between turns.</p>
        <div className="panel">
          {names.map((name, i) => (
            <div className="row" key={i} style={{ marginBottom: 8 }}>
              <span
                className="swatch"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  background: PLAYER_COLOR_HEX[COLORS[i] as string],
                }}
              />
              <input
                value={name}
                onChange={(e) => setNames((n) => n.map((v, j) => (j === i ? e.target.value : v)))}
              />
              {names.length > 2 && i === names.length - 1 ? (
                <button onClick={() => setNames((n) => n.slice(0, -1))}>Remove</button>
              ) : null}
            </div>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <button
              disabled={names.length >= 6}
              onClick={() => setNames((n) => [...n, `Player ${n.length + 1}`])}
            >
              + Add player
            </button>
            <button className="primary" onClick={start}>
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
  const view = redactState(state, state.currentTurnPlayer);

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
        <div
          className="hud-banner"
          style={{
            borderLeft: `6px solid ${PLAYER_COLOR_HEX[current?.color ?? "black"]}`,
          }}
        >
          {current?.displayName}&apos;s turn — pass the device!
        </div>
      }
    />
  );
}
