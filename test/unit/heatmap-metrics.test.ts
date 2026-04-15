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
