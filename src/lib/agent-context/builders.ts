// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { KnowledgeGraph } from '../../core/graph/types';
import type { BaseData } from './types';
import { estimateTokens, TOOL_PREFIXES, ORCHESTRATOR_PATTERNS, WORKER_PATTERNS } from './types';
import { detectStack, inferCommands } from './stack';
import {
  findEntryPoints, buildCommunityLabelMap, buildModuleMap,
  buildKeySymbols, buildCriticalEdges, buildBridgeFiles,
  detectBoundaries, detectPointers,
} from './analysis';
import { inferPurposeSignals } from './purpose';
import type { GraphNode } from 'gitnexus-shared';
import { computeLayerStats, groupNodesByLayer, detectLayer, LAYER_ORDER, LANE_ORDER, type LayerName } from '../layerDetection';

// ── CLAUDE.md ────────────────────────────────────────────────────────────────

function buildArchitectureSection(
  graph: KnowledgeGraph,
  cleanNodes: GraphNode[],
): string {
  const filteredNodes = cleanNodes.filter(
    n => n.label !== 'Community' && n.label !== 'Project',
  );

  const stats = computeLayerStats(filteredNodes, graph.relationships);
  const layersWithNodes = stats.filter(s => s.nodeCount > 0);
  if (layersWithNodes.length < 2) return '';

  const nodeLayerMap = new Map<string, LayerName>(
    filteredNodes.map(n => [n.id, detectLayer(n)]),
  );

  const fanInMap = new Map<string, number>();
  for (const rel of graph.relationships) {
    fanInMap.set(rel.targetId, (fanInMap.get(rel.targetId) ?? 0) + 1);
  }

  const groups = groupNodesByLayer(filteredNodes);
  const criticalByLayer = new Map<LayerName, { path: string; fanIn: number }>();
  for (const [layer, nodes] of groups) {
    let best: { path: string; fanIn: number } | null = null;
    for (const n of nodes) {
      const fi = fanInMap.get(n.id) ?? 0;
      if (!best || fi > best.fanIn) {
        best = {
          path: (n.properties.filePath as string | undefined) ?? (n.properties.name as string | undefined) ?? n.id,
          fanIn: fi,
        };
      }
    }
    if (best && best.fanIn > 0) criticalByLayer.set(layer, best);
  }

  const crossLayerVolume = new Map<string, number>();
  for (const rel of graph.relationships) {
    const srcLayer = nodeLayerMap.get(rel.sourceId);
    const tgtLayer = nodeLayerMap.get(rel.targetId);
    if (!srcLayer || !tgtLayer || srcLayer === tgtLayer) continue;
    const key = `${srcLayer} → ${tgtLayer}`;
    crossLayerVolume.set(key, (crossLayerVolume.get(key) ?? 0) + 1);
  }
  const topCross = [...crossLayerVolume.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const nodeByIdLocal = new Map<string, GraphNode>(graph.nodes.map(n => [n.id, n]));

  const smells: string[] = [];
  const seenSmells = new Set<string>();
  for (const rel of graph.relationships) {
    const srcLayer = nodeLayerMap.get(rel.sourceId);
    const tgtLayer = nodeLayerMap.get(rel.targetId);
    if (!srcLayer || !tgtLayer || srcLayer === tgtLayer || srcLayer === 'unknown' || tgtLayer === 'unknown') continue;
    if (LAYER_ORDER[srcLayer] > LAYER_ORDER[tgtLayer]) {
      const srcPath = ((nodeByIdLocal.get(rel.sourceId)?.properties.filePath as string | undefined) ?? rel.sourceId).split('/').slice(-2).join('/');
      const tgtPath = ((nodeByIdLocal.get(rel.targetId)?.properties.filePath as string | undefined) ?? rel.targetId).split('/').slice(-2).join('/');
      const key = `${srcLayer}→${tgtLayer}:${srcPath}`;
      if (!seenSmells.has(key)) {
        seenSmells.add(key);
        smells.push(`- ${srcLayer} → ${tgtLayer}: \`${srcPath}\` → \`${tgtPath}\``);
      }
    }
  }

  const lines: string[] = ['## Architecture'];

  for (const stat of layersWithNodes.sort((a, b) => LANE_ORDER.indexOf(a.layer) - LANE_ORDER.indexOf(b.layer))) {
    const critical = criticalByLayer.get(stat.layer);
    const criticalStr = critical ? ` — critical: \`${critical.path}\` (fan-in ${critical.fanIn})` : '';
    lines.push(`- **${stat.layer}** (${stat.nodeCount} nodes): cross-deps ${stat.crossLayerDeps}${criticalStr}`);
  }

  if (topCross.length > 0) {
    lines.push('', 'Top cross-layer deps (by volume):');
    for (const [pair, count] of topCross) {
      lines.push(`- ${pair} (${count} edges)`);
    }
  }

  if (smells.length > 0) {
    lines.push('', 'Code smells (upward deps):');
    lines.push(...smells.slice(0, 5));
  }

  return lines.join('\n');
}

function assembleClaude(parts: Record<string, string>): string {
  return [
    '<!-- graphmycode:generated-start -->',
    parts.header,
    parts.stack,
    parts.commands,
    parts.entries,
    parts.moduleMap,
    parts.architecture,
    parts.keySymbols,
    parts.criticalEdges,
    parts.bridgeFiles,
    parts.conventions,
    parts.boundaries,
    parts.pointers,
    '<!-- graphmycode:generated-end -->',
  ].filter(Boolean).join('\n\n');
}

export function buildClaudeMd(
  graph: KnowledgeGraph,
  projectName: string,
  base: BaseData,
): string {
  const { cleanNodes, allCleanNodes, cleanDeps, degreeMap, nodeById, communityMembers, nodeToCommunity, testNodeIds } = base;

  const stack = detectStack(cleanNodes, cleanDeps);
  const commands = inferCommands(stack);
  const communityLabelMap = buildCommunityLabelMap(cleanNodes, degreeMap, communityMembers);

  const communityEntries: Array<{ id: string; label: string; symbolCount: number }> = [];
  for (const n of cleanNodes) {
    if (n.label !== 'Community') continue;
    const label = communityLabelMap.get(n.id);
    if (!label || label === 'Uncategorized') continue;
    communityEntries.push({
      id: n.id,
      label,
      symbolCount: (n.properties.symbolCount as number | undefined)
        ?? (communityMembers.get(n.id)?.length ?? 0),
    });
  }
  const visibleLabelMap: Map<string, string> = new Map(
    communityEntries
      .sort((a, b) => b.symbolCount - a.symbolCount)
      .slice(0, 6)
      .map((e) => [e.id, e.label]),
  );

  const entries = findEntryPoints(cleanNodes, graph);
  const moduleMapContent = buildModuleMap(cleanNodes, degreeMap, communityMembers, communityLabelMap);
  const architectureContent = buildArchitectureSection(graph, cleanNodes);
  let keySymbolsContent = buildKeySymbols(cleanNodes, degreeMap, 12);
  let criticalEdgeLines = buildCriticalEdges(graph, nodeById, testNodeIds);
  let bridgeFileLines = buildBridgeFiles(allCleanNodes, graph, degreeMap, nodeToCommunity, visibleLabelMap);
  const boundaryLines = detectBoundaries(cleanNodes);
  const pointerLines = detectPointers(cleanNodes);

  const projectNode = cleanNodes.find((n) => n.label === 'Project');
  let purpose = projectNode?.properties.description as string | undefined;
  if (!purpose) {
    const signals = inferPurposeSignals(cleanNodes, stack.allPkgs);

    const LANG_DISPLAY: Record<string, string> = {
      python: 'Python', typescript: 'TypeScript', javascript: 'JavaScript',
      java: 'Java', go: 'Go', rust: 'Rust', csharp: 'C#', cpp: 'C++',
      c: 'C', ruby: 'Ruby', php: 'PHP', kotlin: 'Kotlin', swift: 'Swift', dart: 'Dart',
    };
    const langDisplay = LANG_DISPLAY[stack.primaryLang] ?? stack.primaryLang;

    const stackPrefix = stack.isFullstack
      ? [stack.pyBackend[0] ?? langDisplay, stack.jsFrontend[0] ?? stack.jsServer[0] ?? '']
          .filter(Boolean).join(' + ')
      : (stack.frameworks.slice(0, 2).join(' + ') || langDisplay);

    if (signals) {
      const withItems = [
        ...signals.components,
        signals.hasAuth ? 'authentication' : '',
      ].filter(Boolean);
      const withClause = withItems.length > 0
        ? ` with ${withItems[0]}${withItems.slice(1).map((c) => ` and ${c}`).join('')}`
        : '';
      const domainPart = signals.domain ? `${signals.domain} ` : '';
      purpose = stackPrefix
        ? `${stackPrefix} ${domainPart}application${withClause}`
        : `${domainPart}application${withClause}`;
    } else {
      purpose = 'TODO: describe what this project does in one line.';
    }
  }

  const commandLines = [
    '## Commands',
    `- install: \`${commands.install ?? '# see manifest'}\``,
    `- dev:     \`${commands.dev ?? '# see manifest'}\``,
    commands.server ? `- server:  \`${commands.server}\`` : '',
    `- test:    \`${commands.test ?? '# see manifest'}\``,
    `- lint:    \`${commands.lint ?? '# see manifest'}\``,
    `- build:   \`${commands.build ?? '# see manifest'}\``,
  ].filter(Boolean).join('\n');

  const boundariesContent = boundaryLines.length > 0
    ? boundaryLines.join('\n')
    : '<!-- add project-specific boundaries here -->';

  const parts: Record<string, string> = {
    header: `# ${projectName}\n> ${purpose}`,
    stack: `## Stack\n- ${stack.stackLine || '(not detected)'}`,
    commands: commandLines,
    entries: entries.length
      ? `## Entry Points\n${entries.map((e) => `- \`${e.path}\` — ${e.role}`).join('\n')}`
      : '',
    moduleMap: moduleMapContent ? `## Module Map\n${moduleMapContent}` : '',
    architecture: architectureContent,
    keySymbols: `## Key Symbols  (signatures only — no implementations)\n${keySymbolsContent}`,
    criticalEdges: criticalEdgeLines.length
      ? `## Critical Edges  (top 5 call relationships)\n${criticalEdgeLines.join('\n')}`
      : '',
    bridgeFiles: bridgeFileLines.length
      ? `## Bridge Files  (high degree across communities — edit carefully)\n${bridgeFileLines.join('\n')}`
      : '',
    conventions: '## Conventions  (not enforced by linters)\n<!-- add project-specific conventions here -->',
    boundaries: `## Boundaries  (DO NOT)\n${boundariesContent}`,
    pointers: pointerLines.length ? `## Pointers  (read on demand, do not embed)\n${pointerLines.join('\n')}` : '',
  };

  let content = assembleClaude(parts);

  if (estimateTokens(content) > 1800) {
    parts.criticalEdges = '';
    content = assembleClaude(parts);
  }
  if (estimateTokens(content) > 1800) {
    parts.bridgeFiles = '';
    content = assembleClaude(parts);
  }
  if (estimateTokens(content) > 1800) {
    keySymbolsContent = buildKeySymbols(cleanNodes, degreeMap, 8);
    parts.keySymbols = `## Key Symbols  (signatures only — no implementations)\n${keySymbolsContent}`;
    content = assembleClaude(parts);
  }

  return content;
}

