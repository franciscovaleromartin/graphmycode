import { describe, expect, it } from 'vitest';
import type { GraphNode } from 'gitnexus-shared';
import {
  detectLayer,
  groupNodesByLayer,
  computeLayerStats,
  type LayerName,
} from '@/lib/layerDetection';

function makeNode(id: string, filePath: string, label: GraphNode['label'] = 'Function'): GraphNode {
  return {
    id,
    label,
    properties: { name: id, filePath } as GraphNode['properties'],
  };
}

describe('detectLayer', () => {
  it('clasifica /api/ como api', () => {
    expect(detectLayer(makeNode('a', 'src/api/index.ts'))).toBe('api');
  });

  it('clasifica /routes/ como api', () => {
    expect(detectLayer(makeNode('a', 'src/routes/user.ts'))).toBe('api');
  });

  it('clasifica /services/ como service', () => {
    expect(detectLayer(makeNode('a', 'src/services/auth.ts'))).toBe('service');
  });

  it('clasifica /models/ como data', () => {
    expect(detectLayer(makeNode('a', 'src/models/User.ts'))).toBe('data');
  });

  it('clasifica /components/ como ui', () => {
    expect(detectLayer(makeNode('a', 'src/components/Button.tsx'))).toBe('ui');
  });

  it('clasifica /utils/ como utility', () => {
    expect(detectLayer(makeNode('a', 'src/utils/format.ts'))).toBe('utility');
  });

  it('clasifica /config/ como config', () => {
    expect(detectLayer(makeNode('a', 'src/config/env.ts'))).toBe('config');
  });

  it('clasifica /tests/ como test', () => {
    expect(detectLayer(makeNode('a', 'src/tests/auth.test.ts'))).toBe('test');
  });

  it('clasifica /__tests__/ como test', () => {
    expect(detectLayer(makeNode('a', 'src/__tests__/unit.ts'))).toBe('test');
  });

  it('nodo Route sin match de ruta cae en api por label', () => {
    expect(detectLayer(makeNode('a', 'src/misc/route.ts', 'Route'))).toBe('api');
  });

  it('nodo sin match de ruta ni label especial es unknown', () => {
    expect(detectLayer(makeNode('a', 'src/misc/foo.ts'))).toBe('unknown');
  });

  it('el primer match de ruta gana (orden de prioridad)', () => {
    expect(detectLayer(makeNode('a', 'src/api/utils/helper.ts'))).toBe('api');
  });
});

describe('groupNodesByLayer', () => {
  it('agrupa nodos correctamente en sus capas', () => {
    const nodes = [
      makeNode('a', 'src/api/index.ts'),
      makeNode('b', 'src/api/user.ts'),
      makeNode('c', 'src/models/User.ts'),
    ];
    const groups = groupNodesByLayer(nodes);
    expect(groups.get('api')).toHaveLength(2);
    expect(groups.get('data')).toHaveLength(1);
    expect(groups.get('ui')).toBeUndefined();
  });
});

describe('computeLayerStats', () => {
  it('calcula cross-layer deps correctamente', () => {
    const nodes = [
      makeNode('a', 'src/api/index.ts'),
      makeNode('b', 'src/models/User.ts'),
    ];
    const rels = [
      { id: 'r1', sourceId: 'a', targetId: 'b', type: 'IMPORTS' as const, confidence: 1, reason: '' },
    ];
    const stats = computeLayerStats(nodes, rels);
    const api = stats.find(s => s.layer === 'api')!;
    expect(api.crossLayerDeps).toBe(1);
    const data = stats.find(s => s.layer === 'data')!;
    expect(data.crossLayerDeps).toBe(0);
  });

  it('devuelve array vacío si no hay nodos', () => {
    expect(computeLayerStats([], [])).toEqual([]);
  });
});
