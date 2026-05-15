// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { KnowledgeGraph } from '../../core/graph/types';
import { isSystemFile } from '../system-file-filter';
import type { GraphNode, BaseData } from './types';
import {
  isTestNode, getLang,
  SKIP_SYMBOL_LABELS, FILE_EXT_RE, CLUSTER_RE, ENTRY_FILENAMES,
  DOC_BASENAMES, DANGEROUS_PATHS,
} from './types';

const INTERNAL_ID_RE = /^[a-f0-9]{8,}-|^comm_\d+$|^node_\d+$|^cluster_\d+$/i;
const SYMBOL_PREFERRED = new Set(['Class', 'Interface', 'Function', 'Method', 'Struct', 'Trait', 'Enum']);

// ── Base data extraction ──────────────────────────────────────────────────────

export function buildBase(graph: KnowledgeGraph, externalDeps: Record<string, string[]>): BaseData {
  const systemNodeIds = new Set<string>();
  for (const n of graph.nodes) {
    if (isSystemFile(n.properties.filePath ?? n.properties.name ?? '')) systemNodeIds.add(n.id);
  }

  const allCleanNodes = graph.nodes.filter((n) => !systemNodeIds.has(n.id));
  const cleanNodes = allCleanNodes.filter((n) => !isTestNode(n));
  const cleanDeps = Object.fromEntries(
    Object.entries(externalDeps).filter(([id]) => !systemNodeIds.has(id)),
  );

  const degreeMap = new Map<string, number>();
  for (const rel of graph.relationships) {
    degreeMap.set(rel.sourceId, (degreeMap.get(rel.sourceId) ?? 0) + 1);
    degreeMap.set(rel.targetId, (degreeMap.get(rel.targetId) ?? 0) + 1);
  }

  const nodeById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));

  const communityMembers = new Map<string, GraphNode[]>();
  const nodeToCommunity = new Map<string, string>();

  for (const rel of graph.relationships) {
    if (rel.type !== 'MEMBER_OF') continue;
    if (systemNodeIds.has(rel.sourceId) || systemNodeIds.has(rel.targetId)) continue;
    if (!communityMembers.has(rel.targetId)) communityMembers.set(rel.targetId, []);
    const member = nodeById.get(rel.sourceId);
    if (member) {
      communityMembers.get(rel.targetId)!.push(member);
      nodeToCommunity.set(rel.sourceId, rel.targetId);
    }
  }

  const testNodeIds = new Set<string>();
  for (const n of graph.nodes) {
    if (isTestNode(n)) testNodeIds.add(n.id);
  }

  return { cleanNodes, allCleanNodes, cleanDeps, degreeMap, nodeById, communityMembers, nodeToCommunity, testNodeIds };
}

// ── Entry Points ──────────────────────────────────────────────────────────────

export function findEntryPoints(cleanNodes: GraphNode[], graph: KnowledgeGraph) {
  const entries: Array<{ path: string; role: string }> = [];
  const seen = new Set<string>();

  const entryIds = new Set<string>();
  for (const r of graph.relationships) {
    if (r.type === 'ENTRY_POINT_OF') entryIds.add(r.sourceId);
  }

  for (const n of cleanNodes) {
    const path = n.properties.filePath ?? n.properties.name ?? '';
    if (seen.has(path) || !path) continue;

    if (n.label === 'Route') {
      entries.push({ path, role: `HTTP route: ${n.properties.name ?? ''}` });
      seen.add(path);
      continue;
    }

    if (entryIds.has(n.id)) {
      const reason = n.properties.entryPointReason as string | undefined;
      entries.push({ path, role: reason ?? 'entry point' });
      seen.add(path);
    }
  }

  if (entries.length === 0) {
    for (const n of cleanNodes) {
      if (n.label !== 'File') continue;
      const base = (n.properties.filePath ?? '').split('/').pop() ?? '';
      const path = n.properties.filePath ?? base;
      if (ENTRY_FILENAMES[base] && !seen.has(path)) {
        entries.push({ path, role: ENTRY_FILENAMES[base] });
        seen.add(path);
      }
    }
  }

  return entries.slice(0, 5);
}

// ── Module Map ────────────────────────────────────────────────────────────────

