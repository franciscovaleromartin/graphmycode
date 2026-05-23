// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import type { GraphRelationship } from 'gitnexus-shared';

export function findShortestPath(
  fromId: string,
  toId: string,
  relationships: GraphRelationship[],
): string[] | null {
  if (fromId === toId) return [fromId];

  const adj = new Map<string, string[]>();
  for (const rel of relationships) {
    if (!adj.has(rel.sourceId)) adj.set(rel.sourceId, []);
    if (!adj.has(rel.targetId)) adj.set(rel.targetId, []);
    adj.get(rel.sourceId)!.push(rel.targetId);
    adj.get(rel.targetId)!.push(rel.sourceId);
  }

  const visited = new Set<string>([fromId]);
  const parent = new Map<string, string>();
  const queue: string[] = [fromId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adj.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      parent.set(neighbor, current);
      if (neighbor === toId) {
        const path: string[] = [];
        let node: string | undefined = toId;
        while (node !== undefined) {
          path.unshift(node);
          node = parent.get(node);
        }
        return path;
      }
      queue.push(neighbor);
    }
  }

  return null;
}
