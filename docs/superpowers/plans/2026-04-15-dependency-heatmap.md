# Dependency Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una nueva vista "Heatmap" a GraphMyCode que visualiza el acoplamiento entre ficheros: nodos coloreados por calor (azul→rojo según grado), aristas bidireccionales en naranja grueso, física ForceAtlas2 con play/pause.

**Architecture:** Función pura `heatmap-metrics.ts` calcula métricas desde el grafo existente. Componente `HeatmapView.tsx` renderiza en Canvas 2D con ForceAtlas2 sincrónico por frame. Se conecta a `GraphCanvas.tsx` como cuarta pestaña junto a Structural/Semantic/City.

**Tech Stack:** React 19, Canvas 2D API, graphology, graphology-layout-forceatlas2 (ya en el proyecto), TypeScript.

---

## Mapa de ficheros

| Acción | Fichero | Responsabilidad |
|--------|---------|-----------------|
| Crear  | `src/lib/heatmap-metrics.ts` | Función pura: filtra ficheros, calcula grados, detecta bidireccionales |
| Crear  | `test/unit/heatmap-metrics.test.ts` | Tests unitarios de la función anterior |
| Crear  | `src/components/HeatmapView.tsx` | Canvas 2D: renderizado, ForceAtlas2, zoom/pan, tooltip, click |
| Modificar | `src/hooks/useAppState.tsx` | Añadir `'heatmap'` al union type `GraphViewType` |
| Modificar | `src/components/GraphCanvas.tsx` | Pestaña Heatmap, montaje del componente, zoom/play conectados |
| Modificar | `src/screens/SidePanel.tsx` | Leyenda de calor cuando `graphViewType === 'heatmap'` |
| Modificar | `src/core/llm/context-builder.ts` | Rama `heatmap` en `buildUIContext` |

---

## Task 1: heatmap-metrics.ts — función pura + tests

**Files:**
- Create: `src/lib/heatmap-metrics.ts`
- Create: `test/unit/heatmap-metrics.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `test/unit/heatmap-metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createKnowledgeGraph } from '../../src/core/graph/graph';
import { createFileNode } from '../fixtures/graph';
import { computeHeatmapData } from '../../src/lib/heatmap-metrics';
import type { GraphRelationship } from 'gitnexus-shared';

function importsRel(from: string, to: string): GraphRelationship {
  return { id: `${from}_IMPORTS_${to}`, sourceId: from, targetId: to, type: 'IMPORTS', confidence: 1, reason: '' };
}

