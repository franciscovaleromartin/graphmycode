# Semantic Graph 3D Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir visualización de similitud semántica en 3D a GraphMyCode con un toggle Structural/Semantic, 100% en el browser sin backend.

**Architecture:** Un toggle en `GraphCanvas.tsx` alterna entre la vista 2D Sigma existente y el nuevo componente `SemanticGraph`. El canvas Sigma se oculta con `hidden` al cambiar de vista (no se destruye, preserva estado). `SemanticGraph` genera embeddings bajo demanda usando el singleton `initEmbedder`/`embedBatch` ya existente en `src/core/embeddings/embedder.ts`, reduce a 3D con UMAP, aplica k-means para colores de cluster, calcula similitud coseno para aristas y renderiza con Plotly Scatter3d cargado via dynamic import.

**Tech Stack:** @huggingface/transformers (ya instalado), plotly.js-dist-min (nuevo), umap-js (nuevo), TypeScript, React 18, Tailwind CSS v4, vitest

---

## Mapa de ficheros

**Nuevos:**
- `src/core/semantic/cosine.ts` — similitud coseno entre dos Float32Array
- `src/core/semantic/kmeans.ts` — clustering k-means Lloyd's algorithm en puntos 3D
- `src/core/semantic/umap-reducer.ts` — reduce Float32Array[] a coordenadas 3D con umap-js
- `src/core/semantic/semantic-embedder.ts` — genera SemanticNode[] desde los nodos del grafo
- `src/components/SemanticGraph.tsx` — componente 3D completo (estado + Plotly)
- `src/types/plotly-dist-min.d.ts` — declaración de tipos mínima para plotly.js-dist-min
- `test/unit/semantic-cosine.test.ts` — tests para cosineSimilarity
- `test/unit/semantic-kmeans.test.ts` — tests para kMeans

**Modificados:**
- `package.json` — añadir plotly.js-dist-min, umap-js
- `src/components/GraphCanvas.tsx` — añadir toggle + montar SemanticGraph

---

## Task 1: Instalar dependencias y declarar tipos

**Files:**
- Modify: `package.json`
- Create: `src/types/plotly-dist-min.d.ts`

- [ ] **Step 1: Instalar paquetes**

```bash
cd /Users/franciscovalero/Desktop/proyectos/graphmycode
npm install plotly.js-dist-min umap-js
```

Resultado esperado: ambos paquetes añadidos en `node_modules` y en `dependencies` de `package.json`.

- [ ] **Step 2: Crear declaración de tipos para plotly.js-dist-min**

`plotly.js-dist-min` no incluye tipos TypeScript. Crear el fichero mínimo necesario:

```typescript
// src/types/plotly-dist-min.d.ts
declare module 'plotly.js-dist-min' {
  interface PlotlyHTMLElement extends HTMLElement {
    data: object[];
    layout: object;
  }

  const Plotly: {
    newPlot(
      root: HTMLElement,
      data: object[],
      layout?: object,
      config?: object,
    ): Promise<PlotlyHTMLElement>;
    react(
      root: HTMLElement,
      data: object[],
      layout?: object,
      config?: object,
    ): Promise<PlotlyHTMLElement>;
    purge(root: HTMLElement): void;
  };

  export default Plotly;
}
```

- [ ] **Step 3: Verificar que umap-js incluye tipos**

```bash
ls node_modules/umap-js/dist/*.d.ts
```

Resultado esperado: fichero `umap-js.d.ts` o similar. Si no existe, añadir al fichero anterior:

```typescript
declare module 'umap-js' {
  interface UMAPOptions {
    nComponents?: number;
    nNeighbors?: number;
    minDist?: number;
    spread?: number;
  }
  export class UMAP {
    constructor(options?: UMAPOptions);
    fit(data: number[][]): number[][];
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/types/plotly-dist-min.d.ts
git commit -m "chore: instalar plotly.js-dist-min y umap-js para vista semántica 3D"
```

---

## Task 2: Utilidad cosineSimilarity (TDD)

