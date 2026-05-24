// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import {
  forwardRef,
  memo,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import * as d3 from 'd3';
import type { GraphNode } from 'gitnexus-shared';
import { useAppState } from '../hooks/useAppState';
import type { KnowledgeGraph } from '../core/graph/types';
import {
  detectLayer,
  groupNodesByLayer,
  computeLayerStats,
  LANE_ORDER,
  LAYER_ORDER,
  LAYER_COLORS,
  type LayerName,
} from '../lib/layerDetection';
import { computeImpact, enrichWithLayers, type ImpactResult } from '../lib/diffImpact';
import { findShortestPath } from '../lib/pathFinder';

// ── Constantes de layout ─────────────────────────────────────────────────────

const LANE_WIDTH = 180;
const LANE_HEADER_H = 48;
const NODE_RADIUS = 8;
const NODE_V_SPACING = 40;
const NODE_PADDING_TOP = 16;


// ── Tipos internos de layout ─────────────────────────────────────────────────

interface LayoutNode {
  node: GraphNode;
  layer: LayerName;
  laneIndex: number;
  y: number;
}

interface LayoutEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: 'intra' | 'cross-down' | 'cross-up';
}

// ── Handle público ───────────────────────────────────────────────────────────

export interface ArchitecturalLayersViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setDiffModeActive: (active: boolean) => void;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  graph: KnowledgeGraph;
  onNodeClick: (node: GraphNode) => void;
  isActive?: boolean;
}

// ── Tipos de relación renderizadas ───────────────────────────────────────────

const RENDER_RELATION_TYPES = new Set(['IMPORTS', 'CALLS', 'USES', 'CONTAINS', 'DEFINES']);

// ── Estilo de arista ─────────────────────────────────────────────────────────

function getEdgeStyle(kind: LayoutEdge['kind']) {
  switch (kind) {
    case 'intra':      return { stroke: 'rgba(255,255,255,0.12)', width: 1,   dashed: false };
    case 'cross-down': return { stroke: '#6366f1',                width: 1.5, dashed: false };
    case 'cross-up':   return { stroke: '#f97316',                width: 2,   dashed: true  };
  }
}

// ── Componente ───────────────────────────────────────────────────────────────

