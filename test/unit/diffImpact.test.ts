import { describe, expect, it } from 'vitest';
import type { GraphRelationship } from 'gitnexus-shared';
import { computeImpact, enrichWithLayers } from '../../src/lib/diffImpact';

function makeRel(id: string, sourceId: string, targetId: string, type = 'IMPORTS'): GraphRelationship {
  return { id, sourceId, targetId, type: type as GraphRelationship['type'], confidence: 1, reason: '' };
}

describe('computeImpact', () => {
  it('los nodos seleccionados están en direct', () => {
    const result = computeImpact(new Set(['a']), []);
    expect(result.direct.has('a')).toBe(true);
    expect(result.hop1.size).toBe(0);
    expect(result.transitive.size).toBe(0);
  });

  it('un nodo que importa directamente al seleccionado está en hop1', () => {
    const rels = [makeRel('r1', 'b', 'a')];
    const result = computeImpact(new Set(['a']), rels);
    expect(result.hop1.has('b')).toBe(true);
    expect(result.transitive.has('b')).toBe(false);
  });

  it('un nodo a 2 hops está en transitive', () => {
    const rels = [makeRel('r1', 'b', 'a'), makeRel('r2', 'c', 'b')];
    const result = computeImpact(new Set(['a']), rels, 3);
    expect(result.hop1.has('b')).toBe(true);
    expect(result.transitive.has('c')).toBe(true);
  });

  it('respeta maxDepth — no propaga más allá del límite', () => {
    const rels = [makeRel('r1', 'b', 'a'), makeRel('r2', 'c', 'b')];
    const result = computeImpact(new Set(['a']), rels, 1);
    expect(result.hop1.has('b')).toBe(true);
    expect(result.transitive.has('c')).toBe(false);
  });

  it('propaga a través de CALLS y USES además de IMPORTS', () => {
    const rels = [makeRel('r1', 'b', 'a', 'CALLS')];
    const result = computeImpact(new Set(['a']), rels);
    expect(result.hop1.has('b')).toBe(true);
  });

  it('no incluye nodos seleccionados en hop1/transitive', () => {
    const rels = [makeRel('r1', 'a', 'a')];
    const result = computeImpact(new Set(['a']), rels);
    expect(result.hop1.has('a')).toBe(false);
  });

  it('byLayer empieza vacío (se rellena con enrichWithLayers)', () => {
    const result = computeImpact(new Set(['a']), []);
    expect(result.byLayer).toBeDefined();
    expect(result.byLayer.size).toBe(0);
  });
});

describe('enrichWithLayers', () => {
  it('rellena byLayer con el conteo de nodos impactados por capa', () => {
    const rels = [makeRel('r1', 'b', 'a'), makeRel('r2', 'c', 'a')];
    const result = computeImpact(new Set(['a']), rels);
    const nodeLayerMap = new Map([['b', 'api' as const], ['c', 'service' as const]]);
    const enriched = enrichWithLayers(result, nodeLayerMap);
    expect(enriched.byLayer.get('api')).toBe(1);
    expect(enriched.byLayer.get('service')).toBe(1);
  });

  it('ignora nodos sin capa en el mapa', () => {
    const rels = [makeRel('r1', 'b', 'a')];
    const result = computeImpact(new Set(['a']), rels);
    const nodeLayerMap = new Map<string, 'api'>(); // vacío
    const enriched = enrichWithLayers(result, nodeLayerMap);
    expect(enriched.byLayer.size).toBe(0);
  });
});
