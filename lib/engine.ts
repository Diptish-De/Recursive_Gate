import { rules } from "./rules";
import type { Facts, GatedTool, RuleResult, Verdict } from "./types";

// Runs every rule that applies to the tool and turns the results into one verdict.
// All rules always run (no early exit), so the proof is complete even when something fails.
//
// Precedence: any failed BLOCK rule -> BLOCK.
//             else any failed ESCALATE rule -> ESCALATE.
//             else -> ALLOW.
export function evaluate(tool: GatedTool, facts: Facts): { verdict: Verdict; results: RuleResult[] } {
  const results = rules
    .filter((r) => r.appliesTo.includes(tool) || r.appliesTo.includes("all"))
    .map((r) => ({ rule: r.id, onFail: r.onFail, ...r.check(facts) }));

  const failed = results.filter((r) => !r.pass);
  const verdict: Verdict =
    failed.some((r) => r.onFail === "BLOCK") ? "BLOCK"
    : failed.some((r) => r.onFail === "ESCALATE") ? "ESCALATE"
    : "ALLOW";

  return { verdict, results };
}
