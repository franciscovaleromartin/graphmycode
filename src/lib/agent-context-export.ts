// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { KnowledgeGraph } from '../core/graph/types';
import { isSystemFile } from './system-file-filter';

export function exportAgentContext(
  graph: KnowledgeGraph,
  projectName: string,
  externalDeps: Record<string, string[]>,
  isAgent = false,
): void {
  const content = buildAgentContext(graph, projectName, externalDeps, isAgent);
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'project-context.md';
  a.click();
  URL.revokeObjectURL(url);
}

export function buildAgentContext(
  graph: KnowledgeGraph,
  projectName: string,
  externalDeps: Record<string, string[]>,
  isAgent = false,
): string {
  const date = new Date().toISOString().slice(0, 10);

  // Global filter: exclude all OS/editor artifact nodes before any analysis
  const systemNodeIds = new Set<string>(
    graph.nodes
      .filter((n) => isSystemFile(n.properties.filePath ?? n.properties.name ?? ''))
      .map((n) => n.id),
  );
  const cleanNodes = graph.nodes.filter((n) => !systemNodeIds.has(n.id));
  const cleanDeps = Object.fromEntries(
    Object.entries(externalDeps).filter(([nodeId]) => !systemNodeIds.has(nodeId)),
  );

  // Degree map (clean relationships only)
  const degreeMap = new Map<string, number>();
  for (const rel of graph.relationships) {
    degreeMap.set(rel.sourceId, (degreeMap.get(rel.sourceId) ?? 0) + 1);
    degreeMap.set(rel.targetId, (degreeMap.get(rel.targetId) ?? 0) + 1);
  }

  // Top 10 nodes by degree (skip Community/Process/Folder meta-nodes)
  const SKIP_LABELS = new Set(['Community', 'Process', 'Folder']);
  const keyNodes = cleanNodes
    .filter((n) => !SKIP_LABELS.has(n.label as string))
    .map((n) => ({ node: n, degree: degreeMap.get(n.id) ?? 0 }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 10);

  // Directory structure (files only)
  const dirCounts = new Map<string, number>();
  for (const node of cleanNodes) {
    if (node.label !== 'File') continue;
    const parts = (node.properties.filePath ?? '').split('/').filter(Boolean);
    if (parts.length >= 2) {
      const dir =
        parts[0] === 'src' && parts.length >= 3 ? `src/${parts[1]}` : parts[0];
      dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
    }
  }
  const topDirs = [...dirCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // External deps (deduplicated, system files already excluded via cleanDeps)
  const allDeps = [...new Set(Object.values(cleanDeps).flat())].sort();

  // Stats (clean nodes only)
  const fileCount = cleanNodes.filter((n) => n.label === 'File').length;
  const fnCount = cleanNodes.filter(
    (n) => n.label === 'Function' || n.label === 'Method',
  ).length;
  const classCount = cleanNodes.filter((n) => n.label === 'Class').length;

  // Context Prompt (compact, deterministic)
  const archLayers = topDirs
    .slice(0, 3)
    .map(([d]) => d)
    .join(', ');
  const topStack = allDeps.slice(0, 8).join(', ') || 'unknown';
  const topEntries = keyNodes
    .slice(0, 5)
    .map(
      ({ node, degree }) =>
        `${node.properties.name ?? node.id} (${node.label}, ${degree} connections)`,
    )
    .join('; ');

  const contextPrompt = [
    `Project: ${projectName}`,
    `Stack: ${topStack}`,
    `Size: ${fileCount} files, ${fnCount} functions/methods, ${classCount} classes, ${graph.relationshipCount} edges`,
    archLayers ? `Architecture layers: ${archLayers}` : '',
    topEntries ? `Key entry points: ${topEntries}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  // Project structure
  const structureLines =
    topDirs.map(([dir, count]) => `  ${dir}/  (${count} files)`).join('\n') ||
    '  (no files detected)';

  // Key nodes table
  const keyNodesLines =
    keyNodes
      .map(({ node, degree }, i) => {
        const file = (node.properties.filePath ?? '').split('/').pop() ?? '';
        return `${i + 1}. ${node.properties.name ?? node.id} | ${node.label} | ${file} | ${degree} connections`;
      })
      .join('\n') || '(no nodes)';

  // Communities
  const communities = cleanNodes.filter((n) => n.label === 'Community');
  const communitiesLines =
    communities.length > 0
      ? communities.map((c) => `- ${c.properties.name ?? c.id}`).join('\n')
      : 'No communities detected.';

  return [
    `# GraphMyCode — Agent Context Export`,
    `Generated: ${date} | Project: ${projectName}`,
    ...(isAgent ? ['> ⚡ Agent patterns detected', ''] : ['']),
    `## Context Prompt`,
    '',
    contextPrompt,
    '',
    `## Project Structure`,
    '',
    structureLines,
    '',
    `## Key Nodes`,
    '',
    keyNodesLines,
    '',
    `## Main Dependencies`,
    '',
    allDeps.length > 0 ? allDeps.join('\n') : '(none detected)',
    '',
    `## Detected Communities`,
    '',
    communitiesLines,
  ].join('\n');
}