**Files:**
- Create: `src/core/semantic/cosine.ts`
- Create: `test/unit/semantic-cosine.test.ts`

- [ ] **Step 1: Escribir el test fallido**

```typescript
// test/unit/semantic-cosine.test.ts
import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '../../src/core/semantic/cosine';

describe('cosineSimilarity', () => {
  it('devuelve 1 para vectores idénticos', () => {
    const a = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0);
  });

  it('devuelve 0 para vectores ortogonales', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('devuelve -1 para vectores opuestos', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('devuelve 0 si algún vector es cero', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('funciona con vectores normalizados de múltiples dimensiones', () => {
    const a = new Float32Array([0.6, 0.8, 0]);
    const b = new Float32Array([0.6, 0.8, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });
});
```

- [ ] **Step 2: Verificar que falla**

```bash
npx vitest run test/unit/semantic-cosine.test.ts
```

Resultado esperado: FAIL con "Cannot find module '../../src/core/semantic/cosine'"

- [ ] **Step 3: Implementar cosineSimilarity**

```typescript
// src/core/semantic/cosine.ts

/**
 * Similitud coseno entre dos vectores de embedding.
 * Devuelve un valor en [-1, 1] donde 1 = dirección idéntica.
 * Devuelve 0 si algún vector es el vector cero.
 */
export const cosineSimilarity = (a: Float32Array, b: Float32Array): number => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
};
```

- [ ] **Step 4: Verificar que pasa**

```bash
npx vitest run test/unit/semantic-cosine.test.ts
```

Resultado esperado: PASS — 5 tests pasados.

- [ ] **Step 5: Commit**

```bash
git add src/core/semantic/cosine.ts test/unit/semantic-cosine.test.ts
git commit -m "feat: añadir utilidad cosineSimilarity para vista semántica"
```

---

## Task 3: Clustering k-means (TDD)

**Files:**
- Create: `src/core/semantic/kmeans.ts`
- Create: `test/unit/semantic-kmeans.test.ts`

- [ ] **Step 1: Escribir el test fallido**

```typescript
// test/unit/semantic-kmeans.test.ts
import { describe, it, expect } from 'vitest';
import { kMeans } from '../../src/core/semantic/kmeans';

describe('kMeans', () => {
  it('devuelve array vacío para entrada vacía', () => {
    expect(kMeans([], 3)).toEqual([]);
  });

  it('asigna todos al cluster 0 cuando k=1', () => {
    const points: [number, number, number][] = [[0, 0, 0], [1, 1, 1], [2, 2, 2]];
    const result = kMeans(points, 1);
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(1);
    expect(result[0]).toBe(0);
  });

  it('separa dos clusters claramente distintos', () => {
    const points: [number, number, number][] = [
      [0, 0, 0], [0.1, 0, 0], [0.2, 0, 0],
      [100, 100, 100], [100.1, 100, 100], [100.2, 100, 100],
    ];
    const result = kMeans(points, 2);
    expect(result).toHaveLength(6);
    // Los tres primeros deben estar en el mismo cluster
    expect(result[0]).toBe(result[1]);
    expect(result[1]).toBe(result[2]);
    // Los tres últimos deben estar en el mismo cluster
    expect(result[3]).toBe(result[4]);
    expect(result[4]).toBe(result[5]);
    // Los dos grupos deben ser distintos
    expect(result[0]).not.toBe(result[3]);
  });

  it('limita k al número de puntos si k > n', () => {
    const points: [number, number, number][] = [[0, 0, 0], [1, 1, 1]];
    const result = kMeans(points, 10);
    expect(result).toHaveLength(2);
    expect(new Set(result).size).toBeLessThanOrEqual(2);
  });

  it('devuelve índices en el rango [0, k-1]', () => {
    const points: [number, number, number][] = Array.from({ length: 20 }, (_, i) => [i, 0, 0]);
    const result = kMeans(points, 4);
    expect(result.every(c => c >= 0 && c < 4)).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla**

```bash
npx vitest run test/unit/semantic-kmeans.test.ts
```

Resultado esperado: FAIL con "Cannot find module '../../src/core/semantic/kmeans'"

- [ ] **Step 3: Implementar kMeans**

```typescript
// src/core/semantic/kmeans.ts

