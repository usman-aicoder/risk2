import { jsonError, readJson, requireUser, toResponse, unauthorized } from "@/lib/api";
import { addAiPlayer, removeAiPlayer } from "@/lib/games";
import { addAiSchema, removeAiSchema } from "@/lib/validation";

/** POST /api/games/:id/ai — creator adds a bot to the lobby (Spec §4.4). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthorized();
  const parsed = addAiSchema.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return jsonError(400, "INVALID_BODY", "Invalid request.");
  const { gameId } = await params;
  return toResponse(await addAiPlayer(user.id, gameId, parsed.data.difficulty));
}

/** DELETE /api/games/:id/ai — creator removes a bot from the lobby. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthorized();
  const parsed = removeAiSchema.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "INVALID_BODY", "Invalid request.");
  const { gameId } = await params;
  return toResponse(await removeAiPlayer(user.id, gameId, parsed.data.playerId));
}
