/* ------------------------------------------------------------------ *
 * Claude's growth-audit swarm — one "hat" per business-presence lens,   *
 * each run in parallel as headless sub-agents against a real business.  *
 * Distinct color palette from sentinel-hats.ts so the two swarms never  *
 * visually or structurally mix (see agentId scoping in the API route). *
 * ------------------------------------------------------------------ */

export interface Hat {
  id: string;
  name: string;
  /** Accent color for the chip/badge — deliberately disjoint from HATS in sentinel-hats.ts. */
  color: string;
  /** One-line lens shown in the UI. */
  lens: string;
  /** The role framing prepended to the objective in the sub-agent prompt. */
  role: string;
}

export const HATS: Hat[] = [
  {
    id: "visibility",
    name: "Visibility",
    color: "#14b8a6",
    lens: "SEO & local search — on-page/technical SEO, Google Business Profile, local pack",
    role: "the VISIBILITY hat (SEO & local search). Audit technical/on-page SEO signals, Google Business Profile completeness, local-pack ranking factors, and structured data",
  },
  {
    id: "social",
    name: "Social",
    color: "#ec4899",
    lens: "Social presence — active platforms, posting cadence, engagement, voice",
    role: "the SOCIAL hat (social media presence). Audit which platforms the business is active on, posting cadence, engagement patterns, and brand-voice consistency across them",
  },
  {
    id: "reputation",
    name: "Reputation",
    color: "#fb7185",
    lens: "Reviews & sentiment — volume, rating, themes, response rate",
    role: "the REPUTATION hat (reviews & sentiment). Audit review volume, average rating, recurring sentiment themes, and how well the business responds to reviews across platforms",
  },
  {
    id: "website",
    name: "Website",
    color: "#38bdf8",
    lens: "Site UX & conversion — speed, mobile, navigation, CTAs",
    role: "the WEBSITE hat (site UX & conversion). Audit site speed, mobile-friendliness, navigation clarity, and conversion paths (CTAs, contact/booking flow)",
  },
  {
    id: "content",
    name: "Content",
    color: "#a3e635",
    lens: "Brand & messaging — content quality, voice consistency, value prop",
    role: "the CONTENT hat (brand & messaging). Audit content quality, brand-voice consistency, and clarity of the value proposition across the site and channels",
  },
  {
    id: "competitive",
    name: "Competitive",
    color: "#6366f1",
    lens: "Market positioning — benchmark vs. comparable competitors",
    role: "the COMPETITIVE hat (market positioning). Benchmark the business against 2-3 comparable local/industry competitors on visibility, offering, and differentiation",
  },
];

export function getHat(id: string): Hat | undefined {
  return HATS.find((h) => h.id === id);
}

/** System prompt for running a hat through the headless gateway. */
export function hatSystemPrompt(hat: Hat): string {
  return [
    `You are ${hat.role}.`,
    `You operate as one specialist in a coordinated growth-audit swarm; cover ONLY your lens (${hat.lens}) — the other hats handle theirs.`,
    `Produce concrete, prioritized findings and recommended actions in short headed sections and bullet points.`,
    `CRITICAL: this business's audit will be handed to a real owner as a free deliverable — never fabricate specific numbers (follower counts, review counts, rankings, traffic estimates) you have not verified from the recon context you were given. If you weren't given real data for something, say exactly what to check and how to check it (the specific page, tool, or search to run) instead of guessing a figure.`,
  ].join(" ");
}
