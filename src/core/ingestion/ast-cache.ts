// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { LRUCache } from 'lru-cache';
import type { Tree } from 'web-tree-sitter';

// Define the interface for the Cache
export interface ASTCache {
  get: (filePath: string) => Tree | undefined;
  set: (filePath: string, tree: Tree) => void;
  clear: () => void;
  stats: () => { size: number; maxSize: number };
}

export const createASTCache = (maxSize: number = 50): ASTCache => {
  // Initialize the cache with a 'dispose' handler
  // This is the magic: When an item is evicted (dropped), this runs automatically.
  const cache = new LRUCache<string, Tree>({
    max: maxSize,
    dispose: (tree) => {
      try {
        // CRITICAL: Free the WASM memory when the tree leaves the cache
        tree.delete();
      } catch (e) {
        console.warn('Failed to delete tree from WASM memory', e);
      }
    }
  });

  return {
    get: (filePath: string) => {
      const tree = cache.get(filePath);
      return tree; // Returns undefined if not found
    },
    
    set: (filePath: string, tree: Tree) => {
      cache.set(filePath, tree);
    },
    
    clear: () => {
      cache.clear();
    },

    stats: () => ({
      size: cache.size,
      maxSize: maxSize
    })
  };
};

