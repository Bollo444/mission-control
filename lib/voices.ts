// Per-agent speech profiles for the meeting boardroom (Web Speech API).
// Each agent targets a distinct accent + gender; rate/pitch are varied so the
// nine voices stay distinguishable even when the OS has few installed voices.

export interface VoicePref {
  lang: string;
  gender: "male" | "female";
  rate: number;
  pitch: number;
}

export const AGENT_VOICE: Record<string, VoicePref> = {
  claude: { lang: "en-US", gender: "female", rate: 1.0, pitch: 1.05 },
  hermes: { lang: "en-GB", gender: "male", rate: 0.95, pitch: 0.92 },
  pi: { lang: "en-AU", gender: "female", rate: 1.06, pitch: 1.12 },
  opencode: { lang: "en-GB", gender: "female", rate: 1.0, pitch: 1.0 },
  antigravity: { lang: "en-US", gender: "male", rate: 1.0, pitch: 1.02 },
  openclaw: { lang: "en-US", gender: "male", rate: 0.9, pitch: 0.82 },
  jcode: { lang: "en-AU", gender: "male", rate: 1.08, pitch: 1.0 },
  vibe: { lang: "en-US", gender: "female", rate: 1.05, pitch: 1.16 },
  kilo: { lang: "en-GB", gender: "male", rate: 0.98, pitch: 0.9 },
  user: { lang: "en-US", gender: "female", rate: 1.0, pitch: 1.0 },
};

const FEMALE_HINTS = [
  "female", "zira", "samantha", "victoria", "susan", "catherine", "fiona", "tessa",
  "karen", "moira", "serena", "amelie", "aria", "jenny", "sonia", "libby", "natasha",
  "clara", "hazel", "linda", "heera",
];
const MALE_HINTS = [
  "male", "david", "mark", "george", "daniel", "alex", "fred", "rishi", "ryan",
  "guy", "william", "liam", "james", "thomas", "oliver", "gordon",
];

/** Best-effort pick of an installed voice matching the agent's accent + gender. */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  pref: VoicePref
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  const byLang = voices.filter((v) => norm(v.lang).startsWith(pref.lang.toLowerCase()));
  const en = voices.filter((v) => norm(v.lang).startsWith("en"));
  const pool = byLang.length ? byLang : en.length ? en : voices;
  const hints = pref.gender === "female" ? FEMALE_HINTS : MALE_HINTS;
  const match = pool.find((v) => hints.some((h) => v.name.toLowerCase().includes(h)));
  return match ?? pool[0];
}

export function getVoicePref(agentId: string): VoicePref {
  return AGENT_VOICE[agentId] ?? AGENT_VOICE.user;
}
