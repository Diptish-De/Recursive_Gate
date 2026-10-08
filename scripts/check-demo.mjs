// Runs the 5 demo scenarios against the running app with the real LLM and checks each verdict.
// Start the app first (npm run dev), then: npm run check:demo [-- --runs 3] [-- --url http://localhost:3000]

import scenarios from "../lib/scenarios.json" with { type: "json" };

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const base = arg("url", "http://localhost:3000");
const runs = Number(arg("runs", "1"));
// Pause between scenarios so the free-tier per-minute limit isn't hit.
const gap = Number(arg("gap", "10"));
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

const post = async (path, body) => {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
};

let failures = 0;
for (let run = 1; run <= runs; run++) {
  console.log(`\n=== Run ${run}/${runs} ===`);
  await post("/api/reset");
  for (const [i, s] of scenarios.entries()) {
    if (i > 0 || run > 1) await sleep(gap);
    const t0 = Date.now();
    const res = await post("/api/chat", { customerId: s.customerId, messages: [{ role: "user", content: s.message }] });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (res.error) {
      failures++;
      console.log(`✗ ${s.id}. ${s.title}: ${res.error}`);
      continue;
    }
    const match = res.decisions.find(
      (d) =>
        d.verdict === s.expect.verdict &&
        JSON.stringify(d.results.filter((r) => !r.pass).map((r) => r.rule)) === JSON.stringify(s.expect.failed),
    );
    if (!match) failures++;
    const got = res.decisions.map((d) => `${d.verdict}[${d.results.filter((r) => !r.pass).map((r) => r.rule)}]`).join(", ") || "no gate call";
    const flagged = (res.claims ?? []).filter((c) => !c.ok).map((c) => c.correction);
    console.log(`${match ? "✓" : "✗"} ${s.id}. ${s.title} (${secs}s): expected ${s.expect.verdict}[${s.expect.failed}], got ${got}`);
    console.log(`     tools (${res.model}): ${res.toolCalls.join(" → ") || "none"}`);
    console.log(`     reply: ${res.reply.replace(/\s+/g, " ")}`);
    if (flagged.length) console.log(`     ⚠ claim check: ${flagged.join(" ")}`);
  }
}

console.log(failures ? `\n✗ ${failures} scenario run(s) failed.` : "\n✓ All scenarios passed.");
process.exit(failures ? 1 : 0);
