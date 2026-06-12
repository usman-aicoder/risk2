/**
 * The notify-when-it's-your-turn loop (P2): email via Resend and Web Push
 * via VAPID. Both are best-effort and no-op without configuration; failures
 * never affect the game action that triggered them.
 */

import { eq } from "drizzle-orm";
import webpush from "web-push";
import { getDb } from "@/db";
import { pushSubscriptions, users } from "@/db/schema";

export interface TurnNotification {
  userId: string;
  gameId: string;
  gameLabel: string;
  title: string;
  body: string;
}

function appUrl(): string {
  return process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

let vapidReady: boolean | undefined;

function ensureVapid(): boolean {
  if (vapidReady !== undefined) return vapidReady;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject =
    process.env.VAPID_SUBJECT ?? `mailto:${process.env.EMAIL_FROM ?? "ops@example.com"}`;
  if (pub && priv) {
    webpush.setVapidDetails(subject, pub, priv);
    vapidReady = true;
  } else {
    vapidReady = false;
  }
  return vapidReady;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
  } catch (error) {
    console.error("turn email failed", error);
  }
}

async function sendPush(userId: string, payload: string): Promise<void> {
  if (!ensureVapid()) return;
  const db = getDb();
  const subs = await db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.userId, userId),
  });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (error) {
        // 404/410 mean the browser dropped the subscription — clean it up.
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        }
      }
    }),
  );
}

export async function notifyUser(notification: TurnNotification): Promise<void> {
  const db = getDb();
  const url = `${appUrl()}/games/${notification.gameId}`;
  const pushPayload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url,
  });

  const user = await db.query.users.findFirst({ where: eq(users.id, notification.userId) });
  await Promise.all([
    sendPush(notification.userId, pushPayload),
    user?.email
      ? sendEmail(
          user.email,
          notification.title,
          `<p>${notification.body}</p><p><a href="${url}">Open the game</a></p>` +
            `<p style="color:#888;font-size:12px">Risk II Online — async play (P2): take your turn whenever suits you.</p>`,
        )
      : Promise.resolve(),
  ]);
}
