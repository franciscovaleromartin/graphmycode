import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import noverlap from 'graphology-layout-noverlap';
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
  isActive?: boolean;
}

// ── Color helpers ───────────────────────────────────────────────────────────

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
  const range = b.t - a.t;
  const ratio = range > 0 ? (clamped - a.t) / range : 0;
  const r = Math.round(a.r + (b.r - a.r) * ratio);
  const g = Math.round(a.g + (b.g - a.g) * ratio);
  const bl = Math.round(a.b + (b.b - a.b) * ratio);
  return `rgb(${r},${g},${bl})`;
}

function nodeRadius(normalizedDegree: number): number {
  return 8 + normalizedDegree * 16;
}

// ── Component ───────────────────────────────────────────────────────────────

export const HeatmapView = forwardRef<HeatmapViewHandle, Props>(
  ({ graph, onNodeClick, onLayoutStateChange, isActive }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gRef = useRef<Graph | null>(null);
    const nodesRef = useRef<HeatmapNode[]>([]);
    const edgesRef = useRef<HeatmapEdge[]>([]);
    const rafRef = useRef<number>(0);
    const isRunningRef = useRef(false);
    const fa2SettingsRef = useRef<ReturnType<typeof forceAtlas2.inferSettings> | null>(null);

    // Camera state
    const cameraRef = useRef({ x: 0, y: 0, scale: 1 });

    // Tooltip & hover state
    const tooltipRef = useRef<{ node: HeatmapNode; px: number; py: number } | null>(null);
    const hoveredNodeRef = useRef<string | null>(null);

    // ── Build graphology graph from KnowledgeGraph ───────────────────────────
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
        if (g.hasNode(e.source) && g.hasNode(e.target) && !g.hasEdge(e.source, e.target)) {
          g.addEdge(e.source, e.target, { weight: e.weight });
        }
      });

      fa2SettingsRef.current = g.order > 0 ? forceAtlas2.inferSettings(g) : null;
      gRef.current = g;
    }, [graph]);

    // ── Tooltip drawing ──────────────────────────────────────────────────────
    function drawTooltip(
      ctx: CanvasRenderingContext2D,
      node: HeatmapNode,
      px: number,
      py: number,
      W: number,
      H: number,
    ) {
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
        `\u{1F4C4} ${node.name}`,
        `Grado total: ${node.degree}`,
        `Bidireccionales: ${biCount}`,
        ...(coupledWith ? [`Acoplado con: ${coupledWith}`] : []),
        `\u2192 Ver en panel de c\u00F3digo`,
      ];

      const boxW = 210;
      const boxH = padding * 2 + lines.length * lineH;
      let bx = px + 14;
      let by = py - boxH / 2;
      if (bx + boxW > W - 8) bx = px - boxW - 14;
      if (by < 8) by = 8;
      if (by + boxH > H - 8) by = H - boxH - 8;

      ctx.save();
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1;
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D & { roundRect: (...args: unknown[]) => void }).roundRect(bx, by, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();

      lines.forEach((line, i) => {
        ctx.font = i === 0 ? 'bold 12px monospace' : '11px monospace';
        ctx.fillStyle =
          i === 0 ? '#f97316' : i === lines.length - 1 ? '#60a5fa' : '#94a3b8';
        ctx.fillText(line, bx + padding, by + padding + lineH * i + lineH * 0.7, boxW - padding * 2);
      });
      ctx.restore();
    }

    // ── Render loop ──────────────────────────────────────────────────────────
    const render = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const g = gRef.current;
      if (!canvas || !ctx || !g) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const W = canvas.width;
      const H = canvas.height;
      const cam = cameraRef.current;

      // Run layout step if active
      if (isRunningRef.current && fa2SettingsRef.current && g.order > 0) {
        forceAtlas2.assign(g, { iterations: 3, settings: fa2SettingsRef.current });
        noverlap.assign(g, {
          maxIterations: 5,
          settings: { ratio: 1.2, margin: 8 },
        });
      }

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2 + cam.x, H / 2 + cam.y);
      ctx.scale(cam.scale, cam.scale);

      // Draw edges
      edgesRef.current.forEach(e => {
        if (!g.hasNode(e.source) || !g.hasNode(e.target)) return;
        const srcAttr = g.getNodeAttributes(e.source);
        const tgtAttr = g.getNodeAttributes(e.target);
        ctx.beginPath();
        ctx.moveTo(srcAttr.x as number, srcAttr.y as number);
        ctx.lineTo(tgtAttr.x as number, tgtAttr.y as number);
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
        if (!g.hasNode(n.id)) return;
        const attr = g.getNodeAttributes(n.id);
        const r = nodeRadius(n.normalizedDegree);
        const isHovered = hoveredNodeRef.current === n.id;

        // Glow for hot nodes
        if (n.normalizedDegree > 0.6) {
          ctx.beginPath();
          ctx.arc(attr.x as number, attr.y as number, r + 6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(239,68,68,0.12)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(attr.x as number, attr.y as number, isHovered ? r + 2 : r, 0, Math.PI * 2);
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

      // Draw tooltip in screen coords
      const tooltip = tooltipRef.current;
      if (tooltip) {
        drawTooltip(ctx, tooltip.node, tooltip.px, tooltip.py, W, H);
      }

      rafRef.current = requestAnimationFrame(render);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── World <-> Screen coords ──────────────────────────────────────────────
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
        if (!g.hasNode(n.id)) continue;
        const attr = g.getNodeAttributes(n.id);
        const r = nodeRadius(n.normalizedDegree);
        const dx = wx - (attr.x as number);
        const dy = wy - (attr.y as number);
        if (dx * dx + dy * dy <= r * r) return n;
      }
      return null;
    }

    // ── Mouse events ─────────────────────────────────────────────────────────
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

    // ── Resize observer ──────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ro = new ResizeObserver(() => {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      });
      ro.observe(canvas);
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      return () => ro.disconnect();
    }, []);

    // ── Init on graph change ─────────────────────────────────────────────────
    useEffect(() => {
      buildGraph();
    }, [buildGraph]);

    // ── Perturbar posiciones ligeramente para forzar animación visible ────────
    const randomizePositions = () => {
      const g = gRef.current;
      if (!g) return;
      const jitter = 20;
      g.forEachNode((node) => {
        const x = g.getNodeAttribute(node, 'x') as number;
        const y = g.getNodeAttribute(node, 'y') as number;
        g.setNodeAttribute(node, 'x', x + (Math.random() - 0.5) * jitter);
        g.setNodeAttribute(node, 'y', y + (Math.random() - 0.5) * jitter);
      });
    };

    // ── Auto-play: arrancar layout cada vez que la vista se activa ───────────
    useEffect(() => {
      if (isActive) {
        randomizePositions();
        isRunningRef.current = true;
        onLayoutStateChange?.(true);
      } else {
        isRunningRef.current = false;
        onLayoutStateChange?.(false);
      }
    }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Start RAF loop ───────────────────────────────────────────────────────
    useEffect(() => {
      rafRef.current = requestAnimationFrame(render);
      return () => cancelAnimationFrame(rafRef.current);
    }, [render]);

    // ── Imperative handle ────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        cameraRef.current.scale = Math.min(10, cameraRef.current.scale * 1.25);
      },
      zoomOut: () => {
        cameraRef.current.scale = Math.max(0.1, cameraRef.current.scale / 1.25);
      },
      resetZoom: () => {
        cameraRef.current = { x: 0, y: 0, scale: 1 };
      },
      startLayout: () => {
        randomizePositions();
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