describe('computeHeatmapData', () => {
  it('returns empty data for an empty graph', () => {
    const g = createKnowledgeGraph();
    const data = computeHeatmapData(g);
    expect(data.nodes).toHaveLength(0);
    expect(data.edges).toHaveLength(0);
    expect(data.maxDegree).toBe(0);
    expect(data.bidirectionalCount).toBe(0);
  });

  it('filters out non-File nodes', () => {
    const g = createKnowledgeGraph();
    g.addNode({ id: 'Function:foo', label: 'Function', properties: { name: 'foo' } });
    const data = computeHeatmapData(g);
    expect(data.nodes).toHaveLength(0);
  });

  it('computes degree for file nodes', () => {
    const g = createKnowledgeGraph();
    const a = createFileNode('a.ts', 'src/a.ts');
    const b = createFileNode('b.ts', 'src/b.ts');
    g.addNode(a);
    g.addNode(b);
    g.addRelationship(importsRel(a.id, b.id)); // a → b
    const data = computeHeatmapData(g);
    const nodeA = data.nodes.find(n => n.id === a.id)!;
    const nodeB = data.nodes.find(n => n.id === b.id)!;
    expect(nodeA.degree).toBe(1); // 1 arista saliente
    expect(nodeB.degree).toBe(1); // 1 arista entrante
  });

  it('detects bidirectional edges', () => {
    const g = createKnowledgeGraph();
    const a = createFileNode('a.ts', 'src/a.ts');
    const b = createFileNode('b.ts', 'src/b.ts');
    g.addNode(a);
    g.addNode(b);
    g.addRelationship(importsRel(a.id, b.id)); // a → b
    g.addRelationship(importsRel(b.id, a.id)); // b → a  (bidireccional)
    const data = computeHeatmapData(g);
    const biEdge = data.edges.find(e =>
      (e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id)
    );
    expect(biEdge).toBeDefined();
    expect(biEdge!.isBidirectional).toBe(true);
    expect(data.bidirectionalCount).toBe(1);
  });

  it('normalizes degrees to [0,1]', () => {
    const g = createKnowledgeGraph();
    const a = createFileNode('a.ts', 'src/a.ts');
    const b = createFileNode('b.ts', 'src/b.ts');
    const c = createFileNode('c.ts', 'src/c.ts');
    g.addNode(a); g.addNode(b); g.addNode(c);
    g.addRelationship(importsRel(a.id, b.id));
    g.addRelationship(importsRel(a.id, c.id)); // a tiene grado 2
    const data = computeHeatmapData(g);
    const nodeA = data.nodes.find(n => n.id === a.id)!;
    expect(nodeA.normalizedDegree).toBe(1); // máximo
    const nodeB = data.nodes.find(n => n.id === b.id)!;
    expect(nodeB.normalizedDegree).toBeGreaterThan(0);
    expect(nodeB.normalizedDegree).toBeLessThan(1);
  });

  it('ignores non-IMPORTS relationships', () => {
    const g = createKnowledgeGraph();
    const a = createFileNode('a.ts', 'src/a.ts');
    const b = createFileNode('b.ts', 'src/b.ts');
    g.addNode(a); g.addNode(b);
    g.addRelationship({ id: 'rel1', sourceId: a.id, targetId: b.id, type: 'CALLS', confidence: 1, reason: '' });
    const data = computeHeatmapData(g);
    expect(data.edges).toHaveLength(0);
    expect(data.nodes.find(n => n.id === a.id)!.degree).toBe(0);
  });
});
```

- [ ] **Step 2: Verificar que el test falla**

```bash
cd /Users/franciscovalero/Desktop/proyectos/graphmycode
npx vitest run test/unit/heatmap-metrics.test.ts
```

Salida esperada: error `Cannot find module '../../src/lib/heatmap-metrics'`.

- [ ] **Step 3: Implementar `src/lib/heatmap-metrics.ts`**

```ts
import type { KnowledgeGraph } from '../core/graph/types';

export interface HeatmapNode {
  id: string;
  name: string;
  filePath: string;
  degree: number;
  normalizedDegree: number;
}

export interface HeatmapEdge {
  source: string;
  target: string;
  isBidirectional: boolean;
  weight: number;
}

export interface HeatmapData {
  nodes: HeatmapNode[];
  edges: HeatmapEdge[];
  maxDegree: number;
  bidirectionalCount: number;
}

