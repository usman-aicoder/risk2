import { requireUser, toResponse, unauthorized } from "@/lib/api";
import { startGame } from "@/lib/games";

/** POST /api/games/:id/start — creator deals territories and begins play. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { gameId } = await params;
  return toResponse(await startGame(user.id, gameId));
}
