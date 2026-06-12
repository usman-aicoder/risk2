import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Lazy so that builds and tests that never touch the DB don't need
// DATABASE_URL at import time.
function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

let instance: ReturnType<typeof create> | null = null;

export function getDb(): ReturnType<typeof create> {
  instance ??= create();
  return instance;
}

export type Db = ReturnType<typeof getDb>;
