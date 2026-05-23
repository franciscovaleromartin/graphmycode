// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import type { GraphNode, GraphRelationship } from 'gitnexus-shared';

export type LayerName =
  | 'api' | 'service' | 'data' | 'ui'
  | 'utility' | 'config' | 'test' | 'unknown';

export interface LayerStats {
  layer: LayerName;
  nodeCount: number;
  avgFanIn: number;
  avgFanOut: number;
  crossLayerDeps: number;
}

// Orden de smells: índice más bajo = capa "más alta" en la jerarquía
export const LAYER_ORDER: Record<LayerName, number> = {
  ui: 0, api: 1, service: 2, data: 3, utility: 4, config: 5, test: 6, unknown: 7,
};

// Orden de renderizado de carriles L→R
export const LANE_ORDER: LayerName[] = [
  'ui', 'api', 'service', 'data', 'utility', 'config', 'test', 'unknown',
];

const PATH_PATTERNS: Array<{ pattern: string; layer: LayerName }> = [
  { pattern: '/api/', layer: 'api' },
  { pattern: '/routes/', layer: 'api' },
  { pattern: '/controllers/', layer: 'api' },
  { pattern: '/endpoints/', layer: 'api' },
  { pattern: '/services/', layer: 'service' },
  { pattern: '/handlers/', layer: 'service' },
  { pattern: '/middleware/', layer: 'service' },
  { pattern: '/usecases/', layer: 'service' },
  { pattern: '/models/', layer: 'data' },
  { pattern: '/db/', layer: 'data' },
  { pattern: '/database/', layer: 'data' },
  { pattern: '/schema/', layer: 'data' },
  { pattern: '/migrations/', layer: 'data' },
  { pattern: '/repositories/', layer: 'data' },
  { pattern: '/components/', layer: 'ui' },
  { pattern: '/views/', layer: 'ui' },
  { pattern: '/pages/', layer: 'ui' },
  { pattern: '/screens/', layer: 'ui' },
  { pattern: '/layouts/', layer: 'ui' },
  { pattern: '/utils/', layer: 'utility' },
  { pattern: '/helpers/', layer: 'utility' },
  { pattern: '/lib/', layer: 'utility' },
  { pattern: '/shared/', layer: 'utility' },
  { pattern: '/common/', layer: 'utility' },
  { pattern: '/config/', layer: 'config' },
  { pattern: '/constants/', layer: 'config' },
  { pattern: '/env/', layer: 'config' },
  { pattern: '/settings/', layer: 'config' },
  { pattern: '/test/', layer: 'test' },
  { pattern: '/tests/', layer: 'test' },
  { pattern: '/__tests__/', layer: 'test' },
  { pattern: '/spec/', layer: 'test' },
  { pattern: '/e2e/', layer: 'test' },
];

export function detectLayer(node: GraphNode): LayerName {
  const fp = (node.properties.filePath ?? '').toLowerCase();

  for (const { pattern, layer } of PATH_PATTERNS) {
    if (fp.includes(pattern)) return layer;
  }

  // Fallback por label
  if (node.label === 'Route') return 'api';

  return 'unknown';
}

export function groupNodesByLayer(nodes: GraphNode[]): Map<LayerName, GraphNode[]> {
  const groups = new Map<LayerName, GraphNode[]>();
  for (const node of nodes) {
    const layer = detectLayer(node);
    if (!groups.has(layer)) groups.set(layer, []);
    groups.get(layer)!.push(node);
  }
  return groups;
}

export function computeLayerStats(
  nodes: GraphNode[],
  relationships: GraphRelationship[],
): LayerStats[] {
  if (nodes.length === 0) return [];

  const nodeLayer = new Map<string, LayerName>(nodes.map(n => [n.id, detectLayer(n)]));

  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  const crossLayerDepsPerLayer = new Map<LayerName, number>();

  for (const rel of relationships) {
    const srcLayer = nodeLayer.get(rel.sourceId);
    const tgtLayer = nodeLayer.get(rel.targetId);
    if (!srcLayer || !tgtLayer) continue;

    fanOut.set(rel.sourceId, (fanOut.get(rel.sourceId) ?? 0) + 1);
    fanIn.set(rel.targetId, (fanIn.get(rel.targetId) ?? 0) + 1);

    if (srcLayer !== tgtLayer) {
      crossLayerDepsPerLayer.set(srcLayer, (crossLayerDepsPerLayer.get(srcLayer) ?? 0) + 1);
    }
  }

  const groups = groupNodesByLayer(nodes);
  const stats: LayerStats[] = [];

  for (const [layer, layerNodes] of groups) {
    const totalFanIn = layerNodes.reduce((s, n) => s + (fanIn.get(n.id) ?? 0), 0);
    const totalFanOut = layerNodes.reduce((s, n) => s + (fanOut.get(n.id) ?? 0), 0);
    const count = layerNodes.length;

    stats.push({
      layer,
      nodeCount: count,
      avgFanIn: count > 0 ? Math.round((totalFanIn / count) * 10) / 10 : 0,
      avgFanOut: count > 0 ? Math.round((totalFanOut / count) * 10) / 10 : 0,
      crossLayerDeps: crossLayerDepsPerLayer.get(layer) ?? 0,
    });
  }

  return stats;
}
