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
    const nodesWithExtra = [
      makeNode('hub', 'src/hub.ts'),
      makeNode('leaf', 'src/leaf.ts'),
      makeNode('a', 'src/a.ts'),
      makeNode('b', 'src/b.ts'),
    ];
    const rels: GraphRelationship[] = [
      makeRel('hub', 'leaf'),
      makeRel('a', 'hub'),
      makeRel('b', 'hub'),
    ];
    const result = buildCityLayout(nodesWithExtra, rels, 'degree');
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