/** Distancia euclídea al cuadrado entre dos puntos 3D (sin sqrt, solo para comparar). */
const dist2 = (a: [number, number, number], b: [number, number, number]): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
};

/**
 * K-means clustering con algoritmo de Lloyd.
 * @param points - Array de puntos 3D
 * @param k - Número de clusters deseado (se limita a points.length)
 * @param maxIter - Máximo de iteraciones (default 100)
 * @returns Array de índices de cluster (0..k-1), uno por punto
 */
export const kMeans = (
  points: [number, number, number][],
  k: number,
  maxIter = 100,
): number[] => {
  if (points.length === 0) return [];

  const clampedK = Math.min(k, points.length);

  // Inicializar centroides: tomar k puntos equiespaciados del array
  const step = Math.max(1, Math.floor(points.length / clampedK));
  let centroids: [number, number, number][] = Array.from(
    { length: clampedK },
    (_, i) => [points[(i * step) % points.length][0], points[(i * step) % points.length][1], points[(i * step) % points.length][2]],
  );

  let assignments: number[] = new Array(points.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Asignar cada punto al centroide más cercano
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;
      let best = 0;
      for (let j = 0; j < clampedK; j++) {
        const d = dist2(points[i], centroids[j]);
        if (d < minDist) {
          minDist = d;
          best = j;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }
    if (!changed) break;

    // Recalcular centroides
    const sums: [number, number, number][] = Array.from({ length: clampedK }, () => [0, 0, 0]);
    const counts = new Array(clampedK).fill(0);
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c][0] += points[i][0];
      sums[c][1] += points[i][1];
      sums[c][2] += points[i][2];
      counts[c]++;
    }
    centroids = sums.map((s, c) =>
      counts[c] > 0
        ? [s[0] / counts[c], s[1] / counts[c], s[2] / counts[c]]
        : centroids[c],
    ) as [number, number, number][];
  }

  return assignments;
};
```

- [ ] **Step 4: Verificar que pasa**

```bash
npx vitest run test/unit/semantic-kmeans.test.ts
```

Resultado esperado: PASS — 5 tests pasados.

- [ ] **Step 5: Commit**

```bash
git add src/core/semantic/kmeans.ts test/unit/semantic-kmeans.test.ts
git commit -m "feat: añadir clustering k-means para coloreado por similitud semántica"
```

---

## Task 4: Reductor UMAP 3D

**Files:**
- Create: `src/core/semantic/umap-reducer.ts`

No hay TDD aquí: `umap-js` es un algoritmo externo con resultados no deterministas que no se puede mockear de forma útil.

- [ ] **Step 1: Implementar umap-reducer.ts**

```typescript
// src/core/semantic/umap-reducer.ts
import { UMAP } from 'umap-js';

/**
 * Reduce embeddings de alta dimensión a coordenadas 3D usando UMAP.
 * 
 * - Requiere mínimo 3 puntos (nNeighbors >= 2).
 * - Con < 3 puntos devuelve posiciones en círculo unitario (fallback).
 * - La llamada a umap.fit() es síncrona y puede tardar varios segundos
 *   con muchos nodos; llamar desde un estado de "cargando" en la UI.
 * 
 * @param embeddings - Array de vectores de embedding (Float32Array)
 * @returns Array de puntos [x, y, z]
 */
