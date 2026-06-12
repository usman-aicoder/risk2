import { jsonError, readJson, requireUser, toResponse, unauthorized } from "@/lib/api";
import { performAction } from "@/lib/games";
import { parseAction } from "@/lib/validation";

/**
 * POST /api/games/:id/actions — the authoritative action endpoint (P4).
 * Body: one engine Action. The server validates, applies, persists, and
 * returns the events plus the viewer's redacted state.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthorized();
  const action = parseAction(await readJson(req));
  if (!action) return jsonError(400, "INVALID_ACTION", "Unrecognized action payload.");
  const { gameId } = await params;
  return toResponse(await performAction(user.id, gameId, action));
}
