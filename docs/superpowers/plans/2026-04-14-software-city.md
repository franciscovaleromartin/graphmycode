# SoftwareCity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third graph view (`'city'`) that renders each node in the KnowledgeGraph as a 3D building grouped by folder, with configurable height metrics (degree/depth) and full click/hover interactivity wired to the existing AppState.

**Architecture:** Pure `city-layout.ts` function transforms `GraphNode[]` + `GraphRelationship[]` into `CityBuilding[]` with pre-computed positions, heights and colors. A `<CityView>` r3f Canvas mounts alongside SemanticGraph (invisible when not active). A single `InstancedMesh` handles all buildings in one draw call. Click/hover events call the same `setSelectedNode` / `openCodePanel` that the 2D view uses today.

**Tech Stack:** `@react-three/fiber` v8, `@react-three/drei` v9, Three.js (peer dep of r3f), React 18, TypeScript, Vite, Tailwind CSS.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/lib/city-layout.ts` | Pure function: nodes → CityBuilding[] (no Three.js) |
| Create | `src/components/CityView.tsx` | r3f Canvas root + metric selector overlay |
| Create | `src/components/city/CityBuildings.tsx` | InstancedMesh, raycasting, hover/click |
| Create | `src/components/city/CityDistricts.tsx` | Floor planes + text labels per district |
| Create | `src/components/city/CityTooltip.tsx` | drei Html tooltip on hover |
| Modify | `src/lib/lucide-icons.tsx` | Export `Building2` icon |
| Modify | `src/hooks/useAppState.tsx` | Extend `graphViewType` to include `'city'` |
| Modify | `src/components/GraphCanvas.tsx` | Add City button + mount `<CityView>` |
| Create | `test/unit/city-layout.test.ts` | Unit tests for layout algorithm |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install r3f and drei**

```bash
cd /Users/franciscovalero/Desktop/proyectos/graphmycode
npm install @react-three/fiber@^8.18.0 @react-three/drei@^9.122.0 three@^0.176.0
npm install --save-dev @types/three@^0.176.0
```

Expected output: packages added, no peer dep warnings for React 18.

- [ ] **Step 2: Verify installation**

```bash
node -e "require('./node_modules/@react-three/fiber/dist/react-three-fiber.cjs.js'); console.log('r3f OK')"
```

Expected: `r3f OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: instalar @react-three/fiber, drei y three para vista SoftwareCity"
```

---

## Task 2: Add Building2 icon to lucide-icons

**Files:**
- Modify: `src/lib/lucide-icons.tsx`

- [ ] **Step 1: Add Building2 to exports**

Open `src/lib/lucide-icons.tsx` and add `Building2` to the existing export list (same pattern as the other icons already there).

```tsx
export {
  // ... existing exports ...
  Building2,
} from 'lucide-react';
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/lucide-icons.tsx
git commit -m "feat: exportar icono Building2 para botón de vista ciudad"
```

---

## Task 3: Write failing tests for city-layout

**Files:**
- Create: `test/unit/city-layout.test.ts`

- [ ] **Step 1: Create test file**

```typescript
// test/unit/city-layout.test.ts
import { describe, it, expect } from 'vitest';
import { buildCityLayout } from '../../src/lib/city-layout';
import type { GraphNode, GraphRelationship } from 'gitnexus-shared';

const makeNode = (id: string, filePath: string): GraphNode => ({
  id,
  label: 'File',
  properties: { name: id, filePath },
});

const makeRel = (sourceId: string, targetId: string): GraphRelationship => ({
  id: `${sourceId}->${targetId}`,
  sourceId,
  targetId,
  type: 'IMPORTS',
  confidence: 1,
  reason: '',
});

