// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

/**
 * Search Module
 * 
 * Exports BM25 indexing and hybrid search functionality.
 */

export { 
  buildBM25Index, 
  searchBM25, 
  isBM25Ready, 
  getBM25Stats,
  clearBM25Index,
  type BM25SearchResult,
} from './bm25-index';

export { 
  mergeWithRRF, 
  isHybridSearchReady,
  formatHybridResults,
  type HybridSearchResult,
} from './hybrid-search';




