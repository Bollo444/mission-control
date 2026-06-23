// Local mirror of @/lib/hermes-data interfaces.
// TODO: reconcile with @/lib/hermes-data once the backend agent creates it.

export interface Toolset {
  name: string;
  keyword: string;
  description: string;
  toolCount: number;
  enabled: boolean;
}

export interface ToolsetsResp {
  installed: number;
  enabled: number;
  toolsets: Toolset[];
}

export interface Skill {
  name: string;
  description: string;
  enabled: boolean;
}

export interface SkillCategory {
  category: string;
  description: string;
  installed: number;
  enabled: number;
  skills: Skill[];
}

export interface SkillsResp {
  totalInstalled: number;
  totalEnabled: number;
  categories: SkillCategory[];
}

export interface Profile {
  name: string;
  isDefault: boolean;
  description: string;
  model: string;
  soul: string;
  skillCount: number;
}

export interface ProfilesResp {
  active: number;
  profiles: Profile[];
}

export interface Session {
  id: string;
  title: string;
  startedAt: string;
  messageCount: number;
  model: string;
  parentSessionId?: string | null;
}

export interface SessionsResp {
  sessions: Session[];
}

export interface ArtifactItem {
  name: string;
  path: string;
  size: number;
  mtime: string;
}

export interface ArtifactCategory {
  category: string;
  count: number;
  items: ArtifactItem[];
}

export interface ArtifactsResp {
  categories: ArtifactCategory[];
}
