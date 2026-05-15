// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

export type { GraphRAGBackend } from './types';

import { createSearchTool } from './search-tool';
import { createCypherTool } from './cypher-tool';
import { createGrepTool } from './grep-tool';
import { createReadTool } from './read-tool';
import { createOverviewTool } from './overview-tool';
import { createExploreTool } from './explore-tool';
import { createImpactTool } from './impact-tool';
import type { GraphRAGBackend } from './types';

export const createGraphRAGTools = (backend: GraphRAGBackend) => [
  createSearchTool(backend),
  createCypherTool(backend),
  createGrepTool(backend),
  createReadTool(backend),
  createOverviewTool(backend),
  createExploreTool(backend),
  createImpactTool(backend),
];
