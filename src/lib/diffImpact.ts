// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import type { GraphRelationship } from 'gitnexus-shared';
import type { LayerName } from './layerDetection';

export interface ImpactResult {
  direct: Set<string>;
  hop1: Set<string>;
  transitive: Set<string>;
  byLayer: Map<LayerName, number>;
}

const PROPAGATION_TYPES = new Set<string>(['IMPORTS', 'CALLS', 'USES']);

export function computeImpact(
  selectedIds: Set<string>,
  relationships: GraphRelationship[],
  maxDepth = 3,
): ImpactResult {
  const reverseDeps = new Map<string, string[]>();
  for (const rel of relationships) {
    if (!PROPAGATION_TYPES.has(rel.type)) continue;
    if (!reverseDeps.has(rel.targetId)) reverseDeps.set(rel.targetId, []);
    reverseDeps.get(rel.targetId)!.push(rel.sourceId);
  }

  const direct = new Set(selectedIds);
  const hop1 = new Set<string>();
  const transitive = new Set<string>();
  const visited = new Set(selectedIds);

  let frontier = [...selectedIds];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      for (const dependentId of reverseDeps.get(nodeId) ?? []) {
        if (visited.has(dependentId)) continue;
        visited.add(dependentId);
        nextFrontier.push(dependentId);
        if (depth === 1) hop1.add(dependentId);
        else transitive.add(dependentId);
      }
    }
    frontier = nextFrontier;
  }

  return { direct, hop1, transitive, byLayer: new Map<LayerName, number>() };
}

export function enrichWithLayers(
  result: ImpactResult,
  nodeLayerMap: Map<string, LayerName>,
): ImpactResult {
  const byLayer = new Map<LayerName, number>();
  const allImpacted = [...result.hop1, ...result.transitive];
  for (const nodeId of allImpacted) {
    const layer = nodeLayerMap.get(nodeId);
    if (!layer) continue;
    byLayer.set(layer, (byLayer.get(layer) ?? 0) + 1);
  }
  return { ...result, byLayer };
}
