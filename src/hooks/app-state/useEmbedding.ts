// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { useState, useCallback, useRef } from 'react';
import {
  startEmbeddings as backendStartEmbeddings,
  streamEmbeddingProgress,
  search as backendSearch,
  type JobProgress,
} from '../../services/backend-client';

export type EmbeddingStatus = 'idle' | 'loading' | 'embedding' | 'indexing' | 'ready' | 'error';

export function useEmbedding(repoRef: React.MutableRefObject<string | undefined>) {
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus>('idle');
  const [embeddingProgress, setEmbeddingProgress] = useState<{
    phase: string;
    percent: number;
  } | null>(null);
  const embedAbortRef = useRef<AbortController | null>(null);

  const startEmbeddings = useCallback(async (): Promise<void> => {
    const repo = repoRef.current;
    if (!repo) throw new Error('No repository loaded');

    setEmbeddingStatus('loading');
    setEmbeddingProgress(null);

    try {
      const { jobId } = await backendStartEmbeddings(repo);

      await new Promise<void>((resolve, reject) => {
        embedAbortRef.current = streamEmbeddingProgress(
          jobId,
          (progress: JobProgress) => {
            setEmbeddingProgress({ phase: progress.phase as any, percent: progress.percent });
            if (progress.phase === 'loading-model' || progress.phase === 'loading') {
              setEmbeddingStatus('loading');
            } else if (progress.phase === 'embedding') {
              setEmbeddingStatus('embedding');
            } else if (progress.phase === 'indexing') {
              setEmbeddingStatus('indexing');
            }
          },
          () => {
            setEmbeddingStatus('ready');
            setEmbeddingProgress({ phase: 'ready' as any, percent: 100 });
            resolve();
          },
          (error: string) => {
            setEmbeddingStatus('error');
            reject(new Error(error));
          },
        );
      });
    } catch (error: any) {
      if (error?.message?.includes('already in progress')) {
        setEmbeddingStatus('embedding');
        return;
      }
      setEmbeddingStatus('error');
      throw error;
    }
  }, [repoRef]);

  const startEmbeddingsWithFallback = useCallback(() => {
    const isPlaywright =
      (typeof navigator !== 'undefined' && navigator.webdriver) ||
      (typeof import.meta !== 'undefined' &&
        typeof import.meta.env !== 'undefined' &&
        import.meta.env.VITE_PLAYWRIGHT_TEST) ||
      (typeof process !== 'undefined' && process.env.PLAYWRIGHT_TEST);
    if (isPlaywright) {
      setEmbeddingStatus('idle');
      return;
    }
    startEmbeddings().catch((err) => {
      console.warn('Embeddings auto-start failed:', err);
    });
  }, [startEmbeddings]);

  const semanticSearch = useCallback(
    async (query: string, k: number = 10): Promise<any[]> =>
      backendSearch(query, { limit: k, mode: 'semantic', repo: repoRef.current }),
    [repoRef],
  );

  const semanticSearchWithContext = useCallback(
    async (query: string, k: number = 5, _hops: number = 2): Promise<any[]> =>
      backendSearch(query, { limit: k, mode: 'semantic', enrich: true, repo: repoRef.current }),
    [repoRef],
  );

  return {
    embeddingStatus,
    setEmbeddingStatus,
    embeddingProgress,
    startEmbeddings,
    startEmbeddingsWithFallback,
    semanticSearch,
    semanticSearchWithContext,
    isEmbeddingReady: embeddingStatus === 'ready',
  };
}
