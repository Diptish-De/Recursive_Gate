import { connection } from "next/server";
import { db } from "@/lib/db";

// The audit trail and pending queue, for the Proof Panel.
export async function GET() {
  // Cache Components is on: without this, the build would prerender a frozen, empty snapshot.
  await connection();
  return Response.json({ audit: db.audit, pending: db.pending, customers: db.customers });
}
