// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { KnowledgeGraph } from '../core/graph/types';
import { isSystemFile } from './system-file-filter';

const PYTHON_STDLIB = new Set([
  'os', 'sys', 're', 'json', 'io', 'time', 'threading', 'logging',
  'collections', 'functools', 'typing', 'pathlib', 'subprocess', 'signal',
  'struct', 'uuid', 'secrets', 'shutil', 'tempfile', 'datetime', 'traceback',
  'contextlib', 'ipaddress', 'socket', 'base64', 'urllib', 'urllib.parse',
  'abc', 'ast', 'asyncio', 'copy', 'csv', 'dataclasses', 'decimal', 'enum',
  'hashlib', 'hmac', 'http', 'inspect', 'itertools', 'math', 'operator',
  'os.path', 'pickle', 'queue', 'random', 'sqlite3', 'ssl', 'stat', 'string',
  'textwrap', 'types', 'unittest', 'warnings', 'weakref', 'zipfile', 'zlib',
  'platform', 'argparse', 'glob', 'heapq', 'html', 'importlib', 'keyword',
  'multiprocessing', 'pprint', 'getpass',
]);

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

  // External deps (deduplicated, stdlib filtered, system files excluded)
  const allDeps = [
    ...new Set(
      Object.values(cleanDeps)
        .flat()
        .filter((pkg) => !PYTHON_STDLIB.has(pkg)),
    ),
  ].sort();

  // Context Prompt — compact narrative for pasting into CLAUDE.md
  // Omits data already present in other sections (structure, deps, communities)
  const topEntries = keyNodes
    .slice(0, 5)
    .map(
      ({ node, degree }) =>
        `${node.properties.name ?? node.id} (${node.label}, ${degree} connections)`,
    )
    .join('; ');

  const contextPrompt = topEntries
    ? `${projectName} — most-connected entry points: ${topEntries}.`
    : `${projectName} — no symbols with connections detected.`;

  // Project structure
  const structureLines =
    topDirs.map(([dir, count]) => `  ${dir}/  (${count} files)`).join('\n') ||
    '  (no files detected)';

  // Key nodes table — File nodes omit the redundant filename column
  const keyNodesLines =
    keyNodes
      .map(({ node, degree }, i) => {
        const name = node.properties.name ?? node.id;
        if (node.label === 'File') {
          return `${i + 1}. ${name} | File | ${degree} connections`;
        }
        const file = (node.properties.filePath ?? '').split('/').pop() ?? '';
        return `${i + 1}. ${name} | ${node.label} | ${file} | ${degree} connections`;
      })
      .join('\n') || '(no nodes)';

  // Communities — deduplicate by name, group Cluster_N as "Uncategorized"
  const communities = cleanNodes.filter((n) => n.label === 'Community');
  const CLUSTER_RE = /^Cluster_\d+$/;
  const communityTotals = new Map<string, number>();
  for (const c of communities) {
    const raw = c.properties.name ?? c.properties.heuristicLabel ?? c.id;
    const name = CLUSTER_RE.test(raw) ? 'Uncategorized' : raw;
    const count = (c.properties.symbolCount as number | undefined) ?? 1;
    communityTotals.set(name, (communityTotals.get(name) ?? 0) + count);
  }
  const communitiesLines =
    communityTotals.size > 0
      ? [...communityTotals.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => `- ${name} (${count} nodes)`)
          .join('\n')
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