export function buildCommunityLabelMap(
  cleanNodes: GraphNode[],
  _degreeMap: Map<string, number>,
  communityMembers: Map<string, GraphNode[]>,
): Map<string, string> {
  const entries: Array<{ id: string; rawName: string; symbolCount: number }> = [];
  for (const n of cleanNodes) {
    if (n.label !== 'Community') continue;
    entries.push({
      id: n.id,
      rawName: (n.properties.name ?? n.properties.heuristicLabel ?? n.id) as string,
      symbolCount: (n.properties.symbolCount as number | undefined)
        ?? (communityMembers.get(n.id)?.length ?? 0),
    });
  }
  entries.sort((a, b) => b.symbolCount - a.symbolCount);

  const TEST_COMMUNITY_RE = /^tests?$|^spec$|^fixtures?$|^__tests__$|^benchmarks?$|^perf$/i;
  const NOISE_COMMUNITY_RE = /^raw$|^examples?$|^demos?$|^samples?$|^worked$/i;

  const nameCount = new Map<string, number>();
  const labels = new Map<string, string>();
  let testSymbolTotal = 0;

  for (const { id, rawName, symbolCount } of entries) {
    if (TEST_COMMUNITY_RE.test(rawName)) {
      testSymbolTotal += symbolCount;
      labels.set(id, '__test__');
      continue;
    }
    if (NOISE_COMMUNITY_RE.test(rawName)) {
      labels.set(id, '__other__');
      continue;
    }
    const isNamed = rawName && !CLUSTER_RE.test(rawName) && !INTERNAL_ID_RE.test(rawName);
    if (!isNamed) {
      labels.set(id, 'Uncategorized');
      continue;
    }
    const seen = nameCount.get(rawName) ?? 0;
    nameCount.set(rawName, seen + 1);
    labels.set(id, seen === 0 ? rawName : `${rawName}·${seen + 1}`);
  }

  if (testSymbolTotal === 0) {
    for (const [id, lbl] of labels) {
      if (lbl === '__test__') labels.set(id, 'Uncategorized');
    }
  }

  return labels;
}

export function buildModuleMap(
  cleanNodes: GraphNode[],
  degreeMap: Map<string, number>,
  communityMembers: Map<string, GraphNode[]>,
  communityLabelMap: Map<string, string>,
): string {
  const communities = cleanNodes.filter((n) => n.label === 'Community');
  if (communities.length === 0) return '';

  const rows: Array<{ label: string; count: number; purpose: string; keyFile: string }> = [];
  let testTotal = 0;
  let noiseTotal = 0;

  for (const comm of communities) {
    const label = communityLabelMap.get(comm.id);
    if (!label || label === 'Uncategorized') continue;

    const members = communityMembers.get(comm.id) ?? [];
    const symbolCount = (comm.properties.symbolCount as number | undefined) ?? members.length;
    if (symbolCount === 0 && members.length === 0) continue;

    if (label === '__test__') { testTotal += symbolCount; continue; }
    if (label === '__other__') { noiseTotal += symbolCount; continue; }

    const fileEntries: Array<{ node: typeof members[number]; degree: number }> = [];
    for (const n of members) {
      if (n.label === 'File') fileEntries.push({ node: n, degree: degreeMap.get(n.id) ?? 0 });
    }
    const keyFileNode = fileEntries.reduce<typeof fileEntries[number] | undefined>(
      (max, cur) => !max || cur.degree > max.degree ? cur : max, undefined
    )?.node;

    const keyFile = keyFileNode?.properties.filePath ?? '';
    const purpose =
      (comm.properties.description as string | undefined) ??
      (Array.isArray(comm.properties.keywords)
        ? (comm.properties.keywords as string[]).slice(0, 4).join(', ')
        : '');

    rows.push({ label, count: symbolCount, purpose, keyFile });
  }

  rows.sort((a, b) => b.count - a.count);
  const top = rows.slice(0, 6);
  const rest = rows.slice(6);

  const otherCount = rest.reduce((s, r) => s + r.count, 0) + noiseTotal;
  if (otherCount > 0) top.push({ label: 'Other', count: otherCount, purpose: '', keyFile: '' });
  if (testTotal > 0) top.push({ label: 'Tests', count: testTotal, purpose: '', keyFile: '' });

  return top
    .map(({ label, count, purpose, keyFile }) => {
      let line = `- **${label}** (${count} symbols)`;
      if (purpose) line += ` — ${purpose}`;
      if (keyFile) line += `; key file \`${keyFile}\``;
      return line;
    })
    .join('\n');
}

// ── Key Symbols ───────────────────────────────────────────────────────────────

