import { jsonError, readJson, requireUser, toResponse, unauthorized } from "@/lib/api";
import { joinGame } from "@/lib/games";
import { joinGameSchema } from "@/lib/validation";

/** POST /api/games/:id/join — join a lobby (invite code for private games). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthorized();
  const parsed = joinGameSchema.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return jsonError(400, "INVALID_BODY", "Invalid request.");
  const { gameId } = await params;
  return toResponse(await joinGame(user.id, gameId, parsed.data.inviteCode));
}
