"use client";

/** Landing-page widgets: create a game and list your games (P2 dashboard seed). */

import { useEffect, useState } from "react";
import type { GameSummary } from "@/lib/games";

export function CreateGameForm() {
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "async", maxPlayers, isPrivate }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Could not create the game.");
        return;
      }
      const { gameId } = (await res.json()) as { gameId: string };
      window.location.href = `/games/${gameId}`;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3>New online game</h3>
      <div className="row">
        <label>
          Players{" "}
          <select value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                up to {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />{" "}
          Private (invite only)
        </label>
        <button className="primary" disabled={busy} onClick={() => void create()}>
          Create lobby
        </button>
      </div>
      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
    </div>
  );
}

export function MyGames() {
  const [games, setGames] = useState<GameSummary[] | null>(null);

  useEffect(() => {
    void fetch("/api/games", { cache: "no-store" }).then(async (res) => {
      if (res.ok) setGames((await res.json()) as GameSummary[]);
    });
  }, []);

  if (!games) return <p className="muted">Loading your games…</p>;
  if (games.length === 0) return <p className="muted">No games yet — create one above.</p>;

  return (
    <div className="panel">
      <h3>Your games</h3>
      {games.map((g) => (
        <div className="row" key={g.gameId} style={{ padding: "6px 0" }}>
          <a href={`/games/${g.gameId}`}>
            {g.players.map((p) => p.displayName).join(", ") || "Empty lobby"}
          </a>
          <span className="muted">
            {g.status === "lobby"
              ? "waiting for players"
              : g.status === "finished"
                ? "finished"
                : g.isYourTurn
                  ? "your turn!"
                  : `turn ${g.turnNumber ?? "?"}`}
          </span>
          {g.status === "active" && g.isYourTurn && g.turnDeadline ? (
            <span className="muted" style={{ fontSize: 12 }}>
              auto-skips {formatDeadline(g.turnDeadline)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function formatDeadline(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "any moment now";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `in ${Math.floor(hours / 24)} days`;
  if (hours >= 1) return `in ${hours}h`;
  return `in ${Math.max(1, Math.floor(ms / 60_000))}m`;
}
