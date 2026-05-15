// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { NODE_TABLES, REL_TYPES } from 'gitnexus-shared';
import type { EnrichedSearchResult, GrepResult } from '../../../services/backend-client';

export type { EnrichedSearchResult, GrepResult };

export interface GraphRAGBackend {
  executeQuery: (cypher: string) => Promise<Record<string, unknown>[]>;
  search: (
    query: string,
    opts?: { limit?: number; mode?: 'hybrid' | 'semantic' | 'bm25'; enrich?: boolean },
  ) => Promise<EnrichedSearchResult[]>;
  grep: (pattern: string, limit?: number) => Promise<GrepResult[]>;
  readFile: (filePath: string) => Promise<string>;
}

export const validLabel = (label: string): boolean =>
  (NODE_TABLES as readonly string[]).includes(label);

export const validRelType = (t: string): boolean =>
  (REL_TYPES as readonly string[]).includes(t);

export const getRowValue = (row: any, idx: number, key: string) =>
  Array.isArray(row) ? row[idx] : row[key];
