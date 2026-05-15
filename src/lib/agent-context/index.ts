// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { KnowledgeGraph } from '../../core/graph/types';
import { buildBase } from './analysis';
import { buildClaudeMd, buildAgentsMd } from './builders';
import { triggerDownload } from './types';

export function exportAgentContext(
  graph: KnowledgeGraph,
  projectName: string,
  externalDeps: Record<string, string[]>,
  isAgent = false,
): void {
  const base = buildBase(graph, externalDeps);
  triggerDownload(buildClaudeMd(graph, projectName, base), 'CLAUDE.md');
  if (isAgent) {
    const agentsMdContent = buildAgentsMd(graph, projectName, base);
    setTimeout(() => triggerDownload(agentsMdContent, 'AGENTS.md'), 100);
  }
}

/** @deprecated use exportAgentContext */
export function buildAgentContext(
  graph: KnowledgeGraph,
  projectName: string,
  externalDeps: Record<string, string[]>,
  isAgent = false,
): string {
  const base = buildBase(graph, externalDeps);
  void isAgent;
  return buildClaudeMd(graph, projectName, base);
}
