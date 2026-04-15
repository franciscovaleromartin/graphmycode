// src/components/SemanticGraph.tsx
import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { AlertCircle } from '@/lib/lucide-icons';
import type { GraphNode } from 'gitnexus-shared';
import {
  generateSemanticEmbeddings,
  WebGPUNotAvailableError,
  type SemanticNode,
} from '../core/semantic/semantic-embedder';
import { reduceToThreeD } from '../core/semantic/umap-reducer';
import { kMeans } from '../core/semantic/kmeans';
import { cosineSimilarity } from '../core/semantic/cosine';
import { COMMUNITY_COLORS } from '../lib/constants';
import type { SemanticClusterEntry } from '../core/llm/context-builder';
import { WebGPUFallbackDialog } from './WebGPUFallbackDialog';

// ─── Tipos ────────────────────────────────────────────────────────────────

type SemanticState =
  | { status: 'loading-model'; percent: number }
  | { status: 'embedding'; processed: number; total: number }
  | { status: 'reducing' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export interface SemanticGraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

// ─── Constantes ───────────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.65;
const K_CLUSTERS = 6;
const MAX_NODES = 500;
/** Factor de zoom por pulsación */
const ZOOM_FACTOR = 0.7;
/** Posición de cámara por defecto de Plotly 3D */
const DEFAULT_EYE = { x: 1.25, y: 1.25, z: 1.25 };

// ─── Componente ───────────────────────────────────────────────────────────

interface Props {
  nodes: GraphNode[];
  onClustersReady?: (data: SemanticClusterEntry[]) => void;
  topN?: number;
}

export const SemanticGraph = forwardRef<SemanticGraphHandle, Props>(
  ({ nodes, onClustersReady, topN = 10 }, ref) => {
    const [state, setState] = useState<SemanticState>({ status: 'loading-model', percent: 0 });
    const [showFallback, setShowFallback] = useState(false);
    const plotRef = useRef<HTMLDivElement>(null);

    // Datos para interacción
    const simsRef = useRef<number[][]>([]);
    const cappedRef = useRef<SemanticNode[]>([]);
    const points3DRef = useRef<[number, number, number][]>([]);
    const baseNodeTraceRef = useRef<any>(null);
    const layoutRef = useRef<any>(null);
    const plotlyConfigRef = useRef({ displayModeBar: false, responsive: true });

    // Controla cuántos vecinos mostrar al seleccionar un nodo
    const topNRef = useRef(topN);
    // Índice del nodo actualmente seleccionado (null = ninguno)
    const selectedIdxRef = useRef<number | null>(null);

    // Instancia Plotly y cámara para zoom programático
    const plotlyRef = useRef<any>(null);
    const cameraEyeRef = useRef({ ...DEFAULT_EYE });

    // ── Zoom imperativo ─────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        if (!plotRef.current || !plotlyRef.current) return;
        cameraEyeRef.current = {
          x: cameraEyeRef.current.x * ZOOM_FACTOR,
          y: cameraEyeRef.current.y * ZOOM_FACTOR,
          z: cameraEyeRef.current.z * ZOOM_FACTOR,
        };
        plotlyRef.current.relayout(plotRef.current, {
          'scene.camera.eye': { ...cameraEyeRef.current },
        });
      },
      zoomOut: () => {
        if (!plotRef.current || !plotlyRef.current) return;
        cameraEyeRef.current = {
          x: cameraEyeRef.current.x / ZOOM_FACTOR,
          y: cameraEyeRef.current.y / ZOOM_FACTOR,
          z: cameraEyeRef.current.z / ZOOM_FACTOR,
        };
        plotlyRef.current.relayout(plotRef.current, {
          'scene.camera.eye': { ...cameraEyeRef.current },
        });
      },
      resetZoom: () => {
        if (!plotRef.current || !plotlyRef.current) return;
        cameraEyeRef.current = { ...DEFAULT_EYE };
        plotlyRef.current.relayout(plotRef.current, {
          'scene.camera.eye': { ...DEFAULT_EYE },
        });
      },
    }));

    // ── Reconstruye textos de hover con k elementos ────────────────────
    const buildHoverTexts = useCallback((k: number): string[] => {
      const capped = cappedRef.current;
      const sims = simsRef.current;
      return capped.map((node, i) => {
        const topK = (sims[i] ?? [])
          .map((sim, j) => ({ j, sim }))
          .filter(({ j }) => j !== i)
          .sort((a, b) => b.sim - a.sim)
          .slice(0, k)
          .map(({ j, sim }) => `${capped[j]?.name ?? '?'} (${(sim * 100).toFixed(0)}%)`);
        return `<b>${node.name}</b><br><span style="color:#8888a0">${node.label}</span><br><br><b>Top ${k} similares:</b><br>${topK.length > 0 ? topK.join('<br>') : '—'}`;
      });
    }, []);

    // Re-aplicar cuando cambia topN: actualiza textos del trace base y la selección
    useEffect(() => {
      topNRef.current = topN;
      if (!baseNodeTraceRef.current || cappedRef.current.length === 0) return;

      // Reconstruir trace base con nuevos textos de hover
      baseNodeTraceRef.current = {
        ...baseNodeTraceRef.current,
        text: buildHoverTexts(topN),
      };

      const idx = selectedIdxRef.current;
      if (idx !== null && plotRef.current && plotlyRef.current) {
        applySelection(idx);
      } else if (plotRef.current && plotlyRef.current) {
        plotlyRef.current.react(plotRef.current, [baseNodeTraceRef.current], layoutRef.current, plotlyConfigRef.current);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topN]);

    // Limpiar Plotly al desmontar
    useEffect(() => {
      return () => {
        if (plotRef.current && plotlyRef.current) {
          plotlyRef.current.purge(plotRef.current);
        }
      };
    }, []);

    // ── Funciones de selección (usan refs, sin recrearse) ─────────────

    const applySelection = useCallback((clickedIdx: number) => {
      if (!plotRef.current || !plotlyRef.current || !baseNodeTraceRef.current) return;
      selectedIdxRef.current = clickedIdx;

      const allSims = simsRef.current;
      const n = cappedRef.current.length;
      if (n === 0) return;

      const simRow = allSims[clickedIdx] ?? new Array(n).fill(0);
      const k = topNRef.current;

      // Top-K vecinos más cercanos (excluyendo el nodo clicado)
      const topSet = new Set(
        simRow
          .map((sim, j) => ({ j, sim }))
          .filter(({ j }) => j !== clickedIdx)
          .sort((a, b) => b.sim - a.sim)
          .slice(0, k)
          .map(({ j }) => j),
      );

      // Array de opacidad de longitud exacta n
      const perNodeOpacity = Array.from({ length: n }, (_, j) => {
        if (j === clickedIdx) return 0.95;
        return topSet.has(j) ? 0.85 : 0.04;
      });

      plotlyRef.current.react(
        plotRef.current,
        [{ ...baseNodeTraceRef.current, marker: { ...baseNodeTraceRef.current.marker, opacity: perNodeOpacity } }],
        layoutRef.current,
        plotlyConfigRef.current,
      );
    }, []);

    const applyReset = useCallback(() => {
      if (!plotRef.current || !plotlyRef.current || !baseNodeTraceRef.current) return;
      selectedIdxRef.current = null;
      plotlyRef.current.react(plotRef.current, [baseNodeTraceRef.current], layoutRef.current, plotlyConfigRef.current);
    }, []);

    // ── Renderizar con Plotly ──────────────────────────────────────────

    const renderPlot = useCallback(
      async (
        semNodes: SemanticNode[],
        points3D: [number, number, number][],
        clusters: number[],
      ) => {
        if (!plotRef.current) return;

        const Plotly = ((await import('plotly.js-dist-min' as any)) as any).default as any;
        plotlyRef.current = Plotly;

        const nodeTrace = {
          type: 'scatter3d',
          mode: 'markers',
          x: points3D.map((p) => p[0]),
          y: points3D.map((p) => p[1]),
          z: points3D.map((p) => p[2]),
          marker: {
            size: 5,
            color: clusters.map((c) => COMMUNITY_COLORS[c % COMMUNITY_COLORS.length]),
            opacity: 0.85,
            line: { width: 0 },
          },
          text: buildHoverTexts(topNRef.current),
          hovertemplate: '%{text}<extra></extra>',
          name: 'Nodos',
          showlegend: false,
        };

        baseNodeTraceRef.current = nodeTrace;

        const layout = {
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          scene: {
            bgcolor: 'rgba(6,6,10,0)',
            xaxis: { showgrid: false, zeroline: false, showticklabels: false, showspikes: false },
            yaxis: { showgrid: false, zeroline: false, showticklabels: false, showspikes: false },
            zaxis: { showgrid: false, zeroline: false, showticklabels: false, showspikes: false },
            camera: { eye: { ...DEFAULT_EYE } },
          },
          margin: { l: 0, r: 0, t: 0, b: 0 },
          showlegend: false,
          hoverlabel: {
            bgcolor: '#16161f',
            bordercolor: '#2a2a3a',
            font: {
              color: '#e4e4ed',
              family: "'JetBrains Mono', 'Fira Code', monospace",
              size: 12,
            },
          },
        };
        layoutRef.current = layout;

        await Plotly.newPlot(plotRef.current, [nodeTrace], layout, plotlyConfigRef.current);

        // Sincronizar cámara cuando el usuario rota/hace zoom manualmente
        (plotRef.current as any).on('plotly_relayout', (update: any) => {
          const eye = update?.['scene.camera.eye'];
          if (eye) cameraEyeRef.current = { x: eye.x, y: eye.y, z: eye.z };
        });

        // ── Interacción click (usa applySelection/applyReset de nivel componente) ──
        let lastClickWasOnNode = false;

        (plotRef.current as any).on('plotly_click', (eventData: any) => {
          const point = eventData?.points?.[0];
          if (!point || point.curveNumber !== 0) {
            lastClickWasOnNode = false;
            applyReset();
            return;
          }
          lastClickWasOnNode = true;
          applySelection(point.pointNumber as number);
        });

        plotRef.current.addEventListener('click', () => {
          if (lastClickWasOnNode) { lastClickWasOnNode = false; return; }
          applyReset();
        });
      },
      [applySelection, applyReset, buildHoverTexts],
    );

    // ── Lógica de carga ─────────────────────────────────────────────

    const handleLoad = useCallback(
      async (forceDevice?: 'webgpu' | 'wasm') => {
        try {
          setState({ status: 'loading-model', percent: 0 });

          const semNodes = await generateSemanticEmbeddings(
            nodes,
            (percent) => setState({ status: 'loading-model', percent }),
            (processed, total) => setState({ status: 'embedding', processed, total }),
            forceDevice,
          );

          if (semNodes.length === 0) {
            setState({ status: 'error', message: 'No hay nodos embeddables en este grafo' });
            return;
          }

          const capped = semNodes.slice(0, MAX_NODES);
          const n = capped.length;

          setState({ status: 'reducing' });
          await new Promise<void>((r) => setTimeout(r, 50));

          const points3D = reduceToThreeD(capped.map((nd) => nd.embedding));
          const clusters = kMeans(points3D, K_CLUSTERS);

          const sims: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
              const sim = cosineSimilarity(capped[i].embedding, capped[j].embedding);
              sims[i][j] = sim;
              sims[j][i] = sim;
            }
          }

          simsRef.current = sims;
          cappedRef.current = capped;
          points3DRef.current = points3D;

          // Computar datos de clusters para la leyenda del sidebar y el contexto del LLM
          if (onClustersReady) {
            const counts = new Array(K_CLUSTERS).fill(0);
            // Recoger hasta 5 nombres de nodo por cluster (los primeros que aparecen)
            const sampleMap: string[][] = Array.from({ length: K_CLUSTERS }, () => []);
            clusters.forEach((clusterIdx, nodeIdx) => {
              counts[clusterIdx]++;
              if (sampleMap[clusterIdx].length < 5) {
                sampleMap[clusterIdx].push(capped[nodeIdx].name);
              }
            });
            onClustersReady(
              counts.map((count, i) => ({
                color: COMMUNITY_COLORS[i % COMMUNITY_COLORS.length],
                count,
                sampleNodes: sampleMap[i],
              })),
            );
          }

          setState({ status: 'ready' });
          await new Promise<void>((r) => setTimeout(r, 50));

          await renderPlot(capped, points3D, clusters);
        } catch (error) {
          if (error instanceof WebGPUNotAvailableError) {
            setShowFallback(true);
          } else {
            setState({
              status: 'error',
              message: error instanceof Error ? error.message : 'Error desconocido',
            });
          }
        }
      },
      [nodes, renderPlot, onClustersReady],
    );

    useEffect(() => {
      handleLoad();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Estados de carga — diseño igual a LoadingOverlay ─────────────

    const loadingContent = (() => {
      if (state.status === 'loading-model') {
        return { message: 'Cargando modelo semántico...', detail: null, percent: state.percent };
      }
      if (state.status === 'embedding') {
        const pct = state.total > 0 ? Math.round((state.processed / state.total) * 100) : 0;
        return {
          message: 'Generando embeddings...',
          detail: `${state.processed} / ${state.total} nodos`,
          percent: pct,
        };
      }
      if (state.status === 'reducing') {
        return { message: 'Calculando similitudes...', detail: null, percent: 99 };
      }
      return null;
    })();

    if (loadingContent) {
      return (
        <>
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-void">
            {/* Gradientes de fondo */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute top-1/3 left-1/3 h-96 w-96 animate-pulse rounded-full bg-accent/10 blur-3xl" />
              <div className="absolute right-1/3 bottom-1/3 h-96 w-96 animate-pulse rounded-full bg-node-interface/10 blur-3xl" />
            </div>

            {/* Orb pulsante */}
            <div className="relative mb-10">
              <div className="h-28 w-28 animate-pulse-glow rounded-full bg-gradient-to-br from-accent to-node-interface" />
              <div className="absolute inset-0 h-28 w-28 rounded-full bg-gradient-to-br from-accent to-node-interface opacity-50 blur-xl" />
            </div>

            {/* Barra de progreso */}
            <div className="mb-4 w-80">
              <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-node-interface transition-all duration-300 ease-out"
                  style={{ width: `${loadingContent.percent}%` }}
                />
              </div>
            </div>

            {/* Texto de estado */}
            <div className="text-center">
              <p className="mb-1 font-mono text-sm text-text-secondary">
                {loadingContent.message}
                <span className="animate-pulse">|</span>
              </p>
              {loadingContent.detail && (
                <p className="font-mono text-xs text-text-muted">{loadingContent.detail}</p>
              )}
            </div>

            {/* Porcentaje */}
            <p className="mt-4 font-mono text-3xl font-semibold text-text-primary">
              {loadingContent.percent}%
            </p>
          </div>

          <WebGPUFallbackDialog
            isOpen={showFallback}
            onClose={() => setShowFallback(false)}
            onUseCPU={() => { setShowFallback(false); handleLoad('wasm'); }}
            onSkip={() => setShowFallback(false)}
            nodeCount={nodes.length}
          />
        </>
      );
    }

    if (state.status === 'error') {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void">
          <AlertCircle className="h-6 w-6 text-red-400" />
          <p className="text-sm text-red-400">{state.message}</p>
          <button
            onClick={() => handleLoad()}
            className="text-xs text-text-secondary underline hover:text-text-primary"
          >
            Reintentar
          </button>
        </div>
      );
    }

    return (
      <div className="absolute inset-0 bg-void">
        <div ref={plotRef} className="h-full w-full" />
      </div>
    );
  },
);

SemanticGraph.displayName = 'SemanticGraph';
