import { describe, expect, it } from 'vitest';
import type { GraphRelationship } from 'gitnexus-shared';
import { findShortestPath } from '../../src/lib/pathFinder';

function makeRel(id: string, sourceId: string, targetId: string): GraphRelationship {
  return { id, sourceId, targetId, type: 'IMPORTS', confidence: 1, reason: '' };
}

describe('findShortestPath', () => {
  it('devuelve [from, to] para nodos conectados directamente', () => {
    const rels = [makeRel('r1', 'a', 'b')];
    expect(findShortestPath('a', 'b', rels)).toEqual(['a', 'b']);
  });

  it('devuelve null si no hay camino', () => {
    const rels = [makeRel('r1', 'a', 'b')];
    expect(findShortestPath('a', 'c', rels)).toBeNull();
  });

  it('devuelve el camino más corto entre nodos no directamente conectados', () => {
    const rels = [
      makeRel('r1', 'a', 'b'),
      makeRel('r2', 'b', 'c'),
    ];
    const path = findShortestPath('a', 'c', rels);
    expect(path).toEqual(['a', 'b', 'c']);
  });

  it('devuelve [from] si from === to', () => {
    expect(findShortestPath('a', 'a', [])).toEqual(['a']);
  });

  it('devuelve null en grafo sin aristas', () => {
    expect(findShortestPath('a', 'b', [])).toBeNull();
  });

  it('maneja ciclos sin bucle infinito', () => {
    const rels = [
      makeRel('r1', 'a', 'b'),
      makeRel('r2', 'b', 'a'),
    ];
    expect(findShortestPath('a', 'c', rels)).toBeNull();
  });

  it('funciona en grafos no dirigidos (puede ir en cualquier dirección)', () => {
    // La arista va de b→a, pero el camino a→b debe encontrarse igual
    const rels = [makeRel('r1', 'b', 'a')];
    expect(findShortestPath('a', 'b', rels)).toEqual(['a', 'b']);
  });
});
