import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { jsonError, readJson, requireUser, unauthorized } from "@/lib/api";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

/** POST /api/push/subscribe — register this browser for turn notifications (P2). */
export async function POST(req: Request): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthorized();
  const parsed = subscriptionSchema.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "INVALID_BODY", "Invalid push subscription.");

  const db = getDb();
  await db
    .insert(pushSubscriptions)
    .values({
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: user.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
      },
    });
  return Response.json({ ok: true });
}

/** DELETE /api/push/subscribe — unregister this browser. */
export async function DELETE(req: Request): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthorized();
  const parsed = z.object({ endpoint: z.string().url() }).safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "INVALID_BODY", "Invalid request.");
  const db = getDb();
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, parsed.data.endpoint));
  return Response.json({ ok: true });
}
