// src/components/SemanticGraph.tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, AlertCircle } from '@/lib/lucide-icons';
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
import { WebGPUFallbackDialog } from './WebGPUFallbackDialog';

// ─── Tipos de estado ───────────────────────────────────────────────────────

type SemanticState =
  | { status: 'loading-model'; percent: number }
  | { status: 'embedding'; processed: number; total: number }
  | { status: 'reducing' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

// ─── Constantes ───────────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.65;
const K_CLUSTERS = 6;
/** Límite de nodos para evitar O(n²) explosivo en similitud coseno */
const MAX_NODES = 500;

// ─── Helpers de renderizado Plotly ────────────────────────────────────────

interface EdgeBucket {
  x: (number | null)[];
  y: (number | null)[];
  z: (number | null)[];
}

interface EdgeBuckets {
  low: EdgeBucket;
  mid: EdgeBucket;
  high: EdgeBucket;
}

const buildEdgeBuckets = (): EdgeBuckets => ({
  low: { x: [], y: [], z: [] },
  mid: { x: [], y: [], z: [] },
  high: { x: [], y: [], z: [] },
});

const pushSegment = (
  bucket: EdgeBucket,
  p1: [number, number, number],
  p2: [number, number, number],
) => {
  bucket.x.push(p1[0], p2[0], null);
  bucket.y.push(p1[1], p2[1], null);
  bucket.z.push(p1[2], p2[2], null);
};

// ─── Componente principal ─────────────────────────────────────────────────

export const SemanticGraph = ({ nodes }: { nodes: GraphNode[] }) => {
  const [state, setState] = useState<SemanticState>({ status: 'loading-model', percent: 0 });
  const [showFallback, setShowFallback] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);

  // Datos computados que necesitamos para el resaltado de nodos
  const semNodesRef = useRef<SemanticNode[]>([]);
  const simsRef = useRef<number[][]>([]);
  const clustersRef = useRef<number[]>([]);
  const points3DRef = useRef<[number, number, number][]>([]);
  const top3Ref = useRef<string[][]>([]);

  // Limpiar Plotly al desmontar para liberar memoria
  useEffect(() => {
    return () => {
      if (plotRef.current) {
        import('plotly.js-dist-min').then(({ default: Plotly }) => {
          if (plotRef.current) (Plotly as any).purge(plotRef.current);
        });
      }
    };
  }, []);

  // ── Renderizar con Plotly ──────────────────────────────────────────────

  const renderPlot = useCallback(
    async (
      semNodes: SemanticNode[],
      points3D: [number, number, number][],
      clusters: number[],
      sims: number[][],
      top3: string[][],
    ) => {
      if (!plotRef.current) return;

      // Dynamic import: Plotly solo se descarga al primer uso
      const Plotly = ((await import('plotly.js-dist-min' as any)) as any).default as any;

      const n = semNodes.length;
      const buckets = buildEdgeBuckets();

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const sim = sims[i][j];
          if (sim > SIMILARITY_THRESHOLD) {
            if (sim > 0.85) {
              pushSegment(buckets.high, points3D[i], points3D[j]);
            } else if (sim > 0.75) {
              pushSegment(buckets.mid, points3D[i], points3D[j]);
            } else {
              pushSegment(buckets.low, points3D[i], points3D[j]);
            }
          }
        }
      }

      // Trace de nodos
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
        text: semNodes.map(
          (node, i) =>
            `<b>${node.name}</b><br><span style="color:#8888a0">${node.label}</span><br><br><b>Más similares:</b><br>${
              top3[i].length > 0 ? top3[i].join('<br>') : '—'
            }`,
        ),
        hovertemplate: '%{text}<extra></extra>',
        name: 'Nodos',
        showlegend: false,
      };

      // Traces de aristas (3 niveles de opacidad)
      const edgeTraces = [
        { bucket: buckets.low, opacity: 0.12 },
        { bucket: buckets.mid, opacity: 0.22 },
        { bucket: buckets.high, opacity: 0.42 },
      ]
        .filter(({ bucket }) => bucket.x.length > 0)
        .map(({ bucket, opacity }) => ({
          type: 'scatter3d',
          mode: 'lines',
          x: bucket.x,
          y: bucket.y,
          z: bucket.z,
          line: { color: '#06b6d4', width: 1 },
          opacity,
          hoverinfo: 'none',
          showlegend: false,
        }));

      const layout = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        scene: {
          bgcolor: 'rgba(6,6,10,0)',
          xaxis: { showgrid: false, zeroline: false, showticklabels: false, showspikes: false },
          yaxis: { showgrid: false, zeroline: false, showticklabels: false, showspikes: false },
          zaxis: { showgrid: false, zeroline: false, showticklabels: false, showspikes: false },
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

      await Plotly.newPlot(plotRef.current, [nodeTrace, ...edgeTraces], layout, {
        displayModeBar: false,
        responsive: true,
      });

      // ── Interacción: click en nodo ─────────────────────────────────────
      // Flag para distinguir click en punto vs. click en fondo
      let justClickedPoint = false;

      (plotRef.current as any).on('plotly_click', (eventData: any) => {
        justClickedPoint = true;
        const point = eventData?.points?.[0];
        if (point == null || point.curveNumber !== 0) return; // solo trace de nodos (curveNumber 0)

        const clickedIdx = point.pointNumber as number;
        const simRow = simsRef.current[clickedIdx] ?? [];

        // Opacidades: nodo clickado + vecinos conectados = normal; resto = casi transparente
        const opacities = simRow.map((sim, j) => {
          if (j === clickedIdx) return 0.95;
          return sim > SIMILARITY_THRESHOLD ? 0.85 : 0.04;
        });

        Plotly.restyle(plotRef.current, { 'marker.opacity': [opacities] }, [0]);
      });

      // Click en fondo: restablecer opacidades
      plotRef.current.addEventListener('click', () => {
        if (justClickedPoint) {
          justClickedPoint = false;
          return;
        }
        const n2 = simsRef.current.length;
        if (n2 === 0) return;
        Plotly.restyle(plotRef.current, { 'marker.opacity': [new Array(n2).fill(0.85)] }, [0]);
      });
    },
    [],
  );

  // ── Lógica de carga ───────────────────────────────────────────────────

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

        // Limitar a MAX_NODES para evitar O(n²) en similitud coseno
        const capped = semNodes.slice(0, MAX_NODES);
        const n = capped.length;

        setState({ status: 'reducing' });
        // Flush del render antes de la llamada síncrona bloqueante de UMAP
        await new Promise<void>((r) => setTimeout(r, 50));

        const points3D = reduceToThreeD(capped.map((nd) => nd.embedding));
        const clusters = kMeans(points3D, K_CLUSTERS);

        // Precalcular matriz de similitudes
        const sims: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const sim = cosineSimilarity(capped[i].embedding, capped[j].embedding);
            sims[i][j] = sim;
            sims[j][i] = sim;
          }
        }

        // Top 3 similares por nodo
        const top3: string[][] = Array.from({ length: n }, (_, i) =>
          sims[i]
            .map((sim, j) => ({ j, sim }))
            .filter(({ j }) => j !== i)
            .sort((a, b) => b.sim - a.sim)
            .slice(0, 3)
            .map(({ j, sim }) => `${capped[j].name} (${(sim * 100).toFixed(0)}%)`),
        );

        // Guardar en refs para acceso desde los event listeners
        semNodesRef.current = capped;
        simsRef.current = sims;
        clustersRef.current = clusters;
        points3DRef.current = points3D;
        top3Ref.current = top3;

        // Cambiar a 'ready' ANTES de renderizar Plotly para que React monte
        // el div con ref={plotRef}. Sin esto plotRef.current es null.
        setState({ status: 'ready' });
        await new Promise<void>((r) => setTimeout(r, 50));

        await renderPlot(capped, points3D, clusters, sims, top3);
      } catch (error) {
        if (error instanceof WebGPUNotAvailableError) {
          setShowFallback(true);
          // No reseteamos a 'idle': dejamos el fallback dialog visible
          // pero el estado queda en loading-model para que no se muestre
          // contenido incorrecto. Al elegir CPU se relanzará handleLoad.
        } else {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Error desconocido',
          });
        }
      }
    },
    [nodes, renderPlot],
  );

  // Auto-carga al montar el componente
  useEffect(() => {
    handleLoad();
    // Solo al montar — sin dependencias para evitar re-cargas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Estados de UI ────────────────────────────────────────────────────

  if (state.status === 'loading-model') {
    return (
      <>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
          <p className="text-sm text-text-secondary">Descargando modelo...</p>
          <div className="h-1.5 w-48 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-node-interface transition-all duration-300"
              style={{ width: `${state.percent}%` }}
            />
          </div>
          <p className="text-xs text-text-muted">{state.percent.toFixed(0)}%</p>
        </div>
        <WebGPUFallbackDialog
          isOpen={showFallback}
          onClose={() => setShowFallback(false)}
          onUseCPU={() => {
            setShowFallback(false);
            handleLoad('wasm');
          }}
          onSkip={() => setShowFallback(false)}
          nodeCount={nodes.length}
        />
      </>
    );
  }

  if (state.status === 'embedding') {
    const percent =
      state.total > 0 ? Math.round((state.processed / state.total) * 100) : 0;
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void">
        <Loader2 className="h-6 w-6 animate-spin text-node-function" />
        <p className="text-sm text-text-secondary">Generando embeddings...</p>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-elevated">
          <div
            className="h-full rounded-full bg-gradient-to-r from-node-function to-accent transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-text-muted">
          {state.processed} / {state.total} nodos
        </p>
      </div>
    );
  }

  if (state.status === 'reducing') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void">
        <Loader2 className="h-6 w-6 animate-spin text-node-interface" />
        <p className="text-sm text-text-secondary">Calculando similitudes...</p>
      </div>
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

  // Estado 'ready': Plotly renderiza en el div via newPlot
  return (
    <div className="absolute inset-0 bg-void">
      <div ref={plotRef} className="h-full w-full" />
    </div>
  );
};