export function computeHeatmapData(graph: KnowledgeGraph): HeatmapData {
  // 1. Filtrar solo nodos File
  const fileNodes = graph.nodes.filter(n => n.label === 'File');
  const fileIds = new Set(fileNodes.map(n => n.id));

  // 2. Filtrar solo relaciones IMPORTS entre ficheros
  const importRels = graph.relationships.filter(
    r => r.type === 'IMPORTS' && fileIds.has(r.sourceId) && fileIds.has(r.targetId),
  );

  // 3. Calcular grado total (entrante + saliente) por nodo
  const degreeMap = new Map<string, number>();
  fileIds.forEach(id => degreeMap.set(id, 0));
  importRels.forEach(r => {
    degreeMap.set(r.sourceId, (degreeMap.get(r.sourceId) ?? 0) + 1);
    degreeMap.set(r.targetId, (degreeMap.get(r.targetId) ?? 0) + 1);
  });

  const maxDegree = Math.max(0, ...degreeMap.values());

  // 4. Detectar aristas bidireccionales: A→B y B→A
  const edgeSet = new Set(importRels.map(r => `${r.sourceId}__${r.targetId}`));
  // Deduplicar pares (solo emitir una arista por par, la bidireccional si aplica)
  const seen = new Set<string>();
  const edges: HeatmapEdge[] = [];
  let bidirectionalCount = 0;

  importRels.forEach(r => {
    const pairKey = [r.sourceId, r.targetId].sort().join('__');
    if (seen.has(pairKey)) return;
    seen.add(pairKey);
    const isBidirectional = edgeSet.has(`${r.sourceId}__${r.targetId}`) &&
                            edgeSet.has(`${r.targetId}__${r.sourceId}`);
    if (isBidirectional) bidirectionalCount++;
    edges.push({ source: r.sourceId, target: r.targetId, isBidirectional, weight: isBidirectional ? 2 : 1 });
  });

  // 5. Normalizar grados
  const nodes: HeatmapNode[] = fileNodes.map(n => {
    const degree = degreeMap.get(n.id) ?? 0;
    return {
      id: n.id,
      name: n.properties.name as string,
      filePath: (n.properties.filePath as string) ?? '',
      degree,
      normalizedDegree: maxDegree > 0 ? degree / maxDegree : 0,
    };
  });

  return { nodes, edges, maxDegree, bidirectionalCount };
}
```

- [ ] **Step 4: Verificar que los tests pasan**

```bash
npx vitest run test/unit/heatmap-metrics.test.ts
```

Salida esperada: `✓ test/unit/heatmap-metrics.test.ts (6 tests)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/heatmap-metrics.ts test/unit/heatmap-metrics.test.ts
git commit -m "feat: añadir heatmap-metrics con tests — cálculo de grado y aristas bidireccionales"
```

---

## Task 2: Ampliar GraphViewType a 'heatmap'

**Files:**
- Modify: `src/hooks/useAppState.tsx:173-174` y línea `347`
- Modify: `src/core/llm/context-builder.ts:430`

- [ ] **Step 1: Actualizar el tipo en `useAppState.tsx`**

En `src/hooks/useAppState.tsx`, cambiar las líneas 173-174:

```ts
// Antes
graphViewType: 'structural' | 'semantic' | 'city';
setGraphViewType: (v: 'structural' | 'semantic' | 'city') => void;

// Después
graphViewType: 'structural' | 'semantic' | 'city' | 'heatmap';
setGraphViewType: (v: 'structural' | 'semantic' | 'city' | 'heatmap') => void;
```

Y la línea ~347 donde se declara el estado:

```ts
// Antes
const [graphViewType, setGraphViewType] = useState<'structural' | 'semantic' | 'city'>('structural');

