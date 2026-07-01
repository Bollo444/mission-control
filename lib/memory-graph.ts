import { listVaultTree, readVaultFile } from "./memory";

/*
  Turns the Obsidian vault into a link graph — the same graph Obsidian's own
  graph view shows, built from the `[[wikilinks]]` between notes. Nodes are
  notes; an edge A→B means note A links to note B.
*/

export interface GraphNode {
  id: string;      // note basename (matches how wikilinks reference it)
  label: string;
  group: string;   // top-level folder ("root" for vault-root notes)
  links: number;   // degree (in + out), for sizing
}
export interface GraphEdge {
  source: string;
  target: string;
}
export interface VaultGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const WIKILINK = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;

function basename(p: string): string {
  const last = p.split("/").pop() ?? p;
  return last.replace(/\.md$/i, "");
}

export function buildVaultGraph(): VaultGraph {
  const tree = listVaultTree().filter((n) => !n.dir && /\.md$/i.test(n.name));

  const nodes = new Map<string, GraphNode>();
  const byKey = new Map<string, string>(); // lowercased basename -> canonical id

  for (const n of tree) {
    const id = basename(n.path);
    const group = n.path.includes("/") ? n.path.split("/")[0] : "root";
    nodes.set(id, { id, label: id, group, links: 0 });
    byKey.set(id.toLowerCase(), id);
  }

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  for (const n of tree) {
    const src = basename(n.path);
    const file = readVaultFile(n.path);
    if (!file) continue;
    let m: RegExpExecArray | null;
    WIKILINK.lastIndex = 0;
    while ((m = WIKILINK.exec(file.content))) {
      const target = byKey.get(m[1].trim().toLowerCase());
      if (!target || target === src) continue;
      const key = `${src}→${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: src, target });
      nodes.get(src)!.links++;
      nodes.get(target)!.links++;
    }
  }

  return { nodes: [...nodes.values()], edges };
}