export const ArchitecturalLayersView = memo(
  forwardRef<ArchitecturalLayersViewHandle, Props>(
    ({ graph, onNodeClick, isActive: _isActive }, ref) => {
      // ── Estado local ──────────────────────────────────────────────────────
      const [diffModeActive, setDiffModeActive] = useState(false);
      const [selectedForDiff, setSelectedForDiff] = useState<Set<string>>(new Set());
      const [pathFrom, setPathFrom] = useState<string | null>(null);
      const [pathResult, setPathResult] = useState<string[] | null>(null);
      const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
      const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

      const { setArchImpactResult, setArchPathResult } = useAppState();

      // ── Refs ──────────────────────────────────────────────────────────────
      const canvasRef = useRef<HTMLCanvasElement>(null);
      const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
      const laneWidthRef = useRef(LANE_WIDTH);
      const pathFromRef = useRef<string | null>(null);
      const diffModeActiveRef = useRef(false);
      const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

      // ── Layout (useMemo) ──────────────────────────────────────────────────

      const {
        layoutNodes,
        layoutEdges,
        svgHeight,
        layerStats,
        nodeLayerMap,
        nodeNameMap,
        activeLanes,
      } = useMemo(() => {
        const filteredNodes = graph.nodes.filter(
          (n) => n.label !== 'Community' && n.label !== 'Project',
        );

        const fanIn = new Map<string, number>();
        for (const rel of graph.relationships) {
          fanIn.set(rel.targetId, (fanIn.get(rel.targetId) ?? 0) + 1);
        }

        const grouped = groupNodesByLayer(filteredNodes);
        const activeLanes: LayerName[] = LANE_ORDER.filter((l) => (grouped.get(l)?.length ?? 0) > 0);

        const nodeLayerMap = new Map<string, LayerName>();
        const nodeNameMap = new Map<string, string>();
        for (const node of filteredNodes) {
          const layer = detectLayer(node);
          nodeLayerMap.set(node.id, layer);
          nodeNameMap.set(node.id, node.properties.name ?? node.label);
        }

        const layoutNodes: LayoutNode[] = [];
        let maxNodesInLane = 0;

        const MAX_NODES_PER_LANE = 300;

        for (const [laneIndex, layer] of activeLanes.entries()) {
          const nodesInLane = (grouped.get(layer) ?? [])
            .slice()
            .sort((a, b) => (fanIn.get(b.id) ?? 0) - (fanIn.get(a.id) ?? 0))
            .slice(0, MAX_NODES_PER_LANE);
          if (nodesInLane.length > maxNodesInLane) maxNodesInLane = nodesInLane.length;

          for (const [i, node] of nodesInLane.entries()) {
            const y = LANE_HEADER_H + NODE_PADDING_TOP + i * NODE_V_SPACING + NODE_RADIUS;
            layoutNodes.push({ node, layer, laneIndex, y });
          }
        }

        const svgHeight =
          LANE_HEADER_H + NODE_PADDING_TOP + maxNodesInLane * NODE_V_SPACING + NODE_RADIUS + 24;

        const visibleNodeIds = new Set(layoutNodes.map((ln) => ln.node.id));
        const seenEdges = new Set<string>();
        const layoutEdges: LayoutEdge[] = [];

        for (const rel of graph.relationships) {
          if (!RENDER_RELATION_TYPES.has(rel.type)) continue;
          if (!visibleNodeIds.has(rel.sourceId) || !visibleNodeIds.has(rel.targetId)) continue;

          const edgeKey = `${rel.sourceId}→${rel.targetId}`;
          if (seenEdges.has(edgeKey)) continue;
          seenEdges.add(edgeKey);

          const srcLayer = nodeLayerMap.get(rel.sourceId);
          const tgtLayer = nodeLayerMap.get(rel.targetId);
          let kind: LayoutEdge['kind'] = 'intra';
          if (srcLayer && tgtLayer && srcLayer !== tgtLayer) {
            kind = LAYER_ORDER[srcLayer] < LAYER_ORDER[tgtLayer] ? 'cross-down' : 'cross-up';
          }

          layoutEdges.push({ id: edgeKey, sourceId: rel.sourceId, targetId: rel.targetId, kind });
        }

        const layerStats = computeLayerStats(filteredNodes, graph.relationships);

        // Preferir aristas cross-layer (las arquitecturalmente relevantes); cap por rendimiento.
        const crossEdges = layoutEdges.filter((e) => e.kind !== 'intra');
        const MAX_CROSS = 400;
        const MAX_INTRA_FALLBACK = 100;
        const visibleEdges =
          crossEdges.length > 0
            ? crossEdges.length <= MAX_CROSS
              ? crossEdges
              : crossEdges.filter((_, i) => i % Math.ceil(crossEdges.length / MAX_CROSS) === 0)
            : layoutEdges.slice(0, MAX_INTRA_FALLBACK);

        return { layoutNodes, layoutEdges: visibleEdges, svgHeight, layerStats, nodeLayerMap, nodeNameMap, activeLanes };
      }, [graph.nodes, graph.relationships]);

      // ── Recalcular impacto ────────────────────────────────────────────────

      useEffect(() => {
        if (!diffModeActive || selectedForDiff.size === 0) {
          setImpactResult(null);
          return;
        }
        const raw = computeImpact(selectedForDiff, graph.relationships);
        setImpactResult(enrichWithLayers(raw, nodeLayerMap));
      }, [diffModeActive, selectedForDiff, graph.relationships, nodeLayerMap]);

      // ── Sincronizar resultados al contexto global (SidePanel) ─────────────

      useEffect(() => {
        setArchImpactResult(
          impactResult
            ? { direct: impactResult.direct.size, hop1: impactResult.hop1.size, transitive: impactResult.transitive.size }
            : null,
        );
      }, [impactResult, setArchImpactResult]);

      useEffect(() => {
        setArchPathResult(pathResult);
      }, [pathResult, setArchPathResult]);

      // Sincronizar refs con estado (para handlers estables)
      useEffect(() => { pathFromRef.current = pathFrom; }, [pathFrom]);
      useEffect(() => { diffModeActiveRef.current = diffModeActive; }, [diffModeActive]);

      // ── Color de nodo ─────────────────────────────────────────────────────

      const getNodeColor = useCallback(
        (nodeId: string, layer: LayerName): { fill: string; opacity: number } => {
          if (diffModeActive && impactResult) {
            if (impactResult.direct.has(nodeId)) return { fill: '#ef4444', opacity: 1 };
            if (impactResult.hop1.has(nodeId)) return { fill: '#f97316', opacity: 1 };
            if (impactResult.transitive.has(nodeId)) return { fill: '#eab308', opacity: 1 };
            if (selectedForDiff.has(nodeId)) return { fill: '#ef4444', opacity: 1 };
            return { fill: LAYER_COLORS[layer], opacity: 0.12 };
          }
          if (selectedForDiff.has(nodeId)) return { fill: '#ef4444', opacity: 1 };
          if (pathFrom === nodeId) return { fill: '#a78bfa', opacity: 1 };
          if (pathResult?.includes(nodeId)) return { fill: '#34d399', opacity: 1 };
          if (pathResult !== null) return { fill: LAYER_COLORS[layer], opacity: 0.12 };
          return { fill: LAYER_COLORS[layer], opacity: 1 };
        },
        [diffModeActive, impactResult, selectedForDiff, pathFrom, pathResult],
      );


      // ── Handle público ────────────────────────────────────────────────────

      useImperativeHandle(
        ref,
        () => ({
          zoomIn: () => {},
          zoomOut: () => {},
          resetZoom: () => {},
          setDiffModeActive: (active: boolean) => { setDiffModeActive(active); },
        }),
        [],
      );

      // ── Dibujo en canvas ──────────────────────────────────────────────────

      useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const laneWidth = activeLanes.length > 0 ? w / activeLanes.length : LANE_WIDTH;
        laneWidthRef.current = laneWidth;

        const targetW = Math.round(w * dpr);
        const targetH = Math.round(svgHeight * dpr);
        if (canvas.width !== targetW) canvas.width = targetW;
        if (canvas.height !== targetH) canvas.height = targetH;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.scale(dpr, dpr);

        // Mapa de posiciones calculado con laneWidth real del contenedor
        const posMap = new Map<string, { x: number; y: number }>();
        for (const ln of layoutNodes) {
          posMap.set(ln.node.id, { x: ln.laneIndex * laneWidth + laneWidth / 2, y: ln.y });
        }

        // ── Fondos de carriles ────────────────────────────────────────────
        for (const [laneIndex, layer] of activeLanes.entries()) {
          ctx.fillStyle = laneIndex % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.04)';
          ctx.fillRect(laneIndex * laneWidth, 0, laneWidth, svgHeight);
        }

        // ── Headers de carriles ───────────────────────────────────────────
        for (const [laneIndex, layer] of activeLanes.entries()) {
          ctx.fillStyle = LAYER_COLORS[layer] + '22';
          ctx.fillRect(laneIndex * laneWidth, 0, laneWidth, LANE_HEADER_H);

          ctx.fillStyle = LAYER_COLORS[layer];
          ctx.font = '600 12px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(layer.toUpperCase(), laneIndex * laneWidth + laneWidth / 2, LANE_HEADER_H / 2);
        }

        // Conjunto de nodos relevantes para dimming de aristas y etiquetas
        let highlightedIds: Set<string> | null = null;
        if (pathResult !== null) {
          highlightedIds = new Set(pathResult);
          if (pathFrom) highlightedIds.add(pathFrom);
        } else if (diffModeActive && impactResult) {
          highlightedIds = new Set([
            ...selectedForDiff,
            ...impactResult.direct,
            ...impactResult.hop1,
            ...impactResult.transitive,
          ]);
        }

        // ── Aristas ───────────────────────────────────────────────────────
        ctx.textAlign = 'left';
        for (const edge of layoutEdges) {
          const src = posMap.get(edge.sourceId);
          const tgt = posMap.get(edge.targetId);
          if (!src || !tgt) continue;

          let cp1x: number, cp1y: number, cp2x: number, cp2y: number;
          if (edge.kind === 'intra') {
            cp1x = src.x + 40; cp1y = src.y;
            cp2x = tgt.x + 40; cp2y = tgt.y;
          } else {
            const mx = (src.x + tgt.x) / 2;
            cp1x = mx; cp1y = src.y;
            cp2x = mx; cp2y = tgt.y;
          }

          const isOnPath = pathResult !== null &&
            pathResult.includes(edge.sourceId) && pathResult.includes(edge.targetId);
          const isInvolved = !highlightedIds ||
            highlightedIds.has(edge.sourceId) || highlightedIds.has(edge.targetId);
          const style = getEdgeStyle(edge.kind);

          ctx.beginPath();
          ctx.moveTo(src.x, src.y);
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tgt.x, tgt.y);
          ctx.strokeStyle = isOnPath ? '#34d399' : style.stroke;
          ctx.lineWidth = isOnPath ? 2.5 : style.width;
          ctx.globalAlpha = isOnPath ? 1 : isInvolved ? 0.7 : 0.05;
          ctx.setLineDash(style.dashed ? [4, 3] : []);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);

        // ── Nodos ─────────────────────────────────────────────────────────
        ctx.font = '9px system-ui, -apple-system, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        for (const ln of layoutNodes) {
          const pos = posMap.get(ln.node.id);
          if (!pos) continue;
          const { x, y } = pos;
          const { fill, opacity } = getNodeColor(ln.node.id, ln.layer);
          const name = nodeNameMap.get(ln.node.id) ?? ln.node.label;
          const truncName = name.length > 18 ? name.slice(0, 17) + '…' : name;

          const isSelected = selectedForDiff.has(ln.node.id);
          const isPathNode = pathResult?.includes(ln.node.id) ?? false;
          const isPathFromNode = pathFrom === ln.node.id;

          if (isSelected || isPathNode || isPathFromNode) {
            ctx.beginPath();
            ctx.arc(x, y, NODE_RADIUS + 4, 0, Math.PI * 2);
            ctx.strokeStyle = isPathNode ? '#34d399' : '#a78bfa';
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.7;
            ctx.setLineDash([]);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          ctx.beginPath();
          ctx.arc(x, y, NODE_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.globalAlpha = opacity;
          ctx.fill();
          ctx.globalAlpha = 1;

          const textAlpha = !highlightedIds ? 0.75 : highlightedIds.has(ln.node.id) ? 1 : 0.15;
          ctx.fillStyle = `rgba(255,255,255,${textAlpha})`;
          ctx.fillText(truncName, x + NODE_RADIUS + 4, y);
        }

        ctx.restore();
      }, [
        layoutNodes,
        layoutEdges,
        activeLanes,
        svgHeight,
        getNodeColor,
        nodeNameMap,
        selectedForDiff,
        pathResult,
        pathFrom,
        diffModeActive,
        impactResult,
      ]);

      // ── Hover overlay (canvas ligero, solo dibuja un arco) ───────────────

      useEffect(() => {
        const canvas = hoverCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const targetW = Math.round(w * dpr);
        const targetH = Math.round(svgHeight * dpr);
        if (canvas.width !== targetW) canvas.width = targetW;
        if (canvas.height !== targetH) canvas.height = targetH;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!hoveredNodeId) return;

        const ln = layoutNodes.find((n) => n.node.id === hoveredNodeId);
        if (!ln) return;

        const laneWidth = laneWidthRef.current;
        const x = ln.laneIndex * laneWidth + laneWidth / 2;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.beginPath();
        ctx.arc(x, ln.y, NODE_RADIUS + 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }, [hoveredNodeId, layoutNodes, svgHeight]);

      // ── Helpers de hit-testing ────────────────────────────────────────────

      const canvasToGraph = useCallback((clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
      }, []);

      const getNodeAtPoint = useCallback(
        (x: number, y: number): LayoutNode | null => {
          const laneWidth = laneWidthRef.current;
          const r2 = (NODE_RADIUS + 4) ** 2;
          for (let i = layoutNodes.length - 1; i >= 0; i--) {
            const ln = layoutNodes[i];
            const nx = ln.laneIndex * laneWidth + laneWidth / 2;
            const dx = nx - x;
            const dy = ln.y - y;
            if (dx * dx + dy * dy <= r2) return ln;
          }
          return null;
        },
        [layoutNodes],
      );

      // ── Handlers de mouse ──────────────────────────────────────────────────

      const handlePointerDown = useCallback((e: React.PointerEvent) => {
        pointerStartRef.current = { x: e.clientX, y: e.clientY };
      }, []);

      const handleCanvasClick = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
          // Ignorar si fue un drag
          if (pointerStartRef.current) {
            const dx = e.clientX - pointerStartRef.current.x;
            const dy = e.clientY - pointerStartRef.current.y;
            if (Math.sqrt(dx * dx + dy * dy) > 5) return;
          }

          const { x, y } = canvasToGraph(e.clientX, e.clientY);
          const ln = getNodeAtPoint(x, y);

          if (!ln) {
            setSelectedForDiff(new Set());
            setPathFrom(null);
            setPathResult(null);
            return;
          }

          if (diffModeActiveRef.current) {
            setSelectedForDiff((prev) => {
              const next = new Set(prev);
              if (next.has(ln.node.id)) next.delete(ln.node.id);
              else next.add(ln.node.id);
              return next;
            });
            return;
          }

          // Primer clic: selecciona origen; segundo clic sobre nodo distinto: calcula ruta
          if (pathFromRef.current !== null && pathFromRef.current !== ln.node.id) {
            const path = findShortestPath(pathFromRef.current, ln.node.id, graph.relationships);
            setPathResult(path);
            setPathFrom(null);
          } else {
            setPathFrom(ln.node.id);
            setPathResult(null);
          }
        },
        [canvasToGraph, getNodeAtPoint, graph.relationships],
      );

      const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
          const { x, y } = canvasToGraph(e.clientX, e.clientY);
          const ln = getNodeAtPoint(x, y);
          setHoveredNodeId(ln?.node.id ?? null);
        },
        [canvasToGraph, getNodeAtPoint],
      );

      const handleMouseLeave = useCallback(() => setHoveredNodeId(null), []);



      // ── Render ────────────────────────────────────────────────────────────

      if (!_isActive) return <div className="h-full w-full" />;

      return (
        <div className="flex h-full w-full flex-col">
          {/* Canvas con scroll vertical */}
          <div
            className="relative flex-1 overflow-y-auto overflow-x-hidden"
            style={{ cursor: hoveredNodeId ? 'pointer' : 'default' }}
          >
            <canvas
              ref={canvasRef}
              className="block w-full"
              style={{ height: svgHeight + 'px' }}
              onPointerDown={handlePointerDown}
              onClick={handleCanvasClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />
            <canvas
              ref={hoverCanvasRef}
              className="pointer-events-none absolute top-0 left-0 w-full"
              style={{ height: svgHeight + 'px' }}
            />
          </div>
        </div>
      );
    },
  ),
);

ArchitecturalLayersView.displayName = 'ArchitecturalLayersView';