export const reduceToThreeD = (embeddings: Float32Array[]): [number, number, number][] => {
  if (embeddings.length === 0) return [];

  const n = embeddings.length;

  // UMAP necesita al menos nNeighbors + 1 puntos
  const nNeighbors = Math.max(2, Math.min(15, n - 1));

  if (n < 3) {
    // Fallback: distribuir en círculo unitario
    return embeddings.map((_, i) => {
      const angle = (i / Math.max(n, 1)) * 2 * Math.PI;
      return [Math.cos(angle), Math.sin(angle), 0];
    });
  }

  const data = embeddings.map((e) => Array.from(e));

  const umap = new UMAP({
    nComponents: 3,
    nNeighbors,
    minDist: 0.1,
    spread: 1.0,
  });

  const result = umap.fit(data) as number[][];
  return result.map((p) => [p[0], p[1], p[2]] as [number, number, number]);
};
```

- [ ] **Step 2: Verificar compilación TypeScript**

```bash
npx tsc --noEmit
```

Resultado esperado: sin errores relacionados con `umap-reducer.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/core/semantic/umap-reducer.ts
git commit -m "feat: añadir reductor UMAP 3D para proyección de embeddings"
```

---

## Task 5: Generador de embeddings semánticos

**Files:**
- Create: `src/core/semantic/semantic-embedder.ts`

- [ ] **Step 1: Implementar semantic-embedder.ts**

```typescript
// src/core/semantic/semantic-embedder.ts
import { initEmbedder, embedBatch, WebGPUNotAvailableError } from '../embeddings/embedder';
import { EMBEDDABLE_LABELS } from '../embeddings/types';
import type { GraphNode } from 'gitnexus-shared';

/** Un nodo del grafo con su embedding generado. */
export interface SemanticNode {
  nodeId: string;
  label: string;
  name: string;
  embedding: Float32Array;
}

/**
 * Genera una representación textual de un nodo para embedding.
 * Incluye el código fuente si está disponible (primeros 300 chars).
 */
const nodeToText = (node: GraphNode): string => {
  const name = node.properties.name ?? '';
  const filePath = node.properties.filePath ?? '';
  const content = (node.properties as Record<string, unknown>)['content'];
  const snippet = typeof content === 'string' ? content.slice(0, 300) : '';
  return snippet
    ? `${node.label} ${name} in ${filePath}: ${snippet}`
    : `${node.label} ${name} in ${filePath}`;
};

/**
 * Genera embeddings para los nodos embeddables del grafo.
 * 
 * - Solo procesa nodos con label en EMBEDDABLE_LABELS (Function, Class, Method, Interface, File).
 * - Reutiliza el singleton del embedder: si el modelo ya está cargado, no se vuelve a descargar.
 * - Los callbacks de progreso se llaman durante la carga del modelo y la generación de embeddings.
 * 
 * @param nodes - Todos los nodos del grafo actual
 * @param onModelProgress - Llamado con porcentaje (0-100) durante descarga del modelo
 * @param onEmbeddingProgress - Llamado con (procesados, total) durante embedding
 * @param forceDevice - Forzar 'webgpu' o 'wasm' (para fallback manual)
 * @returns Array de SemanticNode con embeddings, filtrado a EMBEDDABLE_LABELS
 */
export const generateSemanticEmbeddings = async (
  nodes: GraphNode[],
  onModelProgress: (percent: number) => void,
  onEmbeddingProgress: (processed: number, total: number) => void,
  forceDevice?: 'webgpu' | 'wasm',
): Promise<SemanticNode[]> => {
  const embeddable = nodes.filter((n) =>
    EMBEDDABLE_LABELS.includes(n.label as (typeof EMBEDDABLE_LABELS)[number]),
  );

  if (embeddable.length === 0) return [];

  // Inicializar embedder (singleton: si ya está cargado, devuelve instancia cacheada)
  await initEmbedder(
    (progress) => onModelProgress(progress.progress ?? 0),
    {},
    forceDevice,
  );

  const BATCH_SIZE = 16;
  const results: SemanticNode[] = [];

  for (let i = 0; i < embeddable.length; i += BATCH_SIZE) {
    const batch = embeddable.slice(i, i + BATCH_SIZE);
    const texts = batch.map(nodeToText);
    const embeddings = await embedBatch(texts);

    batch.forEach((node, j) => {
      results.push({
        nodeId: node.id,
        label: node.label,
        name: node.properties.name ?? node.id,
        embedding: embeddings[j],
      });
    });

    onEmbeddingProgress(Math.min(i + BATCH_SIZE, embeddable.length), embeddable.length);
  }

  return results;
};

