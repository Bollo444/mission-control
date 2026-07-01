"use client";

import { useMemo } from "react";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useFetch } from "@/lib/useFetch";

/* ------------------------------------------------------------------ *
 * Vault graph — the memory vault's notes as nodes, their [[wikilinks]] *
 * as edges. Obsidian's graph view, native to Mission Control.          *
 * ------------------------------------------------------------------ */

interface GraphNode { id: string; label: string; group: string; links: number; }
interface GraphEdge { source: string; target: string; }
interface GraphResp { nodes: GraphNode[]; edges: GraphEdge[]; }

// Deterministic accent per top-level folder — no palette dependency needed.
const GROUP_COLORS = ["#46e0d0", "#d65db1", "#f5b75a", "#8ab4f8", "#3ad07a", "#ff6b6b", "#b894e8"];
function groupColor(group: string, groups: string[]): string {
  const i = groups.indexOf(group);
  return GROUP_COLORS[i < 0 ? 0 : i % GROUP_COLORS.length];
}

/**
 * Grouped-radial layout: each folder gets a slice of a big circle, its notes
 * fan out on a small local circle. Deterministic, no physics sim.
 * ponytail: circular layout, swap in a force sim only if it reads as cramped.
 */
function layout(nodes: GraphNode[]): { groups: string[]; positioned: Map<string, { x: number; y: number }> } {
  const groups = [...new Set(nodes.map((n) => n.group))].sort();
  const byGroup = new Map<string, GraphNode[]>();
  for (const n of nodes) (byGroup.get(n.group) ?? byGroup.set(n.group, []).get(n.group)!).push(n);

  const R = 520; // radius of the ring of group-centers
  const positioned = new Map<string, { x: number; y: number }>();
  groups.forEach((g, gi) => {
    const members = byGroup.get(g)!;
    const ga = (gi / groups.length) * Math.PI * 2;
    const cx = groups.length === 1 ? 0 : Math.cos(ga) * R;
    const cy = groups.length === 1 ? 0 : Math.sin(ga) * R;
    const r = 60 + members.length * 26;
    members.forEach((n, i) => {
      const a = (i / Math.max(1, members.length)) * Math.PI * 2;
      positioned.set(n.id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    });
  });
  return { groups, positioned };
}

export default function VaultGraph() {
  const { data } = useFetch<GraphResp>("/api/memory/graph", 0);

  const { nodes, edges } = useMemo(() => {
    const g = data ?? { nodes: [], edges: [] };
    const { groups, positioned } = layout(g.nodes);
    const nodes: Node[] = g.nodes.map((n) => {
      const color = groupColor(n.group, groups);
      const size = 12 + Math.min(n.links, 8) * 3;
      return {
        id: n.id,
        position: positioned.get(n.id) ?? { x: 0, y: 0 },
        data: { label: n.label },
        style: {
          background: `${color}22`,
          border: `1.5px solid ${color}`,
          color: "var(--color-ink)",
          borderRadius: 10,
          fontSize: 11,
          padding: `${Math.round(size / 3)}px 10px`,
          width: "auto",
        },
      };
    });
    const edges: Edge[] = g.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      style: { stroke: "var(--color-line)", strokeWidth: 1 },
    }));
    return { nodes, edges };
  }, [data]);

  if (!data) {
    return <div className="grid h-full place-items-center text-xs text-[var(--color-ink-4)]">Loading graph…</div>;
  }
  if (nodes.length === 0) {
    return <div className="grid h-full place-items-center text-xs text-[var(--color-ink-4)]">No notes in the vault yet.</div>;
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable
      >
        <Background color="var(--color-line)" gap={28} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
