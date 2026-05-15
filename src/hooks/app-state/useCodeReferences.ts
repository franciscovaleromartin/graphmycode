// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { useState, useCallback, useEffect } from 'react';
import type { GraphNode } from 'gitnexus-shared';

export interface CodeReference {
  id: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  nodeId?: string;
  label?: string;
  name?: string;
  source: 'ai' | 'user';
}

export interface CodeReferenceFocus {
  filePath: string;
  startLine?: number;
  endLine?: number;
  ts: number;
}

interface Deps {
  selectedNode: GraphNode | null;
  setAICitationHighlightedNodeIds: (fn: (prev: Set<string>) => Set<string>) => void;
}

export function useCodeReferences({ selectedNode, setAICitationHighlightedNodeIds }: Deps) {
  const [codeReferences, setCodeReferences] = useState<CodeReference[]>([]);
  const [isCodePanelOpen, setCodePanelOpen] = useState(false);
  const [codeReferenceFocus, setCodeReferenceFocus] = useState<CodeReferenceFocus | null>(null);

  const addCodeReference = useCallback(
    (ref: Omit<CodeReference, 'id'>) => {
      const id = `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newRef: CodeReference = { ...ref, id };

      setCodeReferences((prev) => {
        const isDuplicate = prev.some(
          (r) =>
            r.filePath === ref.filePath &&
            r.startLine === ref.startLine &&
            r.endLine === ref.endLine,
        );
        if (isDuplicate) return prev;
        return [...prev, newRef];
      });

      setCodePanelOpen(true);

      setCodeReferenceFocus({
        filePath: ref.filePath,
        startLine: ref.startLine,
        endLine: ref.endLine,
        ts: Date.now(),
      });

      if (ref.nodeId && ref.source === 'ai') {
        setAICitationHighlightedNodeIds((prev) => new Set([...prev, ref.nodeId!]));
      }
    },
    [setAICitationHighlightedNodeIds],
  );

  const removeCodeReference = useCallback(
    (id: string) => {
      setCodeReferences((prev) => {
        const ref = prev.find((r) => r.id === id);
        const newRefs = prev.filter((r) => r.id !== id);

        if (ref?.nodeId && ref.source === 'ai') {
          const stillReferenced = newRefs.some(
            (r) => r.nodeId === ref.nodeId && r.source === 'ai',
          );
          if (!stillReferenced) {
            setAICitationHighlightedNodeIds((prevIds) => {
              const next = new Set(prevIds);
              next.delete(ref.nodeId!);
              return next;
            });
          }
        }

        if (newRefs.length === 0 && !selectedNode) setCodePanelOpen(false);
        return newRefs;
      });
    },
    [selectedNode, setAICitationHighlightedNodeIds],
  );

  const clearAICodeReferences = useCallback(() => {
    setCodeReferences((prev) => {
      const removed = prev.filter((r) => r.source === 'ai');
      const kept = prev.filter((r) => r.source !== 'ai');

      const removedNodeIds = new Set(removed.flatMap((r) => (r.nodeId ? [r.nodeId] : [])));
      if (removedNodeIds.size > 0) {
        setAICitationHighlightedNodeIds((prevIds) => {
          const next = new Set(prevIds);
          for (const id of removedNodeIds) next.delete(id);
          return next;
        });
      }

      if (kept.length === 0 && !selectedNode) setCodePanelOpen(false);
      return kept;
    });
  }, [selectedNode, setAICitationHighlightedNodeIds]);

  const clearCodeReferences = useCallback(() => {
    setCodeReferences([]);
    setCodePanelOpen(false);
    setCodeReferenceFocus(null);
  }, []);

  useEffect(() => {
    if (!selectedNode) return;
    setCodePanelOpen(true);
  }, [selectedNode]);

  return {
    codeReferences,
    setCodeReferences,
    isCodePanelOpen,
    setCodePanelOpen,
    codeReferenceFocus,
    setCodeReferenceFocus,
    addCodeReference,
    removeCodeReference,
    clearAICodeReferences,
    clearCodeReferences,
  };
}