function renderSig(node: GraphNode, lang: string): string {
  const name = (node.properties.name ?? node.id) as string;
  const rawRet = node.properties.returnType as string | undefined;
  const ret = rawRet && rawRet !== 'undefined' ? rawRet : undefined;
  const isAsync = node.properties.isAsync as boolean | undefined;
  const label = node.label;
  const async_ = isAsync ? 'async ' : '';

  if (lang === 'python') {
    if (label === 'Class') return `class ${name}: ...`;
    if (label === 'Function' || label === 'Method') {
      return `  ${async_}def ${name}(...)${ret ? ` -> ${ret}` : ''}: ...`;
    }
  } else if (lang === 'go') {
    if (label === 'Function' || label === 'Method') return `func ${name}(...)${ret ? ` ${ret}` : ''} { ... }`;
    if (label === 'Interface') return `type ${name} interface { ... }`;
    if (label === 'Struct') return `type ${name} struct { ... }`;
  } else if (lang === 'rust') {
    if (label === 'Function' || label === 'Method') return `fn ${name}(...)${ret ? ` -> ${ret}` : ''} { ... }`;
    if (label === 'Struct') return `struct ${name} { ... }`;
    if (label === 'Trait') return `trait ${name} { ... }`;
  } else if (lang === 'java' || lang === 'kotlin') {
    if (label === 'Class') return `class ${name} { ... }`;
    if (label === 'Function' || label === 'Method') return `  ${ret ?? 'void'} ${name}(...) { ... }`;
    if (label === 'Interface') return `interface ${name} { ... }`;
  } else {
    if (label === 'Class') return `class ${name} { ... }`;
    if (label === 'Interface') return `interface ${name} { ... }`;
    if (label === 'TypeAlias' || label === 'Type') return `type ${name} = ...`;
    if (label === 'Enum') return `enum ${name} { ... }`;
    if (label === 'Function') return `  ${async_}function ${name}(...)${ret ? `: ${ret}` : ''} { ... }`;
    if (label === 'Method') return `  ${async_}${name}(...)${ret ? `: ${ret}` : ''} { ... }`;
  }

  return `  ${name}: ...`;
}

export function buildKeySymbols(cleanNodes: GraphNode[], degreeMap: Map<string, number>, maxNodes = 12): string {
  const top: Array<{ node: GraphNode; degree: number }> = [];
  for (const n of cleanNodes) {
    if (!SKIP_SYMBOL_LABELS.has(n.label) && !FILE_EXT_RE.test(n.properties.name ?? '')) {
      top.push({ node: n, degree: degreeMap.get(n.id) ?? 0 });
    }
  }
  top.sort((a, b) => b.degree - a.degree);
  top.splice(maxNodes);

  if (top.length === 0) return '(no symbols detected)';

  const byFile = new Map<string, typeof top>();
  for (const entry of top) {
    const fp = entry.node.properties.filePath ?? '(unknown)';
    if (!byFile.has(fp)) byFile.set(fp, []);
    byFile.get(fp)!.push(entry);
  }

  const lines: string[] = [];
  for (const [fp, entries] of byFile) {
    lines.push(`\`${fp}\`:`);
    for (const { node } of entries) {
      const lang = getLang(fp, node.properties.language as string | undefined);
      lines.push(renderSig(node, lang));
    }
  }

  return lines.join('\n');
}

// ── Critical Edges ────────────────────────────────────────────────────────────

export function buildCriticalEdges(
  graph: KnowledgeGraph,
  nodeById: Map<string, GraphNode>,
  testNodeIds: Set<string>,
): string[] {
  const callers = new Map<string, Set<string>>();
  for (const rel of graph.relationships) {
    if (rel.type !== 'CALLS') continue;
    if (testNodeIds.has(rel.sourceId) || testNodeIds.has(rel.targetId)) continue;
    if (!callers.has(rel.targetId)) callers.set(rel.targetId, new Set());
    callers.get(rel.targetId)!.add(rel.sourceId);
  }

  return [...callers.entries()]
    .toSorted((a, b) => b[1].size - a[1].size)
    .slice(0, 5)
    .map(([targetId, callerSet]) => {
      const target = nodeById.get(targetId);
      const name = (target?.properties.name ?? targetId) as string;
      const file = (target?.properties.filePath ?? '').split('/').pop()?.replace(/\.(ts|tsx|js|jsx|py|go|rs)$/, '') ?? '';

      const callerDirs = new Set(
        [...callerSet].flatMap((cid) => {
          const path = nodeById.get(cid)?.properties.filePath as string | undefined ?? '';
          const dir = path.split('/').slice(0, -1).join('/') || path;
          return dir ? [dir] : [];
        }),
      );

      const context = callerDirs.size === 1
        ? `across \`${[...callerDirs][0]}/*\``
        : `across ${callerDirs.size} modules`;

      return `- \`${file ? `${file}.` : ''}${name}\` ← ${callerSet.size} callers ${context}`;
    });
}

