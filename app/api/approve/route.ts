import { z } from "zod";
import { review } from "@/lib/gate";

const body = z.object({ pendingId: z.string(), approve: z.boolean() });

// The human reviewer approves or rejects an ESCALATEd action.
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });

  try {
    const { pending, decision } = review(parsed.data.pendingId, parsed.data.approve);
    return Response.json({ pending, decision });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