// ── AGENTS.md ────────────────────────────────────────────────────────────────

const VERB_FORMS: Record<string, string> = {
  write: 'Writes', read: 'Reads', list: 'Lists', get: 'Gets', fetch: 'Fetches',
  search: 'Searches', execute: 'Executes', call: 'Calls', invoke: 'Invokes',
  query: 'Queries', create: 'Creates', update: 'Updates', delete: 'Deletes',
  remove: 'Removes', run: 'Runs', send: 'Sends', process: 'Processes',
  handle: 'Handles', parse: 'Parses', load: 'Loads', save: 'Saves',
  generate: 'Generates', validate: 'Validates', format: 'Formats',
  transform: 'Transforms', convert: 'Converts', check: 'Checks',
  filter: 'Filters', find: 'Finds',
};

const KNOWN_ACRONYMS = new Set([
  'html', 'css', 'json', 'xml', 'api', 'url', 'http', 'https',
  'sql', 'db', 'id', 'ui', 'io', 'pdf', 'csv', 'svg', 'jwt',
  'sdk', 'cli', 'tts', 'llm', 'rag',
]);

function describeFromSnakeCase(name: string): string {
  const parts = name.split('_').filter(Boolean);
  if (parts.length === 0) return name;
  return parts
    .map((p, i) => {
      const lower = p.toLowerCase();
      if (KNOWN_ACRONYMS.has(lower)) return lower.toUpperCase();
      if (i === 0) return VERB_FORMS[lower] ?? (p.charAt(0).toUpperCase() + p.slice(1));
      return p;
    })
    .join(' ');
}

