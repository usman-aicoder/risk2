"use client";

/**
 * A server game: lobby (join / invite / start) and live play against the
 * authoritative API. Light polling keeps async games fresh until Phase 4
 * adds push diffs.
 */

import type { Action } from "@risk2/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameView } from "@/lib/games";
import type { ActResult } from "./GameClient";
import { GameClient } from "./GameClient";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function GameRoom({ gameId }: { gameId: string }) {
  const [data, setData] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState("medium");
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    const res = await fetch(`/api/games/${gameId}`, { cache: "no-store" });
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    setData((await res.json()) as GameView);
  }, [gameId]);

  // Realtime: subscribe to the game's Pusher channel and refetch the
  // redacted view on every "update" signal (P2). Falls back to fast polling
  // when realtime is not configured.
  const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), pusherKey ? 60_000 : 5_000);
    return () => clearInterval(interval);
  }, [refresh, pusherKey]);

  useEffect(() => {
    if (!pusherKey || !pusherCluster) return;
    let disconnect = () => {};
    let cancelled = false;
    void import("pusher-js").then(({ default: Pusher }) => {
      if (cancelled) return;
      const pusher = new Pusher(pusherKey, { cluster: pusherCluster });
      const channel = pusher.subscribe(`game-${gameId}`);
      channel.bind("update", () => void refresh());
      disconnect = () => pusher.disconnect();
    });
    return () => {
      cancelled = true;
      disconnect();
    };
  }, [gameId, refresh, pusherKey, pusherCluster]);

  const send = async (
    method: "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<boolean> => {
    setBusy(true);
    busyRef.current = true;
    try {
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        setError(await readError(res));
        return false;
      }
      return true;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };
  const post = (path: string, body?: unknown) => send("POST", path, body);
  const del = (path: string, body?: unknown) => send("DELETE", path, body);

  const onAction = async (action: Action): Promise<ActResult> => {
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch(`/api/games/${gameId}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!res.ok) return { ok: false, error: await readError(res) };
      const payload = (await res.json()) as {
        events: NonNullable<ActResult["events"]>;
        view: Extract<GameView, { status: "active" | "finished" }>["view"];
      };
      setData((prev) =>
        prev && prev.status !== "lobby"
          ? { ...prev, status: payload.view.winner ? "finished" : "active", view: payload.view }
          : prev,
      );
      return { ok: true, events: payload.events };
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };

  if (error && !data) {
    return (
      <main className="page">
        <div className="panel">{error}</div>
        <a href="/">← Back</a>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="page">
        <p className="muted">Loading game…</p>
      </main>
    );
  }

  if (data.status === "lobby") {
    const inviteUrl =
      typeof window !== "undefined" && data.inviteCode
        ? `${window.location.origin}/games/${gameId}?invite=${data.inviteCode}`
        : null;
    const inviteFromUrl =
      typeof window !== "undefined"
        ? (new URLSearchParams(window.location.search).get("invite") ?? undefined)
        : undefined;
    return (
      <main className="page">
        <h1>Game lobby</h1>
        <div className="panel">
          <h3>
            Players ({data.players.length}/{data.maxPlayers})
          </h3>
          {data.players.map((p) => (
            <div className="player-chip" key={p.playerId}>
              <span className="swatch" style={{ background: `var(--${p.color}, #888)` }} />
              {p.type === "ai" ? "🤖 " : ""}
              {p.displayName}
              {data.youAreCreator && p.type === "ai" ? (
                <button
                  style={{ marginLeft: "auto", padding: "2px 8px" }}
                  disabled={busy}
                  onClick={() =>
                    void del(`/api/games/${gameId}/ai`, { playerId: p.playerId }).then(
                      (ok) => ok && void refresh(),
                    )
                  }
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
          {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
          {data.youAreCreator && data.players.length < data.maxPlayers ? (
            <div className="row" style={{ marginTop: 10 }}>
              <select value={aiDifficulty} onChange={(e) => setAiDifficulty(e.target.value)}>
                <option value="easy">Easy bot</option>
                <option value="medium">Medium bot</option>
                <option value="hard">Hard bot</option>
              </select>
              <button
                disabled={busy}
                onClick={() =>
                  void post(`/api/games/${gameId}/ai`, { difficulty: aiDifficulty }).then(
                    (ok) => ok && void refresh(),
                  )
                }
              >
                + Add AI opponent
              </button>
            </div>
          ) : null}
          <div className="row" style={{ marginTop: 12 }}>
            {!data.youJoined ? (
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void post(`/api/games/${gameId}/join`, { inviteCode: inviteFromUrl }).then(
                    (ok) => ok && void refresh(),
                  )
                }
              >
                Join game
              </button>
            ) : null}
            {data.youAreCreator ? (
              <button
                className="primary"
                disabled={busy || data.players.length < 2}
                title={data.players.length < 2 ? "Risk needs at least 2 players" : ""}
                onClick={() =>
                  void post(`/api/games/${gameId}/start`).then((ok) => ok && void refresh())
                }
              >
                Start game
              </button>
            ) : null}
          </div>
          {inviteUrl ? (
            <p className="muted" style={{ marginTop: 14, wordBreak: "break-all" }}>
              Invite link:{" "}
              <a
                href={inviteUrl}
                onClick={(e) => {
                  e.preventDefault();
                  void navigator.clipboard.writeText(inviteUrl);
                }}
                title="Click to copy"
              >
                {inviteUrl}
              </a>
            </p>
          ) : null}
        </div>
        <a href="/">← Back</a>
      </main>
    );
  }

  return <GameClient view={data.view} onAction={onAction} />;
}
