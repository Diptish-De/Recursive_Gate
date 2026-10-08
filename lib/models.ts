// Which Gemini models to use. Free-tier rate limits are per model, so the agent, its fallback
// and the claim checker each use a different one. Override any of them in .env.local.
export const AGENT_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
export const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.1-flash-lite";
export const CLAIMS_MODEL = process.env.CLAIMS_MODEL ?? "gemini-3.5-flash-lite";
