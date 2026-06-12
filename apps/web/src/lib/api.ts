import { auth } from "@/auth";
import type { ServiceResult } from "./games";

export async function requireUser(): Promise<{ id: string } | null> {
  const session = await auth();
  const id = session?.user.id;
  return id ? { id } : null;
}

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function unauthorized(): Response {
  return jsonError(401, "UNAUTHORIZED", "Sign in to continue.");
}

export function toResponse<T>(result: ServiceResult<T>): Response {
  if (!result.ok) return jsonError(result.status, result.code, result.message);
  return Response.json(result.data);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    return null;
  }
}