// ── Bridge Files ──────────────────────────────────────────────────────────────

function resolveNodeCommunity(
  nodeId: string,
  nodeToCommunity: Map<string, string>,
  graph: KnowledgeGraph,
): string | undefined {
  const direct = nodeToCommunity.get(nodeId);
  if (direct) return direct;

  const memberCommunities: string[] = [];
  for (const rel of graph.relationships) {
    if (rel.type === 'CONTAINS' && rel.sourceId === nodeId) {
      const symbolCommunity = nodeToCommunity.get(rel.targetId);
      if (symbolCommunity) memberCommunities.push(symbolCommunity);
    }
  }
  if (memberCommunities.length === 0) return undefined;

  const freq = new Map<string, number>();
  for (const c of memberCommunities) freq.set(c, (freq.get(c) ?? 0) + 1);
  return [...freq.entries()].reduce<[string, number]>(
    (max, cur) => cur[1] > max[1] ? cur : max, ['', 0]
  )[0];
}

export function buildBridgeFiles(
  cleanNodes: GraphNode[],
  graph: KnowledgeGraph,
  degreeMap: Map<string, number>,
  nodeToCommunity: Map<string, string>,
  communityLabelMap: Map<string, string>,
): string[] {
  const neighbors = new Map<string, Set<string>>();
  for (const rel of graph.relationships) {
    if (!neighbors.has(rel.sourceId)) neighbors.set(rel.sourceId, new Set());
    if (!neighbors.has(rel.targetId)) neighbors.set(rel.targetId, new Set());
    neighbors.get(rel.sourceId)!.add(rel.targetId);
    neighbors.get(rel.targetId)!.add(rel.sourceId);
  }

  const bridges: Array<{ path: string; degree: number; labelA: string; labelB: string }> = [];

  for (const node of cleanNodes) {
    if (node.label !== 'File') continue;
    if (isTestNode(node)) continue;
    const degree = degreeMap.get(node.id) ?? 0;
    if (degree < 2) continue;

    const neighborCommIds = new Set<string>();
    for (const nid of neighbors.get(node.id) ?? []) {
      const commId = resolveNodeCommunity(nid, nodeToCommunity, graph);
      if (commId) neighborCommIds.add(commId);
    }

    if (neighborCommIds.size < 2) continue;

    const BRIDGE_SKIP = new Set(['Uncategorized', '__test__', '__other__']);
    const resolvedLabels: string[] = [];
    for (const id of neighborCommIds) {
      const l = communityLabelMap.get(id);
      if (l && !BRIDGE_SKIP.has(l)) resolvedLabels.push(l);
    }

    const uniqueBases = [...new Set(resolvedLabels.map((l) => l.replace(/·\d+$/, '')))];
    if (uniqueBases.length < 2) continue;

    bridges.push({
      path: node.properties.filePath ?? node.id,
      degree,
      labelA: uniqueBases[0],
      labelB: uniqueBases[1],
    });
  }

  return bridges
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 3)
    .map(({ path, labelA, labelB }) => `- \`${path}\` — connects ${labelA} ↔ ${labelB}`);
}

// ── Boundaries + Pointers ─────────────────────────────────────────────────────

export function detectBoundaries(cleanNodes: GraphNode[]): string[] {
  const found = new Set<string>();
  const lines: string[] = [];
  let hasDotEnv = false;

  for (const n of cleanNodes) {
    if (n.label !== 'File' && n.label !== 'Folder') continue;
    const path = n.properties.filePath ?? '';
    const base = path.split('/').pop() ?? '';

    if (!hasDotEnv && (base.startsWith('.env') || base.endsWith('.env'))) {
      hasDotEnv = true;
      lines.push('- Never commit `*.env` files');
    }

    for (const [pattern, advice] of DANGEROUS_PATHS) {
      if (!found.has(pattern) && path.includes(pattern)) {
        found.add(pattern);
        lines.push(`- Never edit \`${pattern}\`; ${advice}`);
      }
    }
  }

  return lines;
}

export function detectPointers(cleanNodes: GraphNode[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const n of cleanNodes) {
    if (n.label !== 'File') continue;
    const path = n.properties.filePath ?? '';
    const base = path.split('/').pop() ?? '';
    if (DOC_BASENAMES[base] && !seen.has(base)) {
      seen.add(base);
      lines.push(`- ${DOC_BASENAMES[base]}: \`${path}\``);
    }
  }

  return lines;
}