describe('buildCityLayout', () => {
  it('returns one building per node', () => {
    const nodes = [
      makeNode('a', 'src/a.ts'),
      makeNode('b', 'src/b.ts'),
      makeNode('c', 'lib/c.ts'),
    ];
    const result = buildCityLayout(nodes, [], 'degree');
    expect(result).toHaveLength(3);
  });

  it('groups nodes into districts by top-level path segment', () => {
    const nodes = [
      makeNode('a', 'src/a.ts'),
      makeNode('b', 'src/b.ts'),
      makeNode('c', 'lib/c.ts'),
    ];
    const result = buildCityLayout(nodes, [], 'degree');
    const srcBuildings = result.filter(b => b.districtId === 'src');
    const libBuildings = result.filter(b => b.districtId === 'lib');
    expect(srcBuildings).toHaveLength(2);
    expect(libBuildings).toHaveLength(1);
  });

  it('assigns higher height to nodes with more connections (degree metric)', () => {
    const nodes = [
      makeNode('hub', 'src/hub.ts'),
      makeNode('leaf', 'src/leaf.ts'),
    ];
    // hub has 3 connections, leaf has 1
    const rels: GraphRelationship[] = [
      makeRel('hub', 'leaf'),
      makeRel('hub', 'leaf'), // duplicate ignored, but let's add different targets
    ];
    const rels2: GraphRelationship[] = [
      makeRel('hub', 'leaf'),
      makeRel('a', 'hub'),
      makeRel('b', 'hub'),
    ];
    const nodesWithExtra = [
      makeNode('hub', 'src/hub.ts'),
      makeNode('leaf', 'src/leaf.ts'),
      makeNode('a', 'src/a.ts'),
      makeNode('b', 'src/b.ts'),
    ];
    const result = buildCityLayout(nodesWithExtra, rels2, 'degree');
    const hub = result.find(b => b.nodeId === 'hub')!;
    const leaf = result.find(b => b.nodeId === 'leaf')!;
    expect(hub.height).toBeGreaterThan(leaf.height);
  });

  it('assigns higher height to deeper paths (depth metric)', () => {
    const nodes = [
      makeNode('shallow', 'src/a.ts'),
      makeNode('deep', 'src/nested/deep/a.ts'),
    ];
    const result = buildCityLayout(nodes, [], 'depth');
    const shallow = result.find(b => b.nodeId === 'shallow')!;
    const deep = result.find(b => b.nodeId === 'deep')!;
    expect(deep.height).toBeGreaterThan(shallow.height);
  });

  it('all buildings have height in range [0.5, 8.0]', () => {
    const nodes = Array.from({ length: 50 }, (_, i) =>
      makeNode(`n${i}`, `src/sub${i % 5}/file${i}.ts`)
    );
    const rels = nodes.slice(0, 20).map((n, i) => makeRel(n.id, nodes[(i + 1) % 50].id));
    const result = buildCityLayout(nodes, rels, 'degree');
    for (const b of result) {
      expect(b.height).toBeGreaterThanOrEqual(0.5);
      expect(b.height).toBeLessThanOrEqual(8.0);
    }
  });

  it('all buildings have non-overlapping centers within same district', () => {
    const nodes = Array.from({ length: 9 }, (_, i) =>
      makeNode(`n${i}`, `src/file${i}.ts`)
    );
    const result = buildCityLayout(nodes, [], 'degree');
    const srcBuildings = result.filter(b => b.districtId === 'src');
    // No two buildings share the exact same (x, z)
    const positions = srcBuildings.map(b => `${b.x.toFixed(2)},${b.z.toFixed(2)}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(srcBuildings.length);
  });

  it('returns empty array for empty graph', () => {
    expect(buildCityLayout([], [], 'degree')).toEqual([]);
  });

  it('nodes with no filePath go to __root__ district', () => {
    const node: GraphNode = { id: 'x', label: 'Project', properties: { name: 'x', filePath: '' } };
    const result = buildCityLayout([node], [], 'degree');
    expect(result[0].districtId).toBe('__root__');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/franciscovalero/Desktop/proyectos/graphmycode
npx vitest run test/unit/city-layout.test.ts
```

Expected: FAIL — `Cannot find module '../../src/lib/city-layout'`

---

## Task 4: Implement city-layout.ts

**Files:**
- Create: `src/lib/city-layout.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/city-layout.ts
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

/**
 * Compute (x, z) positions for districts using a simple row-based layout.
 * Districts are sorted by node count (largest first) and packed into rows.
 */
function computeDistrictRects(
  districtSizes: Map<string, number>,
): Map<string, { x: number; z: number; cols: number }> {
  const sorted = [...districtSizes.entries()].sort((a, b) => b[1] - a[1]);
  const result = new Map<string, { x: number; z: number; cols: number }>();

  const cellSize = (n: number) => Math.ceil(Math.sqrt(n)) * (BUILDING_SIZE + BUILDING_GAP) + DISTRICT_PADDING;

  // Place districts in a grid: sqrt(total) columns
  const totalDistricts = sorted.length;
  const gridCols = Math.ceil(Math.sqrt(totalDistricts));

  let col = 0;
  let row = 0;
  let rowMaxSize = 0;
  let cursorX = 0;
  let cursorZ = 0;
  const rowStartX: number[] = [0];

  sorted.forEach(([districtId, count]) => {
    const size = cellSize(count);
    if (col > 0 && col % gridCols === 0) {
      row++;
      cursorZ += rowMaxSize;
      cursorX = 0;
      rowMaxSize = 0;
      rowStartX[row] = cursorZ;
    }
    result.set(districtId, { x: cursorX, z: cursorZ, cols: Math.ceil(Math.sqrt(count)) });
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

  // 1. Compute raw metric values per node
  const degreeMap = new Map<string, number>();
  nodes.forEach(n => degreeMap.set(n.id, 0));
  relationships.forEach(r => {
    degreeMap.set(r.sourceId, (degreeMap.get(r.sourceId) ?? 0) + 1);
    degreeMap.set(r.targetId, (degreeMap.get(r.targetId) ?? 0) + 1);
  });

  const rawMetric = (node: GraphNode): number => {
    if (metric === 'degree') return degreeMap.get(node.id) ?? 0;
    // depth = number of '/' separators in filePath
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

  const districtSizes = new Map([...districtNodes.entries()].map(([k, v]) => [k, v.length]));

  // 3. Compute district origins
  const districtRects = computeDistrictRects(districtSizes);

  // 4. Build buildings
  const buildings: CityBuilding[] = [];

  districtNodes.forEach((dnodes, districtId) => {
    const rect = districtRects.get(districtId)!;
    const cols = rect.cols || 1;
    const step = BUILDING_SIZE + BUILDING_GAP;

    dnodes.forEach((node, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const x = rect.x + col * step + BUILDING_SIZE / 2;
      const z = rect.z + row * step + BUILDING_SIZE / 2;

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
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run test/unit/city-layout.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/city-layout.ts test/unit/city-layout.test.ts
git commit -m "feat: implementar city-layout con algoritmo treemap y tests"
```

---

## Task 5: Extend AppState to support 'city' view

**Files:**
- Modify: `src/hooks/useAppState.tsx`

- [ ] **Step 1: Update the type definition (line ~173)**

Find and replace:
```typescript
// Before
graphViewType: 'structural' | 'semantic';
setGraphViewType: (v: 'structural' | 'semantic') => void;
```

```typescript
// After
graphViewType: 'structural' | 'semantic' | 'city';
setGraphViewType: (v: 'structural' | 'semantic' | 'city') => void;
```

- [ ] **Step 2: Update the useState call (line ~341)**

Find and replace:
```typescript
// Before
const [graphViewType, setGraphViewType] = useState<'structural' | 'semantic'>('structural');
```

```typescript
// After
const [graphViewType, setGraphViewType] = useState<'structural' | 'semantic' | 'city'>('structural');
```

- [ ] **Step 3: Run existing tests to make sure nothing broke**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAppState.tsx
git commit -m "feat: ampliar graphViewType con modo 'city'"
```

---

## Task 6: Create CityTooltip component

**Files:**
- Create: `src/components/city/CityTooltip.tsx`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p /Users/franciscovalero/Desktop/proyectos/graphmycode/src/components/city
```

```tsx
// src/components/city/CityTooltip.tsx
import { Html } from '@react-three/drei';
import type { CityBuilding } from '../../lib/city-layout';

interface Props {
  building: CityBuilding;
  nodeName: string;
  nodeLabel: string;
  metricLabel: string;
  metricValue: number;
}

export function CityTooltip({ building, nodeName, nodeLabel, metricLabel, metricValue }: Props) {
  return (
    <Html
      position={[building.x, building.height + 0.8, building.z]}
      center
      style={{ pointerEvents: 'none' }}
    >
      <div className="rounded-lg border border-white/10 bg-gray-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm whitespace-nowrap">
        <p className="font-mono font-medium text-white">{nodeName}</p>
        <p className="text-gray-400">{nodeLabel}</p>
        <p className="mt-1 text-gray-300">
          <span className="text-gray-500">{metricLabel}:</span>{' '}
          <span className="font-semibold text-amber-400">{metricValue}</span>
        </p>
      </div>
    </Html>
  );
}
```

---

## Task 7: Create CityDistricts component

**Files:**
- Create: `src/components/city/CityDistricts.tsx`

- [ ] **Step 1: Create file**

```tsx
// src/components/city/CityDistricts.tsx
import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { CityBuilding } from '../../lib/city-layout';

interface Props {
  buildings: CityBuilding[];
}

interface DistrictBounds {
  id: string;
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

function computeDistrictBounds(buildings: CityBuilding[]): DistrictBounds[] {
  const map = new Map<string, DistrictBounds>();
  buildings.forEach(b => {
    const half = b.width / 2;
    const existing = map.get(b.districtId);
    if (!existing) {
      map.set(b.districtId, { id: b.districtId, minX: b.x - half, maxX: b.x + half, minZ: b.z - half, maxZ: b.z + half });
    } else {
      existing.minX = Math.min(existing.minX, b.x - half);
      existing.maxX = Math.max(existing.maxX, b.x + half);
      existing.minZ = Math.min(existing.minZ, b.z - half);
      existing.maxZ = Math.max(existing.maxZ, b.z + half);
    }
  });
  return [...map.values()];
}

const PADDING = 1.5;
const FLOOR_COLOR = new THREE.Color('#1a1a2e');
const FLOOR_BORDER_COLOR = new THREE.Color('#2d2d4a');

export function CityDistricts({ buildings }: Props) {
  const districts = useMemo(() => computeDistrictBounds(buildings), [buildings]);

  return (
    <>
      {districts.map(d => {
        const w = d.maxX - d.minX + PADDING * 2;
        const h = d.maxZ - d.minZ + PADDING * 2;
        const cx = (d.minX + d.maxX) / 2;
        const cz = (d.minZ + d.maxZ) / 2;

        return (
          <group key={d.id}>
            {/* Floor plane */}
            <mesh position={[cx, -0.05, cz]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[w, h]} />
              <meshStandardMaterial color={FLOOR_COLOR} />
            </mesh>
            {/* Border frame using LineLoop */}
            <lineLoop position={[cx, 0, cz]}>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[new Float32Array([
                    -w/2, 0, -h/2,
                     w/2, 0, -h/2,
                     w/2, 0,  h/2,
                    -w/2, 0,  h/2,
                  ]), 3]}
                />
              </bufferGeometry>
              <lineBasicMaterial color={FLOOR_BORDER_COLOR} />
            </lineLoop>
            {/* District label */}
            <Text
              position={[cx, 0.2, d.minZ - PADDING + 0.5]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.8}
              color="#6366f1"
              anchorX="center"
              anchorY="middle"
            >
              {d.id}
            </Text>
          </group>
        );
      })}
    </>
  );
}
```

---

## Task 8: Create CityBuildings component

**Files:**
- Create: `src/components/city/CityBuildings.tsx`

- [ ] **Step 1: Create file**

```tsx
// src/components/city/CityBuildings.tsx
import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { type ThreeEvent } from '@react-three/fiber';
import type { CityBuilding } from '../../lib/city-layout';

interface Props {
  buildings: CityBuilding[];
  onHover: (nodeId: string | null) => void;
  onClick: (nodeId: string) => void;
  hoveredNodeId: string | null;
}

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ vertexColors: true });
const dummy = new THREE.Object3D();

export function CityBuildings({ buildings, onHover, onClick, hoveredNodeId }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Update instance matrices and colors whenever buildings or hover changes
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || buildings.length === 0) return;

    const color = new THREE.Color();

    buildings.forEach((b, i) => {
      // Position: y is height/2 so the building sits on y=0
      dummy.position.set(b.x, b.height / 2, b.z);
      dummy.scale.set(b.width, b.height, b.depth);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Color: brighten if hovered
      if (b.nodeId === hoveredNodeId) {
        color.setHex(0xffffff);
        color.lerp(new THREE.Color(b.colorHex), 0.4); // bright highlight
      } else {
        color.setHex(b.colorHex);
      }
      mesh.setColorAt(i, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [buildings, hoveredNodeId]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) {
      onHover(buildings[e.instanceId]?.nodeId ?? null);
    }
  }, [buildings, onHover]);

  const handlePointerLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) {
      const nodeId = buildings[e.instanceId]?.nodeId;
      if (nodeId) onClick(nodeId);
    }
  }, [buildings, onClick]);

  if (buildings.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, buildings.length]}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      castShadow={false}
    />
  );
}
```

---

## Task 9: Create CityView root component

**Files:**
- Create: `src/components/CityView.tsx`

- [ ] **Step 1: Create file**

```tsx
// src/components/CityView.tsx
import { useState, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Layers, GitBranch } from '@/lib/lucide-icons';
import { buildCityLayout, type CityMetric, type CityBuilding } from '../lib/city-layout';
import { CityBuildings } from './city/CityBuildings';
import { CityDistricts } from './city/CityDistricts';
import { CityTooltip } from './city/CityTooltip';
import type { GraphNode, GraphRelationship } from 'gitnexus-shared';

interface Props {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  onNodeClick: (nodeId: string) => void;
}

export function CityView({ nodes, relationships, onNodeClick }: Props) {
  const [metric, setMetric] = useState<CityMetric>('degree');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const buildings = useMemo(
    () => buildCityLayout(nodes, relationships, metric),
    [nodes, relationships, metric],
  );

  const nodeMap = useMemo(
    () => new Map(nodes.map(n => [n.id, n])),
    [nodes],
  );

  const hoveredBuilding = useMemo(
    () => hoveredNodeId ? buildings.find(b => b.nodeId === hoveredNodeId) ?? null : null,
    [hoveredNodeId, buildings],
  );

  const hoveredNode = hoveredNodeId ? nodeMap.get(hoveredNodeId) : undefined;

  const getRawMetric = useCallback((nodeId: string): number => {
    if (metric === 'degree') {
      return relationships.filter(r => r.sourceId === nodeId || r.targetId === nodeId).length;
    }
    const node = nodeMap.get(nodeId);
    return (node?.properties.filePath ?? '').split('/').length - 1;
  }, [metric, relationships, nodeMap]);

  return (
    <div className="relative h-full w-full">
      {/* Three.js canvas */}
      <Canvas
        camera={{ position: [40, 40, 40], fov: 60, near: 0.1, far: 2000 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#0d0d1a' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[50, 80, 30]} intensity={1.2} />

        <CityDistricts buildings={buildings} />
        <CityBuildings
          buildings={buildings}
          onHover={setHoveredNodeId}
          onClick={onNodeClick}
          hoveredNodeId={hoveredNodeId}
        />

        {hoveredBuilding && hoveredNode && (
          <CityTooltip
            building={hoveredBuilding}
            nodeName={hoveredNode.properties.name}
            nodeLabel={hoveredNode.label}
            metricLabel={metric === 'degree' ? 'Conexiones' : 'Profundidad'}
            metricValue={getRawMetric(hoveredNode.id)}
          />
        )}

        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={5}
          maxDistance={500}
        />
      </Canvas>

      {/* Metric selector overlay */}
      <div className="absolute top-4 right-4 z-10 flex overflow-hidden rounded-lg border border-white/10 bg-gray-900/90 shadow-sm backdrop-blur-sm">
        <button
          onClick={() => setMetric('degree')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            metric === 'degree'
              ? 'bg-white/10 text-white'
              : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
          }`}
          title="Altura = número de conexiones del nodo"
        >
          <GitBranch className="h-3 w-3" />
          Conexiones
        </button>
        <div className="w-px bg-white/10" />
        <button
          onClick={() => setMetric('depth')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            metric === 'depth'
              ? 'bg-white/10 text-white'
              : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
          }`}
          title="Altura = profundidad en el árbol de directorios"
        >
          <Layers className="h-3 w-3" />
          Profundidad
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add GitBranch to lucide-icons if not present**

Open `src/lib/lucide-icons.tsx` and verify `GitBranch` is exported. If not, add it alongside `Building2`:

```tsx
export {
  // ... existing ...
  Building2,
  GitBranch,
} from 'lucide-react';
```

- [ ] **Step 3: Commit components**

```bash
git add src/components/CityView.tsx src/components/city/
git commit -m "feat: añadir componentes CityView, CityBuildings, CityDistricts, CityTooltip"
```

---

## Task 10: Wire up CityView in GraphCanvas + SidePanel

**Files:**
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Add Building2 import to GraphCanvas**

At the top of `GraphCanvas.tsx`, add `Building2` to the lucide-icons import:

```tsx
import {
  ZoomIn, ZoomOut, Maximize2, Focus, RotateCcw,
  Play, Pause, Lightbulb, LightbulbOff, Sparkles,
  Layers, Brain, Building2,
} from '@/lib/lucide-icons';
```

- [ ] **Step 2: Add CityView import**

```tsx
import { CityView } from './CityView';
```

- [ ] **Step 3: Add state for city activation (same pattern as semantic)**

After the `hasSemanticBeenActivated` state (around line 68), add:

```tsx
const [hasCityBeenActivated, setHasCityBeenActivated] = useState(false);
```

- [ ] **Step 4: Update sigma container visibility**

Find the sigma container div (around line 309):
```tsx
// Before
className={`sigma-container h-full w-full cursor-grab active:cursor-grabbing${graphViewType === 'semantic' ? ' invisible pointer-events-none' : ''}`}

// After
className={`sigma-container h-full w-full cursor-grab active:cursor-grabbing${graphViewType === 'semantic' || graphViewType === 'city' ? ' invisible pointer-events-none' : ''}`}
```

- [ ] **Step 5: Add city view mount after semantic view (around line 321)**

After the semantic view block (`</div>`), add:

```tsx
{/* Vista ciudad 3D — se monta al activarse y permanece */}
{hasCityBeenActivated && graph && (
  <div className={`absolute inset-0 z-10 overflow-hidden${graphViewType !== 'city' ? ' invisible pointer-events-none' : ''}`}>
    <CityView
      nodes={graph.nodes}
      relationships={graph.relationships}
      onNodeClick={(nodeId) => {
        setSelectedNode(nodeId);
        openCodePanel();
      }}
    />
  </div>
)}
```

- [ ] **Step 6: Add City button to the view type toggle (around line 298)**

After the Semantic button closing `</button>` and the wrapping `</div>`, insert the city button **inside** the same pill group:

```tsx
<div className="w-px bg-border-subtle" />
<button
  onClick={() => {
    setGraphViewType('city');
    setHasCityBeenActivated(true);
  }}
  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
    graphViewType === 'city'
      ? 'bg-elevated text-text-primary'
      : 'text-text-muted hover:bg-hover hover:text-text-secondary'
  }`}
  title="Vista ciudad 3D (deuda técnica)"
>
  <Building2 className="h-3 w-3" />
  City
</button>
```

- [ ] **Step 7: Update zoom controls to ignore city view**

Find lines ~350-370 where zoom buttons call `graphViewType === 'semantic' ? semanticRef...`:

```tsx
// Before (3 buttons)
onClick={() => graphViewType === 'semantic' ? semanticRef.current?.zoomIn() : zoomIn()}
onClick={() => graphViewType === 'semantic' ? semanticRef.current?.zoomOut() : zoomOut()}
onClick={() => graphViewType === 'semantic' ? semanticRef.current?.resetZoom() : resetZoom()}
```

```tsx
// After — city has its own controls, so just disable for city
onClick={() => graphViewType === 'semantic' ? semanticRef.current?.zoomIn() : graphViewType === 'structural' ? zoomIn() : undefined}
onClick={() => graphViewType === 'semantic' ? semanticRef.current?.zoomOut() : graphViewType === 'structural' ? zoomOut() : undefined}
onClick={() => graphViewType === 'semantic' ? semanticRef.current?.resetZoom() : graphViewType === 'structural' ? resetZoom() : undefined}
```

- [ ] **Step 8: Check `openCodePanel` is available**

In `GraphCanvas.tsx`, verify `openCodePanel` is destructured from `useAppState()`. If not already there, add it to the destructuring of `useAppState()`:

```tsx
const {
  // ...existing...
  openCodePanel,
  // ...
} = useAppState();
```

- [ ] **Step 9: Run the dev server and verify**

```bash
npm run dev
```

Open http://localhost:5173, load a graph, click the "City" button. Verify:
- 3D city renders
- Orbit/zoom/pan work
- Hover shows tooltip
- Click on building selects node + opens panel
- Metric selector switches between Conexiones/Profundidad
- Returning to Structural or Semantic views works correctly

- [ ] **Step 10: Commit**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "feat: integrar CityView en GraphCanvas con botón de vista y selección de nodo"
```

---

## Task 11: Final check and run all tests

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS including the new city-layout tests.

- [ ] **Step 2: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git status
# Only commit if there are uncommitted changes
git commit -m "feat: vista SoftwareCity completa — layout treemap 3D con Three.js"
```
