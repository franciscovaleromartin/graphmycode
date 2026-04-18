// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { KnowledgeGraph } from '../core/graph/types';

export interface HeatmapNode {
  id: string;
  name: string;
  filePath: string;
  degree: number;
  normalizedDegree: number;
}

export interface HeatmapEdge {
  source: string;
  target: string;
  isBidirectional: boolean;
  weight: number;
}

export interface HeatmapData {
  nodes: HeatmapNode[];
  edges: HeatmapEdge[];
  maxDegree: number;
  bidirectionalCount: number;
}

export function computeHeatmapData(graph: KnowledgeGraph): HeatmapData {
  // 1. Filtrar solo nodos File
  const fileNodes = graph.nodes.filter(n => n.label === 'File');
  const fileIds = new Set(fileNodes.map(n => n.id));

  // 2. Filtrar solo relaciones IMPORTS entre ficheros
  const importRels = graph.relationships.filter(
    r => r.type === 'IMPORTS' && fileIds.has(r.sourceId) && fileIds.has(r.targetId),
  );

  // 3. Calcular grado total (entrante + saliente) por nodo
  const degreeMap = new Map<string, number>();
  fileIds.forEach(id => degreeMap.set(id, 0));
  importRels.forEach(r => {
    degreeMap.set(r.sourceId, (degreeMap.get(r.sourceId) ?? 0) + 1);
    degreeMap.set(r.targetId, (degreeMap.get(r.targetId) ?? 0) + 1);
  });

  const maxDegree = Math.max(0, ...degreeMap.values());

  // 4. Detectar aristas bidireccionales: A→B y B→A
  const edgeSet = new Set(importRels.map(r => `${r.sourceId}__${r.targetId}`));
  const seen = new Set<string>();
  const edges: HeatmapEdge[] = [];
  let bidirectionalCount = 0;

  importRels.forEach(r => {
    const pairKey = [r.sourceId, r.targetId].sort().join('__');
    if (seen.has(pairKey)) return;
    seen.add(pairKey);
    const isBidirectional =
      edgeSet.has(`${r.sourceId}__${r.targetId}`) &&
      edgeSet.has(`${r.targetId}__${r.sourceId}`);
    if (isBidirectional) bidirectionalCount++;
    edges.push({ source: r.sourceId, target: r.targetId, isBidirectional, weight: isBidirectional ? 2 : 1 });
  });

  // 5. Normalizar grados
  const nodes: HeatmapNode[] = fileNodes.map(n => {
    const degree = degreeMap.get(n.id) ?? 0;
    return {
      id: n.id,
      name: n.properties.name as string,
      filePath: (n.properties.filePath as string) ?? '',
      degree,
      normalizedDegree: maxDegree > 0 ? degree / maxDegree : 0,
    };
  });

  return { nodes, edges, maxDegree, bidirectionalCount };
}
