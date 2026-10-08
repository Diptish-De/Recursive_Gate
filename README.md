# RecursiveGate

**AI agents that cannot break the rules.**

RecursiveGate is a neuro-symbolic safety layer for AI agents. The LLM *proposes* an action
(refund an order, change a payout account). A deterministic rule engine *decides* whether it
is allowed, using facts loaded from the database, never from the conversation. Every decision
comes with a human-readable proof.

| Verdict  | Meaning              | What happens                                 |
| -------- | -------------------- | -------------------------------------------- |
| ALLOW    | All rules pass       | Action runs, proof is logged                 |
| BLOCK    | A hard rule fails    | Action never runs, agent explains why        |
| ESCALATE | A soft limit is hit  | Action waits for a human to Approve / Reject |

Built for RECURSIVE 2026 (ACM Hackathon, GNIT Kolkata), AI & Intelligent Systems track.

## Run it

Requires Node 20+ and a free Gemini API key.

```bash
npm install
cp .env.example .env.local      # then paste your key into .env.local
npm run check:gemini            # confirms the key works and lists usable models
npm run dev                     # open http://localhost:3000
```

## Scripts

| Command                | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `npm run dev`          | Start the app at http://localhost:3000                          |
| `npm test`             | Unit tests for the rules and gate (no LLM, fully deterministic) |
| `npm run check:gemini` | Check the Gemini key and that the model answers                 |
| `npm run check:demo`   | Run the 5 demo scenarios against the running app with the LLM   |
| `npm run build`        | Production build (also type-checks)                             |

## How it works

```
User message
   │
   ▼
LLM agent (Gemini)          understands intent, picks a tool: issue_refund({ orderId, amount })
   │
   ▼
Gate (lib/gate.ts)          every state-changing tool goes through here, no bypass
   │
   ▼
Fact loader (lib/facts.ts)  reads the order and customer from the database by ID
   │                        never trusts anything the LLM says
   ▼
Rule engine (lib/rules.ts,  pure functions R1-R8, all evaluated, one verdict
             lib/engine.ts)
   │
   ├── ALLOW     → action runs, proof logged
   ├── BLOCK     → action never runs, reasons go back to the agent, which explains
   └── ESCALATE  → paused until a human clicks Approve / Reject
   │
   ▼
Claim checker (lib/claims.ts)  LLM extracts factual claims from the reply, code checks them against the DB
   │
   ▼
Reply + Proof Panel (every decision, every rule, the exact numbers)
```

| Rule | Applies to            | Rule                                                 | On fail  |
| ---- | --------------------- | ---------------------------------------------------- | -------- |
| R0   | issue_refund          | order exists                                         | BLOCK    |
| R1   | issue_refund          | amount ≤ order total − earlier refunds               | BLOCK    |
| R2   | issue_refund          | within 30 days of delivery                           | BLOCK    |
| R3   | issue_refund          | order is delivered or cancelled                      | BLOCK    |
| R4   | issue_refund          | not already fully refunded                           | BLOCK    |
| R5   | issue_refund          | amount ≤ ₹50,000                                     | ESCALATE |
| R6   | change_payout_account | KYC verified                                         | BLOCK    |
| R7   | issue_refund          | payout account not changed in last 24h (takeover)    | BLOCK    |
| R8   | all                   | requester owns the order                             | BLOCK    |

A reviewer can approve past an ESCALATE rule, never past a BLOCK rule: hard rules are re-checked
on fresh facts at approval time.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS · Vercel AI SDK + Gemini · Zod · Vitest ·
in-memory mock database.
