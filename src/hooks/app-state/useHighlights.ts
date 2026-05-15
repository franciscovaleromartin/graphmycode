// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { useState, useCallback, useRef } from 'react';

export type AnimationType = 'pulse' | 'ripple' | 'glow';

export interface NodeAnimation {
  type: AnimationType;
  startTime: number;
  duration: number;
}

const ANIMATION_DURATIONS: Record<AnimationType, number> = {
  pulse: 2000,
  ripple: 3000,
  glow: 4000,
};

export function useHighlights() {
  const [aiCitationHighlightedNodeIds, setAICitationHighlightedNodeIds] = useState<Set<string>>(
    new Set(),
  );
  const [aiToolHighlightedNodeIds, setAIToolHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [blastRadiusNodeIds, setBlastRadiusNodeIds] = useState<Set<string>>(new Set());
  const [isAIHighlightsEnabled, setAIHighlightsEnabled] = useState(true);
  const [animatedNodes, setAnimatedNodes] = useState<Map<string, NodeAnimation>>(new Map());
  const animationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleAIHighlights = useCallback(() => setAIHighlightsEnabled((prev) => !prev), []);

  const clearAIToolHighlights = useCallback(
    () => setAIToolHighlightedNodeIds(new Set()),
    [],
  );

  const clearAICitationHighlights = useCallback(
    () => setAICitationHighlightedNodeIds(new Set()),
    [],
  );

  const clearBlastRadius = useCallback(() => setBlastRadiusNodeIds(new Set()), []);

  const triggerNodeAnimation = useCallback((nodeIds: string[], type: AnimationType) => {
    const now = Date.now();
    const duration = ANIMATION_DURATIONS[type];

    setAnimatedNodes((prev) => {
      const next = new Map(prev);
      for (const id of nodeIds) next.set(id, { type, startTime: now, duration });
      return next;
    });

    setTimeout(() => {
      setAnimatedNodes((prev) => {
        const next = new Map(prev);
        for (const id of nodeIds) {
          const anim = next.get(id);
          if (anim && anim.startTime === now) next.delete(id);
        }
        return next;
      });
    }, duration + 100);
  }, []);

  const clearAnimations = useCallback(() => {
    setAnimatedNodes(new Map());
    if (animationTimerRef.current) {
      clearInterval(animationTimerRef.current);
      animationTimerRef.current = null;
    }
  }, []);

  return {
    aiCitationHighlightedNodeIds,
    setAICitationHighlightedNodeIds,
    aiToolHighlightedNodeIds,
    setAIToolHighlightedNodeIds,
    blastRadiusNodeIds,
    setBlastRadiusNodeIds,
    isAIHighlightsEnabled,
    toggleAIHighlights,
    clearAIToolHighlights,
    clearAICitationHighlights,
    clearBlastRadius,
    animatedNodes,
    triggerNodeAnimation,
    clearAnimations,
  };
}