// Re-export para que SemanticGraph no necesite importar de embedder directamente
export { WebGPUNotAvailableError };
```

- [ ] **Step 2: Verificar compilación TypeScript**

```bash
npx tsc --noEmit
```

Resultado esperado: sin errores en `semantic-embedder.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/core/semantic/semantic-embedder.ts
git commit -m "feat: añadir generador de embeddings semánticos desde nodos del grafo"
```

---

## Task 6: Componente SemanticGraph

**Files:**
- Create: `src/components/SemanticGraph.tsx`

- [ ] **Step 1: Crear SemanticGraph.tsx**

```tsx
// src/components/SemanticGraph.tsx
import { useState, useRef, useCallback } from 'react';
import { Loader2, Brain, AlertCircle } from '@/lib/lucide-icons';
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
  | { status: 'idle' }
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

interface EdgeBuckets {
  low: { x: (number | null)[]; y: (number | null)[]; z: (number | null)[] };
  mid: { x: (number | null)[]; y: (number | null)[]; z: (number | null)[] };
  high: { x: (number | null)[]; y: (number | null)[]; z: (number | null)[] };
}

const buildEdgeBuckets = (): EdgeBuckets => ({
  low: { x: [], y: [], z: [] },
  mid: { x: [], y: [], z: [] },
  high: { x: [], y: [], z: [] },
});

const pushSegment = (
  bucket: { x: (number | null)[]; y: (number | null)[]; z: (number | null)[] },
  p1: [number, number, number],
  p2: [number, number, number],
) => {
  bucket.x.push(p1[0], p2[0], null);
  bucket.y.push(p1[1], p2[1], null);
  bucket.z.push(p1[2], p2[2], null);
};

// ─── Componente principal ─────────────────────────────────────────────────

