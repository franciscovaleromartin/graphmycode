import type { GraphNode, GraphRelationship } from 'gitnexus-shared';
import { NODE_COLORS } from './constants';

export type CityMetric = 'degree' | 'depth';

export interface CityBuilding {
  nodeId: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  colorHex: number; // Three.js integer color
  districtId: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function getDistrict(filePath: string): string {
  if (!filePath) return '__root__';
  const parts = filePath.replace(/^\//, '').split('/');
  return parts[0] || '__root__';
}

function hexStringToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function rgbToHexInt(r: number, g: number, b: number): number {
  return (
    (Math.round(r * 255) << 16) |
    (Math.round(g * 255) << 8) |
    Math.round(b * 255)
  );
}

/** Lerp between base node color and #ff4444 (heat) by t in [0,1] */
function computeColor(nodeLabel: string, t: number): number {
  const baseHex = NODE_COLORS[nodeLabel as keyof typeof NODE_COLORS] ?? '#9ca3af';
  const [br, bg, bb] = hexStringToRgb(baseHex);
  const [hr, hg, hb] = [1.0, 0.267, 0.267]; // #ff4444
  return rgbToHexInt(
    br + (hr - br) * t,
    bg + (hg - bg) * t,
    bb + (hb - bb) * t,
  );
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

const HEIGHT_MIN = 0.5;
const HEIGHT_MAX = 8.0;
const BUILDING_SIZE = 1.5;
const BUILDING_GAP = 0.5;
const DISTRICT_PADDING = 4;

// ─── layout ─────────────────────────────────────────────────────────────────

interface DistrictCell {
  x: number;
  z: number;
  cols: number;
}

function computeDistrictCells(
  districtSizes: Map<string, number>,
): Map<string, DistrictCell> {
  const sorted = [...districtSizes.entries()].sort((a, b) => b[1] - a[1]);
  const result = new Map<string, DistrictCell>();

  const cellSize = (n: number) =>
    Math.ceil(Math.sqrt(n)) * (BUILDING_SIZE + BUILDING_GAP) + DISTRICT_PADDING;

  const totalDistricts = sorted.length;
  const gridCols = Math.ceil(Math.sqrt(totalDistricts));

  let col = 0;
  let cursorX = 0;
  let cursorZ = 0;
  let rowMaxSize = 0;

  sorted.forEach(([districtId, count]) => {
    if (col > 0 && col % gridCols === 0) {
      cursorZ += rowMaxSize;
      cursorX = 0;
      rowMaxSize = 0;
    }
    const size = cellSize(count);
    result.set(districtId, {
      x: cursorX,
      z: cursorZ,
      cols: Math.max(1, Math.ceil(Math.sqrt(count))),
    });
    cursorX += size;
    rowMaxSize = Math.max(rowMaxSize, size);
    col++;
  });

  return result;
}

// ─── public API ─────────────────────────────────────────────────────────────

export function buildCityLayout(
  nodes: GraphNode[],
  relationships: GraphRelationship[],
  metric: CityMetric,
): CityBuilding[] {
  if (nodes.length === 0) return [];

  // 1. Compute degree per node
  const degreeMap = new Map<string, number>();
  nodes.forEach(n => degreeMap.set(n.id, 0));
  relationships.forEach(r => {
    degreeMap.set(r.sourceId, (degreeMap.get(r.sourceId) ?? 0) + 1);
    degreeMap.set(r.targetId, (degreeMap.get(r.targetId) ?? 0) + 1);
  });

  const rawMetric = (node: GraphNode): number => {
    if (metric === 'degree') return degreeMap.get(node.id) ?? 0;
    return (node.properties.filePath ?? '').split('/').length - 1;
  };

  const metricValues = nodes.map(rawMetric);
  const metricMin = Math.min(...metricValues);
  const metricMax = Math.max(...metricValues);

  // 2. Group nodes by district
  const districtNodes = new Map<string, GraphNode[]>();
  nodes.forEach(node => {
    const d = getDistrict(node.properties.filePath ?? '');
    if (!districtNodes.has(d)) districtNodes.set(d, []);
    districtNodes.get(d)!.push(node);
  });

  const districtSizes = new Map(
    [...districtNodes.entries()].map(([k, v]) => [k, v.length]),
  );

  // 3. Compute district cell origins
  const districtCells = computeDistrictCells(districtSizes);

  // 4. Build buildings
  const buildings: CityBuilding[] = [];
  const step = BUILDING_SIZE + BUILDING_GAP;

  districtNodes.forEach((dnodes, districtId) => {
    const cell = districtCells.get(districtId)!;

    dnodes.forEach((node, idx) => {
      const col = idx % cell.cols;
      const row = Math.floor(idx / cell.cols);

      const x = cell.x + col * step + BUILDING_SIZE / 2;
      const z = cell.z + row * step + BUILDING_SIZE / 2;

      const raw = rawMetric(node);
      const t = normalize(raw, metricMin, metricMax);
      const height = HEIGHT_MIN + t * (HEIGHT_MAX - HEIGHT_MIN);

      buildings.push({
        nodeId: node.id,
        x,
        z,
        width: BUILDING_SIZE,
        depth: BUILDING_SIZE,
        height,
        colorHex: computeColor(node.label, t),
        districtId,
      });
    });
  });

  return buildings;
}
