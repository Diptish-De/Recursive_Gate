import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { checkClaims } from "@/lib/claims";
import { getCustomer } from "@/lib/db";

const body = z.object({
  customerId: z.string(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1),
});

// One chat turn: run the agent (every action goes through the gate), then fact-check its reply.
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { customerId, messages } = parsed.data;
  if (!getCustomer(customerId)) return Response.json({ error: `Unknown customer ${customerId}` }, { status: 400 });

  try {
    const { reply, decisions, toolCalls, model } = await runAgent(customerId, messages);
    // The claim checker is a bonus layer: if it fails, the chat still works.
    const claims = await checkClaims(reply, customerId).catch((err) => {
      console.error("claim checker failed:", err);
      return null;
    });
    return Response.json({ reply, decisions, claims, toolCalls, model });
  } catch (err) {
    console.error("agent failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `The AI service failed: ${message}` }, { status: 502 });
  }
}