export const SemanticGraph = ({ nodes }: { nodes: GraphNode[] }) => {
  const [state, setState] = useState<SemanticState>({ status: 'idle' });
  const [showFallback, setShowFallback] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);

  // ── Renderizar con Plotly ──────────────────────────────────────────────

  const renderPlot = useCallback(
    async (
      semNodes: SemanticNode[],
      points3D: [number, number, number][],
      clusters: number[],
    ) => {
      if (!plotRef.current) return;

      // Dynamic import: Plotly solo se descarga al primer uso
      const { default: Plotly } = await import('plotly.js-dist-min' as any) as any;

      const n = semNodes.length;
      const buckets = buildEdgeBuckets();
      // top3[i] = nombres de los 3 nodos más similares al nodo i
      const top3: string[][] = Array.from({ length: n }, () => []);

      // Matriz de similitudes (upper triangle + mirror para top-3)
      const sims: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const sim = cosineSimilarity(semNodes[i].embedding, semNodes[j].embedding);
          sims[i][j] = sim;
          sims[j][i] = sim;

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

      // Top 3 similares por nodo
      for (let i = 0; i < n; i++) {
        top3[i] = sims[i]
          .map((sim, j) => ({ j, sim }))
          .filter(({ j }) => j !== i)
          .sort((a, b) => b.sim - a.sim)
          .slice(0, 3)
          .map(({ j, sim }) => `${semNodes[j].name} (${(sim * 100).toFixed(0)}%)`);
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

        setState({ status: 'reducing' });
        // Flush del render antes de la llamada síncrona bloqueante de UMAP
        await new Promise<void>((r) => setTimeout(r, 50));

        const points3D = reduceToThreeD(capped.map((n) => n.embedding));
        const clusters = kMeans(points3D, K_CLUSTERS);

        await renderPlot(capped, points3D, clusters);

        setState({ status: 'ready' });
      } catch (error) {
        if (error instanceof WebGPUNotAvailableError) {
          setShowFallback(true);
          setState({ status: 'idle' });
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

  // ── Estados de UI ────────────────────────────────────────────────────

  if (state.status === 'idle') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-void">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
            <Brain className="h-8 w-8 text-accent" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-text-primary">Vista Semántica 3D</p>
            <p className="mt-1 text-xs text-text-muted">
              Agrupa nodos por similitud de código usando embeddings
            </p>
          </div>
          <button
            onClick={() => handleLoad()}
            className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/25"
          >
            <Brain className="h-4 w-4" />
            Cargar vista semántica
          </button>
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
      </div>
    );
  }

  if (state.status === 'loading-model') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-void">
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
    );
  }

  if (state.status === 'embedding') {
    const percent =
      state.total > 0 ? Math.round((state.processed / state.total) * 100) : 0;
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-void">
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
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-void">
        <Loader2 className="h-6 w-6 animate-spin text-node-interface" />
        <p className="text-sm text-text-secondary">Calculando similitudes...</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-void">
        <AlertCircle className="h-6 w-6 text-red-400" />
        <p className="text-sm text-red-400">{state.message}</p>
        <button
          onClick={() => setState({ status: 'idle' })}
          className="text-xs text-text-secondary underline hover:text-text-primary"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // Estado 'ready': Plotly renderiza en el div via newPlot
  return (
    <div className="relative h-full w-full bg-void">
      <div ref={plotRef} className="h-full w-full" />
    </div>
  );
};
```

- [ ] **Step 2: Verificar compilación TypeScript**

```bash
npx tsc --noEmit
```

Resultado esperado: sin errores en `SemanticGraph.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/SemanticGraph.tsx
git commit -m "feat: añadir componente SemanticGraph con visualización 3D Plotly"
```

---

## Task 7: Toggle Structural/Semantic en GraphCanvas

**Files:**
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Añadir import de SemanticGraph, Layers y Brain**

Al inicio de `src/components/GraphCanvas.tsx`, modificar la línea de imports de lucide-icons para añadir `Layers` y `Brain`, e importar `SemanticGraph`:

```typescript
// Añadir Layers y Brain a los imports existentes de lucide-icons:
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Focus,
  RotateCcw,
  Play,
  Pause,
  Lightbulb,
  LightbulbOff,
  Sparkles,
  Layers,
  Brain,
} from '@/lib/lucide-icons';

// Añadir import del componente (justo después de los otros imports de componentes):
import { SemanticGraph } from './SemanticGraph';
```

- [ ] **Step 2: Añadir estado del toggle**

Dentro del componente `GraphCanvas`, justo después de la línea `const [hoveredNodeName, setHoveredNodeName] = useState<string | null>(null);`, añadir:

```typescript
const [graphViewType, setGraphViewType] = useState<'structural' | 'semantic'>('structural');
```

- [ ] **Step 3: Ocultar canvas Sigma en modo semántico**

Localizar el div del contenedor Sigma (línea con `ref={containerRef}`) y añadirle la clase condicional `hidden`:

```tsx
{/* Sigma container — oculto (no destruido) en modo semántico */}
<div
  ref={containerRef}
  className={`sigma-container h-full w-full cursor-grab active:cursor-grabbing${graphViewType === 'semantic' ? ' hidden' : ''}`}
