import { jsonError, readJson, requireUser, toResponse, unauthorized } from "@/lib/api";
import { createLobby, listMyGames } from "@/lib/games";
import { createGameSchema } from "@/lib/validation";

/** GET /api/games — the viewer's games ("your games" dashboard, P2). */
export async function GET(): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthorized();
  return toResponse(await listMyGames(user.id));
}

/** POST /api/games — create a lobby. */
export async function POST(req: Request): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthorized();
  const parsed = createGameSchema.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) {
    return jsonError(400, "INVALID_BODY", parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  return toResponse(await createLobby(user.id, parsed.data));
}
