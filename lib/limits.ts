/**
 * Approximate free-tier rate limits per provider, used by the gateway for budget
 * pre-checks and by the Settings gauges. These numbers drift — they're advisory;
 * the real safety net is the 429 cooldown in the gateway. Omitted fields = no
 * known/enforced limit.
 */
export interface ProviderLimit {
  rpm?: number; // requests / minute
  rpd?: number; // requests / day
  tpm?: number; // tokens / minute
  tpd?: number; // tokens / day
}

export const PROVIDER_LIMITS: Record<string, ProviderLimit> = {
  groq: { rpm: 30, rpd: 1000, tpm: 6000 },
  cerebras: { rpm: 30, tpd: 1_000_000 },
  mistral: { rpm: 60, tpm: 500_000 },
  nim: { rpm: 40 },
  github: { rpm: 15, rpd: 150 },
  openrouter: { rpm: 20, rpd: 50 }, // ":free"; rises to ~1000/day after a one-time $10 top-up
  cloudflare: { rpd: 10000 }, // Neurons/day, approximated as requests
  opencode: {},
  nous: {},
  kilo: {},
  local: {},
};

export function limitFor(provider: string): ProviderLimit {
  return PROVIDER_LIMITS[provider] ?? {};
}
