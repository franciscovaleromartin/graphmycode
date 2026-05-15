// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { GraphRAGBackend } from './types';
import { getRowValue } from './types';

export const createOverviewTool = (backend: Pick<GraphRAGBackend, 'executeQuery'>) =>
  tool(
    async () => {
      try {
        const clustersQuery = `
          MATCH (c:Community)
          RETURN c.id AS id, c.label AS label, c.cohesion AS cohesion, c.symbolCount AS symbolCount, c.description AS description
          ORDER BY c.symbolCount DESC
          LIMIT 200
        `;
        const processesQuery = `
          MATCH (p:Process)
          RETURN p.id AS id, p.label AS label, p.processType AS type, p.stepCount AS stepCount, p.communities AS communities
          ORDER BY p.stepCount DESC
          LIMIT 200
        `;
        const depsQuery = `
          MATCH (a)-[:CodeRelation {type: 'CALLS'}]->(b)
          MATCH (a)-[:CodeRelation {type: 'MEMBER_OF'}]->(c1:Community)
          MATCH (b)-[:CodeRelation {type: 'MEMBER_OF'}]->(c2:Community)
          WHERE c1.id <> c2.id
          RETURN c1.label AS \`from\`, c2.label AS \`to\`, COUNT(*) AS calls
          ORDER BY calls DESC
          LIMIT 15
        `;
        const criticalQuery = `
          MATCH (s)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
          RETURN p.label AS label, COUNT(r) AS steps
          ORDER BY steps DESC
          LIMIT 10
        `;

        const [clusters, processes, deps, critical] = await Promise.all([
          backend.executeQuery(clustersQuery),
          backend.executeQuery(processesQuery),
          backend.executeQuery(depsQuery),
          backend.executeQuery(criticalQuery),
        ]);

        const clusterLines = clusters.map((row: any) => {
          const label = getRowValue(row, 1, 'label');
          const symbols = getRowValue(row, 3, 'symbolCount');
          const cohesion = getRowValue(row, 2, 'cohesion');
          const desc = getRowValue(row, 4, 'description');
          const cohesionText =
            cohesion !== null && cohesion !== undefined ? Number(cohesion).toFixed(2) : '';
          return `| ${label || ''} | ${symbols ?? ''} | ${cohesionText} | ${desc ?? ''} |`;
        });

        const processLines = processes.map((row: any) => {
          const label = getRowValue(row, 1, 'label');
          const steps = getRowValue(row, 3, 'stepCount');
          const type = getRowValue(row, 2, 'type');
          const communities = getRowValue(row, 4, 'communities');
          const clusterText = Array.isArray(communities) ? communities.length : communities ? 1 : 0;
          return `| ${label || ''} | ${steps ?? ''} | ${type ?? ''} | ${clusterText} |`;
        });

        const depLines = deps.map((row: any) => {
          const from = getRowValue(row, 0, 'from');
          const to = getRowValue(row, 1, 'to');
          const calls = getRowValue(row, 2, 'calls');
          return `- ${from} -> ${to} (${calls} calls)`;
        });

        const criticalLines = critical.map((row: any) => {
          const label = getRowValue(row, 0, 'label');
          const steps = getRowValue(row, 1, 'steps');
          return `- ${label} (${steps} steps)`;
        });

        return [
          `CLUSTERS (${clusters.length} total):`,
          `| Cluster | Symbols | Cohesion | Description |`,
          `| --- | --- | --- | --- |`,
          ...clusterLines,
          ``,
          `PROCESSES (${processes.length} total):`,
          `| Process | Steps | Type | Clusters |`,
          `| --- | --- | --- | --- |`,
          ...processLines,
          ``,
          `CLUSTER DEPENDENCIES:`,
          ...(depLines.length > 0 ? depLines : ['- None found']),
          ``,
          `CRITICAL PATHS:`,
          ...(criticalLines.length > 0 ? criticalLines : ['- None found']),
        ].join('\n');
      } catch (error) {
        return `Overview error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'overview',
      description:
        'Codebase map showing all clusters and processes, plus cross-cluster dependencies.',
      schema: z.object({}),
    },
  );
