// Smoke test for the Gemini API key: confirms it works and lists the models it can use.
// Run: npm run check:gemini

const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!key || key === "paste-your-key-here") {
  console.error("✗ GOOGLE_GENERATIVE_AI_API_KEY is missing. Copy .env.example to .env.local and paste your key.");
  process.exit(1);
}

const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
  headers: { "x-goog-api-key": key },
});
if (!res.ok) {
  console.error(`✗ Gemini rejected the key (HTTP ${res.status}):`, await res.text());
  process.exit(1);
}

const { models = [] } = await res.json();
const flash = models
  .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && m.name.includes("flash"))
  .map((m) => m.name.replace("models/", ""));

console.log("✓ Key works. Flash models available to you:");
for (const m of flash) console.log("   ", m);

const configured = process.env.GEMINI_MODEL;
if (!configured) {
  console.log("! GEMINI_MODEL is not set. Pick one from the list above.");
  process.exit(1);
}

// Being listed is not enough (Google hides retired models from new keys), so make a real call.
const ping = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${configured}:generateContent`, {
  method: "POST",
  headers: { "x-goog-api-key": key, "content-type": "application/json" },
  body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word: ok" }] }] }),
});
if (ping.ok) console.log(`✓ GEMINI_MODEL=${configured} answered a test request.`);
else {
  console.error(`✗ GEMINI_MODEL=${configured} failed a test request (HTTP ${ping.status}):`, await ping.text());
  process.exit(1);
}
