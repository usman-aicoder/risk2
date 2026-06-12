"use client";

/**
 * Opt in to browser push for the "your turn" loop (P2). Renders nothing when
 * push is unsupported or VAPID is not configured.
 */

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type Status = "unsupported" | "idle" | "enabled" | "denied" | "busy";

export function EnableNotifications() {
  const [status, setStatus] = useState<Status>("unsupported");
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    void navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "enabled" : "idle");
    });
  }, [vapidKey]);

  if (status === "unsupported" || !vapidKey) return null;

  const enable = async () => {
    setStatus("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      setStatus(res.ok ? "enabled" : "idle");
    } catch {
      setStatus("idle");
    }
  };

  if (status === "enabled") {
    return <p className="muted">🔔 Turn notifications are on for this browser.</p>;
  }
  if (status === "denied") {
    return <p className="muted">Notifications are blocked in this browser's settings.</p>;
  }
  return (
    <button disabled={status === "busy"} onClick={() => void enable()}>
      🔔 Notify me when it&apos;s my turn
    </button>
  );
}