export function buildAgentsMd(
  graph: KnowledgeGraph,
  projectName: string,
  base: BaseData,
): string {
  const { cleanNodes, cleanDeps, degreeMap } = base;

  let agentType: 'orchestrator' | 'worker' | 'tool-only' = 'tool-only';
  for (const n of cleanNodes) {
    if (n.label !== 'Function' && n.label !== 'Method') continue;
    const name = (n.properties.name ?? '').toLowerCase();
    if (ORCHESTRATOR_PATTERNS.some((p) => name.includes(p))) { agentType = 'orchestrator'; break; }
    if (WORKER_PATTERNS.some((p) => name.includes(p))) agentType = 'worker';
  }

  const allPkgs = new Set(Object.values(cleanDeps).flat().map((p) => p.toLowerCase()));
  let defaultModel = 'claude-sonnet-4-6';
  if (allPkgs.has('openai') || allPkgs.has('@openai/openai')) defaultModel = 'gpt-4o';
  else if (allPkgs.has('google-generativeai') || allPkgs.has('google-genai')) defaultModel = 'gemini-2.0-flash';
  else if (allPkgs.has('groq')) defaultModel = 'llama-3.3-70b-versatile';

  const systemPromptNode = cleanNodes.find((n) => {
    const path = (n.properties.filePath ?? n.properties.name ?? '').toLowerCase();
    return path.includes('system_prompt') || path.endsWith('system.md') || path.includes('prompt.txt');
  });
  const systemPromptPath = systemPromptNode?.properties.filePath as string | undefined ?? '(not detected)';

  const tools: Array<{ node: typeof cleanNodes[number]; degree: number }> = [];
  for (const n of cleanNodes) {
    if (
      (n.label === 'Function' || n.label === 'Method' || n.label === 'Tool') &&
      TOOL_PREFIXES.some((p) => (n.properties.name ?? '').toLowerCase().startsWith(p))
    ) {
      tools.push({ node: n, degree: degreeMap.get(n.id) ?? 0 });
    }
  }
  tools.sort((a, b) => b.degree - a.degree);
  tools.splice(10);

  const SUBAGENT_PATTERNS = ['subagent', 'sub_agent', 'worker_agent', 'child_agent'];
  const subagentNodes = cleanNodes
    .filter((n) => {
      const name = (n.properties.name ?? '').toLowerCase();
      const path = (n.properties.filePath ?? '').toLowerCase();
      return SUBAGENT_PATTERNS.some((p) => name.includes(p) || path.includes(p));
    })
    .slice(0, 5);

  const hasWriteOps = cleanNodes.some((n) => {
    const name = (n.properties.name ?? '').toLowerCase();
    return name.includes('write_') || name.includes('delete_') || name.includes('remove_') || name.includes('update_');
  });
  const hasExternalCalls = [...allPkgs].some((p) =>
    ['requests', 'httpx', 'axios', 'aiohttp', 'node-fetch', 'got'].includes(p),
  );

  const knownFailures = [
    hasExternalCalls ? '  - External API unavailability or rate limiting' : '',
    hasWriteOps ? '  - Partial write failures leaving inconsistent state' : '',
    '  - Malformed input causing silent incorrect output',
  ].filter(Boolean);

  const lines: string[] = [
    '<!-- graphmycode:generated-start -->',
    `# ${projectName} — Agent Specification`,
    '',
    '## Agent Card',
    `- **Type**: ${agentType}`,
    `- **Default model**: ${defaultModel}`,
    `- **System prompt**: \`${systemPromptPath}\``,
    '- **Known failure modes**:',
    ...knownFailures,
  ];

  if (tools.length > 0) {
    lines.push('', '## Tools');
    for (const { node } of tools) {
      const name = (node.properties.name ?? node.id) as string;
      const file = (node.properties.filePath as string | undefined ?? '').split('/').pop() ?? '';
      const layer = detectLayer(node);
      const layerStr = layer !== 'unknown' ? `; layer: ${layer}` : '';
      lines.push(`- \`${name}(...)\` — ${describeFromSnakeCase(name)}; defined in \`${file}\`${layerStr}`);
    }
  }

  if (subagentNodes.length > 0) {
    lines.push('', '## Subagents');
    for (const n of subagentNodes) {
      const name = (n.properties.name ?? n.id) as string;
      const file = (n.properties.filePath ?? '').split('/').pop() ?? '';
      lines.push(`- \`${name}\`${file ? ` — \`${file}\`` : ''}`);
    }
  }

  const requiresConfirmation = [
    hasWriteOps ? 'file writes, deletes' : '',
    hasExternalCalls ? 'external API calls' : '',
    'dependency installs, destructive commands',
  ].filter(Boolean).join(', ');

  lines.push(
    '',
    '## Permissions',
    '- Auto-allowed: read, search, single-file inspection',
    `- Requires confirmation: ${requiresConfirmation}`,
    '',
    '<!-- graphmycode:generated-end -->',
  );

  return lines.join('\n');
}