/>
```

- [ ] **Step 4: Montar SemanticGraph cuando el toggle está en modo semántico**

Justo después del div del sigma container (antes del tooltip de hover), añadir:

```tsx
{/* Vista semántica 3D */}
{graphViewType === 'semantic' && graph && (
  <SemanticGraph nodes={graph.nodes} />
)}
```

- [ ] **Step 5: Añadir botón toggle en la esquina superior izquierda**

Justo después del div del fondo (el primer div con `pointer-events-none absolute inset-0`), añadir el toggle. Debe mostrarse solo cuando hay grafo cargado:

```tsx
{/* Toggle Structural / Semantic — top-left */}
{graph && (
  <div className="absolute top-4 left-4 z-20 flex overflow-hidden rounded-lg border border-border-subtle bg-surface shadow-sm">
    <button
      onClick={() => setGraphViewType('structural')}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
        graphViewType === 'structural'
          ? 'bg-elevated text-text-primary'
          : 'text-text-muted hover:bg-hover hover:text-text-secondary'
      }`}
      title="Vista estructural (grafo 2D)"
    >
      <Layers className="h-3 w-3" />
      Structural
    </button>
    <div className="w-px bg-border-subtle" />
    <button
      onClick={() => setGraphViewType('semantic')}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
        graphViewType === 'semantic'
          ? 'bg-elevated text-text-primary'
          : 'text-text-muted hover:bg-hover hover:text-text-secondary'
      }`}
      title="Vista semántica 3D (similitud de código)"
    >
      <Brain className="h-3 w-3" />
      Semantic
    </button>
  </div>
)}
```

- [ ] **Step 6: Verificar compilación TypeScript**

```bash
npx tsc --noEmit
```

Resultado esperado: sin errores.

- [ ] **Step 7: Verificar tests existentes siguen pasando**

```bash
npx vitest run
```

Resultado esperado: todos los tests previos siguen en PASS. Los nuevos tests de semantic-cosine y semantic-kmeans también pasan.

- [ ] **Step 8: Build de producción (verificar compatibilidad Vercel)**

```bash
npm run build
```

Resultado esperado: build completado sin errores. `plotly.js-dist-min` y `umap-js` aparecen como chunks separados en el output de Vite (lazy loaded via dynamic import).

- [ ] **Step 9: Commit final**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "feat: añadir toggle Structural/Semantic en GraphCanvas"
```

---

## Self-Review

**Spec coverage:**
- ✅ Embeddings: usa `@huggingface/transformers` existente (decisión aprobada: opción A)
- ✅ Reducción 3D: `umap-js` con `nComponents: 3`
- ✅ Visualización: `plotly.js-dist-min` (decisión aprobada: opción B)
- ✅ Modelo solo se descarga al pulsar "Semantic": carga lazy en `handleLoad`
- ✅ Caché del modelo: el singleton `embedderInstance` en `embedder.ts` ya lo maneja
- ✅ Barra de progreso durante descarga del modelo
- ✅ Spinner "Generando embeddings..." con contador
- ✅ Spinner "Calculando similitudes..." durante UMAP + k-means + similitud coseno
- ✅ Aristas solo si similitud > 0.65
- ✅ Opacidad de aristas proporcional a similitud (3 buckets: low/mid/high)
- ✅ Nodos coloreados por cluster (k-means k=6, usando `COMMUNITY_COLORS` existente)
- ✅ Tooltip hover: nombre + top 3 más similares con porcentaje
- ✅ Controles orbit/zoom/pan: nativos de Plotly Scatter3d
- ✅ Toggle Structural/Semantic en GraphCanvas
- ✅ Canvas Sigma preservado (hidden, no desmontado)
- ✅ Colores del proyecto: background `#06060a`, accent `#06b6d4`, font mono JetBrains
- ✅ Sin llamadas a APIs externas
- ✅ Build Vercel: dynamic import de plotly evita incluirlo en bundle inicial
- ✅ Manejo de errores: WebGPUNotAvailableError → fallback dialog existente, otros → mensaje retry
- ✅ Sin modificar grafo estructural existente

**Placeholder scan:** ninguno encontrado.

**Type consistency:**
- `SemanticNode` definido en Task 5, usado en Task 6 ✅
- `reduceToThreeD` devuelve `[number, number, number][]`, usado como `points3D` en Task 6 ✅
- `kMeans` devuelve `number[]`, usado como `clusters` en Task 6 ✅
- `cosineSimilarity` recibe `Float32Array`, `semNodes[i].embedding` es `Float32Array` ✅
- `COMMUNITY_COLORS` importado de `../lib/constants` ✅
- `WebGPUFallbackDialog` props: `isOpen`, `onClose`, `onUseCPU`, `onSkip`, `nodeCount` ✅ (verificado en EmbeddingStatus.tsx)
