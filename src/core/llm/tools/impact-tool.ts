// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { REL_TYPES } from 'gitnexus-shared';
import type { GraphRAGBackend } from './types';
import { validRelType } from './types';

interface NodeInfo {
  id: string;
  name: string;
  nodeType: string;
  filePath: string;
  startLine?: number;
  edgeType: string;
  confidence: number;
  reason: string;
}

const isTestFile = (path: string): boolean => {
  if (!path) return false;
  const p = path.toLowerCase();
  return (
    p.includes('.test.') ||
    p.includes('.spec.') ||
    p.includes('__tests__') ||
    p.includes('__mocks__') ||
    p.endsWith('.test.ts') ||
    p.endsWith('.test.tsx') ||
    p.endsWith('.spec.ts') ||
    p.endsWith('.spec.tsx')
  );
};

const parseRow = (row: any, idx: number, key: string) =>
  Array.isArray(row) ? row[idx] : row[key];

const buildDepthQuery = (
  direction: 'upstream' | 'downstream',
  depth: 1 | 2 | 3,
  targetId: string,
  targetFilePath: string,
  isFileTarget: boolean,
  relTypeFilter: string,
  minConf: number,
): string => {
  const escapedId = targetId.replace(/'/g, "''");
  const escapedPath = (targetFilePath || targetId).replace(/'/g, "''");
  const returnCols = `DISTINCT
    affected.id AS id,
    affected.name AS name,
    label(affected) AS nodeType,
    affected.filePath AS filePath,
    affected.startLine AS startLine,
    ${depth} AS depth,
    r${depth === 1 ? '' : depth}.type AS edgeType,
    r${depth === 1 ? '' : depth}.confidence AS confidence,
    r${depth === 1 ? '' : depth}.reason AS reason`;

  if (depth === 1) {
    if (direction === 'upstream') {
      return isFileTarget
        ? `MATCH (affected)-[r:CodeRelation]->(callee)
           WHERE callee.filePath = '${escapedPath}'
             AND r.type IN [${relTypeFilter}]
             AND affected.filePath <> callee.filePath
             AND (r.confidence IS NULL OR r.confidence >= ${minConf})
           RETURN ${returnCols.replace('r.type', 'r.type').replace('r.confidence', 'r.confidence').replace('r.reason', 'r.reason').replace('r${depth === 1 ? \'\' : depth}', 'r')}
           LIMIT 300`
        : `MATCH (target {id: '${escapedId}'})
           MATCH (affected)-[r:CodeRelation]->(target)
           WHERE r.type IN [${relTypeFilter}]
             AND (r.confidence IS NULL OR r.confidence >= ${minConf})
           RETURN DISTINCT affected.id AS id, affected.name AS name, label(affected) AS nodeType,
             affected.filePath AS filePath, affected.startLine AS startLine, 1 AS depth,
             r.type AS edgeType, r.confidence AS confidence, r.reason AS reason
           LIMIT 300`;
    } else {
      return isFileTarget
        ? `MATCH (caller)-[r:CodeRelation]->(affected)
           WHERE caller.filePath = '${escapedPath}'
             AND r.type IN [${relTypeFilter}]
             AND caller.filePath <> affected.filePath
             AND (r.confidence IS NULL OR r.confidence >= ${minConf})
           RETURN DISTINCT affected.id AS id, affected.name AS name, label(affected) AS nodeType,
             affected.filePath AS filePath, affected.startLine AS startLine, 1 AS depth,
             r.type AS edgeType, r.confidence AS confidence, r.reason AS reason
           LIMIT 300`
        : `MATCH (target {id: '${escapedId}'})
           MATCH (target)-[r:CodeRelation]->(affected)
           WHERE r.type IN [${relTypeFilter}]
             AND (r.confidence IS NULL OR r.confidence >= ${minConf})
           RETURN DISTINCT affected.id AS id, affected.name AS name, label(affected) AS nodeType,
             affected.filePath AS filePath, affected.startLine AS startLine, 1 AS depth,
             r.type AS edgeType, r.confidence AS confidence, r.reason AS reason
           LIMIT 300`;
    }
  }

  if (depth === 2) {
    return direction === 'upstream'
      ? `MATCH (target {id: '${escapedId}'})
         MATCH (a)-[r1:CodeRelation]->(target)
         MATCH (affected)-[r2:CodeRelation]->(a)
         WHERE r1.type IN [${relTypeFilter}] AND r2.type IN [${relTypeFilter}]
           AND affected.id <> target.id
           AND (r1.confidence IS NULL OR r1.confidence >= ${minConf})
           AND (r2.confidence IS NULL OR r2.confidence >= ${minConf})
         RETURN DISTINCT affected.id AS id, affected.name AS name, label(affected) AS nodeType,
           affected.filePath AS filePath, affected.startLine AS startLine, 2 AS depth,
           r2.type AS edgeType, r2.confidence AS confidence, r2.reason AS reason
         LIMIT 200`
      : `MATCH (target {id: '${escapedId}'})
         MATCH (target)-[r1:CodeRelation]->(a)
         MATCH (a)-[r2:CodeRelation]->(affected)
         WHERE r1.type IN [${relTypeFilter}] AND r2.type IN [${relTypeFilter}]
           AND affected.id <> target.id
           AND (r1.confidence IS NULL OR r1.confidence >= ${minConf})
           AND (r2.confidence IS NULL OR r2.confidence >= ${minConf})
         RETURN DISTINCT affected.id AS id, affected.name AS name, label(affected) AS nodeType,
           affected.filePath AS filePath, affected.startLine AS startLine, 2 AS depth,
           r2.type AS edgeType, r2.confidence AS confidence, r2.reason AS reason
         LIMIT 200`;
  }

  // depth === 3
  return direction === 'upstream'
    ? `MATCH (target {id: '${escapedId}'})
       MATCH (a)-[r1:CodeRelation]->(target)
       MATCH (b)-[r2:CodeRelation]->(a)
       MATCH (affected)-[r3:CodeRelation]->(b)
       WHERE r1.type IN [${relTypeFilter}] AND r2.type IN [${relTypeFilter}] AND r3.type IN [${relTypeFilter}]
         AND affected.id <> target.id AND affected.id <> a.id
         AND (r1.confidence IS NULL OR r1.confidence >= ${minConf})
         AND (r2.confidence IS NULL OR r2.confidence >= ${minConf})
         AND (r3.confidence IS NULL OR r3.confidence >= ${minConf})
       RETURN DISTINCT affected.id AS id, affected.name AS name, label(affected) AS nodeType,
         affected.filePath AS filePath, affected.startLine AS startLine, 3 AS depth,
         r3.type AS edgeType, r3.confidence AS confidence, r3.reason AS reason
       LIMIT 100`
    : `MATCH (target {id: '${escapedId}'})
       MATCH (target)-[r1:CodeRelation]->(a)
       MATCH (a)-[r2:CodeRelation]->(b)
       MATCH (b)-[r3:CodeRelation]->(affected)
       WHERE r1.type IN [${relTypeFilter}] AND r2.type IN [${relTypeFilter}] AND r3.type IN [${relTypeFilter}]
         AND affected.id <> target.id AND affected.id <> a.id
         AND (r1.confidence IS NULL OR r1.confidence >= ${minConf})
         AND (r2.confidence IS NULL OR r2.confidence >= ${minConf})
         AND (r3.confidence IS NULL OR r3.confidence >= ${minConf})
       RETURN DISTINCT affected.id AS id, affected.name AS name, label(affected) AS nodeType,
         affected.filePath AS filePath, affected.startLine AS startLine, 3 AS depth,
         r3.type AS edgeType, r3.confidence AS confidence, r3.reason AS reason
       LIMIT 100`;
};

export const createImpactTool = (
  backend: Pick<GraphRAGBackend, 'executeQuery' | 'grep' | 'readFile'>,
) =>
  tool(
    async ({
      target,
      direction,
      maxDepth,
      relationTypes,
      includeTests,
      minConfidence,
    }: {
      target: string;
      direction: 'upstream' | 'downstream';
      maxDepth?: number;
      relationTypes?: string[];
      includeTests?: boolean;
      minConfidence?: number;
    }) => {
      const depth = Math.min(maxDepth ?? 3, 10);
      const showTests = includeTests ?? false;
      const minConf = minConfidence ?? 0.7;

      const defaultRelTypes = ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS'];
      const activeRelTypes =
        relationTypes && relationTypes.length > 0
          ? relationTypes.filter((t) => validRelType(t))
          : defaultRelTypes;
      if (activeRelTypes.length === 0) {
        return `No valid relation types provided. Valid types: ${(REL_TYPES as readonly string[]).join(', ')}`;
      }
      const relTypeFilter = activeRelTypes.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');

      const isPathQuery = target.includes('/');
      const escapedTarget = target.replace(/'/g, "''");

      const findTargetQuery = isPathQuery
        ? `MATCH (n)
           WHERE n.filePath IS NOT NULL AND n.filePath CONTAINS '${escapedTarget}'
           RETURN n.id AS id, label(n) AS nodeType, n.filePath AS filePath
           LIMIT 10`
        : `MATCH (n)
           WHERE n.name = '${escapedTarget}'
           RETURN n.id AS id, label(n) AS nodeType, n.filePath AS filePath
           LIMIT 10`;

      let targetResults;
      try {
        targetResults = await backend.executeQuery(findTargetQuery);
      } catch (error) {
        return `Error finding target "${target}": ${error}`;
      }

      if (!targetResults || targetResults.length === 0) {
        return `Could not find "${target}" in the codebase. Try using the search tool first to find the exact name.`;
      }

      const allPaths = targetResults.flatMap((r: any) => {
        const p = parseRow(r, 2, 'filePath');
        return p ? [p] : [];
      });

      if (targetResults.length > 1 && !target.includes('/')) {
        return `⚠️ AMBIGUOUS TARGET: Multiple files named "${target}" found:\n\n${allPaths.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\nPlease specify which file you mean by using a more specific path, e.g.:\n- impact("${allPaths[0].split('/').slice(-3).join('/')}")\n- impact("${allPaths[1]?.split('/').slice(-3).join('/') || allPaths[0]}")`;
      }

      let targetNode = targetResults[0];
      if (target.includes('/') && targetResults.length > 1) {
        const exactMatch = targetResults.find((r: any) => {
          const path = parseRow(r, 2, 'filePath');
          return path && path.toLowerCase().includes(target.toLowerCase());
        });
        if (exactMatch) {
          targetNode = exactMatch;
        } else {
          return `⚠️ AMBIGUOUS TARGET: Could not uniquely match "${target}". Found:\n\n${allPaths.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\nPlease use a more specific path.`;
        }
      }

      const targetId = parseRow(targetNode, 0, 'id');
      const targetType = parseRow(targetNode, 1, 'nodeType');
      const targetFilePath = parseRow(targetNode, 2, 'filePath');

      if (import.meta.env.DEV) {
        console.log(
          `🎯 Impact: Found target "${target}" → id=${targetId}, type=${targetType}, filePath=${targetFilePath}`,
        );
      }

      const isFileTarget = targetType === 'File';

      const depthQueries: Promise<any[]>[] = [];

      for (let d = 1; d <= Math.min(depth, 3); d++) {
        const query = buildDepthQuery(
          direction,
          d as 1 | 2 | 3,
          targetId,
          targetFilePath,
          isFileTarget,
          relTypeFilter,
          minConf,
        );
        depthQueries.push(
          backend.executeQuery(query).catch((err) => {
            if (import.meta.env.DEV) console.warn(`Impact d=${d} query failed:`, err);
            return [];
          }),
        );
      }

      const depthResults = await Promise.all(depthQueries);

      const byDepth: Map<number, NodeInfo[]> = new Map();
      const allNodeIds: string[] = [];
      const seenIds = new Set<string>();

      depthResults.forEach((results, idx) => {
        const d = idx + 1;
        results.forEach((row: any) => {
          const nodeId = parseRow(row, 0, 'id');
          const filePath = parseRow(row, 3, 'filePath');

          if (!showTests && isTestFile(filePath)) return;

          if (nodeId && !seenIds.has(nodeId)) {
            seenIds.add(nodeId);
            if (!byDepth.has(d)) byDepth.set(d, []);

            byDepth.get(d)!.push({
              id: nodeId,
              name: parseRow(row, 1, 'name'),
              nodeType: parseRow(row, 2, 'nodeType'),
              filePath,
              startLine: parseRow(row, 4, 'startLine'),
              edgeType: parseRow(row, 5, 'edgeType') || 'CALLS',
              confidence: parseRow(row, 6, 'confidence') ?? 1.0,
              reason: parseRow(row, 7, 'reason') || '',
            });
            allNodeIds.push(nodeId);
          }
        });
      });

      const totalAffected = allNodeIds.length;

      if (totalAffected === 0) {
        if (isFileTarget) {
          const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const targetFileName = (targetFilePath || target).split('/').pop() || target;
          const baseName = targetFileName.replace(/\.[^/.]+$/, '');
          try {
            const hints = await backend.grep(`\\b${escapeRegex(baseName)}\\b`, 15);
            const filtered = hints.filter((h) => h.filePath !== targetFilePath);
            if (filtered.length > 0) {
              const formatted = filtered.map((h) => `${h.filePath}:${h.line}: ${h.text}`).join('\n');
              return `No ${direction} dependencies found for "${target}" (types: ${activeRelTypes.join(', ')}), but textual references were detected (graph may be incomplete):\n\n${formatted}`;
            }
          } catch {
            // grep fallback failed
          }
        }
        return `No ${direction} dependencies found for "${target}" (types: ${activeRelTypes.join(', ')}). This code appears to be ${direction === 'upstream' ? 'unused (not called by anything)' : 'self-contained (no outgoing dependencies)'}.`;
      }

      const depth1 = byDepth.get(1) || [];
      const depth2 = byDepth.get(2) || [];
      const depth3 = byDepth.get(3) || [];

      const confidenceBuckets = { high: 0, medium: 0, low: 0 };
      for (const nodes of byDepth.values()) {
        for (const n of nodes) {
          const conf = n.confidence ?? 1;
          if (conf >= 0.9) confidenceBuckets.high += 1;
          else if (conf >= 0.8) confidenceBuckets.medium += 1;
          else confidenceBuckets.low += 1;
        }
      }

      const maxIdsForContext = 500;
      const trimmedIds = allNodeIds.slice(0, maxIdsForContext);
      const idList = trimmedIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');

      let affectedProcesses: Array<{
        label: string;
        hits: number;
        minStep: number | null;
        stepCount: number | null;
      }> = [];
      let affectedClusters: Array<{ label: string; hits: number; impact: string }> = [];

      if (trimmedIds.length > 0) {
        const directIdList = depth1.map((n) => `'${n.id.replace(/'/g, "''")}'`).join(', ');
        const directClusterQuery =
          depth1.length > 0
            ? `MATCH (s)-[:CodeRelation {type: 'MEMBER_OF'}]->(c:Community)
               WHERE s.id IN [${directIdList}]
               RETURN DISTINCT c.label AS label`
            : '';

        const [processRes, clusterRes, directClusterRes] = await Promise.all([
          backend.executeQuery(`
            MATCH (s)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
            WHERE s.id IN [${idList}]
            RETURN p.label AS label, COUNT(DISTINCT s.id) AS hits, MIN(r.step) AS minStep, p.stepCount AS stepCount
            ORDER BY hits DESC
            LIMIT 20
          `),
          backend.executeQuery(`
            MATCH (s)-[:CodeRelation {type: 'MEMBER_OF'}]->(c:Community)
            WHERE s.id IN [${idList}]
            RETURN c.label AS label, COUNT(DISTINCT s.id) AS hits
            ORDER BY hits DESC
            LIMIT 20
          `),
          directClusterQuery
            ? backend.executeQuery(directClusterQuery)
            : Promise.resolve([]),
        ]);

        const directClusterSet = new Set<string>();
        directClusterRes.forEach((row: any) => {
          const label = parseRow(row, 0, 'label');
          if (label) directClusterSet.add(label);
        });

        affectedProcesses = processRes.map((row: any) => ({
          label: parseRow(row, 0, 'label'),
          hits: parseRow(row, 1, 'hits'),
          minStep: parseRow(row, 2, 'minStep'),
          stepCount: parseRow(row, 3, 'stepCount'),
        }));

        affectedClusters = clusterRes.map((row: any) => {
          const label = parseRow(row, 0, 'label');
          const hits = parseRow(row, 1, 'hits');
          return { label, hits, impact: directClusterSet.has(label) ? 'direct' : 'indirect' };
        });
      }

      const directCount = depth1.length;
      const processCount = affectedProcesses.length;
      const clusterCount = affectedClusters.length;
      let risk = 'LOW';
      if (directCount >= 30 || processCount >= 5 || clusterCount >= 5 || totalAffected >= 200) {
        risk = 'CRITICAL';
      } else if (directCount >= 15 || processCount >= 3 || clusterCount >= 3 || totalAffected >= 100) {
        risk = 'HIGH';
      } else if (directCount >= 5 || totalAffected >= 30) {
        risk = 'MEDIUM';
      }

      const formatNode = (n: NodeInfo): string => {
        const fileName = n.filePath?.split('/').pop() || '';
        const loc = n.startLine ? `${fileName}:${n.startLine}` : fileName;
        const confPct = Math.round((n.confidence ?? 1) * 100);
        const fuzzyMarker = confPct < 80 ? '[fuzzy]' : '';
        return `  ${n.nodeType}|${n.name}|${loc}|${n.edgeType}|${confPct}%${fuzzyMarker}`;
      };

      const getCallSiteSnippet = async (n: NodeInfo): Promise<string | null> => {
        if (!n.filePath || !n.startLine) return null;
        try {
          const content = await backend.readFile(n.filePath);
          const fileLines = content.split('\n');
          const lineIdx = n.startLine - 1;
          if (lineIdx < 0 || lineIdx >= fileLines.length) return null;
          let snippet = fileLines[lineIdx].trim();
          if (snippet.length > 80) snippet = snippet.slice(0, 77) + '...';
          return snippet;
        } catch {
          return null;
        }
      };

      const lines: string[] = [
        `🔴 IMPACT: ${target} | ${direction} | ${totalAffected} affected`,
        `Confidence: High ${confidenceBuckets.high} | Medium ${confidenceBuckets.medium} | Low ${confidenceBuckets.low}`,
        ``,
        `AFFECTED PROCESSES:`,
        ...(affectedProcesses.length > 0
          ? affectedProcesses.map(
              (p) =>
                `- ${p.label} - BROKEN at step ${p.minStep ?? '?'} (${p.hits} symbols, ${p.stepCount ?? '?'} steps)`,
            )
          : ['- None found']),
        ``,
        `AFFECTED CLUSTERS:`,
        ...(affectedClusters.length > 0
          ? affectedClusters.map((c) => `- ${c.label} (${c.impact}, ${c.hits} symbols)`)
          : ['- None found']),
        ``,
        `RISK: ${risk}`,
        `- Direct callers: ${directCount}`,
        `- Processes affected: ${processCount}`,
        `- Clusters affected: ${clusterCount}`,
        ``,
      ];

      if (depth1.length > 0) {
        const header =
          direction === 'upstream'
            ? `d=1 (Directly DEPEND ON ${target}):`
            : `d=1 (${target} USES these):`;
        lines.push(header);
        for (const n of depth1.slice(0, 15)) {
          lines.push(formatNode(n));
          const snippet = await getCallSiteSnippet(n);
          if (snippet) lines.push(`    ↳ "${snippet}"`);
        }
        if (depth1.length > 15) lines.push(`  ... +${depth1.length - 15} more`);
        lines.push(``);
      }

      if (depth2.length > 0) {
        const header =
          direction === 'upstream'
            ? `d=2 (Indirectly DEPEND ON ${target}):`
            : `d=2 (${target} USES these indirectly):`;
        lines.push(header);
        depth2.slice(0, 15).forEach((n) => lines.push(formatNode(n)));
        if (depth2.length > 15) lines.push(`  ... +${depth2.length - 15} more`);
        lines.push(``);
      }

      if (depth3.length > 0) {
        lines.push(`d=3 (Deep impact/dependency):`);
        depth3.slice(0, 5).forEach((n) => lines.push(formatNode(n)));
        if (depth3.length > 5) lines.push(`  ... +${depth3.length - 5} more`);
        lines.push(``);
      }

      lines.push(`✅ GRAPH ANALYSIS COMPLETE (trusted)`);
      lines.push(`⚠️ Optional: grep("${target}") for dynamic patterns`);
      lines.push(``);

      return lines.join('\n');
    },
    {
      name: 'impact',
      description: `Analyze the impact of changing a function, class, or file.

Use when users ask:
- "What would break if I changed X?"
- "What depends on X?"
- "Impact analysis for X"

Direction:
- upstream: Find what CALLS/IMPORTS/EXTENDS this target (what would break)
- downstream: Find what this target CALLS/IMPORTS/EXTENDS (dependencies)

Output format (compact tabular):
  Type|Name|File:Line|EdgeType|Confidence%

EdgeType: CALLS, IMPORTS, EXTENDS, IMPLEMENTS
Confidence: 100% = certain, <80% = fuzzy match (may be false positive)

relationTypes filter (optional):
- Default: CALLS, IMPORTS, EXTENDS, IMPLEMENTS (usage-based)
- Can add CONTAINS, DEFINES for structural analysis

Additional output sections:
- Affected processes (with step impact)
- Affected clusters (direct/indirect)
- Risk summary (based on direct callers, processes, clusters)`,
      schema: z.object({
        target: z.string().describe('Name of the function, class, or file to analyze'),
        direction: z
          .enum(['upstream', 'downstream'])
          .describe('upstream = what depends on this; downstream = what this depends on'),
        maxDepth: z
          .number()
          .optional()
          .nullable()
          .describe('Max traversal depth (default: 3, max: 10)'),
        relationTypes: z
          .array(z.string())
          .optional()
          .nullable()
          .describe(
            'Filter by relation types: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, CONTAINS, DEFINES (default: usage-based)',
          ),
        includeTests: z
          .boolean()
          .optional()
          .nullable()
          .describe(
            'Include test files in results (default: false, excludes .test.ts, .spec.ts, __tests__)',
          ),
        minConfidence: z
          .number()
          .optional()
          .nullable()
          .describe('Minimum edge confidence 0-1 (default: 0.7, excludes fuzzy/inferred matches)'),
      }),
    },
  );
