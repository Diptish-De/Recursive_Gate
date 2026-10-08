import { resetDb } from "@/lib/db";

// Put the demo back to its starting state between rehearsals.
export function POST() {
  resetDb();
  return Response.json({ ok: true });
}