// Después
const [graphViewType, setGraphViewType] = useState<'structural' | 'semantic' | 'city' | 'heatmap'>('structural');
```

- [ ] **Step 2: Actualizar la firma de `buildUIContext` en `context-builder.ts`**

En `src/core/llm/context-builder.ts`, línea 430:

```ts
// Antes
export function buildUIContext(
  graphViewType: 'structural' | 'semantic' | 'city',

// Después
export function buildUIContext(
  graphViewType: 'structural' | 'semantic' | 'city' | 'heatmap',
```

Y añadir la rama heatmap dentro de la función (inmediatamente antes de `} else {` que cierra el bloque semántico):

```ts
  } else if (graphViewType === 'heatmap') {
    lines.push('Active view: DEPENDENCY HEATMAP (file coupling — nodes are files, colour and size encode total import degree)');
    lines.push('Hot nodes (red/amber) are highly coupled files — hubs with many imports/importers.');
    lines.push('Orange thick edges = bidirectional coupling (A imports B AND B imports A) — circular dependencies.');
    lines.push('Cold nodes (blue/green) are isolated, well-decoupled files.');
    if (selectedNodeName) {
      lines.push(`Selected node: ${selectedNodeName}`);
    }
  } else {
```

- [ ] **Step 3: Verificar que el proyecto compila**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores relacionados con el tipo `graphViewType`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAppState.tsx src/core/llm/context-builder.ts
git commit -m "feat: añadir 'heatmap' al tipo GraphViewType y contexto LLM"
```

---

## Task 3: HeatmapView — componente Canvas 2D

**Files:**
- Create: `src/components/HeatmapView.tsx`

- [ ] **Step 1: Crear `src/components/HeatmapView.tsx`**

```tsx
import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import type { KnowledgeGraph } from '../core/graph/types';
import type { GraphNode } from 'gitnexus-shared';
import { computeHeatmapData, type HeatmapNode, type HeatmapEdge } from '../lib/heatmap-metrics';

export interface HeatmapViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  startLayout: () => void;
  stopLayout: () => void;
}

interface Props {
  graph: KnowledgeGraph;
  onNodeClick: (node: GraphNode) => void;
  onLayoutStateChange?: (running: boolean) => void;
}

// ── Color helpers ──────────────────────────────────────────────────────────

const COLOR_STOPS = [
  { t: 0,    r: 59,  g: 130, b: 246 }, // #3b82f6 blue
  { t: 0.33, r: 34,  g: 197, b: 94  }, // #22c55e green
  { t: 0.66, r: 245, g: 158, b: 11  }, // #f59e0b amber
  { t: 1,    r: 239, g: 68,  b: 68  }, // #ef4444 red
];

function heatColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < COLOR_STOPS.length - 2 && clamped > COLOR_STOPS[i + 1].t) i++;
  const a = COLOR_STOPS[i];
  const b = COLOR_STOPS[i + 1];
  const ratio = (clamped - a.t) / (b.t - a.t);
  const r = Math.round(a.r + (b.r - a.r) * ratio);
  const g = Math.round(a.g + (b.g - a.g) * ratio);
  const bl = Math.round(a.b + (b.b - a.b) * ratio);
  return `rgb(${r},${g},${bl})`;
}

function nodeRadius(normalizedDegree: number): number {
  return 8 + normalizedDegree * 16;
}

// ── Component ──────────────────────────────────────────────────────────────

export const HeatmapView = forwardRef<HeatmapViewHandle, Props>(
  ({ graph, onNodeClick, onLayoutStateChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gRef = useRef<Graph | null>(null);
    const nodesRef = useRef<HeatmapNode[]>([]);
    const edgesRef = useRef<HeatmapEdge[]>([]);
    const rafRef = useRef<number>(0);
    const isRunningRef = useRef(false);
    const fa2SettingsRef = useRef<ReturnType<typeof forceAtlas2.inferSettings> | null>(null);

    // Camera state
    const cameraRef = useRef({ x: 0, y: 0, scale: 1 });

    // Tooltip state
    const tooltipRef = useRef<{ node: HeatmapNode; px: number; py: number } | null>(null);
    const hoveredNodeRef = useRef<string | null>(null);

    // ── Build graphology graph from KnowledgeGraph ──
    const buildGraph = useCallback(() => {
      const data = computeHeatmapData(graph);
      nodesRef.current = data.nodes;
      edgesRef.current = data.edges;

      const g = new Graph({ type: 'directed', multi: false });
      const canvas = canvasRef.current;
      const W = canvas?.width ?? 800;
      const H = canvas?.height ?? 600;

      data.nodes.forEach(n => {
        g.addNode(n.id, {
          x: (Math.random() - 0.5) * W * 0.8,
          y: (Math.random() - 0.5) * H * 0.8,
          size: nodeRadius(n.normalizedDegree),
        });
      });
      data.edges.forEach(e => {
        if (!g.hasEdge(e.source, e.target)) {
          g.addEdge(e.source, e.target, { weight: e.weight });
        }
      });

      fa2SettingsRef.current = g.order > 0 ? forceAtlas2.inferSettings(g) : null;
      gRef.current = g;
    }, [graph]);

    // ── Render loop ──
    const render = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const g = gRef.current;
      if (!canvas || !ctx || !g) return;

      const W = canvas.width;
      const H = canvas.height;
      const cam = cameraRef.current;

      // Run layout step if active
      if (isRunningRef.current && fa2SettingsRef.current) {
        forceAtlas2.assign(g, { iterations: 3, settings: fa2SettingsRef.current });
      }

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2 + cam.x, H / 2 + cam.y);
      ctx.scale(cam.scale, cam.scale);

      // Draw edges
      edgesRef.current.forEach(e => {
        const srcAttr = g.getNodeAttributes(e.source);
        const tgtAttr = g.getNodeAttributes(e.target);
        if (!srcAttr || !tgtAttr) return;
        ctx.beginPath();
        ctx.moveTo(srcAttr.x, srcAttr.y);
        ctx.lineTo(tgtAttr.x, tgtAttr.y);
        if (e.isBidirectional) {
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = Math.min(3 + e.weight * 1.5, 7);
          ctx.globalAlpha = 0.85;
        } else {
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.5;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // Draw nodes
      nodesRef.current.forEach(n => {
        const attr = g.getNodeAttributes(n.id);
        if (!attr) return;
        const r = nodeRadius(n.normalizedDegree);
        const isHovered = hoveredNodeRef.current === n.id;

        // Glow for hot nodes
        if (n.normalizedDegree > 0.6) {
          ctx.beginPath();
          ctx.arc(attr.x, attr.y, r + 6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(239,68,68,0.12)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(attr.x, attr.y, isHovered ? r + 2 : r, 0, Math.PI * 2);
        ctx.fillStyle = heatColor(n.normalizedDegree);
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;

        if (isHovered) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });

      ctx.restore();

      // Draw tooltip (in screen coords, not world)
      const tooltip = tooltipRef.current;
      if (tooltip) {
        drawTooltip(ctx, tooltip.node, tooltip.px, tooltip.py, W, H);
      }

      rafRef.current = requestAnimationFrame(render);
    }, []);

    function drawTooltip(ctx: CanvasRenderingContext2D, node: HeatmapNode, px: number, py: number, W: number, H: number) {
      const padding = 12;
      const lineH = 18;
      const biCount = edgesRef.current.filter(
        e => e.isBidirectional && (e.source === node.id || e.target === node.id),
      ).length;
      const coupledWith = edgesRef.current
        .filter(e => e.isBidirectional && (e.source === node.id || e.target === node.id))
        .map(e => {
          const otherId = e.source === node.id ? e.target : e.source;
          return nodesRef.current.find(n => n.id === otherId)?.name ?? otherId;
        })
        .slice(0, 3)
        .join(', ');

      const lines = [
        `📄 ${node.name}`,
        `Grado total: ${node.degree}`,
        `Bidireccionales: ${biCount}`,
        ...(coupledWith ? [`Acoplado con: ${coupledWith}`] : []),
        `→ Ver en panel de código`,
      ];

      const boxW = 200;
      const boxH = padding * 2 + lines.length * lineH;
      let bx = px + 12;
      let by = py - boxH / 2;
      if (bx + boxW > W - 8) bx = px - boxW - 12;
      if (by < 8) by = 8;
      if (by + boxH > H - 8) by = H - boxH - 8;

      ctx.save();
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();

      lines.forEach((line, i) => {
        ctx.font = i === 0 ? 'bold 12px monospace' : '11px monospace';
        ctx.fillStyle = i === 0 ? '#f97316' : i === lines.length - 1 ? '#60a5fa' : '#94a3b8';
        ctx.fillText(line, bx + padding, by + padding + lineH * i + lineH * 0.7);
      });
      ctx.restore();
    }

    // ── World <-> Screen coords ──
    function screenToWorld(sx: number, sy: number) {
      const canvas = canvasRef.current!;
      const cam = cameraRef.current;
      return {
        x: (sx - canvas.width / 2 - cam.x) / cam.scale,
        y: (sy - canvas.height / 2 - cam.y) / cam.scale,
      };
    }

    function hitTestNode(wx: number, wy: number): HeatmapNode | null {
      const g = gRef.current;
      if (!g) return null;
      for (const n of nodesRef.current) {
        const attr = g.getNodeAttributes(n.id);
        if (!attr) continue;
        const r = nodeRadius(n.normalizedDegree);
        const dx = wx - attr.x;
        const dy = wy - attr.y;
        if (dx * dx + dy * dy <= r * r) return n;
      }
      return null;
    }

    // ── Mouse events ──
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const mouseDownPosRef = useRef({ x: 0, y: 0 });

    function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    }

    function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (isDraggingRef.current) {
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        cameraRef.current.x += dx;
        cameraRef.current.y += dy;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        tooltipRef.current = null;
        hoveredNodeRef.current = null;
        return;
      }

      const { x: wx, y: wy } = screenToWorld(sx, sy);
      const hit = hitTestNode(wx, wy);
      hoveredNodeRef.current = hit?.id ?? null;
      if (hit) {
        tooltipRef.current = { node: hit, px: sx, py: sy };
        canvas.style.cursor = 'pointer';
      } else {
        tooltipRef.current = null;
        canvas.style.cursor = 'grab';
      }
    }

    function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      // Distinguir click de drag usando la posición inicial del mousedown
      const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
      const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);
      if (dx > 4 || dy > 4) return;

      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x: wx, y: wy } = screenToWorld(sx, sy);
      const hit = hitTestNode(wx, wy);
      if (hit) {
        const graphNode = graph.nodes.find(n => n.id === hit.id);
        if (graphNode) onNodeClick(graphNode);
      }
    }

    function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      cameraRef.current.scale = Math.max(0.1, Math.min(10, cameraRef.current.scale * factor));
    }

    // ── Resize observer ──
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ro = new ResizeObserver(() => {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }, []);

    // ── Init on graph change ──
    useEffect(() => {
      buildGraph();
    }, [buildGraph]);

    // ── Start/stop RAF loop ──
    useEffect(() => {
      rafRef.current = requestAnimationFrame(render);
      return () => cancelAnimationFrame(rafRef.current);
    }, [render]);

    // ── Imperative handle ──
    useImperativeHandle(ref, () => ({
      zoomIn: () => { cameraRef.current.scale = Math.min(10, cameraRef.current.scale * 1.25); },
      zoomOut: () => { cameraRef.current.scale = Math.max(0.1, cameraRef.current.scale / 1.25); },
      resetZoom: () => { cameraRef.current = { x: 0, y: 0, scale: 1 }; },
      startLayout: () => {
        isRunningRef.current = true;
        onLayoutStateChange?.(true);
      },
      stopLayout: () => {
        isRunningRef.current = false;
        onLayoutStateChange?.(false);
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ cursor: 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          isDraggingRef.current = false;
          tooltipRef.current = null;
          hoveredNodeRef.current = null;
        }}
        onWheel={handleWheel}
      />
    );
  },
);

HeatmapView.displayName = 'HeatmapView';
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores en `HeatmapView.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/HeatmapView.tsx
git commit -m "feat: añadir componente HeatmapView con Canvas 2D, ForceAtlas2 y tooltip"
```

---

## Task 4: Integrar HeatmapView en GraphCanvas

**Files:**
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Añadir import y ref**

En `src/components/GraphCanvas.tsx`, añadir el import al principio del bloque de imports de componentes:

```ts
import { HeatmapView, type HeatmapViewHandle } from './HeatmapView';
```

Tras la línea `const cityRef = useRef<CityViewHandle>(null);` (línea ~81), añadir:

```ts
const heatmapRef = useRef<HeatmapViewHandle>(null);
const [isHeatmapLayoutRunning, setIsHeatmapLayoutRunning] = useState(false);
const [hasHeatmapBeenActivated, setHasHeatmapBeenActivated] = useState(false);
```

- [ ] **Step 2: Añadir pestaña Heatmap en el toggle de vistas**

En el bloque del toggle (`/* Toggle Structural / Semantic — top-left */`), añadir la pestaña tras el divisor de Technical Debt:

```tsx
<div className="w-px bg-border-subtle" />
<button
  onClick={() => { setGraphViewType('heatmap'); setHasHeatmapBeenActivated(true); }}
  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
    graphViewType === 'heatmap'
      ? 'bg-elevated text-text-primary'
      : 'text-text-muted hover:bg-hover hover:text-text-secondary'
  }`}
  title="Vista de acoplamiento entre ficheros"
>
  <GitBranch className="h-3 w-3" />
  Heatmap
</button>
```

- [ ] **Step 3: Montar el componente HeatmapView**

Tras el bloque de CityView (`{hasCityBeenActivated && graph && (...)}`) añadir:

```tsx
{/* Vista Heatmap — Canvas 2D de acoplamiento */}
{hasHeatmapBeenActivated && graph && (
  <div className={`absolute inset-0 z-10 overflow-hidden${graphViewType !== 'heatmap' ? ' invisible pointer-events-none' : ''}`}>
    <HeatmapView
      ref={heatmapRef}
      graph={graph}
      onNodeClick={(node) => {
        setSelectedNode(node);
        openCodePanel();
      }}
      onLayoutStateChange={setIsHeatmapLayoutRunning}
    />
  </div>
)}
```

- [ ] **Step 4: Conectar zoom al HeatmapView**

En los tres botones de zoom (líneas ~497-511), añadir la rama `heatmap` a cada ternario:

```tsx
// Zoom In
onClick={() => graphViewType === 'semantic' ? semanticRef.current?.zoomIn()
  : graphViewType === 'city' ? cityRef.current?.zoomIn()
  : graphViewType === 'heatmap' ? heatmapRef.current?.zoomIn()
  : zoomIn()}

// Zoom Out
onClick={() => graphViewType === 'semantic' ? semanticRef.current?.zoomOut()
  : graphViewType === 'city' ? cityRef.current?.zoomOut()
  : graphViewType === 'heatmap' ? heatmapRef.current?.zoomOut()
  : zoomOut()}

// Reset Zoom
onClick={() => graphViewType === 'semantic' ? semanticRef.current?.resetZoom()
  : graphViewType === 'city' ? cityRef.current?.resetZoom()
  : graphViewType === 'heatmap' ? heatmapRef.current?.resetZoom()
  : resetZoom()}
```

- [ ] **Step 5: Conectar play/pause al HeatmapView**

En el botón de layout (líneas ~547-563), añadir la rama heatmap en el `onClick`:

```tsx
onClick={() => {
  if (graphViewType === 'city') {
    cityRef.current?.restartAnimation();
  } else if (graphViewType === 'heatmap') {
    if (isHeatmapLayoutRunning) {
      heatmapRef.current?.stopLayout();
    } else {
      heatmapRef.current?.startLayout();
    }
  } else {
    isLayoutRunning ? stopLayout() : startLayout();
  }
}}
```

Y actualizar la condición del botón de estado animado y el indicador visual. El botón de play ya usa `isLayoutRunning` para la clase animated — añadir `isHeatmapLayoutRunning` a la condición:

```tsx
// Clase del botón play (la condición de animación):
isLayoutRunning || isHeatmapLayoutRunning
  ? 'animate-pulse border-accent bg-accent text-white shadow-glow'
  : 'border-border-subtle bg-elevated text-text-secondary hover:bg-hover hover:text-text-primary'

// Icono play/pause:
{(isLayoutRunning || isHeatmapLayoutRunning) ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
```

Y el indicador de layout running (líneas ~567-571):

```tsx
{(isLayoutRunning || isHeatmapLayoutRunning) && (
  <div className="...">
```

- [ ] **Step 6: Ocultar sigma container en modo heatmap**

Buscar la línea del sigma container (línea ~435):

```tsx
// Antes
className={`sigma-container h-full w-full cursor-grab active:cursor-grabbing${graphViewType === 'semantic' || graphViewType === 'city' ? ' invisible pointer-events-none' : ''}`}

// Después
className={`sigma-container h-full w-full cursor-grab active:cursor-grabbing${graphViewType === 'semantic' || graphViewType === 'city' || graphViewType === 'heatmap' ? ' invisible pointer-events-none' : ''}`}
```

- [ ] **Step 7: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "feat: integrar HeatmapView en GraphCanvas — pestaña, zoom, play/pause"
```

---

## Task 5: Leyenda en el sidebar

**Files:**
- Modify: `src/screens/SidePanel.tsx`

- [ ] **Step 1: Añadir leyenda heatmap en SidePanel.tsx**

En `src/screens/SidePanel.tsx`, dentro del bloque de la leyenda, añadir una rama para `graphViewType === 'heatmap'` justo antes del bloque `else` final (el de la vista por defecto).

El bloque actual termina con:
```tsx
) : (
  <div className="space-y-1.5">
    {LEGEND_LABELS.map(...)}
  </div>
)}
```

Cambiar a:
```tsx
) : graphViewType === 'heatmap' ? (
  <div className="space-y-3">
    {/* Gradiente de calor */}
    <div>
      <p className="mb-1.5 text-xs text-text-muted">Acoplamiento</p>
      <div className="flex flex-col gap-1">
        <div
          className="h-2.5 w-full rounded-full"
          style={{ background: 'linear-gradient(to right, #3b82f6, #22c55e, #f59e0b, #ef4444)' }}
        />
        <div className="flex justify-between">
          <span className="text-xs text-text-muted">Bajo</span>
          <span className="text-xs text-red-400">Alto</span>
        </div>
      </div>
    </div>
    {/* Aristas */}
    <div>
      <p className="mb-1.5 text-xs text-text-muted">Aristas</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-5 flex-shrink-0 rounded" style={{ backgroundColor: '#334155' }} />
          <span className="text-xs text-text-secondary">Unidireccional</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1 w-5 flex-shrink-0 rounded" style={{ backgroundColor: '#f97316' }} />
          <span className="text-xs text-text-secondary">Bidireccional ⇄</span>
        </div>
      </div>
    </div>
    {/* Stats */}
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">Ficheros</span>
        <span className="font-mono text-xs font-medium text-text-primary">
          {stats.files}
        </span>
      </div>
    </div>
  </div>
) : (
  <div className="space-y-1.5">
    {LEGEND_LABELS.map(...)}
  </div>
)}
```

También actualizar el título de la sección de leyenda para incluir el caso heatmap:

```tsx
// Antes
{graphViewType === 'semantic' ? 'Clusters' : graphViewType === 'city' ? 'Technical Debt' : t.legendTitle}

