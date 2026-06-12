import { jsonError } from "@/lib/api";
import { sweepExpiredTurns } from "@/lib/games";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/deadlines — Vercel Cron target (P2): auto-skips expired
 * async turns. Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError(401, "UNAUTHORIZED", "Invalid cron secret.");
  }
  const result = await sweepExpiredTurns();
  if (!result.ok) return jsonError(result.status, result.code, result.message);
  return Response.json(result.data);
}
