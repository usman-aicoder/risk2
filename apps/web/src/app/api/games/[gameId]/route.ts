import { requireUser, toResponse } from "@/lib/api";
import { getGameView } from "@/lib/games";

/** GET /api/games/:id — redacted per-viewer game view (P4). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  const user = await requireUser();
  const { gameId } = await params;
  return toResponse(await getGameView(user?.id ?? null, gameId));
}
