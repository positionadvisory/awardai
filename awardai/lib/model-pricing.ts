// ── Model pricing (USD per million tokens) ────────────────────────────────────
// Source: https://platform.claude.com/docs/en/about-claude/pricing
// (docs.claude.com/en/docs/about-claude/pricing redirects there), read 2026-09-30.
// Standard input/output rates. gte-small is a local embedding model: no per-token cost.
export const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'gte-small': { input: 0, output: 0 },
}
export function calcCost(model: string | null, inp: number | null, out: number | null): number {
  const p = PRICING[model ?? ''] ?? PRICING['claude-sonnet-4-6']
  return ((inp ?? 0) / 1_000_000) * p.input + ((out ?? 0) / 1_000_000) * p.output
}