// Después
{graphViewType === 'semantic' ? 'Clusters' : graphViewType === 'city' ? 'Technical Debt' : graphViewType === 'heatmap' ? 'Acoplamiento' : t.legendTitle}
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/screens/SidePanel.tsx
git commit -m "feat: añadir leyenda de calor en sidebar para la vista Heatmap"
```

---

## Task 6: Suite de tests completa y verificación final

**Files:**
- Test: `test/unit/heatmap-metrics.test.ts` (ya creado en Task 1)

- [ ] **Step 1: Correr todos los tests unitarios**

```bash
npx vitest run test/unit/
```

Salida esperada: todos los tests pasan, sin regresiones.

- [ ] **Step 2: Verificar la build de producción**

```bash
npx vite build
```

Salida esperada: build exitosa sin errores de TypeScript ni bundling.

- [ ] **Step 3: Commit final y push**

```bash
git add -A
git status  # verificar que no hay ficheros inesperados
git commit -m "feat: vista Dependency Heatmap completa — Canvas 2D, ForceAtlas2, paleta volcánica"
git push origin main
```

---

## Criterios de aceptación (checklist final)

- [ ] La pestaña "Heatmap" aparece junto a Structural / Semantic / Technical Debt
- [ ] Al activarla se renderizan solo nodos `File` con la paleta volcánica
- [ ] Las aristas bidireccionales son visualmente distintas (naranja, gruesas)
- [ ] La física play/pause funciona (botón se anima, nodos se mueven)
- [ ] Click en nodo muestra tooltip con métricas y abre el panel de código
- [ ] La leyenda en el sidebar muestra gradiente azul→rojo y leyenda de aristas
- [ ] Zoom (botones + scroll) y pan (drag) funcionan
- [ ] El agente LLM recibe la descripción correcta de la vista heatmap
- [ ] `npx tsc --noEmit` pasa sin errores
- [ ] `npx vitest run test/unit/` pasa sin regresiones
